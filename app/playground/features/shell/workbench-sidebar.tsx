"use client";

import type { ChangeEvent, MouseEvent as ReactMouseEvent } from "react";
import type { LoadedProto, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import type { ColorMode } from "../../design-system";
import type { MethodDoc, SavedExample } from "../../shared/workbench-types";

type CompatTheme = { palette: { mode: ColorMode } };
type ButtonClickEvent = ReactMouseEvent<HTMLButtonElement>;
type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type WorkbenchViewContext = Record<string, any> & {
  loaded: LoadedProto | null;
  setExamples: StateSetter<SavedExample[]>;
  runExample: (example: SavedExample) => void | Promise<void>;
  loadExample: (example: SavedExample) => void;
  openDocFromSidebar: (doc: MethodDoc) => void;
  unpublishMethodDoc: (methodKey: string) => void;
  downloadTextFile: (filename: string, text: string, mimeType?: string) => void;
  selectMethod: (root: LoadedProto["root"], method: RpcMethodInfo) => void;
};

export function WorkbenchSidebar(props: { ctx: WorkbenchViewContext }) {
  const {
    Add,
    Api,
    Box,
    DarkMode,
    Divider,
    DocsIcon,
    ExampleIcon,
    ExampleSidebar,
    FeatureDocsSidebar,
    FeatureRegistryPanel,
    History,
    HistorySidebar,
    IconButton,
    InputAdornment,
    LightMode,
    Menu,
    MenuItem,
    MockServer,
    MockServerSidebar,
    PanelBottom,
    PanelRight,
    RailButton,
    Search,
    SidebarHeader,
    Stack,
    Stream,
    TextField,
    Tooltip,
    UploadFile,
    WebSocketMockSidebar,
    activeCollectionRequestId,
    activeDocKey,
    activeExampleKey,
    activeWebSocketMockScenario,
    addMockScenarioFromCurrent,
    beginSidebarResize,
    clearHistory,
    collectionMenuAnchor,
    collections,
    colorTokens,
    currentExamples,
    currentHistory,
    currentMockEditorParse,
    currentMockFile,
    designSystem,
    downloadTextFile,
    endpointGroups,
    exampleInputRef,
    exportMockScenarioFile,
    fetchMockScenarioFilesFromWorkspace,
    exportPublicDocs,
    handleProtoFiles,
    handleWebSocketMockPortChange,
    iconButtonSx,
    importExampleFile,
    importGrpcRequestIntoCollection,
    importMockScenarioFile,
    importWorkspaceFiles,
    loadExample,
    loadSample,
    loaded,
    mockScenarioInputRef,
    mockServer,
    mockServerStatus,
    openAddCollectionDialog,
    openAddCollectionRequestDialog,
    openDocFromSidebar,
    openWebSocketMockScenarioFromSidebar,
    paletteMode,
    projectInputRef,
    protoFiles,
    protoFolderInputRef,
    protoInputRef,
    publishedDocs,
    railWidth,
    registryFilter,
    removeCollection,
    removeCollectionRequest,
    removeProtoFile,
    renameCollection,
    renameCollectionRequest,
    requestResponseLayout,
    runExample,
    savedExampleKey,
    selectCollectionRequest,
    selectMethod,
    selectedMethod,
    selectedMethodKey,
    setCollectionMenuAnchor,
    setExamples,
    setMockSettingsOpen,
    setProtoPreview,
    setRegistryFilter,
    setSideSection,
    setSidebarOpen,
    sideSection,
    sidebarOpen,
    sidebarWidthPx,
    startMockServer,
    startWebSocketMockServer,
    stopMockServer,
    stopWebSocketMockServer,
    themeMode,
    timestampForFile,
    toggleRequestResponseLayout,
    toggleTheme,
    unpublishMethodDoc,
    updateWebSocketMockScenario,
    wsMockPort,
    wsMockSidebarRows,
    wsMockStatus,
  } = props.ctx;

  return (
    <>
      <input
        ref={projectInputRef}
        hidden
        multiple
        type="file"
        accept=".json,.proto,.md,.txt,.yaml,.yml"
        onChange={(event: ChangeEvent<HTMLInputElement>) => void importWorkspaceFiles(event.target.files)}
      />
      <input
        ref={protoFolderInputRef}
        hidden
        multiple
        type="file"
        accept=".proto,.json"
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(event: ChangeEvent<HTMLInputElement>) => void handleProtoFiles(event.target.files)}
      />

      <Box
        sx={{
          position: "fixed",
          top: designSystem.size.titlebarHeight,
          bottom: 0,
          left: 0,
          width: railWidth,
          borderRight: "1px solid",
          borderColor: "divider",
          bgcolor: (theme: CompatTheme) => colorTokens[paletteMode(theme.palette.mode)].railBg,
          pt: 1,
        }}
      >
        <RailButton
          active={sidebarOpen && sideSection === "registry"}
          icon={<Api />}
          label="Collections"
          onClick={() => {
            setSideSection("registry");
            setSidebarOpen(true);
          }}
        />
        <RailButton
          active={sidebarOpen && sideSection === "examples"}
          icon={<ExampleIcon />}
          label="Examples"
          onClick={() => {
            setSideSection("examples");
            setSidebarOpen(true);
          }}
        />
        <RailButton
          active={sidebarOpen && sideSection === "history"}
          icon={<History />}
          label="History"
          onClick={() => {
            setSideSection("history");
            setSidebarOpen(true);
          }}
        />
        <RailButton
          active={sidebarOpen && sideSection === "mocks"}
          icon={<MockServer />}
          label="gRPC Mock"
          status={mockServerStatus.running ? "running" : "idle"}
          onClick={() => {
            setSideSection("mocks");
            setSidebarOpen(true);
          }}
        />
        <RailButton
          active={sidebarOpen && sideSection === "ws-mocks"}
          icon={<Stream />}
          label="WS Mock"
          status={wsMockStatus.running ? "running" : "idle"}
          onClick={() => {
            setSideSection("ws-mocks");
            setSidebarOpen(true);
          }}
        />
        <RailButton
          active={sidebarOpen && sideSection === "docs"}
          icon={<DocsIcon />}
          label="Docs"
          onClick={() => {
            setSideSection("docs");
            setSidebarOpen(true);
          }}
        />
        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 10,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Stack spacing={0.7} alignItems="center">
            <Tooltip
              title={
                requestResponseLayout === "vertical"
                  ? "Switch body and response to side-by-side"
                  : "Switch body and response to top-bottom"
              }
              placement="right"
            >
              <IconButton
                size="small"
                aria-label="Toggle body/response layout"
                onClick={toggleRequestResponseLayout}
                sx={iconButtonSx}
              >
                {requestResponseLayout === "vertical" ? (
                  <PanelRight sx={{ fontSize: 16 }} color="primary" />
                ) : (
                  <PanelBottom sx={{ fontSize: 16 }} color="primary" />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip title={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`} placement="right">
              <IconButton size="small" aria-label="Toggle theme" onClick={toggleTheme} sx={iconButtonSx}>
                {themeMode === "dark" ? (
                  <DarkMode sx={{ fontSize: 16 }} color="primary" />
                ) : (
                  <LightMode sx={{ fontSize: 16 }} color="primary" />
                )}
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Box>

      {sidebarOpen && (
        <Box
          sx={{
            position: "fixed",
            top: designSystem.size.titlebarHeight,
            bottom: 0,
            left: railWidth,
            width: sidebarWidthPx,
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            overflow: "hidden",
          }}
        >
          <Stack spacing={0.8} sx={{ p: 1, height: "100%" }}>
            <SidebarHeader
              section={sideSection}
              protoCount={protoFiles.length}
              exampleCount={currentExamples.length}
              historyCount={currentHistory.length}
              docsCount={publishedDocs.length}
              mockCount={0}
              onHide={() => setSidebarOpen(false)}
              action={
                sideSection === "registry" ? (
                  <Tooltip title="Collection menu">
                    <IconButton
                      size="small"
                      aria-label="Collection menu"
                      data-testid="collection-menu-button"
                      onClick={(event: ButtonClickEvent) => setCollectionMenuAnchor(event.currentTarget)}
                    >
                      <Add sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                ) : undefined
              }
            />
            <Menu
              anchorEl={collectionMenuAnchor}
              open={sideSection === "registry" && Boolean(collectionMenuAnchor)}
              onClose={() => setCollectionMenuAnchor(null)}
            >
              <MenuItem data-testid="collection-menu-add-collection" onClick={openAddCollectionDialog}>
                <Add fontSize="small" /> Add Collection
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={() => {
                  setCollectionMenuAnchor(null);
                  protoInputRef.current?.click();
                }}
              >
                <UploadFile fontSize="small" /> Import gRPC proto / collection
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setCollectionMenuAnchor(null);
                  protoFolderInputRef.current?.click();
                }}
              >
                <UploadFile fontSize="small" /> Import collection folder
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setCollectionMenuAnchor(null);
                  loadSample();
                }}
              >
                <ExampleIcon fontSize="small" /> Load sample gRPC collection
              </MenuItem>
            </Menu>
            <input
              ref={protoInputRef}
              hidden
              multiple
              type="file"
              accept=".proto,.json"
              onChange={(event: ChangeEvent<HTMLInputElement>) => void handleProtoFiles(event.target.files)}
            />
            <input
              ref={exampleInputRef}
              hidden
              type="file"
              accept=".json"
              onChange={(event: ChangeEvent<HTMLInputElement>) => void importExampleFile(event.target.files)}
            />
            <input
              ref={mockScenarioInputRef}
              hidden
              multiple
              type="file"
              accept=".json,.yaml,.yml"
              onChange={(event: ChangeEvent<HTMLInputElement>) => void importMockScenarioFile(event.target.files)}
            />
            {sideSection === "registry" && (
              <TextField
                size="small"
                value={registryFilter}
                onChange={(event: TextInputChangeEvent) => setRegistryFilter(event.target.value)}
                placeholder="Search collections"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search sx={{ fontSize: 16 }} />
                    </InputAdornment>
                  ),
                }}
              />
            )}
            <Divider />
            <Box sx={{ overflow: "auto", pb: 1, flex: 1 }}>
              {sideSection === "registry" && (
                <FeatureRegistryPanel
                  protoFiles={protoFiles}
                  collections={collections}
                  endpointGroups={endpointGroups}
                  selectedMethodKey={selectedMethodKey}
                  selectedCollectionRequestId={activeCollectionRequestId}
                  loaded={loaded}
                  onRemoveProto={removeProtoFile}
                  onOpenProto={setProtoPreview}
                  onExportProto={(file: ProtoSourceFile) =>
                    downloadTextFile(
                      `layang-proto-${file.name.replace(/[^a-z0-9_.-]/gi, "-")}-${timestampForFile()}.proto`,
                      file.text,
                      "text/x-protobuf",
                    )
                  }
                  onSelectMethod={(method: RpcMethodInfo) => loaded && selectMethod(loaded.root, method)}
                  onSelectCollectionRequest={selectCollectionRequest}
                  onAddCollectionRequest={openAddCollectionRequestDialog}
                  onImportGrpcRequest={importGrpcRequestIntoCollection}
                  onRenameCollection={renameCollection}
                  onRemoveCollection={removeCollection}
                  onRenameCollectionRequest={renameCollectionRequest}
                  onRemoveCollectionRequest={removeCollectionRequest}
                />
              )}
              {sideSection === "examples" && (
                <ExampleSidebar
                  examples={currentExamples}
                  onLoad={loadExample}
                  onRun={(example: SavedExample) => void runExample(example)}
                  onDelete={(id: string) => setExamples((current) => current.filter((item) => item.id !== id))}
                  onClear={() =>
                    setExamples((current) => current.filter((item) => savedExampleKey(item) !== activeExampleKey))
                  }
                />
              )}
              {sideSection === "history" && <HistorySidebar history={currentHistory} onClear={clearHistory} />}
              {sideSection === "mocks" && (
                <MockServerSidebar
                  mockServer={mockServer}
                  selectedMethod={selectedMethod}
                  status={mockServerStatus}
                  currentFile={currentMockFile}
                  currentParseResult={currentMockEditorParse}
                  onSettings={() => setMockSettingsOpen(true)}
                  onGenerate={addMockScenarioFromCurrent}
                  onStart={() => void startMockServer()}
                  onStop={() => void stopMockServer()}
                  onImport={() => mockScenarioInputRef.current?.click()}
                  onExport={exportMockScenarioFile}
                  onFetchFromFile={() => void fetchMockScenarioFilesFromWorkspace()}
                />
              )}
              {sideSection === "ws-mocks" && (
                <WebSocketMockSidebar
                  status={wsMockStatus}
                  port={wsMockPort}
                  rows={wsMockSidebarRows}
                  activeScenarioId={activeWebSocketMockScenario?.id}
                  onPortChange={handleWebSocketMockPortChange}
                  onScenarioChange={updateWebSocketMockScenario}
                  onOpenScenario={openWebSocketMockScenarioFromSidebar}
                  onStart={() => void startWebSocketMockServer()}
                  onStop={() => void stopWebSocketMockServer()}
                />
              )}
              {sideSection === "docs" && (
                <FeatureDocsSidebar
                  docs={publishedDocs}
                  activeMethodKey={activeDocKey}
                  onExport={exportPublicDocs}
                  onOpen={(doc: MethodDoc) => openDocFromSidebar(doc)}
                  onUnpublish={(doc: MethodDoc) => unpublishMethodDoc(doc.methodKey)}
                />
              )}
            </Box>
          </Stack>
          <Box
            onMouseDown={beginSidebarResize}
            sx={{
              position: "absolute",
              top: 0,
              right: -3,
              width: 6,
              height: "100%",
              cursor: "col-resize",
              zIndex: 2,
              "&:hover": { bgcolor: "primary.main", opacity: 0.4 },
            }}
          />
        </Box>
      )}
    </>
  );
}
