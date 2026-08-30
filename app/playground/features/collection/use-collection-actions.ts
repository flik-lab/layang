"use client";

import { normalizeEditableText } from "../../shared/json-utils";
import type {
  ApiCollection,
  ApiCollectionRequest,
  ApiRequestKind,
  CollectionFolder,
  DocResultSnapshot,
  MethodDoc,
  MockServerProject,
  RequestSession,
  RestMockProject,
  TransportMode,
  WebSocketMockProject,
} from "../../shared/workbench-types";
import type { LoadedProto, MetadataPair, RpcMethodInfo } from "@/lib/types";
import type { ProtoRuntimeRegistry } from "@/lib/proto-runtime-registry";
import { generateExampleFromType } from "@/lib/example-generator";
import { createPinnedGrpcBinding, findProtoVersion } from "../proto-library/proto-library-domain";
import type { ProtoLibrary } from "../proto-library/proto-library-types";
import {
  createCollectionFolder as createFolderEntity,
  deleteCollectionFolder,
  getCollectionFolderRequestIds,
  moveCollectionNode,
  nextCollectionSiblingOrder,
  type CollectionDropTarget,
  type CollectionNodeRef,
} from "./collection-tree-domain";
import { uniqueCollectionRequestName } from "./grpc-request-name";
import {
  NEW_SCHEMA_COLLECTION_TARGET,
  preferredSchemaCollectionId,
  uniqueSchemaCollectionName,
} from "./quick-request-creator-domain";
import { findReusableCollectionRequestSession } from "../request-editor/request-session-domain";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type ActionContext = Record<string, any> & {
  collections: ApiCollection[];
  setCollections: StateSetter<ApiCollection[]>;
  setProtoLibraries: StateSetter<ProtoLibrary[]>;
  requestSessions: RequestSession[];
  setRequestSessions: StateSetter<RequestSession[]>;
  setRestMockServer: StateSetter<RestMockProject>;
  setWsMockServer: StateSetter<WebSocketMockProject>;
  mockServer: MockServerProject;
  methodDocs: MethodDoc[];
  docResults: DocResultSnapshot[];
  loaded: LoadedProto | null;
  protoLibraries: ProtoLibrary[];
  protoRuntimeRegistry: ProtoRuntimeRegistry;
  setLoaded: StateSetter<LoadedProto | null>;
  setActiveProtoLibraryId: StateSetter<string>;
  setActiveProtoVersionId: StateSetter<string>;
  metadata: MetadataPair[];
  activateRequestSession: (session: RequestSession) => void;
  upsertRequestSessionPreservingOrder: (session: RequestSession) => void;
  selectMethod: (root: LoadedProto["root"], method: RpcMethodInfo) => void;
};

