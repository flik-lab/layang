"use client";

import { useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Language, Stream, Terminal } from "@/components/shadcn/icons";
import type { ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import { loadProtoFiles } from "@/lib/proto-loader";
import type { LayangLoggerSettings, LayangLogLevel } from "../../shared/logger";
import type { LayangCertificateSettings } from "../../shared/certificate-settings";
import { getCollectionNodeBreadcrumb } from "../collection/collection-tree-domain";
import { methodKey } from "../../shared/rpc-method-utils";
import type { ProtoLibrary } from "../proto-library/proto-library-types";
import {
  assessProtoLibraryImport,
  prepareProtoVersionImport,
  type ProtoLibraryImportAssessment,
  type ProtoVersionImportPlan,
} from "../proto-library/proto-version-management";
import { canReplaceGrpcRequestName, uniqueCollectionRequestName } from "../collection/grpc-request-name";

type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SelectInputChangeEvent = ChangeEvent<HTMLSelectElement>;
type TextInputKeyboardEvent = ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>;
type ToastState = { id: number; open: boolean; message: string; severity: "success" | "info" | "warning" | "error" };
type ProtoImportReviewState = {
  schemaName: string;
  sources: ProtoSourceFile[];
  assessment: ProtoLibraryImportAssessment;
  plan: ProtoVersionImportPlan | null;
  versionLabel: string;
};

type WorkbenchViewContext = Record<string, any>;

export function WorkbenchDialogs(props: { ctx: WorkbenchViewContext }) {
  const {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FeatureMarkdownPreview,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Stack,
    Switch,
    TextField,
    Typography,
    certificateDraft,
    certificateInfo,
    certificateSettingsOpen,
    applyWorkspacePreference,
    chooseCustomWorkspacePreference,
    collectionDialogOpen,
    collectionNameDraft,
    collections,
    protoLibraries,
    protoRuntimeRegistry,
    requestTargetCollectionId,
    requestTargetFolderId,
    requestLocationEditable,
    createProtoLibraryFromImport,
    applyProtoVersionImportPlan,
    confirmAddCollection,
    confirmAddCollectionRequest,
    confirmRenameMockScenario,
    confirmSaveCurrentEnvironment,
    deleteEditingMockScenario,
    docsPreview,
    downloadTextFile,
    envDialogMode,
    envDialogOpen,
    envDraftName,
    envDraftRestUrl,
    envDraftNativeTarget,
    envDraftGrpcWebUrl,
    envDraftWebSocketUrl,
    mockScenarioDialogOpen,
    mockScenarioDraftId,
    mockScenarioEditing,
    importCertificateSettingsFile,
    loggerDraft,
    loggerInfo,
    loggerLevelOptions,
    loggerSettingsOpen,
    openLogFolder,
    clearCertificateSettingsPem,
    removeCertificateSettingsItem,
    removeEditingEnvironment,
    requestKindDraft,
    requestGrpcLibraryIdDraft,
    requestGrpcVersionIdDraft,
    requestGrpcMethodKeyDraft,
    requestNameDialogOpen,
    requestNameDraft,
    setCollectionDialogOpen,
    setCollectionNameDraft,
    setDocsPreview,
    setEnvDialogOpen,
    setEnvDraftName,
    setEnvDraftRestUrl,
    setEnvDraftNativeTarget,
    setEnvDraftGrpcWebUrl,
    setEnvDraftWebSocketUrl,
    saveCertificateSettings,
    setCertificateDraft,
    setCertificateSettingsOpen,
    setLoggerDraft,
    setLoggerSettingsOpen,
    setMockScenarioDialogOpen,
    setMockScenarioDraftId,
    setRequestNameDialogOpen,
    setRequestNameDraft,
    setRequestKindDraft,
    setRequestGrpcLibraryIdDraft,
    setRequestGrpcVersionIdDraft,
    setRequestGrpcMethodKeyDraft,
    setRequestTargetCollectionId,
    setRequestTargetFolderId,
    setRequestLocationEditable,
    setToast,
    setSideSection,
    saveLoggerSettings,
    clearLogFiles,
    timestampForFile,
    toast,
    workspaceSetupDefaultPath,
    workspaceSetupOpen,
    workspaceSetupPending,
  } = props.ctx;

  const collectionSchemaInputRef = useRef<HTMLInputElement | null>(null);
  const collectionSchemaFolderInputRef = useRef<HTMLInputElement | null>(null);
  const [protoImportReview, setProtoImportReview] = useState<ProtoImportReviewState | null>(null);
  const [updateCompatibleRequests, setUpdateCompatibleRequests] = useState(true);
  const requestTargetCollection = collections.find(
    (collection: { id: string }) => collection.id === requestTargetCollectionId,
  );
  const requestTargetLocation = requestTargetCollection
    ? [
        requestTargetCollection.name,
        ...getCollectionNodeBreadcrumb(requestTargetCollection, requestTargetFolderId),
      ].join(" / ")
    : "Collection";
  const requestLocationOptions = collections.flatMap((collection: any) => [
    { value: `${collection.id}|`, label: collection.name, collectionId: collection.id, folderId: null },
    ...(collection.folders ?? []).map((folder: any) => ({
      value: `${collection.id}|${folder.id}`,
      label: [collection.name, ...getCollectionNodeBreadcrumb(collection, folder.id)].join(" / "),
      collectionId: collection.id,
      folderId: folder.id,
    })),
  ]);
  const globalProtoSchemas = protoLibraries as ProtoLibrary[];
  const selectedRequestSchema =
    globalProtoSchemas.find((library) => library.id === requestGrpcLibraryIdDraft) ?? globalProtoSchemas[0];
  const selectedRequestSchemaVersion =
    selectedRequestSchema?.versions.find((version) => version.id === requestGrpcVersionIdDraft) ??
    selectedRequestSchema?.versions.find((version) => version.id === selectedRequestSchema.defaultVersionId) ??
    selectedRequestSchema?.versions[0];
  const selectedRequestSchemaRuntime =
    selectedRequestSchema && selectedRequestSchemaVersion
      ? protoRuntimeRegistry.resolveVersion(selectedRequestSchema.id, selectedRequestSchemaVersion.id)
      : null;
  const selectedRequestMethods: RpcMethodInfo[] = selectedRequestSchemaRuntime?.loaded.methods ?? [];
  const selectedRequestServices = Array.from(new Set(selectedRequestMethods.map((method) => method.serviceName))).sort(
    (left, right) => left.localeCompare(right),
  );
  const selectedRequestMethod = selectedRequestMethods.find(
    (method) => methodKey(method) === requestGrpcMethodKeyDraft,
  );
  const selectedRequestServiceName = selectedRequestMethod?.serviceName ?? selectedRequestServices[0] ?? "";
  const selectedServiceMethods = selectedRequestMethods.filter(
    (method) => method.serviceName === selectedRequestServiceName,
  );

  const existingRequestNames = requestTargetCollection?.requests.map((request: { name: string }) => request.name) ?? [];

  const selectGrpcMethodDraft = (nextMethod: { methodName: string } | undefined, nextMethodKey: string) => {
    const previousMethodName = selectedRequestMethod?.methodName;
    setRequestGrpcMethodKeyDraft(nextMethodKey);
    if (nextMethod && canReplaceGrpcRequestName(requestNameDraft, previousMethodName)) {
      setRequestNameDraft(uniqueCollectionRequestName(nextMethod.methodName, existingRequestNames));
    }
  };

  const importSchemaForRequest = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      const files = Array.from(event.target.files ?? []).filter((file) => file.name.toLowerCase().endsWith(".proto"));
      if (files.length === 0) return;
      const sources = await Promise.all(
        files.map(async (file) => ({
          name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
          text: await file.text(),
        })),
      );
      const schemaName = files[0]?.name.replace(/\.proto$/i, "") || "gRPC Schema";
      const assessment = assessProtoLibraryImport(protoLibraries, sources);
      if (assessment) {
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
        setUpdateCompatibleRequests(true);
        setProtoImportReview({ schemaName, sources, assessment, plan, versionLabel });
        return;
      }
      const created = createProtoLibraryFromImport(schemaName, "revision 1", sources);
      setRequestGrpcLibraryIdDraft(created.library.id);
      setRequestGrpcVersionIdDraft(created.version?.id ?? "");
      selectGrpcMethodDraft(created.method, created.method ? methodKey(created.method) : "");
    } catch (error) {
      setToast({
        id: Date.now(),
        open: true,
        message: error instanceof Error ? error.message : String(error),
        severity: "error",
      });
    } finally {
      if (collectionSchemaInputRef.current) collectionSchemaInputRef.current.value = "";
      if (collectionSchemaFolderInputRef.current) collectionSchemaFolderInputRef.current.value = "";
    }
  };

  const selectExistingProtoImport = () => {
    if (!protoImportReview) return;
    const { assessment } = protoImportReview;
    const runtime = protoRuntimeRegistry.resolveVersion(assessment.library.id, assessment.version.id);
    const firstMethod = runtime?.loaded.methods[0];
    setRequestGrpcLibraryIdDraft(assessment.library.id);
    setRequestGrpcVersionIdDraft(assessment.version.id);
    selectGrpcMethodDraft(firstMethod, firstMethod ? methodKey(firstMethod) : "");
    setProtoImportReview(null);
  };

  const createSeparateProtoImport = () => {
    if (!protoImportReview) return;
    const created = createProtoLibraryFromImport(protoImportReview.schemaName, "revision 1", protoImportReview.sources);
    setRequestGrpcLibraryIdDraft(created.library.id);
    setRequestGrpcVersionIdDraft(created.version?.id ?? "");
    selectGrpcMethodDraft(created.method, created.method ? methodKey(created.method) : "");
    setProtoImportReview(null);
  };

  const createProtoImportRevision = () => {
    if (!protoImportReview) return;
    try {
      const plan = prepareProtoVersionImport({
        library: protoImportReview.assessment.library,
        baseVersion: protoImportReview.assessment.version,
        files: protoImportReview.sources,
        versionLabel:
          protoImportReview.versionLabel.trim() ||
          `Revision ${protoImportReview.assessment.library.versions.length + 1}`,
        collections,
        importMode: "complete-revision",
        allowDuplicateChecksum: protoImportReview.assessment.kind === "exact",
      });
      const selectedRequestIds = updateCompatibleRequests
        ? new Set(plan.impacts.filter((impact) => impact.canUpdate).map((impact) => impact.requestId))
        : new Set<string>();
      applyProtoVersionImportPlan(plan, selectedRequestIds, true);
      const loadedRevision = loadProtoFiles(plan.candidateVersion.files);
      const firstMethod = loadedRevision.methods[0];
      setRequestGrpcLibraryIdDraft(plan.libraryId);
      setRequestGrpcVersionIdDraft(plan.candidateVersion.id);
      selectGrpcMethodDraft(firstMethod, firstMethod ? methodKey(firstMethod) : "");
      setProtoImportReview(null);
    } catch (error) {
      setToast({
        id: Date.now(),
        open: true,
        message: error instanceof Error ? error.message : String(error),
        severity: "error",
      });
    }
  };

  const selectRequestKind = (kind: "rest" | "websocket" | "grpc") => {
    setRequestKindDraft(kind);
    if (kind !== "grpc") {
      setRequestGrpcLibraryIdDraft("");
      setRequestGrpcVersionIdDraft("");
      setRequestGrpcMethodKeyDraft("");
      return;
    }
    const schema = globalProtoSchemas[0];
    const version = schema?.versions.find((item) => item.id === schema.defaultVersionId) ?? schema?.versions[0];
    const runtime = schema && version ? protoRuntimeRegistry.resolveVersion(schema.id, version.id) : null;
    setRequestGrpcLibraryIdDraft(schema?.id ?? "");
    setRequestGrpcVersionIdDraft(version?.id ?? "");
    const firstMethod = runtime?.loaded.methods[0];
    selectGrpcMethodDraft(firstMethod, firstMethod ? methodKey(firstMethod) : "");
  };

  return (
    <>
      <Dialog open={workspaceSetupOpen} onClose={() => undefined} fullWidth maxWidth="sm">
        <DialogTitle>Choose workspace folder</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              Requests, mocks, documentation, environments, and history are stored in this folder.
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <Typography variant="subtitle2">Default location</Typography>
              <Typography variant="body2" color="text.secondary">
                {workspaceSetupDefaultPath || "Documents\\Layang\\Workspace"}
              </Typography>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void chooseCustomWorkspacePreference()} disabled={workspaceSetupPending}>
            Choose custom folder
          </Button>
          <Button variant="contained" onClick={() => void applyWorkspacePreference()} disabled={workspaceSetupPending}>
            Use default folder
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={mockScenarioDialogOpen} onClose={() => setMockScenarioDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Edit scenario</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <TextField
              autoFocus
              size="small"
              label="Scenario name"
              value={mockScenarioDraftId}
              onChange={(event: TextInputChangeEvent) => setMockScenarioDraftId(event.target.value)}
              placeholder="sayhello-success"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="error" onClick={deleteEditingMockScenario} disabled={!mockScenarioEditing}>
            Delete
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setMockScenarioDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmRenameMockScenario} disabled={!mockScenarioEditing}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={collectionDialogOpen} onClose={() => setCollectionDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add collection</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <TextField
              autoFocus
              size="small"
              label="Collection name"
              value={collectionNameDraft}
              onChange={(event: TextInputChangeEvent) => setCollectionNameDraft(event.target.value)}
              onKeyDown={(event: TextInputKeyboardEvent) => {
                if (event.key === "Enter") confirmAddCollection();
              }}
              placeholder="Sample API Collection"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCollectionDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmAddCollection}>
            Add Collection
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={requestNameDialogOpen} onClose={() => setRequestNameDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {requestKindDraft === "grpc"
            ? "New gRPC request"
            : requestKindDraft === "rest"
              ? "New HTTP request"
              : requestKindDraft === "websocket"
                ? "New WebSocket request"
                : "New request"}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.4} sx={{ mt: 0.5 }}>
            {!requestKindDraft && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Request type
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 0.5 }}>
                  <Button
                    variant={requestKindDraft === "rest" ? "contained" : "outlined"}
                    onClick={() => selectRequestKind("rest")}
                    sx={{ flex: 1, minHeight: 56, justifyContent: "flex-start", px: 1.25 }}
                  >
                    <Language sx={{ fontSize: 18, mr: 1 }} />
                    <Box sx={{ textAlign: "left" }}>
                      <Typography variant="body2" fontWeight={600}>
                        REST
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        HTTP request
                      </Typography>
                    </Box>
                  </Button>
                  <Button
                    variant={requestKindDraft === "websocket" ? "contained" : "outlined"}
                    onClick={() => selectRequestKind("websocket")}
                    sx={{ flex: 1, minHeight: 56, justifyContent: "flex-start", px: 1.25 }}
                  >
                    <Stream sx={{ fontSize: 18, mr: 1 }} />
                    <Box sx={{ textAlign: "left" }}>
                      <Typography variant="body2" fontWeight={600}>
                        WebSocket
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        Socket request
                      </Typography>
                    </Box>
                  </Button>
                  <Button
                    variant={requestKindDraft === "grpc" ? "contained" : "outlined"}
                    onClick={() => selectRequestKind("grpc")}
                    sx={{ flex: 1, minHeight: 56, justifyContent: "flex-start", px: 1.25 }}
                  >
                    <Terminal sx={{ fontSize: 18, mr: 1 }} />
                    <Box sx={{ textAlign: "left" }}>
                      <Typography variant="body2" fontWeight={600}>
                        gRPC
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        Proto method
                      </Typography>
                    </Box>
                  </Button>
                </Stack>
              </Box>
            )}

            {requestLocationEditable ? (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Location
                </Typography>
                <Select
                  value={`${requestTargetCollectionId}|${requestTargetFolderId ?? ""}`}
                  onChange={(event: SelectInputChangeEvent) => {
                    const option = requestLocationOptions.find(
                      (item: any) => item.value === String(event.target.value),
                    );
                    if (!option) return;
                    setRequestTargetCollectionId(option.collectionId);
                    setRequestTargetFolderId(option.folderId);
                  }}
                  fullWidth
                  size="small"
                  aria-label="Request location"
                >
                  {requestLocationOptions.map((option: any) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            ) : (
              <Paper variant="outlined" sx={{ px: 1, py: 0.75 }}>
                <Typography variant="caption" color="text.secondary">
                  Location
                </Typography>
                <Typography variant="body2" noWrap title={requestTargetLocation}>
                  {requestTargetLocation}
                </Typography>
              </Paper>
            )}

            {requestKindDraft && (
              <TextField
                autoFocus
                size="small"
                label="Request name"
                value={requestNameDraft}
                onChange={(event: TextInputChangeEvent) => setRequestNameDraft(event.target.value)}
                onKeyDown={(event: TextInputKeyboardEvent) => {
                  if (event.key === "Enter" && requestKindDraft !== "grpc") confirmAddCollectionRequest();
                }}
                placeholder={
                  requestKindDraft === "grpc"
                    ? "Subscribe Track"
                    : requestKindDraft === "websocket"
                      ? "Track Events"
                      : "List Tracks"
                }
              />
            )}

            {requestKindDraft === "grpc" && (
              <Paper variant="outlined" sx={{ p: 1.1 }}>
                <Stack spacing={1}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography variant="subtitle2">gRPC schema and method</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Reusable across collections.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5}>
                      <input
                        ref={collectionSchemaInputRef}
                        hidden
                        multiple
                        type="file"
                        accept=".proto,text/x-protobuf"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => void importSchemaForRequest(event)}
                      />
                      <input
                        ref={(node) => {
                          collectionSchemaFolderInputRef.current = node;
                          if (node) {
                            node.setAttribute("webkitdirectory", "");
                            node.setAttribute("directory", "");
                          }
                        }}
                        hidden
                        multiple
                        type="file"
                        accept=".proto,text/x-protobuf"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => void importSchemaForRequest(event)}
                      />
                      <Button size="small" variant="text" onClick={() => collectionSchemaInputRef.current?.click()}>
                        Upload files
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => collectionSchemaFolderInputRef.current?.click()}
                      >
                        Upload folder
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => {
                          setRequestNameDialogOpen(false);
                          setSideSection("proto-schemas");
                        }}
                      >
                        Manage schemas
                      </Button>
                    </Stack>
                  </Stack>

                  {globalProtoSchemas.length === 0 ? (
                    <Paper variant="outlined" sx={{ p: 1, bgcolor: "action.hover" }}>
                      <Typography variant="body2" fontWeight={600}>
                        No global proto schema yet
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Upload proto files or a proto folder to the global registry. Every collection can reuse it.
                      </Typography>
                    </Paper>
                  ) : (
                    <>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            Global proto schema
                          </Typography>
                          <Select
                            value={selectedRequestSchema?.id ?? ""}
                            onChange={(event: SelectInputChangeEvent) => {
                              const libraryId = String(event.target.value);
                              const schema = globalProtoSchemas.find((item) => item.id === libraryId);
                              const version =
                                schema?.versions.find((item) => item.id === schema.defaultVersionId) ??
                                schema?.versions[0];
                              const runtime =
                                schema && version ? protoRuntimeRegistry.resolveVersion(schema.id, version.id) : null;
                              setRequestGrpcLibraryIdDraft(libraryId);
                              setRequestGrpcVersionIdDraft(version?.id ?? "");
                              const firstMethod = runtime?.loaded.methods[0];
                              selectGrpcMethodDraft(firstMethod, firstMethod ? methodKey(firstMethod) : "");
                            }}
                            fullWidth
                            size="small"
                          >
                            {globalProtoSchemas.map((library) => (
                              <MenuItem key={library.id} value={library.id}>
                                {library.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            Revision
                          </Typography>
                          <Select
                            value={selectedRequestSchemaVersion?.id ?? ""}
                            onChange={(event: SelectInputChangeEvent) => {
                              const versionId = String(event.target.value);
                              const runtime = selectedRequestSchema
                                ? protoRuntimeRegistry.resolveVersion(selectedRequestSchema.id, versionId)
                                : null;
                              setRequestGrpcVersionIdDraft(versionId);
                              const firstMethod = runtime?.loaded.methods[0];
                              selectGrpcMethodDraft(firstMethod, firstMethod ? methodKey(firstMethod) : "");
                            }}
                            fullWidth
                            size="small"
                          >
                            {(selectedRequestSchema?.versions ?? []).map((version) => (
                              <MenuItem key={version.id} value={version.id}>
                                {version.version}
                              </MenuItem>
                            ))}
                          </Select>
                        </Box>
                      </Stack>

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            Service
                          </Typography>
                          <Select
                            value={selectedRequestServiceName}
                            onChange={(event: SelectInputChangeEvent) => {
                              const serviceName = String(event.target.value);
                              const firstMethod = selectedRequestMethods.find(
                                (method) => method.serviceName === serviceName,
                              );
                              selectGrpcMethodDraft(firstMethod, firstMethod ? methodKey(firstMethod) : "");
                            }}
                            fullWidth
                            size="small"
                          >
                            {selectedRequestServices.map((serviceName) => (
                              <MenuItem key={serviceName} value={serviceName}>
                                {serviceName}
                              </MenuItem>
                            ))}
                          </Select>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            Method
                          </Typography>
                          <Select
                            value={
                              selectedServiceMethods.some((method) => methodKey(method) === requestGrpcMethodKeyDraft)
                                ? requestGrpcMethodKeyDraft
                                : ""
                            }
                            onChange={(event: SelectInputChangeEvent) => {
                              const nextMethodKey = String(event.target.value);
                              const nextMethod = selectedServiceMethods.find(
                                (method) => methodKey(method) === nextMethodKey,
                              );
                              selectGrpcMethodDraft(nextMethod, nextMethodKey);
                            }}
                            fullWidth
                            size="small"
                          >
                            {selectedServiceMethods.map((method) => (
                              <MenuItem key={methodKey(method)} value={methodKey(method)}>
                                {method.responseStream || method.requestStream ? "STREAM" : "RPC"} · {method.methodName}
                              </MenuItem>
                            ))}
                          </Select>
                        </Box>
                      </Stack>

                      {selectedRequestMethods.length === 0 && (
                        <Typography variant="body2" color="warning.main">
                          This schema revision does not expose any RPC method.
                        </Typography>
                      )}
                    </>
                  )}
                </Stack>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setRequestNameDialogOpen(false);
              setRequestLocationEditable(false);
            }}
          >
            Cancel
          </Button>
          {requestKindDraft && (
            <Button
              variant="contained"
              disabled={
                !requestNameDraft.trim() ||
                (requestKindDraft === "grpc" &&
                  (!selectedRequestSchema || !selectedRequestSchemaVersion || !requestGrpcMethodKeyDraft))
              }
              onClick={confirmAddCollectionRequest}
            >
              Create Request
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(protoImportReview)} onClose={() => setProtoImportReview(null)} fullWidth maxWidth="md">
        <DialogTitle>
          {protoImportReview?.assessment.kind === "exact"
            ? "Revision already exists"
            : protoImportReview?.assessment.kind === "equivalent"
              ? "Equivalent schema found"
              : "Possible revision found"}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {protoImportReview && (
            <Stack spacing={1.1} sx={{ mt: 0.5 }}>
              <Paper variant="outlined" sx={{ p: 1.1 }}>
                <Typography variant="body2" fontWeight={600}>
                  {protoImportReview.assessment.library.name} · {protoImportReview.assessment.version.version}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {Math.round(protoImportReview.assessment.similarity * 100)}% structural similarity ·{" "}
                  {protoImportReview.assessment.reason}
                </Typography>
              </Paper>
              <TextField
                size="small"
                label="New revision label"
                value={protoImportReview.versionLabel}
                onChange={(event: TextInputChangeEvent) =>
                  setProtoImportReview((current) =>
                    current ? { ...current, versionLabel: event.target.value } : current,
                  )
                }
                helperText={
                  protoImportReview.assessment.kind === "exact"
                    ? "Use a new label to keep an identical snapshot."
                    : undefined
                }
              />

              {protoImportReview.plan && (
                <>
                  <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
                    <Chip
                      size="small"
                      color="error"
                      label={`${protoImportReview.plan.diff.summary.breaking} breaking`}
                    />
                    <Chip size="small" color="warning" label={`${protoImportReview.plan.diff.summary.review} review`} />
                    <Chip
                      size="small"
                      color="success"
                      label={`${protoImportReview.plan.diff.summary.compatible} compatible`}
                    />
                    <Chip
                      size="small"
                      label={`${protoImportReview.plan.impacts.length} request impact${protoImportReview.plan.impacts.length === 1 ? "" : "s"}`}
                    />
                  </Stack>
                  <Paper variant="outlined" sx={{ p: 1, maxHeight: 220, overflow: "auto" }}>
                    <Stack spacing={0.55}>
                      {protoImportReview.plan.fileChanges
                        .filter((change) => change.action !== "unchanged")
                        .map((change) => (
                          <Stack
                            key={`${change.action}:${change.previousName ?? ""}:${change.name}`}
                            direction="row"
                            spacing={0.75}
                            alignItems="center"
                          >
                            <Chip size="small" label={change.action} />
                            <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
                              {change.action === "renamed" && change.previousName
                                ? `${change.previousName} → ${change.name}`
                                : change.name}
                            </Typography>
                          </Stack>
                        ))}
                      {protoImportReview.plan.diff.changes.map((change) => (
                        <Stack key={change.id} direction="row" spacing={0.75} alignItems="flex-start">
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
                          />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="caption"
                              fontWeight={600}
                              sx={{ display: "block", overflowWrap: "anywhere" }}
                            >
                              {change.entity}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {change.detail}
                            </Typography>
                          </Box>
                        </Stack>
                      ))}
                      {protoImportReview.plan.diff.changes.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                          No RPC, message, field, or enum changes were found. Only the source file layout differs.
                        </Typography>
                      )}
                    </Stack>
                  </Paper>
                  {protoImportReview.plan.impacts.length > 0 && (
                    <Button
                      size="small"
                      variant={updateCompatibleRequests ? "contained" : "outlined"}
                      onClick={() => setUpdateCompatibleRequests((current) => !current)}
                    >
                      {updateCompatibleRequests ? "Update compatible requests" : "Keep requests pinned"}
                    </Button>
                  )}
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProtoImportReview(null)}>Cancel</Button>
          {protoImportReview?.assessment.kind !== "exact" && (
            <Button variant="outlined" onClick={createSeparateProtoImport}>
              Create separate schema
            </Button>
          )}
          <Button
            variant={protoImportReview?.assessment.kind === "revision-candidate" ? "outlined" : "contained"}
            onClick={selectExistingProtoImport}
          >
            Use existing
          </Button>
          {protoImportReview?.plan && (
            <Button
              variant={protoImportReview.assessment.kind === "revision-candidate" ? "contained" : "outlined"}
              onClick={createProtoImportRevision}
            >
              Create revision
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={envDialogOpen} onClose={() => setEnvDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{envDialogMode === "edit" ? "Edit environment" : "New environment"}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <TextField
              autoFocus
              size="small"
              label="Environment name"
              value={envDraftName}
              onChange={(event: TextInputChangeEvent) => setEnvDraftName(event.target.value)}
              placeholder="Develop Env"
            />
            <TextField
              size="small"
              label="REST"
              value={envDraftRestUrl}
              onChange={(event: TextInputChangeEvent) => setEnvDraftRestUrl(event.target.value)}
              placeholder="http://localhost:3000"
            />
            <TextField
              size="small"
              label="Native gRPC"
              value={envDraftNativeTarget}
              onChange={(event: TextInputChangeEvent) => setEnvDraftNativeTarget(event.target.value)}
              placeholder="localhost:50051"
            />
            <TextField
              size="small"
              label="gRPC-Web"
              value={envDraftGrpcWebUrl}
              onChange={(event: TextInputChangeEvent) => setEnvDraftGrpcWebUrl(event.target.value)}
              placeholder="http://localhost:8080"
            />
            <TextField
              size="small"
              label="WebSocket"
              value={envDraftWebSocketUrl}
              onChange={(event: TextInputChangeEvent) => setEnvDraftWebSocketUrl(event.target.value)}
              placeholder="ws://localhost:8080"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          {envDialogMode === "edit" && (
            <Button color="error" onClick={removeEditingEnvironment}>
              Remove
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setEnvDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmSaveCurrentEnvironment}>
            {envDialogMode === "edit" ? "Update" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(docsPreview)} onClose={() => setDocsPreview(null)} fullWidth maxWidth="lg">
        <DialogTitle>{docsPreview?.title ?? "Generated docs"}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {docsPreview && <FeatureMarkdownPreview markdown={docsPreview.markdown} />}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              docsPreview &&
              downloadTextFile(`layang-docs-${timestampForFile()}.md`, docsPreview.markdown, "text/markdown")
            }
          >
            Export markdown
          </Button>
          <Button variant="contained" onClick={() => setDocsPreview(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={loggerSettingsOpen} onClose={() => setLoggerSettingsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Logger settings</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.4} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Runtime changes apply immediately and are saved for the next app start. Environment variables can still
              override these values when the app starts.
            </Typography>
            <Select
              size="small"
              label="Log level"
              value={loggerDraft.level}
              onChange={(event: SelectInputChangeEvent) =>
                setLoggerDraft((current: LayangLoggerSettings) => ({
                  ...current,
                  level: event.target.value as LayangLogLevel,
                }))
              }
            >
              {loggerLevelOptions.map((level: string) => (
                <MenuItem key={level} value={level}>
                  {level}
                </MenuItem>
              ))}
            </Select>
            <Select
              size="small"
              label="Console logging"
              value={loggerDraft.mirrorToConsole ? "1" : "0"}
              onChange={(event: SelectInputChangeEvent) =>
                setLoggerDraft((current: LayangLoggerSettings) => ({
                  ...current,
                  mirrorToConsole: event.target.value === "1",
                }))
              }
            >
              <MenuItem value="0">Off</MenuItem>
              <MenuItem value="1">On</MenuItem>
            </Select>
            <TextField
              size="small"
              label="Max file size (MB)"
              type="number"
              value={Math.max(1, Math.round(loggerDraft.maxBytes / 1024 / 1024))}
              onChange={(event: TextInputChangeEvent) =>
                setLoggerDraft((current: LayangLoggerSettings) => ({
                  ...current,
                  maxBytes: Math.max(1, Number.parseInt(event.target.value || "1", 10)) * 1024 * 1024,
                }))
              }
            />
            <TextField
              size="small"
              label="Max logs folder size (MB)"
              type="number"
              value={Math.max(1, Math.round(loggerDraft.maxTotalBytes / 1024 / 1024))}
              onChange={(event: TextInputChangeEvent) =>
                setLoggerDraft((current: LayangLoggerSettings) => ({
                  ...current,
                  maxTotalBytes: Math.max(1, Number.parseInt(event.target.value || "1", 10)) * 1024 * 1024,
                }))
              }
            />
            <TextField
              size="small"
              label="Retention days"
              type="number"
              value={loggerDraft.retentionDays}
              onChange={(event: TextInputChangeEvent) =>
                setLoggerDraft((current: LayangLoggerSettings) => ({
                  ...current,
                  retentionDays: Math.max(1, Number.parseInt(event.target.value || "1", 10)),
                }))
              }
            />
            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Log folder
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                {loggerInfo?.logDir || "Logger is not available in this browser session."}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {loggerInfo
                  ? `${loggerInfo.fileCount} file(s), ${Math.round(loggerInfo.totalBytes / 1024)} KB total`
                  : ""}
              </Typography>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void openLogFolder()}>Open folder</Button>
          <Button color="error" onClick={() => void clearLogFiles()}>
            Clear logs
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setLoggerSettingsOpen(false)}>Close</Button>
          <Button variant="contained" onClick={() => void saveLoggerSettings()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={certificateSettingsOpen} onClose={() => setCertificateSettingsOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Certificate settings</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.4} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              These settings are stored in desktop user data, not in the workspace. Use imported certificates for
              internal HTTPS, self-signed APISIX, REST, gRPC-Web, or native gRPC lab targets.
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <Stack spacing={0.7}>
                <Typography variant="body2" fontWeight={600}>
                  Bypass HTTPS certificate validation
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Switch
                    checked={certificateDraft.bypassTlsErrors}
                    onChange={(event: { target: { checked: boolean } }) =>
                      setCertificateDraft((current: LayangCertificateSettings) => ({
                        ...current,
                        bypassTlsErrors: event.target.checked,
                      }))
                    }
                    aria-label="Bypass HTTPS certificate errors in this desktop app"
                    title={certificateDraft.bypassTlsErrors ? "Bypass on" : "Bypass off"}
                  />
                  <Typography variant="body2">Bypass HTTPS certificate errors in this desktop app</Typography>
                </Stack>
                <Typography variant="caption" color="error">
                  Use only for local development or trusted lab networks. This allows Electron to accept HTTPS
                  certificate errors in the renderer network stack.
                </Typography>
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      Imported certificates
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {certificateDraft.caCertificates.length} certificate
                      {certificateDraft.caCertificates.length === 1 ? "" : "s"} trusted by Layang.
                    </Typography>
                  </Box>
                  <Button size="small" variant="outlined" onClick={() => void importCertificateSettingsFile()}>
                    Import certificates
                  </Button>
                </Stack>
                {certificateDraft.caCertificates.length === 0 ? (
                  <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 1.5, bgcolor: "action.hover" }}>
                    <Typography variant="body2" color="text.secondary">
                      No certificates imported. Import one or more .crt, .cer, or .pem files to trust internal HTTPS and
                      grpcs:// targets without using bypass mode.
                    </Typography>
                  </Paper>
                ) : (
                  <Stack spacing={0.75}>
                    {certificateDraft.caCertificates.map(
                      (certificate: LayangCertificateSettings["caCertificates"][number]) => (
                        <Paper key={certificate.id} variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
                          <Stack spacing={0.6}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                              <Typography variant="body2" fontWeight={600} noWrap title={certificate.name}>
                                {certificate.name}
                              </Typography>
                              <Button
                                size="small"
                                color="error"
                                onClick={() => void removeCertificateSettingsItem(certificate.id)}
                              >
                                Remove
                              </Button>
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                              SHA-256: {certificate.fingerprint || "Unknown fingerprint"}
                            </Typography>
                            {certificate.sourcePath ? (
                              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                                Source: {certificate.sourcePath}
                              </Typography>
                            ) : null}
                          </Stack>
                        </Paper>
                      ),
                    )}
                  </Stack>
                )}
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Settings file
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                {certificateInfo?.settingsFilePath || "Certificate settings are only available in the desktop app."}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                {certificateInfo?.fingerprint
                  ? `Combined SHA-256 fingerprint: ${certificateInfo.fingerprint}`
                  : "No certificate configured."}
              </Typography>
            </Paper>
            <Typography variant="caption" color="text.secondary">
              Native gRPC uses imported certificates as root certificates for grpcs:// or https:// targets. REST and
              gRPC-Web can use either imported matching certificates or the bypass checkbox above.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="error" onClick={() => void clearCertificateSettingsPem()}>
            Clear all
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setCertificateSettingsOpen(false)}>Close</Button>
          <Button variant="contained" onClick={() => void saveCertificateSettings()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        key={toast.id}
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((current: ToastState) => ({ ...current, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((current: ToastState) => ({ ...current, open: false }))}
          sx={{ maxWidth: 560 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}
