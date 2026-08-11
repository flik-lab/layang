"use client";

import { useEffect, useMemo } from "react";
import { listMessageFields } from "@/lib/example-generator";
import { buildGrpcWebUrl } from "@/lib/grpc-web-client";
import { methodLabel } from "@/lib/proto-loader";
import type { GrpcResult, LoadedProto, MetadataPair, RpcMethodInfo } from "@/lib/types";
import { buildRestRequestUrl } from "../rest/rest-model";
import { safeJsonParse } from "../../shared/json-utils";
import type {
  ApiCollectionRequest,
  RequestSession,
  RequestTab,
  SavedExample,
  UiEvent,
} from "../../shared/workbench-types";

type CollectionNamedRequest = ApiCollectionRequest & { collectionName?: string };

type WorkbenchViewDerivedScope = {
  activeCollectionRequest: CollectionNamedRequest | null;
  activeIsRest: boolean;
  activeIsWebSocket: boolean;
  activeTransportMode: string;
  currentExamples: SavedExample[];
  draftEffectiveBaseUrl: string;
  draftEffectiveNativeTarget: string;
  events: UiEvent[];
  hydrated: boolean;
  isNativeTransport: boolean;
  lastResult: GrpcResult | null;
  loaded: LoadedProto | null;
  metadata: MetadataPair[];
  requestJson: string;
  requestSessions: RequestSession[];
  requestTab: RequestTab;
  selectedMethod: RpcMethodInfo | null;
  setRequestTab: (value: RequestTab) => void;
  targetDraft: string;
};

export function useWorkbenchViewDerived(scope: WorkbenchViewDerivedScope) {
  const {
    activeCollectionRequest,
    activeIsRest,
    activeIsWebSocket,
    activeTransportMode,
    currentExamples,
    draftEffectiveBaseUrl,
    draftEffectiveNativeTarget,
    events,
    hydrated,
    isNativeTransport,
    lastResult,
    loaded,
    metadata,
    requestJson,
    requestSessions,
    requestTab,
    selectedMethod,
    setRequestTab,
    targetDraft,
  } = scope;

  const requestFields = useMemo(() => {
    if (!loaded || !selectedMethod) return [];
    try {
      return listMessageFields(loaded.root, selectedMethod.requestType);
    } catch {
      return [];
    }
  }, [loaded, selectedMethod]);

  const responseFields = useMemo(() => {
    if (!loaded || !selectedMethod) return [];
    try {
      return listMessageFields(loaded.root, selectedMethod.responseType);
    } catch {
      return [];
    }
  }, [loaded, selectedMethod]);

  const previewUrl =
    activeIsRest && activeCollectionRequest
      ? buildRestRequestUrl(
          { ...activeCollectionRequest, url: targetDraft || activeCollectionRequest.url },
          draftEffectiveBaseUrl,
        )
      : selectedMethod
        ? activeTransportMode === "native-grpc"
          ? `${draftEffectiveNativeTarget.replace(/\/+$/, "")}/${selectedMethod.serviceName}/${selectedMethod.methodName}`
          : buildGrpcWebUrl(draftEffectiveBaseUrl, selectedMethod.serviceName, selectedMethod.methodName)
        : isNativeTransport
          ? draftEffectiveNativeTarget
          : draftEffectiveBaseUrl;

  const messageEvents = events.filter((event) => event.kind === "message");
  const latestResponsePayload = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.kind === "message") return event.fullPayload ?? event.payload;
    }

    const resultMessages = lastResult?.messages ?? [];
    if (resultMessages.length > 0) return resultMessages[resultMessages.length - 1];

    return undefined;
  }, [events, lastResult]);
  const reportPayload = useMemo(
    () => ({
      exportedAt: hydrated ? new Date().toISOString() : "",
      transportMode: activeTransportMode,
      target: isNativeTransport ? draftEffectiveNativeTarget : draftEffectiveBaseUrl,
      method: selectedMethod ? methodLabel(selectedMethod) : (activeCollectionRequest?.name ?? null),
      request: safeJsonParse(requestJson),
      metadata: metadata.filter((item) => item.key.trim()),
      result: lastResult,
      events,
    }),
    [
      hydrated,
      activeTransportMode,
      draftEffectiveBaseUrl,
      draftEffectiveNativeTarget,
      selectedMethod,
      activeCollectionRequest,
      isNativeTransport,
      requestJson,
      metadata,
      lastResult,
      events,
    ],
  );
  const requestTabItems = useMemo<Array<{ value: RequestTab; label: string }>>(
    () =>
      activeIsWebSocket
        ? [
            { value: "body", label: "Messages" },
            { value: "auth", label: "Auth" },
            { value: "metadata", label: "Headers" },
            { value: "examples", label: currentExamples.length ? `Examples ${currentExamples.length}` : "Examples" },
            { value: "docs", label: "Docs" },
            { value: "mock", label: "Mock" },
            { value: "more", label: "More" },
          ]
        : activeIsRest
          ? [
              { value: "schema", label: "Params" },
              { value: "auth", label: "Auth" },
              { value: "metadata", label: "Headers" },
              { value: "body", label: "Body" },
              { value: "examples", label: currentExamples.length ? `Examples ${currentExamples.length}` : "Examples" },
              { value: "docs", label: "Docs" },
              { value: "mock", label: "Mock" },
              { value: "more", label: "More" },
            ]
          : [
              { value: "body", label: "Message" },
              { value: "auth", label: "Auth" },
              { value: "metadata", label: "Metadata" },
              { value: "examples", label: currentExamples.length ? `Examples ${currentExamples.length}` : "Examples" },
              { value: "docs", label: "Docs" },
              { value: "mock", label: "Mock" },
              { value: "more", label: "More" },
            ],
    [activeIsWebSocket, activeIsRest, currentExamples.length],
  );

  useEffect(() => {
    const hiddenAdvancedTabs: RequestTab[] = activeIsRest ? ["benchmark"] : ["benchmark", "schema"];
    if (
      !requestTabItems.some((item: { value: string }) => item.value === requestTab) &&
      !hiddenAdvancedTabs.includes(requestTab)
    ) {
      setRequestTab(activeIsRest ? "schema" : "body");
    }
  }, [activeIsRest, requestTab, requestTabItems, setRequestTab]);

  const hasActiveWorkbenchRequest = Boolean(selectedMethod || activeCollectionRequest);
  const showEmptyWorkbench = hydrated && requestSessions.length === 0 && !hasActiveWorkbenchRequest;

  return {
    latestResponsePayload,
    messageEvents,
    previewUrl,
    reportPayload,
    requestFields,
    requestTabItems,
    responseFields,
    showEmptyWorkbench,
  };
}
