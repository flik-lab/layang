"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@/components/shadcn/compat";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Add,
  Api,
  Delete,
  DocsIcon,
  MockServer,
  PanelBottom,
  PanelRight,
  ProtoIcon,
  Search,
  Settings as SettingsIcon,
  SourceControl,
} from "@/components/shadcn/icons";
import { collapsedSidebarWidth, maxSidebarWidth, minSidebarWidth, railWidth } from "../../shared/workbench-constants";
import { loadProtoFiles } from "@/lib/proto-loader";
import { SearchHighlightedText } from "../../shared/components/search-highlight";
import type { ProtoSourceFile } from "@/lib/types";
import {
  assessProtoLibraryImport,
  prepareProtoVersionImport,
  type ProtoLibraryImportAssessment,
  type ProtoVersionImportPlan,
} from "../proto-library/proto-version-management";
import type { ServiceProtocol, ServicesSection, SettingsSection, SideSection } from "../../shared/workbench-types";
import type { WorkbenchViewContext } from "./use-workbench-container-model";
import { GitSourceControlSidebar } from "../git/git-source-control";

const settingsItems: Array<{ value: SettingsSection; label: string }> = [
  { value: "general", label: "General" },
  { value: "workspace", label: "Workspace" },
  { value: "environments", label: "Environments" },
  { value: "network", label: "Network" },
  { value: "logging", label: "Logging" },
];

const serviceItems: Array<{
  id: string;
  label: string;
  section: ServicesSection;
  protocol?: ServiceProtocol;
}> = [
  { id: "grpc-mock", label: "gRPC", section: "mock-servers", protocol: "grpc-mock" },
  { id: "rest", label: "REST Mock", section: "mock-servers", protocol: "rest" },
  { id: "websocket", label: "WebSocket Mock", section: "mock-servers", protocol: "websocket" },
];

type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type RailItem = {
  section: SideSection;
  label: string;
  icon: ReactNode;
};

type GlobalProtoImportReview = {
  schemaName: string;
  sources: ProtoSourceFile[];
  assessment: ProtoLibraryImportAssessment;
  plan: ProtoVersionImportPlan;
  versionLabel: string;
};

