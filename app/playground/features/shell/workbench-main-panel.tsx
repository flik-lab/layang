"use client";

import type {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { ColorMode } from "../../design-system";
import type { MetadataPair } from "@/lib/types";
import type {
  EnvironmentConfig,
  MockScenario,
  RequestTab,
  RestAuthConfig,
  RestBodyType,
  SavedExample,
  TransportMode,
} from "../../shared/workbench-types";

type CompatTheme = { palette: { mode: ColorMode } };
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
    FeatureHistoryTable,
    FeatureJsonBlock,
    FeatureLatestResponseJsonViewer,
    FeatureMessageTable,
    FeatureMethodDocsPanel,
    FeatureSchemaTable,
    FormControl,
    IconButton,
    InputAdornment,
    KeyboardArrowUp,
    Language,
    ListItemText,
    Menu,
    MenuItem,
    MockServerPanel,
    Paper,
    PlayArrow,
    ResponseToolbar,
    ResponseWorkbenchTabs,
    RestDocsPanel,
    RestMockPanel,
    RestPairEditor,
    Select,
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
    WebSocketDocsPanel,
    WebSocketMockPanel,
    WorkbenchTabs,
    activeCollectionRequest,
    activeDocsResult,
    activeEnvironmentKey,
    activeIsRest,
    activeIsWebSocket,
    activeRequestId,
    activeRestMockResponseText,
    activeRestMockScenario,
    activeRestMockScenarios,
    activeRunning,
    activeSession,
    activeTransportMode,
    activeWebSocketMockResponseText,
    activeWebSocketMockScenario,
    activeWebSocketMockScenarios,
    addMetadataRow,
    addMockScenarioFromCurrent,
    addRestMockScenario,
    addRestMockScenarioPair,
    addRestPairRow,
    addWebSocketMockScenario,
    beginResponseResize,
    benchmark,
    buildActiveRestDocsMarkdown,
    buildActiveWebSocketDocsMarkdown,
    chooseEnvironment,
    clearActiveResponseStable,
    clearHistory,
    clearResponseFilter,
    closeManualWebSocketClient,
    colorTokens,
    commitTargetDraft,
    copyActiveWebSocketMockResponse,
    copyPreviewUrl,
    currentExamples,
    currentHistory,
    currentMethodDoc,
    currentMockActiveScenario,
    currentMockEditorKey,
    currentMockEditorParse,
    currentMockEditorText,
    currentMockFile,
    currentMockScenarios,
    currentRestDoc,
    currentWebSocketDoc,
    deferredResponseFilter,
    deleteCurrentMethodDoc,
    designSystem,
    downloadTextFile,
    envMenuAnchor,
    environments,
    events,
    exampleInputRef,
    exportCurrentBenchmark,
    exportCurrentMethodExamples,
    exportMockScenarioFile,
    exportPublicDocs,
    exportResponseStable,
    exportWebSocketBenchmark,
    featureEnvironmentLabel,
    featureEnvironmentShortLabel,
    featureGetEnvironmentTransportTarget,
    formatMockScenarioEditor,
    generateRandomRequestJson,
    generateRequestJsonFromSelectedScenario,
    handleMockFormatChange,
    handleMockMethodEnabledChange,
    handleMockScenarioSelectChange,
    handleMockScenarioStreamSettingsChange,
    handleMockScenarioTextChange,
    handleRequestJsonChange,
    handleResponseBodyScroll,
    handleResponseFilterChange,
    handleResponseTabChange,
    handleRestMockBindHostChange,
    handleRestMockPortChange,
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
    mockMappingRows,
    mockScenarioInputRef,
    mockServer,
    mockServerStatus,
    openEnvironmentManager,
    openMockScenarioFolder,
    openMockScenarioManager,
    openWorkspaceImporter,
    paletteMode,
    panelSx,
    prettifyRequestJson,
    previewCurrentMethodDoc,
    previewCurrentRestDoc,
    previewCurrentWebSocketDoc,
    previewUrl,
    protoInputRef,
    publishCurrentMethodDoc,
    publishCurrentRestDoc,
    publishCurrentWebSocketDoc,
    removeMetadataRow,
    removeRestMockScenarioPair,
    removeRestPairRow,
    reportPayload,
    requestFields,
    requestJson,
    requestResponseLayout,
    requestRunner,
    requestTab,
    requestTabItems,
    responseBodyRef,
    responseFields,
    responseFilter,
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
    saveCurrentResultForDocs,
    saveCurrentResultForDocsStable,
    scrollMessagesToTop,
    selectWebSocketMockScenario,
    selectedMethod,
    sendWebSocketMockOnce,
    setEnvMenuAnchor,
    setExamples,
    setMockSettingsOpen,
    setRequestTab,
    setRestMockScenarioId,
    setSideSection,
    setSidebarOpen,
    setWsBenchmarkIterations,
    shellLeft,
    showEmptyWorkbench,
    showMessageTopButton,
    slugify,
    startRestMockServer,
    startWebSocketMockServer,
    stopRestMockServer,
    stopWebSocketBenchmark,
    stopWebSocketMockServer,
    targetDraft,
    timestampForFile,
    unpublishCurrentMethodDoc,
    unpublishCurrentRestDoc,
    unpublishCurrentWebSocketDoc,
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
    wsClientRef,
    wsClientState,
    wsMockIntervalMs,
    wsMockLoop,
    wsMockMaxLoops,
    wsMockPath,
    wsMockPort,
    wsMockStatus,
    wsMockStreamOnConnect,
  } = props.ctx;

  return (
    <Box
      component="main"
      sx={{
        position: "fixed",
        top: designSystem.size.titlebarHeight,
        left: shellLeft,
        right: 0,
        bottom: 0,
        px: 1.1,
        py: 1,
        overflow: "hidden",
      }}
    >
      <Stack
        direction={requestResponseLayout === "horizontal" ? "row" : "column"}
        spacing={0.8}
        sx={{ height: "100%", minHeight: 0, overflow: "hidden" }}
      >
        {showEmptyWorkbench ? (
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
                Pick a saved tab, import a proto or workspace, or select a request from the collection sidebar to start
                testing.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
                <Button variant="contained" size="small" startIcon={<UploadFile />} onClick={openWorkspaceImporter}>
                  Import workspace
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<UploadFile />}
                  onClick={() => protoInputRef.current?.click()}
                >
                  Import proto
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Storage />}
                  onClick={() => {
                    setSideSection("registry");
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
                  <Stack direction="row" spacing={0.8} alignItems="center">
                    <Typography
                      variant="subtitle1"
                      noWrap
                      title={
                        selectedMethod
                          ? selectedMethod.methodName
                          : (activeCollectionRequest?.name ?? "Select a collection request")
                      }
                    >
                      {selectedMethod
                        ? `${selectedMethod.methodName}`
                        : (activeCollectionRequest?.name ?? "Select a collection request")}
                    </Typography>
                    {(selectedMethod || activeCollectionRequest) && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={
                          selectedMethod?.responseStream || activeCollectionRequest?.kind === "websocket"
                            ? "secondary"
                            : "primary"
                        }
                        label={
                          selectedMethod
                            ? methodTypeLabel(selectedMethod)
                            : activeCollectionRequest?.kind === "websocket"
                              ? "WebSocket"
                              : activeCollectionRequest?.kind === "rest"
                                ? (activeCollectionRequest.method ?? "REST")
                                : activeCollectionRequest?.kind === "grpc"
                                  ? "gRPC"
                                  : "Request"
                        }
                      />
                    )}
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    title={
                      selectedMethod?.serviceName ??
                      activeCollectionRequest?.collectionName ??
                      "Import or add a collection request."
                    }
                  >
                    {selectedMethod?.serviceName ??
                      activeCollectionRequest?.collectionName ??
                      "Import or add a collection request."}
                  </Typography>
                </Box>
                {activeRunning && !(activeIsWebSocket && wsClientState.readyState === "open") ? (
                  <Tooltip title="Stop running request">
                    <IconButton
                      size="small"
                      color="warning"
                      onClick={() => {
                        if (wsClientRef.current?.sessionId === activeRequestId) closeManualWebSocketClient();
                        else requestRunner.cancelRequest();
                      }}
                    >
                      <StopCircle fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<PlayArrow />}
                    disabled={
                      (!selectedMethod && !activeCollectionRequest) ||
                      (activeCollectionRequest?.kind === "grpc" && !selectedMethod) ||
                      (activeTransportMode === "native-grpc" && !isNativeBridgeAvailable)
                    }
                    onClick={() => {
                      if (activeCollectionRequest?.kind === "websocket") {
                        handleSendWebSocketMessage();
                        return;
                      }
                      commitTargetDraft();
                      void requestRunner.runRequest();
                    }}
                  >
                    {activeCollectionRequest?.kind === "websocket"
                      ? wsClientState.readyState === "open"
                        ? "Send"
                        : requestJson.trim()
                          ? "Connect & send"
                          : "Connect"
                      : activeCollectionRequest?.kind === "rest"
                        ? "Send"
                        : selectedMethod?.responseStream
                          ? "Start stream"
                          : "Send"}
                  </Button>
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
                <FormControl size="small" sx={{ width: activeIsWebSocket || activeIsRest ? 132 : 145 }}>
                  <Select
                    value={activeIsWebSocket ? "websocket" : activeIsRest ? "rest" : activeTransportMode}
                    disabled={activeIsWebSocket || activeIsRest}
                    onChange={(event: SelectInputChangeEvent) =>
                      handleTransportModeChange(event.target.value as TransportMode)
                    }
                  >
                    {activeIsWebSocket ? (
                      <MenuItem value="websocket">WebSocket</MenuItem>
                    ) : activeIsRest ? (
                      <MenuItem value="rest">REST</MenuItem>
                    ) : (
                      [
                        <MenuItem key="grpc-web" value="grpc-web">
                          gRPC-Web
                        </MenuItem>,
                        <MenuItem key="native-grpc" value="native-grpc">
                          Native gRPC
                        </MenuItem>,
                      ]
                    )}
                  </Select>
                </FormControl>
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
                  placeholder={
                    activeIsWebSocket
                      ? "ws://localhost:8080"
                      : activeIsRest
                        ? "https://api.example.com/users/:id"
                        : activeTransportMode === "native-grpc"
                          ? "localhost:50051"
                          : "APISIX / Envoy base URL"
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
                  <IconButton size="small" onClick={copyPreviewUrl}>
                    <ContentCopy sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Box
                sx={{
                  px: 1.4,
                  py: 0.8,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  bgcolor: (theme: CompatTheme) => colorTokens[paletteMode(theme.palette.mode)].surfaceAlt,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontFamily: "monospace", wordBreak: "break-all", color: "text.secondary" }}
                >
                  {previewUrl}
                </Typography>
              </Box>

              <WorkbenchTabs<RequestTab> value={requestTab} onChange={setRequestTab} items={requestTabItems} />
              <Box
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
                            color={
                              wsClientState.readyState === "open"
                                ? "success"
                                : wsClientState.readyState === "connecting"
                                  ? "warning"
                                  : "default"
                            }
                            label={
                              wsClientState.readyState === "open"
                                ? `Connected${wsClientState.messageCount ? ` · ${wsClientState.messageCount} msg` : ""}`
                                : wsClientState.readyState === "connecting"
                                  ? "Connecting"
                                  : "Disconnected"
                            }
                          />
                          {wsClientState.readyState === "open" && (
                            <Button size="small" variant="outlined" onClick={() => closeManualWebSocketClient()}>
                              Disconnect
                            </Button>
                          )}
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<PlayArrow />}
                            onClick={handleSendWebSocketMessage}
                            disabled={
                              !activeCollectionRequest ||
                              activeCollectionRequest.kind !== "websocket" ||
                              wsClientState.readyState === "connecting"
                            }
                          >
                            Send
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
                                    onChange={(event: TextInputChangeEvent) =>
                                      updateMetadataRow(index, "value", event.target.value)
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <IconButton size="small" color="error" onClick={() => removeMetadataRow(index)}>
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
                {requestTab === "schema" &&
                  (activeIsRest ? (
                    <Stack spacing={1.2}>
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
                            value={activeCollectionRequest.restAuth.token}
                            onChange={(event: TextInputChangeEvent) =>
                              updateActiveRestAuth({ type: "bearer", token: event.target.value })
                            }
                            sx={{ minWidth: 260, flex: 1 }}
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
                              sx={{ minWidth: 180 }}
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
                              sx={{ minWidth: 180 }}
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
                    <Stack spacing={1.2}>
                      <FeatureSchemaTable
                        title="Request schema"
                        typeName={selectedMethod?.requestType}
                        fields={requestFields}
                      />
                      <FeatureSchemaTable
                        title="Response schema"
                        typeName={selectedMethod?.responseType}
                        fields={responseFields}
                      />
                    </Stack>
                  ))}
                {requestTab === "history" && (
                  <FeatureHistoryTable
                    history={currentHistory}
                    filterQuery={deferredResponseFilter}
                    onClear={clearHistory}
                  />
                )}
                {requestTab === "docs" &&
                  (activeIsWebSocket ? (
                    <WebSocketDocsPanel
                      collectionRequest={activeCollectionRequest}
                      url={targetDraft}
                      message={requestJson}
                      examples={currentExamples}
                      latestResult={lastResult}
                      doc={currentWebSocketDoc}
                      onPreview={previewCurrentWebSocketDoc}
                      onPublish={publishCurrentWebSocketDoc}
                      onUnpublish={unpublishCurrentWebSocketDoc}
                      onExport={() =>
                        activeCollectionRequest &&
                        downloadTextFile(
                          `layang-ws-docs-${slugify(activeCollectionRequest.name)}-${timestampForFile()}.md`,
                          buildActiveWebSocketDocsMarkdown(),
                          "text/markdown",
                        )
                      }
                    />
                  ) : activeIsRest ? (
                    <RestDocsPanel
                      collectionRequest={activeCollectionRequest}
                      url={previewUrl}
                      latestResult={lastResult}
                      doc={currentRestDoc}
                      onPreview={previewCurrentRestDoc}
                      onPublish={publishCurrentRestDoc}
                      onUnpublish={unpublishCurrentRestDoc}
                      onExport={() =>
                        activeCollectionRequest &&
                        downloadTextFile(
                          `layang-rest-docs-${slugify(activeCollectionRequest.name)}-${timestampForFile()}.md`,
                          buildActiveRestDocsMarkdown(),
                          "text/markdown",
                        )
                      }
                    />
                  ) : (
                    <FeatureMethodDocsPanel
                      selectedMethod={selectedMethod}
                      doc={currentMethodDoc}
                      examples={currentExamples}
                      docsResult={activeDocsResult}
                      onPreview={previewCurrentMethodDoc}
                      onSaveResult={saveCurrentResultForDocs}
                      onExportPublic={exportPublicDocs}
                      onPublish={publishCurrentMethodDoc}
                      onUnpublish={unpublishCurrentMethodDoc}
                      onDelete={deleteCurrentMethodDoc}
                    />
                  ))}
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
                    onDelete={(id: string) => setExamples((current: SavedExample[]) => current.filter((item) => item.id !== id))}
                  />
                )}
                {requestTab === "mock" &&
                  (activeIsWebSocket ? (
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
                  ) : activeIsRest ? (
                    <RestMockPanel
                      request={activeCollectionRequest?.kind === "rest" ? activeCollectionRequest : null}
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
                  ) : (
                    <MockServerPanel
                      selectedMethod={selectedMethod}
                      status={mockServerStatus}
                      currentFile={currentMockFile}
                      currentParseResult={currentMockEditorParse}
                      editorInstanceKey={currentMockEditorKey}
                      editorText={currentMockEditorText}
                      streamDefaults={mockServer.streamDefaults}
                      mappingRows={mockMappingRows}
                      onScenarioTextChange={handleMockScenarioTextChange}
                      onFormatChange={handleMockFormatChange}
                      onFormat={formatMockScenarioEditor}
                      onAddScenario={addMockScenarioFromCurrent}
                      onScenarioSelectChange={handleMockScenarioSelectChange}
                      onMethodEnabledChange={handleMockMethodEnabledChange}
                      onScenarioStreamSettingsChange={handleMockScenarioStreamSettingsChange}
                      onEditScenario={openMockScenarioManager}
                      onImport={() => mockScenarioInputRef.current?.click()}
                      onExport={exportMockScenarioFile}
                      onOpenFolder={() => void openMockScenarioFolder()}
                      onOpenSettings={() => setMockSettingsOpen(true)}
                    />
                  ))}
              </Box>
            </Paper>

            <Box
              onMouseDown={beginResponseResize}
              sx={{
                width: requestResponseLayout === "horizontal" ? 6 : "auto",
                height: requestResponseLayout === "horizontal" ? "auto" : 6,
                flexShrink: 0,
                cursor: requestResponseLayout === "horizontal" ? "col-resize" : "row-resize",
                borderRadius: 999,
                bgcolor: "divider",
                opacity: 0.55,
                "&:hover": { bgcolor: "primary.main", opacity: 0.85 },
              }}
            />

            <Paper
              elevation={0}
              sx={{
                ...panelSx,
                flex: requestResponseLayout === "horizontal" ? `0 0 ${responseWidth}px` : `0 0 ${responseHeight}px`,
                minHeight: requestResponseLayout === "horizontal" ? 0 : minResponseHeight,
                minWidth: requestResponseLayout === "horizontal" ? minResponseWidth : 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <ResponseToolbar
                filter={responseFilter}
                hasEvents={events.length > 0}
                hasLastResult={Boolean(lastResult)}
                onFilterChange={handleResponseFilterChange}
                onClearFilter={clearResponseFilter}
                onExport={exportResponseStable}
                onSaveDocs={saveCurrentResultForDocsStable}
                onClearResponse={clearActiveResponseStable}
              />
              <ResponseWorkbenchTabs value={responseTab} onChange={handleResponseTabChange} />
              <Box
                ref={responseBodyRef}
                className="response-selectable"
                onScroll={handleResponseBodyScroll}
                sx={{
                  p: designSystem.space.panelPadding,
                  flex: 1,
                  minHeight: 0,
                  overflow:
                    requestResponseLayout === "horizontal" &&
                    (responseTab === "latest" || responseTab === "raw" || responseTab === "report")
                      ? "hidden"
                      : "auto",
                  position: "relative",
                  display:
                    requestResponseLayout === "horizontal" &&
                    (responseTab === "latest" || responseTab === "raw" || responseTab === "report")
                      ? "flex"
                      : "block",
                  flexDirection: "column",
                }}
              >
                {responseTab === "messages" && (
                  <FeatureMessageTable
                    empty="Run a request to see messages."
                    events={messageEvents}
                    filterQuery={deferredResponseFilter}
                  />
                )}
                {responseTab === "latest" && (
                  <FeatureLatestResponseJsonViewer
                    value={latestResponsePayload}
                    filterQuery={deferredResponseFilter}
                    empty="Run a request or receive a stream message to see only the newest response payload."
                    fullHeight={requestResponseLayout === "horizontal"}
                  />
                )}
                {responseTab === "messages" && showMessageTopButton && (
                  <Tooltip title="Top message">
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
                {responseTab === "raw" && (
                  <FeatureJsonBlock
                    value={lastResult ?? events}
                    highlightQuery={deferredResponseFilter}
                    fullHeight={requestResponseLayout === "horizontal"}
                  />
                )}
                {responseTab === "history" && (
                  <FeatureHistoryTable
                    history={currentHistory}
                    filterQuery={deferredResponseFilter}
                    onClear={clearHistory}
                  />
                )}
                {responseTab === "report" && (
                  <FeatureJsonBlock
                    value={reportPayload}
                    highlightQuery={deferredResponseFilter}
                    fullHeight={requestResponseLayout === "horizontal"}
                  />
                )}
              </Box>
            </Paper>
          </>
        )}
      </Stack>
    </Box>
  );
}
