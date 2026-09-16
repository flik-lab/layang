"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent, type UIEvent as ReactUIEvent } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from "@/components/shadcn/compat";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import { loadProtoFiles } from "@/lib/proto-loader";
import type { LoadedProto, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import { methodKey } from "../../shared/rpc-method-utils";
import { ProtoVersionManager } from "../proto-library/proto-version-dialogs";
import type { ProtoLibrary } from "../proto-library/proto-library-types";
import {
  prepareProtoVersionImport,
  type ProtoPurgeReferencePolicy,
  type ProtoVersionDeleteResult,
  type ProtoVersionImportPlan,
} from "../proto-library/proto-version-management";
import type { ApiCollection, MockServerProject } from "../../shared/workbench-types";

type ViewContext = {
  activeProtoLibraryId: string;
  activeProtoVersionId: string;
  applyProtoVersionImportPlan: (
    plan: ProtoVersionImportPlan,
    selectedRequestIds: ReadonlySet<string>,
    setAsDefault?: boolean,
  ) => void;
  archiveGlobalProtoLibrary: (libraryId: string) => ProtoVersionDeleteResult;
  archiveProtoLibraryVersion: (libraryId: string, versionId: string) => ProtoVersionDeleteResult;
  collections: ApiCollection[];
  loaded: LoadedProto | null;
  mockServer: MockServerProject;
  openGrpcMethodsRequestDialog: (methods: RpcMethodInfo[], libraryId: string, versionId: string) => void;
  protoFiles: ProtoSourceFile[];
  protoLibraries: ProtoLibrary[];
  purgeGlobalProtoLibrary: (libraryId: string) => ProtoVersionDeleteResult;
  purgeProtoLibraryVersion: (
    libraryId: string,
    versionId: string,
    referencePolicy: ProtoPurgeReferencePolicy,
  ) => ProtoVersionDeleteResult;
  restoreGlobalProtoLibrary: (libraryId: string) => ProtoVersionDeleteResult;
  restoreProtoLibraryVersion: (libraryId: string, versionId: string) => ProtoVersionDeleteResult;
  selectProtoLibraryVersion: (libraryId: string, versionId: string) => void;
};
type SchemaSelectDetail = { libraryId?: string; versionId?: string; methodKey?: string };
type OutlineKind = "enum" | "message" | "service" | "rpc";
type OutlineItem = { kind: OutlineKind; name: string; line: number };

const outlineLabels: Record<OutlineKind, string> = {
  enum: "Enums",
  message: "Messages",
  service: "Services",
  rpc: "RPCs",
};

function normalizeRevisionLabel(value: unknown): string {
  const label = String(value ?? "").trim();
  if (!label) return "Revision";
  if (/^revision\s+/i.test(label)) return label.replace(/^revision/i, "Revision");
  if (/^\d+$/.test(label)) return `Revision ${label}`;
  return label;
}

function formatRevisionLabel(value: unknown, isDefault: boolean): string {
  const label = normalizeRevisionLabel(value);
  return `${label}${isDefault ? " · Default" : ""}`;
}

function findSourceFile(files: ProtoSourceFile[], method: RpcMethodInfo | null): ProtoSourceFile | null {
  if (!files.length) return null;
  if (method?.sourceFile) {
    const exact = files.find((file) => file.name === method.sourceFile);
    if (exact) return exact;
    const suffix = files.find((file) => file.name.endsWith(`/${method.sourceFile}`));
    if (suffix) return suffix;
  }
  if (method) {
    const byMethod = files.find((file) => file.text.includes(`rpc ${method.methodName}`));
    if (byMethod) return byMethod;
  }
  return [...files].sort((left, right) => left.name.localeCompare(right.name))[0] ?? null;
}

function buildOutline(source: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const declaration = line.match(/^\s*(enum|message|service)\s+([A-Za-z_][\w]*)\b/);
    if (declaration) {
      items.push({ kind: declaration[1] as OutlineKind, name: declaration[2], line: index + 1 });
      return;
    }
    const rpc = line.match(/^\s*rpc\s+([A-Za-z_][\w]*)\b/);
    if (rpc) items.push({ kind: "rpc", name: rpc[1], line: index + 1 });
  });
  return items;
}

