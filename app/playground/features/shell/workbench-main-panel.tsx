"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { MetadataPair } from "@/lib/types";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import { MoreHoriz, WarningIcon } from "@/components/shadcn/icons";
import { methodKey } from "../../shared/rpc-method-utils";
import { uiCopy } from "../../shared/ui-copy";
import { MethodStatusIndicator } from "../../shared/components/method-status-indicator";
import { mockScenarioDisplayName, rpcMethodKindLabel } from "../mock-server/mock-scenario-ui";
import {
  GrpcMockScenarioActionsMenu,
  GrpcMockScenarioControls,
  GrpcMockScenarioManagerDialog,
} from "../mock-server/grpc-mock-scenario-controls";
import {
  buildDefaultMockScenario,
  ensureUniqueMockScenarioId,
  formatMockScenarioBundle,
  getMockMethodScenarioFile,
  parseMockScenarioText,
  saveMockScenarioForMethod,
  updateMockMethodScenarioFile,
} from "../mock-server/mock-scenario-model";
import {
  GrpcScenarioSourceDialog,
  ServicesWorkspace,
  type GrpcMockScenarioRow,
} from "../services/services-workspace";
import { SettingsWorkspace } from "../settings/settings-workspace";
import { ProtoSchemaWorkspace } from "../proto-registry/proto-schema-workspace";
import { GitSourceControlWorkspace } from "../git/git-source-control";
import { ExampleEditorDialog, type ExampleEditorTab } from "../examples/examples-panel";
import type {
  EnvironmentConfig,
  MockScenario,
  RequestSession,
  RequestTab,
  RestAuthConfig,
  RestBodyType,
  SavedExample,
} from "../../shared/workbench-types";

type ButtonClickEvent = ReactMouseEvent<HTMLButtonElement>;
type ElementClickEvent = ReactMouseEvent<HTMLElement>;
type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SelectInputChangeEvent = ChangeEvent<HTMLSelectElement>;
type TextInputKeyboardEvent = ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>;

type WorkbenchViewContext = Record<string, any>;
type RequestContextView = "request" | "mock" | "schema" | "settings" | "tool";

type GrpcBindingIssue = {
  title: string;
  detail: string;
  tone: "error" | "warning";
};

function grpcBindingIssue(status?: string | null): GrpcBindingIssue | null {
  switch (status) {
    case "library-missing":
      return { title: "Proto unavailable", detail: "The schema referenced by this request is no longer available in the workspace.", tone: "error" };
    case "version-missing":
      return { title: "Schema revision unavailable", detail: "The revision pinned to this request no longer exists or is no longer attached.", tone: "error" };
    case "method-missing":
      return { title: "RPC method unavailable", detail: "The selected schema revision no longer contains the RPC method saved on this request.", tone: "error" };
    case "method-signature-changed":
      return { title: "RPC signature changed", detail: "The saved request binding no longer matches the input or output signature in this schema revision.", tone: "error" };
    case "ambiguous-migration":
      return { title: "RPC binding needs review", detail: "More than one compatible RPC method was found, so Layang cannot safely choose one automatically.", tone: "warning" };
    case "body-review-required":
      return { title: "Request body needs review", detail: "The RPC binding was updated, but the request body may need a manual adjustment before it can run.", tone: "warning" };
    default:
      return null;
  }
}

