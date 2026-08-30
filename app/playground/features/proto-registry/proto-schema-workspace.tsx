"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from "@/components/shadcn/compat";
import { ContentCopy, Delete, MoreHoriz, OpenInNew } from "@/components/shadcn/icons";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import { loadProtoFiles } from "@/lib/proto-loader";
import type { ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import { methodKey } from "../../shared/rpc-method-utils";
import { ProtoSourceBlock } from "./proto-registry-panel";
import { ProtoVersionManager } from "../proto-library/proto-version-dialogs";

type ViewContext = Record<string, any>;

type SchemaSelectDetail = { libraryId?: string; versionId?: string; methodKey?: string };

function methodKind(method: RpcMethodInfo) {
  if (method.requestStream && method.responseStream) return "Bidirectional stream";
  if (method.requestStream) return "Client stream";
  if (method.responseStream) return "Server stream";
  return "Unary";
}

function findSourceFile(files: ProtoSourceFile[], method: RpcMethodInfo | null) {
  if (!method) return files[0] ?? null;
  if (method.sourceFile) {
    const exact = files.find((file) => file.name === method.sourceFile);
    if (exact) return exact;
    const suffix = files.find((file) => file.name.endsWith(`/${method.sourceFile}`));
    if (suffix) return suffix;
  }
  return files.find((file) => file.text.includes(`rpc ${method.methodName}`)) ?? files[0] ?? null;
}

export function ProtoSchemaWorkspace({ ctx }: { ctx: ViewContext }) {
  const {
    activeProtoLibraryId,
    activeProtoVersionId,
    applyProtoVersionImportPlan,
    archiveGlobalProtoLibrary,
    archiveProtoLibraryVersion,
    collections,
    loaded,
    mockServer,
    openGrpcMethodRequestDialog,
    openGrpcMethodsRequestDialog,
    protoFiles,
    protoLibraries,
    purgeGlobalProtoLibrary,
    purgeProtoLibraryVersion,
    restoreGlobalProtoLibrary,
    restoreProtoLibraryVersion,
    selectProtoLibraryVersion,
  } = ctx;

  const library = protoLibraries.find((item: any) => item.id === activeProtoLibraryId) ?? protoLibraries[0] ?? null;
  const visibleVersions = (library?.versions ?? []).filter((item: any) => item.lifecycle !== "archived");
  const version =
    visibleVersions.find((item: any) => item.id === activeProtoVersionId) ??
    visibleVersions.find((item: any) => item.id === library?.defaultVersionId) ??
    visibleVersions[0] ??
    null;
  const files: ProtoSourceFile[] = version?.files?.length ? version.files : protoFiles;
  const runtime = useMemo(() => {
    if (version?.files?.length) {
      try {
        return loadProtoFiles(version.files);
      } catch {
        // Keep the view available while inspecting a broken revision.
      }
    }
    return loaded ?? null;
  }, [loaded, version]);
  const methods: RpcMethodInfo[] = runtime?.methods ?? [];
  const [selectedKey, setSelectedKey] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceFileName, setSourceFileName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [revisionToolsOpen, setRevisionToolsOpen] = useState(false);

  useEffect(() => {
    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<SchemaSelectDetail>).detail ?? {};
      if (detail.libraryId && detail.libraryId !== library?.id) return;
      if (detail.methodKey) setSelectedKey(detail.methodKey);
    };
    window.addEventListener("layang:schema-select", onSelect);
    return () => window.removeEventListener("layang:schema-select", onSelect);
  }, [library?.id]);

  useEffect(() => {
    if (!methods.length) {
      setSelectedKey("");
      return;
    }
    if (!methods.some((method) => methodKey(method) === selectedKey)) setSelectedKey(methodKey(methods[0]));
  }, [methods, selectedKey]);

  useEffect(() => {
    setRevisionToolsOpen(false);
  }, [library?.id]);

  const selectedMethod = methods.find((method) => methodKey(method) === selectedKey) ?? null;
  const serviceMethods = selectedMethod ? methods.filter((method) => method.serviceName === selectedMethod.serviceName) : [];
  const selectedFile =
    files.find((file) => file.name === sourceFileName) ?? findSourceFile(files, selectedMethod) ?? files[0] ?? null;
  const requestUsage = useMemo(() => {
    if (!library || !version) return 0;
    return collections.reduce(
      (sum: number, collection: any) =>
        sum + collection.requests.filter((request: any) => request.grpc?.libraryId === library.id && request.grpc?.versionId === version.id).length,
      0,
    );
  }, [collections, library, version]);
  const mockUsage = useMemo(() => {
    if (!library || !version) return 0;
    return Object.values(mockServer?.methodBindings ?? {}).filter(
      (binding: any) => binding?.libraryId === library.id && binding?.versionId === version.id,
    ).length;
  }, [library, mockServer?.methodBindings, version]);

  function openSource(method: RpcMethodInfo | null = selectedMethod) {
    const file = findSourceFile(files, method);
    if (file) setSourceFileName(file.name);
    setSourceOpen(true);
  }

  if (!library || !version) {
    return (
      <Box sx={{ height: "100%", display: "grid", placeItems: "center", color: "text.secondary" }}>
        <Typography variant="body2">Import a `.proto` file or folder from the sidebar.</Typography>
      </Box>
    );
  }

  return (
    <Paper elevation={0} sx={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 0 }}>
      <Stack direction="row" alignItems="center" spacing={0.8} sx={{ minHeight: 54, px: 1.5, borderBottom: "1px solid var(--border-strong)", flexShrink: 0 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap title={library.name}>{library.name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {methods.length} RPC methods · {files.length} {files.length === 1 ? "file" : "files"} · {requestUsage} requests · {mockUsage} mocks
          </Typography>
        </Box>
        <Stack spacing={0.15} sx={{ minWidth: 128, flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>Revision</Typography>
          {visibleVersions.length > 1 ? (
            <FormControl size="small" sx={{ minWidth: 128 }}>
              <Select
                value={version.id}
                inputProps={{ "aria-label": `Revision for ${library.name}` }}
                onChange={(event: any) => selectProtoLibraryVersion(library.id, String(event.target.value))}
              >
                {visibleVersions.map((item: any) => (
                  <MenuItem key={item.id} value={item.id}>{item.version}{item.id === library.defaultVersionId ? " · Default" : ""}</MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Typography variant="body2" fontWeight={600}>{version.version}{version.id === library.defaultVersionId ? " · Default" : ""}</Typography>
          )}
        </Stack>
        <Button
          size="small"
          variant={revisionToolsOpen ? "contained" : "outlined"}
          onClick={() => setRevisionToolsOpen((current) => !current)}
          aria-expanded={revisionToolsOpen}
        >
          Manage revision
        </Button>
        <Button size="small" variant="outlined" disabled={!methods.length} onClick={() => openGrpcMethodsRequestDialog(methods, library.id, version.id)}>
          Create all {methods.length || ""} requests
        </Button>
        <Tooltip title="More schema actions">
          <IconButton size="small" aria-label="More schema actions" onClick={(event: any) => setMoreAnchor(event.currentTarget)}>
            <MoreHoriz sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {revisionToolsOpen ? (
        <Box sx={{ px: 1.25, py: 0.8, borderBottom: "1px solid var(--border-strong)", bgcolor: "background.paper", flexShrink: 0 }}>
          <Stack spacing={0.45}>
            <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" fontWeight={600}>Revision tools</Typography>
              <Typography variant="caption" color="text.secondary">
                Current: {version.version}{version.id === library.defaultVersionId ? " · Default" : ""}. Updates create a new immutable revision; the current snapshot is never overwritten.
              </Typography>
            </Stack>
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
          </Stack>
        </Box>
      ) : null}

      <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
        <MenuItem onClick={() => { setMoreAnchor(null); openSource(null); }}><OpenInNew sx={{ fontSize: 14 }} />View Proto source</MenuItem>
        <MenuItem onClick={() => { setMoreAnchor(null); void copyTextWithAnnouncement(library.name, "Schema name"); }}><ContentCopy sx={{ fontSize: 14 }} />Copy schema name</MenuItem>
        <MenuItem onClick={() => { setMoreAnchor(null); setDeleteOpen(true); }} sx={{ color: "error.main" }}><Delete sx={{ fontSize: 14 }} />Delete schema</MenuItem>
      </Menu>

      <Box sx={{ minHeight: 0, flex: 1, overflow: "auto", p: 1.5 }}>
        {selectedMethod ? (
          <Stack spacing={1.25} sx={{ maxWidth: 900 }}>
            <Box>
              <Typography variant="h6" sx={{ fontSize: 17, fontWeight: 600 }}>{selectedMethod.methodName}</Typography>
              <Typography variant="caption" color="text.secondary">
                {selectedMethod.serviceName} · {methodKind(selectedMethod)}
              </Typography>
            </Box>

            <Box sx={{ borderTop: "1px solid", borderColor: "divider" }}>
              {[
                ["Request", selectedMethod.requestType || "Unknown"],
                ["Response", selectedMethod.responseType || "Unknown"],
                ["Source", selectedMethod.sourceFile || selectedFile?.name || "Unknown"],
              ].map(([label, value]) => (
                <Stack key={label} direction="row" alignItems="center" spacing={1} sx={{ minHeight: 34, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Typography variant="caption" color="text.secondary" sx={{ width: 86, flexShrink: 0 }}>{label}</Typography>
                  <Typography variant="body2" sx={{ minWidth: 0, flex: 1, fontFamily: label === "Source" ? "monospace" : undefined }} noWrap title={value}>{value}</Typography>
                </Stack>
              ))}
            </Box>

            <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
              <Button size="small" variant="contained" onClick={() => openGrpcMethodRequestDialog(selectedMethod)}>Create request</Button>
              <Button size="small" variant="outlined" onClick={() => openSource(selectedMethod)}>View Proto source</Button>
              <Button size="small" variant="text" onClick={() => void copyTextWithAnnouncement(`${selectedMethod.serviceName}/${selectedMethod.methodName}`, "RPC path")}>Copy RPC path</Button>
            </Stack>

            <Box sx={{ pt: 0.5 }}>
              <Stack direction="row" alignItems="center" spacing={0.6} sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0, flex: 1 }}>Service methods</Typography>
                <Button size="small" variant="text" onClick={() => openGrpcMethodsRequestDialog(serviceMethods, library.id, version.id)}>Create all {serviceMethods.length} requests</Button>
              </Stack>
              <Box sx={{ borderTop: "1px solid", borderColor: "divider" }}>
                {serviceMethods.map((method) => (
                  <Button
                    key={methodKey(method)}
                    size="small"
                    variant="text"
                    onClick={() => setSelectedKey(methodKey(method))}
                    sx={{ minHeight: 30, width: "100%", justifyContent: "flex-start", px: 0.5, borderRadius: 0, borderBottom: "1px solid", borderColor: "divider", bgcolor: methodKey(method) === selectedKey ? "action.selected" : "transparent", color: "text.primary" }}
                  >
                    <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>{method.methodName}</Typography>
                    <Typography variant="caption" color="text.secondary">{methodKind(method)}</Typography>
                  </Button>
                ))}
              </Box>
            </Box>
          </Stack>
        ) : (
          <Box sx={{ color: "text.secondary" }}><Typography variant="body2">Select a method from the Schemas sidebar.</Typography></Box>
        )}
      </Box>

      <Dialog open={sourceOpen} onClose={() => setSourceOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ py: 1 }}>{selectedFile?.name ?? "Proto source"}</DialogTitle>
        <DialogContent sx={{ height: "min(72vh, 680px)", p: 1, overflow: "hidden" }}>
          {files.length > 1 ? (
            <Stack direction="row" sx={{ height: "100%", minHeight: 0 }}>
              <Box sx={{ width: 210, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", overflow: "auto", pr: 0.5 }}>
                {files.map((file) => (
                  <Button key={file.name} size="small" variant="text" onClick={() => setSourceFileName(file.name)} sx={{ width: "100%", justifyContent: "flex-start", px: 0.5, bgcolor: selectedFile?.name === file.name ? "action.selected" : "transparent", color: "text.primary" }}>
                    <Typography variant="body2" noWrap title={file.name}>{file.name}</Typography>
                  </Button>
                ))}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1, pl: 1 }}>{selectedFile ? <ProtoSourceBlock file={selectedFile} fullHeight /> : null}</Box>
            </Stack>
          ) : selectedFile ? <ProtoSourceBlock file={selectedFile} fullHeight /> : null}
        </DialogContent>
        <DialogActions><Button onClick={() => setSourceOpen(false)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete schema?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Delete <strong>{library.name}</strong>? {requestUsage + mockUsage > 0 ? `${requestUsage + mockUsage} request/mock bindings currently use this revision.` : ""}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { purgeGlobalProtoLibrary(library.id); setDeleteOpen(false); }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
