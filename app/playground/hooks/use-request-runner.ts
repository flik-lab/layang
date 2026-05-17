import { useCallback, useRef } from "react";
import type { MutableRefObject } from "react";
import { invokeGrpcWebText } from "@/lib/grpc-web-client";
import { invokeNativeGrpc } from "@/lib/native-grpc-client";
import type { GrpcEvent, GrpcResult, LoadedProto, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import { getEnvironmentTarget as featureGetEnvironmentTarget } from "../features/environments/environment-model";
import { createRequestSession } from "../features/request-runner/request-session-model";
import {
  decodeGrpcMessageForUi,
  evaluateAssertions,
  resultToUiEvents,
} from "../features/request-runner/request-result-utils";
import {
  compactGrpcResultForClient,
  compactUiEvent,
  getResultMessageCount,
} from "../features/workspace/workspace-model";
import { createId } from "../shared/entity-utils";
import { toErrorMessage } from "../shared/error-utils";
import { formatTimestampShort } from "../shared/formatters";
import { methodKey } from "../shared/rpc-method-utils";
import { defaultUnaryDeadlineMs, maxMessagesPerRequest } from "../shared/workbench-constants";
import type {
  AssertionResult,
  EnvironmentConfig,
  EnvironmentKey,
  HistoryItem,
  RequestSession,
  ResponseTab,
  TransportMode,
  UiEvent,
} from "../shared/workbench-types";

type ToastSeverity = "info" | "success" | "warning" | "error";

export type RunRequestOverrides = {
  overrideMethod?: RpcMethodInfo;
  overrideRequestJson?: string;
  overrideMetadata?: MetadataPair[];
  overrideAssertionJson?: string;
  openNewTab?: boolean;
};

export type UseRequestRunnerOptions = {
  loaded: LoadedProto | null;
  selectedMethod: RpcMethodInfo | null;
  requestJson: string;
  metadata: MetadataPair[];
  assertionJson: string;
  protoFiles: ProtoSourceFile[];
  requestSessions: RequestSession[];
  activeSession: RequestSession | undefined;
  activeRequestId: string;
  activeRequestIdRef: MutableRefObject<string>;
  activeTransportMode: TransportMode;
  activeEnvironmentKey: EnvironmentKey;
  activeBaseUrl: string;
  activeNativeTarget: string;
  targetDraft: string;
  responseTab: ResponseTab;
  environments: EnvironmentConfig[];
  setError: (value: string) => void;
  setEvents: (value: UiEvent[]) => void;
  setLastResult: (value: GrpcResult | null) => void;
  setAssertionResults: (value: AssertionResult[]) => void;
  setHistory: (updater: (current: HistoryItem[]) => HistoryItem[]) => void;
  showToast: (message: string, severity?: ToastSeverity) => void;
  appendLiveEventToSession: (sessionId: string, event: GrpcEvent) => void;
  upsertRequestSessionPreservingOrder: (session: RequestSession) => void;
  activateRequestSession: (session: RequestSession) => void;
  updateRequestSession: (sessionId: string, patch: Partial<RequestSession>) => void;
};

export function useRequestRunner(options: UseRequestRunnerOptions) {
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const cancelledRunIdsRef = useRef<Set<string>>(new Set());

  const runRequest = useCallback(
    async (overrides?: RunRequestOverrides) => {
      const {
        loaded,
        selectedMethod,
        requestJson,
        metadata,
        assertionJson,
        protoFiles,
        requestSessions,
        activeSession,
        activeRequestId,
        activeRequestIdRef,
        activeTransportMode,
        activeEnvironmentKey,
        activeBaseUrl,
        activeNativeTarget,
        targetDraft,
        responseTab,
        environments,
        setError,
        setEvents,
        setLastResult,
        setAssertionResults,
        setHistory,
        showToast,
        appendLiveEventToSession,
        upsertRequestSessionPreservingOrder,
        activateRequestSession,
        updateRequestSession,
      } = options;

      const methodToRun = overrides?.overrideMethod ?? selectedMethod;
      const requestToRun = overrides?.overrideRequestJson ?? requestJson;
      const metadataToRun = overrides?.overrideMetadata ?? metadata;
      const assertionToRun = overrides?.overrideAssertionJson ?? assertionJson;
      if (!loaded || !methodToRun) return;

      const key = methodKey(methodToRun);
      const reusableSession =
        requestSessions.find((session) => session.methodKey === key) ??
        (activeSession?.methodKey === key ? activeSession : null);
      if (reusableSession?.running) {
        showToast(`${methodToRun.methodName} is already running in ${reusableSession.title}.`, "warning");
        return;
      }

      const runSession =
        reusableSession ??
        createRequestSession(loaded.root, methodToRun, {
          requestJson: requestToRun,
          metadata: metadataToRun,
          transportMode: activeTransportMode,
          baseUrl: activeBaseUrl,
          nativeTarget: activeNativeTarget,
          assertionJson: assertionToRun,
        });
      const targetSessionId = runSession.id;
      const targetTransportMode = reusableSession?.transportMode ?? activeTransportMode;
      const targetEnvironmentKey = reusableSession?.environmentKey ?? activeEnvironmentKey;
      const activeDraftBaseUrl = activeTransportMode === "grpc-web" ? targetDraft : activeBaseUrl;
      const activeDraftNativeTarget = activeTransportMode === "native-grpc" ? targetDraft : activeNativeTarget;
      const reusableBaseUrl = reusableSession?.id === activeRequestId ? activeDraftBaseUrl : reusableSession?.baseUrl;
      const reusableNativeTarget =
        reusableSession?.id === activeRequestId ? activeDraftNativeTarget : reusableSession?.nativeTarget;
      const targetBaseUrl = featureGetEnvironmentTarget(
        environments,
        targetEnvironmentKey,
        "grpc-web",
        reusableBaseUrl ?? activeDraftBaseUrl,
        reusableNativeTarget ?? activeDraftNativeTarget,
      );
      const targetNativeTarget = featureGetEnvironmentTarget(
        environments,
        targetEnvironmentKey,
        "native-grpc",
        reusableBaseUrl ?? activeDraftBaseUrl,
        reusableNativeTarget ?? activeDraftNativeTarget,
      );

      const startedSession: RequestSession = {
        ...runSession,
        requestJson: requestToRun,
        metadata: metadataToRun.map((item) => ({ ...item })),
        transportMode: targetTransportMode,
        baseUrl: targetBaseUrl,
        nativeTarget: targetNativeTarget,
        assertionJson: assertionToRun,
        environmentKey: targetEnvironmentKey,
        events: [],
        lastResult: null,
        assertionResults: [],
        responseTab: reusableSession?.responseTab ?? (runSession.id === activeRequestId ? responseTab : "messages"),
        running: true,
        status: "running",
        updatedAt: new Date().toISOString(),
      };

      setError("");
      upsertRequestSessionPreservingOrder(startedSession);
      activateRequestSession(startedSession);

      const abortController = new AbortController();
      abortControllersRef.current.set(targetSessionId, abortController);

      let finalStatus: RequestSession["status"] = "done";

      try {
        const parsedJson = JSON.parse(requestToRun);
        let result: GrpcResult;

        if (targetTransportMode === "native-grpc") {
          result = await invokeNativeGrpc({
            runId: targetSessionId,
            targetUrl: targetNativeTarget,
            protoFiles,
            method: methodToRun,
            requestJson: parsedJson,
            metadata: metadataToRun,
            deadlineMs: methodToRun.responseStream ? 0 : defaultUnaryDeadlineMs,
            maxMessages: maxMessagesPerRequest,
            onEvent: (event: GrpcEvent) => appendLiveEventToSession(targetSessionId, event),
          });
        } else {
          result = await invokeGrpcWebText({
            baseUrl: targetBaseUrl,
            root: loaded.root,
            method: methodToRun,
            requestJson: parsedJson,
            metadata: metadataToRun,
            signal: abortController.signal,
            maxMessages: maxMessagesPerRequest,
            onEvent: (event: GrpcEvent) => appendLiveEventToSession(targetSessionId, event),
          });
        }

        finalStatus = result.trailers["grpc-status"] === "0" ? "done" : "error";
        if (finalStatus === "error") {
          const status = result.trailers["grpc-status"] ?? String(result.httpStatus ?? "unknown");
          const grpcMessage = decodeGrpcMessageForUi(result.trailers["grpc-message"] ?? "");
          showToast(`gRPC error ${status}${grpcMessage ? `: ${grpcMessage}` : ""}`, "error");
        }
        const clientSafeResult = compactGrpcResultForClient(result);
        const resultEvents = resultToUiEvents(clientSafeResult).map(compactUiEvent);
        const evaluatedAssertions = evaluateAssertions(clientSafeResult, assertionToRun);
        if (activeRequestIdRef.current === targetSessionId) {
          setEvents(resultEvents);
          setLastResult(clientSafeResult);
          setAssertionResults(evaluatedAssertions);
        }
        updateRequestSession(targetSessionId, {
          events: resultEvents,
          lastResult: clientSafeResult,
          assertionResults: evaluatedAssertions,
          status: finalStatus,
        });
        const completedAt = new Date();
        setHistory((current) =>
          [
            {
              id: createId(),
              method: `${methodToRun.serviceName}/${methodToRun.methodName}`,
              status: result.trailers["grpc-status"] ?? String(result.httpStatus),
              durationMs: result.durationMs,
              messageCount: getResultMessageCount(clientSafeResult),
              time: formatTimestampShort(completedAt.toISOString()),
              timestamp: completedAt.toISOString(),
            },
            ...current,
          ].slice(0, 80),
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          finalStatus = "cancelled";
          appendLiveEventToSession(targetSessionId, {
            type: "trailers",
            trailers: { "grpc-status": "1", "grpc-message": "Cancelled by user" },
          });
        } else {
          finalStatus = "error";
          const message = toErrorMessage(err);
          if (activeRequestIdRef.current === targetSessionId) setError(message);
          showToast(
            message.toLowerCase().includes("failed to fetch")
              ? `Failed to fetch: check proxy/CORS/URL. ${message}`
              : message,
            "error",
          );
          appendLiveEventToSession(targetSessionId, { type: "error", message: "Request failed", details: { message } });
        }
      } finally {
        abortControllersRef.current.delete(targetSessionId);
        const wasCancelled = cancelledRunIdsRef.current.delete(targetSessionId);
        updateRequestSession(targetSessionId, { running: false, status: wasCancelled ? "cancelled" : finalStatus });
      }
    },
    [options],
  );

  const cancelRequest = useCallback(
    (sessionId = options.activeRequestId) => {
      if (!sessionId) return;
      cancelledRunIdsRef.current.add(sessionId);
      abortControllersRef.current.get(sessionId)?.abort();
      window.electronGrpc?.cancelActive?.(sessionId)?.catch(() => undefined);
      options.updateRequestSession(sessionId, { running: false, status: "cancelled" });
    },
    [options],
  );

  return { runRequest, cancelRequest };
}