export function useCollectionActions(ctx: ActionContext) {
  const {
    activeCollectionRequest,
    activeCollectionRequestId,
    activeProtoLibraryId,
    activeProtoVersionId,
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
    protoLibraries,
    protoRuntimeRegistry,
    pendingCollectionImportRef,
    persistProjectSnapshotNow,
    protoInputRef,
    requestKindDraft,
    requestNameDraft,
    requestGrpcLibraryIdDraft,
    requestGrpcVersionIdDraft,
    requestGrpcMethodKeyDraft,
    requestGrpcBatchMethodKeysDraft,
    requestGrpcSelectionModeDraft,
    requestGrpcSkipExistingDraft,
    requestRunner,
    requestSessions,
    requestTargetCollectionId,
    requestTargetFolderId,
    selectedMethodKey,
    setCollectionDialogOpen,
    setCollectionMenuAnchor,
    setCollectionNameDraft,
    setCollections,
    setLoaded,
    setActiveProtoLibraryId,
    setActiveProtoVersionId,
    setRequestKindDraft,
    setRequestGrpcLibraryIdDraft,
    setRequestGrpcVersionIdDraft,
    setRequestGrpcMethodKeyDraft,
    setRequestGrpcBatchMethodKeysDraft,
    setRequestGrpcSelectionModeDraft,
    setRequestGrpcSkipExistingDraft,
    setRequestNameDialogOpen,
    setRequestNameDraft,
    setRequestSessions,
    setRequestTab,
    setRequestTargetCollectionId,
    setRequestTargetFolderId,
    setRequestLocationEditable,
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
    let index = 1;
    const base = kind === "rest" ? "GET Request" : kind === "websocket" ? "WebSocket Request" : "gRPC Request";
    let name = index <= 1 ? base : `${base} ${index}`;
    while (names.has(name.toLowerCase())) {
      index += 1;
      name = `${base} ${index}`;
    }
    return name;
  }

  function openAddCollectionRequestDialog(
    collectionId: string,
    kind: ApiRequestKind | "" = "",
    parentId: string | null = null,
  ) {
    if (kind === "rest" || kind === "websocket") {
      const name = nextCollectionRequestName(collectionId, kind);
      addCollectionRequest(collectionId, kind, {
        name,
        method: kind === "rest" ? "GET" : undefined,
        url: kind === "rest" ? "http://127.0.0.1:3000" : "ws://localhost:8080",
        body: "",
        restBodyType: kind === "rest" ? "none" : undefined,
        restAuth: kind === "rest" ? { type: "none" } : undefined,
        parentId,
        mockResponse: kind === "websocket" ? defaultWebSocketMockResponse(name) : defaultRestMockResponse(name),
      });
      return;
    }
    const rememberedSchemaId =
      typeof window !== "undefined" ? window.localStorage.getItem("layang:last-request-schema-id") ?? "" : "";
    const firstSchema = protoLibraries.find((library) => library.id === rememberedSchemaId) ?? protoLibraries[0];
    const firstVersion =
      firstSchema?.versions.find((version) => version.id === firstSchema.defaultVersionId) ?? firstSchema?.versions[0];
    const firstCompiled =
      firstSchema && firstVersion ? protoRuntimeRegistry.resolveVersion(firstSchema.id, firstVersion.id) : null;
    const rememberedService =
      typeof window !== "undefined" ? window.localStorage.getItem("layang:last-request-service-name") ?? "" : "";
    const preferredMethods =
      firstCompiled?.loaded.methods.filter((method) => method.serviceName === rememberedService) ?? [];
    setRequestTargetCollectionId(collectionId || NEW_SCHEMA_COLLECTION_TARGET);
    setRequestTargetFolderId(parentId);
    setRequestLocationEditable(kind === "grpc" || !kind);
    const firstMethod = kind === "grpc" ? preferredMethods[0] ?? firstCompiled?.loaded.methods[0] : undefined;
    setRequestGrpcSelectionModeDraft(kind === "grpc" ? "multi" : "single");
    setRequestGrpcSkipExistingDraft(true);
    setRequestGrpcBatchMethodKeysDraft(firstMethod && kind === "grpc" ? [methodKey(firstMethod)] : []);
    setRequestKindDraft(kind);
    setRequestNameDraft(
      firstMethod
        ? uniqueCollectionRequestName(
            firstMethod.methodName,
            collections.find((item) => item.id === collectionId)?.requests.map((request) => request.name) ?? [],
          )
        : kind
          ? nextCollectionRequestName(collectionId, kind)
          : "",
    );
    setRequestGrpcLibraryIdDraft(kind === "grpc" ? (firstSchema?.id ?? "") : "");
    setRequestGrpcVersionIdDraft(kind === "grpc" ? (firstVersion?.id ?? "") : "");
    setRequestGrpcMethodKeyDraft(firstMethod ? methodKey(firstMethod) : "");
    setRequestNameDialogOpen(true);
  }

  function openGrpcMethodRequestDialog(method: RpcMethodInfo) {
    const activeProto = findProtoVersion(protoLibraries, activeProtoLibraryId, activeProtoVersionId);
    if (!activeProto) {
      showToast("Select a schema revision before creating a request.", "warning");
      return;
    }
    const contextualCollectionId = activeCollectionRequest?.collectionId ?? "";
    const targetCollectionId = preferredSchemaCollectionId(activeProto.library.name, collections, contextualCollectionId);
    setRequestTargetCollectionId(targetCollectionId);
    setRequestTargetFolderId(targetCollectionId === contextualCollectionId ? activeCollectionRequest?.parentId ?? null : null);
    setRequestLocationEditable(true);
    setRequestKindDraft("grpc");
    setRequestGrpcLibraryIdDraft(activeProto.library.id);
    setRequestGrpcVersionIdDraft(activeProto.version.id);
    setRequestGrpcMethodKeyDraft(methodKey(method));
    setRequestGrpcSelectionModeDraft("single");
    setRequestGrpcSkipExistingDraft(true);
    setRequestGrpcBatchMethodKeysDraft([]);
    setRequestNameDraft(
      uniqueCollectionRequestName(
        method.methodName,
        collections.find((collection) => collection.id === targetCollectionId)?.requests.map((request) => request.name) ?? [],
      ),
    );
    setRequestNameDialogOpen(true);
  }

  function openGrpcMethodsRequestDialog(
    methods: RpcMethodInfo[],
    libraryId = activeProtoLibraryId,
    versionId = activeProtoVersionId,
  ) {
    const uniqueMethods = methods.filter(
      (method, index, items) => items.findIndex((candidate) => methodKey(candidate) === methodKey(method)) === index,
    );
    if (uniqueMethods.length === 0) {
      showToast("This schema revision does not expose any RPC method.", "warning");
      return;
    }
    const activeProto = findProtoVersion(protoLibraries, libraryId, versionId);
    if (!activeProto) {
      showToast("Select a schema revision before creating requests.", "warning");
      return;
    }
    const contextualCollectionId = activeCollectionRequest?.collectionId ?? "";
    const targetCollectionId = preferredSchemaCollectionId(activeProto.library.name, collections, contextualCollectionId);
    setRequestTargetCollectionId(targetCollectionId);
    setRequestTargetFolderId(targetCollectionId === contextualCollectionId ? activeCollectionRequest?.parentId ?? null : null);
    setRequestLocationEditable(true);
    setRequestKindDraft("grpc");
    setRequestGrpcLibraryIdDraft(activeProto.library.id);
    setRequestGrpcVersionIdDraft(activeProto.version.id);
    setRequestGrpcMethodKeyDraft("");
    setRequestGrpcSelectionModeDraft("multi");
    setRequestGrpcSkipExistingDraft(true);
    setRequestGrpcBatchMethodKeysDraft(uniqueMethods.map((method) => methodKey(method)));
    setRequestNameDraft("");
    setRequestNameDialogOpen(true);
  }

  function addGrpcMethodsToCollection(
    collectionId: string,
    methods: RpcMethodInfo[],
    compiled: NonNullable<ReturnType<ProtoRuntimeRegistry["resolveVersion"]>>,
    parentId: string | null,
    skipExisting = true,
    groupByService = true,
  ) {
    if (methods.length === 0) return { created: 0, skipped: 0 };
    const createSchemaCollection = collectionId === NEW_SCHEMA_COLLECTION_TARGET;
    const existingCollection = collections.find((item) => item.id === collectionId);
    if (!createSchemaCollection && !existingCollection) return { created: 0, skipped: 0 };

    const now = new Date().toISOString();
    let workingCollection: ApiCollection = existingCollection
      ? {
          ...existingCollection,
          folders: [...existingCollection.folders],
          requests: [...existingCollection.requests],
        }
      : {
          id: createId(),
          name: uniqueSchemaCollectionName(compiled.library.name, collections),
          folders: [],
          requests: [],
          createdAt: now,
          updatedAt: now,
        };

    const existingMethodNames = new Set(
      workingCollection.requests
        .filter((request) => request.kind === "grpc" && request.grpc?.libraryId === compiled.library.id)
        .map((request) => request.grpc?.methodFullName)
        .filter((value): value is string => Boolean(value)),
    );
    const methodsToCreate = skipExisting
      ? methods.filter((method) => !existingMethodNames.has(`${method.serviceName}/${method.methodName}`))
      : methods;
    const skipped = methods.length - methodsToCreate.length;
    const usedNames = workingCollection.requests.map((request) => request.name);
    const serviceFolderIds = new Map<string, string>();

    if (groupByService) {
      for (const serviceName of Array.from(new Set(methodsToCreate.map((method) => method.serviceName)))) {
        const existingFolder = workingCollection.folders.find(
          (folder) =>
            folder.parentId === parentId &&
            folder.name.trim().toLowerCase() === serviceName.trim().toLowerCase(),
        );
        if (existingFolder) {
          serviceFolderIds.set(serviceName, existingFolder.id);
          continue;
        }
        const folder = createFolderEntity(workingCollection, parentId, serviceName, now);
        workingCollection = { ...workingCollection, folders: [...workingCollection.folders, folder] };
        serviceFolderIds.set(serviceName, folder.id);
      }
    }

    const requests: ApiCollectionRequest[] = [];
    for (const method of methodsToCreate) {
      const name = uniqueCollectionRequestName(method.methodName, usedNames);
      usedNames.push(name);
      const requestParentId = groupByService ? serviceFolderIds.get(method.serviceName) ?? parentId : parentId;
      const request = createCollectionRequest(workingCollection.id, "grpc", {
        name,
        url: draftEffectiveBaseUrl,
        grpcMethodKey: methodKey(method),
        grpc: createPinnedGrpcBinding(compiled.library, compiled.version, method),
        body: JSON.stringify(generateExampleFromType(compiled.loaded.root, method.requestType), null, 2),
        headers: [],
        parentId: requestParentId,
        order: nextCollectionSiblingOrder(workingCollection, requestParentId),
      });
      requests.push(request);
      workingCollection = { ...workingCollection, requests: [...workingCollection.requests, request] };
    }
    workingCollection = { ...workingCollection, updatedAt: now };

    setCollections((current) =>
      createSchemaCollection
        ? [workingCollection, ...current]
        : current.map((item) => (item.id === workingCollection.id ? workingCollection : item)),
    );
    if (requests.length > 0) {
      const collectionNote = createSchemaCollection ? ` in new ${workingCollection.name} collection` : "";
      showToast(
        `${requests.length} gRPC request${requests.length === 1 ? "" : "s"} added${collectionNote}${
          skipped ? ` · ${skipped} existing skipped` : ""
        }.`,
        "success",
      );
    } else if (skipped > 0) {
      showToast("All selected gRPC methods already exist in this collection.", "info");
    }
    return { created: requests.length, skipped, collectionId: workingCollection.id };
  }

  function confirmAddCollectionRequest() {
    const name = requestNameDraft.trim();
    const isGrpcBatch = requestKindDraft === "grpc" && requestGrpcSelectionModeDraft === "multi";
    if (!requestTargetCollectionId) {
      setRequestNameDialogOpen(false);
      return;
    }
    if (!requestKindDraft) {
      showToast("Select REST, WebSocket, or gRPC.", "warning");
      return;
    }
    if (!isGrpcBatch && !name) {
      const label = requestKindDraft === "grpc" ? "gRPC" : requestKindDraft === "rest" ? "REST" : "WebSocket";
      showToast(`${label} request name is required.`, "warning");
      return;
    }

    if (requestKindDraft === "grpc") {
      const compiled = protoRuntimeRegistry.resolveVersion(requestGrpcLibraryIdDraft, requestGrpcVersionIdDraft);
      if (isGrpcBatch) {
        if (!compiled) {
          showToast("Select a global proto schema and revision.", "warning");
          return;
        }
        const methodKeys = new Set(requestGrpcBatchMethodKeysDraft);
        const methods = compiled.loaded.methods.filter((item) => methodKeys.has(methodKey(item)));
        if (methods.length !== methodKeys.size) {
          showToast("Some RPC methods are no longer available in this schema revision.", "warning");
          return;
        }
        addGrpcMethodsToCollection(
          requestTargetCollectionId,
          methods,
          compiled,
          requestTargetFolderId,
          requestGrpcSkipExistingDraft,
          true,
        );
        setRequestNameDialogOpen(false);
        setRequestTargetCollectionId("");
        setRequestTargetFolderId(null);
        setRequestLocationEditable(false);
        setRequestGrpcLibraryIdDraft("");
        setRequestGrpcVersionIdDraft("");
        setRequestGrpcMethodKeyDraft("");
        setRequestGrpcBatchMethodKeysDraft([]);
        setRequestGrpcSelectionModeDraft("single");
        setRequestGrpcSkipExistingDraft(true);
        return;
      }
      const method = compiled?.loaded.methods.find((item) => methodKey(item) === requestGrpcMethodKeyDraft);
      if (!compiled || !method) {
        showToast("Select a global proto schema, revision, and method.", "warning");
        return;
      }
      if (requestTargetCollectionId === NEW_SCHEMA_COLLECTION_TARGET) {
        addGrpcMethodsToCollection(
          requestTargetCollectionId,
          [method],
          compiled,
          requestTargetFolderId,
          false,
          true,
        );
      } else {
        addCollectionRequest(requestTargetCollectionId, "grpc", {
          name,
          url: draftEffectiveBaseUrl,
          grpcMethodKey: methodKey(method),
          grpc: createPinnedGrpcBinding(compiled.library, compiled.version, method),
          body: JSON.stringify(generateExampleFromType(compiled.loaded.root, method.requestType), null, 2),
          headers: [],
          parentId: requestTargetFolderId,
        });
      }
    } else {
      addCollectionRequest(requestTargetCollectionId, requestKindDraft, {
        name,
        method: requestKindDraft === "rest" ? "GET" : undefined,
        url: requestKindDraft === "rest" ? "http://127.0.0.1:3000" : undefined,
        body: requestKindDraft === "rest" ? "" : undefined,
        restBodyType: requestKindDraft === "rest" ? "none" : undefined,
        restAuth: requestKindDraft === "rest" ? { type: "none" } : undefined,
        parentId: requestTargetFolderId,
        mockResponse:
          requestKindDraft === "websocket" ? defaultWebSocketMockResponse(name) : defaultRestMockResponse(name),
      });
    }
    setRequestNameDialogOpen(false);
    setRequestTargetCollectionId("");
    setRequestTargetFolderId(null);
    setRequestLocationEditable(false);
    setRequestGrpcLibraryIdDraft("");
    setRequestGrpcVersionIdDraft("");
    setRequestGrpcMethodKeyDraft("");
    setRequestGrpcBatchMethodKeysDraft([]);
    setRequestGrpcSelectionModeDraft("single");
    setRequestGrpcSkipExistingDraft(true);
  }

  function confirmAddCollection() {
    const name = collectionNameDraft.trim();
    if (!name) {
      showToast("Collection name is required.", "warning");
      return;
    }
    const now = new Date().toISOString();
    const collection: ApiCollection = {
      id: createId(),
      name,
      folders: [],
      requests: [],
      createdAt: now,
      updatedAt: now,
    };
    setCollections((current) => [collection, ...current]);
    setCollectionDialogOpen(false);
    showToast("Collection added.", "success");
  }

  function removeCollection(collectionId: string) {
    const collection = collections.find((item) => item.id === collectionId);
    if (!collection) return;

    const removedRequestIds = new Set(collection.requests.map((request) => request.id));
    const belongsToCollection = (session: RequestSession) =>
      removedRequestIds.has(session.sourceRequestId ?? session.methodKey);

    const nextCollections = collections.filter((item) => item.id !== collectionId);
    const nextSessions = requestSessions.filter((session) => !belongsToCollection(session));
    const removedSessions = requestSessions.filter(belongsToCollection);
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
    const activeViewWasRemoved = activeSessionWasRemoved || activeCollectionRequestWasRemoved;
    const replacement = activeViewWasRemoved ? (nextSessions[0] ?? null) : null;
    const nextActiveRequestId = activeViewWasRemoved ? (replacement?.id ?? "") : activeRequestId;

    setCollections(nextCollections);
    setRequestSessions(nextSessions);
    persistProjectSnapshotNow({
      ...getProjectSnapshot(),
      updatedAt: new Date().toISOString(),
      collections: nextCollections,
      protoLibraries,
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

  function renameCollection(collectionId: string, proposedName: string) {
    const collection = collections.find((item) => item.id === collectionId);
    if (!collection) return;
    const nextName = proposedName.trim();
    if (!nextName) {
      showToast("Collection name is required.", "warning");
      return;
    }
    if (nextName === collection.name) return;
    const requestIds = new Set(collection.requests.map((request) => request.id));
    setCollections((current) =>
      current.map((item) =>
        item.id === collectionId ? { ...item, name: nextName, updatedAt: new Date().toISOString() } : item,
      ),
    );
    setRequestSessions((current) =>
      current.map((session) =>
        requestIds.has(session.sourceRequestId ?? session.methodKey)
          ? { ...session, serviceName: nextName, updatedAt: new Date().toISOString() }
          : session,
      ),
    );
    showToast("Collection renamed.", "success");
  }

  function renameCollectionRequest(collectionId: string, requestId: string, proposedName: string) {
    const collection = collections.find((item) => item.id === collectionId);
    const request = collection?.requests.find((item) => item.id === requestId);
    if (!collection || !request) return;
    const nextName = proposedName.trim();
    if (!nextName) {
      showToast("Request name is required.", "warning");
      return;
    }
    if (nextName === request.name) return;
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
        session.methodKey === requestId || session.sourceRequestId === requestId
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
    const belongsToRequest = (session: RequestSession) =>
      session.methodKey === requestId || session.sourceRequestId === requestId;

    const nextCollections = collections.map((item) =>
      item.id === collectionId
        ? {
            ...item,
            requests: item.requests.filter((candidate) => candidate.id !== requestId),
            updatedAt: new Date().toISOString(),
          }
        : item,
    );
    const removedSessions = requestSessions.filter(belongsToRequest);
    const removedSessionIds = new Set(removedSessions.map((session) => session.id));
    const nextSessions = requestSessions.filter((session) => !belongsToRequest(session));

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
      activeCollectionRequestId === requestId;
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
    const defaultName = kind === "grpc" ? "gRPC Request" : kind === "rest" ? "GET Request" : "WebSocket Request";
    const defaultUrl =
      kind === "grpc" ? draftEffectiveBaseUrl : kind === "rest" ? "http://127.0.0.1:3000" : "ws://localhost:8080";
    return {
      id: createId(),
      collectionId,
      parentId: overrides.parentId ?? null,
      order:
        overrides.order ??
        nextCollectionSiblingOrder(
          collections.find((collection) => collection.id === collectionId) ?? {
            id: collectionId,
            name: "Collection",
            folders: [],
            requests: [],
            createdAt: now,
            updatedAt: now,
          },
          overrides.parentId ?? null,
        ),
      name: overrides.name ?? defaultName,
      kind,
      method: overrides.method ?? (kind === "rest" ? "GET" : undefined),
      url: overrides.url ?? defaultUrl,
      grpcMethodKey: overrides.grpcMethodKey,
      grpc: overrides.grpc,
      body: overrides.body ?? (kind === "grpc" ? "{}" : ""),
      headers: overrides.headers ?? [],
      restParams: overrides.restParams ?? [],
      restPathParams: overrides.restPathParams ?? [],
      restAuth: overrides.restAuth ?? (kind === "rest" ? { type: "none" } : undefined),
      restBodyType: overrides.restBodyType ?? (kind === "rest" ? "none" : undefined),
      environmentKey: overrides.environmentKey ?? activeEnvironmentKey,
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
      folders: [],
      requests: [],
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
    const nextCollection = {
      ...(existingCollection ?? fallbackCollection),
      requests: [...(existingCollection?.requests ?? []), request],
      updatedAt: new Date().toISOString(),
    };
    setCollections((current) =>
      current.map((collection) => (collection.id === collectionId ? nextCollection : collection)),
    );
    selectCollectionRequest(nextCollection, request);
    showToast(`${request.name} added.`, "success");
  }

  function createCollectionFolder(collectionId: string, parentId: string | null = null): CollectionFolder | null {
    const collection = collections.find((item) => item.id === collectionId);
    if (!collection) return null;
    const siblingNames = new Set(
      collection.folders.filter((folder) => folder.parentId === parentId).map((folder) => folder.name.toLowerCase()),
    );
    let index = 1;
    let name = "New Folder";
    while (siblingNames.has(name.toLowerCase())) {
      index += 1;
      name = `New Folder ${index}`;
    }
    const folder = createFolderEntity(collection, parentId, name);
    setCollections((current) =>
      current.map((item) =>
        item.id === collectionId ? { ...item, folders: [...item.folders, folder], updatedAt: folder.updatedAt } : item,
      ),
    );
    showToast(`${folder.name} added.`, "success");
    return folder;
  }

  function renameCollectionFolder(collectionId: string, folderId: string, proposedName: string) {
    const nextName = proposedName.trim();
    if (!nextName) {
      showToast("Folder name is required.", "warning");
      return;
    }
    const now = new Date().toISOString();
    setCollections((current) =>
      current.map((collection) =>
        collection.id === collectionId
          ? {
              ...collection,
              folders: collection.folders.map((folder) =>
                folder.id === folderId ? { ...folder, name: nextName, updatedAt: now } : folder,
              ),
              updatedAt: now,
            }
          : collection,
      ),
    );
    showToast("Folder renamed.", "success");
  }

  function removeCollectionFolder(collectionId: string, folderId: string) {
    const collection = collections.find((item) => item.id === collectionId);
    if (!collection) return;
    const result = deleteCollectionFolder(collection, folderId);
    const removedIds = new Set(result.removedRequestIds);
    const removedSessions = requestSessions.filter(
      (session) =>
        removedIds.has(session.methodKey) ||
        Boolean(session.sourceRequestId && removedIds.has(session.sourceRequestId)),
    );
    const removedSessionIds = new Set(removedSessions.map((session) => session.id));
    removedSessions.forEach((session) => {
      requestRunner.cancelRequest(session.id);
      if (wsClientRef.current?.sessionId === session.id) closeManualWebSocketClient("Folder deleted");
    });
    setCollections((current) => current.map((item) => (item.id === collectionId ? result.collection : item)));
    setRequestSessions((current) => current.filter((session) => !removedSessionIds.has(session.id)));
    setWsMockServer((current) => {
      const selectedScenarioIds = { ...current.selectedScenarioIds };
      for (const requestId of removedIds) delete selectedScenarioIds[requestId];
      return {
        ...current,
        selectedScenarioIds,
        scenarios: current.scenarios.filter(
          (scenario) => !removedIds.has(scenario.requestId ?? "") && !removedIds.has(scenario.id),
        ),
        updatedAt: new Date().toISOString(),
      };
    });
    setRestMockServer((current) => ({
      ...current,
      scenarios: current.scenarios.filter(
        (scenario) => !removedIds.has(scenario.requestId ?? "") && !removedIds.has(scenario.id),
      ),
      updatedAt: new Date().toISOString(),
    }));
    if (activeCollectionRequestId && removedIds.has(activeCollectionRequestId)) {
      const replacement = requestSessions.find((session) => !removedSessionIds.has(session.id)) ?? null;
      if (replacement) queueMicrotask(() => activateRequestSession(replacement));
      else queueMicrotask(clearActiveView);
    }
    showToast(`Folder deleted with ${removedIds.size} request${removedIds.size === 1 ? "" : "s"}.`, "success");
  }

  function moveCollectionTreeNode(source: CollectionNodeRef, target: CollectionDropTarget) {
    const sourceCollection = collections.find((collection) => collection.id === source.collectionId);
    const movedRequestIds = new Set(
      source.type === "request"
        ? [source.nodeId]
        : sourceCollection
          ? getCollectionFolderRequestIds(sourceCollection, source.nodeId)
          : [],
    );
    const result = moveCollectionNode(collections, source, target);
    if (!result.ok) {
      showToast(result.error, "warning");
      return false;
    }

    const nextCollections = result.collections;

    const targetCollection = nextCollections.find((collection) => collection.id === target.collectionId);
    setCollections(nextCollections);
    if (targetCollection) {
      const requestById = new Map(targetCollection.requests.map((request) => [request.id, request] as const));
      setRequestSessions((current) =>
        current.map((session) => {
          const requestId = session.sourceRequestId ?? session.methodKey;
          const movedRequest = movedRequestIds.has(requestId) ? requestById.get(requestId) : undefined;
          return movedRequest
            ? {
                ...session,
                serviceName: targetCollection.name,
                grpc: movedRequest.grpc,
                updatedAt: new Date().toISOString(),
              }
            : session;
        }),
      );
    }
    showToast(
      source.collectionId === target.collectionId
        ? "Collection item moved."
        : "Collection item moved. Its global proto binding was preserved.",
      "success",
    );
    return true;
  }

  function importGrpcRequestIntoCollection(collectionId: string) {
    pendingCollectionImportRef.current = collectionId;
    protoInputRef.current?.click();
  }

  function saveGrpcMethodToCollection(
    collectionId: string,
    method: RpcMethodInfo,
    parentId: string | null = null,
    requestName?: string,
  ) {
    if (!loaded) {
      showToast("Load the proto before saving its method to a collection.", "warning");
      return;
    }
    const activeProto = findProtoVersion(protoLibraries, activeProtoLibraryId, activeProtoVersionId);
    const library = activeProto?.library;
    const version = activeProto?.version;
    addCollectionRequest(collectionId, "grpc", {
      name:
        requestName?.trim() ||
        uniqueCollectionRequestName(
          method.methodName,
          collections.find((item) => item.id === collectionId)?.requests.map((request) => request.name) ?? [],
        ),
      url: draftEffectiveBaseUrl,
      grpcMethodKey: methodKey(method),
      grpc: library && version ? createPinnedGrpcBinding(library, version, method) : undefined,
      body: JSON.stringify(generateExampleFromType(loaded.root, method.requestType), null, 2),
      headers: [],
      parentId,
    });
  }

  function createCollectionRequestSession(collection: ApiCollection, request: ApiCollectionRequest): RequestSession {
    const now = new Date().toISOString();
    const mode: TransportMode =
      request.kind === "websocket" ? "websocket" : request.kind === "rest" ? "rest" : "grpc-web";
    return {
      id: createId(),
      methodKey: request.id,
      sourceRequestId: request.id,
      grpc: request.grpc,
      title: request.name,
      serviceName: collection.name,
      requestJson: normalizeEditableText(request.body, request.kind === "grpc" ? "{}" : ""),
      metadata: request.headers.length ? request.headers.map((item) => ({ ...item })) : [],
      transportMode: mode,
      requestKind: request.kind,
      requestUrl: request.url,
      httpMethod: request.method,
      baseUrl: request.url,
      nativeTarget: activeNativeTarget,
      environmentKey: request.environmentKey ?? activeEnvironmentKey,
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
    if (request.kind === "grpc" && request.grpc) {
      const compiled = protoRuntimeRegistry.resolveVersion(request.grpc.libraryId, request.grpc.versionId);
      const resolved = compiled?.loaded.methods.find((method) => methodKey(method) === request.grpc?.methodFullName);
      if (compiled && resolved) {
        setActiveProtoLibraryId(compiled.library.id);
        setActiveProtoVersionId(compiled.version.id);
        setLoaded(compiled.loaded);
      }
    }
    const existing = findReusableCollectionRequestSession(requestSessions, request);
    const session = existing
      ? {
          ...existing,
          methodKey: request.id,
          sourceRequestId: request.id,
          requestKind: request.kind,
          grpc: request.grpc,
          title: request.name,
          serviceName: collection.name,
          requestUrl: request.url,
          httpMethod: request.method,
          updatedAt: new Date().toISOString(),
        }
      : createCollectionRequestSession(collection, request);
    upsertRequestSessionPreservingOrder(session);
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
    createCollectionFolder,
    renameCollectionFolder,
    removeCollectionFolder,
    moveCollectionTreeNode,
    createCollectionRequest,
    addCollectionRequest,
    importGrpcRequestIntoCollection,
    saveGrpcMethodToCollection,
    openGrpcMethodRequestDialog,
    openGrpcMethodsRequestDialog,
    createCollectionRequestSession,
    selectCollectionRequest,
    upsertRequestSessionPreservingOrder,
  };
}
