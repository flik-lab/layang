"use client";

import type {
  ApiCollection,
  ApiCollectionRequest,
  DocResultSnapshot,
  EnvironmentConfig,
  MethodDoc,
  RequestSession,
  MockScenario,
  SavedExample,
} from "../../shared/workbench-types";
import type { LoadedProto, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import type { ProtoRuntimeRegistry } from "@/lib/proto-runtime-registry";
import { savedExampleAssertionJson } from "../../shared/entity-utils";
import { createPinnedGrpcBinding, findProtoVersion, grpcBindingIdentity } from "../proto-library/proto-library-domain";
import type { ProtoLibrary } from "../proto-library/proto-library-types";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type CollectionNamedRequest = ApiCollectionRequest & { collectionName?: string };

type ActionContext = Record<string, any> & {
  collections: ApiCollection[];
  currentExamples: SavedExample[];
  examples: SavedExample[];
  setExamples: StateSetter<SavedExample[]>;
  methodDocs: MethodDoc[];
  setMethodDocs: StateSetter<MethodDoc[]>;
  docResults: DocResultSnapshot[];
  setDocResults: StateSetter<DocResultSnapshot[]>;
  requestSessions: RequestSession[];
  loaded: LoadedProto | null;
  protoFiles: ProtoSourceFile[];
  allMockScenarios: MockScenario[];
  currentMockScenarios: MockScenario[];
  metadata: MetadataPair[];
  environments: EnvironmentConfig[];
  selectedMethod: RpcMethodInfo | null;
  activeCollectionRequest?: CollectionNamedRequest | null;
  protoLibraries: ProtoLibrary[];
  activeProtoLibraryId: string;
  activeProtoVersionId: string;
  protoRuntimeRegistry: ProtoRuntimeRegistry;
  activateRequestSession: (session: RequestSession) => void;
};

export function useDocsActions(ctx: ActionContext) {
  const {
    activeBaseUrl,
    activeProtoLibraryId,
    activeProtoVersionId,
    activeCollectionRequest,
    activeDocsResult,
    activeExampleKey,
    activeNativeTarget,
    activateRequestSession,
    activeTransportMode,
    allMockScenarios,
    assertionJson,
    buildRestRequestUrl,
    collections,
    compactGrpcResultForStorage,
    createCollectionRequestSession,
    createId,
    createRequestSession,
    currentExamples,
    currentMockScenarios,
    docResults,
    downloadTextFile,
    environments,
    examples,
    exampleInputRef,
    findRestRequestForDocKey,
    findWebSocketRequestForDocKey,
    isSavedExample,
    latestResultByMethod,
    lastResult,
    loaded,
    mergeExamples,
    metadata,
    methodKey,
    parsedMockConfig,
    patchActiveCollectionRequest,
    previewUrl,
    protoFiles,
    protoLibraries,
    protoRuntimeRegistry,
    publishedDocs,
    renderMethodPublicationMarkdown,
    renderPublicDocsMarkdown,
    renderRestDocsMarkdown,
    renderWebSocketDocsMarkdown,
    renderWorkspaceProtoDocsHtml,
    renderWorkspaceProtoDocsMarkdown,
    requestJson,
    requestSessions,
    restDocKey,
    savedExampleKey,
    selectedMethod,
    setDocResults,
    setDocsPreview,
    setExamples,
    setMethodDocs,
    setRequestTab,
    setSideSection,
    setSidebarOpen,
    showToast,
    slugify,
    targetDraft,
    timestampForFile,
    toErrorMessage,
    upsertMethodDoc,
    upsertRequestSessionPreservingOrder,
    webSocketDocKey,
  } = ctx;

  function activeGrpcBinding() {
    if (!selectedMethod) return undefined;
    const activeProto = findProtoVersion(protoLibraries, activeProtoLibraryId, activeProtoVersionId);
    return activeProto ? createPinnedGrpcBinding(activeProto.library, activeProto.version, selectedMethod) : undefined;
  }

  function activeGrpcIdentity(): string {
    return grpcBindingIdentity(activeGrpcBinding(), selectedMethod ? methodKey(selectedMethod) : "");
  }

  function saveCurrentExample() {
    if (!selectedMethod && !activeCollectionRequest) return;
    const serviceName = selectedMethod?.serviceName ?? activeCollectionRequest?.collectionName ?? "Collection";
    const methodName = selectedMethod?.methodName ?? activeCollectionRequest?.name ?? "WebSocket Request";
    const example: SavedExample = {
      id: createId(),
      name: `${methodName} example ${currentExamples.length + 1}`,
      serviceName,
      methodName,
      requestJson,
      metadata,
      expectedJson: assertionJson,
      expectedStatus: "",
      expectedTrailers: [],
      assertions: "",
      tags: [],
      enabled: true,
      documentation: { summary: "", whenThisHappens: "", explanation: "", notes: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setExamples((current) => [example, ...current]);
    setRequestTab("examples");
  }

  function exportCurrentMethodExamples() {
    if ((!selectedMethod && !activeCollectionRequest) || currentExamples.length === 0) return;
    const serviceName = selectedMethod?.serviceName ?? activeCollectionRequest?.collectionName ?? "Collection";
    const methodName = selectedMethod?.methodName ?? activeCollectionRequest?.name ?? "WebSocket Request";
    downloadTextFile(
      `layang-examples-${slugify(methodName)}-${timestampForFile()}.json`,
      JSON.stringify(
        {
          version: 1,
          type: "layang-examples",
          method: { serviceName, methodName },
          examples: currentExamples,
        },
        null,
        2,
      ),
      "application/json",
    );
  }

  async function importExampleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
      const incoming = Array.isArray(record.examples)
        ? record.examples.filter(isSavedExample)
        : Array.isArray(parsed)
          ? parsed.filter(isSavedExample)
          : [];
      if (incoming.length === 0) {
        showToast("No valid examples found in that file.", "warning");
        return;
      }
      setExamples((current) => mergeExamples(current, incoming));
      const matching = activeExampleKey
        ? incoming.find((example) => savedExampleKey(example) === activeExampleKey)
        : incoming[0];
      if (matching) loadExample(matching);
      showToast(`${incoming.length} example(s) loaded.`, "success");
    } catch (err) {
      showToast(toErrorMessage(err), "error");
    } finally {
      if (exampleInputRef.current) exampleInputRef.current.value = "";
    }
  }

  function saveCurrentResultForDocs() {
    if (!selectedMethod) {
      if (activeCollectionRequest?.kind === "websocket") {
        showToast("Open the WebSocket Docs tab to preview or export docs with the latest response.", "info");
      }
      return;
    }
    const sourceResult = lastResult ?? activeDocsResult;
    if (!sourceResult) {
      showToast("Run this method before saving a result for docs.", "warning");
      return;
    }
    const key = methodKey(selectedMethod);
    const snapshot: DocResultSnapshot = {
      methodKey: key,
      grpc: activeGrpcBinding(),
      serviceName: selectedMethod.serviceName,
      methodName: selectedMethod.methodName,
      result: compactGrpcResultForStorage(sourceResult),
      savedAt: new Date().toISOString(),
    };
    const identity = grpcBindingIdentity(snapshot.grpc, key);
    setDocResults((current) =>
      [snapshot, ...current.filter((item) => grpcBindingIdentity(item.grpc, item.methodKey) !== identity)].slice(
        0,
        500,
      ),
    );
    showToast("Latest response saved. Enable Response example in Docs settings to include it.", "success");
  }

  function publishCurrentMethodDoc() {
    if (!selectedMethod) return;
    const key = methodKey(selectedMethod);
    setMethodDocs((current) =>
      upsertMethodDoc(current, {
        methodKey: key,
        grpc: activeGrpcBinding(),
        serviceName: selectedMethod.serviceName,
        methodName: selectedMethod.methodName,
        published: true,
        updatedAt: new Date().toISOString(),
      }),
    );
    setSideSection("docs");
    setSidebarOpen(true);
    showToast("Generated method docs published to the Docs sidebar.", "success");
  }

  function unpublishCurrentMethodDoc() {
    if (!selectedMethod) return;
    const identity = activeGrpcIdentity();
    setMethodDocs((current) =>
      current.map((doc) =>
        grpcBindingIdentity(doc.grpc, doc.methodKey) === identity
          ? { ...doc, published: false, updatedAt: new Date().toISOString() }
          : doc,
      ),
    );
    showToast("Method docs unpublished.", "success");
  }

  function deleteCurrentMethodDoc() {
    if (!selectedMethod) return;
    const identity = activeGrpcIdentity();
    setMethodDocs((current) => current.filter((doc) => grpcBindingIdentity(doc.grpc, doc.methodKey) !== identity));
    setDocResults((current) => current.filter((item) => grpcBindingIdentity(item.grpc, item.methodKey) !== identity));
    showToast("Generated docs entry removed for this method.", "success");
  }

  function buildActiveWebSocketDocsMarkdown() {
    return renderWebSocketDocsMarkdown({
      collectionRequest: activeCollectionRequest,
      url: targetDraft,
      message: requestJson,
      examples: currentExamples,
      latestResult: lastResult,
    });
  }

  function publishCurrentWebSocketDoc() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket") return;
    const key = webSocketDocKey(activeCollectionRequest);
    setMethodDocs((current) =>
      upsertMethodDoc(current, {
        methodKey: key,
        serviceName: activeCollectionRequest.collectionName ?? "WebSocket Collection",
        methodName: activeCollectionRequest.name,
        published: true,
        updatedAt: new Date().toISOString(),
        generatedMarkdown: buildActiveWebSocketDocsMarkdown(),
      }),
    );
    setSideSection("docs");
    setSidebarOpen(true);
    showToast("WebSocket docs published to the Docs sidebar.", "success");
  }

  function unpublishCurrentWebSocketDoc() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket") return;
    const key = webSocketDocKey(activeCollectionRequest);
    setMethodDocs((current) =>
      current.map((doc) =>
        doc.methodKey === key ? { ...doc, published: false, updatedAt: new Date().toISOString() } : doc,
      ),
    );
    showToast("WebSocket docs unpublished.", "success");
  }

  function previewCurrentWebSocketDoc() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket") return;
    setDocsPreview({
      title: `${activeCollectionRequest.collectionName ?? "Collection"}/${activeCollectionRequest.name}`,
      markdown: buildActiveWebSocketDocsMarkdown(),
    });
  }

  function buildActiveRestDocsMarkdown() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "rest") return "";
    return renderRestDocsMarkdown({
      collectionRequest: activeCollectionRequest,
      url: previewUrl,
      latestResult: lastResult,
      examples: currentExamples,
    });
  }

  function publishCurrentRestDoc() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "rest") return;
    const key = restDocKey(activeCollectionRequest);
    setMethodDocs((current) =>
      upsertMethodDoc(current, {
        methodKey: key,
        serviceName: activeCollectionRequest.collectionName ?? "REST Collection",
        methodName: activeCollectionRequest.name,
        published: true,
        updatedAt: new Date().toISOString(),
        generatedMarkdown: buildActiveRestDocsMarkdown(),
      }),
    );
    setSideSection("docs");
    setSidebarOpen(true);
    showToast("REST docs published to the Docs sidebar.", "success");
  }

  function unpublishCurrentRestDoc() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "rest") return;
    const key = restDocKey(activeCollectionRequest);
    setMethodDocs((current) =>
      current.map((doc) =>
        doc.methodKey === key ? { ...doc, published: false, updatedAt: new Date().toISOString() } : doc,
      ),
    );
    showToast("REST docs unpublished.", "success");
  }

  function previewCurrentRestDoc() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "rest") return;
    setDocsPreview({
      title: `${activeCollectionRequest.collectionName ?? "Collection"}/${activeCollectionRequest.name}`,
      markdown: buildActiveRestDocsMarkdown(),
    });
  }

  function previewCurrentMethodDoc() {
    if (!selectedMethod) return;
    setDocsPreview({
      title: `${selectedMethod.serviceName}/${selectedMethod.methodName}`,
      markdown: renderMethodPublicationMarkdown({
        method: selectedMethod,
        examples: currentExamples,
        protoFiles,
        latestResult: activeDocsResult,
        mockScenarios: currentMockScenarios,
        currentRequestJson: requestJson,
        currentMetadata: metadata,
      }),
    });
  }

  function exportPublicDocs() {
    const markdown = renderPublicDocsMarkdown(publishedDocs);
    downloadTextFile(`layang-public-docs-${timestampForFile()}.md`, markdown, "text/markdown");
  }

  function exportGeneratedProtoDocsMarkdown() {
    if (!loaded || loaded.methods.length === 0) {
      showToast("Open a gRPC request from a collection before generating docs.", "warning");
      return;
    }
    const markdown = renderWorkspaceProtoDocsMarkdown({
      methods: loaded.methods,
      protoFiles,
      examples,
      docResults,
      requestSessions,
      mockBundle: parsedMockConfig.ok ? parsedMockConfig.bundle : null,
      environments,
    });
    downloadTextFile(`layang-proto-docs-${timestampForFile()}.md`, markdown, "text/markdown");
  }

  function exportGeneratedProtoDocsHtml() {
    if (!loaded || loaded.methods.length === 0) {
      showToast("Open a gRPC request from a collection before generating docs.", "warning");
      return;
    }
    const markdown = renderWorkspaceProtoDocsMarkdown({
      methods: loaded.methods,
      protoFiles,
      examples,
      docResults,
      requestSessions,
      mockBundle: parsedMockConfig.ok ? parsedMockConfig.bundle : null,
      environments,
    });
    downloadTextFile(
      `layang-proto-docs-${timestampForFile()}.html`,
      renderWorkspaceProtoDocsHtml(markdown),
      "text/html",
    );
  }

  function openDocFromSidebar(doc: MethodDoc) {
    if (doc.methodKey.startsWith("ws:")) {
      const request = findWebSocketRequestForDocKey(collections, doc.methodKey);
      const session = request ? requestSessions.find((item) => item.methodKey === request.id) : null;
      const key = request
        ? `${request.collectionName ?? "Collection"}/${request.name}`
        : `${doc.serviceName}/${doc.methodName}`;
      const requestExamples = examples.filter((example) => savedExampleKey(example) === key);
      setDocsPreview({
        title: key,
        markdown: request
          ? renderWebSocketDocsMarkdown({
              collectionRequest: request,
              url: session?.baseUrl || request.url,
              message: session?.requestJson || request.body || "",
              examples: requestExamples,
              latestResult: session?.lastResult ?? null,
            })
          : doc.generatedMarkdown || "# WebSocket docs\n\nRequest not found in this workspace.",
      });
      return;
    }

    if (doc.methodKey.startsWith("rest:")) {
      const request = findRestRequestForDocKey(collections, doc.methodKey);
      const session = request ? requestSessions.find((item) => item.methodKey === request.id) : null;
      const key = request
        ? `${request.collectionName ?? "Collection"}/${request.name}`
        : `${doc.serviceName}/${doc.methodName}`;
      const requestExamples = examples.filter((example) => savedExampleKey(example) === key);
      setDocsPreview({
        title: key,
        markdown: request
          ? renderRestDocsMarkdown({
              collectionRequest: request,
              url: session?.requestUrl || buildRestRequestUrl(request, session?.baseUrl || request.url),
              latestResult: session?.lastResult ?? null,
              examples: requestExamples,
            })
          : doc.generatedMarkdown || "# REST docs\n\nRequest not found in this workspace.",
      });
      return;
    }

    const compiled = doc.grpc ? protoRuntimeRegistry.resolveVersion(doc.grpc.libraryId, doc.grpc.versionId) : null;
    const docLoaded = compiled?.loaded ?? loaded;
    const found = docLoaded?.methods.find(
      (method) => methodKey(method) === (doc.grpc?.methodFullName ?? doc.methodKey),
    );
    if (!found) {
      setDocsPreview({
        title: `${doc.serviceName}/${doc.methodName}`,
        markdown:
          "# Unresolved proto reference\n\nThe documented method is pinned to a proto library or version that is no longer available.",
      });
      return;
    }
    const key = methodKey(found);
    const identity = grpcBindingIdentity(doc.grpc, key);
    const methodExamples = examples.filter((example) => savedExampleKey(example) === key);
    const methodMocks = allMockScenarios.filter(
      (scenario) => scenario.service === found.serviceName && scenario.method === found.methodName,
    );
    const session = requestSessions.find(
      (item) => grpcBindingIdentity(item.grpc, item.methodKey) === identity || item.methodKey === key,
    );
    const savedResult = [...docResults]
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .find((item) => grpcBindingIdentity(item.grpc, item.methodKey) === identity)?.result;
    setDocsPreview({
      title: `${found.serviceName}/${found.methodName}${compiled ? ` · ${compiled.version.version}` : ""}`,
      markdown: renderMethodPublicationMarkdown({
        method: found,
        examples: methodExamples,
        protoFiles: compiled?.version.files ?? protoFiles,
        latestResult: savedResult ?? latestResultByMethod.get(key) ?? null,
        mockScenarios: methodMocks,
        currentRequestJson: session?.requestJson,
        currentMetadata: session?.metadata,
      }),
    });
  }

  function unpublishMethodDoc(target: MethodDoc | string) {
    const identity = typeof target === "string" ? target : grpcBindingIdentity(target.grpc, target.methodKey);
    setMethodDocs((current) =>
      current.map((doc) =>
        grpcBindingIdentity(doc.grpc, doc.methodKey) === identity ||
        (typeof target === "string" && doc.methodKey === target)
          ? { ...doc, published: false, updatedAt: new Date().toISOString() }
          : doc,
      ),
    );
    showToast("Method docs unpublished.", "success");
  }

  function loadExample(example: SavedExample) {
    const found = loaded?.methods.find(
      (method) => method.serviceName === example.serviceName && method.methodName === example.methodName,
    );
    if (found && loaded) {
      const key = methodKey(found);
      const existing = requestSessions.find((session) => session.methodKey === key);
      if (existing?.running) {
        showToast(
          `${found.methodName} is running in ${existing.title}. Stop it before loading another example.`,
          "warning",
        );
        return;
      }
      const session: RequestSession = existing
        ? {
            ...existing,
            requestJson: example.requestJson,
            metadata: example.metadata.map((item) => ({ ...item })),
            assertionJson: savedExampleAssertionJson(example),
            updatedAt: new Date().toISOString(),
          }
        : createRequestSession(loaded.root, found, {
            requestJson: example.requestJson,
            metadata: example.metadata,
            transportMode: activeTransportMode,
            baseUrl: activeBaseUrl,
            nativeTarget: activeNativeTarget,
            assertionJson: savedExampleAssertionJson(example),
          });

      upsertRequestSessionPreservingOrder(session);
      activateRequestSession(session);
      setRequestTab("body");
      return;
    }

    for (const collection of collections) {
      const request = collection.requests.find(
        (item) => collection.name === example.serviceName && item.name === example.methodName,
      );
      if (!request) continue;
      const existing = requestSessions.find((session) => session.methodKey === request.id);
      if (existing?.running) {
        showToast(
          `${request.name} is running in ${existing.title}. Stop it before loading another example.`,
          "warning",
        );
        return;
      }
      const session: RequestSession = existing
        ? {
            ...existing,
            requestJson: example.requestJson,
            metadata: example.metadata.map((item) => ({ ...item })),
            assertionJson: savedExampleAssertionJson(example),
            updatedAt: new Date().toISOString(),
          }
        : createCollectionRequestSession(collection, {
            ...request,
            body: example.requestJson,
            headers: example.metadata.map((item) => ({ ...item })),
          });
      upsertRequestSessionPreservingOrder(session);
      activateRequestSession(session);
      patchActiveCollectionRequest({ body: example.requestJson, headers: example.metadata });
      setRequestTab("body");
      return;
    }

    showToast("No matching gRPC method or WebSocket request found for that example.", "warning");
  }

  return {
    saveCurrentExample,
    exportCurrentMethodExamples,
    importExampleFile,
    saveCurrentResultForDocs,
    publishCurrentMethodDoc,
    unpublishCurrentMethodDoc,
    deleteCurrentMethodDoc,
    buildActiveWebSocketDocsMarkdown,
    publishCurrentWebSocketDoc,
    unpublishCurrentWebSocketDoc,
    previewCurrentWebSocketDoc,
    buildActiveRestDocsMarkdown,
    publishCurrentRestDoc,
    unpublishCurrentRestDoc,
    previewCurrentRestDoc,
    previewCurrentMethodDoc,
    exportPublicDocs,
    exportGeneratedProtoDocsMarkdown,
    exportGeneratedProtoDocsHtml,
    openDocFromSidebar,
    unpublishMethodDoc,
    loadExample,
  };
}