export function WorkbenchMainPanel(props: { ctx: WorkbenchViewContext }) {
  const {
    Add,
    Alert,
    Api,
    Box,
    Button,
    Chip,
    ContentCopy,
    Delete,
    DesktopWindows,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Edit,
    ExamplesPanel,
    FeatureBenchmarkPanel,
    FeatureCodeTextField,
    FeatureJsonBlock,
    FeatureLatestResponseJsonViewer,
    FeatureMessageTable,
    UnifiedDocumentationPanel,
    FeatureProtoSourceBlock,
    FeatureSchemaTable,
    FormControl,
    IconButton,
    InputAdornment,
    KeyboardArrowUp,
    Language,
    ListItemText,
    Menu,
    MenuItem,
    PanelBottom,
    PanelRight,
    Paper,
    PlayArrow,
    RequestTabs,
    ResponseToolbar,
    ResponseWorkbenchTabs,
    RestMockPanel,
    RestPairEditor,
    Select,
    Search,
    Stack,
    Storage,
    Stream,
    TextField,
    Tooltip,
    Typography,
    UploadFile,
    WebSocketBenchmarkPanel,
    WebSocketMockPanel,
    WorkbenchTabs,
    activateRequestSession,
    activeCollectionRequest,
    activeRequestId,
    activeDocumentationSource,
    activeRequestDocumentationPage,
    standaloneDocumentationPage,
    activeEnvironmentKey,
    activeIsRest,
    activeIsWebSocket,
    activeRestMockResponseText,
    activeRestMockScenario,
    activeRestMockScenarios,
    activeRunning,
    activeSession,
    assertionResults,
    activeTransportMode,
    activeWebSocketMockResponseText,
    activeWebSocketMockScenario,
    activeWebSocketMockScenarios,
    addMetadataRow,
    addRestMockScenario,
    addRestMockScenarioPair,
    addRestPairRow,
    addWebSocketMockScenario,
    beginResponseResize,
    resizeResponseByKeyboard,
    benchmark,
    chooseEnvironment,
    clearActiveResponseStable,
    closeAllRequestSessions,
    closeOtherRequestSessions,
    closeRequestSession,
    clearResponseFilter,
    closeManualWebSocketClient,
    commitTargetDraft,
    copyActiveWebSocketMockResponse,
    copyPreviewUrl,
    currentExamples,
    examples,
    currentMockActiveScenario,
    currentMockScenarios,
    deferredResponseFilter,
    documentation,
    documentationPages,
    designSystem,
    downloadTextFile,
    envMenuAnchor,
    environments,
    events,
    exampleInputRef,
    exportCurrentBenchmark,
    exportCurrentMethodExamples,
    exportResponseStable,
    exportWebSocketBenchmark,
    featureEnvironmentLabel,
    featureEnvironmentShortLabel,
    featureGetEnvironmentTransportTarget,
    generateRandomRequestJson,
    generateRequestJsonFromSelectedScenario,
    handleMockScenarioSelectChange,
    fetchMockScenarioFilesFromWorkspace,
    openMockScenarioFolder,
    handleRequestJsonChange,
    handleResponseBodyScroll,
    handleResponseFilterChange,
    handleResponseTabChange,
    handleRestMockBindHostChange,
    handleRestMockPortChange,
    handleConnectWebSocket,
    handleSendWebSocketMessage,
    handleTargetDraftChange,
    handleTransportModeChange,
    handleWebSocketMockPortChange,
    isNativeBridgeAvailable,
    lastResult,
    latestResponsePayload,
    loadExample,
    messageEvents,
    metadata,
    methodTypeLabel,
    minResponseWidth,
    minResponseHeight,
    mockServer,
    mockServerStatus,
    setMockServer,
    setMockSelectedMethodKey,
    selectProtoLibraryVersion,
    openEnvironmentManager,
    openWorkspaceImporter,
    panelSx,
    prettifyRequestJson,
    previewUrl,
    protoPreview,
    protoLibraries,
    protoRuntimeRegistry,
    publishDocumentationPage,
    removeMetadataRow,
    removeRestMockScenarioPair,
    removeRestPairRow,
    requestFields,
    requestJson,
    requestResponseLayout,
    effectiveRequestResponseLayout,
    horizontalLayoutAvailable,
    requestRunner,
    requestSessions,
    requestTab,
    responseBodyRef,
    responseFields,
    responseFilter,
    responseSearchScope,
    pendingMessageCount,
    setPendingMessageCount,
    setAuthorizationMetadata,
    responseHeight,
    responseWidth,
    responseTab,
    reorderRequestSessions,
    restMethods,
    restMockServer,
    restMockStatus,
    runExample,
    runWebSocketBenchmark,
    saveCurrentEnvironment,
    saveCurrentExample,
    saveCurrentResultForDocsStable,
    saveDocumentationSource,
    openDocumentationRequest,
    scrollMessagesToTop,
    selectWebSocketMockScenario,
    selectedMethod,
    sendWebSocketMockOnce,
    setEnvMenuAnchor,
    setExamples,
    setRequestTab,
    setServiceProtocol,
    setServicesSection,
    setProtoPreview,
    setRestMockScenarioId,
    setSideSection,
    setSidebarOpen,
    sideSection,
    setWsBenchmarkIterations,
    shellLeft,
    cliPanelOpen,
    cliPanelHeight,
    showEmptyWorkbench,
    showMessageTopButton,
    startRestMockServer,
    startWebSocketMockServer,
    stopRestMockServer,
    stopWebSocketBenchmark,
    stopWebSocketMockServer,
    targetDraft,
    toggleRequestResponseLayout,
    updateActiveRestAuth,
    updateActiveRestBodyType,
    updateActiveRestMethod,
    updateActiveRestMockResponse,
    updateActiveRestMockScenario,
    updateActiveWebSocketMockResponse,
    updateActiveWebSocketMockScenario,
    updateMetadataRow,
    updateRestMockScenarioPair,
    updateRestPairRow,
    updateWebSocketSubprotocol,
    webSocketSubprotocolValue,
    wsBenchmarkIterations,
    wsBenchmarkResults,
    wsBenchmarkRunning,
    wsClientState,
    wsMockIntervalMs,
    wsMockLoop,
    wsMockMaxLoops,
    wsMockPath,
    wsMockPort,
    wsMockStatus,
    wsMockStreamOnConnect,
  } = props.ctx;

  const [exampleEditorState, setExampleEditorState] = useState<{ id: string; tab: ExampleEditorTab } | null>(null);
  const [responseFullscreen, setResponseFullscreen] = useState(false);
  const [responseCollapsed, setResponseCollapsed] = useState(false);
  const [requestMockSettingsAnchor, setRequestMockSettingsAnchor] = useState<HTMLElement | null>(null);
  const [requestMockMenuAnchor, setRequestMockMenuAnchor] = useState<HTMLElement | null>(null);
  const [requestToolsMenuAnchor, setRequestToolsMenuAnchor] = useState<HTMLElement | null>(null);
  const [transportMenuAnchor, setTransportMenuAnchor] = useState<HTMLElement | null>(null);
  const [requestUtilityDialog, setRequestUtilityDialog] = useState<"settings" | "examples" | "docs" | "benchmark" | null>(null);
  const [requestMockManagerOpen, setRequestMockManagerOpen] = useState(false);
  const [requestMockEditorScenarioId, setRequestMockEditorScenarioId] = useState("");
  const [requestMockEditorDirty, setRequestMockEditorDirty] = useState(false);
  const [lastRequestEditorTab, setLastRequestEditorTab] = useState<RequestTab>("body");
  const metadataRowIdsRef = useRef<string[]>([]);
  const metadataRowCounterRef = useRef(0);
  const metadataRowOwnerRef = useRef<string | null>(activeRequestId ?? null);

  if (metadataRowOwnerRef.current !== (activeRequestId ?? null)) {
    metadataRowOwnerRef.current = activeRequestId ?? null;
    metadataRowIdsRef.current = [];
  }
  while (metadataRowIdsRef.current.length < metadata.length) {
    metadataRowCounterRef.current += 1;
    metadataRowIdsRef.current.push(`metadata-row-${metadataRowCounterRef.current}`);
  }
  if (metadataRowIdsRef.current.length > metadata.length) {
    metadataRowIdsRef.current.length = metadata.length;
  }
  const metadataRows: Array<{ item: MetadataPair; index: number; rowId: string | undefined }> = (
    metadata as MetadataPair[]
  ).map((item, index) => ({
    item,
    index,
    rowId: metadataRowIdsRef.current[index],
  }));
  const handleAddMetadataRow = () => {
    metadataRowCounterRef.current += 1;
    metadataRowIdsRef.current.push(`metadata-row-${metadataRowCounterRef.current}`);
    addMetadataRow();
  };
  const handleRemoveMetadataRow = (index: number) => {
    metadataRowIdsRef.current.splice(index, 1);
    removeMetadataRow(index);
  };

  const allExamples: SavedExample[] = Array.isArray(examples) ? examples : currentExamples;
  const editingExample = exampleEditorState
    ? (allExamples.find((item: SavedExample) => item.id === exampleEditorState.id) ?? null)
    : null;
  const openExampleEditor = (example: SavedExample | string, tab: ExampleEditorTab = "general") => {
    const id = typeof example === "string" ? example : example.id;
    if (!allExamples.some((item: SavedExample) => item.id === id)) return;
    setExampleEditorState({ id, tab });
  };
  const saveEditedExample = (example: SavedExample) => {
    setExamples((current: SavedExample[]) => current.map((item) => (item.id === example.id ? example : item)));
    setExampleEditorState(null);
  };
  const duplicateExample = (example: SavedExample) => {
    const now = new Date().toISOString();
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `example-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const copy: SavedExample = {
      ...example,
      id,
      name: `${example.name} copy`,
      metadata: example.metadata.map((item) => ({ ...item })),
      expectedTrailers: example.expectedTrailers?.map((item) => ({ ...item })) ?? [],
      tags: [...(example.tags ?? [])],
      documentation: example.documentation
        ? { ...example.documentation, notes: [...example.documentation.notes] }
        : undefined,
      createdAt: now,
      updatedAt: now,
    };
    setExamples((current: SavedExample[]) => [copy, ...current]);
    setExampleEditorState({ id: copy.id, tab: "general" });
  };

  const previousMessageCountRef = useRef(messageEvents.length);
  const previousScrollHeightRef = useRef(0);
  useLayoutEffect(() => {
    const node = responseBodyRef.current;
    if (!node || responseTab !== "messages") {
      previousMessageCountRef.current = messageEvents.length;
      previousScrollHeightRef.current = node?.scrollHeight ?? 0;
      return;
    }
    const previousCount = previousMessageCountRef.current;
    const added = Math.max(0, messageEvents.length - previousCount);
    const wasFollowingLatest = node.scrollTop <= 16;
    const previousHeight = previousScrollHeightRef.current || node.scrollHeight;
    if (added > 0 && !wasFollowingLatest) {
      const heightDelta = node.scrollHeight - previousHeight;
      if (heightDelta > 0) node.scrollTop += heightDelta;
      setPendingMessageCount((current: number) => current + added);
    } else if (wasFollowingLatest) {
      setPendingMessageCount(0);
    }
    previousMessageCountRef.current = messageEvents.length;
    previousScrollHeightRef.current = node.scrollHeight;
  }, [messageEvents.length, responseBodyRef, responseTab, setPendingMessageCount]);

  const searchedMessageEvents = responseSearchScope === "latest" ? messageEvents.slice(-1) : messageEvents;
  const unsupportedRequestStreaming = Boolean(selectedMethod?.requestStream);
  const requestActionDisabled =
    (!selectedMethod && !activeCollectionRequest) ||
    (activeCollectionRequest?.kind === "grpc" && !selectedMethod) ||
    unsupportedRequestStreaming ||
    (activeTransportMode === "native-grpc" && !isNativeBridgeAvailable);
  const requestActionDisabledReason = unsupportedRequestStreaming
    ? selectedMethod?.responseStream
      ? "Bidirectional streaming is not supported by the request runner yet."
      : "Client streaming is not supported by the request runner yet."
    : activeTransportMode === "native-grpc" && !isNativeBridgeAvailable
      ? "Native gRPC is unavailable in browser mode. Switch to gRPC-Web or open the desktop application."
      : activeCollectionRequest?.kind === "grpc" && !selectedMethod
        ? "Select a valid proto service and method before invoking the request."
        : !selectedMethod && !activeCollectionRequest
          ? "Select or create a request first."
          : "";
  const activeGrpcBinding = activeCollectionRequest?.kind === "grpc" ? activeCollectionRequest.grpc ?? null : null;
  const activeGrpcLibrary = activeGrpcBinding
    ? protoLibraries.find((library: any) => library.id === activeGrpcBinding.libraryId) ?? null
    : null;
  const activeGrpcVersion = activeGrpcBinding && activeGrpcLibrary
    ? activeGrpcLibrary.versions.find((version: any) => version.id === activeGrpcBinding.versionId) ?? null
    : null;
  const explicitGrpcBindingIssue = grpcBindingIssue(activeGrpcBinding?.status);
  const activeGrpcBindingIssue: GrpcBindingIssue | null =
    activeCollectionRequest?.kind === "grpc" && !selectedMethod
      ? explicitGrpcBindingIssue ??
        (activeGrpcBinding
          ? {
              title: "Proto method unavailable",
              detail: "The saved gRPC binding cannot be resolved from the selected schema revision. Review the schema and bind the request to a valid method.",
              tone: "error",
            }
          : {
              title: "Proto binding missing",
              detail: "This gRPC request is not bound to a valid schema revision and RPC method yet.",
              tone: "warning",
            })
      : explicitGrpcBindingIssue;
  const openActiveGrpcSchema = () => {
    setSideSection("proto-schemas");
    setSidebarOpen(true);
    if (activeGrpcLibrary && activeGrpcVersion) {
      selectProtoLibraryVersion(activeGrpcLibrary.id, activeGrpcVersion.id);
    }
  };
  const authorizationValue =
    metadata.find((item: MetadataPair) => item.key.trim().toLowerCase() === "authorization")?.value ?? "";
  const responseSummary = activeRunning
    ? activeIsWebSocket
      ? `Connected · ${messageEvents.length} message${messageEvents.length === 1 ? "" : "s"}`
      : `Active · ${messageEvents.length} message${messageEvents.length === 1 ? "" : "s"}`
    : lastResult
      ? `${lastResult.httpStatus ? `HTTP ${lastResult.httpStatus}` : lastResult.trailers?.["grpc-status"] === "0" ? "0 OK" : "Complete"} · ${Math.round(lastResult.durationMs ?? 0)} ms`
      : "";
  const safeAssertionResults = Array.isArray(assertionResults) ? assertionResults : [];
  const activeRequestMockMethod = (() => {
    if (!activeGrpcBinding) return null;
    if (selectedMethod && methodKey(selectedMethod) === activeGrpcBinding.methodFullName) return selectedMethod;
    const compiled = protoRuntimeRegistry?.resolveVersion?.(activeGrpcBinding.libraryId, activeGrpcBinding.versionId);
    return (
      compiled?.loaded?.methods?.find((method: any) => methodKey(method) === activeGrpcBinding.methodFullName) ?? null
    );
  })();

  const activeRequestMockContext = (() => {
    if (!activeGrpcBinding) return { state: "not-grpc" as const };
    const library = (protoLibraries ?? []).find((item: any) => item.id === activeGrpcBinding.libraryId);
    const version = library?.versions?.find((item: any) => item.id === activeGrpcBinding.versionId);
    const compiled = protoRuntimeRegistry?.resolveVersion?.(activeGrpcBinding.libraryId, activeGrpcBinding.versionId);
    const method = activeRequestMockMethod;
    if (!library || !version || !compiled || !method) {
      return {
        state: "broken" as const,
        library,
        version,
        method,
        message: !library
          ? "The Proto library referenced by this request is no longer available."
          : !version
            ? "The pinned Proto revision is no longer available."
            : "The request method could not be resolved from the pinned Proto revision.",
      };
    }
    const source = { libraryId: library.id, versionId: version.id };
    const attached = (mockServer.protoSources ?? []).some(
      (item: any) => item.libraryId === source.libraryId && item.versionId === source.versionId,
    );
    const file = getMockMethodScenarioFile(mockServer, method);
    const parsed = parseMockScenarioText(file.scenarioText, file.format, mockServer.port);
    if (!parsed.ok) {
      return {
        state: "invalid-source" as const,
        library,
        version,
        method,
        root: compiled.loaded.root,
        source,
        attached,
        file,
        message: parsed.error,
      };
    }
    const key = methodKey(method);
    const scenarios = parsed.bundle.scenarios.filter(
      (scenario: MockScenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
    );
    const selectedId = mockServer.selectedScenarioIds?.[key] ?? "";
    const selectedScenario =
      scenarios.find((scenario: MockScenario) => scenario.id === selectedId) ?? scenarios[0] ?? null;
    const enabled = mockServer.enabledMethods?.[key] !== false;
    return {
      state: scenarios.length > 0 ? ("available" as const) : ("missing" as const),
      library,
      version,
      method,
      root: compiled.loaded.root,
      source,
      attached,
      file,
      parsed,
      scenarios,
      selectedScenario,
      enabled,
      key,
    };
  })();

  const activeRequestMockData: any = activeRequestMockContext;

  const activeRequestMockRows: GrpcMockScenarioRow[] =
    activeRequestMockData.state === "available" || activeRequestMockData.state === "missing"
      ? activeRequestMockData.scenarios.map((scenario: MockScenario) => ({
          source: activeRequestMockData.source,
          library: activeRequestMockData.library,
          version: activeRequestMockData.version,
          root: activeRequestMockData.root,
          method: activeRequestMockData.method,
          scenario,
          enabled: activeRequestMockData.enabled,
          selected: activeRequestMockData.selectedScenario?.id === scenario.id,
        }))
      : [];
  const activeRequestMockEditorRow =
    activeRequestMockRows.find((row) => row.scenario.id === requestMockEditorScenarioId) ?? null;
  const activeRequestMockScenarioIdSignature = activeRequestMockRows.map((row) => row.scenario.id).join("\u0000");

  // Keep the persisted selection canonical after add/delete/rename operations.
  // The request panel intentionally falls back to the first scenario for display,
  // but the persisted id must follow that fallback as well or the native select can
  // be controlled by a value that no longer exists after a delete.
  useEffect(() => {
    if (activeRequestMockData.state !== "available" && activeRequestMockData.state !== "missing") return;
    const key = activeRequestMockData.key;
    const fallbackId = activeRequestMockData.selectedScenario?.id ?? "";
    const validIds = new Set(activeRequestMockData.scenarios.map((scenario: MockScenario) => scenario.id));
    setMockServer((current: any) => {
      const currentSelectedId = current.selectedScenarioIds?.[key] ?? "";
      if (fallbackId && currentSelectedId === fallbackId && validIds.has(currentSelectedId)) return current;
      if (!fallbackId && !currentSelectedId) return current;
      const selectedScenarioIds = { ...(current.selectedScenarioIds ?? {}) };
      if (fallbackId) selectedScenarioIds[key] = fallbackId;
      else delete selectedScenarioIds[key];
      return {
        ...current,
        selectedScenarioIds,
        enabledMethods: fallbackId
          ? current.enabledMethods
          : { ...(current.enabledMethods ?? {}), [key]: false },
        updatedAt: new Date().toISOString(),
      };
    });
  }, [
    activeRequestMockData.state,
    activeRequestMockData.key,
    activeRequestMockData.selectedScenario?.id,
    activeRequestMockScenarioIdSignature,
    setMockServer,
  ]);

  // If deleting a scenario removes the settings anchor/editor target, clear the
  // overlay state immediately so no invisible portal/backdrop can intercept clicks.
  useEffect(() => {
    const selectedId = activeRequestMockData.state === "available" ? activeRequestMockData.selectedScenario?.id ?? "" : "";
    if (!selectedId) setRequestMockSettingsAnchor(null);
    if (requestMockEditorScenarioId && !activeRequestMockRows.some((row) => row.scenario.id === requestMockEditorScenarioId)) {
      setRequestMockEditorDirty(false);
      setRequestMockEditorScenarioId("");
    }
  }, [
    activeRequestMockData.state,
    activeRequestMockData.selectedScenario?.id,
    activeRequestMockScenarioIdSignature,
    requestMockEditorScenarioId,
  ]);

  function hasActiveRequestMockMethod() {
    return activeRequestMockData.state === "available" || activeRequestMockData.state === "missing";
  }

  function attachActiveRequestMockBinding(current: any) {
    if (!hasActiveRequestMockMethod() || !activeGrpcBinding) return current;
    const source = activeRequestMockData.source;
    const protoSources = [...(current.protoSources ?? [])];
    if (!protoSources.some((item: any) => item.libraryId === source.libraryId && item.versionId === source.versionId)) {
      protoSources.push(source);
    }
    return {
      ...current,
      protoSources,
      methodBindings: {
        ...(current.methodBindings ?? {}),
        [activeRequestMockData.key]: activeGrpcBinding,
      },
    };
  }

  function setActiveRequestMockEnabled(enabled: boolean) {
    if (!hasActiveRequestMockMethod()) return;
    setMockServer((current: any) => {
      const bound = attachActiveRequestMockBinding(current);
      return {
        ...bound,
        enabledMethods: { ...(bound.enabledMethods ?? {}), [activeRequestMockData.key]: enabled },
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function openActiveRequestScenarioEditor(scenarioId: string) {
    if (!hasActiveRequestMockMethod() || !scenarioId) return;
    selectActiveRequestMockContext();
    setRequestMockManagerOpen(false);
    setRequestMockEditorDirty(false);
    setRequestMockEditorScenarioId(scenarioId);
  }

  function closeActiveRequestScenarioEditor() {
    if (requestMockEditorDirty && !window.confirm("Discard unsaved scenario changes?")) return;
    setRequestMockEditorDirty(false);
    setRequestMockEditorScenarioId("");
  }

  function addActiveRequestMockScenario() {
    if (!hasActiveRequestMockMethod()) return;
    selectActiveRequestMockContext();
    setMockServer((current: any) => {
      const bound = attachActiveRequestMockBinding(current);
      const file = getMockMethodScenarioFile(bound, activeRequestMockData.method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, bound.port);
      if (!parsed.ok) return bound;
      const methodScenarios = parsed.bundle.scenarios.filter(
        (scenario: MockScenario) =>
          scenario.service === activeRequestMockData.method.serviceName &&
          scenario.method === activeRequestMockData.method.methodName,
      );
      const scenario = ensureUniqueMockScenarioId(
        buildDefaultMockScenario(
          activeRequestMockData.method,
          activeRequestMockData.root,
          methodScenarios.length,
          undefined,
          bound.streamDefaults,
        ),
        methodScenarios,
      );
      const next = updateMockMethodScenarioFile(bound, activeRequestMockData.method, {
        scenarioText: formatMockScenarioBundle(
          { ...parsed.bundle, scenarios: [scenario, ...methodScenarios] },
          file.format,
        ),
      });
      return {
        ...next,
        selectedScenarioIds: { ...(next.selectedScenarioIds ?? {}), [activeRequestMockData.key]: scenario.id },
        enabledMethods: { ...(next.enabledMethods ?? {}), [activeRequestMockData.key]: true },
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function duplicateActiveRequestMockScenario(scenarioId: string) {
    if (!hasActiveRequestMockMethod() || !scenarioId) return;
    selectActiveRequestMockContext();
    setMockServer((current: any) => {
      const bound = attachActiveRequestMockBinding(current);
      const file = getMockMethodScenarioFile(bound, activeRequestMockData.method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, bound.port);
      if (!parsed.ok) return bound;
      const scenarios = parsed.bundle.scenarios.filter(
        (scenario: MockScenario) =>
          scenario.service === activeRequestMockData.method.serviceName &&
          scenario.method === activeRequestMockData.method.methodName,
      );
      const original = scenarios.find((scenario: MockScenario) => scenario.id === scenarioId);
      if (!original) return bound;
      const used = new Set(scenarios.map((scenario: MockScenario) => scenario.id));
      let id = `${scenarioId}-copy`;
      let index = 2;
      while (used.has(id)) id = `${scenarioId}-copy-${index++}`;
      const clone: MockScenario = {
        ...original,
        id,
        description: original.description ? `${original.description} (copy)` : "Copied scenario",
      };
      const next = updateMockMethodScenarioFile(bound, activeRequestMockData.method, {
        scenarioText: formatMockScenarioBundle({ ...parsed.bundle, scenarios: [clone, ...scenarios] }, file.format),
      });
      return {
        ...next,
        selectedScenarioIds: { ...(next.selectedScenarioIds ?? {}), [activeRequestMockData.key]: id },
        enabledMethods: { ...(next.enabledMethods ?? {}), [activeRequestMockData.key]: true },
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function deleteActiveRequestMockScenario(scenarioId: string) {
    if (!hasActiveRequestMockMethod() || !scenarioId) return false;
    // Close the anchored settings menu before invoking the native confirm. This
    // prevents the menu's transparent portal backdrop from surviving a delete.
    setRequestMockSettingsAnchor(null);
    if (!window.confirm(`Delete scenario “${scenarioId}”?`)) return false;
    setMockServer((current: any) => {
      const bound = attachActiveRequestMockBinding(current);
      const file = getMockMethodScenarioFile(bound, activeRequestMockData.method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, bound.port);
      if (!parsed.ok) return bound;
      const remaining = parsed.bundle.scenarios.filter(
        (scenario: MockScenario) =>
          !(
            scenario.service === activeRequestMockData.method.serviceName &&
            scenario.method === activeRequestMockData.method.methodName &&
            scenario.id === scenarioId
          ),
      );
      const methodRemaining = remaining.filter(
        (scenario: MockScenario) =>
          scenario.service === activeRequestMockData.method.serviceName &&
          scenario.method === activeRequestMockData.method.methodName,
      );
      const next = updateMockMethodScenarioFile(bound, activeRequestMockData.method, {
        scenarioText: formatMockScenarioBundle({ ...parsed.bundle, scenarios: remaining }, file.format),
      });
      const selectedScenarioIds = { ...(next.selectedScenarioIds ?? {}) };
      if (selectedScenarioIds[activeRequestMockData.key] === scenarioId) {
        if (methodRemaining[0]) selectedScenarioIds[activeRequestMockData.key] = methodRemaining[0].id;
        else delete selectedScenarioIds[activeRequestMockData.key];
      }
      return {
        ...next,
        selectedScenarioIds,
        enabledMethods: {
          ...(next.enabledMethods ?? {}),
          [activeRequestMockData.key]: methodRemaining.length > 0 && next.enabledMethods?.[activeRequestMockData.key] !== false,
        },
        updatedAt: new Date().toISOString(),
      };
    });
    if (requestMockEditorScenarioId === scenarioId) {
      setRequestMockEditorDirty(false);
      setRequestMockEditorScenarioId("");
    }
    return true;
  }

  function saveActiveRequestMockScenario(scenario: MockScenario, format: any) {
    if (!hasActiveRequestMockMethod() || !activeRequestMockEditorRow) return;
    const bound = attachActiveRequestMockBinding(mockServer);
    const saved = saveMockScenarioForMethod(
      bound,
      activeRequestMockData.method,
      activeRequestMockEditorRow.scenario.id,
      scenario,
      format,
    );
    if (!saved) return;
    setMockServer({ ...saved.project, updatedAt: new Date().toISOString() });
    setRequestMockEditorScenarioId(saved.scenario.id);
    setRequestMockEditorDirty(false);
  }

  async function copyLatestResponseJson() {
    if (latestResponsePayload === undefined) return;
    const text =
      typeof latestResponsePayload === "string"
        ? latestResponsePayload
        : JSON.stringify(latestResponsePayload, null, 2);
    await copyTextWithAnnouncement(text, "Latest response");
  }

  function selectActiveRequestMockContext() {
    if (
      activeRequestMockContext.state !== "available" &&
      activeRequestMockContext.state !== "missing" &&
      activeRequestMockContext.state !== "invalid-source"
    )
      return;
    selectProtoLibraryVersion(activeRequestMockContext.library.id, activeRequestMockContext.version.id);
    setMockSelectedMethodKey(methodKey(activeRequestMockContext.method));
  }

  function selectActiveRequestScenario(scenarioId: string) {
    if (activeRequestMockContext.state !== "available") return;
    setMockServer((current: any) => {
      const bound = attachActiveRequestMockBinding(current);
      return {
        ...bound,
        selectedScenarioIds: {
          ...(bound.selectedScenarioIds ?? {}),
          [activeRequestMockContext.key]: scenarioId,
        },
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function openActiveRequestMockWorkspace() {
    selectActiveRequestMockContext();
    setServiceProtocol("grpc-mock");
    setServicesSection("mock-servers");
    setSideSection("services");
    setSidebarOpen(true);
  }

  useEffect(() => {
    if (!responseFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setResponseFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [responseFullscreen]);

  useEffect(() => {
    if (sideSection === "collections") return;
    setResponseFullscreen(false);
  }, [sideSection]);

  useEffect(() => {
    const handleResponsePanelShortcut = (event: KeyboardEvent) => {
      if (sideSection !== "collections") return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "j") return;
      event.preventDefault();
      setResponseCollapsed((current) => !current);
    };
    window.addEventListener("keydown", handleResponsePanelShortcut);
    return () => window.removeEventListener("keydown", handleResponsePanelShortcut);
  }, [sideSection]);

  const requestContextView: RequestContextView =
    requestTab === "mock"
      ? "mock"
      : requestTab === "schema" && !activeIsRest && !activeIsWebSocket
        ? "schema"
        : requestTab === "more"
          ? "settings"
          : requestTab === "docs" || requestTab === "examples" || requestTab === "benchmark"
            ? "tool"
            : "request";

  const requestEditorItems: Array<{ value: RequestTab; label: string }> = activeIsRest
    ? [
        { value: "schema", label: "Params" },
        { value: "body", label: "Body" },
        { value: "metadata", label: "Headers" },
        { value: "auth", label: "Auth" },
      ]
    : activeIsWebSocket
      ? [
          { value: "body", label: "Message" },
          { value: "metadata", label: "Headers" },
          { value: "auth", label: "Auth" },
        ]
      : [
          { value: "body", label: "Message" },
          { value: "metadata", label: "Metadata" },
          { value: "auth", label: "Auth" },
        ];

  const requestEditorTab: RequestTab =
    requestContextView === "request" && requestEditorItems.some((item) => item.value === requestTab)
      ? requestTab
      : requestEditorItems.some((item) => item.value === lastRequestEditorTab)
        ? lastRequestEditorTab
        : activeIsRest
          ? "schema"
          : "body";

  useEffect(() => {
    const isGrpcSchemaMode = requestTab === "schema" && !activeIsRest && !activeIsWebSocket;
    if (requestTab === "mock" || isGrpcSchemaMode || requestTab === "more") return;
    if (requestTab === "body" || requestTab === "auth" || requestTab === "metadata") {
      setLastRequestEditorTab(requestTab);
      return;
    }
    if (activeIsRest && requestTab === "schema") setLastRequestEditorTab("schema");
  }, [activeIsRest, activeIsWebSocket, requestTab]);

  function handleRequestEditorTabChange(nextTab: RequestTab) {
    setLastRequestEditorTab(nextTab);
    setRequestTab(nextTab);
  }

  function returnToRequestEditor() {
    const nextTab = requestEditorItems.some((item) => item.value === lastRequestEditorTab)
      ? lastRequestEditorTab
      : activeIsRest
        ? "schema"
        : "body";
    setRequestTab(nextTab);
  }

  useEffect(() => {
    const legacyOverlayTabs: RequestTab[] = ["mock", "more", "docs", "examples", "benchmark"];
    if (legacyOverlayTabs.includes(requestTab) || (!activeIsRest && requestTab === "schema")) {
      returnToRequestEditor();
    }
  // Intentionally normalize persisted pre-redesign request tabs when request context changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCollectionRequest?.id]);

  // Collection requests use editor tabs plus a VS Code-style docked Response panel.
  // Other rail workspaces are single-view surfaces and intentionally omit both.
  const requestHeaderTitle =
    activeCollectionRequest?.name ?? selectedMethod?.methodName ?? "Select a collection request";
  const activeRequestProtoLibrary = activeGrpcBinding
    ? protoLibraries.find((library: any) => library.id === activeGrpcBinding.libraryId)
    : null;
  const activeRequestProtoVersion = activeRequestProtoLibrary?.versions?.find(
    (version: any) => version.id === activeGrpcBinding?.versionId,
  );
  const requestHeaderContext = selectedMethod
    ? [
        `${activeCollectionRequest?.collectionName ?? activeRequestProtoLibrary?.name ?? "gRPC"} / ${selectedMethod.serviceName}`,
        methodTypeLabel(selectedMethod),
      ]
        .filter(Boolean)
        .join(" · ")
    : activeCollectionRequest?.kind === "rest"
      ? `${activeCollectionRequest.collectionName ?? "REST"} · ${activeCollectionRequest.url}`
      : activeCollectionRequest?.kind === "websocket"
        ? `${activeCollectionRequest.collectionName ?? "WebSocket"} · ${activeCollectionRequest.url}`
        : (activeCollectionRequest?.collectionName ?? "Import or add a collection request.");
  const requestIsGrpcStreaming = Boolean(selectedMethod?.requestStream || selectedMethod?.responseStream);
  const requestHeaderBadge = activeIsRest
    ? (activeCollectionRequest?.method ?? "GET")
    : activeIsWebSocket
      ? "WS"
      : selectedMethod || activeCollectionRequest?.kind === "grpc"
        ? requestIsGrpcStreaming ? "RPCS" : "RPCU"
        : "";
  const requestSchemaLabel = activeRequestProtoLibrary
    ? `${activeRequestProtoLibrary.name}${activeRequestProtoVersion?.version ? ` ${activeRequestProtoVersion.version}` : ""}`
    : "Schema";
  const requestMockLabel =
    activeRequestMockContext.state === "available" && activeRequestMockContext.selectedScenario && selectedMethod
      ? mockScenarioDisplayName(activeRequestMockContext.selectedScenario, selectedMethod)
      : activeRequestMockContext.state === "missing"
        ? "No scenario"
        : "Select scenario";
  const connectionSelectSx = {
    minHeight: 30,
    height: 30,
    minWidth: 112,
    px: 0.8,
    border: "1px solid",
    borderColor: "divider",
    bgcolor: "background.paper",
    borderRadius: 1,
    color: "text.primary",
    textTransform: "none",
    justifyContent: "space-between",
    fontWeight: 400,
    "&:hover": { bgcolor: "action.hover", borderColor: "text.secondary" },
    "&:focus-visible": { outline: "1px solid", outlineColor: "primary.main" },
  } as const;

  const renderPrimaryRequestAction = () => {
    if (activeIsWebSocket) {
      return wsClientState.readyState === "open" ? (
        <Button size="small" variant="contained" color="error" onClick={() => closeManualWebSocketClient()}>
          Disconnect
        </Button>
      ) : (
        <Button
          size="small"
          variant="contained"
          disabled={requestActionDisabled || wsClientState.readyState === "connecting"}
          onClick={() => {
            commitTargetDraft();
            handleConnectWebSocket();
          }}
        >
          Connect
        </Button>
      );
    }
    if (activeRunning) {
      return (
        <Button
          size="small"
          variant="contained"
          color="error"
          onClick={() => requestRunner.cancelRequest()}
        >
          Cancel
        </Button>
      );
    }
    return (
      <Button
        size="small"
        variant="contained"
        disabled={requestActionDisabled}
        onClick={() => {
          commitTargetDraft();
          void requestRunner.runRequest();
        }}
      >
        {requestIsGrpcStreaming ? "Stream" : "Send"}
      </Button>
    );
  };

  const renderResponseLayer = (children: ReactNode) =>
    responseFullscreen && typeof document !== "undefined"
      ? createPortal(
          <div
            style={
              {
                position: "fixed",
                inset: 0,
                zIndex: 2147483100,
                WebkitAppRegion: "no-drag",
              } as CSSProperties
            }
          >
            {children}
          </div>,
          document.body,
        )
      : children;

  return (
    <Box
      component="main"
      sx={{
        position: "fixed",
        top: designSystem.size.titlebarHeight,
        left: shellLeft,
        right: 0,
        bottom: designSystem.size.statusbarHeight + (cliPanelOpen ? cliPanelHeight : 0),
        p: 0,
        overflow: "hidden",
        zIndex: "auto",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      {sideSection === "collections" ? (
        <Box
          data-slot="workspace-tabs"
          sx={{
            height: designSystem.size.workspaceTabHeight,
            minHeight: designSystem.size.workspaceTabHeight,
            borderBottom: "1px solid",
            borderColor: "var(--border-strong)",
            bgcolor: "background.default",
            overflow: "hidden",
          }}
        >
          <RequestTabs
            sessions={requestSessions}
            activeRequestId={activeRequestId}
            onActivate={(session: RequestSession) => {
              setProtoPreview(null);
              activateRequestSession(session);
              setSideSection("collections");
              setSidebarOpen(true);
            }}
            onClose={closeRequestSession}
            onCancel={requestRunner.cancelRequest}
            onCloseAll={closeAllRequestSessions}
            onCloseOther={closeOtherRequestSessions}
            onReorder={reorderRequestSessions}
            placement="panel"
          />
        </Box>
      ) : null}
      <Stack
        direction={sideSection === "collections" && effectiveRequestResponseLayout === "horizontal" ? "row" : "column"}
        spacing={0}
        sx={{ flex: 1, height: "auto", width: "100%", minHeight: 0, minWidth: 0, overflow: "hidden" }}
      >
        {sideSection === "source-control" ? (
          <GitSourceControlWorkspace
            directoryPath={props.ctx.workspaceFolderPath || ""}
            onFlushWorkspace={async () => {
              const directoryPath = props.ctx.workspaceFolderPath || "";
              if (!directoryPath || !window.electronWorkspace?.saveFolder || !props.ctx.getWorkspaceExportBundle)
                return;
              const result = await window.electronWorkspace.saveFolder(
                props.ctx.getWorkspaceExportBundle(),
                directoryPath,
              );
              if (!result?.ok)
                throw new Error(result?.error || "Failed to save the workspace before the Git operation.");
            }}
          />
        ) : sideSection === "services" ? (
          <ServicesWorkspace ctx={props.ctx} />
        ) : sideSection === "proto-schemas" ? (
          <ProtoSchemaWorkspace ctx={props.ctx} />
        ) : sideSection === "settings" ? (
          <SettingsWorkspace ctx={props.ctx} />
        ) : sideSection === "docs" && !standaloneDocumentationPage ? (
          <Paper
            elevation={0}
            sx={{
              ...panelSx,
              flex: "1 1 auto",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "auto",
              borderRadius: 0,
            }}
          >
            <Stack direction="row" alignItems="center" sx={{ minHeight: 50, px: 1.5, borderBottom: "1px solid var(--border-strong)" }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={600}>Documentation</Typography>
                <Typography variant="caption" color="text.secondary">Select a page from the Docs sidebar to edit or preview it.</Typography>
              </Box>
            </Stack>
            <Box sx={{ p: 1.5, maxWidth: 760 }}>
              <Box sx={{ borderTop: "1px solid", borderColor: "divider" }}>
                {[
                  ["Pages", documentationPages.length],
                  ["Published", documentationPages.filter((page: any) => page.status === "published").length],
                  ["Needs update", documentationPages.filter((page: any) => page.status === "outdated" || page.status === "error").length],
                ].map(([label, value]) => (
                  <Stack key={String(label)} direction="row" alignItems="center" sx={{ minHeight: 38, borderBottom: "1px solid", borderColor: "divider" }}>
                    <Typography variant="body2" sx={{ minWidth: 0, flex: 1 }}>{label}</Typography>
                    <Typography variant="body2" color="text.secondary">{value}</Typography>
                  </Stack>
                ))}
              </Box>
            </Box>
          </Paper>
        ) : standaloneDocumentationPage && sideSection === "docs" ? (
          <Paper
            elevation={0}
            sx={{
              ...panelSx,
              flex: "1 1 auto",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "auto",
              p: 1.4,
            }}
          >
            <UnifiedDocumentationPanel
              page={standaloneDocumentationPage}
              source={activeDocumentationSource}
              settings={documentation.settings}
              onSaveSource={saveDocumentationSource}
              onOpenRequest={() => openDocumentationRequest(standaloneDocumentationPage)}
              onPublish={() => void publishDocumentationPage(standaloneDocumentationPage.id)}
              onEditExample={(id: string, tab?: ExampleEditorTab) => openExampleEditor(id, tab)}
            />
          </Paper>
        ) : protoPreview && sideSection !== "proto-schemas" ? (
          <Paper
            elevation={0}
            sx={{
              ...panelSx,
              flex: "1 1 auto",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ px: 1.4, py: 0.8, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}
            >
              <Storage sx={{ fontSize: 18 }} color="primary" />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" noWrap title={protoPreview.name}>
                  {protoPreview.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Global proto source · read only
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                onClick={() => downloadTextFile(protoPreview.name, protoPreview.text, "text/x-protobuf")}
              >
                Export
              </Button>
              <Button size="small" variant="contained" onClick={() => setProtoPreview(null)}>
                Close source
              </Button>
            </Stack>
            <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.2 }}>
              <FeatureProtoSourceBlock file={protoPreview} fullHeight />
            </Box>
          </Paper>
        ) : showEmptyWorkbench ? (
          <Paper
            elevation={0}
            sx={{
              ...panelSx,
              flex: "1 1 auto",
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: 3,
            }}
          >
            <Stack spacing={1.2} alignItems="center" textAlign="center" sx={{ maxWidth: 520 }}>
              <Api sx={{ fontSize: 36, color: "text.secondary" }} />
              <Typography variant="h6">Please open, import, or select a collection.</Typography>
              <Typography variant="body2" color="text.secondary">
                Import a workspace or select a request from the collection sidebar. Upload reusable schemas from Proto
                Schemas or directly while creating a gRPC request.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
                <Button variant="contained" size="small" startIcon={<UploadFile />} onClick={openWorkspaceImporter}>
                  Import workspace
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Storage />}
                  onClick={() => {
                    setSideSection("collections");
                    setSidebarOpen(true);
                  }}
                >
                  Select collection
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ) : (
          <Paper
              elevation={0}
              sx={{
                ...panelSx,
                flex: "1 1 auto",
                minHeight: 0,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                spacing={0.75}
                flexWrap="wrap"
                useFlexGap
                sx={{
                  px: 1.25,
                  py: 0.55,
                  minHeight: 54,
                  rowGap: 0.5,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  flexShrink: 0,
                }}
              >
                <Box sx={{ minWidth: 0, flex: "1 1 180px" }}>
                  <Stack direction="row" spacing={0.55} alignItems="center" sx={{ minWidth: 0 }}>
                    {requestHeaderBadge ? (
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ color: "primary.main", fontWeight: 700, flexShrink: 0, fontSize: 10.5 }}
                      >
                        {requestHeaderBadge}
                      </Typography>
                    ) : null}
                    <Typography variant="subtitle1" noWrap title={requestHeaderTitle} sx={{ minWidth: 0, fontWeight: 600 }}>
                      {requestHeaderTitle}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap title={requestHeaderContext}>
                    {requestHeaderContext}
                  </Typography>
                </Box>

                {!activeIsRest && !activeIsWebSocket ? (
                  <Stack
                    direction="row"
                    spacing={0.55}
                    alignItems="center"
                    className="request-mock-controls"
                    sx={{ flexShrink: 0, minWidth: 0, minHeight: 32 }}
                  >
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        fontSize: 11,
                        minHeight: 20,
                        lineHeight: "20px",
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      Mock
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      aria-label="Select mock scenario"
                      aria-haspopup="menu"
                      aria-expanded={Boolean(requestMockMenuAnchor)}
                      disabled={activeRequestMockContext.state !== "available"}
                      onClick={(event: ButtonClickEvent) => setRequestMockMenuAnchor(event.currentTarget)}
                      title={requestMockLabel}
                      sx={{
                        minHeight: 32,
                        height: 32,
                        width: "clamp(132px, 18vw, 190px)",
                        maxWidth: 190,
                        px: 0.8,
                        justifyContent: "space-between",
                        textTransform: "none",
                        fontSize: 12.5,
                        lineHeight: "20px",
                        fontWeight: 400,
                        borderColor: "divider",
                        bgcolor: "background.paper",
                        color: "text.primary",
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          minWidth: 0,
                          minHeight: 20,
                          display: "inline-flex",
                          alignItems: "center",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: "20px",
                        }}
                      >
                        {requestMockLabel}
                      </Box>
                      <Box component="span" aria-hidden="true" sx={{ ml: 0.65, fontSize: 10, flexShrink: 0 }}>▾</Box>
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      aria-label="Mock settings"
                      disabled={activeRequestMockContext.state !== "available" && activeRequestMockContext.state !== "missing"}
                      onClick={(event: ButtonClickEvent) => setRequestMockSettingsAnchor(event.currentTarget)}
                      sx={{ minHeight: 32, height: 32, px: 0.9, fontSize: 12.5, lineHeight: "20px", textTransform: "none", borderColor: "divider", color: "text.secondary" }}
                    >
                      Settings
                    </Button>
                  </Stack>
                ) : null}

                <Tooltip title="Request options">
                  <IconButton
                    size="small"
                    aria-label="Request options"
                    onClick={(event: ElementClickEvent) => setRequestToolsMenuAnchor(event.currentTarget)}
                    sx={{ ml: 0.25, width: 32, height: 32, alignSelf: "center" }}
                  >
                    <MoreHoriz sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip
                  title={
                    requestResponseLayout === "horizontal" && !horizontalLayoutAvailable
                      ? "Side by side resumes when the window is wider; click to use stacked layout"
                      : requestResponseLayout === "horizontal"
                        ? "Stack request and response"
                        : "Show request and response side by side"
                  }
                >
                  <IconButton
                    size="small"
                    aria-label={
                      requestResponseLayout === "horizontal"
                        ? "Use stacked request and response layout"
                        : "Use side by side request and response layout"
                    }
                    onClick={toggleRequestResponseLayout}
                    sx={{ width: 32, height: 32, alignSelf: "center" }}
                  >
                    {requestResponseLayout === "horizontal" ? (
                      <PanelBottom sx={{ fontSize: 16 }} />
                    ) : (
                      <PanelRight sx={{ fontSize: 16 }} />
                    )}
                  </IconButton>
                </Tooltip>
              </Stack>

              {requestContextView === "request" ? (
              <Stack
                direction="row"
                spacing={0}
                alignItems="center"
                flexWrap="wrap"
                useFlexGap
                sx={{
                  px: 1.2,
                  py: 0.5,
                  rowGap: 0.5,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  flexShrink: 0,
                }}
              >
                <Button
                  size="small"
                  variant="text"
                  aria-haspopup="menu"
                  aria-expanded={Boolean(envMenuAnchor)}
                  onClick={(event: ButtonClickEvent) => setEnvMenuAnchor(event.currentTarget)}
                  title={featureEnvironmentLabel(environments, activeEnvironmentKey)}
                  sx={{ ...connectionSelectSx, maxWidth: 150, flexShrink: 0 }}
                >
                  <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                    {featureEnvironmentShortLabel(environments, activeEnvironmentKey)}
                  </Box>
                  <Box component="span" aria-hidden="true" sx={{ ml: 0.65, fontSize: 10, flexShrink: 0 }}>▾</Box>
                </Button>
                <Menu anchorEl={envMenuAnchor} open={Boolean(envMenuAnchor)} onClose={() => setEnvMenuAnchor(null)}>
                  <MenuItem selected={activeEnvironmentKey === "default"} onClick={() => chooseEnvironment("default")}>
                    None
                  </MenuItem>
                  <MenuItem selected={activeEnvironmentKey === "manual"} onClick={() => chooseEnvironment("manual")}>
                    Manually Specify
                  </MenuItem>
                  <Divider />
                  {environments.map((env: EnvironmentConfig) => {
                    const target = featureGetEnvironmentTransportTarget(env, activeTransportMode);
                    return (
                      <MenuItem
                        key={env.key}
                        selected={activeEnvironmentKey === env.key}
                        onClick={() => chooseEnvironment(env.key)}
                      >
                        <ListItemText
                          primary={env.label}
                          secondary={target}
                          primaryTypographyProps={{ noWrap: true, title: env.label }}
                          secondaryTypographyProps={{ noWrap: true, title: target }}
                        />
                        <Tooltip title="Edit environment">
                          <IconButton
                            size="small"
                            aria-label={`Edit ${env.label}`}
                            onClick={(event: ElementClickEvent) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openEnvironmentManager(env);
                            }}
                            sx={{ ml: 1, flexShrink: 0 }}
                          >
                            <Edit sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </MenuItem>
                    );
                  })}
                  <Divider />
                  <MenuItem onClick={saveCurrentEnvironment}>
                    <Add sx={{ fontSize: 16, mr: 1 }} /> Save New Environment
                  </MenuItem>
                </Menu>
                {!activeIsWebSocket && !activeIsRest && (
                  <>
                    <Button
                      size="small"
                      variant="text"
                      aria-haspopup="menu"
                      aria-expanded={Boolean(transportMenuAnchor)}
                      onClick={(event: ButtonClickEvent) => setTransportMenuAnchor(event.currentTarget)}
                      sx={{ ...connectionSelectSx, ml: 0.5, minWidth: 118 }}
                    >
                      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                        {activeTransportMode === "native-grpc" ? "Native gRPC" : "gRPC-Web"}
                      </Box>
                      <Box component="span" aria-hidden="true" sx={{ ml: 0.65, fontSize: 10, flexShrink: 0 }}>▾</Box>
                    </Button>
                    <Menu anchorEl={transportMenuAnchor} open={Boolean(transportMenuAnchor)} onClose={() => setTransportMenuAnchor(null)}>
                      <MenuItem
                        selected={activeTransportMode === "grpc-web"}
                        onClick={() => { setTransportMenuAnchor(null); handleTransportModeChange("grpc-web"); }}
                      >
                        gRPC-Web
                      </MenuItem>
                      <MenuItem
                        selected={activeTransportMode === "native-grpc"}
                        onClick={() => { setTransportMenuAnchor(null); handleTransportModeChange("native-grpc"); }}
                      >
                        Native gRPC
                      </MenuItem>
                    </Menu>
                  </>
                )}
                {activeIsRest && (
                  <FormControl size="small" sx={{ width: 92, ml: 0.5, flexShrink: 0 }}>
                    <Select
                      value={activeCollectionRequest?.method ?? activeSession?.httpMethod ?? "GET"}
                      onChange={(event: SelectInputChangeEvent) => updateActiveRestMethod(event.target.value)}
                    >
                      {restMethods.map((method: string) => (
                        <MenuItem key={method} value={method}>
                          {method}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                <TextField
                  size="small"
                  fullWidth
                  className="workbench-url-input"
                  sx={{ ml: 0.5, flex: "1 1 220px", minWidth: 160 }}
                  value={targetDraft}
                  onChange={(event: TextInputChangeEvent) => handleTargetDraftChange(event.target.value)}
                  onBlur={() => commitTargetDraft()}
                  onKeyDown={(event: TextInputKeyboardEvent) => {
                    if (event.key === "Enter") commitTargetDraft();
                  }}
                  inputProps={{
                    "aria-label": activeIsWebSocket
                      ? "WebSocket URL"
                      : activeIsRest
                        ? "REST endpoint URL"
                        : "gRPC target",
                  }}
                  placeholder={
                    activeIsWebSocket
                      ? "ws://localhost:8080"
                      : activeIsRest
                        ? "https://api.example.com/users/:id"
                        : activeTransportMode === "native-grpc"
                          ? "localhost:50051"
                          : "Web Access URL"
                  }
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        {activeIsWebSocket ? (
                          <Stream sx={{ fontSize: 16 }} />
                        ) : activeTransportMode === "native-grpc" ? (
                          <DesktopWindows sx={{ fontSize: 16 }} />
                        ) : (
                          <Language sx={{ fontSize: 16 }} />
                        )}
                      </InputAdornment>
                    ),
                  }}
                />
                <Tooltip title="Copy endpoint">
                  <IconButton size="small" aria-label="Copy endpoint" onClick={copyPreviewUrl}>
                    <ContentCopy sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Box sx={{ ml: 0.5, flexShrink: 0 }}>
                  {renderPrimaryRequestAction()}
                </Box>
              </Stack>
              ) : null}
              {requestContextView === "request" && activeGrpcBindingIssue ? (
                <Paper
                  variant="outlined"
                  role={activeGrpcBindingIssue.tone === "error" ? "alert" : "status"}
                  sx={{
                    mx: 1.2,
                    mt: 0.8,
                    p: 1,
                    borderColor: activeGrpcBindingIssue.tone === "error" ? "error.main" : "warning.main",
                    bgcolor: "background.paper",
                  }}
                >
                  <Stack direction="row" spacing={0.9} alignItems="flex-start">
                    <Box sx={{ pt: 0.15, color: activeGrpcBindingIssue.tone === "error" ? "error.main" : "warning.main" }}>
                      <WarningIcon color={activeGrpcBindingIssue.tone === "error" ? "error" : "warning"} sx={{ fontSize: 17 }} />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {activeGrpcBindingIssue.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.15 }}>
                        {activeGrpcBindingIssue.detail}
                      </Typography>
                      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.65 }}>
                        <Typography variant="caption" color="text.secondary">
                          Schema: <Box component="span" sx={{ color: "text.primary" }}>{activeGrpcLibrary?.name ?? activeGrpcBinding?.libraryId ?? "Not bound"}</Box>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Revision: <Box component="span" sx={{ color: "text.primary" }}>{activeGrpcVersion?.version ?? activeGrpcBinding?.versionId ?? "Not bound"}</Box>
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
                          RPC: <Box component="span" sx={{ color: "text.primary", wordBreak: "break-all" }}>{activeGrpcBinding?.methodFullName ?? activeCollectionRequest?.grpcMethodKey ?? "Not selected"}</Box>
                        </Typography>
                      </Stack>
                    </Box>
                    <Button size="small" variant="outlined" onClick={openActiveGrpcSchema} sx={{ flexShrink: 0 }}>
                      Open schema
                    </Button>
                  </Stack>
                </Paper>
              ) : requestContextView === "request" && requestActionDisabledReason ? (
                <Alert severity="info" variant="outlined" sx={{ mx: 1.4, mt: 0.8, py: 0.2 }}>
                  {requestActionDisabledReason}
                </Alert>
              ) : null}

              {requestContextView === "request" ? (
                <WorkbenchTabs<RequestTab>
                  value={requestEditorTab}
                  onChange={handleRequestEditorTabChange}
                  items={requestEditorItems}
                  idPrefix="request-editor"
                  ariaLabel="Request editor sections"
                  variant="underline"
                />
              ) : null}
              <Box
                role="tabpanel"
                id={`request-workspace-panel-${requestContextView}`}
                tabIndex={0}
                sx={{
                  p: designSystem.space.panelPadding,
                  minHeight: 0,
                  flex: 1,
                  overflow: effectiveRequestResponseLayout === "horizontal" && requestTab === "body" ? "hidden" : "auto",
                  display: effectiveRequestResponseLayout === "horizontal" && requestTab === "body" ? "flex" : "block",
                  flexDirection: "column",
                }}
              >
                {requestTab === "body" &&
                  (activeIsWebSocket ? (
                    <Stack
                      spacing={1}
                      sx={{
                        minHeight: 0,
                        flex: 1,
                        height: effectiveRequestResponseLayout === "horizontal" ? "100%" : "auto",
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={0.7}
                        alignItems="center"
                        justifyContent="space-between"
                        flexWrap="wrap"
                        useFlexGap
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle1">WebSocket send data</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Data from this body is sent to the WebSocket after the connection opens. Leave it empty for
                            connect-only.
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Chip
                            size="small"
                            variant="outlined"
                            color={wsClientState.readyState === "open" ? "success" : "default"}
                            label={
                              wsClientState.readyState === "open"
                                ? `${wsClientState.messageCount} message${wsClientState.messageCount === 1 ? "" : "s"}`
                                : "Connect from the request header"
                            }
                          />
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<PlayArrow />}
                            onClick={handleSendWebSocketMessage}
                            disabled={wsClientState.readyState !== "open" || !requestJson.trim()}
                          >
                            Send message
                          </Button>
                        </Stack>
                      </Stack>
                      <FeatureCodeTextField
                        value={requestJson}
                        onChange={handleRequestJsonChange}
                        minRows={7}
                        maxRows={12}
                        language="json"
                        onFormat={prettifyRequestJson}
                        formatDisabled={!requestJson.trim()}
                        formatAriaLabel="Prettier JSON"
                        fullscreenTitle="WebSocket send data editor"
                        fullHeight={effectiveRequestResponseLayout === "horizontal"}
                      />
                    </Stack>
                  ) : activeIsRest ? (
                    <Stack
                      spacing={1}
                      sx={{
                        minHeight: 0,
                        flex: 1,
                        height: effectiveRequestResponseLayout === "horizontal" ? "100%" : "auto",
                      }}
                    >
                      <Stack spacing={0.25}>
                        <Typography variant="subtitle1">REST body</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Configure body mode for this REST request. Use the Headers and Auth & Params tabs for the rest
                          of the request.
                        </Typography>
                      </Stack>
                      <FormControl size="small" sx={{ width: 220 }}>
                        <Select
                          value={activeCollectionRequest?.restBodyType ?? "none"}
                          onChange={(event: SelectInputChangeEvent) =>
                            updateActiveRestBodyType(event.target.value as RestBodyType)
                          }
                        >
                          <MenuItem value="none">No body</MenuItem>
                          <MenuItem value="json">JSON</MenuItem>
                          <MenuItem value="text">Raw text</MenuItem>
                          <MenuItem value="form-url-encoded">x-www-form-urlencoded</MenuItem>
                        </Select>
                      </FormControl>
                      {(activeCollectionRequest?.restBodyType ?? "none") === "none" ? (
                        <Alert severity="info" variant="outlined">
                          This REST request will be sent without a body.
                        </Alert>
                      ) : (
                        <FeatureCodeTextField
                          value={requestJson}
                          onChange={handleRequestJsonChange}
                          minRows={7}
                          maxRows={12}
                          language={(activeCollectionRequest?.restBodyType ?? "json") === "json" ? "json" : "text"}
                          onFormat={prettifyRequestJson}
                          formatDisabled={!requestJson.trim()}
                          formatAriaLabel={
                            (activeCollectionRequest?.restBodyType ?? "json") === "json"
                              ? "Prettier JSON"
                              : "Format body"
                          }
                          fullscreenTitle="REST request body editor"
                          fullHeight={effectiveRequestResponseLayout === "horizontal"}
                        />
                      )}
                    </Stack>
                  ) : (
                    <Stack
                      spacing={1}
                      sx={{
                        minHeight: 0,
                        flex: 1,
                        height: effectiveRequestResponseLayout === "horizontal" ? "100%" : "auto",
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={0.7}
                        alignItems="center"
                        justifyContent="space-between"
                        flexWrap="wrap"
                        useFlexGap
                      >
                        <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap" useFlexGap>
                          {selectedMethod && currentMockScenarios.length > 0 && (
                            <FormControl size="small" sx={{ width: 220 }}>
                              <Select
                                value={currentMockActiveScenario?.id ?? currentMockScenarios[0]?.id ?? ""}
                                onChange={(event: SelectInputChangeEvent) =>
                                  handleMockScenarioSelectChange(selectedMethod, String(event.target.value))
                                }
                              >
                                {currentMockScenarios.map((scenario: MockScenario) => (
                                  <MenuItem key={scenario.id} value={scenario.id}>
                                    {scenario.id}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          )}
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={generateRequestJsonFromSelectedScenario}
                            disabled={!selectedMethod || currentMockScenarios.length === 0}
                          >
                            Generate from scenario
                          </Button>
                        </Stack>
                        <Stack direction="row" spacing={0.7} alignItems="center">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={generateRandomRequestJson}
                            disabled={!selectedMethod}
                          >
                            Generate random
                          </Button>
                        </Stack>
                      </Stack>
                      <FeatureCodeTextField
                        value={requestJson}
                        onChange={handleRequestJsonChange}
                        minRows={7}
                        maxRows={12}
                        language="json"
                        onFormat={prettifyRequestJson}
                        formatDisabled={!requestJson.trim()}
                        formatAriaLabel="Prettier JSON"
                        fullscreenTitle="Request body editor"
                        fullHeight={effectiveRequestResponseLayout === "horizontal"}
                      />
                    </Stack>
                  ))}
                {requestTab === "metadata" &&
                  (activeIsWebSocket ? (
                    <Stack spacing={1.1}>
                      <Stack spacing={0.25}>
                        <Typography variant="subtitle1">WebSocket subprotocol</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Optional WebSocket subprotocol. Message data is sent from the Message tab.
                        </Typography>
                      </Stack>
                      <TextField
                        size="small"
                        label="Sec-WebSocket-Protocol"
                        fullWidth
                        value={webSocketSubprotocolValue}
                        onChange={(event: TextInputChangeEvent) => updateWebSocketSubprotocol(event.target.value)}
                        placeholder="json, chat.v1"
                        helperText="Comma-separated subprotocols, for example json, chat.v1."
                      />
                    </Stack>
                  ) : (
                    <Stack spacing={0.6} sx={{ maxWidth: 920 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                          {activeIsRest ? "Headers" : "Metadata"}
                        </Typography>
                        <Button size="small" variant="text" startIcon={<Add />} onClick={handleAddMetadataRow}>
                          Add
                        </Button>
                      </Stack>
                      {metadataRows.map(({ item, index, rowId }) => (
                        <Stack key={rowId} direction="row" spacing={0.5} alignItems="center">
                          <TextField
                            size="small"
                            value={item.key}
                            placeholder="key"
                            inputProps={{ "aria-label": `Metadata key ${index + 1}` }}
                            onChange={(event: TextInputChangeEvent) =>
                              updateMetadataRow(index, "key", event.target.value)
                            }
                            sx={{ width: "34%", minWidth: 150 }}
                          />
                          <TextField
                            size="small"
                            value={item.value}
                            placeholder="value"
                            inputProps={{ "aria-label": `Metadata value ${index + 1}` }}
                            onChange={(event: TextInputChangeEvent) =>
                              updateMetadataRow(index, "value", event.target.value)
                            }
                            sx={{ flex: 1, minWidth: 180 }}
                          />
                          <IconButton
                            size="small"
                            aria-label={`Remove metadata row ${index + 1}`}
                            onClick={() => handleRemoveMetadataRow(index)}
                            sx={{ opacity: 0.62, "&:hover": { opacity: 1 } }}
                          >
                            <Delete sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Stack>
                      ))}
                    </Stack>
                  ))}
                {requestTab === "auth" &&
                  (activeIsRest ? (
                    <Stack spacing={1}>
                      <Stack spacing={0.25}>
                        <Typography variant="subtitle1">Authorization</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Configure credentials separately from headers and request parameters.
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <FormControl size="small" sx={{ width: 180 }}>
                          <Select
                            value={activeCollectionRequest?.restAuth?.type ?? "none"}
                            onChange={(event: SelectInputChangeEvent) => {
                              const type = event.target.value as RestAuthConfig["type"];
                              updateActiveRestAuth(
                                type === "bearer"
                                  ? { type, token: "" }
                                  : type === "basic"
                                    ? { type, username: "", password: "" }
                                    : type === "api-key"
                                      ? { type, key: "x-api-key", value: "", in: "header" }
                                      : { type: "none" },
                              );
                            }}
                          >
                            <MenuItem value="none">No auth</MenuItem>
                            <MenuItem value="bearer">Bearer token</MenuItem>
                            <MenuItem value="basic">Basic auth</MenuItem>
                            <MenuItem value="api-key">API key</MenuItem>
                          </Select>
                        </FormControl>
                        {activeCollectionRequest?.restAuth?.type === "bearer" && (
                          <TextField
                            size="small"
                            label="Token"
                            type="password"
                            value={activeCollectionRequest.restAuth.token}
                            onChange={(event: TextInputChangeEvent) =>
                              updateActiveRestAuth({ type: "bearer", token: event.target.value })
                            }
                            sx={{ minWidth: 280, flex: 1 }}
                          />
                        )}
                        {activeCollectionRequest?.restAuth?.type === "basic" && (
                          <>
                            <TextField
                              size="small"
                              label="Username"
                              value={activeCollectionRequest.restAuth.username}
                              onChange={(event: TextInputChangeEvent) =>
                                updateActiveRestAuth({
                                  type: "basic",
                                  username: event.target.value,
                                  password:
                                    activeCollectionRequest.restAuth?.type === "basic"
                                      ? activeCollectionRequest.restAuth.password
                                      : "",
                                })
                              }
                              sx={{ minWidth: 190 }}
                            />
                            <TextField
                              size="small"
                              label="Password"
                              type="password"
                              value={activeCollectionRequest.restAuth.password}
                              onChange={(event: TextInputChangeEvent) =>
                                updateActiveRestAuth({
                                  type: "basic",
                                  username:
                                    activeCollectionRequest.restAuth?.type === "basic"
                                      ? activeCollectionRequest.restAuth.username
                                      : "",
                                  password: event.target.value,
                                })
                              }
                              sx={{ minWidth: 220 }}
                            />
                          </>
                        )}
                        {activeCollectionRequest?.restAuth?.type === "api-key" && (
                          <>
                            <TextField
                              size="small"
                              label="Key"
                              value={activeCollectionRequest.restAuth.key}
                              onChange={(event: TextInputChangeEvent) =>
                                updateActiveRestAuth({
                                  type: "api-key",
                                  key: event.target.value,
                                  value:
                                    activeCollectionRequest.restAuth?.type === "api-key"
                                      ? activeCollectionRequest.restAuth.value
                                      : "",
                                  in:
                                    activeCollectionRequest.restAuth?.type === "api-key"
                                      ? activeCollectionRequest.restAuth.in
                                      : "header",
                                })
                              }
                              sx={{ minWidth: 180 }}
                            />
                            <TextField
                              size="small"
                              label="Value"
                              type="password"
                              value={activeCollectionRequest.restAuth.value}
                              onChange={(event: TextInputChangeEvent) =>
                                updateActiveRestAuth({
                                  type: "api-key",
                                  key:
                                    activeCollectionRequest.restAuth?.type === "api-key"
                                      ? activeCollectionRequest.restAuth.key
                                      : "x-api-key",
                                  value: event.target.value,
                                  in:
                                    activeCollectionRequest.restAuth?.type === "api-key"
                                      ? activeCollectionRequest.restAuth.in
                                      : "header",
                                })
                              }
                              sx={{ minWidth: 220 }}
                            />
                            <FormControl size="small" sx={{ width: 130 }}>
                              <Select
                                value={activeCollectionRequest.restAuth.in}
                                onChange={(event: SelectInputChangeEvent) =>
                                  updateActiveRestAuth({
                                    type: "api-key",
                                    key:
                                      activeCollectionRequest.restAuth?.type === "api-key"
                                        ? activeCollectionRequest.restAuth.key
                                        : "x-api-key",
                                    value:
                                      activeCollectionRequest.restAuth?.type === "api-key"
                                        ? activeCollectionRequest.restAuth.value
                                        : "",
                                    in: event.target.value === "query" ? "query" : "header",
                                  })
                                }
                              >
                                <MenuItem value="header">Header</MenuItem>
                                <MenuItem value="query">Query</MenuItem>
                              </Select>
                            </FormControl>
                          </>
                        )}
                      </Stack>
                    </Stack>
                  ) : (
                    <Stack spacing={0.8} sx={{ maxWidth: 720 }}>
                      <Typography variant="caption" color="text.secondary">
                        Authorization
                      </Typography>
                      <TextField
                        size="small"
                        fullWidth
                        type="password"
                        value={authorizationValue}
                        onChange={(event: TextInputChangeEvent) => setAuthorizationMetadata(event.target.value)}
                        placeholder="Bearer {{access_token}}"
                      />
                    </Stack>
                  ))}
                {requestTab === "schema" &&
                  (activeIsRest ? (
                    <Stack spacing={1.2}>
                      <Stack spacing={0.25}>
                        <Typography variant="subtitle1">Request parameters</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Path and query parameters are separate from authorization and headers.
                        </Typography>
                      </Stack>
                      <RestPairEditor
                        title="Path params"
                        rows={activeCollectionRequest?.restPathParams ?? []}
                        onAdd={() => addRestPairRow("restPathParams")}
                        onUpdate={(index: number, field: keyof MetadataPair, value: string) =>
                          updateRestPairRow("restPathParams", index, field, value)
                        }
                        onRemove={(index: number) => removeRestPairRow("restPathParams", index)}
                      />
                      <RestPairEditor
                        title="Query params"
                        rows={activeCollectionRequest?.restParams ?? []}
                        onAdd={() => addRestPairRow("restParams")}
                        onUpdate={(index: number, field: keyof MetadataPair, value: string) =>
                          updateRestPairRow("restParams", index, field, value)
                        }
                        onRemove={(index: number) => removeRestPairRow("restParams", index)}
                      />
                    </Stack>
                  ) : (
                    <Stack spacing={1.2} sx={{ maxWidth: 920 }}>
                      <Stack spacing={0.2}>
                        <Typography variant="subtitle1">{requestSchemaLabel}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {selectedMethod
                            ? `${selectedMethod.serviceName} · ${selectedMethod.methodName} · ${methodTypeLabel(selectedMethod)}`
                            : (activeCollectionRequest?.grpc?.methodFullName ?? "Method unavailable")}
                        </Typography>
                      </Stack>
                      {!selectedMethod ? (
                        <MethodStatusIndicator
                          tone="error"
                          title="Method unavailable"
                          detail="The selected Proto revision could not resolve this request method. Change the schema, revision, or method binding."
                          context={activeCollectionRequest?.grpc?.methodFullName}
                        />
                      ) : null}
                      <FeatureSchemaTable
                        title="Request"
                        typeName={selectedMethod?.requestType}
                        fields={requestFields}
                      />
                      <FeatureSchemaTable
                        title="Response"
                        typeName={selectedMethod?.responseType}
                        fields={responseFields}
                      />
                      <Button
                        size="small"
                        variant="text"
                        sx={{ alignSelf: "flex-start" }}
                        onClick={() => {
                          setSideSection("proto-schemas");
                          setSidebarOpen(true);
                        }}
                      >
                        Open in Schemas
                      </Button>
                    </Stack>
                  ))}
                {requestTab === "mock" &&
                  (activeIsRest ? (
                    <RestMockPanel
                      request={activeCollectionRequest}
                      scenarios={activeRestMockScenarios}
                      activeScenario={activeRestMockScenario}
                      mockResponseText={activeRestMockResponseText}
                      status={restMockStatus}
                      project={restMockServer}
                      onMockResponseTextChange={updateActiveRestMockResponse}
                      onPortChange={handleRestMockPortChange}
                      onBindHostChange={handleRestMockBindHostChange}
                      onScenarioSelect={setRestMockScenarioId}
                      onScenarioChange={updateActiveRestMockScenario}
                      onScenarioPairAdd={addRestMockScenarioPair}
                      onScenarioPairUpdate={updateRestMockScenarioPair}
                      onScenarioPairRemove={removeRestMockScenarioPair}
                      onAddScenario={addRestMockScenario}
                      onStart={() => void startRestMockServer()}
                      onStop={() => void stopRestMockServer()}
                    />
                  ) : activeIsWebSocket ? (
                    <WebSocketMockPanel
                      request={activeCollectionRequest}
                      mockResponseText={activeWebSocketMockResponseText}
                      onMockResponseTextChange={updateActiveWebSocketMockResponse}
                      status={wsMockStatus}
                      port={wsMockPort}
                      pathValue={wsMockPath}
                      intervalMs={wsMockIntervalMs}
                      loop={wsMockLoop}
                      maxLoops={wsMockMaxLoops}
                      streamOnConnect={wsMockStreamOnConnect}
                      scenarios={activeWebSocketMockScenarios}
                      activeScenario={activeWebSocketMockScenario}
                      requestPaths={wsMockStatus.requestPaths}
                      onPortChange={handleWebSocketMockPortChange}
                      onPathChange={(value: string) => updateActiveWebSocketMockScenario({ path: value })}
                      onIntervalMsChange={(value: number) => updateActiveWebSocketMockScenario({ intervalMs: value })}
                      onLoopChange={(value: boolean) => updateActiveWebSocketMockScenario({ loop: value })}
                      onMaxLoopsChange={(value: number) => updateActiveWebSocketMockScenario({ maxLoops: value })}
                      onStreamOnConnectChange={(value: boolean) =>
                        updateActiveWebSocketMockScenario({ streamOnConnect: value })
                      }
                      onScenarioSelect={selectWebSocketMockScenario}
                      onScenarioChange={updateActiveWebSocketMockScenario}
                      onAddScenario={addWebSocketMockScenario}
                      onStart={() => void startWebSocketMockServer()}
                      onStop={() => void stopWebSocketMockServer()}
                      onSendOnce={() => void sendWebSocketMockOnce()}
                      onCopy={copyActiveWebSocketMockResponse}
                    />
                  ) : (
                    <Stack spacing={1.2} sx={{ maxWidth: 760 }}>
                      <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Stack spacing={1.1}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="h6">gRPC mock</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {`${mockServer.bindHost}:${mockServerStatus.port ?? mockServer.port} · ${mockServerStatus.running ? uiCopy.status.running : uiCopy.status.stopped}`}
                            </Typography>
                          </Box>

                          {activeRequestMockContext.state === "broken" ? (
                            <Alert severity="warning" variant="outlined">
                              <Stack spacing={0.8}>
                                <Typography variant="body2">{activeRequestMockContext.message}</Typography>
                                <Stack direction="row" spacing={0.6}>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => {
                                      setSideSection("proto-schemas");
                                      setSidebarOpen(true);
                                    }}
                                  >
                                    Open schemas
                                  </Button>
                                  <Button size="small" variant="text" onClick={() => setRequestTab("body")}>
                                    Back
                                  </Button>
                                </Stack>
                              </Stack>
                            </Alert>
                          ) : activeRequestMockContext.state === "invalid-source" ? (
                            <Alert severity="error" variant="outlined">
                              <Stack spacing={0.8}>
                                <Typography variant="body2">Scenario file could not be read.</Typography>
                                <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                                  {activeRequestMockContext.message}
                                </Typography>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={openActiveRequestMockWorkspace}
                                  sx={{ alignSelf: "flex-start" }}
                                >
                                  Open workspace
                                </Button>
                              </Stack>
                            </Alert>
                          ) : activeRequestMockContext.state === "not-grpc" ? (
                            <Alert severity="info" variant="outlined">
                              Select a gRPC request.
                            </Alert>
                          ) : (
                            <>
                              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography variant="caption" color="text.secondary">
                                    Proto
                                  </Typography>
                                  <Typography variant="subtitle2" noWrap title={activeRequestMockContext.library.name}>
                                    {activeRequestMockContext.library.name}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {activeRequestMockContext.version.version}
                                    {!activeRequestMockContext.attached ? " · Not attached" : ""}
                                  </Typography>
                                </Box>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography variant="caption" color="text.secondary">
                                    Method
                                  </Typography>
                                  <Typography
                                    variant="subtitle2"
                                    noWrap
                                    title={`${activeRequestMockContext.method.serviceName}/${activeRequestMockContext.method.methodName}`}
                                  >
                                    {activeRequestMockContext.method.methodName}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {rpcMethodKindLabel(activeRequestMockContext.method)}
                                  </Typography>
                                </Box>
                              </Stack>

                              {(activeRequestMockContext.state === "available" ||
                                activeRequestMockContext.state === "missing") &&
                              !activeRequestMockContext.attached ? (
                                <Alert severity="info" variant="outlined">
                                  This method is not attached yet. Enabling the mock, selecting a scenario, or adding a
                                  scenario here will attach this request's pinned Proto revision automatically.
                                </Alert>
                              ) : null}

                              {activeRequestMockContext.state === "available" ||
                              activeRequestMockContext.state === "missing" ? (
                                <Paper variant="outlined" sx={{ p: 1.2, bgcolor: "action.hover" }}>
                                  <Stack spacing={1}>
                                    <Box>
                                      <Typography variant="body2" fontWeight={600}>
                                        {uiCopy.sections.scenario}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        Uses the same scenario controls and settings flow as Workspace Mock.
                                      </Typography>
                                    </Box>
                                    {activeRequestMockContext.scenarios.length > 0 ? (
                                      <GrpcMockScenarioControls
                                        scenarios={activeRequestMockContext.scenarios}
                                        selectedScenarioId={activeRequestMockContext.selectedScenario?.id ?? ""}
                                        enabled={activeRequestMockContext.enabled}
                                        onEnabledChange={setActiveRequestMockEnabled}
                                        onScenarioSelect={selectActiveRequestScenario}
                                        onOpenSettings={setRequestMockSettingsAnchor}
                                      />
                                    ) : (
                                      <Stack direction="row" spacing={0.7} alignItems="center">
                                        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                                          No scenario for this method yet.
                                        </Typography>
                                        <Button size="small" variant="outlined" onClick={addActiveRequestMockScenario}>
                                          Add scenario
                                        </Button>
                                      </Stack>
                                    )}
                                  </Stack>
                                </Paper>
                              ) : null}
                              <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                                <Button size="small" variant="outlined" onClick={openActiveRequestMockWorkspace}>
                                  Configure in workspace
                                </Button>
                              </Stack>
                            </>
                          )}
                        </Stack>
                      </Paper>
                    </Stack>
                  ))}
                {requestTab === "docs" && (
                  <UnifiedDocumentationPanel
                    page={activeRequestDocumentationPage}
                    source={activeDocumentationSource}
                    settings={documentation.settings}
                    onSaveSource={saveDocumentationSource}
                    onOpenRequest={() => setRequestTab("body")}
                    onPublish={() => void publishDocumentationPage(activeRequestDocumentationPage?.id ?? "")}
                    onEditExample={(id: string, tab?: ExampleEditorTab) => openExampleEditor(id, tab)}
                    defaultTab="content"
                  />
                )}
                {requestTab === "more" && (
                  <Stack spacing={1.2} sx={{ maxWidth: 920 }}>
                    <Stack spacing={0.2}>
                      <Typography variant="subtitle1">Request settings</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Transport details and less-frequent tools live here so Message, Auth, and Metadata stay focused.
                      </Typography>
                    </Stack>

                    <Stack spacing={0} sx={{ borderTop: "1px solid", borderColor: "divider" }}>
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={1}
                        alignItems={{ xs: "stretch", md: "center" }}
                        sx={{ py: 1, borderBottom: "1px solid", borderColor: "divider" }}
                      >
                        <Box sx={{ width: { md: 180 }, flexShrink: 0 }}>
                          <Typography variant="body2" fontWeight={500}>Environment</Typography>
                          <Typography variant="caption" color="text.secondary">Active request environment</Typography>
                        </Box>
                        <Typography variant="body2">{featureEnvironmentLabel(environments, activeEnvironmentKey)}</Typography>
                      </Stack>
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={1}
                        alignItems={{ xs: "stretch", md: "center" }}
                        sx={{ py: 1, borderBottom: "1px solid", borderColor: "divider" }}
                      >
                        <Box sx={{ width: { md: 180 }, flexShrink: 0 }}>
                          <Typography variant="body2" fontWeight={500}>Transport</Typography>
                          <Typography variant="caption" color="text.secondary">Resolved transport and target</Typography>
                        </Box>
                        <Stack spacing={0.2} sx={{ minWidth: 0 }}>
                          <Typography variant="body2">{activeTransportMode}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                            {previewUrl}
                          </Typography>
                        </Stack>
                      </Stack>
                    </Stack>

                    <Stack spacing={0.65}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Tools
                      </Typography>
                      <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                        <Button size="small" variant="outlined" onClick={() => setRequestTab("examples")}>
                          Examples{currentExamples.length ? ` (${currentExamples.length})` : ""}
                        </Button>
                        <Button size="small" variant="outlined" onClick={() => setRequestTab("docs")}>
                          Documentation
                        </Button>
                        {!activeIsRest ? (
                          <Button size="small" variant="outlined" onClick={() => setRequestTab("benchmark")}>
                            Benchmark
                          </Button>
                        ) : null}
                        {!activeIsRest && !activeIsWebSocket ? (
                          <Button size="small" variant="outlined" onClick={() => setRequestTab("schema")}>
                            Open schema
                          </Button>
                        ) : null}
                      </Stack>
                    </Stack>
                  </Stack>
                )}
                {requestTab === "benchmark" &&
                  (activeIsWebSocket ? (
                    <WebSocketBenchmarkPanel
                      request={activeCollectionRequest}
                      iterations={wsBenchmarkIterations}
                      onIterationsChange={setWsBenchmarkIterations}
                      running={wsBenchmarkRunning}
                      results={wsBenchmarkResults}
                      lastResult={lastResult}
                      onRun={() => void runWebSocketBenchmark()}
                      onStop={stopWebSocketBenchmark}
                      onExport={exportWebSocketBenchmark}
                    />
                  ) : (
                    <FeatureBenchmarkPanel
                      selectedMethod={selectedMethod}
                      iterations={benchmark.iterations}
                      onIterationsChange={benchmark.setIterations}
                      periodMs={benchmark.periodMs}
                      onPeriodMsChange={benchmark.setPeriodMs}
                      running={benchmark.running}
                      results={benchmark.results}
                      onRun={() => void benchmark.runBenchmark()}
                      onStop={benchmark.stopBenchmark}
                      onExportBenchmark={exportCurrentBenchmark}
                    />
                  ))}
                {requestTab === "examples" && (
                  <ExamplesPanel
                    examples={currentExamples}
                    selectedMethod={selectedMethod}
                    canSave={Boolean(selectedMethod || activeCollectionRequest)}
                    onSave={saveCurrentExample}
                    onImport={() => exampleInputRef.current?.click()}
                    onExport={exportCurrentMethodExamples}
                    onLoad={loadExample}
                    onRun={(example: SavedExample) => void runExample(example)}
                    onEdit={(example: SavedExample, tab?: ExampleEditorTab) => openExampleEditor(example, tab)}
                    onDuplicate={duplicateExample}
                    onDelete={(id: string) =>
                      setExamples((current: SavedExample[]) => current.filter((item) => item.id !== id))
                    }
                  />
                )}
              </Box>
          </Paper>
        )}
            {sideSection === "collections" ? (
              <>
            <Box
              role="separator"
              tabIndex={0}
              aria-orientation={effectiveRequestResponseLayout === "horizontal" ? "vertical" : "horizontal"}
              aria-label="Resize request and response panels"
              aria-valuenow={effectiveRequestResponseLayout === "horizontal" ? responseWidth : responseHeight}
              aria-valuetext={`${effectiveRequestResponseLayout === "horizontal" ? responseWidth : responseHeight} pixels`}
              onMouseDown={beginResponseResize}
              onKeyDown={resizeResponseByKeyboard}
              sx={{
                width: effectiveRequestResponseLayout === "horizontal" ? 8 : "100%",
                height: effectiveRequestResponseLayout === "horizontal" ? "100%" : 8,
                flexShrink: 0,
                cursor: effectiveRequestResponseLayout === "horizontal" ? "col-resize" : "row-resize",
                display: responseFullscreen || responseCollapsed ? "none" : "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "transparent",
                opacity: 1,
                outline: "none",
                "&::after": {
                  content: '""',
                  width: effectiveRequestResponseLayout === "horizontal" ? 1 : "100%",
                  height: effectiveRequestResponseLayout === "horizontal" ? "100%" : 1,
                  bgcolor: "transparent",
                },
                "&:hover::after, &:focus-visible::after": {
                  bgcolor: "var(--border-strong)",
                },
                "&:active::after": {
                  bgcolor: "primary.main",
                },
              }}
            />

            {renderResponseLayer(
              <>
                {responseFullscreen ? (
                  <Box
                    aria-hidden="true"
                    onClick={() => setResponseFullscreen(false)}
                    sx={{
                      position: "absolute",
                      inset: 0,
                      zIndex: 0,
                      bgcolor: "rgba(2,6,23,0.72)",
                      backdropFilter: "blur(3px)",
                    }}
                  />
                ) : null}

                <Paper
                  elevation={0}
                  role={responseFullscreen ? "dialog" : undefined}
                  aria-modal={responseFullscreen ? true : undefined}
                  aria-label={responseFullscreen ? "Full screen response" : undefined}
                  sx={{
                    ...panelSx,
                    flex:
                      effectiveRequestResponseLayout === "horizontal"
                        ? responseCollapsed
                          ? "0 0 30px"
                          : `0 0 ${responseWidth}px`
                        : responseCollapsed
                          ? "0 0 30px"
                          : `0 0 ${responseHeight}px`,
                    minHeight:
                      effectiveRequestResponseLayout === "horizontal" ? 0 : responseCollapsed ? 30 : minResponseHeight,
                    minWidth:
                      effectiveRequestResponseLayout === "horizontal" ? (responseCollapsed ? 30 : minResponseWidth) : 0,
                    maxWidth:
                      effectiveRequestResponseLayout === "horizontal" && !responseFullscreen
                        ? "calc(100% - 360px)"
                        : undefined,
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: 0,
                    borderLeft: 0,
                    borderRight: 0,
                    borderBottom: 0,
                    borderTop: 0,
                    boxShadow: "none",
                    bgcolor: "background.paper",
                    ...(responseFullscreen
                      ? {
                          position: "absolute",
                          top: 24,
                          right: 24,
                          bottom: 24,
                          left: 24,
                          zIndex: 1,
                          width: "auto",
                          height: "auto",
                          minWidth: 0,
                          minHeight: 0,
                          flex: "none",
                          border: "1px solid",
                          borderRadius: 1,
                          borderColor: "primary.main",
                          boxShadow: "0 28px 90px rgba(0,0,0,0.5)",
                        }
                      : {}),
                  }}
                >
                  <ResponseToolbar
                    filter={responseFilter}
                    highlightQuery={deferredResponseFilter}
                    searchScopeKey={responseTab}
                    searchRootId={`response-viewer-panel-${responseTab}`}
                    summary={responseSummary}
                    hasEvents={events.length > 0}
                    hasLastResult={Boolean(lastResult)}
                    canSaveDocs={Boolean(lastResult && selectedMethod)}
                    onFilterChange={handleResponseFilterChange}
                    onClearFilter={clearResponseFilter}
                    onExport={exportResponseStable}
                    onSaveDocs={() => {
                      saveCurrentResultForDocsStable();
                      setRequestUtilityDialog("docs");
                    }}
                    onClearResponse={clearActiveResponseStable}
                    fullscreen={responseFullscreen}
                    onToggleFullscreen={() => setResponseFullscreen((current) => !current)}
                    collapsed={responseCollapsed}
                    onToggleCollapsed={() => setResponseCollapsed((current) => !current)}
                    layout={effectiveRequestResponseLayout}
                  />
                  {!responseCollapsed ? (
                    <ResponseWorkbenchTabs
                      value={responseTab}
                      onChange={handleResponseTabChange}
                      kind={activeIsRest ? "rest" : activeIsWebSocket ? "websocket" : "grpc"}
                      streaming={Boolean(selectedMethod?.responseStream || activeIsWebSocket)}
                    />
                  ) : null}
                  {!responseCollapsed ? (
                    <Box
                    ref={responseBodyRef}
                    role="tabpanel"
                    id={`response-viewer-panel-${responseTab}`}
                    aria-labelledby={`response-viewer-tab-${responseTab}`}
                    tabIndex={0}
                    className="response-selectable"
                    onScroll={handleResponseBodyScroll}
                    sx={{
                      p: designSystem.space.panelPadding,
                      flex: 1,
                      minHeight: 0,
                      minWidth: 0,
                      overflow: responseTab === "latest" ? "hidden" : "auto",
                      position: "relative",
                      display: responseTab === "latest" ? "flex" : "block",
                      flexDirection: responseTab === "latest" ? "column" : undefined,
                    }}
                  >
                    {responseTab === "messages" && (events.length > 0 || Boolean(lastResult)) && (
                      <FeatureMessageTable
                        empty={
                          activeIsWebSocket
                            ? "Connect the WebSocket to see communication events."
                            : "Run a request to see the response."
                        }
                        events={searchedMessageEvents}
                        filterQuery={deferredResponseFilter}
                      />
                    )}
                    {responseTab === "messages" && showMessageTopButton && (
                      <Tooltip
                        title={pendingMessageCount > 0 ? `${pendingMessageCount} new message(s)` : "Top message"}
                      >
                        <IconButton
                          size="small"
                          color="primary"
                          aria-label="Scroll to top message"
                          onClick={scrollMessagesToTop}
                          sx={{
                            position: "fixed",
                            right: 24,
                            bottom: 76,
                            zIndex: 60,
                            bgcolor: "background.paper",
                            borderColor: "divider",
                            boxShadow: "0 12px 32px rgba(15, 23, 42, 0.22)",
                          }}
                        >
                          <KeyboardArrowUp fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {responseTab === "latest" && (
                      <Stack
                        spacing={0.8}
                        sx={{
                          width: "100%",
                          minWidth: 0,
                          minHeight: 0,
                          flex: 1,
                          overflow: "hidden",
                          "& > .code-viewer--fill": { height: "auto" },
                        }}
                      >
                        <Stack direction="row" spacing={0.7} alignItems="center">
                          <TextField
                            size="small"
                            value={responseFilter}
                            onChange={handleResponseFilterChange}
                            placeholder="Search latest JSON"
                            inputProps={{ "aria-label": "Search latest JSON" }}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <Search sx={{ fontSize: 16 }} />
                                </InputAdornment>
                              ),
                            }}
                            sx={{ width: 260, maxWidth: "55vw" }}
                          />
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<ContentCopy />}
                            disabled={latestResponsePayload === undefined}
                            onClick={() => void copyLatestResponseJson()}
                          >
                            Copy JSON
                          </Button>
                        </Stack>
                        <FeatureLatestResponseJsonViewer
                          value={latestResponsePayload}
                          filterQuery={deferredResponseFilter}
                          fullHeight
                        />
                      </Stack>
                    )}
                    {responseTab === "headers" && (
                      <FeatureJsonBlock
                        value={events
                          .filter((event: any) => event.kind === "headers")
                          .map((event: any) => event.fullPayload ?? event.payload)}
                        highlightQuery={deferredResponseFilter}
                        fullHeight={responseFullscreen}
                      />
                    )}
                    {responseTab === "timeline" && (
                      <Stack spacing={0} sx={{ minWidth: 0 }}>
                        {events.map((event: any, index: number) => (
                          <Stack
                            key={event.id ?? `${event.timestamp}-${index}`}
                            direction="row"
                            spacing={1}
                            alignItems="baseline"
                            sx={{ minHeight: 24, py: 0.35, borderBottom: "1px solid", borderColor: "divider" }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ width: 92, flexShrink: 0, fontFamily: "monospace" }}
                            >
                              {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ""}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ width: 62, flexShrink: 0 }}>
                              {event.kind}
                            </Typography>
                            <Typography variant="body2" sx={{ minWidth: 0, wordBreak: "break-word" }}>
                              {event.title}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    )}
                    {responseTab === "trailers" && (
                      <FeatureJsonBlock
                        value={events
                          .filter((event: any) => event.kind === "trailers")
                          .map((event: any) => event.fullPayload ?? event.payload)}
                        highlightQuery={deferredResponseFilter}
                        fullHeight={responseFullscreen}
                      />
                    )}
                    {responseTab === "tests" &&
                      (safeAssertionResults.length > 0 ? (
                        <FeatureJsonBlock
                          value={safeAssertionResults}
                          highlightQuery={deferredResponseFilter}
                          fullHeight={responseFullscreen}
                        />
                      ) : (
                        <Alert severity="info" variant="outlined">
                          No test assertions have been evaluated for this response.
                        </Alert>
                      ))}
                    </Box>
                  ) : null}
                </Paper>
              </>,
            )}
              </>
            ) : null}
          </Stack>

      <Dialog
        open={Boolean(requestUtilityDialog)}
        onClose={() => setRequestUtilityDialog(null)}
        fullWidth
        maxWidth={requestUtilityDialog === "settings" ? "sm" : "lg"}
      >
        <DialogTitle>
          {requestUtilityDialog === "examples"
            ? "Examples"
            : requestUtilityDialog === "docs"
              ? "Documentation"
              : requestUtilityDialog === "benchmark"
                ? "Benchmark"
                : "Request settings"}
        </DialogTitle>
        <DialogContent sx={{ pt: 1, maxHeight: "76vh", overflow: "auto" }}>
          {requestUtilityDialog === "examples" ? (
            <ExamplesPanel
              examples={currentExamples}
              selectedMethod={selectedMethod}
              canSave={Boolean(selectedMethod || activeCollectionRequest)}
              onSave={saveCurrentExample}
              onImport={() => exampleInputRef.current?.click()}
              onExport={exportCurrentMethodExamples}
              onLoad={loadExample}
              onRun={(example: SavedExample) => void runExample(example)}
              onEdit={(example: SavedExample, tab?: ExampleEditorTab) => openExampleEditor(example, tab)}
              onDuplicate={duplicateExample}
              onDelete={(id: string) =>
                setExamples((current: SavedExample[]) => current.filter((item) => item.id !== id))
              }
            />
          ) : requestUtilityDialog === "docs" ? (
            <UnifiedDocumentationPanel
              page={activeRequestDocumentationPage}
              source={activeDocumentationSource}
              settings={documentation.settings}
              onSaveSource={saveDocumentationSource}
              onOpenRequest={() => setRequestUtilityDialog(null)}
              onPublish={() => void publishDocumentationPage(activeRequestDocumentationPage?.id ?? "")}
              onEditExample={(id: string, tab?: ExampleEditorTab) => openExampleEditor(id, tab)}
              defaultTab="content"
            />
          ) : requestUtilityDialog === "benchmark" ? (
            activeIsWebSocket ? (
              <WebSocketBenchmarkPanel
                request={activeCollectionRequest}
                iterations={wsBenchmarkIterations}
                onIterationsChange={setWsBenchmarkIterations}
                running={wsBenchmarkRunning}
                results={wsBenchmarkResults}
                lastResult={lastResult}
                onRun={() => void runWebSocketBenchmark()}
                onStop={stopWebSocketBenchmark}
                onExport={exportWebSocketBenchmark}
              />
            ) : (
              <FeatureBenchmarkPanel
                selectedMethod={selectedMethod}
                iterations={benchmark.iterations}
                onIterationsChange={benchmark.setIterations}
                periodMs={benchmark.periodMs}
                onPeriodMsChange={benchmark.setPeriodMs}
                running={benchmark.running}
                results={benchmark.results}
                onRun={() => void benchmark.runBenchmark()}
                onStop={benchmark.stopBenchmark}
                onExportBenchmark={exportCurrentBenchmark}
              />
            )
          ) : requestUtilityDialog === "settings" ? (
            <Stack spacing={0}>
              <Stack direction="row" spacing={1.5} sx={{ py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography variant="body2" color="text.secondary" sx={{ width: 120, flexShrink: 0 }}>Environment</Typography>
                <Typography variant="body2">{featureEnvironmentLabel(environments, activeEnvironmentKey)}</Typography>
              </Stack>
              <Stack direction="row" spacing={1.5} sx={{ py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography variant="body2" color="text.secondary" sx={{ width: 120, flexShrink: 0 }}>Transport</Typography>
                <Typography variant="body2">{activeTransportMode}</Typography>
              </Stack>
              <Stack direction="row" spacing={1.5} sx={{ py: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ width: 120, flexShrink: 0 }}>Endpoint</Typography>
                <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>{previewUrl}</Typography>
              </Stack>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRequestUtilityDialog(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Menu
        anchorEl={requestMockMenuAnchor}
        open={Boolean(requestMockMenuAnchor)}
        onClose={() => setRequestMockMenuAnchor(null)}
      >
        {activeRequestMockContext.state === "available"
          ? activeRequestMockContext.scenarios.map((scenario: MockScenario) => (
              <MenuItem
                key={scenario.id}
                selected={activeRequestMockContext.selectedScenario?.id === scenario.id}
                onClick={() => {
                  setRequestMockMenuAnchor(null);
                  selectActiveRequestScenario(scenario.id);
                }}
              >
                {selectedMethod ? mockScenarioDisplayName(scenario, selectedMethod) : scenario.id}
              </MenuItem>
            ))
          : null}
      </Menu>

      <Menu
        anchorEl={requestToolsMenuAnchor}
        open={Boolean(requestToolsMenuAnchor)}
        onClose={() => setRequestToolsMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setRequestToolsMenuAnchor(null);
            setRequestUtilityDialog("examples");
          }}
        >
          Examples{currentExamples.length ? ` (${currentExamples.length})` : ""}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setRequestToolsMenuAnchor(null);
            setRequestUtilityDialog("docs");
          }}
        >
          Documentation
        </MenuItem>
        {!activeIsRest ? (
          <MenuItem
            onClick={() => {
              setRequestToolsMenuAnchor(null);
              setRequestUtilityDialog("benchmark");
            }}
          >
            Benchmark
          </MenuItem>
        ) : null}
        <Divider />
        <MenuItem
          onClick={() => {
            setRequestToolsMenuAnchor(null);
            setRequestUtilityDialog("settings");
          }}
        >
          Request settings
        </MenuItem>
      </Menu>

      <GrpcMockScenarioActionsMenu
        anchor={requestMockSettingsAnchor}
        scenarioId={
          activeRequestMockContext.state === "available" ? activeRequestMockContext.selectedScenario?.id ?? "" : ""
        }
        enabled={
          activeRequestMockContext.state === "available" || activeRequestMockContext.state === "missing"
            ? activeRequestMockContext.enabled
            : false
        }
        onClose={() => setRequestMockSettingsAnchor(null)}
        onEditSource={() => {
          if (activeRequestMockContext.state === "available" && activeRequestMockContext.selectedScenario) {
            openActiveRequestScenarioEditor(activeRequestMockContext.selectedScenario.id);
          }
        }}
        onManageScenarios={() => setRequestMockManagerOpen(true)}
        onAddScenario={addActiveRequestMockScenario}
        onToggleEnabled={() => {
          if (activeRequestMockContext.state === "available" || activeRequestMockContext.state === "missing") {
            setActiveRequestMockEnabled(!activeRequestMockContext.enabled);
          }
        }}
        onDuplicateActive={() => {
          if (activeRequestMockContext.state === "available" && activeRequestMockContext.selectedScenario) {
            duplicateActiveRequestMockScenario(activeRequestMockContext.selectedScenario.id);
          }
        }}
        onDeleteActive={() => {
          if (activeRequestMockContext.state === "available" && activeRequestMockContext.selectedScenario) {
            deleteActiveRequestMockScenario(activeRequestMockContext.selectedScenario.id);
          }
        }}
        showAddScenario
      />

      <GrpcMockScenarioManagerDialog
        open={requestMockManagerOpen}
        method={
          activeRequestMockContext.state === "available" || activeRequestMockContext.state === "missing"
            ? activeRequestMockContext.method
            : null
        }
        scenarios={activeRequestMockRows.map((row) => row.scenario)}
        activeScenarioId={
          activeRequestMockContext.state === "available" ? activeRequestMockContext.selectedScenario?.id ?? "" : ""
        }
        enabled={
          activeRequestMockContext.state === "available" || activeRequestMockContext.state === "missing"
            ? activeRequestMockContext.enabled
            : false
        }
        onClose={() => setRequestMockManagerOpen(false)}
        onSelect={(scenarioId) => {
          selectActiveRequestScenario(scenarioId);
          setActiveRequestMockEnabled(true);
        }}
        onEdit={openActiveRequestScenarioEditor}
        onDuplicate={duplicateActiveRequestMockScenario}
        onDelete={(scenarioId) => {
          // Tear down the modal/focus trap before opening the native confirm.
          // Electron can otherwise leave the native scenario <select> unable to
          // receive pointer input after the confirm closes.
          setRequestMockManagerOpen(false);
          window.setTimeout(() => {
            deleteActiveRequestMockScenario(scenarioId);
          }, 0);
        }}
        onAdd={addActiveRequestMockScenario}
      />

      <GrpcScenarioSourceDialog
        open={Boolean(activeRequestMockEditorRow)}
        row={activeRequestMockEditorRow}
        mockServer={mockServer}
        onClose={closeActiveRequestScenarioEditor}
        onSaveScenario={saveActiveRequestMockScenario}
        onDirtyChange={setRequestMockEditorDirty}
        onFetchFile={async () => (await fetchMockScenarioFilesFromWorkspace?.()) ?? null}
        onOpenFolder={(relativePath) => openMockScenarioFolder?.(relativePath)}
      />

      <ExampleEditorDialog
        open={Boolean(exampleEditorState && editingExample)}
        example={editingExample}
        initialTab={exampleEditorState?.tab ?? "general"}
        onClose={() => setExampleEditorState(null)}
        onSave={saveEditedExample}
        onDuplicate={duplicateExample}
      />
    </Box>
  );
}
