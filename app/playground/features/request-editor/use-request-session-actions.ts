"use client";

import { useRef } from "react";
import type * as protobuf from "protobufjs";
import type { MetadataPair, RpcMethodInfo } from "@/lib/types";
import { createRequestSession } from "../request-runner/request-session-model";
import { reorderRequestSessionList, upsertRequestSessionPreservingOrderList } from "./request-session-domain";
import { compactRequestSessionForStorage, normalizeVisibleResponseTab, runWhenIdle } from "../workspace/workspace-model";
import { enqueueWorkspaceAutosave } from "../workspace/workspace-autosave";
import { extractRequestBodyFromMockScenario, generateRandomExampleFromType } from "../mock-server/mock-scenario-model";
import { defaultMetadata, projectStorageKey } from "../../shared/workbench-constants";
import { responseSessionRegistry } from "../response-viewer/model/responseSessionRegistry";
import { toErrorMessage } from "../../shared/error-utils";
import { methodKey } from "../../shared/rpc-method-utils";
import { createPinnedGrpcBinding, findProtoVersion, grpcBindingIdentity } from "../proto-library/proto-library-domain";
import type { GrpcRequestBinding } from "../proto-library/proto-library-types";
import type {
  ApiCollection,
  ApiCollectionRequest,
  HistoryItem,
  ProjectData,
  RequestSession,
  RestAuthConfig,
  RestBodyType,
  TransportMode,
} from "../../shared/workbench-types";

