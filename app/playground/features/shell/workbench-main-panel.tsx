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
import { methodKey } from "../../shared/rpc-method-utils";
import { uiCopy } from "../../shared/ui-copy";
import { MethodStatusIndicator } from "../../shared/components/method-status-indicator";
import { mockScenarioDisplayName, rpcMethodKindLabel } from "../mock-server/mock-scenario-ui";
import { getMockMethodScenarioFile, parseMockScenarioText } from "../mock-server/mock-scenario-model";
import { ServicesWorkspace } from "../services/services-workspace";
import { SettingsWorkspace } from "../settings/settings-workspace";
import { ProtoSchemaWorkspace } from "../proto-registry/proto-schema-workspace";
import { GitSourceControlWorkspace } from "../git/git-source-control";
import { ExampleEditorDialog, type ExampleEditorTab } from "../examples/examples-panel";
import type {
  EnvironmentConfig,
  MockScenario,
  RequestTab,
  RestAuthConfig,
  RestBodyType,
  SavedExample,
  TransportMode,
} from "../../shared/workbench-types";

type ButtonClickEvent = ReactMouseEvent<HTMLButtonElement>;
type ElementClickEvent = ReactMouseEvent<HTMLElement>;
type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SelectInputChangeEvent = ChangeEvent<HTMLSelectElement>;
type TextInputKeyboardEvent = ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>;

