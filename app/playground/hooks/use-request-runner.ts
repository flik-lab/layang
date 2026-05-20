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
  ApiCollectionRequest,
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

export type ActiveCollectionRequest = ApiCollectionRequest & { collectionName?: string };

export type RunRequestOverrides = {
  overrideMethod?: RpcMethodInfo;
  overrideRequestJson?: string;
  overrideMetadata?: MetadataPair[];
  overrideAssertionJson?: string;
  openNewTab?: boolean;
  overrideCollectionRequest?: ActiveCollectionRequest | null;
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
  activeCollectionRequest: ActiveCollectionRequest | null;
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
        activeCollectionRequest,
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
      const collectionRequest = overrides?.overrideCollectionRequest ?? activeCollectionRequest;
      const requestToRun = overrides?.overrideRequestJson ?? requestJson;
      const metadataToRun = overrides?.overrideMetadata ?? metadata;
      const assertionToRun = overrides?.overrideAssertionJson ?? assertionJson;

      if (collectionRequest && (!methodToRun || collectionRequest.kind !== "grpc")) {
        await runCollectionRequest({
          collectionRequest,
          requestToRun,
          metadataToRun,
          assertionToRun,
          requestSessions,
          activeSession,
          activeRequestId,
          activeRequestIdRef,
          activeEnvironmentKey,
          activeNativeTarget,
          targetDraft,
          responseTab,
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
          abortControllersRef,
          cancelledRunIdsRef,
        });
        return;
      }

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

type CollectionRunOptions = {
  collectionRequest: ActiveCollectionRequest;
  requestToRun: string;
  metadataToRun: MetadataPair[];
  assertionToRun: string;
  requestSessions: RequestSession[];
  activeSession: RequestSession | undefined;
  activeRequestId: string;
  activeRequestIdRef: MutableRefObject<string>;
  activeEnvironmentKey: EnvironmentKey;
  activeNativeTarget: string;
  targetDraft: string;
  responseTab: ResponseTab;
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
  abortControllersRef: MutableRefObject<Map<string, AbortController>>;
  cancelledRunIdsRef: MutableRefObject<Set<string>>;
};

async function runCollectionRequest(options: CollectionRunOptions) {
  const {
    collectionRequest,
    requestToRun,
    metadataToRun,
    assertionToRun,
    requestSessions,
    activeSession,
    activeRequestId,
    activeRequestIdRef,
    activeEnvironmentKey,
    activeNativeTarget,
    targetDraft,
    responseTab,
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
    abortControllersRef,
    cancelledRunIdsRef,
  } = options;

  const key = collectionRequest.id;
  const reusableSession =
    requestSessions.find((session) => session.methodKey === key) ??
    (activeSession?.methodKey === key ? activeSession : null);
  if (reusableSession?.running) {
    showToast(`${collectionRequest.name} is already running in ${reusableSession.title}.`, "warning");
    return;
  }

  const targetSessionId = reusableSession?.id ?? createId();
  const requestUrl =
    reusableSession?.id === activeRequestId
      ? targetDraft
      : reusableSession?.requestUrl || reusableSession?.baseUrl || collectionRequest.url;
  const transportMode = collectionRequest.kind === "websocket" ? "websocket" : "rest";
  const now = new Date().toISOString();
  const runSession: RequestSession = {
    id: targetSessionId,
    methodKey: key,
    title: collectionRequest.name,
    serviceName: collectionRequest.collectionName ?? "Collection",
    requestJson: requestToRun,
    metadata: metadataToRun.map((item) => ({ ...item })),
    transportMode,
    requestKind: collectionRequest.kind,
    requestUrl,
    httpMethod: collectionRequest.method ?? (collectionRequest.kind === "rest" ? "GET" : undefined),
    baseUrl: requestUrl,
    nativeTarget: activeNativeTarget,
    environmentKey: activeEnvironmentKey,
    assertionJson: assertionToRun,
    responseTab: reusableSession?.responseTab ?? (targetSessionId === activeRequestId ? responseTab : "messages"),
    events: [],
    lastResult: null,
    assertionResults: [],
    running: true,
    status: "running",
    openedAt: reusableSession?.openedAt ?? now,
    updatedAt: now,
  };

  setError("");
  upsertRequestSessionPreservingOrder(runSession);
  activateRequestSession(runSession);

  const abortController = new AbortController();
  abortControllersRef.current.set(targetSessionId, abortController);
  let finalStatus: RequestSession["status"] = "done";

  try {
    const result =
      collectionRequest.kind === "websocket"
        ? await invokeWebSocketRequest({
            url: requestUrl,
            body: requestToRun,
            metadata: metadataToRun,
            signal: abortController.signal,
            maxMessages: maxMessagesPerRequest,
            onEvent: (event) => appendLiveEventToSession(targetSessionId, event),
          })
        : await invokeRestRequest({
            url: requestUrl,
            collectionRequest,
            method: collectionRequest.method ?? "GET",
            body: requestToRun,
            metadata: metadataToRun,
            signal: abortController.signal,
            onEvent: (event) => appendLiveEventToSession(targetSessionId, event),
          });

    finalStatus = result.trailers["grpc-status"] === "0" ? "done" : "error";
    if (finalStatus === "error") {
      showToast(result.trailers["grpc-message"] || `${collectionRequest.kind} request failed`, "error");
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
      requestJson: requestToRun,
      metadata: metadataToRun.map((item) => ({ ...item })),
      requestUrl,
      baseUrl: requestUrl,
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
          method: `${collectionRequest.collectionName ?? "Collection"}/${collectionRequest.name}`,
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
      showToast(message, "error");
      appendLiveEventToSession(targetSessionId, { type: "error", message: "Request failed", details: { message } });
    }
  } finally {
    abortControllersRef.current.delete(targetSessionId);
    const wasCancelled = cancelledRunIdsRef.current.delete(targetSessionId);
    updateRequestSession(targetSessionId, { running: false, status: wasCancelled ? "cancelled" : finalStatus });
  }
}

async function invokeRestRequest(options: {
  url: string;
  collectionRequest: ActiveCollectionRequest;
  method: string;
  body: string;
  metadata: MetadataPair[];
  signal: AbortSignal;
  onEvent: (event: GrpcEvent) => void;
}): Promise<GrpcResult> {
  const startedAt = new Date();
  const method = options.method.toUpperCase();
  const headers = metadataPairsToHeaders(options.metadata);
  const requestUrl = buildRestFetchUrl({ ...options.collectionRequest, url: options.url }, options.url);
  applyRestAuth(options.collectionRequest, headers, requestUrl);
  const bodyType = options.collectionRequest.restBodyType ?? "json";
  const hasBody = bodyType !== "none" && method !== "GET" && method !== "HEAD" && options.body.trim().length > 0;
  if (hasBody && !hasHeader(headers, "content-type")) {
    headers["content-type"] =
      bodyType === "form-url-encoded" ? "application/x-www-form-urlencoded" : "application/json";
  }
  options.onEvent({ type: "log", level: "info", message: `HTTP ${method}`, details: { url: requestUrl.toString() } });
  const response = await fetch(requestUrl.toString(), {
    method,
    headers,
    body: hasBody ? options.body : undefined,
    signal: options.signal,
  });
  const text = await response.text();
  const value = parsePossiblyJson(text);
  const completedAt = new Date();
  const responseHeaders = Object.fromEntries(response.headers.entries());
  options.onEvent({
    type: "headers",
    httpStatus: response.status,
    headers: responseHeaders,
    contentType: response.headers.get("content-type") ?? "",
  });
  options.onEvent({ type: "message", index: 0, value });
  const trailers = {
    "grpc-status": response.ok ? "0" : "2",
    "grpc-message": response.ok ? "HTTP request completed" : response.statusText || `HTTP ${response.status}`,
    "http-status": String(response.status),
  };
  options.onEvent({ type: "trailers", trailers });
  return {
    httpStatus: response.status,
    headers: responseHeaders,
    trailers,
    messages: [value],
    durationMs: completedAt.getTime() - startedAt.getTime(),
    requestUrl: requestUrl.toString(),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    transport: "rest",
  };
}

async function invokeWebSocketRequest(options: {
  url: string;
  body: string;
  metadata: MetadataPair[];
  signal: AbortSignal;
  maxMessages: number;
  onEvent: (event: GrpcEvent) => void;
}): Promise<GrpcResult> {
  const startedAt = new Date();
  const messages: unknown[] = [];
  options.onEvent({ type: "log", level: "info", message: "Opening WebSocket", details: { url: options.url } });

  return new Promise((resolve, reject) => {
    let settled = false;
    let socket: WebSocket | null = null;
    const finish = (code: number, reason: string, ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal.removeEventListener("abort", abort);
      const completedAt = new Date();
      const trailers = {
        "grpc-status": ok ? "0" : "2",
        "grpc-message": reason || (ok ? "WebSocket completed" : "WebSocket closed"),
        "websocket-code": String(code),
      };
      options.onEvent({ type: "trailers", trailers });
      resolve({
        httpStatus: 101,
        headers: { upgrade: "websocket" },
        trailers,
        messages,
        totalMessages: messages.length,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        requestUrl: options.url,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        transport: "websocket",
      });
    };
    const abort = () => {
      try {
        socket?.close(1000, "Cancelled");
      } catch {
        // Ignore close errors.
      }
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      try {
        socket?.close(1000, "Preview timeout");
      } catch {
        // Ignore close errors.
      }
      finish(
        1000,
        messages.length ? "Preview timeout after receiving messages" : "Preview timeout",
        messages.length > 0,
      );
    }, 15000);

    try {
      const protocols = webSocketProtocolsFromMetadata(options.metadata);
      socket = protocols.length ? new WebSocket(options.url, protocols) : new WebSocket(options.url);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
      return;
    }

    options.signal.addEventListener("abort", abort);
    socket.onopen = () => {
      options.onEvent({ type: "headers", httpStatus: 101, headers: { upgrade: "websocket" }, contentType: "" });
      const body = options.body.trim();
      if (body) {
        socket?.send(body);
        options.onEvent({ type: "log", level: "info", message: "WebSocket message sent", details: body });
      }
    };
    socket.onmessage = (event) => {
      const value = parsePossiblyJson(String(event.data));
      messages.push(value);
      options.onEvent({ type: "message", index: messages.length - 1, value });
      if (messages.length >= options.maxMessages) {
        try {
          socket?.close(1000, "Message limit reached");
        } catch {
          // Ignore close errors.
        }
        finish(1000, "Message limit reached", true);
      }
    };
    socket.onerror = () => {
      if (settled) return;
      clearTimeout(timeout);
      reject(new Error("WebSocket connection failed."));
    };
    socket.onclose = (event) => finish(event.code, event.reason, event.wasClean || messages.length > 0);
  });
}