export function useRequestSessionActions(scope: any) {
  const {
    activeBaseUrl,
    activeCollectionRequest,
    activeCollectionRequestId,
    activeEnvironmentKey,
    activeNativeTarget,
    activeRequestId,
    activeRequestIdRef,
    activeRunning,
    activeTransportMode,
    assertionJson,
    baseUrl,
    closeManualWebSocketClient,
    collections,
    currentMockActiveScenario,
    currentMockScenarios,
    environmentKey,
    findCollectionRequestById,
    getProjectSnapshot,
    getWorkspaceExportBundle,
    grpcBaseUrlFallback,
    loaded,
    metadata,
    nativeTarget,
    protoRuntimeRegistry,
    protoLibraries,
    activeProtoLibraryId,
    activeProtoVersionId,
    requestJson,
    requestRunner,
    requestSessions,
    selectedMethod,
    selectedMethodKey,
    setActiveCollectionRequestId,
    setActiveProtoLibraryId,
    setActiveProtoVersionId,
    setActiveRequestId,
    setAssertionJson,
    setAssertionResults,
    setBaseUrl,
    setCollections,
    setEnvironmentKey,
    setEvents,
    setLastResult,
    setLoaded,
    setMetadata,
    setNativeTarget,
    setRequestJson,
    setRequestSessions,
    setResponseTab,
    setSelectedMethodKey,
    setTransportMode,
    showToast,
    transportMode,
    workspaceAutosaveRef,
    workspaceFolderPath,
    wsClientRef,
  } = scope;

  const pendingRequestTabPersistenceRef = useRef<{
    nextSessions: RequestSession[];
    nextActiveRequestId: string;
  } | null>(null);
  const requestTabPersistenceScheduledRef = useRef(false);
  const requestTabPersistenceContextRef = useRef({ getProjectSnapshot, selectedMethodKey, requestJson });
  requestTabPersistenceContextRef.current = { getProjectSnapshot, selectedMethodKey, requestJson };
  const pendingSessionSnapshotRef = useRef(new Map<string, Partial<RequestSession>>());
  const sessionSnapshotFlushScheduledRef = useRef(false);

  function stageRequestSessionSnapshot(sessionId: string, patch: Partial<RequestSession>) {
    if (!sessionId) return;
    const current = pendingSessionSnapshotRef.current.get(sessionId) ?? {};
    pendingSessionSnapshotRef.current.set(sessionId, { ...current, ...patch });
    if (sessionSnapshotFlushScheduledRef.current) return;
    sessionSnapshotFlushScheduledRef.current = true;
    runWhenIdle(() => {
      sessionSnapshotFlushScheduledRef.current = false;
      const pending = new Map(pendingSessionSnapshotRef.current);
      pendingSessionSnapshotRef.current.clear();
      if (pending.size === 0) return;
      const updatedAt = new Date().toISOString();
      setRequestSessions((sessions: RequestSession[]) =>
        sessions.map((session) => {
          const staged = pending.get(session.id);
          return staged ? { ...session, ...staged, updatedAt } : session;
        }),
      );
    });
  }

  function effectiveRequestSession(session: RequestSession): RequestSession {
    const staged = pendingSessionSnapshotRef.current.get(session.id);
    return staged ? { ...session, ...staged } : session;
  }

  function syncProtoContext(binding?: GrpcRequestBinding) {
    if (!binding) return;
    const compiled = protoRuntimeRegistry?.resolveVersion(binding.libraryId, binding.versionId);
    if (!compiled) return;
    if (activeProtoLibraryId !== compiled.library.id) setActiveProtoLibraryId(compiled.library.id);
    if (activeProtoVersionId !== compiled.version.id) setActiveProtoVersionId(compiled.version.id);
    if (loaded !== compiled.loaded && typeof setLoaded === "function") setLoaded(compiled.loaded);
  }

  const getRequestRunner = () => requestRunner?.current ?? requestRunner;

  function selectMethod(root: protobuf.Root, method: RpcMethodInfo, grpcOverride?: GrpcRequestBinding) {
    setActiveCollectionRequestId("");
    const key = methodKey(method);
    const activeProto = findProtoVersion(protoLibraries, activeProtoLibraryId, activeProtoVersionId);
    const grpc =
      grpcOverride ?? (activeProto ? createPinnedGrpcBinding(activeProto.library, activeProto.version, method) : undefined);
    const identity = grpcBindingIdentity(grpc, key);
    const existing = requestSessions.find(
      (session: RequestSession) => grpcBindingIdentity(session.grpc, session.methodKey) === identity,
    );
    if (existing) {
      activateRequestSession(existing);
      return;
    }

    const grpcTransportMode: TransportMode = activeTransportMode === "native-grpc" ? "native-grpc" : "grpc-web";
    const session: RequestSession = {
      ...createRequestSession(root, method, {
        metadata,
        transportMode: grpcTransportMode,
        baseUrl: grpcBaseUrlFallback(activeBaseUrl, baseUrl),
        nativeTarget: activeNativeTarget,
        environmentKey: activeEnvironmentKey,
        assertionJson,
      }),
      grpc,
    };
    setRequestSessions((current: RequestSession[]) =>
      [session, ...current.filter((item) => grpcBindingIdentity(item.grpc, item.methodKey) !== identity)].slice(0, 16),
    );
    activateRequestSession(session);
  }

  function activateRequestSession(session: RequestSession) {
    const nextSession = effectiveRequestSession(session);
    if (activeRequestIdRef.current && activeRequestIdRef.current !== nextSession.id) {
      stageRequestSessionSnapshot(activeRequestIdRef.current, {
        requestJson,
        metadata,
        transportMode: activeTransportMode,
        baseUrl: activeBaseUrl,
        nativeTarget: activeNativeTarget,
        environmentKey: activeEnvironmentKey,
        assertionJson,
        responseTab: scope.responseTab,
      });
    }

    activeRequestIdRef.current = nextSession.id;
    setActiveRequestId(nextSession.id);
    syncProtoContext(nextSession.grpc);

    if (nextSession.requestKind === "grpc") {
      const sourceRequestId = nextSession.sourceRequestId ?? nextSession.methodKey;
      const collectionGrpcRequest = findCollectionRequestById(collections, sourceRequestId);
      const binding = nextSession.grpc ?? collectionGrpcRequest?.grpc;
      const grpcMethodKey = binding?.methodFullName ?? collectionGrpcRequest?.grpcMethodKey ?? "";
      setActiveCollectionRequestId(sourceRequestId);
      setSelectedMethodKey(grpcMethodKey);
      if (!nextSession.grpc && binding) syncProtoContext(binding);
    } else if (nextSession.requestKind) {
      setActiveCollectionRequestId(nextSession.methodKey);
      setSelectedMethodKey("");
    } else {
      setActiveCollectionRequestId("");
      setSelectedMethodKey(nextSession.grpc?.methodFullName ?? nextSession.methodKey);
    }
    setRequestJson(nextSession.requestJson);
    setMetadata(nextSession.metadata.length ? nextSession.metadata : defaultMetadata);
    const nextTransportMode: TransportMode =
      nextSession.requestKind === "websocket"
        ? "websocket"
        : nextSession.requestKind === "rest"
          ? "rest"
          : nextSession.transportMode === "websocket" || nextSession.transportMode === "rest"
            ? "grpc-web"
            : (nextSession.transportMode ?? transportMode);
    setTransportMode(nextTransportMode);
    if (nextSession.requestKind === "rest")
      setBaseUrl(nextSession.baseUrl || nextSession.requestUrl || "http://127.0.0.1:3000");
    else if (nextSession.requestKind !== "websocket") setBaseUrl(grpcBaseUrlFallback(nextSession.baseUrl, baseUrl));
    setNativeTarget(nextSession.nativeTarget ?? nativeTarget);
    setEnvironmentKey(nextSession.environmentKey ?? environmentKey);
    setAssertionJson(nextSession.assertionJson ?? assertionJson);
    responseSessionRegistry.getOrCreate(nextSession.responseSessionId || nextSession.id);
    setResponseTab(normalizeVisibleResponseTab(nextSession.responseTab));
  }

  function clearActiveView() {
    activeRequestIdRef.current = "";
    setActiveRequestId("");
    setSelectedMethodKey("");
    setActiveCollectionRequestId("");
    setRequestJson("{}");
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    setResponseTab("messages");
  }

  async function persistProjectSnapshotNow(project: ProjectData): Promise<void> {
    window.localStorage.setItem(projectStorageKey, JSON.stringify(project));
    if (!workspaceFolderPath || !window.electronWorkspace?.saveFolder) return;
    await enqueueWorkspaceAutosave(
      workspaceAutosaveRef.current,
      getWorkspaceExportBundle(project),
      workspaceFolderPath,
    );
  }

  function persistRequestTabsNow(nextSessions: RequestSession[], nextActiveRequestId: string) {
    pendingRequestTabPersistenceRef.current = { nextSessions, nextActiveRequestId };
    if (requestTabPersistenceScheduledRef.current) return;

    requestTabPersistenceScheduledRef.current = true;
    runWhenIdle(() => {
      requestTabPersistenceScheduledRef.current = false;
      const pending = pendingRequestTabPersistenceRef.current;
      pendingRequestTabPersistenceRef.current = null;
      if (!pending) return;

      const latest = requestTabPersistenceContextRef.current;
      const project: ProjectData = {
        ...latest.getProjectSnapshot(),
        updatedAt: new Date().toISOString(),
        requestTabs: pending.nextSessions.map(compactRequestSessionForStorage),
        activeRequestId: pending.nextActiveRequestId,
        selectedMethodKey: pending.nextActiveRequestId ? latest.selectedMethodKey : "",
        requestJson: pending.nextActiveRequestId ? latest.requestJson : "{}",
      };
      void persistProjectSnapshotNow(project);
    });
  }

  function closeRequestSession(sessionId: string) {
    pendingSessionSnapshotRef.current.delete(sessionId);
    const closingSession = requestSessions.find((session: RequestSession) => session.id === sessionId);
    responseSessionRegistry.close(closingSession?.responseSessionId || sessionId);
    getRequestRunner()?.cancelRequest?.(sessionId);
    if (wsClientRef.current?.sessionId === sessionId) closeManualWebSocketClient("Tab closed");

    const closingIndex = requestSessions.findIndex((session: RequestSession) => session.id === sessionId);
    const next = requestSessions.filter((session: RequestSession) => session.id !== sessionId);
    const replacementIndex = closingIndex >= 0 ? Math.min(closingIndex, next.length - 1) : 0;
    const replacement = next[replacementIndex] ?? next[0] ?? null;
    const nextActiveRequestId = sessionId === activeRequestId ? (replacement?.id ?? "") : activeRequestId;

    setRequestSessions(next);
    if (sessionId === activeRequestId) {
      activeRequestIdRef.current = nextActiveRequestId;
      setActiveRequestId(nextActiveRequestId);
    }
    persistRequestTabsNow(next, nextActiveRequestId);

    if (sessionId === activeRequestId) {
      if (replacement) {
        setTimeout(() => {
          if (activeRequestIdRef.current !== replacement.id) return;
          activateRequestSession(replacement);
        }, 0);
      } else {
        setTimeout(() => {
          if (activeRequestIdRef.current) return;
          clearActiveView();
        }, 0);
      }
    }
  }

  function closeAllRequestSessions() {
    pendingSessionSnapshotRef.current.clear();
    requestSessions.forEach((session: RequestSession) => {
      responseSessionRegistry.close(session.responseSessionId || session.id);
      getRequestRunner()?.cancelRequest?.(session.id);
    });
    setRequestSessions([]);
    persistRequestTabsNow([], "");
    clearActiveView();
  }

  function closeOtherRequestSessions(sessionId = activeRequestId) {
    if (!sessionId) return;
    const keptSession = requestSessions.find((session: RequestSession) => session.id === sessionId);
    requestSessions
      .filter((session: RequestSession) => session.id !== sessionId)
      .forEach((session: RequestSession) => {
        responseSessionRegistry.close(session.responseSessionId || session.id);
        getRequestRunner()?.cancelRequest?.(session.id);
      });
    const next = keptSession ? [keptSession] : [];
    setRequestSessions(next);
    persistRequestTabsNow(next, keptSession?.id ?? "");
    if (keptSession && sessionId !== activeRequestId) queueMicrotask(() => activateRequestSession(keptSession));
    if (!keptSession) queueMicrotask(clearActiveView);
  }

  function reorderRequestSessions(sourceId: string, targetId: string, position: "before" | "after") {
    const next = reorderRequestSessionList(requestSessions, sourceId, targetId, position);
    if (next === requestSessions) return;
    setRequestSessions(next);
    persistRequestTabsNow(next, activeRequestId);
  }

  function clearActiveResponse() {
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    setResponseTab("messages");
    updateActiveSession({
      responseTab: "messages",
      status: activeRunning ? "running" : "idle",
    });
  }

  function clearHistory() {
    if (!scope.activeExampleKey) return;
    scope.setHistory((current: HistoryItem[]) => current.filter((item) => item.method !== scope.activeExampleKey));
  }

  function updateRequestSession(sessionId: string, patch: Partial<RequestSession>) {
    if (!sessionId) return;
    setRequestSessions((current: RequestSession[]) =>
      current.map((session) =>
        session.id === sessionId ? { ...session, ...patch, updatedAt: new Date().toISOString() } : session,
      ),
    );
  }

  function updateActiveSession(patch: Partial<RequestSession>) {
    updateRequestSession(activeRequestId, patch);
  }

  function patchActiveCollectionRequest(patch: Partial<ApiCollectionRequest>) {
    if (!activeCollectionRequestId) return;
    setCollections((current: ApiCollection[]) =>
      current.map((collection) => ({
        ...collection,
        requests: collection.requests.map((request: ApiCollectionRequest) =>
          request.id === activeCollectionRequestId
            ? { ...request, ...patch, updatedAt: new Date().toISOString() }
            : request,
        ),
        updatedAt: collection.requests.some((request: ApiCollectionRequest) => request.id === activeCollectionRequestId)
          ? new Date().toISOString()
          : collection.updatedAt,
      })),
    );
  }

  function updateActiveRestMethod(method: string) {
    const value = method.toUpperCase();
    updateActiveSession({ httpMethod: value });
    patchActiveCollectionRequest({ method: value });
  }

  function updateActiveRestBodyType(value: RestBodyType) {
    patchActiveCollectionRequest({ restBodyType: value });
  }

  function updateActiveRestAuth(auth: RestAuthConfig) {
    patchActiveCollectionRequest({ restAuth: auth });
  }

  function updateRestPairList(field: "restParams" | "restPathParams", rows: MetadataPair[]) {
    patchActiveCollectionRequest({ [field]: rows } as Partial<ApiCollectionRequest>);
  }

  function updateRestPairRow(
    field: "restParams" | "restPathParams",
    index: number,
    key: keyof MetadataPair,
    value: string,
  ) {
    if (!activeCollectionRequest) return;
    const current =
      field === "restParams"
        ? (activeCollectionRequest.restParams ?? [])
        : (activeCollectionRequest.restPathParams ?? []);
    const next = current.map((item: MetadataPair, itemIndex: number) =>
      itemIndex === index ? { ...item, [key]: value } : item,
    );
    updateRestPairList(field, next);
  }

  function addRestPairRow(field: "restParams" | "restPathParams") {
    if (!activeCollectionRequest) return;
    const current =
      field === "restParams"
        ? (activeCollectionRequest.restParams ?? [])
        : (activeCollectionRequest.restPathParams ?? []);
    updateRestPairList(field, [...current, { key: "", value: "" }]);
  }

  function removeRestPairRow(field: "restParams" | "restPathParams", index: number) {
    if (!activeCollectionRequest) return;
    const current =
      field === "restParams"
        ? (activeCollectionRequest.restParams ?? [])
        : (activeCollectionRequest.restPathParams ?? []);
    updateRestPairList(
      field,
      current.filter((_: MetadataPair, itemIndex: number) => itemIndex !== index),
    );
  }

  function handleRequestJsonChange(value: string) {
    setRequestJson(value);
    updateActiveSession({ requestJson: value });
    patchActiveCollectionRequest({ body: value });
  }

  function prettifyRequestJson() {
    try {
      const text = JSON.stringify(JSON.parse(scope.requestJson), null, 2);
      handleRequestJsonChange(text);
      showToast("Body JSON formatted.", "success");
    } catch (err) {
      showToast(`Invalid JSON: ${toErrorMessage(err)}`, "error");
    }
  }

  function generateRandomRequestJson() {
    if (!loaded || !selectedMethod) return;
    try {
      const randomBody = generateRandomExampleFromType(loaded.root, selectedMethod.requestType);
      handleRequestJsonChange(JSON.stringify(randomBody, null, 2));
      showToast("Random body generated from proto field types.", "success");
    } catch (err) {
      showToast(toErrorMessage(err), "error");
    }
  }

  function generateRequestJsonFromSelectedScenario() {
    if (!selectedMethod) {
      showToast("Select a method before generating a body from a scenario.", "warning");
      return;
    }
    const scenario = currentMockActiveScenario ?? currentMockScenarios[0];
    if (!scenario) {
      showToast("No scenario is available for the selected method.", "warning");
      return;
    }
    const body = extractRequestBodyFromMockScenario(scenario);
    if (body === undefined) {
      showToast("Selected scenario has no input equals/contains data.", "warning");
      return;
    }
    handleRequestJsonChange(JSON.stringify(body, null, 2));
    showToast(`Body generated from scenario ${scenario.id}.`, "success");
  }

  function addMetadataRow() {
    setMetadata((current: MetadataPair[]) => {
      const next = [...current, { key: "", value: "" }];
      updateActiveSession({ metadata: next });
      patchActiveCollectionRequest({ headers: next });
      return next;
    });
  }

  function updateMetadataRow(index: number, field: keyof MetadataPair, value: string) {
    setMetadata((current: MetadataPair[]) => {
      const next = current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item));
      updateActiveSession({ metadata: next });
      patchActiveCollectionRequest({ headers: next });
      return next;
    });
  }

  function removeMetadataRow(index: number) {
    setMetadata((current: MetadataPair[]) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      updateActiveSession({ metadata: next });
      patchActiveCollectionRequest({ headers: next });
      return next;
    });
  }

  function setAuthorizationMetadata(value: string) {
    setMetadata((current: MetadataPair[]) => {
      const index = current.findIndex((item) => item.key.trim().toLowerCase() === "authorization");
      const next =
        index >= 0
          ? current.map((item, itemIndex) => (itemIndex === index ? { key: "authorization", value } : item))
          : [...current, { key: "authorization", value }];
      updateActiveSession({ metadata: next });
      patchActiveCollectionRequest({ headers: next });
      return next;
    });
  }

  function upsertRequestSessionPreservingOrder(session: RequestSession) {
    setRequestSessions((current: RequestSession[]) => upsertRequestSessionPreservingOrderList(current, session));
  }

  return {
    activateRequestSession,
    addMetadataRow,
    addRestPairRow,
    clearActiveResponse,
    clearActiveView,
    clearHistory,
    closeAllRequestSessions,
    closeOtherRequestSessions,
    closeRequestSession,
    generateRandomRequestJson,
    generateRequestJsonFromSelectedScenario,
    handleRequestJsonChange,
    patchActiveCollectionRequest,
    persistProjectSnapshotNow,
    persistRequestTabsNow,
    prettifyRequestJson,
    removeMetadataRow,
    reorderRequestSessions,
    setAuthorizationMetadata,
    removeRestPairRow,
    selectMethod,
    updateActiveRestAuth,
    updateActiveRestBodyType,
    updateActiveRestMethod,
    updateActiveSession,
    updateMetadataRow,
    updateRequestSession,
    updateRestPairRow,
    updateRestPairList,
    upsertRequestSessionPreservingOrder,
  };
}
