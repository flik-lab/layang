"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@/components/shadcn/compat";
import type { ProtoSourceFile } from "@/lib/types";
import type { ApiCollection } from "../../shared/workbench-types";
import type { ProtoLibrary } from "./proto-library-types";
import {
  findProtoVersionDependencies,
  prepareProtoVersionImport,
  type ProtoRequestImpact,
  type ProtoSchemaChange,
  type ProtoPurgeReferencePolicy,
  type ProtoVersionDeleteResult,
  type ProtoVersionDependency,
  type ProtoVersionImportMode,
  type ProtoVersionImportPlan,
} from "./proto-version-management";

export function ProtoVersionManager({
  library,
  activeVersionId,
  collections,
  onApplyVersionImport,
  onArchiveVersion,
  onRestoreVersion,
  onPurgeVersion,
  onArchiveLibrary,
  onRestoreLibrary,
  onPurgeLibrary,
}: {
  library: ProtoLibrary;
  activeVersionId: string;
  collections: ApiCollection[];
  onApplyVersionImport: (
    plan: ProtoVersionImportPlan,
    selectedRequestIds: ReadonlySet<string>,
    setAsDefault?: boolean,
  ) => void;
  onArchiveVersion: (libraryId: string, versionId: string) => ProtoVersionDeleteResult;
  onRestoreVersion: (libraryId: string, versionId: string) => ProtoVersionDeleteResult;
  onPurgeVersion: (
    libraryId: string,
    versionId: string,
    referencePolicy: ProtoPurgeReferencePolicy,
  ) => ProtoVersionDeleteResult;
  onArchiveLibrary: (libraryId: string) => ProtoVersionDeleteResult;
  onRestoreLibrary: (libraryId: string) => ProtoVersionDeleteResult;
  onPurgeLibrary: (libraryId: string) => ProtoVersionDeleteResult;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSchemaOpen, setDeleteSchemaOpen] = useState(false);
  const [baseVersionId, setBaseVersionId] = useState(activeVersionId || library.defaultVersionId);
  const [importMode, setImportMode] = useState<ProtoVersionImportMode>("changed-files");
  const [versionLabel, setVersionLabel] = useState(`v${library.versions.length + 1}`);
  const [plan, setPlan] = useState<ProtoVersionImportPlan | null>(null);
  const [importFiles, setImportFiles] = useState<ProtoSourceFile[]>([]);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set<string>());
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [importError, setImportError] = useState("");
  const [deleteVersionId, setDeleteVersionId] = useState(activeVersionId || library.defaultVersionId);
  const [replacementVersionId, setReplacementVersionId] = useState("");
  const [deletePolicy, setDeletePolicy] = useState<ProtoPurgeReferencePolicy["type"]>("keep-unresolved");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [schemaDeleteError, setSchemaDeleteError] = useState("");

  useEffect(() => {
    for (const input of [folderInputRef.current]) {
      input?.setAttribute("webkitdirectory", "");
      input?.setAttribute("directory", "");
    }
  }, [importOpen]);

  const deleteDependencies = useMemo(
    () => findProtoVersionDependencies(collections, library.id, deleteVersionId),
    [collections, deleteVersionId, library.id],
  );
  const replacementVersions = library.versions.filter(
    (version) => version.id !== deleteVersionId && version.lifecycle !== "archived",
  );
  const selectedDeleteVersion = library.versions.find((version) => version.id === deleteVersionId);
  const schemaDependencies = useMemo(
    () =>
      collections.flatMap((collection) =>
        collection.requests
          .filter((request) => request.grpc?.libraryId === library.id)
          .map((request) => ({
            collectionId: collection.id,
            collectionName: collection.name,
            requestId: request.id,
            requestName: request.name,
            methodFullName: request.grpc?.methodFullName ?? "",
          })),
      ),
    [collections, library.id],
  );

  const readProtoSources = async (files: File[]): Promise<ProtoSourceFile[]> =>
    Promise.all(
      files
        .filter((file: File) => file.name.toLowerCase().endsWith(".proto"))
        .map(async (file: File) => ({
          name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
          text: await file.text(),
        })),
    );

  const resetImport = () => {
    setPlan(null);
    setImportFiles([]);
    setSelectedRequestIds(new Set<string>());
    setImportError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const readSelectedFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = (Array.from(event.target.files ?? []) as File[]).filter((file: File) =>
      file.name.toLowerCase().endsWith(".proto"),
    );
    if (files.length === 0) {
      setImportError(
        importMode === "changed-files"
          ? "Select one or more changed or dependency .proto files."
          : "Select one or more .proto files that form a complete revision.",
      );
      return;
    }
    const baseVersion = library.versions.find((version) => version.id === baseVersionId);
    if (!baseVersion) {
      setImportError("Select a valid base version.");
      return;
    }
    try {
      const sources = await readProtoSources(files);
      const nextSources =
        importMode === "changed-files"
          ? [...new Map([...importFiles, ...sources].map((file) => [file.name.replaceAll("\\", "/"), file])).values()]
          : sources;
      setImportFiles(nextSources);
      const nextPlan = prepareProtoVersionImport({
        library,
        baseVersion,
        files: nextSources,
        versionLabel,
        collections,
        importMode,
      });
      setPlan(nextPlan);
      setSelectedRequestIds(
        new Set<string>(
          nextPlan.impacts
            .filter((impact: ProtoRequestImpact) => impact.status === "compatible")
            .map((impact: ProtoRequestImpact) => impact.requestId),
        ),
      );
      setImportError("");
    } catch (error) {
      setPlan(null);
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  const applyImport = () => {
    if (!plan) return;
    onApplyVersionImport(plan, selectedRequestIds, setAsDefault);
    setImportOpen(false);
    resetImport();
    setVersionLabel(`v${library.versions.length + 2}`);
  };

  const executeDelete = () => {
    const referencePolicy: ProtoPurgeReferencePolicy =
      deletePolicy === "move-compatible"
        ? { type: "move-compatible", replacementVersionId }
        : { type: "keep-unresolved" };
    const result = onPurgeVersion(library.id, deleteVersionId, referencePolicy);
    if (!result.ok) {
      setDeleteError(result.reason);
      return;
    }
    setDeleteOpen(false);
    setDeleteError("");
    setReplacementVersionId("");
    setDeleteConfirmation("");
    setDeletePolicy("keep-unresolved");
  };

  const executeSchemaDelete = () => {
    const result = onPurgeLibrary(library.id);
    if (!result.ok) {
      setSchemaDeleteError(result.reason);
      return;
    }
    setDeleteSchemaOpen(false);
    setSchemaDeleteError("");
  };

  const toggleRevisionArchive = () => {
    const version = library.versions.find((item) => item.id === (activeVersionId || library.defaultVersionId));
    if (!version) return;
    const result =
      version.lifecycle === "archived"
        ? onRestoreVersion(library.id, version.id)
        : onArchiveVersion(library.id, version.id);
    if (!result.ok) setDeleteError(result.reason);
  };

  return (
    <>
      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ px: 0.2, pb: 0.55 }}>
        <Button
          size="small"
          variant="outlined"
          disabled={library.lifecycle === "archived"}
          onClick={() => {
            setBaseVersionId(activeVersionId || library.defaultVersionId);
            setVersionLabel(`v${library.versions.length + 1}`);
            setImportMode("changed-files");
            resetImport();
            setImportOpen(true);
          }}
        >
          Import new revision
        </Button>
        <Button size="small" variant="text" onClick={toggleRevisionArchive}>
          {library.versions.find((item) => item.id === (activeVersionId || library.defaultVersionId))?.lifecycle ===
          "archived"
            ? "Restore revision"
            : "Archive revision"}
        </Button>
        <Button
          size="small"
          variant="text"
          onClick={() => {
            const result =
              library.lifecycle === "archived" ? onRestoreLibrary(library.id) : onArchiveLibrary(library.id);
            if (!result.ok) setDeleteError(result.reason);
          }}
        >
          {library.lifecycle === "archived" ? "Restore schema" : "Archive schema"}
        </Button>
        <Button
          size="small"
          variant="text"
          color="error"
          onClick={() => {
            setDeleteVersionId(activeVersionId || library.defaultVersionId);
            setDeletePolicy("keep-unresolved");
            setDeleteConfirmation("");
            setDeleteError("");
            setDeleteOpen(true);
          }}
        >
          Delete revision
        </Button>
        <Button
          size="small"
          variant="text"
          color="error"
          onClick={() => {
            setSchemaDeleteError("");
            setDeleteSchemaOpen(true);
          }}
        >
          Delete schema
        </Button>
      </Stack>
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Import revision for {library.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.25} sx={{ pt: 0.5 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <Typography variant="caption" color="text.secondary">
                  Base revision
                </Typography>
                <Select
                  value={baseVersionId}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                    setBaseVersionId(String(event.target.value));
                    resetImport();
                  }}
                >
                  {library.versions.map((version) => (
                    <MenuItem key={version.id} value={version.id}>
                      {version.version}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="New revision label"
                value={versionLabel}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setVersionLabel(event.target.value);
                  resetImport();
                }}
                sx={{ flex: 1 }}
              />
            </Stack>

            <Typography variant="caption" color="text.secondary">
              Revision source
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={0.75}>
              <Button
                variant={importMode === "changed-files" ? "contained" : "outlined"}
                onClick={() => {
                  setImportMode("changed-files");
                  resetImport();
                }}
                sx={{ flex: 1, justifyContent: "flex-start" }}
              >
                Update changed files
              </Button>
              <Button
                variant={importMode === "complete-revision" ? "contained" : "outlined"}
                onClick={() => {
                  setImportMode("complete-revision");
                  resetImport();
                }}
                sx={{ flex: 1, justifyContent: "flex-start" }}
              >
                Upload complete revision
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {importMode === "changed-files"
                ? "Upload only the files that changed. Layang keeps the remaining files from the selected base revision and creates a new complete snapshot."
                : "Upload every local proto file required by the new revision. Files omitted from the upload are not included in the candidate snapshot."}
            </Typography>

            <input
              ref={fileInputRef}
              type="file"
              accept=".proto,text/x-protobuf"
              multiple
              hidden
              onChange={readSelectedFiles}
            />
            <input
              ref={folderInputRef}
              type="file"
              accept=".proto,text/x-protobuf"
              multiple
              hidden
              onChange={readSelectedFiles}
            />
            <Stack direction="row" spacing={0.75}>
              <Button variant="outlined" onClick={() => fileInputRef.current?.click()}>
                {importMode === "changed-files"
                  ? importFiles.length > 0
                    ? "Add changed/dependency files"
                    : "Select changed files"
                  : "Select revision files"}
              </Button>
              <Button variant="outlined" onClick={() => folderInputRef.current?.click()}>
                {importMode === "changed-files" ? "Select changed files folder" : "Select revision folder"}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              The existing revision is never overwritten. Missing imports are detected before the candidate revision can
              be saved.
              {importMode === "changed-files" && importFiles.length > 0
                ? ` ${importFiles.length} changed or dependency file${importFiles.length === 1 ? "" : "s"} selected.`
                : ""}
            </Typography>

            {importError && (
              <Paper variant="outlined" sx={{ p: 1, borderColor: "error.main" }}>
                <Typography variant="body2" color="error">
                  {importError}
                </Typography>
              </Paper>
            )}

            {plan && (
              <>
                <Paper variant="outlined" sx={{ p: 0.85 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {plan.importMode === "changed-files"
                      ? "Incremental revision snapshot"
                      : "Complete revision snapshot"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {plan.candidateVersion.files.length} total proto file
                    {plan.candidateVersion.files.length === 1 ? "" : "s"} in the new revision.
                    {plan.importMode === "changed-files"
                      ? ` ${Math.max(0, plan.candidateVersion.files.length - plan.fileChanges.length)} unchanged base file${Math.max(0, plan.candidateVersion.files.length - plan.fileChanges.length) === 1 ? "" : "s"} retained automatically.`
                      : ""}
                  </Typography>
                  <Stack spacing={0.35} sx={{ mt: 0.65, maxHeight: 120, overflow: "auto" }}>
                    {plan.fileChanges.map((file) => (
                      <Stack key={`${file.action}:${file.name}`} direction="row" spacing={0.75} alignItems="center">
                        <Chip
                          size="small"
                          color={
                            file.action === "added"
                              ? "success"
                              : file.action === "replaced"
                                ? "warning"
                                : file.action === "renamed"
                                  ? "warning"
                                  : file.action === "removed"
                                    ? "error"
                                    : "default"
                          }
                          label={file.action}
                          sx={{ minWidth: 68 }}
                        />
                        <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
                          {file.action === "renamed" && file.previousName
                            ? `${file.previousName} → ${file.name}`
                            : file.name}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Paper>

                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  <Chip size="small" color="error" label={`${plan.diff.summary.breaking} breaking`} />
                  <Chip size="small" color="warning" label={`${plan.diff.summary.review} review`} />
                  <Chip size="small" color="success" label={`${plan.diff.summary.compatible} compatible`} />
                  <Chip
                    size="small"
                    label={`${plan.impacts.length} request impact${plan.impacts.length === 1 ? "" : "s"}`}
                  />
                </Stack>

                <Paper variant="outlined" sx={{ maxHeight: 220, overflow: "auto", p: 0.75 }}>
                  {plan.diff.changes.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No schema changes detected.
                    </Typography>
                  ) : (
                    plan.diff.changes.map((change: ProtoSchemaChange) => (
                      <Stack key={change.id} direction="row" spacing={0.75} alignItems="flex-start" sx={{ py: 0.45 }}>
                        <Chip
                          size="small"
                          color={
                            change.severity === "breaking"
                              ? "error"
                              : change.severity === "review"
                                ? "warning"
                                : "success"
                          }
                          label={change.severity}
                          sx={{ minWidth: 74 }}
                        />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={500}>
                            {change.entity}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {change.detail}
                          </Typography>
                        </Box>
                      </Stack>
                    ))
                  )}
                </Paper>

                <Stack direction="row" spacing={0.75}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() =>
                      setSelectedRequestIds(
                        new Set<string>(
                          plan.impacts
                            .filter((impact: ProtoRequestImpact) => impact.canUpdate)
                            .map((impact: ProtoRequestImpact) => impact.requestId),
                        ),
                      )
                    }
                  >
                    Select updatable
                  </Button>
                  <Button size="small" variant="text" onClick={() => setSelectedRequestIds(new Set<string>())}>
                    Keep pinned
                  </Button>
                </Stack>

                <Paper variant="outlined" sx={{ maxHeight: 210, overflow: "auto", p: 0.75 }}>
                  {plan.impacts.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No saved request currently uses the base version.
                    </Typography>
                  ) : (
                    plan.impacts.map((impact: ProtoRequestImpact) => (
                      <label
                        key={impact.requestId}
                        style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 2px" }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRequestIds.has(impact.requestId)}
                          disabled={!impact.canUpdate}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            setSelectedRequestIds((current: Set<string>) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(impact.requestId);
                              else next.delete(impact.requestId);
                              return next;
                            })
                          }
                        />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2">
                            {impact.collectionName} / {impact.requestName}
                          </Typography>
                          <Typography variant="caption" color={impact.canUpdate ? "text.secondary" : "error"}>
                            {impact.status}: {impact.reason}
                          </Typography>
                        </Box>
                      </label>
                    ))
                  )}
                </Paper>

                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={setAsDefault}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setSetAsDefault(event.target.checked)}
                  />
                  <Typography variant="body2">Set as default revision</Typography>
                </label>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="text"
            onClick={() => {
              setImportOpen(false);
              resetImport();
            }}
          >
            Cancel
          </Button>
          <Button variant="contained" disabled={!plan} onClick={applyImport}>
            Create revision
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Delete revision?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Revision files will be removed. Saved requests stay in the workspace.
            </Typography>
            <FormControl size="small">
              <Typography variant="caption" color="text.secondary">
                Revision to delete
              </Typography>
              <Select
                value={deleteVersionId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  setDeleteVersionId(String(event.target.value));
                  setReplacementVersionId("");
                  setDeleteConfirmation("");
                  setDeleteError("");
                }}
              >
                {library.versions.map((version) => (
                  <MenuItem key={version.id} value={version.id}>
                    {version.version}
                    {version.lifecycle === "archived" ? " · archived" : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Typography variant="body2" color="text.secondary">
              {deleteDependencies.length > 0
                ? `${deleteDependencies.length} saved request${deleteDependencies.length === 1 ? "" : "s"} use this revision.`
                : "No saved collection request uses this revision."}
            </Typography>

            {deleteDependencies.length > 0 && (
              <Paper variant="outlined" sx={{ maxHeight: 150, overflow: "auto", p: 0.75 }}>
                {deleteDependencies.map((dependency: ProtoVersionDependency) => (
                  <Box key={dependency.requestId} sx={{ py: 0.4 }}>
                    <Typography variant="body2">
                      {dependency.collectionName} / {dependency.requestName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dependency.methodFullName}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            )}

            <FormControl size="small">
              <Typography variant="caption" color="text.secondary">
                Existing reference behavior
              </Typography>
              <Select
                value={deletePolicy}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  setDeletePolicy(String(event.target.value) as ProtoPurgeReferencePolicy["type"]);
                  setReplacementVersionId("");
                  setDeleteError("");
                }}
              >
                <MenuItem value="keep-unresolved">Keep references unresolved</MenuItem>
                <MenuItem value="move-compatible">Move compatible references</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              {deletePolicy === "keep-unresolved"
                ? "References stay pinned and become unavailable until reassigned."
                : "Compatible references move to the selected revision."}
            </Typography>

            {deletePolicy === "move-compatible" && (
              <FormControl size="small">
                <Typography variant="caption" color="text.secondary">
                  Replacement revision
                </Typography>
                <Select
                  value={replacementVersionId}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    setReplacementVersionId(String(event.target.value))
                  }
                >
                  <MenuItem value="">Select replacement revision</MenuItem>
                  {replacementVersions.map((version) => (
                    <MenuItem key={version.id} value={version.id}>
                      {version.version}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              size="small"
              label="Type DELETE to confirm"
              value={deleteConfirmation}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setDeleteConfirmation(event.target.value)}
            />
            {selectedDeleteVersion?.lifecycle !== "archived" && (
              <Typography variant="caption" color="warning.main">
                Archive instead to keep existing requests runnable.
              </Typography>
            )}
            {deleteError && (
              <Typography variant="body2" color="error">
                {deleteError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteConfirmation !== "DELETE" || (deletePolicy === "move-compatible" && !replacementVersionId)}
            onClick={executeDelete}
          >
            Delete revision
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteSchemaOpen}
        onClose={() => {
          setDeleteSchemaOpen(false);
          setSchemaDeleteError("");
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Delete {library.name}?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ pt: 0.5 }}>
            <Typography variant="body2">
              {library.versions.length} revision{library.versions.length === 1 ? "" : "s"} will be removed.
            </Typography>
            {schemaDependencies.length > 0 ? (
              <>
                <Typography variant="body2" color="warning.main">
                  {schemaDependencies.length} saved request{schemaDependencies.length === 1 ? "" : "s"} use this schema.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Requests remain saved but become unavailable until reassigned.
                </Typography>
                <Stack spacing={0.25} sx={{ maxHeight: 112, overflowY: "auto" }}>
                  {schemaDependencies.slice(0, 6).map((dependency) => (
                    <Typography
                      key={`${dependency.collectionId}-${dependency.requestId}-${dependency.methodFullName}`}
                      variant="caption"
                      color="text.secondary"
                      noWrap
                    >
                      {dependency.collectionName} / {dependency.requestName}
                    </Typography>
                  ))}
                  {schemaDependencies.length > 6 && (
                    <Typography variant="caption" color="text.secondary">
                      +{schemaDependencies.length - 6} more
                    </Typography>
                  )}
                </Stack>
              </>
            ) : (
              <Typography variant="caption" color="text.secondary">
                No saved request uses this schema.
              </Typography>
            )}
            {schemaDeleteError && (
              <Typography variant="body2" color="error">
                {schemaDeleteError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="text"
            onClick={() => {
              setDeleteSchemaOpen(false);
              setSchemaDeleteError("");
            }}
          >
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={executeSchemaDelete}>
            Delete schema
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