type WorkbenchViewContext = Record<string, any>;

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
    Paper,
    PlayArrow,
    ResponseToolbar,
    ResponseWorkbenchTabs,
    RestMockPanel,
    RestPairEditor,
    Select,
    Search,
    Stack,
    StopCircle,
    Storage,
    Stream,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
    UploadFile,
    WebSocketBenchmarkPanel,
    WebSocketMockPanel,
    WorkbenchTabs,
    activeCollectionRequest,
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
    minResponseHeight,
    minResponseWidth,
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
    requestRunner,
    requestTab,
    requestTabItems,
    responseBodyRef,
    responseFields,
    responseFilter,
    responseSearchScope,
    pendingMessageCount,
    setPendingMessageCount,
    setAuthorizationMetadata,
    responseHeight,
    responseTab,
    responseWidth,
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
    showEmptyWorkbench,
    showMessageTopButton,
    startRestMockServer,
    startWebSocketMockServer,
    stopRestMockServer,
    stopWebSocketBenchmark,
    stopWebSocketMockServer,
    targetDraft,
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
  const authorizationValue =
    metadata.find((item: MetadataPair) => item.key.trim().toLowerCase() === "authorization")?.value ?? "";
  const responseSummary = activeRunning
    ? activeIsWebSocket
      ? `Connected · ${messageEvents.length} message${messageEvents.length === 1 ? "" : "s"}`
      : `Active · ${messageEvents.length} message${messageEvents.length === 1 ? "" : "s"}`
    : lastResult
      ? `${lastResult.httpStatus ? `HTTP ${lastResult.httpStatus}` : lastResult.trailers?.["grpc-status"] === "0" ? "OK" : "Complete"} · ${Math.round(lastResult.durationMs ?? 0)} ms · ${(lastResult.messages ?? []).length} message${(lastResult.messages ?? []).length === 1 ? "" : "s"}`
      : "No response yet";
  const safeAssertionResults = Array.isArray(assertionResults) ? assertionResults : [];
  const activeGrpcBinding = activeCollectionRequest?.kind === "grpc" ? activeCollectionRequest.grpc : undefined;
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

  async function copyLatestResponseJson() {
    if (latestResponsePayload === undefined) return;
    const text =
      typeof latestResponsePayload === "string"
        ? latestResponsePayload
        : JSON.stringify(latestResponsePayload, null, 2);
    await copyTextWithAnnouncement(text, "Latest response");
  }

  function selectActiveRequestMockContext() {
    if (activeRequestMockContext.state === "not-grpc" || activeRequestMockContext.state === "broken") return;
    selectProtoLibraryVersion(activeRequestMockContext.library.id, activeRequestMockContext.version.id);
    setMockSelectedMethodKey(methodKey(activeRequestMockContext.method));
  }

  function selectActiveRequestScenario(scenarioId: string) {
    if (activeRequestMockContext.state !== "available") return;
    setMockServer((current: any) => ({
      ...current,
      selectedScenarioIds: {
        ...current.selectedScenarioIds,
        [activeRequestMockContext.key]: scenarioId,
      },
      updatedAt: new Date().toISOString(),
    }));
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
    if (sideSection !== "collections" || showEmptyWorkbench || protoPreview) setResponseFullscreen(false);
  }, [sideSection, showEmptyWorkbench, protoPreview]);

  function handleRequestTabChange(nextTab: RequestTab) {
    // Request tabs must be navigation-only. Opening Mock must not attach Proto,
    // create a scenario, or move the user to Services without an explicit action.
    setRequestTab(nextTab);
  }

  // Side/stack controls belong to the request + response editor only. Applying
  // that flex direction to Settings, Schemas, Services, Docs, or Git made those
  // single-pane pages shrink to their content width when Side mode was active.
  const requestSplitLayoutActive =
    sideSection === "collections" &&
    !showEmptyWorkbench &&
    !protoPreview &&
    Boolean(activeCollectionRequest || selectedMethod);
  const mainPanelDirection = requestSplitLayoutActive && requestResponseLayout === "horizontal" ? "row" : "column";
  const requestHeaderTitle =
    activeCollectionRequest?.name ?? selectedMethod?.methodName ?? "Select a collection request";
  const requestHeaderContext = selectedMethod
    ? `${selectedMethod.serviceName} / ${selectedMethod.methodName} · ${methodTypeLabel(selectedMethod)}`
    : activeCollectionRequest?.kind === "rest"
      ? `${activeCollectionRequest.collectionName ?? "REST"} · ${activeCollectionRequest.url}`
      : activeCollectionRequest?.kind === "websocket"
        ? `${activeCollectionRequest.collectionName ?? "WebSocket"} · ${activeCollectionRequest.url}`
        : (activeCollectionRequest?.collectionName ?? "Import or add a collection request.");
  const requestHeaderBadge = activeIsRest
    ? (activeCollectionRequest?.method ?? "GET")
    : activeIsWebSocket
      ? "WebSocket"
      : selectedMethod || activeCollectionRequest?.kind === "grpc"
        ? "gRPC"
        : "";

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
        bottom: 24,
        px: "var(--workbench-page-padding-x)",
        py: "var(--workbench-page-padding-y)",
        overflow: "hidden",
        zIndex: "auto",
      }}
    >
      <Stack
        direction={mainPanelDirection}
        spacing={requestSplitLayoutActive ? 0 : "var(--workbench-panel-gap)"}
        sx={{ height: "100%", width: "100%", minHeight: 0, minWidth: 0, overflow: "hidden" }}
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
              p: 1.6,
            }}
          >
            <Stack spacing={1.2}>
              <Box>
                <Typography variant="h6">Published Docs</Typography>
              </Box>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                <Paper variant="outlined" sx={{ p: 1.4, flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Pages
                  </Typography>
                  <Typography variant="h5">{documentationPages.length}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {documentationPages.filter((page: any) => page.status === "published").length} published
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.4, flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Needs attention
                  </Typography>
                  <Typography variant="h5">
                    {
                      documentationPages.filter((page: any) => page.status === "outdated" || page.status === "error")
                        .length
                    }
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Need update
                  </Typography>
                </Paper>
              </Stack>
            </Stack>
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
          <>
            <Paper
              elevation={0}
              sx={{
                ...panelSx,
                flex: "1 1 auto",
                minHeight: requestResponseLayout === "horizontal" ? 0 : 220,
                minWidth: requestResponseLayout === "horizontal" ? 360 : 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ px: 1.4, py: 0.8, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={0.55} alignItems="center" sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" noWrap title={requestHeaderTitle} sx={{ minWidth: 0 }}>
                      {requestHeaderTitle}
                    </Typography>
                    {requestHeaderBadge ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={activeIsWebSocket ? "secondary" : "primary"}
                        label={requestHeaderBadge}
                      />
                    ) : null}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap title={requestHeaderContext}>
                    {requestHeaderContext}
                  </Typography>
                </Box>
                {activeIsWebSocket && (
                  <Chip
                    size="small"
                    color={
                      wsClientState.readyState === "open"
                        ? "success"
                        : wsClientState.readyState === "connecting"
                          ? "warning"
                          : "default"
                    }
                    variant="outlined"
                    label={
                      wsClientState.readyState === "open"
                        ? "Connected"
                        : wsClientState.readyState === "connecting"
                          ? "Connecting"
                          : "Disconnected"
                    }
                  />
                )}
              </Stack>

              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ px: 1.4, py: 0.8, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  onClick={(event: ButtonClickEvent) => setEnvMenuAnchor(event.currentTarget)}
                  title={featureEnvironmentLabel(environments, activeEnvironmentKey)}
                  sx={{ width: 88, minWidth: 88, px: 0.5, justifyContent: "center", flexShrink: 0 }}
                >
                  <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {featureEnvironmentShortLabel(environments, activeEnvironmentKey)}
                  </Box>
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
                  <FormControl size="small" sx={{ width: 145 }}>
                    <Select
                      value={activeTransportMode}
                      onChange={(event: SelectInputChangeEvent) =>
                        handleTransportModeChange(event.target.value as TransportMode)
                      }
                    >
                      <MenuItem value="grpc-web">gRPC-Web</MenuItem>
                      <MenuItem value="native-grpc">Native gRPC</MenuItem>
                    </Select>
                  </FormControl>
                )}
                {activeIsRest && (
                  <FormControl size="small" sx={{ width: 108, flexShrink: 0 }}>
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
                {activeIsWebSocket ? (
                  wsClientState.readyState === "open" ? (
                    <Button size="small" variant="contained" color="error" onClick={() => closeManualWebSocketClient()}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<PlayArrow />}
                      disabled={requestActionDisabled || wsClientState.readyState === "connecting"}
                      onClick={() => {
                        commitTargetDraft();
                        handleConnectWebSocket();
                      }}
                    >
                      Connect
                    </Button>
                  )
                ) : activeRunning ? (
                  <Button
                    size="small"
                    variant="contained"
                    color="error"
                    startIcon={<StopCircle />}
                    onClick={() => requestRunner.cancelRequest()}
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<PlayArrow />}
                    disabled={requestActionDisabled}
                    onClick={() => {
                      commitTargetDraft();
                      void requestRunner.runRequest();
                    }}
                  >
                    {activeIsRest ? "Send" : "Invoke"}
                  </Button>
                )}
              </Stack>
              {requestActionDisabledReason && (
                <Alert severity="info" variant="outlined" sx={{ mx: 1.4, mt: 0.8, py: 0.2 }}>
                  {requestActionDisabledReason}
                </Alert>
              )}

              <WorkbenchTabs<RequestTab>
                value={requestTab}
                onChange={handleRequestTabChange}
                items={requestTabItems}
                idPrefix="request-editor"
                ariaLabel="Request editor sections"
              />
              <Box
                role="tabpanel"
                id={`request-editor-panel-${requestTab}`}
                aria-labelledby={`request-editor-tab-${requestTab}`}
                tabIndex={0}
                sx={{
                  p: designSystem.space.panelPadding,
                  minHeight: 0,
                  flex: 1,
                  overflow: requestResponseLayout === "horizontal" && requestTab === "body" ? "hidden" : "auto",
                  display: requestResponseLayout === "horizontal" && requestTab === "body" ? "flex" : "block",
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
                        height: requestResponseLayout === "horizontal" ? "100%" : "auto",
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
                        fullHeight={requestResponseLayout === "horizontal"}
                      />
                    </Stack>
                  ) : activeIsRest ? (
                    <Stack
                      spacing={1}
                      sx={{
                        minHeight: 0,
                        flex: 1,
                        height: requestResponseLayout === "horizontal" ? "100%" : "auto",
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
                          fullHeight={requestResponseLayout === "horizontal"}
                        />
                      )}
                    </Stack>
                  ) : (
                    <Stack
                      spacing={1}
                      sx={{
                        minHeight: 0,
                        flex: 1,
                        height: requestResponseLayout === "horizontal" ? "100%" : "auto",
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
                        fullHeight={requestResponseLayout === "horizontal"}
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
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle1">{activeIsRest ? "Headers" : "Metadata"}</Typography>
                        <Button size="small" startIcon={<Add />} onClick={addMetadataRow}>
                          Add row
                        </Button>
                      </Stack>
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Key</TableCell>
                              <TableCell>Value</TableCell>
                              <TableCell width={56}>Action</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {metadata.map((item: MetadataPair, index: number) => (
                              <TableRow key={`${item.key}-${item.value}`}>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    value={item.key}
                                    inputProps={{ "aria-label": `Metadata key ${index + 1}` }}
                                    onChange={(event: TextInputChangeEvent) =>
                                      updateMetadataRow(index, "key", event.target.value)
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    value={item.value}
                                    inputProps={{ "aria-label": `Metadata value ${index + 1}` }}
                                    onChange={(event: TextInputChangeEvent) =>
                                      updateMetadataRow(index, "value", event.target.value)
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    aria-label={`Remove metadata row ${index + 1}`}
                                    onClick={() => removeMetadataRow(index)}
                                  >
                                    <Delete sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
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
                    <Stack spacing={1}>
                      <Stack spacing={0.25}>
                        <Typography variant="subtitle1">Authorization</Typography>
                        <Typography variant="caption" color="text.secondary">
                          The value is stored as Authorization metadata and can still be inspected from the Metadata or
                          Headers tab.
                        </Typography>
                      </Stack>
                      <TextField
                        size="small"
                        fullWidth
                        label="Authorization"
                        type="password"
                        value={authorizationValue}
                        onChange={(event: TextInputChangeEvent) => setAuthorizationMetadata(event.target.value)}
                        placeholder="Bearer token"
                        helperText={
                          activeIsWebSocket
                            ? "Sent during the WebSocket handshake when supported by the runtime."
                            : "Sent as gRPC authorization metadata."
                        }
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
                    <Stack spacing={1}>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                        <Paper variant="outlined" sx={{ p: 1, flex: 1, minWidth: 0 }}>
                          <Typography variant="caption" color="text.secondary">
                            Schema
                          </Typography>
                          <Typography
                            variant="subtitle1"
                            sx={{ fontSize: 13 }}
                            noWrap
                            title={activeCollectionRequest?.grpc?.libraryId ?? "Proto schema"}
                          >
                            {activeCollectionRequest?.grpc?.libraryId ?? "Proto schema"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Revision {activeCollectionRequest?.grpc?.versionId ?? "—"}
                          </Typography>
                        </Paper>
                        <Paper variant="outlined" sx={{ p: 1, flex: 1, minWidth: 0 }}>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography variant="caption" color="text.secondary">
                                Method
                              </Typography>
                              <Typography
                                variant="subtitle1"
                                sx={{ fontSize: 13 }}
                                noWrap
                                title={
                                  selectedMethod?.methodName ??
                                  activeCollectionRequest?.grpc?.methodFullName?.split("/").at(-1) ??
                                  "Method"
                                }
                              >
                                {selectedMethod?.methodName ??
                                  activeCollectionRequest?.grpc?.methodFullName?.split("/").at(-1) ??
                                  "Method"}
                              </Typography>
                              {selectedMethod ? (
                                <Typography variant="caption" color="text.secondary">
                                  {methodTypeLabel(selectedMethod)}
                                </Typography>
                              ) : null}
                            </Box>
                            {!selectedMethod ? (
                              <MethodStatusIndicator
                                tone="error"
                                title="Method unavailable"
                                detail="The selected Proto revision could not resolve this request method. Change the schema, revision, or method binding."
                                context={activeCollectionRequest?.grpc?.methodFullName}
                              />
                            ) : null}
                          </Stack>
                        </Paper>
                      </Stack>
                      <Paper variant="outlined" sx={{ p: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Full name
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "monospace", fontSize: 11.5, wordBreak: "break-all", mt: 0.3 }}
                        >
                          {selectedMethod
                            ? `${selectedMethod.serviceName}/${selectedMethod.methodName}`
                            : (activeCollectionRequest?.grpc?.methodFullName ?? "—")}
                        </Typography>
                        <Stack direction="row" spacing={0.7} sx={{ mt: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => {
                              setSideSection("proto-schemas");
                              setSidebarOpen(true);
                            }}
                          >
                            Schema
                          </Button>
                          <Button size="small" variant="text" onClick={() => setRequestTab("body")}>
                            Body
                          </Button>
                        </Stack>
                      </Paper>
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

                              {activeRequestMockContext.state === "available" && !activeRequestMockContext.attached ? (
                                <Alert severity="info" variant="outlined">
                                  This method is not attached to gRPC Mock. Configure its Proto in the Mock workspace.
                                </Alert>
                              ) : null}

                              {activeRequestMockContext.state === "available" ? (
                                <Paper variant="outlined" sx={{ p: 1.2, bgcolor: "action.hover" }}>
                                  <Stack spacing={1}>
                                    <Box>
                                      <Typography variant="body2" fontWeight={600}>
                                        {uiCopy.sections.scenario}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        This request only selects a scenario. Configure and start mocking from the Mock
                                        workspace.
                                      </Typography>
                                    </Box>
                                    <Stack
                                      direction={{ xs: "column", sm: "row" }}
                                      spacing={0.8}
                                      alignItems={{ sm: "center" }}
                                    >
                                      <FormControl size="small" sx={{ flex: 1, minWidth: 220 }}>
                                        <Select
                                          value={
                                            activeRequestMockContext.selectedScenario?.id ??
                                            activeRequestMockContext.scenarios[0]?.id ??
                                            ""
                                          }
                                          inputProps={{ "aria-label": "Active gRPC mock scenario" }}
                                          onChange={(event: SelectInputChangeEvent) =>
                                            selectActiveRequestScenario(String(event.target.value))
                                          }
                                        >
                                          {activeRequestMockContext.scenarios.map((scenario: MockScenario) => (
                                            <MenuItem key={scenario.id} value={scenario.id}>
                                              {mockScenarioDisplayName(scenario, activeRequestMockContext.method)}
                                            </MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>
                                      <Chip
                                        size="small"
                                        color={activeRequestMockContext.enabled ? "success" : "warning"}
                                        variant="outlined"
                                        label={
                                          activeRequestMockContext.enabled
                                            ? uiCopy.status.active
                                            : uiCopy.status.inactive
                                        }
                                      />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary">
                                      {activeRequestMockContext.selectedScenario?.stream?.loop
                                        ? "Loop enabled."
                                        : "Runs once per match."}
                                    </Typography>
                                  </Stack>
                                </Paper>
                              ) : (
                                <Alert severity="info" variant="outlined">
                                  No scenario for this method.
                                </Alert>
                              )}
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
                  <Stack spacing={1.2}>
                    <Stack spacing={0.25}>
                      <Typography variant="subtitle1">Additional tools</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Advanced tools stay available without competing with the core request workflow.
                      </Typography>
                    </Stack>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      {!activeIsRest && (
                        <Paper variant="outlined" sx={{ p: 1.2, flex: 1 }}>
                          <Typography variant="subtitle1">Benchmark</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                            Measure request duration and streaming throughput for the active operation.
                          </Typography>
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ mt: 1 }}
                            onClick={() => setRequestTab("benchmark")}
                          >
                            Open benchmark
                          </Button>
                        </Paper>
                      )}
                      {!activeIsRest && !activeIsWebSocket && (
                        <Paper variant="outlined" sx={{ p: 1.2, flex: 1 }}>
                          <Typography variant="subtitle1">Definition</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                            Inspect the selected Proto service, method, request, and response types.
                          </Typography>
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ mt: 1 }}
                            onClick={() => setRequestTab("schema")}
                          >
                            Open definition
                          </Button>
                        </Paper>
                      )}
                      <Paper variant="outlined" sx={{ p: 1.2, flex: 1 }}>
                        <Typography variant="subtitle1">Technical details</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                          Inspect the resolved endpoint, transport, request identity, and schema binding.
                        </Typography>
                        <Stack spacing={0.35} sx={{ mt: 1 }}>
                          <Typography variant="caption" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                            {previewUrl}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Transport: {activeTransportMode}
                          </Typography>
                        </Stack>
                      </Paper>
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

            <Box
              role="separator"
              tabIndex={0}
              aria-orientation={requestResponseLayout === "horizontal" ? "vertical" : "horizontal"}
              aria-label="Resize request and response panels"
              aria-valuenow={requestResponseLayout === "horizontal" ? responseWidth : responseHeight}
              aria-valuetext={`${requestResponseLayout === "horizontal" ? responseWidth : responseHeight} pixels`}
              onMouseDown={beginResponseResize}
              onKeyDown={resizeResponseByKeyboard}
              sx={{
                width: requestResponseLayout === "horizontal" ? 2 : "auto",
                height: requestResponseLayout === "horizontal" ? "auto" : 2,
                flexShrink: 0,
                cursor: requestResponseLayout === "horizontal" ? "col-resize" : "row-resize",
                display: responseFullscreen ? "none" : "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "transparent",
                opacity: 1,
                "&::after": {
                  content: '""',
                  width: requestResponseLayout === "horizontal" ? 1 : 34,
                  height: requestResponseLayout === "horizontal" ? 34 : 1,
                  borderRadius: 999,
                  bgcolor: "divider",
                },
                "&:hover::after, &:focus-visible::after": { bgcolor: "primary.main" },
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
                    flex: requestResponseLayout === "horizontal" ? `0 0 ${responseWidth}px` : `0 0 ${responseHeight}px`,
                    minHeight: requestResponseLayout === "horizontal" ? 0 : minResponseHeight,
                    minWidth: requestResponseLayout === "horizontal" ? minResponseWidth : 0,
                    display: "flex",
                    flexDirection: "column",
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
                          borderColor: "rgba(96,165,250,0.45)",
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
                      setRequestTab("docs");
                    }}
                    onClearResponse={clearActiveResponseStable}
                    fullscreen={responseFullscreen}
                    onToggleFullscreen={() => setResponseFullscreen((current) => !current)}
                  />
                  <ResponseWorkbenchTabs
                    value={responseTab}
                    onChange={handleResponseTabChange}
                    kind={activeIsRest ? "rest" : activeIsWebSocket ? "websocket" : "grpc"}
                    streaming={Boolean(selectedMethod?.responseStream || activeIsWebSocket)}
                  />
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
                    {responseTab === "messages" && (
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
                </Paper>
              </>,
            )}
          </>
        )}
      </Stack>

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
