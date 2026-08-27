"use client";

import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@/components/shadcn/compat";
import { Add, ContentCopy, Delete, MoreHoriz, OpenInNew, Search, Storage } from "@/components/shadcn/icons";
import type { ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import { WorkbenchTabs } from "@/components/ui/workbench";
import { methodKey } from "../../shared/rpc-method-utils";
import { ProtoSourceBlock } from "./proto-registry-panel";

type ViewContext = Record<string, any>;
type ProtoWorkspaceTab = "services" | "files" | "usage";

const METHOD_PANEL_WIDTH_STORAGE_KEY = "layang:proto-schema-method-panel-width";
const DEFAULT_METHOD_PANEL_WIDTH = 300;
const MIN_METHOD_PANEL_WIDTH = 240;
const MAX_METHOD_PANEL_WIDTH = 420;

export function ProtoSchemaWorkspace({ ctx }: { ctx: ViewContext }) {
  const {
    activeProtoLibraryId,
    activeProtoVersionId,
    collections,
    loaded,
    mockServer,
    protoFiles,
    protoLibraries,
    openGrpcMethodRequestDialog,
    purgeGlobalProtoLibrary,
  } = ctx;
  const [tab, setTab] = useState<ProtoWorkspaceTab>("services");
  const [filter, setFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [methodPanelWidth, setMethodPanelWidth] = useState(DEFAULT_METHOD_PANEL_WIDTH);
  const [methodMenuAnchor, setMethodMenuAnchor] = useState<HTMLElement | null>(null);

  const library = protoLibraries.find((item: any) => item.id === activeProtoLibraryId) ?? protoLibraries[0] ?? null;
  const version =
    library?.versions?.find((item: any) => item.id === activeProtoVersionId) ??
    library?.versions?.find((item: any) => item.id === library.defaultVersionId) ??
    library?.versions?.[0] ??
    null;
  const files: ProtoSourceFile[] = version?.files?.length ? version.files : protoFiles;
  const methods: RpcMethodInfo[] = loaded?.methods ?? [];
  const selectedFile = files.find((file) => file.name === selectedFileName) ?? files[0] ?? null;

  useEffect(() => {
    if (tab !== "files" || files.length === 0) return;
    if (!selectedFileName || !files.some((file) => file.name === selectedFileName)) {
      setSelectedFileName(files[0].name);
    }
  }, [files, selectedFileName, tab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = Number(window.localStorage.getItem(METHOD_PANEL_WIDTH_STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= MIN_METHOD_PANEL_WIDTH && stored <= MAX_METHOD_PANEL_WIDTH) {
      setMethodPanelWidth(stored);
    }
  }, []);

  useEffect(() => {
    setMethodMenuAnchor(null);
  }, [selectedKey]);

  function saveMethodPanelWidth(width: number) {
    const normalized = clampMethodPanelWidth(width);
    setMethodPanelWidth(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(METHOD_PANEL_WIDTH_STORAGE_KEY, String(normalized));
    }
  }

  function startMethodPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = methodPanelWidth;
    let latestWidth = startWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const onPointerMove = (moveEvent: PointerEvent) => {
      latestWidth = clampMethodPanelWidth(startWidth + moveEvent.clientX - startX);
      setMethodPanelWidth(latestWidth);
    };
    const onPointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      saveMethodPanelWidth(latestWidth);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function openSourceFile(fileName?: string) {
    if (!fileName) return;
    setSelectedFileName(fileName);
    setTab("files");
    setMethodMenuAnchor(null);
  }

  function copyMethodValue(value: string) {
    void copyTextWithAnnouncement(value, "Method value");
    setMethodMenuAnchor(null);
  }

  const filteredMethods = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return methods;
    return methods.filter((method) =>
      `${method.serviceName} ${method.methodName} ${method.requestType} ${method.responseType}`
        .toLowerCase()
        .includes(query),
    );
  }, [filter, methods]);

  useEffect(() => {
    if (filteredMethods.length === 0) {
      setSelectedKey("");
      return;
    }
    if (!filteredMethods.some((method) => methodKey(method) === selectedKey)) {
      setSelectedKey(methodKey(filteredMethods[0]));
    }
  }, [filteredMethods, selectedKey]);

  const serviceGroups = useMemo(() => {
    const groups = new Map<string, RpcMethodInfo[]>();
    for (const method of filteredMethods) {
      const items = groups.get(method.serviceName) ?? [];
      items.push(method);
      groups.set(method.serviceName, items);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredMethods]);

  const selectedMethod = filteredMethods.find((method) => methodKey(method) === selectedKey) ?? null;
  const requestUsage = useMemo(() => {
    if (!library || !version) return [];
    return collections.flatMap((collection: any) =>
      collection.requests
        .filter((request: any) => request.grpc?.libraryId === library.id && request.grpc?.versionId === version.id)
        .map((request: any) => ({ collection: collection.name, request })),
    );
  }, [collections, library, version]);
  const mockUsage = useMemo(() => {
    if (!library || !version) return [];
    return Object.entries(mockServer?.methodBindings ?? {})
      .filter(([, binding]: any) => binding?.libraryId === library.id && binding?.versionId === version.id)
      .map(([key, binding]: any) => ({ key, binding }));
  }, [library, mockServer?.methodBindings, version]);
  const usageCount = requestUsage.length + mockUsage.length;
  const deleteAffectedCount = requestUsage.length + mockUsage.length;

  return (
    <Paper
      elevation={0}
      sx={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          zIndex: 3,
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.65} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="h6" noWrap title={library?.name}>
              {library?.name ?? "Schemas"}
            </Typography>
            {version?.id === library?.defaultVersionId && <Chip size="small" variant="outlined" label="Default" />}
          </Stack>
          <Typography variant="body2" color="text.secondary" noWrap>
            {version ? version.version : "Import a proto schema from the sidebar."}
          </Typography>
        </Box>
        {library && version && (
          <Tooltip title={`Delete ${library.name}`}>
            <IconButton
              aria-label={`Delete ${library.name}`}
              onClick={() => setDeleteOpen(true)}
              sx={{ color: "text.secondary", "&:hover": { color: "error.main", bgcolor: "action.hover" } }}
            >
              <Delete sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {!library || !version ? (
        <Stack spacing={1} alignItems="center" justifyContent="center" sx={{ flex: 1, p: 3, textAlign: "center" }}>
          <Storage sx={{ fontSize: 34, color: "text.secondary" }} />
          <Typography variant="subtitle1">No schema selected</Typography>
          <Typography variant="body2" color="text.secondary">
            Import a `.proto` file or folder from the sidebar.
          </Typography>
        </Stack>
      ) : (
        <>
          <WorkbenchTabs
            value={tab}
            ariaLabel="Schema view"
            idPrefix="proto-schema"
            className="sticky top-[60px] z-[2]"
            items={(["services", "files", "usage"] as const).map((value) => ({
              value,
              label: value === "services" ? "Methods" : value === "files" ? "Files" : "Usage",
              count:
                value === "usage" && usageCount > 0
                  ? usageCount
                  : value === "services"
                    ? methods.length
                    : value === "files"
                      ? files.length
                      : undefined,
            }))}
            variant="section"
            onValueChange={(value) => setTab(value as ProtoWorkspaceTab)}
          />

          {tab === "services" && (
            <Stack
              role="tabpanel"
              id="proto-schema-panel-services"
              aria-labelledby="proto-schema-tab-services"
              tabIndex={0}
              direction={{ xs: "column", md: "row" }}
              sx={{
                minHeight: 0,
                flex: 1,
                outline: "none",
                "&:focus-visible": { boxShadow: "inset 0 0 0 2px var(--ring)" },
              }}
            >
              <Box
                sx={{
                  width: { xs: "100%", md: methodPanelWidth },
                  minWidth: { md: MIN_METHOD_PANEL_WIDTH },
                  maxWidth: { md: MAX_METHOD_PANEL_WIDTH },
                  maxHeight: { xs: 280, md: "none" },
                  flexShrink: 0,
                  borderBottom: { xs: "1px solid", md: "none" },
                  borderColor: "divider",
                  p: 0.9,
                  overflow: "auto",
                }}
              >
                <TextField
                  size="small"
                  value={filter}
                  onChange={(event: any) => setFilter(event.target.value)}
                  placeholder="Search methods"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search sx={{ fontSize: 15 }} />
                      </InputAdornment>
                    ),
                  }}
                  inputProps={{ "aria-label": "Search methods" }}
                />
                <Stack
                  spacing={0.9}
                  sx={{ mt: 0.9 }}
                  role={serviceGroups.length > 0 ? "listbox" : undefined}
                  aria-label={serviceGroups.length > 0 ? "RPC methods" : undefined}
                >
                  {serviceGroups.length === 0 ? (
                    <Stack spacing={0.5} alignItems="center" sx={{ py: 4, textAlign: "center" }}>
                      <Typography variant="subtitle1">No methods found</Typography>
                      <Typography variant="body2" color="text.secondary">
                        No RPC method matches “{filter}”.
                      </Typography>
                      {filter && (
                        <Button size="small" variant="text" onClick={() => setFilter("")}>
                          Clear search
                        </Button>
                      )}
                    </Stack>
                  ) : (
                    serviceGroups.map(([serviceName, serviceMethods]) => {
                      const serviceLabelId = `proto-service-${sanitizeDomId(serviceName)}`;
                      return (
                        <Box key={serviceName} role="group" aria-labelledby={serviceLabelId}>
                          <Typography
                            id={serviceLabelId}
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            title={serviceName}
                            sx={{ px: 0.4, letterSpacing: "0.055em", textTransform: "uppercase" }}
                          >
                            {formatServiceHeading(serviceName)}
                          </Typography>
                          <Stack spacing="4px" sx={{ mt: 0.35 }}>
                            {serviceMethods.map((method) => {
                              const key = methodKey(method);
                              const active = key === selectedKey;
                              return (
                                <Box
                                  key={key}
                                  component="button"
                                  type="button"
                                  role="option"
                                  aria-selected={active}
                                  tabIndex={active ? 0 : -1}
                                  data-option-key={key}
                                  onClick={() => setSelectedKey(key)}
                                  onKeyDown={handleListboxOptionKeyDown}
                                  sx={{
                                    width: "100%",
                                    minHeight: 44,
                                    border: "1px solid",
                                    borderColor: active ? "primary.main" : "transparent",
                                    bgcolor: active ? "action.selected" : "transparent",
                                    color: "text.primary",
                                    borderRadius: 1.25,
                                    px: 0.9,
                                    py: 0.55,
                                    textAlign: "left",
                                    cursor: "pointer",
                                    "&:hover": {
                                      bgcolor: active ? "action.selected" : "action.hover",
                                      borderColor: active ? "primary.main" : "divider",
                                    },
                                    "&:focus-visible": {
                                      bgcolor: active ? "action.selected" : "action.hover",
                                      outline: "2px solid var(--ring)",
                                      outlineOffset: 2,
                                      borderColor: "primary.main",
                                    },
                                  }}
                                >
                                  <Typography
                                    variant="body2"
                                    fontWeight={500}
                                    noWrap
                                    title={method.methodName}
                                    sx={{ minWidth: 0 }}
                                  >
                                    {method.methodName}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" noWrap>
                                    {methodTypeLabel(method)}
                                  </Typography>
                                </Box>
                              );
                            })}
                          </Stack>
                        </Box>
                      );
                    })
                  )}
                </Stack>
              </Box>

              <Box
                role="separator"
                aria-label="Resize method list"
                aria-orientation="vertical"
                aria-valuemin={MIN_METHOD_PANEL_WIDTH}
                aria-valuemax={MAX_METHOD_PANEL_WIDTH}
                aria-valuenow={methodPanelWidth}
                aria-valuetext={`${methodPanelWidth} pixels`}
                tabIndex={0}
                onPointerDown={startMethodPanelResize}
                onDoubleClick={() => saveMethodPanelWidth(DEFAULT_METHOD_PANEL_WIDTH)}
                onKeyDown={(event: any) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  saveMethodPanelWidth(methodPanelWidth + (event.key === "ArrowRight" ? 16 : -16));
                }}
                sx={{
                  display: { xs: "none", md: "flex" },
                  width: 24,
                  flexShrink: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "col-resize",
                  outline: "none",
                  touchAction: "none",
                  "&::after": { content: '""', width: 2, height: 34, borderRadius: 999, bgcolor: "divider" },
                  "&:hover::after, &:focus-visible::after": { width: 3, bgcolor: "primary.main" },
                }}
              />

              <Box sx={{ minWidth: 0, flex: 1, p: { xs: 1.2, md: 1.6 }, overflow: "auto" }}>
                {!selectedMethod ? (
                  <Stack
                    spacing={0.5}
                    alignItems="center"
                    justifyContent="center"
                    sx={{ height: "100%", minHeight: 260, textAlign: "center" }}
                  >
                    <Typography variant="subtitle1">Select a method</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Choose a method to inspect its request and response types.
                    </Typography>
                  </Stack>
                ) : (
                  <Stack spacing={1.2} sx={{ width: "100%", maxWidth: 920 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="h6" noWrap title={selectedMethod.methodName}>
                          {selectedMethod.methodName}
                        </Typography>
                        <Chip
                          size="small"
                          color={
                            selectedMethod.requestStream || selectedMethod.responseStream ? "secondary" : "default"
                          }
                          label={methodTypeLabel(selectedMethod)}
                        />
                      </Stack>
                      {selectedMethod.sourceFile && (
                        <Stack direction="row" spacing={0.35} alignItems="center" sx={{ mt: 0.2, minWidth: 0 }}>
                          <Typography variant="caption" color="text.secondary">
                            Source
                          </Typography>
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<OpenInNew sx={{ fontSize: 13 }} />}
                            onClick={() => openSourceFile(selectedMethod.sourceFile)}
                            sx={{ minWidth: 0, maxWidth: "100%", px: 0.45, py: 0.15 }}
                          >
                            <Typography variant="body2" noWrap title={selectedMethod.sourceFile}>
                              {selectedMethod.sourceFile}
                            </Typography>
                          </Button>
                        </Stack>
                      )}
                    </Box>

                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      <DefinitionCard label="Request" value={selectedMethod.requestType || "Unknown"} />
                      <DefinitionCard label="Response" value={selectedMethod.responseType || "Unknown"} />
                    </Stack>

                    <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<Add />}
                        onClick={() => openGrpcMethodRequestDialog(selectedMethod)}
                      >
                        Create request
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopy />}
                        onClick={() => copyMethodValue(`${selectedMethod.serviceName}/${selectedMethod.methodName}`)}
                      >
                        Copy RPC path
                      </Button>
                      <Tooltip title="More method actions">
                        <IconButton
                          aria-label="More method actions"
                          onClick={(event: any) => setMethodMenuAnchor(event.currentTarget)}
                          sx={{ color: "text.secondary" }}
                        >
                          <MoreHoriz sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>

                    <Menu
                      anchorEl={methodMenuAnchor}
                      open={Boolean(methodMenuAnchor)}
                      onClose={() => setMethodMenuAnchor(null)}
                    >
                      <MenuItem onClick={() => copyMethodValue(selectedMethod.serviceName)}>
                        <ContentCopy sx={{ fontSize: 14 }} />
                        Copy service name
                      </MenuItem>
                      <MenuItem onClick={() => copyMethodValue(selectedMethod.methodName)}>
                        <ContentCopy sx={{ fontSize: 14 }} />
                        Copy method name
                      </MenuItem>
                      <MenuItem onClick={() => copyMethodValue(selectedMethod.requestType || "")}>
                        <ContentCopy sx={{ fontSize: 14 }} />
                        Copy request type
                      </MenuItem>
                      <MenuItem onClick={() => copyMethodValue(selectedMethod.responseType || "")}>
                        <ContentCopy sx={{ fontSize: 14 }} />
                        Copy response type
                      </MenuItem>
                      {selectedMethod.sourceFile && (
                        <MenuItem onClick={() => openSourceFile(selectedMethod.sourceFile)}>
                          <OpenInNew sx={{ fontSize: 14 }} />
                          Open source
                        </MenuItem>
                      )}
                    </Menu>
                  </Stack>
                )}
              </Box>
            </Stack>
          )}

          {tab === "files" && (
            <Stack
              role="tabpanel"
              id="proto-schema-panel-files"
              aria-labelledby="proto-schema-tab-files"
              tabIndex={0}
              direction="row"
              sx={{
                minHeight: 0,
                flex: 1,
                overflow: "hidden",
                outline: "none",
                "&:focus-visible": { boxShadow: "inset 0 0 0 2px var(--ring)" },
              }}
            >
              {files.length > 1 && (
                <Box
                  sx={{
                    width: 230,
                    flexShrink: 0,
                    borderRight: "1px solid",
                    borderColor: "divider",
                    p: 0.75,
                    overflow: "auto",
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ px: 0.45 }}>
                    Files
                  </Typography>
                  <Stack spacing="4px" sx={{ mt: 0.4 }} role="listbox" aria-label="Proto files">
                    {files.map((file) => (
                      <Box
                        key={file.name}
                        component="button"
                        type="button"
                        role="option"
                        aria-selected={selectedFile?.name === file.name}
                        tabIndex={selectedFile?.name === file.name ? 0 : -1}
                        data-option-key={file.name}
                        onClick={() => setSelectedFileName(file.name)}
                        onKeyDown={handleListboxOptionKeyDown}
                        sx={{
                          width: "100%",
                          minHeight: 34,
                          px: 0.8,
                          py: 0.5,
                          border: "1px solid",
                          borderColor: selectedFile?.name === file.name ? "primary.main" : "transparent",
                          borderRadius: 1.1,
                          bgcolor: selectedFile?.name === file.name ? "action.selected" : "transparent",
                          color: "text.primary",
                          textAlign: "left",
                          cursor: "pointer",
                          "&:hover": { bgcolor: "action.hover" },
                          "&:focus-visible": {
                            bgcolor: "action.hover",
                            outline: "2px solid var(--ring)",
                            outlineOffset: 2,
                            borderColor: "primary.main",
                          },
                        }}
                      >
                        <Typography variant="body2" noWrap title={file.name}>
                          {file.name}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
              <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {!selectedFile ? (
                  <Stack alignItems="center" justifyContent="center" sx={{ flex: 1 }}>
                    <Typography color="text.secondary">No proto files.</Typography>
                  </Stack>
                ) : (
                  <>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{ px: 1.2, py: 0.7, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}
                    >
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        noWrap
                        title={selectedFile.name}
                        sx={{ minWidth: 0, flex: 1 }}
                      >
                        {selectedFile.name}
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopy />}
                        onClick={() => void copyTextWithAnnouncement(selectedFile.text, `${selectedFile.name} source`)}
                      >
                        Copy
                      </Button>
                    </Stack>
                    <Box sx={{ minHeight: 0, flex: 1, overflow: "auto", p: 1 }}>
                      <ProtoSourceBlock file={selectedFile} fullHeight />
                    </Box>
                  </>
                )}
              </Box>
            </Stack>
          )}

          {tab === "usage" && (
            <Box
              role="tabpanel"
              id="proto-schema-panel-usage"
              aria-labelledby="proto-schema-tab-usage"
              tabIndex={0}
              sx={{
                minHeight: 0,
                flex: 1,
                overflow: "auto",
                p: 1.4,
                outline: "none",
                "&:focus-visible": { boxShadow: "inset 0 0 0 2px var(--ring)" },
              }}
            >
              {usageCount === 0 ? (
                <Stack
                  spacing={0.5}
                  alignItems="center"
                  justifyContent="center"
                  sx={{ minHeight: 280, textAlign: "center" }}
                >
                  <Typography variant="subtitle1">Not used yet</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Create a request or mock scenario from a method.
                  </Typography>
                </Stack>
              ) : (
                <Stack spacing={1.2} sx={{ width: "100%" }}>
                  <UsageSection title="Requests" count={requestUsage.length}>
                    {requestUsage.map(({ collection, request }: any) => (
                      <UsageRow
                        key={request.id}
                        title={request.name}
                        subtitle={`${collection} · ${request.grpc?.methodFullName ?? "gRPC request"}`}
                      />
                    ))}
                  </UsageSection>
                  <UsageSection title="Mock scenarios" count={mockUsage.length}>
                    {mockUsage.map(({ key, binding }: any) => (
                      <UsageRow
                        key={key}
                        title={binding.methodFullName?.split("/").pop() || key}
                        subtitle={binding.methodFullName || key}
                      />
                    ))}
                  </UsageSection>
                </Stack>
              )}
            </Box>
          )}
        </>
      )}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Delete {library?.name ?? "schema"}?</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              All revisions will be removed. Requests and mock bindings remain saved but become unavailable until
              reassigned.
            </Typography>
            <Paper variant="outlined" sx={{ p: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                {library?.name ?? "Schema"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {files.length} {files.length === 1 ? "file" : "files"} · {methods.length}{" "}
                {methods.length === 1 ? "method" : "methods"} · {deleteAffectedCount} reference
                {deleteAffectedCount === 1 ? "" : "s"}
              </Typography>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button size="small" variant="text" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            onClick={() => {
              if (library) purgeGlobalProtoLibrary(library.id);
              setDeleteOpen(false);
            }}
          >
            Delete schema
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

function handleListboxOptionKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const listbox = event.currentTarget.closest<HTMLElement>('[role="listbox"]');
  const options = Array.from(
    listbox?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? [],
  );
  const currentIndex = options.indexOf(event.currentTarget);
  if (currentIndex < 0 || options.length === 0) return;
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1) % options.length
          : (currentIndex - 1 + options.length) % options.length;
  event.preventDefault();
  options[nextIndex]?.focus();
  options[nextIndex]?.click();
}

function sanitizeDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "service";
}

function clampMethodPanelWidth(width: number) {
  return Math.min(MAX_METHOD_PANEL_WIDTH, Math.max(MIN_METHOD_PANEL_WIDTH, Math.round(width)));
}

function formatServiceHeading(serviceName: string) {
  const shortName = serviceName.split(".").filter(Boolean).pop() || serviceName;
  return shortName
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function shortTypeName(value: string) {
  return value.split(".").filter(Boolean).pop() || value;
}

function methodTypeLabel(method: RpcMethodInfo) {
  if (method.requestStream && method.responseStream) return "Bidirectional";
  if (method.requestStream) return "Client stream";
  if (method.responseStream) return "Server stream";
  return "Unary";
}

function DefinitionCard({ label, value }: { label: string; value: string }) {
  const shortName = shortTypeName(value);
  return (
    <Paper variant="outlined" sx={{ minWidth: 0, flex: 1, p: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ letterSpacing: "0.055em", textTransform: "uppercase" }}
      >
        {label}
      </Typography>
      <Stack direction="row" spacing={0.7} alignItems="center" sx={{ mt: 0.3, minWidth: 0 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" fontWeight={600} noWrap title={shortName}>
            {shortName}
          </Typography>
          {shortName !== value && (
            <Typography variant="caption" color="text.secondary" noWrap title={value} sx={{ display: "block" }}>
              {value}
            </Typography>
          )}
        </Box>
        <Tooltip title={`Copy ${label.toLowerCase()} type`}>
          <IconButton
            aria-label={`Copy ${label.toLowerCase()} type`}
            onClick={() => void copyTextWithAnnouncement(value, `${label} type`)}
            sx={{ color: "text.secondary" }}
          >
            <ContentCopy sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

function UsageSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <Stack spacing={0.55}>
      <Stack direction="row" alignItems="center" spacing={0.6}>
        <Typography variant="subtitle1">{title}</Typography>
        <Chip size="small" label={count} />
      </Stack>
      {count === 0 ? (
        <Typography variant="body2" color="text.secondary">
          None
        </Typography>
      ) : (
        children
      )}
    </Stack>
  );
}

function UsageRow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Paper variant="outlined" sx={{ px: 1, py: 0.75 }}>
      <Typography variant="body2" fontWeight={600} noWrap title={title}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap title={subtitle}>
        {subtitle}
      </Typography>
    </Paper>
  );
}
