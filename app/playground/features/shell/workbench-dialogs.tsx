"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Language, Stream, Terminal } from "@/components/shadcn/icons";
import { Checkbox } from "@/components/shadcn/compat";
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
import { NEW_SCHEMA_COLLECTION_TARGET } from "../collection/quick-request-creator-domain";

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
    requestGrpcMethodKeysDraft,
    requestGrpcSkipExistingDraft,
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
    setRequestGrpcMethodKeysDraft,
    setRequestGrpcSkipExistingDraft,
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
  const [recentSchemaIds, setRecentSchemaIds] = useState<string[]>([]);
  const [recentServices, setRecentServices] = useState<string[]>([]);
  const globalProtoSchemas = protoLibraries as ProtoLibrary[];
  const selectedRequestSchema =
    globalProtoSchemas.find((library) => library.id === requestGrpcLibraryIdDraft) ?? globalProtoSchemas[0];
  const requestTargetCollection = collections.find(
    (collection: { id: string }) => collection.id === requestTargetCollectionId,
  );
  const newSchemaCollectionName = selectedRequestSchema?.name?.trim() || "gRPC Schema";
  const requestTargetLocation =
    requestTargetCollectionId === NEW_SCHEMA_COLLECTION_TARGET
      ? `New collection · ${newSchemaCollectionName}`
      : requestTargetCollection
        ? [
            requestTargetCollection.name,
            ...getCollectionNodeBreadcrumb(requestTargetCollection, requestTargetFolderId),
          ].join(" / ")
        : "Collection";
  const requestLocationOptions = [
    ...((requestKindDraft === "grpc" || requestTargetCollectionId === NEW_SCHEMA_COLLECTION_TARGET) && selectedRequestSchema
      ? [
          {
            value: `${NEW_SCHEMA_COLLECTION_TARGET}|`,
            label: `New collection · ${newSchemaCollectionName}`,
            collectionId: NEW_SCHEMA_COLLECTION_TARGET,
            folderId: null,
          },
        ]
      : []),
    ...collections.flatMap((collection: any) => [
      { value: `${collection.id}|`, label: collection.name, collectionId: collection.id, folderId: null },
      ...(collection.folders ?? []).map((folder: any) => ({
        value: `${collection.id}|${folder.id}`,
        label: [collection.name, ...getCollectionNodeBreadcrumb(collection, folder.id)].join(" / "),
        collectionId: collection.id,
        folderId: folder.id,
      })),
    ]),
  ];
  const orderedGlobalProtoSchemas = [...globalProtoSchemas].sort((left, right) => {
    const leftIndex = recentSchemaIds.indexOf(left.id);
    const rightIndex = recentSchemaIds.indexOf(right.id);
    if (leftIndex < 0 && rightIndex < 0) return left.name.localeCompare(right.name);
    if (leftIndex < 0) return 1;
    if (rightIndex < 0) return -1;
    return leftIndex - rightIndex;
  });
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
  const selectedRequestServicesKey = selectedRequestServices.join("\u0000");
  const orderedRequestServices = [...selectedRequestServices].sort((left, right) => {
    const leftIndex = recentServices.indexOf(left);
    const rightIndex = recentServices.indexOf(right);
    if (leftIndex < 0 && rightIndex < 0) return left.localeCompare(right);
    if (leftIndex < 0) return 1;
    if (rightIndex < 0) return -1;
    return leftIndex - rightIndex;
  });
  const selectedRequestMethod = selectedRequestMethods.find(
    (method) => methodKey(method) === requestGrpcMethodKeyDraft,
  );
  const selectedRequestServiceName = selectedRequestMethod?.serviceName ?? selectedRequestServices[0] ?? "";
  const selectedServiceMethods = selectedRequestMethods.filter(
    (method) => method.serviceName === selectedRequestServiceName,
  );
  const requestGrpcMethodKeys = new Set<string>(requestGrpcMethodKeysDraft ?? []);
  const requestGrpcMethods = selectedRequestMethods.filter((method) =>
    requestGrpcMethodKeys.has(methodKey(method)),
  );
  const isGrpcRequest = requestKindDraft === "grpc";
  const [grpcMethodFilter, setGrpcMethodFilter] = useState("");
  const [grpcServiceFilter, setGrpcServiceFilter] = useState("*");
  const [grpcAdvancedOpen, setGrpcAdvancedOpen] = useState(false);
  const visibleRequestMethods = selectedRequestMethods.filter((method) => {
    const serviceMatches = grpcServiceFilter === "*" || method.serviceName === grpcServiceFilter;
    const query = grpcMethodFilter.trim().toLowerCase();
    const queryMatches =
      !query ||
      method.methodName.toLowerCase().includes(query) ||
      method.serviceName.toLowerCase().includes(query) ||
      `${method.serviceName}/${method.methodName}`.toLowerCase().includes(query);
    return serviceMatches && queryMatches;
  });
  const existingRequestMethodNames = new Set(
    (requestTargetCollection?.requests ?? [])
      .filter((request: any) => request.kind === "grpc" && request.grpc?.libraryId === selectedRequestSchema?.id)
      .map((request: any) => request.grpc?.methodFullName)
      .filter(Boolean),
  );
  const selectedExistingCount = requestGrpcMethods.filter((method) =>
    existingRequestMethodNames.has(`${method.serviceName}/${method.methodName}`),
  ).length;
  const selectedNewCount = requestGrpcMethods.length - selectedExistingCount;

  const existingRequestNames = requestTargetCollection?.requests.map((request: { name: string }) => request.name) ?? [];

  useEffect(() => {
    try {
      const schemaIds = JSON.parse(window.localStorage.getItem("layang:recent-request-schema-ids") ?? "[]");
      const services = JSON.parse(window.localStorage.getItem("layang:recent-request-services") ?? "[]");
      setRecentSchemaIds(Array.isArray(schemaIds) ? schemaIds.filter((value) => typeof value === "string").slice(0, 5) : []);
      setRecentServices(Array.isArray(services) ? services.filter((value) => typeof value === "string").slice(0, 8) : []);
    } catch {
      setRecentSchemaIds([]);
      setRecentServices([]);
    }
  }, []);

  useEffect(() => {
    if (!requestNameDialogOpen || requestKindDraft !== "grpc") return;
    setGrpcMethodFilter("");
    setGrpcAdvancedOpen(false);
    const rememberedService = window.localStorage.getItem("layang:last-request-service-name") ?? "";
    const preferredService = selectedRequestServices.includes(rememberedService)
      ? rememberedService
      : selectedRequestMethod?.serviceName ?? selectedRequestServices[0] ?? "*";
    setGrpcServiceFilter(isGrpcRequest && requestGrpcMethodKeys.size > 1 ? "*" : preferredService);
  }, [requestNameDialogOpen]);

  useEffect(() => {
    if (!requestNameDialogOpen || requestKindDraft !== "grpc" || !selectedRequestSchema) return;
    window.localStorage.setItem("layang:last-request-schema-id", selectedRequestSchema.id);
    setRecentSchemaIds((current: string[]) => {
      if (current[0] === selectedRequestSchema.id) return current;
      const next = [selectedRequestSchema.id, ...current.filter((id: string) => id !== selectedRequestSchema.id)].slice(0, 5);
      window.localStorage.setItem("layang:recent-request-schema-ids", JSON.stringify(next));
      return next;
    });
    if (grpcServiceFilter !== "*" && selectedRequestServices.includes(grpcServiceFilter)) {
      window.localStorage.setItem("layang:last-request-service-name", grpcServiceFilter);
      setRecentServices((current: string[]) => {
        if (current[0] === grpcServiceFilter) return current;
        const next = [grpcServiceFilter, ...current.filter((name: string) => name !== grpcServiceFilter)].slice(0, 8);
        window.localStorage.setItem("layang:recent-request-services", JSON.stringify(next));
        return next;
      });
    }
  }, [
    grpcServiceFilter,
    requestKindDraft,
    requestNameDialogOpen,
    selectedRequestSchema?.id,
    selectedRequestServicesKey,
  ]);

  const selectGrpcMethodDraft = (nextMethod: { methodName: string } | undefined, nextMethodKey: string) => {
    const previousMethodName = selectedRequestMethod?.methodName;
    setRequestGrpcMethodKeyDraft(nextMethodKey);
    setRequestGrpcMethodKeysDraft(nextMethodKey ? [nextMethodKey] : []);
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
    setRequestGrpcMethodKeysDraft([]);
    setRequestGrpcSkipExistingDraft(true);
    if (kind !== "grpc") {
      setRequestGrpcLibraryIdDraft("");
      setRequestGrpcVersionIdDraft("");
      setRequestGrpcMethodKeyDraft("");
      if (!collections.some((collection: any) => collection.id === requestTargetCollectionId)) {
        setRequestNameDialogOpen(false);
        setCollectionNameDraft("Untitled Collection");
        setCollectionDialogOpen(true);
      }
      return;
    }
    const rememberedSchemaId = window.localStorage.getItem("layang:last-request-schema-id") ?? "";
    const schema = globalProtoSchemas.find((item) => item.id === rememberedSchemaId) ?? globalProtoSchemas[0];
    const version = schema?.versions.find((item) => item.id === schema.defaultVersionId) ?? schema?.versions[0];
    const runtime = schema && version ? protoRuntimeRegistry.resolveVersion(schema.id, version.id) : null;
    const rememberedService = window.localStorage.getItem("layang:last-request-service-name") ?? "";
    const firstMethod =
      runtime?.loaded.methods.find((method: RpcMethodInfo) => method.serviceName === rememberedService) ??
      runtime?.loaded.methods[0];
    setRequestGrpcLibraryIdDraft(schema?.id ?? "");
    setRequestGrpcVersionIdDraft(version?.id ?? "");
    if (!collections.some((collection: any) => collection.id === requestTargetCollectionId)) {
      setRequestTargetCollectionId(NEW_SCHEMA_COLLECTION_TARGET);
      setRequestTargetFolderId(null);
      setRequestLocationEditable(true);
    }
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
        <DialogActions sx={{ px: 2, py: 1.25 }}>
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

      <Dialog
        open={requestNameDialogOpen}
        onClose={() => {
          setRequestNameDialogOpen(false);
          setRequestLocationEditable(false);
          setRequestGrpcMethodKeysDraft([]);
          setRequestGrpcSkipExistingDraft(true);
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography component="span" sx={{ fontSize: 14, fontWeight: 600 }}>
                Quick Create
              </Typography>
              {requestKindDraft ? (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.8 }}>
                  {requestKindDraft === "grpc"
                    ? "gRPC request"
                    : requestKindDraft === "rest"
                        ? "HTTP request"
                        : "WebSocket request"}
                </Typography>
              ) : null}
            </Box>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1.25, px: 2, overflowX: "hidden" }}>
          <Stack spacing={1.25} sx={{ mt: 0.25, minWidth: 0, overflowX: "hidden" }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">
                  Protocol
                </Typography>
                {requestKindDraft === "grpc" ? (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      setGrpcAdvancedOpen(true);
                      window.setTimeout(() => collectionSchemaInputRef.current?.click(), 0);
                    }}
                    sx={{ minHeight: 26, px: 0.7 }}
                  >
                    Import Proto
                  </Button>
                ) : null}
              </Stack>
              <Box
                role="group"
                aria-label="Quick Create protocol"
                className="mt-1 grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-3"
              >
                <Button
                  variant={requestKindDraft === "rest" ? "contained" : "outlined"}
                  onClick={() => selectRequestKind("rest")}
                  startIcon={<Language sx={{ fontSize: 16 }} />}
                  sx={{ minWidth: 0, minHeight: 36, height: 36, justifyContent: "flex-start", px: 1, lineHeight: "20px" }}
                >
                  HTTP
                </Button>
                <Button
                  variant={requestKindDraft === "grpc" ? "contained" : "outlined"}
                  onClick={() => selectRequestKind("grpc")}
                  startIcon={<Terminal sx={{ fontSize: 16 }} />}
                  sx={{ minWidth: 0, minHeight: 36, height: 36, justifyContent: "flex-start", px: 1, lineHeight: "20px" }}
                >
                  gRPC
                </Button>
                <Button
                  variant={requestKindDraft === "websocket" ? "contained" : "outlined"}
                  onClick={() => selectRequestKind("websocket")}
                  startIcon={<Stream sx={{ fontSize: 16 }} />}
                  sx={{ minWidth: 0, minHeight: 36, height: 36, justifyContent: "flex-start", px: 1, lineHeight: "20px" }}
                >
                  WebSocket
                </Button>
              </Box>
              {!requestKindDraft ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.55 }}>
                  Choose a protocol. Only fields needed for that request type will be shown.
                </Typography>
              ) : null}
            </Box>

            {requestKindDraft ? (
              <Box
                className={isGrpcRequest ? "grid min-w-0 grid-cols-1 gap-2" : "grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2"}
              >
                {requestLocationEditable ? (
                  <Box className="quick-create-field" sx={{ minWidth: 0, overflow: "visible" }}>
                    <Typography className="quick-create-field-label" variant="caption" color="text.secondary">
                      Destination
                    </Typography>
                    <Select
                      value={`${requestTargetCollectionId}|${requestTargetFolderId ?? ""}`}
                      onChange={(event: SelectInputChangeEvent) => {
                        const option = requestLocationOptions.find((item: any) => item.value === String(event.target.value));
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
                    {requestKindDraft === "grpc" && isGrpcRequest ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.4 }}>
                        Selected methods are grouped into service folders automatically.
                      </Typography>
                    ) : null}
                  </Box>
                ) : (
                  <Box className="quick-create-field" sx={{ minWidth: 0, overflow: "visible" }}>
                    <Typography className="quick-create-field-label" variant="caption" color="text.secondary">
                      Destination
                    </Typography>
                    <Paper
                      variant="outlined"
                      sx={{ minWidth: 0, minHeight: 38, height: 38, px: 1, display: "flex", alignItems: "center", overflow: "hidden" }}
                    >
                      <Typography variant="body2" noWrap title={requestTargetLocation} sx={{ minWidth: 0, fontSize: 12.5 }}>
                        {requestTargetLocation}
                      </Typography>
                    </Paper>
                  </Box>
                )}

                {!isGrpcRequest ? (
                  <Box className="quick-create-field" sx={{ minWidth: 0, overflow: "visible" }}>
                    <Typography
                      component="label"
                      variant="caption"
                      htmlFor="quick-create-request-name"
                      color="text.secondary"
                      className="quick-create-field-label"
                    >
                      Request name
                    </Typography>
                    <TextField
                      id="quick-create-request-name"
                      autoFocus
                      size="small"
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
                      fullWidth
                      sx={{ minWidth: 0, overflow: "visible" }}
                    />
                  </Box>
                ) : null}
              </Box>
            ) : null}

            {requestKindDraft === "grpc" && (
              <Paper variant="outlined" sx={{ p: 1, minWidth: 0, overflow: "hidden" }}>
                <Stack spacing={1} sx={{ minWidth: 0 }}>
                  <Box className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary">
                        Proto
                      </Typography>
                      <Select
                        value={selectedRequestSchema?.id ?? ""}
                        onChange={(event: SelectInputChangeEvent) => {
                          const libraryId = String(event.target.value);
                          const schema = globalProtoSchemas.find((item) => item.id === libraryId);
                          const version =
                            schema?.versions.find((item) => item.id === schema.defaultVersionId) ?? schema?.versions[0];
                          const runtime = schema && version ? protoRuntimeRegistry.resolveVersion(schema.id, version.id) : null;
                          const rememberedService = window.localStorage.getItem("layang:last-request-service-name") ?? "";
                          const firstMethod =
                            runtime?.loaded.methods.find(
                              (method: RpcMethodInfo) => method.serviceName === rememberedService,
                            ) ??
                            runtime?.loaded.methods[0];
                          setRequestGrpcLibraryIdDraft(libraryId);
                          setRequestGrpcVersionIdDraft(version?.id ?? "");
                          if (requestTargetCollectionId === NEW_SCHEMA_COLLECTION_TARGET) setRequestTargetFolderId(null);
                          setGrpcServiceFilter(firstMethod?.serviceName ?? "*");
                          setRequestGrpcMethodKeyDraft(firstMethod ? methodKey(firstMethod) : "");
                          selectGrpcMethodDraft(firstMethod, firstMethod ? methodKey(firstMethod) : "");
                        }}
                        fullWidth
                        size="small"
                        aria-label="Proto"
                      >
                        {orderedGlobalProtoSchemas.map((library) => (
                          <MenuItem key={library.id} value={library.id}>
                            {library.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </Box>

                    <Box sx={{ minWidth: 0 }}>
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
                          const firstMethod = runtime?.loaded.methods[0];
                          setRequestGrpcVersionIdDraft(versionId);
                          setGrpcServiceFilter(firstMethod?.serviceName ?? "*");
                          setRequestGrpcMethodKeyDraft(firstMethod ? methodKey(firstMethod) : "");
                          selectGrpcMethodDraft(firstMethod, firstMethod ? methodKey(firstMethod) : "");
                        }}
                        fullWidth
                        size="small"
                        aria-label="Proto revision"
                      >
                        {(selectedRequestSchema?.versions ?? []).map((version) => (
                          <MenuItem key={version.id} value={version.id}>
                            {version.version}
                            {version.id === selectedRequestSchema?.defaultVersionId ? " · Default" : ""}
                          </MenuItem>
                        ))}
                      </Select>
                    </Box>

                    {isGrpcRequest ? (
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary">
                          Service
                        </Typography>
                        <Select
                          value={grpcServiceFilter}
                          onChange={(event: SelectInputChangeEvent) => setGrpcServiceFilter(String(event.target.value))}
                          fullWidth
                          size="small"
                          aria-label="Filter RPC service"
                        >
                          <MenuItem value="*">All services</MenuItem>
                          {orderedRequestServices.map((serviceName) => (
                            <MenuItem key={serviceName} value={serviceName}>
                              {serviceName}
                            </MenuItem>
                          ))}
                        </Select>
                      </Box>
                    ) : null}
                  </Box>

                  <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" color="text.secondary">
                      Requests stay pinned to the selected proto revision.
                    </Typography>
                    <Button size="small" variant="text" onClick={() => setGrpcAdvancedOpen((value: boolean) => !value)}>
                      {grpcAdvancedOpen ? "Hide options" : "More options"}
                    </Button>
                  </Stack>

                  {grpcAdvancedOpen ? (
                    <Paper variant="outlined" sx={{ p: 0.9, bgcolor: "action.hover", minWidth: 0 }}>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
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
                          Upload proto files
                        </Button>
                        <Button size="small" variant="text" onClick={() => collectionSchemaFolderInputRef.current?.click()}>
                          Upload proto folder
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => {
                            setRequestNameDialogOpen(false);
                            setSideSection("proto-schemas");
                          }}
                        >
                          Manage protos
                        </Button>
                      </Stack>
                    </Paper>
                  ) : null}

                  {globalProtoSchemas.length === 0 ? (
                    <Paper variant="outlined" sx={{ p: 1, bgcolor: "action.hover" }}>
                      <Typography variant="body2" fontWeight={600}>
                        No proto file available yet
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Use Import Proto or More options to upload a proto file or folder.
                      </Typography>
                    </Paper>
                  ) : isGrpcRequest ? (
                    <>
                      <TextField
                        size="small"
                        value={grpcMethodFilter}
                        onChange={(event: TextInputChangeEvent) => setGrpcMethodFilter(event.target.value)}
                        placeholder="Search methods or services"
                        inputProps={{ "aria-label": "Search RPC methods" }}
                      />

                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() =>
                            setRequestGrpcMethodKeysDraft(
                              Array.from(new Set([...requestGrpcMethodKeysDraft, ...visibleRequestMethods.map(methodKey)])),
                            )
                          }
                          disabled={visibleRequestMethods.length === 0}
                        >
                          Select visible ({visibleRequestMethods.length})
                        </Button>
                        {grpcServiceFilter !== "*" && (
                          <Button
                            size="small"
                            variant="text"
                            onClick={() =>
                              setRequestGrpcMethodKeysDraft(
                                selectedRequestMethods
                                  .filter((method) => method.serviceName === grpcServiceFilter)
                                  .map(methodKey),
                              )
                            }
                          >
                            Select service
                          </Button>
                        )}
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setRequestGrpcMethodKeysDraft(selectedRequestMethods.map(methodKey))}
                          disabled={selectedRequestMethods.length === 0}
                        >
                          Select all {selectedRequestMethods.length}
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setRequestGrpcMethodKeysDraft([])}
                          disabled={requestGrpcMethodKeys.size === 0}
                        >
                          Clear
                        </Button>
                      </Stack>

                      <Paper variant="outlined" sx={{ maxHeight: 300, overflowY: "auto", overflowX: "hidden", minWidth: 0 }}>
                        <Stack spacing={0}>
                          {visibleRequestMethods.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ p: 1.25 }}>
                              No RPC method matches this filter.
                            </Typography>
                          ) : (
                            visibleRequestMethods.map((method) => {
                              const key = methodKey(method);
                              const checked = requestGrpcMethodKeys.has(key);
                              const alreadyExists = existingRequestMethodNames.has(`${method.serviceName}/${method.methodName}`);
                              return (
                                <Box
                                  key={key}
                                  component="label"
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                    px: 1,
                                    py: 0.7,
                                    cursor: "pointer",
                                    borderBottom: "1px solid",
                                    borderColor: "divider",
                                    bgcolor: checked ? "action.selected" : "transparent",
                                    "&:last-child": { borderBottom: 0 },
                                    "&:hover": { bgcolor: checked ? "action.selected" : "action.hover" },
                                  }}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onChange={(_event: unknown, nextChecked: boolean) => {
                                      setRequestGrpcMethodKeysDraft((current: string[]) => {
                                        const next = new Set(current);
                                        if (nextChecked) next.add(key);
                                        else next.delete(key);
                                        return [...next];
                                      });
                                    }}
                                    inputProps={{ "aria-label": `Select ${method.serviceName}/${method.methodName}` }}
                                  />
                                  <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography variant="body2" fontWeight={500} noWrap title={method.methodName}>
                                      {method.methodName}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" noWrap>
                                      {method.serviceName} · {method.requestStream || method.responseStream ? "Stream" : "Unary"}
                                      {alreadyExists ? " · Already exists" : ""}
                                    </Typography>
                                  </Box>
                                </Box>
                              );
                            })
                          )}
                        </Stack>
                      </Paper>

                      <Paper variant="outlined" sx={{ p: 1, bgcolor: "action.hover" }}>
                        <Stack spacing={0.7}>
                          <Typography variant="body2" fontWeight={600}>
                            {requestGrpcMethods.length} selected · {selectedNewCount} new
                            {selectedExistingCount ? ` · ${selectedExistingCount} already exist` : ""}
                          </Typography>
                          <Stack direction="row" spacing={0.8} alignItems="center">
                            <Checkbox
                              checked={requestGrpcSkipExistingDraft}
                              onChange={(_event: unknown, checked: boolean) => setRequestGrpcSkipExistingDraft(checked)}
                              inputProps={{ "aria-label": "Skip existing requests" }}
                            />
                            <Box>
                              <Typography variant="body2">Skip existing requests</Typography>
                              <Typography variant="caption" color="text.secondary">
                                Match by schema and RPC path so repeated bulk creates stay clean.
                              </Typography>
                            </Box>
                          </Stack>
                        </Stack>
                      </Paper>
                    </>
                  ) : (
                    <Box className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" color="text.secondary">
                          Service
                        </Typography>
                        <Select
                          value={selectedRequestServiceName}
                          onChange={(event: SelectInputChangeEvent) => {
                            const serviceName = String(event.target.value);
                            window.localStorage.setItem("layang:last-request-service-name", serviceName);
                            const firstMethod = selectedRequestMethods.find((method) => method.serviceName === serviceName);
                            selectGrpcMethodDraft(firstMethod, firstMethod ? methodKey(firstMethod) : "");
                          }}
                          fullWidth
                          size="small"
                        >
                          {orderedRequestServices.map((serviceName) => (
                            <MenuItem key={serviceName} value={serviceName}>
                              {serviceName}
                            </MenuItem>
                          ))}
                        </Select>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
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
                            const nextMethod = selectedServiceMethods.find((method) => methodKey(method) === nextMethodKey);
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
                    </Box>
                  )}
                </Stack>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.25 }}>
          <Button
            onClick={() => {
              setRequestNameDialogOpen(false);
              setRequestLocationEditable(false);
              setRequestGrpcMethodKeysDraft([]);
                  setRequestGrpcSkipExistingDraft(true);
            }}
          >
            Cancel
          </Button>
          {requestKindDraft && (
            <Button
              variant="contained"
              disabled={
                isGrpcRequest
                  ? !selectedRequestSchema ||
                    !selectedRequestSchemaVersion ||
                    requestGrpcMethods.length !== requestGrpcMethodKeys.size ||
                    requestGrpcMethodKeys.size === 0 ||
                    (requestGrpcSkipExistingDraft && selectedNewCount === 0)
                  : !requestNameDraft.trim()
              }
              onClick={confirmAddCollectionRequest}
            >
              {isGrpcRequest
                ? `Create ${requestGrpcSkipExistingDraft ? selectedNewCount : requestGrpcMethodKeys.size} ${
                    (requestGrpcSkipExistingDraft ? selectedNewCount : requestGrpcMethodKeys.size) === 1
                      ? "Request"
                      : "Requests"
                  }`
                : "Create Request"}
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
        <DialogContent sx={{ pt: 1.25, px: 2, overflowX: "hidden" }}>
          <Stack spacing={1.25} sx={{ mt: 0.25, minWidth: 0, overflowX: "hidden" }}>
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
        <DialogContent sx={{ pt: 1.25, px: 2, overflowX: "hidden" }}>
          <Stack spacing={1.25} sx={{ mt: 0.25, minWidth: 0, overflowX: "hidden" }}>
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