function findMethodLine(source: string, method: RpcMethodInfo | null): number | null {
  if (!method) return null;
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex((line) => new RegExp(`\\brpc\\s+${method.methodName}\\b`).test(line));
  return index >= 0 ? index + 1 : null;
}

function ProtoSourceViewer({ file, targetLine }: { file: ProtoSourceFile; targetLine: number | null }) {
  const lineHeight = 22;
  const overscan = 28;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const lines = useMemo(() => file.text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n"), [file.text]);

  const startIndex = Math.max(0, Math.floor(scrollTop / lineHeight) - overscan);
  const endIndex = Math.min(
    lines.length,
    Math.ceil((scrollTop + viewportHeight) / lineHeight) + overscan,
  );
  const visibleLines = lines.slice(startIndex, endIndex);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const nextHeight = entries[0]?.contentRect.height;
      if (typeof nextHeight === "number" && nextHeight > 0) setViewportHeight(nextHeight);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!targetLine) return;
    const node = scrollerRef.current;
    if (!node) return;
    const nextTop = Math.max(0, (targetLine - 1) * lineHeight - node.clientHeight / 2 + lineHeight / 2);
    node.scrollTop = nextTop;
    setScrollTop(nextTop);
  }, [file.name, targetLine]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  return (
    <Box
      ref={scrollerRef}
      data-section="schema-proto-source"
      className="performance-panel"
      onScroll={(event: ReactUIEvent<HTMLDivElement>) => {
        pendingScrollTopRef.current = event.currentTarget.scrollTop;
        if (scrollFrameRef.current !== null) return;
        scrollFrameRef.current = window.requestAnimationFrame(() => {
          scrollFrameRef.current = null;
          setScrollTop(pendingScrollTopRef.current);
        });
      }}
      sx={{
        height: "100%",
        minHeight: 0,
        overflow: "auto",
        bgcolor: "background.default",
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
        fontSize: "0.78rem",
        lineHeight: `${lineHeight}px`,
      }}
    >
      <Box
        component="pre"
        sx={{
          m: 0,
          position: "relative",
          width: "100%",
          minWidth: "100%",
          height: `${Math.max(1, lines.length) * lineHeight}px`,
        }}
      >
        {visibleLines.map((line, offset) => {
          const index = startIndex + offset;
          const lineNumber = index + 1;
          const selected = lineNumber === targetLine;
          return (
            <Box
              component="div"
              key={`${file.name}:${lineNumber}`}
              data-proto-line={lineNumber}
              className="performance-list-row"
              sx={{
                position: "absolute",
                top: `${index * lineHeight}px`,
                left: 0,
                display: "grid",
                gridTemplateColumns: "52px max-content",
                width: "max-content",
                minWidth: "100%",
                height: `${lineHeight}px`,
                bgcolor: selected ? "action.selected" : "transparent",
              }}
            >
              <Box
                component="span"
                sx={{
                  pr: 1.2,
                  textAlign: "right",
                  color: selected ? "primary.main" : "text.disabled",
                  userSelect: "none",
                }}
              >
                {lineNumber}
              </Box>
              <Box component="code" sx={{ pr: 2.5, color: "text.primary", whiteSpace: "pre" }}>
                {line || " "}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function ProtoOutline({ items, onSelect }: { items: OutlineItem[]; onSelect: (item: OutlineItem) => void }) {
  const grouped = useMemo(
    () =>
      (["enum", "message", "service", "rpc"] as OutlineKind[])
        .map((kind) => ({ kind, items: items.filter((item) => item.kind === kind) }))
        .filter((group) => group.items.length > 0),
    [items],
  );

  return (
    <Box
      data-section="schema-proto-outline"
      sx={{ width: 240, minWidth: 200, maxWidth: 300, borderRight: "1px solid", borderColor: "divider", overflow: "auto" }}
    >
      <Stack spacing={1.1} sx={{ p: 1 }}>
        {grouped.map((group) => (
          <Box key={group.kind}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 0.65, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {outlineLabels[group.kind]}
            </Typography>
            <Stack spacing={0.15} sx={{ mt: 0.35 }}>
              {group.items.map((item) => (
                <Button
                  key={`${item.kind}:${item.name}:${item.line}`}
                  size="small"
                  variant="text"
                  onClick={() => onSelect(item)}
                  sx={{ justifyContent: "flex-start", textTransform: "none", px: 0.65, minHeight: 30, color: "text.primary" }}
                >
                  <Typography variant="body2" noWrap title={item.name} sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                    {item.name}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ ml: 0.8 }}>
                    {item.line}
                  </Typography>
                </Button>
              ))}
            </Stack>
          </Box>
        ))}
        {!grouped.length ? (
          <Typography variant="caption" color="text.secondary" sx={{ px: 0.65 }}>
            No outline symbols in this file.
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

export function ProtoSchemaWorkspace({ ctx }: { ctx: ViewContext | Record<string, unknown> }) {
  const typedCtx = ctx as ViewContext;
  const {
    activeProtoLibraryId,
    activeProtoVersionId,
    applyProtoVersionImportPlan,
    archiveGlobalProtoLibrary,
    archiveProtoLibraryVersion,
    collections,
    loaded,
    mockServer,
    openGrpcMethodsRequestDialog,
    protoFiles,
    protoLibraries,
    purgeGlobalProtoLibrary,
    purgeProtoLibraryVersion,
    restoreGlobalProtoLibrary,
    restoreProtoLibraryVersion,
    selectProtoLibraryVersion,
  } = typedCtx;

  const library = protoLibraries.find((item) => item.id === activeProtoLibraryId) ?? protoLibraries[0] ?? null;
  const visibleVersions = (library?.versions ?? []).filter((item) => item.lifecycle !== "archived");
  const version =
    visibleVersions.find((item) => item.id === activeProtoVersionId) ??
    visibleVersions.find((item) => item.id === library?.defaultVersionId) ??
    visibleVersions[0] ??
    null;
  const files: ProtoSourceFile[] = version?.files?.length ? version.files : protoFiles;
  const runtime = useMemo(() => {
    if (version?.files?.length) {
      try {
        return loadProtoFiles(version.files);
      } catch {
        return null;
      }
    }
    return loaded ?? null;
  }, [loaded, version]);
  const methods: RpcMethodInfo[] = runtime?.methods ?? [];

  const [sourceFileName, setSourceFileName] = useState("");
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [targetLine, setTargetLine] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [editError, setEditError] = useState("");
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [revisionToolsOpen, setRevisionToolsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingMethodKey, setPendingMethodKey] = useState("");

  const selectedFile = files.find((file) => file.name === sourceFileName) ?? findSourceFile(files, null);
  const outlineItems = useMemo(() => buildOutline(selectedFile?.text ?? ""), [selectedFile?.text]);
  const requestUsage = useMemo(() => {
    if (!library || !version) return 0;
    return collections.reduce(
      (sum: number, collection) =>
        sum +
        collection.requests.filter(
          (request) => request.grpc?.libraryId === library.id && request.grpc?.versionId === version.id,
        ).length,
      0,
    );
  }, [collections, library, version]);
  const mockUsage = useMemo(() => {
    if (!library || !version) return 0;
    return Object.values(mockServer?.methodBindings ?? {}).filter(
      (binding) => binding?.libraryId === library.id && binding?.versionId === version.id,
    ).length;
  }, [library, mockServer?.methodBindings, version]);

  useEffect(() => {
    const first = findSourceFile(files, null);
    if (!files.some((file) => file.name === sourceFileName)) setSourceFileName(first?.name ?? "");
  }, [files, sourceFileName]);

  useEffect(() => {
    setEditing(false);
    setEditError("");
    setTargetLine(null);
    setRevisionToolsOpen(false);
  }, [library?.id, version?.id]);

  useEffect(() => {
    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<SchemaSelectDetail>).detail ?? {};
      if (detail.libraryId && detail.libraryId !== library?.id) return;
      if (detail.methodKey) setPendingMethodKey(detail.methodKey);
    };
    window.addEventListener("layang:schema-select", onSelect);
    return () => window.removeEventListener("layang:schema-select", onSelect);
  }, [library?.id]);

  useEffect(() => {
    if (!pendingMethodKey) return;
    const method = methods.find((item) => methodKey(item) === pendingMethodKey);
    if (!method) return;
    const file = findSourceFile(files, method);
    if (file) {
      setSourceFileName(file.name);
      setTargetLine(findMethodLine(file.text, method));
    }
    setPendingMethodKey("");
  }, [files, methods, pendingMethodKey]);

  function selectFile(fileName: string) {
    setSourceFileName(fileName);
    setTargetLine(null);
    setEditing(false);
    setEditError("");
  }

  function startEditing() {
    if (!selectedFile) return;
    setDraftText(selectedFile.text);
    setEditError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditError("");
    setDraftText(selectedFile?.text ?? "");
  }

  function saveRevision() {
    if (!library || !version || !selectedFile) return;
    if (draftText === selectedFile.text) {
      setEditing(false);
      return;
    }
    try {
      const nextFiles = files.map((file) => (file.name === selectedFile.name ? { ...file, text: draftText } : file));
      loadProtoFiles(nextFiles);
      const plan = prepareProtoVersionImport({
        library,
        baseVersion: version,
        files: nextFiles,
        versionLabel: `Revision ${library.versions.length + 1}`,
        collections,
        importMode: "complete-revision",
      });
      const selectedRequestIds = new Set(
        plan.impacts.filter((impact) => impact.canUpdate).map((impact) => impact.requestId),
      );
      applyProtoVersionImportPlan(plan, selectedRequestIds, true);
      setEditing(false);
      setEditError("");
    } catch (error) {
      setEditError(error instanceof Error ? error.message : String(error));
    }
  }

  function selectOutlineItem(item: OutlineItem) {
    setTargetLine(item.line);
  }

  if (!library || !version) {
    return (
      <Box sx={{ height: "100%", display: "grid", placeItems: "center", color: "text.secondary" }}>
        <Typography variant="body2">Import a `.proto` file or folder from the sidebar.</Typography>
      </Box>
    );
  }

  return (
    <Paper
      elevation={0}
      data-layout="schema-proto-workspace"
      sx={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 0,
      }}
    >
      <Box sx={{ px: 1.45, py: 1, borderBottom: "1px solid var(--border-strong)", flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} noWrap title={library.name}>
              {library.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap title={selectedFile?.name ?? "Proto schema"}>
              {selectedFile?.name ?? "Proto schema"}
            </Typography>
          </Box>

          <Stack direction="row" alignItems="center" spacing={0.55} sx={{ flexShrink: 0 }}>
            <FormControl size="small" sx={{ minWidth: 156 }}>
              <Select
                value={version.id}
                disabled={editing}
                title={formatRevisionLabel(version.version, version.id === library.defaultVersionId)}
                inputProps={{ "aria-label": `Revision for ${library.name}` }}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => selectProtoLibraryVersion(library.id, event.target.value)}
              >
                {visibleVersions.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {formatRevisionLabel(item.version, item.id === library.defaultVersionId)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button size="small" variant={outlineOpen ? "contained" : "outlined"} onClick={() => setOutlineOpen((open) => !open)}>
              Outline
            </Button>
            {editing ? (
              <>
                <Button size="small" variant="text" onClick={cancelEditing}>
                  Cancel
                </Button>
                <Button size="small" variant="contained" onClick={saveRevision}>
                  Save as revision
                </Button>
              </>
            ) : (
              <Button size="small" variant="outlined" onClick={startEditing} disabled={!selectedFile}>
                Edit
              </Button>
            )}
            <Button
              size="small"
              variant="contained"
              disabled={!methods.length || editing}
              onClick={() => openGrpcMethodsRequestDialog(methods, library.id, version.id)}
            >
              Create requests
            </Button>
            <Button size="small" variant="text" onClick={(event: ReactMouseEvent<HTMLButtonElement>) => setMoreAnchor(event.currentTarget)}>
              More
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMoreAnchor(null);
            setRevisionToolsOpen((open) => !open);
          }}
        >
          Manage revisions
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMoreAnchor(null);
            void copyTextWithAnnouncement(selectedFile?.text ?? "", "Proto source");
          }}
          disabled={!selectedFile}
        >
          Copy Proto source
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMoreAnchor(null);
            setDeleteOpen(true);
          }}
          sx={{ color: "error.main" }}
        >
          Delete schema
        </MenuItem>
      </Menu>

      {revisionToolsOpen ? (
        <Box sx={{ px: 1.2, py: 0.75, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
          <ProtoVersionManager
            key={`${library.id}:${version.id}`}
            library={library}
            activeVersionId={version.id}
            collections={collections}
            onApplyVersionImport={applyProtoVersionImportPlan}
            onArchiveVersion={archiveProtoLibraryVersion}
            onRestoreVersion={restoreProtoLibraryVersion}
            onPurgeVersion={purgeProtoLibraryVersion}
            onArchiveLibrary={archiveGlobalProtoLibrary}
            onRestoreLibrary={restoreGlobalProtoLibrary}
            onPurgeLibrary={purgeGlobalProtoLibrary}
          />
        </Box>
      ) : null}

      <Box sx={{ px: 1.05, py: 0.65, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.7}>
          {files.length > 1 ? (
            <FormControl size="small" sx={{ minWidth: 220, maxWidth: 420 }}>
              <Select
                value={selectedFile?.name ?? ""}
                disabled={editing}
                inputProps={{ "aria-label": `Proto file for ${library.name}` }}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => selectFile(event.target.value)}
              >
                {files.map((file) => (
                  <MenuItem key={file.name} value={file.name}>
                    {file.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Typography variant="body2" sx={{ fontFamily: "monospace", minWidth: 0, flex: 1 }} noWrap title={selectedFile?.name}>
              {selectedFile?.name ?? "Proto source"}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
            {methods.length} {methods.length === 1 ? "method" : "methods"} · {files.length} {files.length === 1 ? "file" : "files"}
          </Typography>
        </Stack>
      </Box>

      {editError ? (
        <Box sx={{ px: 1.2, py: 0.7, bgcolor: "error.main", color: "error.contrastText", flexShrink: 0 }}>
          <Typography variant="caption">{editError}</Typography>
        </Box>
      ) : null}

      <Box sx={{ minHeight: 0, flex: 1, display: "flex", overflow: "hidden" }}>
        {outlineOpen && !editing ? <ProtoOutline items={outlineItems} onSelect={selectOutlineItem} /> : null}
        <Box sx={{ minWidth: 0, minHeight: 0, flex: 1, overflow: "hidden" }}>
          {editing ? (
            <textarea
              aria-label={`Edit ${selectedFile?.name ?? "Proto source"}`}
              value={draftText}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraftText(event.target.value)}
              spellCheck={false}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                minHeight: 0,
                resize: "none",
                border: 0,
                outline: 0,
                padding: "14px 18px",
                background: "var(--background)",
                color: "var(--foreground)",
                fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                fontSize: "12.5px",
                lineHeight: "1.65",
                tabSize: 2,
                whiteSpace: "pre",
                overflow: "auto",
              }}
            />
          ) : selectedFile ? (
            <ProtoSourceViewer file={selectedFile} targetLine={targetLine} />
          ) : (
            <Box sx={{ height: "100%", display: "grid", placeItems: "center" }}>
              <Typography variant="body2" color="text.secondary">
                This revision does not contain a Proto source file.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete schema?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete <strong>{library.name}</strong>?{" "}
            {requestUsage + mockUsage > 0
              ? `${requestUsage + mockUsage} request/mock bindings currently use this revision.`
              : "This removes the schema from the global registry."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              purgeGlobalProtoLibrary(library.id);
              setDeleteOpen(false);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
