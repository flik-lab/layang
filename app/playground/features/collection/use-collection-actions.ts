"use client";

import type {
  ApiCollection,
  ApiCollectionRequest,
  ApiRequestKind,
  RequestSession,
  RestMockProject,
  TransportMode,
  WebSocketMockProject,
} from "../../shared/workbench-types";
import type { LoadedProto, MetadataPair, RpcMethodInfo } from "@/lib/types";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type ActionContext = Record<string, any> & {
  collections: ApiCollection[];
  setCollections: StateSetter<ApiCollection[]>;
  requestSessions: RequestSession[];
  setRequestSessions: StateSetter<RequestSession[]>;
  setRestMockServer: StateSetter<RestMockProject>;
  setWsMockServer: StateSetter<WebSocketMockProject>;
  loaded: LoadedProto | null;
  metadata: MetadataPair[];
  activateRequestSession: (session: RequestSession) => void;
  upsertRequestSessionPreservingOrder: (session: RequestSession) => void;
  selectMethod: (root: LoadedProto["root"], method: RpcMethodInfo) => void;
};

export function useCollectionActions(ctx: ActionContext) {
  const {
    activeCollectionRequestId,
    activeEnvironmentKey,
    activeNativeTarget,
    activeRequestId,
    activeRequestIdRef,
    activateRequestSession,
    assertionJson,
    clearActiveView,
    closeManualWebSocketClient,
    collectionNameDraft,
    collections,
    compactRequestSessionForStorage,
    createId,
    defaultRestMockResponse,
    defaultWebSocketMockResponse,
    draftEffectiveBaseUrl,
    loaded,
    pendingCollectionImportRef,
    persistProjectSnapshotNow,
    protoInputRef,
    requestKindDraft,
    requestNameDraft,
    requestRunner,
    requestSessions,
    requestTargetCollectionId,
    selectMethod,
    selectedMethodKey,
    setCollectionDialogOpen,
    setCollectionMenuAnchor,
    setCollectionNameDraft,
    setCollections,
    setRequestKindDraft,
    setRequestNameDialogOpen,
    setRequestNameDraft,
    setRequestSessions,
    setRequestTab,
    setRequestTargetCollectionId,
    setRestMockServer,
    setWsMockServer,
    showToast,
    upsertRequestSessionPreservingOrder,
    wsClientRef,
    methodKey,
    getProjectSnapshot,
    requestJson,
  } = ctx;

  function openAddCollectionDialog() {
    setCollectionMenuAnchor(null);
    setCollectionNameDraft(nextCollectionName());
    setCollectionDialogOpen(true);
  }

  function nextCollectionName() {
    let index = collections.length + 1;
    let name = collections.length === 0 ? "Untitled Collection" : `Untitled Collection ${index}`;
    const names = new Set(collections.map((collection) => collection.name.toLowerCase()));
    while (names.has(name.toLowerCase())) {
      index += 1;
      name = `Untitled Collection ${index}`;
    }
    return name;
  }

  function nextCollectionRequestName(collectionId: string, kind: ApiRequestKind) {
    const collection = collections.find((item) => item.id === collectionId);
    const names = new Set((collection?.requests ?? []).map((request) => request.name.toLowerCase()));
    let index = (collection?.requests.length ?? 0) + 1;
    const base =
      kind === "rest" ? "New REST Request" : kind === "websocket" ? "New WebSocket Request" : "New gRPC Request";
    let name = index <= 1 ? base : `${base} ${index}`;
    while (names.has(name.toLowerCase())) {
      index += 1;
      name = `${base} ${index}`;
    }
    return name;
  }

  function openAddCollectionRequestDialog(collectionId: string, kind: "websocket" | "rest") {
    setRequestTargetCollectionId(collectionId);
    setRequestKindDraft(kind);
    setRequestNameDraft(nextCollectionRequestName(collectionId, kind));
    setRequestNameDialogOpen(true);
  }

  function confirmAddCollectionRequest() {
    const name = requestNameDraft.trim();
    if (!requestTargetCollectionId) {
      setRequestNameDialogOpen(false);
      return;
    }
    if (!name) {
      showToast(`${requestKindDraft === "rest" ? "REST" : "WebSocket"} request name is required.`, "warning");
      return;
    }
    addCollectionRequest(requestTargetCollectionId, requestKindDraft, {
      name,
      method: requestKindDraft === "rest" ? "GET" : undefined,
      url: requestKindDraft === "rest" ? "http://127.0.0.1:3000" : undefined,
      body: requestKindDraft === "rest" ? "" : undefined,
      restBodyType: requestKindDraft === "rest" ? "none" : undefined,
      restAuth: requestKindDraft === "rest" ? { type: "none" } : undefined,
      mockResponse:
        requestKindDraft === "websocket"
          ? defaultWebSocketMockResponse(name)
          : requestKindDraft === "rest"
            ? defaultRestMockResponse(name)
            : undefined,
    });
    setRequestNameDialogOpen(false);
    setRequestTargetCollectionId("");
  }

  function confirmAddCollection() {
    const name = collectionNameDraft.trim();
    if (!name) {
      showToast("Collection name is required.", "warning");
      return;
    }
    const now = new Date().toISOString();
    const collection: ApiCollection = { id: createId(), name, requests: [], createdAt: now, updatedAt: now };
    setCollections((current) => [collection, ...current]);
    setCollectionDialogOpen(false);
    showToast("Collection added.", "success");
  }

  function removeCollection(collectionId: string) {
    const collection = collections.find((item) => item.id === collectionId);
    if (!collection) return;

    const removedRequestIds = new Set(collection.requests.map((request) => request.id));
    const removedSessionKeys = new Set<string>();
    collection.requests.forEach((request) => {
      removedSessionKeys.add(request.id);
      if (request.grpcMethodKey) removedSessionKeys.add(request.grpcMethodKey);
    });

    const nextCollections = collections.filter((item) => item.id !== collectionId);
    const nextSessions = requestSessions.filter((session) => !removedSessionKeys.has(session.methodKey));
    const removedSessions = requestSessions.filter((session) => removedSessionKeys.has(session.methodKey));
    const removedSessionIds = new Set(removedSessions.map((session) => session.id));

    removedSessions.forEach((session) => {
      requestRunner.cancelRequest(session.id);
      if (wsClientRef.current?.sessionId === session.id) closeManualWebSocketClient("Collection deleted");
    });

    const activeSessionWasRemoved = Boolean(
      activeRequestIdRef.current && removedSessionIds.has(activeRequestIdRef.current),
    );
    const activeCollectionRequestWasRemoved = Boolean(
      activeCollectionRequestId && removedRequestIds.has(activeCollectionRequestId),
    );
    const activeMethodWasRemoved = Boolean(selectedMethodKey && removedSessionKeys.has(selectedMethodKey));
    const activeViewWasRemoved = activeSessionWasRemoved || activeCollectionRequestWasRemoved || activeMethodWasRemoved;
    const replacement = activeViewWasRemoved ? (nextSessions[0] ?? null) : null;
    const nextActiveRequestId = activeViewWasRemoved ? (replacement?.id ?? "") : activeRequestId;

    setCollections(nextCollections);
    setRequestSessions(nextSessions);
    persistProjectSnapshotNow({
      ...getProjectSnapshot(),
      updatedAt: new Date().toISOString(),
      collections: nextCollections,
      requestTabs: nextSessions.map(compactRequestSessionForStorage),
      activeRequestId: nextActiveRequestId,
      selectedMethodKey: replacement?.requestKind
        ? ""
        : (replacement?.methodKey ?? (nextActiveRequestId ? selectedMethodKey : "")),
      requestJson: replacement?.requestJson ?? (nextActiveRequestId ? requestJson : "{}"),
    });

    if (activeViewWasRemoved) {
      if (replacement) queueMicrotask(() => activateRequestSession(replacement));
      else queueMicrotask(clearActiveView);
    }

    showToast(
      removedSessions.length
        ? `${collection.name} deleted. Closed ${removedSessions.length} open tab${
            removedSessions.length === 1 ? "" : "s"
          }.`
        : `${collection.name} deleted.`,
      "success",
    );
  }

  function renameCollection(collectionId: string) {
    const collection = collections.find((item) => item.id === collectionId);
    if (!collection) return;
    const nextName = window.prompt("Rename collection", collection.name)?.trim();
    if (nextName === undefined) return;
    if (!nextName) {
      showToast("Collection name is required.", "warning");
      return;
    }
    const requestIds = new Set(collection.requests.map((request) => request.id));
    setCollections((current) =>
      current.map((item) =>
        item.id === collectionId ? { ...item, name: nextName, updatedAt: new Date().toISOString() } : item,
      ),
    );
    setRequestSessions((current) =>
      current.map((session) =>
        requestIds.has(session.methodKey)
          ? { ...session, serviceName: nextName, updatedAt: new Date().toISOString() }
          : session,
      ),
    );
    showToast("Collection renamed.", "success");
  }

  function renameCollectionRequest(collectionId: string, requestId: string) {
    const collection = collections.find((item) => item.id === collectionId);
    const request = collection?.requests.find((item) => item.id === requestId);
    if (!collection || !request) return;
    if (request.kind !== "rest" && request.kind !== "websocket") {
      showToast("Rename from context menu is available for REST and WebSocket requests.", "info");
      return;
    }
    const nextName = window.prompt("Rename request", request.name)?.trim();
    if (nextName === undefined) return;
    if (!nextName) {
      showToast("Request name is required.", "warning");
      return;
    }
    setCollections((current) =>
      current.map((item) =>
        item.id === collectionId
          ? {
              ...item,
              requests: item.requests.map((candidate) =>
                candidate.id === requestId
                  ? { ...candidate, name: nextName, updatedAt: new Date().toISOString() }
                  : candidate,
              ),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    setRequestSessions((current) =>
      current.map((session) =>
        session.methodKey === requestId
          ? { ...session, title: nextName, updatedAt: new Date().toISOString() }
          : session,
      ),
    );
    if (request.kind === "websocket") {
      setWsMockServer((current) => ({
        ...current,
        scenarios: current.scenarios.map((scenario) =>
          scenario.requestId === requestId || scenario.id === requestId
            ? { ...scenario, name: scenario.id === requestId ? `${nextName} scenario` : scenario.name }
            : scenario,
        ),
        updatedAt: new Date().toISOString(),
      }));
    }
    if (request.kind === "rest") {
      setRestMockServer((current) => ({
        ...current,
        scenarios: current.scenarios.map((scenario) =>
          scenario.requestId === requestId || scenario.id === requestId
            ? { ...scenario, name: scenario.id === requestId ? `${nextName} success` : scenario.name }
            : scenario,
        ),
        updatedAt: new Date().toISOString(),
      }));
    }
    showToast("Request renamed.", "success");
  }

  function removeCollectionRequest(collectionId: string, requestId: string) {
    const collection = collections.find((item) => item.id === collectionId);
    const request = collection?.requests.find((item) => item.id === requestId);
    if (!collection || !request) return;
    const removedSessionKeys = new Set<string>([requestId]);
    if (request.grpcMethodKey) removedSessionKeys.add(request.grpcMethodKey);

    const nextCollections = collections.map((item) =>
      item.id === collectionId
        ? {
            ...item,
            requests: item.requests.filter((candidate) => candidate.id !== requestId),
            updatedAt: new Date().toISOString(),
          }
        : item,
    );
    const removedSessions = requestSessions.filter((session) => removedSessionKeys.has(session.methodKey));
    const removedSessionIds = new Set(removedSessions.map((session) => session.id));
    const nextSessions = requestSessions.filter((session) => !removedSessionKeys.has(session.methodKey));

    removedSessions.forEach((session) => {
      requestRunner.cancelRequest(session.id);
      if (wsClientRef.current?.sessionId === session.id) closeManualWebSocketClient("Request deleted");
    });

    setCollections(nextCollections);
    setRequestSessions(nextSessions);
    if (request.kind === "websocket") {
      setWsMockServer((current) => {
        const selectedScenarioIds = { ...current.selectedScenarioIds };
        delete selectedScenarioIds[requestId];
        return {
          ...current,
          selectedScenarioIds,
          scenarios: current.scenarios.filter(
            (scenario) => scenario.requestId !== requestId && scenario.id !== requestId,
          ),
          updatedAt: new Date().toISOString(),
        };
      });
    }
    if (request.kind === "rest") {
      setRestMockServer((current) => ({
        ...current,
        scenarios: current.scenarios.filter(
          (scenario) => scenario.requestId !== requestId && scenario.id !== requestId,
        ),
        updatedAt: new Date().toISOString(),
      }));
    }

    const activeViewWasRemoved =
      Boolean(activeRequestIdRef.current && removedSessionIds.has(activeRequestIdRef.current)) ||
      activeCollectionRequestId === requestId ||
      removedSessionKeys.has(selectedMethodKey);
    if (activeViewWasRemoved) {
      const replacement = nextSessions[0] ?? null;
      if (replacement) queueMicrotask(() => activateRequestSession(replacement));
      else queueMicrotask(clearActiveView);
    }
    showToast(`${request.name} deleted.`, "success");
  }

  function createCollectionRequest(
    collectionId: string,
    kind: ApiRequestKind,
    overrides: Partial<ApiCollectionRequest> = {},
  ): ApiCollectionRequest {
    const now = new Date().toISOString();
    const defaultName = kind === "grpc" ? "gRPC Request" : kind === "rest" ? "REST Request" : "WebSocket Request";
    const defaultUrl =
      kind === "grpc" ? draftEffectiveBaseUrl : kind === "rest" ? "http://127.0.0.1:3000" : "ws://localhost:8080";
    return {
      id: createId(),
      collectionId,
      name: overrides.name ?? defaultName,
      kind,
      method: overrides.method ?? (kind === "rest" ? "GET" : undefined),
      url: overrides.url ?? defaultUrl,
      grpcMethodKey: overrides.grpcMethodKey,
      body: overrides.body ?? (kind === "grpc" ? "{}" : ""),
      headers: overrides.headers ?? [],
      restParams: overrides.restParams ?? [],
      restPathParams: overrides.restPathParams ?? [],
      restAuth: overrides.restAuth ?? (kind === "rest" ? { type: "none" } : undefined),
      restBodyType: overrides.restBodyType ?? (kind === "rest" ? "none" : undefined),
      mockResponse:
        overrides.mockResponse ??
        (kind === "websocket"
          ? defaultWebSocketMockResponse(overrides.name ?? defaultName)
          : kind === "rest"
            ? defaultRestMockResponse(overrides.name ?? defaultName)
            : undefined),
      createdAt: now,
      updatedAt: now,
    };
  }

  function addCollectionRequest(
    collectionId: string,
    kind: ApiRequestKind,
    overrides: Partial<ApiCollectionRequest> = {},
  ) {
    const request = createCollectionRequest(collectionId, kind, overrides);
    const existingCollection = collections.find((collection) => collection.id === collectionId);
    const fallbackCollection: ApiCollection = {
      id: collectionId,
      name: "Collection",
      requests: [],
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
    const nextCollection = {
      ...(existingCollection ?? fallbackCollection),
      requests: [request, ...(existingCollection?.requests ?? [])],
      updatedAt: new Date().toISOString(),
    };
    setCollections((current) =>
      current.map((collection) => (collection.id === collectionId ? nextCollection : collection)),
    );
    selectCollectionRequest(nextCollection, request);
    showToast(`${request.name} added.`, "success");
  }

  function importGrpcRequestIntoCollection(collectionId: string) {
    pendingCollectionImportRef.current = collectionId;
    protoInputRef.current?.click();
  }

  function createCollectionRequestSession(collection: ApiCollection, request: ApiCollectionRequest): RequestSession {
    const now = new Date().toISOString();
    const mode: TransportMode =
      request.kind === "websocket" ? "websocket" : request.kind === "rest" ? "rest" : "grpc-web";
    return {
      id: createId(),
      methodKey: request.id,
      title: request.name,
      serviceName: collection.name,
      requestJson: request.body || (request.kind === "grpc" ? "{}" : ""),
      metadata: request.headers.length ? request.headers.map((item) => ({ ...item })) : [],
      transportMode: mode,
      requestKind: request.kind,
      requestUrl: request.url,
      httpMethod: request.method,
      baseUrl: request.url,
      nativeTarget: activeNativeTarget,
      environmentKey: activeEnvironmentKey,
      assertionJson,
      responseTab: "messages",
      events: [],
      lastResult: null,
      assertionResults: [],
      running: false,
      status: "idle",
      openedAt: now,
      updatedAt: now,
    };
  }

  function selectCollectionRequest(collection: ApiCollection, request: ApiCollectionRequest) {
    if (request.kind === "grpc" && request.grpcMethodKey && loaded) {
      const grpcMethod = loaded.methods.find((method) => methodKey(method) === request.grpcMethodKey);
      if (grpcMethod) {
        selectMethod(loaded.root, grpcMethod);
        return;
      }
    }
    const existing = requestSessions.find((session) => session.methodKey === request.id);
    const session = existing ?? createCollectionRequestSession(collection, request);
    if (!existing) upsertRequestSessionPreservingOrder(session);
    activateRequestSession(session);
    setRequestTab("body");
  }

  return {
    openAddCollectionDialog,
    nextCollectionName,
    nextCollectionRequestName,
    openAddCollectionRequestDialog,
    confirmAddCollectionRequest,
    confirmAddCollection,
    removeCollection,
    renameCollection,
    renameCollectionRequest,
    removeCollectionRequest,
    createCollectionRequest,
    addCollectionRequest,
    importGrpcRequestIntoCollection,
    createCollectionRequestSession,
    selectCollectionRequest,
    upsertRequestSessionPreservingOrder,
  };
}
