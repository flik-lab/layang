"use client";

import type * as protobuf from "protobufjs";
import type { MetadataPair, RpcMethodInfo } from "@/lib/types";
import { createRequestSession } from "../request-runner/request-session-model";
import { upsertRequestSessionPreservingOrderList } from "./request-session-domain";
import { compactRequestSessionForStorage, normalizeVisibleResponseTab } from "../workspace/workspace-model";
import { extractRequestBodyFromMockScenario, generateRandomExampleFromType } from "../mock-server/mock-scenario-model";
import { defaultMetadata, projectStorageKey } from "../../shared/workbench-constants";
import { toErrorMessage } from "../../shared/error-utils";
import { methodKey } from "../../shared/rpc-method-utils";
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
    assertionResults,
    baseUrl,
    closeManualWebSocketClient,
    collections,
    currentMockActiveScenario,
    currentMockScenarios,
    environmentKey,
    events,
    findCollectionRequestById,
    getProjectSnapshot,
    getWorkspaceExportBundle,
    grpcBaseUrlFallback,
    loaded,
    metadata,
    nativeTarget,
    requestJson,
    requestRunner,
    requestSessions,
    selectedMethod,
    selectedMethodKey,
    setActiveCollectionRequestId,
    setActiveRequestId,
    setAssertionJson,
    setAssertionResults,
    setBaseUrl,
    setCollections,
    setEnvironmentKey,
    setEvents,
    setLastResult,
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

  const getRequestRunner = () => requestRunner?.current ?? requestRunner;

  function selectMethod(root: protobuf.Root, method: RpcMethodInfo) {
    setActiveCollectionRequestId("");
    const key = methodKey(method);
    const existing = requestSessions.find((session: RequestSession) => session.methodKey === key);
    if (existing) {
      activateRequestSession(existing);
      return;
    }

    const grpcTransportMode: TransportMode = activeTransportMode === "native-grpc" ? "native-grpc" : "grpc-web";
    const session = createRequestSession(root, method, {
      metadata,
      transportMode: grpcTransportMode,
      baseUrl: grpcBaseUrlFallback(activeBaseUrl, baseUrl),
      nativeTarget: activeNativeTarget,
      environmentKey: activeEnvironmentKey,
      assertionJson,
    });
    setRequestSessions((current: RequestSession[]) =>
      [session, ...current.filter((item) => item.methodKey !== key)].slice(0, 16),
    );
    activateRequestSession(session);
  }

  function activateRequestSession(session: RequestSession) {
    if (activeRequestIdRef.current && activeRequestIdRef.current !== session.id) {
      updateRequestSession(activeRequestIdRef.current, {
        events,
        lastResult: scope.lastResult,
        assertionResults,
        responseTab: scope.responseTab,
      });
    }

    activeRequestIdRef.current = session.id;
    setActiveRequestId(session.id);
    if (session.requestKind === "grpc" && loaded) {
      const collectionGrpcRequest = findCollectionRequestById(collections, session.methodKey);
      const grpcMethodKey = collectionGrpcRequest?.grpcMethodKey ?? "";
      const grpcMethod = grpcMethodKey
        ? loaded.methods.find((method: RpcMethodInfo) => methodKey(method) === grpcMethodKey)
        : null;
      if (grpcMethod) {
        setActiveCollectionRequestId("");
        setSelectedMethodKey(grpcMethodKey);
      } else {
        setActiveCollectionRequestId(session.methodKey);
        setSelectedMethodKey("");
      }
    } else if (session.requestKind) {
      setActiveCollectionRequestId(session.methodKey);
      setSelectedMethodKey("");
    } else {
      setActiveCollectionRequestId("");
      setSelectedMethodKey(session.methodKey);
    }
    setRequestJson(session.requestJson);
    setMetadata(session.metadata.length ? session.metadata : defaultMetadata);
    const nextTransportMode: TransportMode =
      session.requestKind === "websocket"
        ? "websocket"
        : session.requestKind === "rest"
          ? "rest"
          : session.transportMode === "websocket" || session.transportMode === "rest"
            ? "grpc-web"
            : (session.transportMode ?? transportMode);
    setTransportMode(nextTransportMode);
    if (session.requestKind === "rest") setBaseUrl(session.baseUrl || session.requestUrl || "http://127.0.0.1:3000");
    else if (session.requestKind !== "websocket") setBaseUrl(grpcBaseUrlFallback(session.baseUrl, baseUrl));
    setNativeTarget(session.nativeTarget ?? nativeTarget);
    setEnvironmentKey(session.environmentKey ?? environmentKey);
    setAssertionJson(session.assertionJson ?? assertionJson);
    setEvents(session.events ?? []);
    setLastResult(session.lastResult ?? null);
    setAssertionResults(session.assertionResults ?? []);
    setResponseTab(normalizeVisibleResponseTab(session.responseTab));
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

  function persistProjectSnapshotNow(project: ProjectData) {
    window.localStorage.setItem(projectStorageKey, JSON.stringify(project));

    if (!workspaceFolderPath || !window.electronWorkspace?.saveFolder) return;
    const bundle = getWorkspaceExportBundle(project);
    const payload = JSON.stringify({ project: bundle.project, layout: bundle.layout, settings: bundle.settings });
    const saveState = workspaceAutosaveRef.current;
    saveState.pendingPayload = payload;
    saveState.pendingBundle = bundle;
    saveState.pendingPath = workspaceFolderPath;
    void window.electronWorkspace.saveFolder(bundle, workspaceFolderPath).then((result) => {
      if (result?.ok) saveState.lastPayload = payload;
    });
  }

  function persistRequestTabsNow(nextSessions: RequestSession[], nextActiveRequestId: string) {
    const project: ProjectData = {
      ...getProjectSnapshot(),
      updatedAt: new Date().toISOString(),
      requestTabs: nextSessions.map(compactRequestSessionForStorage),
      activeRequestId: nextActiveRequestId,
      selectedMethodKey: nextActiveRequestId ? selectedMethodKey : "",
      requestJson: nextActiveRequestId ? requestJson : "{}",
    };
    persistProjectSnapshotNow(project);
  }

  function closeRequestSession(sessionId: string) {
    getRequestRunner()?.cancelRequest?.(sessionId);
    if (wsClientRef.current?.sessionId === sessionId) closeManualWebSocketClient("Tab closed");

    const closingIndex = requestSessions.findIndex((session: RequestSession) => session.id === sessionId);
    const next = requestSessions.filter((session: RequestSession) => session.id !== sessionId);
    const replacementIndex = closingIndex >= 0 ? Math.min(closingIndex, next.length - 1) : 0;
    const replacement = next[replacementIndex] ?? next[0] ?? null;
    const nextActiveRequestId = sessionId === activeRequestId ? (replacement?.id ?? "") : activeRequestId;

    setRequestSessions(next);
    persistRequestTabsNow(next, nextActiveRequestId);

    if (sessionId === activeRequestId) {
      if (replacement) queueMicrotask(() => activateRequestSession(replacement));
      else queueMicrotask(clearActiveView);
    }
  }

  function closeAllRequestSessions() {
    requestSessions.forEach((session: RequestSession) => {
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
        getRequestRunner()?.cancelRequest?.(session.id);
      });
    const next = keptSession ? [keptSession] : [];
    setRequestSessions(next);
    persistRequestTabsNow(next, keptSession?.id ?? "");
    if (keptSession && sessionId !== activeRequestId) queueMicrotask(() => activateRequestSession(keptSession));
    if (!keptSession) queueMicrotask(clearActiveView);
  }

  function clearActiveResponse() {
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    setResponseTab("messages");
    updateActiveSession({
      events: [],
      lastResult: null,
      assertionResults: [],
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