export function WorkbenchSidebar({ ctx }: { ctx: WorkbenchViewContext }) {
  const {
    FeatureCollectionSidebar,
    UnifiedDocsSidebar,
    activeCollectionRequestId,
    activeDocumentationPageId,
    activeProtoLibraryId,
    activeProtoVersionId,
    beginSidebarResize,
    buildAllDocumentation,
    checkDocumentationBuild,
    collectionFilter,
    collections,
    compactViewport,
    createCollectionFolder,
    createProtoLibraryFromImport,
    applyProtoVersionImportPlan,
    designSystem,
    documentation,
    documentationPages,
    exampleInputRef,
    handleProtoFiles,
    importExampleFile,
    importMockScenarioFile,
    importWorkspaceFiles,
    mockScenarioInputRef,
    openAddCollectionDialog,
    openAddCollectionRequestDialog,
    openDocumentationPage,
    openDocumentationSite,
    openDocumentationWikiExport,
    projectInputRef,
    protoFolderInputRef,
    protoInputRef,
    protoLibraries,
    removeCollection,
    removeCollectionFolder,
    removeCollectionRequest,
    renameCollection,
    renameCollectionFolder,
    renameCollectionRequest,
    purgeGlobalProtoLibrary,
    repairCollectionGrpcRequest,
    requestResponseLayout,
    requestSessions,
    selectCollectionRequest,
    selectProtoLibraryVersion,
    serviceProtocol,
    setActiveDocumentationPageId,
    setCollectionFilter,
    setProtoPreview,
    setServiceProtocol,
    setServicesSection,
    setSettingsSection,
    setSideSection,
    setSidebarOpen,
    setSidebarWidthPx,
    settingsSection,
    sideSection,
    sidebarOpen,
    sidebarWidthPx,
    moveCollectionTreeNode,
    toggleRequestResponseLayout,
    updateDocumentationSettings,
  } = ctx;

  const [protoFilter, setProtoFilter] = useState("");
  const [protoImportAnchor, setProtoImportAnchor] = useState<HTMLElement | null>(null);
  const [deleteSchemaLibraryId, setDeleteSchemaLibraryId] = useState("");
  const [globalProtoImportReview, setGlobalProtoImportReview] = useState<GlobalProtoImportReview | null>(null);
  const [globalProtoImportError, setGlobalProtoImportError] = useState("");
  const globalProtoFileInputRef = useRef<HTMLInputElement | null>(null);
  const globalProtoFolderInputRef = useRef<HTMLInputElement | null>(null);

  const railItems: RailItem[] = [
    { section: "collections", label: "Collections", icon: <Api fontSize="small" /> },
    { section: "proto-schemas", label: "Schemas", icon: <ProtoIcon fontSize="small" /> },
    { section: "services", label: "Services", icon: <MockServer fontSize="small" /> },
    { section: "docs", label: "Docs", icon: <DocsIcon fontSize="small" /> },
    { section: "source-control", label: "Source Control", icon: <SourceControl fontSize="small" /> },
  ];

  const sidebarTitle =
    sideSection === "collections"
      ? "Collections"
      : sideSection === "proto-schemas"
        ? "Schemas"
        : sideSection === "services"
          ? "Services"
          : sideSection === "docs"
            ? "Docs"
            : sideSection === "source-control"
              ? "Source Control"
              : "Settings";

  const filteredLibraries = protoLibraries.filter((library: any) => {
    const query = protoFilter.trim().toLowerCase();
    if (!query) return true;
    return (
      library.name.toLowerCase().includes(query) ||
      library.versions?.some((version: any) => version.version.toLowerCase().includes(query))
    );
  });

  const anyServiceRunning = Boolean(
    ctx.mockServerStatus.running ||
      ctx.webAccessStatus.running ||
      ctx.restMockStatus.running ||
      ctx.wsMockStatus.running,
  );
  const deleteSchemaLibrary = protoLibraries.find((library: any) => library.id === deleteSchemaLibraryId) ?? null;
  const deleteSchemaRequestCount = deleteSchemaLibrary
    ? collections.flatMap((collection: any) =>
        collection.requests.filter((request: any) => request.grpc?.libraryId === deleteSchemaLibrary.id),
      ).length
    : 0;

  function openGlobalProtoImporter(mode: "files" | "folder") {
    setProtoImportAnchor(null);
    setSideSection("proto-schemas");
    setSidebarOpen(true);
    window.setTimeout(() => {
      const target = mode === "folder" ? globalProtoFolderInputRef.current : globalProtoFileInputRef.current;
      if (target) {
        target.value = "";
        target.click();
        return;
      }
      // Legacy fallback for screens that mount their own schema importer.
      window.dispatchEvent(new CustomEvent("layang:open-proto-import", { detail: { mode } }));
    }, 0);
  }

  async function reviewGlobalProtoFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const selected = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".proto"));
      if (selected.length === 0) throw new Error("Select one or more .proto files.");
      const sources = await Promise.all(
        selected.map(async (file) => ({
          name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
          text: await file.text(),
        })),
      );
      loadProtoFiles(sources);
      const firstPath = sources[0]?.name.replaceAll("\\", "/") ?? "Proto Schema";
      const schemaName = firstPath.includes("/") ? firstPath.split("/")[0] : firstPath.replace(/\.proto$/i, "");
      const assessment = assessProtoLibraryImport(protoLibraries, sources);
      if (!assessment) {
        createProtoLibraryFromImport(schemaName || "Proto Schema", "Revision 1", sources);
        setGlobalProtoImportError("");
        return;
      }
      const versionLabel = `Revision ${assessment.library.versions.length + 1}`;
      const plan = prepareProtoVersionImport({
        library: assessment.library,
        baseVersion: assessment.version,
        files: sources,
        versionLabel,
        collections,
        importMode: "complete-revision",
        allowDuplicateChecksum: assessment.kind === "exact",
      });
      setGlobalProtoImportReview({ schemaName, sources, assessment, plan, versionLabel });
      setGlobalProtoImportError("");
    } catch (error) {
      setGlobalProtoImportError(error instanceof Error ? error.message : String(error));
    } finally {
      if (globalProtoFileInputRef.current) globalProtoFileInputRef.current.value = "";
      if (globalProtoFolderInputRef.current) globalProtoFolderInputRef.current.value = "";
    }
  }

  function useExistingGlobalProtoImport() {
    if (!globalProtoImportReview) return;
    selectProtoLibraryVersion(
      globalProtoImportReview.assessment.library.id,
      globalProtoImportReview.assessment.version.id,
    );
    setGlobalProtoImportReview(null);
  }

  function createSeparateGlobalProtoImport() {
    if (!globalProtoImportReview) return;
    createProtoLibraryFromImport(
      globalProtoImportReview.schemaName || "Proto Schema",
      "Revision 1",
      globalProtoImportReview.sources,
    );
    setGlobalProtoImportReview(null);
  }

  function createGlobalProtoRevision() {
    if (!globalProtoImportReview) return;
    try {
      const plan = prepareProtoVersionImport({
        library: globalProtoImportReview.assessment.library,
        baseVersion: globalProtoImportReview.assessment.version,
        files: globalProtoImportReview.sources,
        versionLabel:
          globalProtoImportReview.versionLabel.trim() ||
          `Revision ${globalProtoImportReview.assessment.library.versions.length + 1}`,
        collections,
        importMode: "complete-revision",
        allowDuplicateChecksum: globalProtoImportReview.assessment.kind === "exact",
      });
      const selectedRequestIds = new Set(
        plan.impacts.filter((impact) => impact.canUpdate).map((impact) => impact.requestId),
      );
      applyProtoVersionImportPlan(plan, selectedRequestIds, true);
      setGlobalProtoImportReview(null);
      setGlobalProtoImportError("");
    } catch (error) {
      setGlobalProtoImportError(error instanceof Error ? error.message : String(error));
    }
  }

  function openRailSection(section: SideSection) {
    setSideSection(section);
    setSidebarOpen(true);
  }

  function selectService(item: (typeof serviceItems)[number]) {
    setServicesSection(item.section);
    if (item.protocol) setServiceProtocol(item.protocol);
    if (compactViewport) setSidebarOpen(false);
  }

  const activeServiceId = serviceProtocol === "web-access" ? "grpc-mock" : serviceProtocol;

  return (
    <>
      <input
        ref={projectInputRef}
        hidden
        multiple
        type="file"
        accept=".json,.proto,.md,.txt,.yaml,.yml"
        onChange={(event) => void importWorkspaceFiles(event.target.files)}
      />
      <input
        ref={protoFolderInputRef}
        hidden
        multiple
        type="file"
        accept=".proto,.json"
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(event) => void handleProtoFiles(event.target.files)}
      />
      <input
        ref={protoInputRef}
        hidden
        multiple
        type="file"
        accept=".proto,.json"
        onChange={(event) => void handleProtoFiles(event.target.files)}
      />
      <input
        ref={exampleInputRef}
        hidden
        type="file"
        accept=".json"
        onChange={(event) => void importExampleFile(event.target.files)}
      />
      <input
        ref={mockScenarioInputRef}
        hidden
        multiple
        type="file"
        accept=".json,.yaml,.yml"
        onChange={(event) => void importMockScenarioFile(event.target.files)}
      />
      <input
        ref={globalProtoFileInputRef}
        hidden
        multiple
        type="file"
        accept=".proto,text/x-protobuf"
        onChange={(event) => void reviewGlobalProtoFiles(event.target.files)}
      />
      <input
        ref={globalProtoFolderInputRef}
        hidden
        multiple
        type="file"
        accept=".proto,text/x-protobuf"
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(event) => void reviewGlobalProtoFiles(event.target.files)}
      />
      {!compactViewport && (
        <Box
          component="nav"
          aria-label="Workbench areas"
          sx={{
            position: "fixed",
            top: designSystem.size.titlebarHeight,
            bottom: 24,
            left: 0,
            width: railWidth,
            zIndex: 1110,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            py: 0.75,
          }}
        >
          <Stack spacing={0.35} alignItems="center" sx={{ width: "100%" }}>
            {railItems.map((item) => (
              <Tooltip key={item.section} title={item.label} placement="right">
                <Button
                  size="small"
                  aria-label={item.label}
                  aria-current={sideSection === item.section ? "page" : undefined}
                  onClick={() => openRailSection(item.section)}
                  sx={{
                    minWidth: 0,
                    width: 40,
                    height: 40,
                    p: 0,
                    borderRadius: 1.25,
                    color: sideSection === item.section ? "primary.main" : "text.secondary",
                    bgcolor: sideSection === item.section ? "action.selected" : "transparent",
                    position: "relative",
                    "&::before":
                      sideSection === item.section
                        ? {
                            content: '""',
                            position: "absolute",
                            left: -6,
                            top: 8,
                            bottom: 8,
                            width: 3,
                            borderRadius: "0 3px 3px 0",
                            bgcolor: "primary.main",
                          }
                        : undefined,
                  }}
                >
                  {item.icon}
                  {item.section === "services" && anyServiceRunning && (
                    <Box
                      component="span"
                      aria-label="Service running"
                      sx={{
                        position: "absolute",
                        right: 6,
                        top: 6,
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        bgcolor: "success.main",
                      }}
                    />
                  )}
                </Button>
              </Tooltip>
            ))}
          </Stack>

          <Box sx={{ flex: 1 }} />

          {sideSection === "collections" && Boolean(activeCollectionRequestId) && (
            <Tooltip
              title={`Request editor layout: ${requestResponseLayout === "horizontal" ? "Side by side" : "Stacked"}`}
              placement="right"
            >
              <Button
                size="small"
                aria-label={`Switch request editor to ${requestResponseLayout === "horizontal" ? "stacked" : "side-by-side"} layout`}
                onClick={toggleRequestResponseLayout}
                sx={{
                  minWidth: 0,
                  width: 40,
                  height: 40,
                  p: 0,
                  mb: 0.35,
                  borderRadius: 1.25,
                  color: "text.secondary",
                }}
              >
                {requestResponseLayout === "horizontal" ? (
                  <PanelRight fontSize="small" />
                ) : (
                  <PanelBottom fontSize="small" />
                )}
              </Button>
            </Tooltip>
          )}

          <Tooltip title="Settings" placement="right">
            <Button
              size="small"
              aria-label="Settings"
              aria-current={sideSection === "settings" ? "page" : undefined}
              onClick={() => openRailSection("settings")}
              sx={{
                minWidth: 0,
                width: 40,
                height: 40,
                p: 0,
                borderRadius: 1.25,
                color: sideSection === "settings" ? "primary.main" : "text.secondary",
                bgcolor: sideSection === "settings" ? "action.selected" : "transparent",
              }}
            >
              <SettingsIcon fontSize="small" />
            </Button>
          </Tooltip>
        </Box>
      )}

      {(compactViewport || sideSection !== "source-control") && (
        <Sidebar
          mobile={compactViewport}
          width={sidebarWidthPx}
          collapsedWidth={collapsedSidebarWidth}
          top={designSystem.size.titlebarHeight}
          bottom={24}
          style={!compactViewport ? { left: railWidth } : undefined}
        >
          <SidebarHeader>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Typography variant="subtitle1" noWrap title={sidebarTitle} sx={{ minWidth: 0, flex: 1 }}>
                {sidebarTitle}
              </Typography>
              {sideSection === "collections" && (
                <Tooltip title="New collection">
                  <IconButton
                    size="small"
                    onClick={openAddCollectionDialog}
                    aria-label="New collection"
                    sx={{
                      width: 28,
                      height: 28,
                      color: "primary.contrastText",
                      bgcolor: "primary.main",
                      "&:hover": { bgcolor: "primary.dark" },
                    }}
                  >
                    <Add sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              {sideSection === "proto-schemas" && (
                <Tooltip title="Import Proto">
                  <IconButton
                    size="small"
                    onClick={(event: any) => setProtoImportAnchor(event.currentTarget)}
                    aria-label="Import Proto"
                    sx={{
                      width: 28,
                      height: 28,
                      color: "primary.contrastText",
                      bgcolor: "primary.main",
                      "&:hover": { bgcolor: "primary.dark" },
                    }}
                  >
                    <Add sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              {!compactViewport ? (
                <SidebarTrigger aria-label="Hide context sidebar" />
              ) : (
                <Button size="small" variant="text" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}>
                  Close
                </Button>
              )}
            </Stack>

            {compactViewport && (
              <Stack direction="row" spacing={0.25} sx={{ pt: 0.75, overflowX: "auto" }} aria-label="Workbench areas">
                {[
                  ...railItems,
                  { section: "settings" as const, label: "Settings", icon: <SettingsIcon fontSize="small" /> },
                ].map((item) => (
                  <Button
                    key={item.section}
                    size="small"
                    variant={sideSection === item.section ? "contained" : "text"}
                    aria-label={item.label}
                    onClick={() => setSideSection(item.section)}
                    sx={{ minWidth: 34, px: 0.65 }}
                  >
                    {item.icon}
                  </Button>
                ))}
              </Stack>
            )}
          </SidebarHeader>

          <SidebarContent className="p-0">
            {sideSection === "collections" && (
              <Stack spacing={0} sx={{ minHeight: 0 }}>
                <Box sx={{ px: 0.75, pt: 0.7, pb: 0.65 }}>
                  <TextField
                    size="small"
                    fullWidth
                    value={collectionFilter}
                    onChange={(event: TextInputChangeEvent) => setCollectionFilter(event.target.value)}
                    placeholder="Search collections"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search sx={{ fontSize: 15 }} />
                        </InputAdornment>
                      ),
                    }}
                    inputProps={{ "aria-label": "Search collections" }}
                  />
                </Box>
                <FeatureCollectionSidebar
                  collections={collections}
                  protoLibraries={protoLibraries}
                  filterQuery={collectionFilter}
                  selectedCollectionRequestId={activeCollectionRequestId}
                  requestSessions={requestSessions}
                  onSelectCollectionRequest={(collection: any, request: any) => {
                    setProtoPreview(null);
                    setActiveDocumentationPageId("");
                    selectCollectionRequest(collection, request);
                    if (compactViewport) setSidebarOpen(false);
                  }}
                  onAddCollectionRequest={openAddCollectionRequestDialog}
                  onCreateFolder={createCollectionFolder}
                  onRenameCollection={renameCollection}
                  onRemoveCollection={removeCollection}
                  onRenameFolder={renameCollectionFolder}
                  onRemoveFolder={removeCollectionFolder}
                  onRenameCollectionRequest={renameCollectionRequest}
                  onRemoveCollectionRequest={removeCollectionRequest}
                  onMoveNode={moveCollectionTreeNode}
                  onRepairGrpcRequest={repairCollectionGrpcRequest}
                />
              </Stack>
            )}

            {sideSection === "proto-schemas" && (
              <Stack spacing={0} sx={{ minHeight: 0 }}>
                <Box sx={{ px: 0.75, pt: 0.7, pb: 0.65 }}>
                  <TextField
                    size="small"
                    fullWidth
                    value={protoFilter}
                    onChange={(event: TextInputChangeEvent) => setProtoFilter(event.target.value)}
                    placeholder="Search schemas"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search sx={{ fontSize: 15 }} />
                        </InputAdornment>
                      ),
                    }}
                    inputProps={{ "aria-label": "Search schemas" }}
                  />
                </Box>
                <Stack spacing="4px" sx={{ px: 0.6, pb: 0.75, overflow: "auto" }}>
                  {filteredLibraries.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ px: 0.5, py: 1 }}>
                      No schemas found.
                    </Typography>
                  ) : (
                    filteredLibraries.map((library: any) => {
                      const visibleVersions = (library.versions ?? []).filter(
                        (version: any) => version.lifecycle !== "archived",
                      );
                      const selectedVersion =
                        visibleVersions.find(
                          (version: any) => version.id === activeProtoVersionId && library.id === activeProtoLibraryId,
                        ) ??
                        visibleVersions.find((version: any) => version.id === library.defaultVersionId) ??
                        visibleVersions[0];
                      const active = library.id === activeProtoLibraryId;
                      const methodCount = active ? (ctx.loaded?.methods?.length ?? 0) : undefined;
                      return (
                        <Paper
                          key={library.id}
                          variant="outlined"
                          sx={{
                            borderColor: active ? "primary.main" : "divider",
                            bgcolor: active ? "action.selected" : "transparent",
                            overflow: "hidden",
                          }}
                        >
                          <Stack direction="row" alignItems="stretch" spacing={0} sx={{ minWidth: 0 }}>
                            <Button
                              size="small"
                              variant="text"
                              onClick={() =>
                                selectedVersion && selectProtoLibraryVersion(library.id, selectedVersion.id)
                              }
                              sx={{
                                flex: 1,
                                minWidth: 0,
                                minHeight: 44,
                                justifyContent: "flex-start",
                                px: 0.8,
                                py: 0.55,
                                textAlign: "left",
                                color: "text.primary",
                                borderRadius: 0,
                              }}
                            >
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography variant="body2" fontWeight={600} noWrap title={library.name}>
                                  <SearchHighlightedText text={library.name} query={protoFilter} />
                                </Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  <SearchHighlightedText
                                    text={selectedVersion?.version ?? "No revision"}
                                    query={protoFilter}
                                  />{" "}
                                  · {selectedVersion?.files?.length ?? 0}{" "}
                                  {(selectedVersion?.files?.length ?? 0) === 1 ? "file" : "files"}
                                  {methodCount !== undefined
                                    ? ` · ${methodCount} ${methodCount === 1 ? "method" : "methods"}`
                                    : ""}
                                </Typography>
                              </Box>
                            </Button>
                            <Tooltip title={`Delete ${library.name}`}>
                              <IconButton
                                size="small"
                                aria-label={`Delete ${library.name}`}
                                onClick={(event: any) => {
                                  event.stopPropagation();
                                  setDeleteSchemaLibraryId(library.id);
                                }}
                                sx={{
                                  width: 28,
                                  minWidth: 28,
                                  height: 28,
                                  alignSelf: "center",
                                  mr: 0.45,
                                  color: "text.secondary",
                                  "&:hover": { color: "error.main", bgcolor: "action.hover" },
                                }}
                              >
                                <Delete sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                          {active && visibleVersions.length > 1 && (
                            <Box sx={{ px: 0.7, pb: 0.65 }}>
                              <FormControl fullWidth size="small">
                                <Select
                                  value={selectedVersion?.id ?? ""}
                                  inputProps={{ "aria-label": `Revision for ${library.name}` }}
                                  onChange={(event: any) => {
                                    setProtoPreview(null);
                                    selectProtoLibraryVersion(library.id, String(event.target.value));
                                  }}
                                >
                                  {visibleVersions.map((version: any) => (
                                    <MenuItem key={version.id} value={version.id}>
                                      {version.version}
                                      {version.id === library.defaultVersionId ? " · Default" : ""}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Box>
                          )}
                        </Paper>
                      );
                    })
                  )}
                </Stack>
              </Stack>
            )}

            {sideSection === "services" && (
              <Box sx={{ p: 0.75 }}>
                <SidebarMenu aria-label="Service views">
                  {serviceItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton isActive={activeServiceId === item.id} onClick={() => selectService(item)}>
                        {item.label}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </Box>
            )}

            {sideSection === "docs" && (
              <Box sx={{ p: 0.5 }}>
                <UnifiedDocsSidebar
                  pages={documentationPages}
                  activePageId={activeDocumentationPageId}
                  onOpen={(page: any) => {
                    openDocumentationPage(page);
                    if (compactViewport) setSidebarOpen(false);
                  }}
                  onBuildAll={() => void buildAllDocumentation()}
                  onCheck={() => void checkDocumentationBuild()}
                  onOpenSite={openDocumentationSite}
                  onOpenWikiExport={openDocumentationWikiExport}
                  settings={documentation.settings}
                  onSettingsChange={updateDocumentationSettings}
                />
              </Box>
            )}

            {sideSection === "source-control" && (
              <GitSourceControlSidebar
                directoryPath={ctx.workspaceFolderPath || ""}
                onFlushWorkspace={async () => {
                  const directoryPath = ctx.workspaceFolderPath || "";
                  if (!directoryPath || !window.electronWorkspace?.saveFolder || !ctx.getWorkspaceExportBundle) return;
                  const result = await window.electronWorkspace.saveFolder(
                    ctx.getWorkspaceExportBundle(),
                    directoryPath,
                  );
                  if (!result?.ok)
                    throw new Error(result?.error || "Failed to save the workspace before the Git operation.");
                }}
              />
            )}

            {sideSection === "settings" && (
              <Box sx={{ p: 0.75 }}>
                <SidebarMenu aria-label="Settings sections">
                  {settingsItems.map((item) => (
                    <SidebarMenuItem key={item.value}>
                      <SidebarMenuButton
                        isActive={settingsSection === item.value}
                        onClick={() => {
                          setSettingsSection(item.value);
                          if (compactViewport) setSidebarOpen(false);
                        }}
                      >
                        {item.label}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </Box>
            )}
          </SidebarContent>

          <SidebarFooter>
            <Typography variant="caption" color="text.secondary" noWrap>
              Ctrl+B toggles this panel
            </Typography>
          </SidebarFooter>

          {!compactViewport && sidebarOpen && (
            <Box
              onMouseDown={beginSidebarResize}
              onKeyDown={(event: any) => {
                const step = event.shiftKey ? 32 : 16;
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setSidebarWidthPx((current: number) => Math.max(minSidebarWidth, current - step));
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setSidebarWidthPx((current: number) => Math.min(maxSidebarWidth, current + step));
                } else if (event.key === "Home") {
                  event.preventDefault();
                  setSidebarWidthPx(minSidebarWidth);
                } else if (event.key === "End") {
                  event.preventDefault();
                  setSidebarWidthPx(maxSidebarWidth);
                }
              }}
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              aria-valuemin={minSidebarWidth}
              aria-valuemax={maxSidebarWidth}
              aria-valuenow={Math.round(sidebarWidthPx)}
              sx={{
                position: "absolute",
                top: 0,
                right: -3,
                width: 6,
                height: "100%",
                cursor: "col-resize",
                zIndex: 2,
                "&:hover, &:focus-visible": {
                  bgcolor: "primary.main",
                  opacity: 0.4,
                  outline: "none",
                },
              }}
            />
          )}
        </Sidebar>
      )}

      <Menu anchorEl={protoImportAnchor} open={Boolean(protoImportAnchor)} onClose={() => setProtoImportAnchor(null)}>
        <MenuItem onClick={() => openGlobalProtoImporter("files")}>Import files</MenuItem>
        <MenuItem onClick={() => openGlobalProtoImporter("folder")}>Import folder</MenuItem>
      </Menu>

      <Dialog
        open={Boolean(globalProtoImportReview)}
        onClose={() => setGlobalProtoImportReview(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {globalProtoImportReview?.assessment.kind === "exact"
            ? "Revision already exists"
            : globalProtoImportReview?.assessment.kind === "equivalent"
              ? "Equivalent schema found"
              : "Possible revision found"}
        </DialogTitle>
        <DialogContent>
          {globalProtoImportReview && (
            <Stack spacing={1} sx={{ pt: 0.5 }}>
              <Paper variant="outlined" sx={{ p: 1 }}>
                <Typography variant="body2" fontWeight={600}>
                  {globalProtoImportReview.assessment.library.name} ·{" "}
                  {globalProtoImportReview.assessment.version.version}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {globalProtoImportReview.assessment.reason}
                </Typography>
              </Paper>
              <TextField
                size="small"
                label="New revision label"
                value={globalProtoImportReview.versionLabel}
                onChange={(event: TextInputChangeEvent) =>
                  setGlobalProtoImportReview((current) =>
                    current ? { ...current, versionLabel: event.target.value } : current,
                  )
                }
                helperText={
                  globalProtoImportReview.assessment.kind === "exact"
                    ? "Use a new label to keep an identical snapshot."
                    : undefined
                }
              />
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                <Typography variant="caption" color="text.secondary">
                  {globalProtoImportReview.plan.diff.summary.breaking} breaking ·{" "}
                  {globalProtoImportReview.plan.diff.summary.review} review ·{" "}
                  {globalProtoImportReview.plan.diff.summary.compatible} compatible
                </Typography>
              </Stack>
              {globalProtoImportError && (
                <Typography variant="body2" color="error">
                  {globalProtoImportError}
                </Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button size="small" variant="text" onClick={() => setGlobalProtoImportReview(null)}>
            Cancel
          </Button>
          {globalProtoImportReview?.assessment.kind !== "exact" && (
            <Button size="small" variant="outlined" onClick={createSeparateGlobalProtoImport}>
              Create separate schema
            </Button>
          )}
          <Button size="small" variant="outlined" onClick={useExistingGlobalProtoImport}>
            Use existing
          </Button>
          <Button size="small" variant="contained" onClick={createGlobalProtoRevision}>
            Create revision
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteSchemaLibrary)} onClose={() => setDeleteSchemaLibraryId("")} fullWidth maxWidth="sm">
        <DialogTitle>Delete {deleteSchemaLibrary?.name ?? "schema"}?</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 0.5 }}>
            <Typography variant="body2">
              All revisions will be removed. Requests and mock bindings remain saved but become unavailable until
              reassigned.
            </Typography>
            <Paper variant="outlined" sx={{ p: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                {deleteSchemaLibrary?.name ?? "Schema"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {deleteSchemaLibrary?.versions?.length ?? 0} revision
                {(deleteSchemaLibrary?.versions?.length ?? 0) === 1 ? "" : "s"} · {deleteSchemaRequestCount} request
                {deleteSchemaRequestCount === 1 ? "" : "s"} affected
              </Typography>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button size="small" variant="text" onClick={() => setDeleteSchemaLibraryId("")}>
            Cancel
          </Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            onClick={() => {
              if (!deleteSchemaLibrary) return;
              purgeGlobalProtoLibrary(deleteSchemaLibrary.id);
              setDeleteSchemaLibraryId("");
            }}
          >
            Delete schema
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