function buildRestFetchUrl(request: ActiveCollectionRequest, fallbackUrl: string): URL {
  let url = (request.url || fallbackUrl || "http://127.0.0.1:3000").trim();
  for (const param of request.restPathParams ?? []) {
    const key = param.key.trim();
    if (!key) continue;
    const encoded = encodeURIComponent(param.value);
    url = url.replaceAll(`:${key}`, encoded).replaceAll(`{${key}}`, encoded);
  }
  const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  for (const param of request.restParams ?? []) {
    const key = param.key.trim();
    if (key) parsed.searchParams.set(key, param.value);
  }
  return parsed;
}

function applyRestAuth(request: ActiveCollectionRequest, headers: Record<string, string>, url: URL) {
  const auth = request.restAuth;
  if (!auth || auth.type === "none") return;
  if (auth.type === "bearer" && auth.token.trim()) {
    headers.authorization = `Bearer ${auth.token.trim()}`;
    return;
  }
  if (auth.type === "basic") {
    const token = btoa(`${auth.username}:${auth.password}`);
    headers.authorization = `Basic ${token}`;
    return;
  }
  if (auth.type === "api-key" && auth.key.trim()) {
    if (auth.in === "query") url.searchParams.set(auth.key.trim(), auth.value);
    else headers[auth.key.trim()] = auth.value;
  }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lowerName = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lowerName);
}

function webSocketProtocolsFromMetadata(metadata: MetadataPair[]): string[] {
  const protocolHeader = metadata.find((item) => item.key.trim().toLowerCase() === "sec-websocket-protocol");
  if (!protocolHeader) return [];
  return protocolHeader.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function metadataPairsToHeaders(metadata: MetadataPair[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const item of metadata) {
    const key = item.key.trim();
    if (key) headers[key] = item.value;
  }
  return headers;
}

function parsePossiblyJson(text: string): unknown {
  if (!text) return "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
