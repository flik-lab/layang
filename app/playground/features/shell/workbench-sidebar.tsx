"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@/components/shadcn/compat";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Api,
  DocsIcon,
  MockServer,
  ProtoIcon,
  Search,
  Settings as SettingsIcon,
  SourceControl,
} from "@/components/shadcn/icons";
import {
  collapsedSidebarWidth,
  grpcMockOverviewMethodKey,
  maxSidebarWidth,
  minSidebarWidth,
  railWidth,
} from "../../shared/workbench-constants";
import { loadProtoFiles } from "@/lib/proto-loader";
import type { ProtoSourceFile } from "@/lib/types";
import {
  assessProtoLibraryImport,
  prepareProtoVersionImport,
  type ProtoLibraryImportAssessment,
  type ProtoVersionImportPlan,
} from "../proto-library/proto-version-management";
import type { SettingsSection, SideSection } from "../../shared/workbench-types";
import type { WorkbenchViewContext } from "./use-workbench-container-model";
import { MockingSidebarTree } from "../services/mocking-sidebar-tree";
import { SchemaSidebarTree } from "../proto-registry/schema-sidebar-tree";

const settingsItems: Array<{ value: SettingsSection; label: string }> = [
  { value: "general", label: "Appearance & Layout" },
  { value: "workspace", label: "Workspace" },
  { value: "environments", label: "Environments" },
  { value: "network", label: "Network & Certificates" },
  { value: "logging", label: "Logging" },
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
    mockSelectedMethodKey,
    mockServer,
    setMockSelectedMethodKey,
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
    updateDocumentationSettings,
  } = ctx;

  const [protoFilter, setProtoFilter] = useState("");
  const [protoImportAnchor, setProtoImportAnchor] = useState<HTMLElement | null>(null);
  const [newMenuAnchor, setNewMenuAnchor] = useState<HTMLElement | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [deleteSchemaLibraryId, setDeleteSchemaLibraryId] = useState("");
  const [globalProtoImportReview, setGlobalProtoImportReview] = useState<GlobalProtoImportReview | null>(null);
  const [globalProtoImportError, setGlobalProtoImportError] = useState("");
  const globalProtoFileInputRef = useRef<HTMLInputElement | null>(null);
  const globalProtoFolderInputRef = useRef<HTMLInputElement | null>(null);

  const railItems: RailItem[] = [
    { section: "collections", label: "Collections", icon: <Api fontSize="small" /> },
    { section: "proto-schemas", label: "Schemas", icon: <ProtoIcon fontSize="small" /> },
    { section: "services", label: "Mocking", icon: <MockServer fontSize="small" /> },
    { section: "docs", label: "Docs", icon: <DocsIcon fontSize="small" /> },
    { section: "source-control", label: "Source Control", icon: <SourceControl fontSize="small" /> },
  ];

  const sidebarTitle =
    sideSection === "collections"
      ? "Collections"
      : sideSection === "proto-schemas"
        ? "Schemas"
        : sideSection === "services"
          ? "Mocking"
          : sideSection === "docs"
            ? "Docs"
            : sideSection === "source-control"
              ? "Source Control"
              : "Settings";



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

  function quickRequestDestination() {
    for (const collection of collections) {
      const request = collection.requests.find((item: any) => item.id === activeCollectionRequestId);
      if (request) return { collectionId: collection.id, folderId: request.parentId ?? null };
    }
    const firstCollection = collections[0];
    return firstCollection ? { collectionId: firstCollection.id, folderId: null } : null;
  }

  function openQuickRequest(kind: "" | "grpc" | "rest" | "websocket" = "") {
    setNewMenuAnchor(null);
    setCommandPaletteOpen(false);
    const destination = quickRequestDestination();
    if (!destination) {
      if (kind === "grpc" || kind === "") {
        openAddCollectionRequestDialog("", kind, null);
        return;
      }
      openAddCollectionDialog();
      return;
    }
    openAddCollectionRequestDialog(destination.collectionId, kind, destination.folderId);
  }

  useEffect(() => {
    const handleQuickCreateShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        openQuickRequest("");
        return;
      }
      if (key === "k") {
        event.preventDefault();
        setCommandPaletteQuery("");
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handleQuickCreateShortcut);
    return () => window.removeEventListener("keydown", handleQuickCreateShortcut);
  }, [activeCollectionRequestId, collections]);

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
      <Box
          component="nav"
          aria-label="Workbench areas"
          className="workbench-activity-rail"
          sx={{
            position: "fixed",
            top: designSystem.size.titlebarHeight,
            bottom: designSystem.size.statusbarHeight,
            left: 0,
            width: railWidth,
            zIndex: 1220,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            borderRight: "1px solid",
            borderColor: "var(--border-strong)",
            bgcolor: "var(--rail-bg)",
            py: 0,
          }}
        >
          <Stack spacing={0} alignItems="center" sx={{ width: "100%" }}>
            {railItems.map((item) => (
              <Tooltip key={item.section} title={item.label} placement="right">
                <Button
                  size="small"
                  aria-label={item.label}
                  aria-current={sideSection === item.section ? "page" : undefined}
                  onClick={() => openRailSection(item.section)}
                  sx={{
                    minWidth: 0,
                    width: designSystem.size.railButton,
                    height: "var(--rail-button-size, 48px)",
                    p: 0,
                    borderRadius: 0,
                    color: sideSection === item.section ? "primary.main" : "text.secondary",
                    bgcolor: sideSection === item.section ? "action.selected" : "transparent",
                    position: "relative",
                    "&::before":
                      sideSection === item.section
                        ? {
                            content: '""',
                            position: "absolute",
                            left: 0,
                            top: 8,
                            bottom: 8,
                            width: 2,
                            borderRadius: "0 2px 2px 0",
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

          <Tooltip title="Settings" placement="right">
            <Button
              size="small"
              aria-label="Settings"
              aria-current={sideSection === "settings" ? "page" : undefined}
              onClick={() => openRailSection("settings")}
              sx={{
                minWidth: 0,
                width: designSystem.size.railButton,
                height: "var(--rail-button-size, 48px)",
                p: 0,
                borderRadius: 0,
                color: sideSection === "settings" ? "primary.main" : "text.secondary",
                bgcolor: sideSection === "settings" ? "action.selected" : "transparent",
              }}
            >
              <SettingsIcon fontSize="small" />
            </Button>
          </Tooltip>
        </Box>

      {(compactViewport || sidebarOpen) && sideSection !== "source-control" && (
        <Sidebar
          mobile={compactViewport}
          width={sidebarWidthPx}
          collapsedWidth={collapsedSidebarWidth}
          top={designSystem.size.titlebarHeight}
          bottom={designSystem.size.statusbarHeight}
          style={{ left: railWidth, maxWidth: `calc(100vw - ${railWidth}px)` }}
        >
          <SidebarHeader>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ width: "100%" }}>
              <Typography
                variant="caption"
                noWrap
                title={sidebarTitle}
                sx={{ minWidth: 0, flex: 1, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}
              >
                {sidebarTitle}
              </Typography>
              {sideSection === "collections" && (
                <Button
                  size="small"
                  variant="text"
                  onClick={(event: any) => setNewMenuAnchor(event.currentTarget)}
                  aria-label="New request or collection"
                  title="New"
                  sx={{ minWidth: 26, width: 26, px: 0, color: "text.secondary", fontSize: 16 }}
                >
                  +
                </Button>
              )}
              {sideSection === "proto-schemas" && (
                <Button
                  size="small"
                  variant="text"
                  onClick={(event: any) => setProtoImportAnchor(event.currentTarget)}
                  aria-label="Import Proto"
                  sx={{ minWidth: 0, px: 0.75, color: "text.secondary" }}
                >
                  Import
                </Button>
              )}
              {compactViewport ? (
                <Button size="small" variant="text" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}>
                  Close
                </Button>
              ) : null}
            </Stack>

          </SidebarHeader>

          <Menu anchorEl={newMenuAnchor} open={Boolean(newMenuAnchor)} onClose={() => setNewMenuAnchor(null)}>
            <MenuItem onClick={() => openQuickRequest("")}>Quick create…</MenuItem>
            <MenuItem onClick={() => openQuickRequest("grpc")}>Request from schema</MenuItem>
            <MenuItem onClick={() => openQuickRequest("rest")}>Blank HTTP request</MenuItem>
            <MenuItem onClick={() => openQuickRequest("websocket")}>Blank WebSocket request</MenuItem>
            <MenuItem
              onClick={() => {
                setNewMenuAnchor(null);
                openAddCollectionDialog();
              }}
            >
              New collection
            </MenuItem>
          </Menu>

          <SidebarContent className="p-0">
            {sideSection === "collections" && (
              <Stack spacing={0} sx={{ minHeight: 0 }}>
                <Box sx={{ px: 0.6, pt: 0.55, pb: 0.55 }}>
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
              <Stack spacing={0} sx={{ minHeight: 0, height: "100%" }}>
                <Box sx={{ px: 0.6, pt: 0.55, pb: 0.55 }}>
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
                <Box sx={{ minHeight: 0, flex: 1, overflow: "auto", pb: 0.5 }}>
                  <SchemaSidebarTree
                    libraries={protoLibraries}
                    activeLibraryId={activeProtoLibraryId}
                    activeVersionId={activeProtoVersionId}
                    query={protoFilter}
                    onSelectVersion={(libraryId, versionId) => {
                      setProtoPreview(null);
                      selectProtoLibraryVersion(libraryId, versionId);
                      window.setTimeout(() => window.dispatchEvent(new CustomEvent("layang:schema-select", { detail: { libraryId, versionId } })), 0);
                      if (compactViewport) setSidebarOpen(false);
                    }}
                    onSelectMethod={(libraryId, versionId, method) => {
                      setProtoPreview(null);
                      selectProtoLibraryVersion(libraryId, versionId);
                      window.setTimeout(() => {
                        window.dispatchEvent(
                          new CustomEvent("layang:schema-select", {
                            detail: { libraryId, versionId, methodKey: `${method.serviceName}/${method.methodName}` },
                          }),
                        );
                      }, 0);
                      if (compactViewport) setSidebarOpen(false);
                    }}
                  />
                </Box>
              </Stack>
            )}

            {sideSection === "services" && (
              <Box sx={{ py: 0.35 }}>
                <MockingSidebarTree
                  protoLibraries={protoLibraries}
                  mockServer={mockServer}
                  mockServerStatus={ctx.mockServerStatus}
                  selectedMethodKey={mockSelectedMethodKey}
                  serviceProtocol={serviceProtocol}
                  onSelectGrpcMethod={(libraryId, versionId, method) => {
                    selectProtoLibraryVersion(libraryId, versionId);
                    setMockSelectedMethodKey(`${method.serviceName}/${method.methodName}`);
                    setServicesSection("mock-servers");
                    setServiceProtocol("grpc-mock");
                    if (compactViewport) setSidebarOpen(false);
                  }}
                  onSelectProtocol={(protocol) => {
                    setServicesSection("mock-servers");
                    if (protocol === "grpc-mock") setMockSelectedMethodKey(grpcMockOverviewMethodKey);
                    setServiceProtocol(protocol);
                    if (compactViewport) setSidebarOpen(false);
                  }}
                />
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

            {sideSection === "settings" && (
              <Box sx={{ p: 0.45 }}>
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
                right: -5,
                width: 10,
                height: "100%",
                cursor: "col-resize",
                zIndex: 4,
                bgcolor: "transparent",
                outline: "none",
                "&::after": {
                  content: '""',
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: "50%",
                  width: 1,
                  transform: "translateX(-0.5px)",
                  bgcolor: "var(--border-strong)",
                },
                "&:hover::after, &:focus-visible::after": {
                  width: 2,
                  transform: "translateX(-1px)",
                  bgcolor: "primary.main",
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

      <Dialog open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Command palette</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={0.75} sx={{ mt: 0.5 }}>
            <TextField
              autoFocus
              size="small"
              value={commandPaletteQuery}
              onChange={(event: TextInputChangeEvent) => setCommandPaletteQuery(event.target.value)}
              placeholder="Search commands"
              inputProps={{ "aria-label": "Search commands" }}
            />
            {[
              { label: "Create requests from schema", run: () => openQuickRequest("grpc") },
              { label: "New HTTP request", run: () => openQuickRequest("rest") },
              { label: "New WebSocket request", run: () => openQuickRequest("websocket") },
              { label: "New collection", run: () => { setCommandPaletteOpen(false); openAddCollectionDialog(); } },
              { label: "Import Proto schema", run: () => { setCommandPaletteOpen(false); openGlobalProtoImporter("files"); } },
            ]
              .filter((command) => command.label.toLowerCase().includes(commandPaletteQuery.trim().toLowerCase()))
              .map((command) => (
                <Button
                  key={command.label}
                  variant="text"
                  onClick={command.run}
                  sx={{ justifyContent: "flex-start", textTransform: "none" }}
                >
                  {command.label}
                </Button>
              ))}
            <Typography variant="caption" color="text.secondary">
              Ctrl/Cmd+N opens Quick Create · Ctrl/Cmd+K opens this palette
            </Typography>
          </Stack>
        </DialogContent>
      </Dialog>

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
