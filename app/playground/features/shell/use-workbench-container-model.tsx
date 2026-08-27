"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { colorTokens, designSystem, paletteMode, type ColorMode } from "../../design-system";
import {
  Add,
  Api,
  KeyboardArrowUp,
  ContentCopy,
  DarkMode,
  Delete,
  DocsIcon,
  Edit,
  ExampleIcon,
  DesktopWindows,
  Download,
  History,
  Language,
  LightMode,
  MockServer,
  PanelBottom,
  PanelRight,
  PlayArrow,
  ProtoIcon,
  Search,
  Storage,
  StopCircle,
  Stream,
  UploadFile,
} from "@/components/shadcn/icons";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@/components/shadcn/compat";
import { generateExampleFromType } from "@/lib/example-generator";
import { buildGrpcWebUrl } from "@/lib/grpc-web-client";
import { loadProtoFiles } from "@/lib/proto-loader";
import type { RpcMethodInfo } from "@/lib/types";
import {
  buildUnifiedDocsPages,
  normalizeDocumentationState,
  upsertDocumentationSource,
  type DocumentationSource,
  type UnifiedDocsPage,
} from "@/lib/docs-core.mjs";
import { BenchmarkPanel as FeatureBenchmarkPanel, calculateBenchmarkStats } from "../benchmark/benchmark-panel";
import { UnifiedDocumentationPanel, UnifiedDocsSidebar } from "../documentation/documentation-panels";
import { MarkdownPreview as FeatureMarkdownPreview } from "../docs-publisher/docs-publisher-panel";
import {
  buildLatestResultByMethod,
  buildSavedDocResultByMethod,
  renderMethodPublicationMarkdown,
  renderPublicDocsMarkdown,
  renderWorkspaceProtoDocsHtml,
  renderWorkspaceProtoDocsMarkdown,
} from "../docs-publisher/docs-renderer";
import {
  defaultEnvironments,
  environmentLabel as featureEnvironmentLabel,
  environmentShortLabel as featureEnvironmentShortLabel,
  getEnvironmentTarget as featureGetEnvironmentTarget,
  getEnvironmentTransportTarget as featureGetEnvironmentTransportTarget,
  mergeEnvironments as featureMergeEnvironments,
  setEnvironmentTransportTarget as featureSetEnvironmentTransportTarget,
} from "../environments/environment-model";
import { ProtoSourceBlock as FeatureProtoSourceBlock } from "../proto-registry/proto-registry-panel";
import { CollectionSidebar as FeatureCollectionSidebar } from "../collection/collection-sidebar";
import {
  CodeTextField as FeatureCodeTextField,
  SchemaTable as FeatureSchemaTable,
} from "../request-editor/request-editor-panels";
import { ExamplesPanel } from "../examples/examples-panel";
import { ExampleSidebar, HistorySidebar } from "../sidebar/sidebar-panels";
import {
  createWebSocketMockScenarioForRequest,
  defaultWebSocketMockResponse,
  findWebSocketRequestForDocKey,
  isWebSocketUrl,
  normalizeWebSocketMockPath,
  webSocketDocKey,
  webSocketRequestPath,
} from "../websocket/websocket-model";
import {
  buildRestRequestUrl,
  createRestMockPresetScenario,
  defaultRestMockResponse,
  findRestRequestForDocKey,
  renderRestDocsMarkdown,
  restDocKey,
  restMethods,
} from "../rest/rest-model";
import { RestDocsPanel, RestMockPanel, RestPairEditor } from "../rest/rest-panels";
import {
  WebSocketBenchmarkPanel,
  WebSocketDocsPanel,
  WebSocketMockPanel,
  WebSocketMockSidebar,
  renderWebSocketDocsMarkdown,
} from "../websocket/websocket-panels";
import {
  compactGrpcResultForStorage,
  compactRequestSessionForStorage,
  getOrCreateMethodDoc,
  isDocResultSnapshot,
  isMethodDoc,
  isProtoSourceFile,
  isSavedExample,
  looksLikeProjectData,
  mergeDocResults,
  mergeExamples,
  mergeMethodDocs,
  mergeProtoFiles,
  normalizeApiCollections,
  normalizeProjectData,
  createDefaultRestMockProject,
  createDefaultWebSocketMockProject,
  normalizeRestMockBindHost,
  normalizeRestMockPort,
  normalizeWebSocketMockPort,
  runWhenIdle,
  upsertMethodDoc,
} from "../workspace/workspace-model";
import {
  AppLogoIcon,
  RailButton,
  RequestTabs,
  SidebarHeader,
  WindowControls,
  WorkbenchTabs,
} from "../shell/shell-components";
import {
  buildDefaultMockScenario,
  buildMockMappingRows,
  clearInheritedMockStreamOverridesForDefaultChange,
  currentFileEmptyEditorText,
  currentSingleScenarioEmptyEditorText,
  ensureUniqueMockScenarioId,
  formatMockScenarioBundle,
  formatSingleMockScenarioForEditor,
  generateRandomExampleFromType,
  getActiveScenarioForMethod,
  getMockMethodScenarioFile,
  mergeExternalScenarioScenariosIntoProject,
  normalizeMockBindHost,
  normalizeMockPort,
  normalizeMockStreamSettings,
  normalizeMockServerProject,
  parseAllMockScenarioFiles,
  parseExternalScenarioImportText,
  parseExternalScenarioImportValue,
  parseMockScenarioText,
  parseSingleMockScenarioText,
  parseSimpleYaml,
  resolveMockActiveScenarioIds,
  safeMockFileBaseName,
  safeMockScenarioRelativePath,
  updateMockMethodScenarioFile,
} from "../mock-server/mock-scenario-model";
import {
  HistoryTable as FeatureHistoryTable,
  JsonBlock as FeatureJsonBlock,
  LatestResponseJsonViewer as FeatureLatestResponseJsonViewer,
  MessageTable as FeatureMessageTable,
} from "../response-viewer/response-viewer";
import { ResponseToolbar, ResponseWorkbenchTabs } from "../response-viewer/response-toolbar";
import { evaluateAssertions, eventToUiEvent, writeConsoleLog } from "../request-runner/request-result-utils";
import { createRequestSession } from "../request-runner/request-session-model";
import { downloadTextFile } from "../../shared/browser-utils";
import {
  clearLoggerFiles,
  getLoggerInfo,
  openLoggerFolder,
  updateLoggerSettings,
  type LayangLoggerInfo,
  type LayangLoggerSettings,
  type LayangLogLevel,
} from "../../shared/logger";
import {
  clearCertificatePem,
  defaultCertificateSettings,
  getCertificateSettings,
  importCertificateFile,
  updateCertificateSettings,
  type LayangCertificateSettings,
  type LayangCertificateSettingsInfo,
} from "../../shared/certificate-settings";
import {
  decreaseAppZoom,
  getAppZoomInfo,
  increaseAppZoom,
  resetAppZoom,
  subscribeAppZoomChanges,
  type LayangAppZoomInfo,
} from "../../shared/app-zoom";
import { toErrorMessage } from "../../shared/error-utils";
import { formatTimestampShort, timestampForFile } from "../../shared/formatters";
import { normalizeEditableText, safeJsonParse } from "../../shared/json-utils";
import { clamp } from "../../shared/number-utils";
import { methodKey, methodTypeLabel } from "../../shared/rpc-method-utils";
import { createId, savedExampleKey, slugify } from "../../shared/entity-utils";
import {
  defaultAssertion,
  defaultMetadata,
  defaultMockPort,
  iconButtonSx,
  layoutStorageKey,
  minResponseHeight,
  panelSx,
  projectStorageKey,
  railWidth,
  sampleProto,
  workspaceFolderStorageKey,
} from "../../shared/workbench-constants";
import { useStableEventCallback } from "../../hooks/use-stable-event-callback";
import { useBenchmarkRunner } from "../../hooks/use-benchmark-runner";
import { useWorkbenchLayout, minResponseWidth } from "../layout/use-workbench-layout";
import { useWorkspaceController } from "../workspace/use-workspace-controller";
import { useWorkspaceIoActions } from "../workspace/use-workspace-io-actions";
import { useWorkspaceBundleActions } from "../workspace/use-workspace-bundle-actions";
import { useWorkspaceLayoutPersistence } from "../workspace/use-workspace-layout-persistence";
import { useGrpcMockController } from "../mock-server/use-grpc-mock-controller";
import { useGrpcMockEditorActions } from "../mock-server/use-grpc-mock-editor-actions";
import { useWorkspaceFolderAutosave } from "../mock-server/use-mock-workspace-sync";
import { useMockRuntimeSync } from "../mock-server/use-mock-runtime-sync";
import { useRequestSessionController } from "../request-editor/use-request-session-controller";
import { useRequestSessionActions } from "../request-editor/use-request-session-actions";
import {
  buildRequestSessionSourceIndex,
  cleanupRequestSessionsForDeletedSources,
} from "../request-editor/request-session-domain";
import { useResponseController } from "../response-viewer/use-response-controller";
import { useRestController } from "../rest/use-rest-controller";
import { useWebSocketController } from "../websocket/use-websocket-controller";
import { useRequestRunner } from "../../hooks/use-request-runner";
import { useCollectionController } from "../collection/use-collection-controller";
import { useEnvironmentController } from "../environment/use-environment-controller";
import { useDocsController } from "../docs/use-docs-controller";
import { useCollectionActions } from "../collection/use-collection-actions";
import { useEnvironmentActions } from "../environment/use-environment-actions";
import { useDocsActions } from "../docs/use-docs-actions";
import { useRequestRunnerActions } from "../request-runner/use-request-runner-actions";
import { useLiveSessionEvents } from "../request-runner/use-live-session-events";
import { useWorkbenchTheme } from "../shell/use-workbench-theme";
import { useWorkbenchUiActions } from "../shell/use-workbench-ui-actions";
import { useWorkbenchViewDerived } from "../shell/use-workbench-view-derived";
import {
  findCollectionRequestById,
  grpcBaseUrlFallback,
  stripGrpcMethodPathFromUrl,
  transportTargetLabel,
  transportTargetPlaceholder,
} from "../shell/workbench-url-utils";
import type {
  ApiCollection,
  ApiCollectionRequest,
  DocResultSnapshot,
  MethodDoc,
  ProjectData,
  RequestSession,
  ResponseTab,
  SavedExample,
  ServiceProtocol,
  ServicesSection,
  SettingsSection,
  SideSection,
  TransportMode,
  WebSocketMockProject,
  WebSocketMockScenario,
  RestMockScenario,
} from "../../shared/workbench-types";
import type { LoadedProto, MetadataPair, ProtoSourceFile } from "@/lib/types";
import { ProtoRuntimeRegistry } from "@/lib/proto-runtime-registry";
import type { GrpcRequestBinding, ProtoLibrary } from "../proto-library/proto-library-types";
import type {
  ProtoPurgeReferencePolicy,
  ProtoRepairCandidate,
  ProtoVersionImportPlan,
} from "../proto-library/proto-version-management";
import {
  applyProtoVersionImport,
  archiveProtoLibrary,
  archiveProtoVersion,
  purgeProtoLibrary,
  purgeProtoVersion,
  repairGrpcRequestBinding,
  restoreMissingGrpcBinding,
  restoreMissingGrpcReferencesForVersion,
  restoreProtoLibrary,
  restoreProtoVersion,
} from "../proto-library/proto-version-management";
import {
  createPinnedGrpcBinding,
  createProtoLibrary,
  findProtoVersion,
  grpcBindingIdentity,
  hydrateLegacyGrpcBinding,
  normalizeProtoLibraries,
  projectProtoFilesFromLibraries,
} from "../proto-library/proto-library-domain";

type RequestRunnerHandle = ReturnType<typeof useRequestRunner>;

const WORKSPACE_AUTOSAVE_DELAY_MS = 1400;
const MOCK_RUNTIME_SYNC_DELAY_MS = 280;
const MOCK_LOCAL_DIRTY_FALLBACK_MS = 2200;
const loggerLevelOptions: LayangLogLevel[] = ["debug", "info", "warn", "error"];
const defaultLoggerSettings: LayangLoggerSettings = {
  level: "info",
  mirrorToConsole: false,
  maxBytes: 5 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  retentionDays: 14,
};
export function useWorkbenchContainerModel() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [themeMode, setThemeMode] = useState<ColorMode>("dark");
  const [densityMode, setDensityMode] = useState<"compact" | "comfortable">("compact");
  const [hydrated, setHydrated] = useState(false);
  const [sideSection, setSideSection] = useState<SideSection>("collections");
  const [servicesSection, setServicesSection] = useState<ServicesSection>("mock-servers");
  const [serviceProtocol, setServiceProtocol] = useState<ServiceProtocol>("grpc-mock");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const compactViewport = useMediaQuery("(max-width: 1180px)");
  const layout = useWorkbenchLayout();
  const {
    sidebarOpen,
    setSidebarOpen,
    sidebarWidthPx,
    setSidebarWidthPx,
    responseHeight,
    setResponseHeight,
    responseWidth,
    setResponseWidth,
    requestResponseLayout,
    setRequestResponseLayout,
    beginSidebarResize,
    beginResponseResize,
    resizeResponseByKeyboard,
    toggleRequestResponseLayout,
  } = layout;
  const workspaceLayoutPersistence = useWorkspaceLayoutPersistence({
    requestResponseLayout,
    responseHeight,
    responseWidth,
    setRequestResponseLayout,
    setResponseHeight,
    setResponseWidth,
    setSidebarOpen,
    setSidebarWidthPx,
    sidebarOpen,
    sidebarWidthPx,
  });
  const { applyWorkspaceLayout, getLayoutSnapshot } = workspaceLayoutPersistence;
  const [transportMode, setTransportMode] = useState<TransportMode>("grpc-web");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8080");
  const [nativeTarget, setNativeTarget] = useState("localhost:50051");
  const environmentController = useEnvironmentController();
  const {
    environmentKey,
    setEnvironmentKey,
    environments,
    setEnvironments,
    envMenuAnchor,
    setEnvMenuAnchor,
    envDialogOpen,
    setEnvDialogOpen,
    envDialogMode,
    setEnvDialogMode,
    envEditingKey,
    setEnvEditingKey,
    envDraftName,
    setEnvDraftName,
    envDraftUrl,
    setEnvDraftUrl,
    envDraftRestUrl,
    setEnvDraftRestUrl,
    envDraftNativeTarget,
    setEnvDraftNativeTarget,
    envDraftGrpcWebUrl,
    setEnvDraftGrpcWebUrl,
    envDraftWebSocketUrl,
    setEnvDraftWebSocketUrl,
  } = environmentController;
  const [protoFiles, setProtoFiles] = useState<ProtoSourceFile[]>([]);
  const [protoLibraries, setProtoLibraries] = useState<ProtoLibrary[]>([]);
  const [activeProtoLibraryId, setActiveProtoLibraryId] = useState("");
  const [activeProtoVersionId, setActiveProtoVersionId] = useState("");
  const protoRuntimeRegistry = useMemo(() => new ProtoRuntimeRegistry(protoLibraries), [protoLibraries]);
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const boundProtoMethodKeys = useMemo(
    () =>
      collections.flatMap((collection) =>
        collection.requests.flatMap((request) =>
          request.kind === "grpc" && request.grpc?.methodFullName ? [request.grpc.methodFullName] : [],
        ),
      ),
    [collections],
  );
  const [loaded, setLoaded] = useState<LoadedProto | null>(null);
  const [selectedMethodKey, setSelectedMethodKey] = useState("");
  const [mockSelectedMethodKey, setMockSelectedMethodKey] = useState("");
  const [activeCollectionRequestId, setActiveCollectionRequestId] = useState("");
  const [requestJsonState, setRequestJsonState] = useState<unknown>("{}");
  const requestJson = normalizeEditableText(requestJsonState, "{}");
  const setRequestJson = useCallback((value: unknown) => {
    setRequestJsonState(normalizeEditableText(value, "{}"));
  }, []);
  const [metadata, setMetadata] = useState<MetadataPair[]>(defaultMetadata);
  const [examples, setExamples] = useState<SavedExample[]>([]);
  const [methodDocs, setMethodDocs] = useState<MethodDoc[]>([]);
  const [docResults, setDocResults] = useState<DocResultSnapshot[]>([]);
  const [documentation, setDocumentation] = useState(() => normalizeDocumentationState());
  const [activeDocumentationPageId, setActiveDocumentationPageId] = useState("");
  const [assertionJson, setAssertionJson] = useState(defaultAssertion);
  const responseController = useResponseController();
  const {
    events,
    setEvents,
    lastResult,
    setLastResult,
    history,
    setHistory,
    assertionResults,
    setAssertionResults,
    responseFilter,
    setResponseFilter,
    responseSearchScope,
    setResponseSearchScope,
    pendingMessageCount,
    setPendingMessageCount,
    deferredResponseFilter,
    responseBodyRef,
    showMessageTopButton,
    setShowMessageTopButton,
  } = responseController;
  const restController = useRestController();
  const {
    restMockServer,
    setRestMockServer,
    restMockStatus,
    setRestMockStatus,
    restMockScenarioId,
    setRestMockScenarioId,
  } = restController;
  const webSocketController = useWebSocketController();
  const {
    wsMockServer,
    setWsMockServer,
    wsMockScenarioId,
    setWsMockScenarioId,
    wsBenchmarkIterations,
    setWsBenchmarkIterations,
    wsBenchmarkResults,
    setWsBenchmarkResults,
    wsBenchmarkRunning,
    setWsBenchmarkRunning,
    wsMockStatus,
    setWsMockStatus,
    wsClientRef,
    wsClientState,
    setWsClientState,
    wsBenchmarkAbortRef,
  } = webSocketController;
  const requestRunnerRef = useRef<RequestRunnerHandle | null>(null);
  const closeManualWebSocketClientRef = useRef<(reason?: string, notify?: boolean) => void>(() => {});
  const closeManualWebSocketClientProxy = useCallback((reason = "Closed by user", notify = true) => {
    closeManualWebSocketClientRef.current(reason, notify);
  }, []);
  const [collectionFilter, setCollectionFilter] = useState("");
  const [_error, setError] = useState("");
  const [toast, setToast] = useState<{
    id: number;
    open: boolean;
    message: string;
    severity: "info" | "success" | "warning" | "error";
  }>({ id: 0, open: false, message: "", severity: "info" });
  const [loggerSettingsOpen, setLoggerSettingsOpen] = useState(false);
  const [loggerInfo, setLoggerInfo] = useState<LayangLoggerInfo | null>(null);
  const [loggerDraft, setLoggerDraft] = useState<LayangLoggerSettings>(defaultLoggerSettings);
  const [certificateSettingsOpen, setCertificateSettingsOpen] = useState(false);
  const [certificateInfo, setCertificateInfo] = useState<LayangCertificateSettingsInfo | null>(null);
  const [certificateDraft, setCertificateDraft] = useState<LayangCertificateSettings>(defaultCertificateSettings);
  const [appZoomInfo, setAppZoomInfo] = useState<LayangAppZoomInfo | null>(null);
  const collectionController = useCollectionController();
  const {
    collectionMenuAnchor,
    setCollectionMenuAnchor,
    collectionDialogOpen,
    setCollectionDialogOpen,
    collectionNameDraft,
    setCollectionNameDraft,
    requestNameDialogOpen,
    setRequestNameDialogOpen,
    requestNameDraft,
    setRequestNameDraft,
    requestKindDraft,
    setRequestKindDraft,
    requestGrpcLibraryIdDraft,
    setRequestGrpcLibraryIdDraft,
    requestGrpcVersionIdDraft,
    setRequestGrpcVersionIdDraft,
    requestGrpcMethodKeyDraft,
    setRequestGrpcMethodKeyDraft,
    requestTargetCollectionId,
    setRequestTargetCollectionId,
    requestTargetFolderId,
    setRequestTargetFolderId,
    requestLocationEditable,
    setRequestLocationEditable,
    pendingCollectionImportRef,
  } = collectionController;
  const docsController = useDocsController();
  const { docsPreview, setDocsPreview, protoPreview, setProtoPreview } = docsController;
  const requestSessionController = useRequestSessionController();
  const {
    requestTab,
    setRequestTab,
    responseTab,
    setResponseTab,
    requestSessions,
    setRequestSessions,
    activeRequestId,
    setActiveRequestId,
    activeRequestIdRef,
    targetDraft,
    setTargetDraft,
  } = requestSessionController;
  const [isNativeBridgeAvailable, setIsNativeBridgeAvailable] = useState(false);
  const _abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const _cancelledRunIdsRef = useRef<Set<string>>(new Set());
  const protoInputRef = useRef<HTMLInputElement | null>(null);
  const protoFolderInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const exampleInputRef = useRef<HTMLInputElement | null>(null);
  const mockScenarioInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceBundleActions = useWorkspaceBundleActions({
    applyProject,
    applyWorkspaceLayout,
    getLayoutSnapshot,
    getProjectSnapshot,
    looksLikeProjectData,
    normalizeProjectData,
    projectStorageKey,
    setThemeMode,
    themeMode,
  });
  const { applyWorkspaceBundle, getWorkspaceExportBundle } = workspaceBundleActions;

  const workspace = useWorkspaceController({
    prefersDark,
    applyCachedLayout: layout.applyCachedLayout,
    applyProject,
    applyWorkspaceBundle,
    getWorkspaceExportBundle,
    setHydrated,
    setThemeMode,
    setIsNativeBridgeAvailable,
    showToast,
  });
  const {
    workspaceMenuAnchor,
    setWorkspaceMenuAnchor,
    workspaceFolderPath,
    setWorkspaceFolderPath,
    workspaceSetupOpen,
    workspaceSetupDefaultPath,
    workspaceSetupPending,
    workspaceAutosaveRef,
    applyWorkspacePreference,
    chooseCustomWorkspacePreference,
  } = workspace;

  const refreshLoggerSettings = useCallback(async () => {
    const info = await getLoggerInfo();
    if (!info) return null;
    setLoggerInfo(info);
    if (info.settings) setLoggerDraft(info.settings);
    return info;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refreshLoggerSettings();
  }, [hydrated, refreshLoggerSettings]);

  const openLoggerSettings = useCallback(() => {
    setLoggerSettingsOpen(true);
    void refreshLoggerSettings();
  }, [refreshLoggerSettings]);

  const saveLoggerSettings = useCallback(async () => {
    const info = await updateLoggerSettings(loggerDraft);
    if (!info?.ok) {
      showToast(info?.error || "Failed to update logger settings.", "error");
      return;
    }
    setLoggerInfo(info);
    setLoggerDraft(info.settings);
    showToast("Logger settings updated.", "success");
  }, [loggerDraft, showToast]);

  const openLogFolder = useCallback(async () => {
    const result = await openLoggerFolder();
    if (!result.ok) showToast(result.error || "Failed to open log folder.", "error");
  }, [showToast]);

  const clearLogFiles = useCallback(async () => {
    const info = await clearLoggerFiles();
    if (!info?.ok) {
      showToast(info?.error || "Failed to clear log files.", "error");
      return;
    }
    setLoggerInfo(info);
    showToast("Log files cleared.", "success");
  }, [showToast]);

  const refreshCertificateSettings = useCallback(async () => {
    const info = await getCertificateSettings();
    if (!info) return null;
    setCertificateInfo(info);
    if (info.settings) setCertificateDraft(info.settings);
    return info;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refreshCertificateSettings();
  }, [hydrated, refreshCertificateSettings]);

  const openCertificateSettings = useCallback(() => {
    setCertificateSettingsOpen(true);
    void refreshCertificateSettings();
  }, [refreshCertificateSettings]);

  const saveCertificateSettings = useCallback(async () => {
    const info = await updateCertificateSettings(certificateDraft);
    if (!info?.ok) {
      showToast(info?.error || "Failed to update certificate settings.", "error");
      return;
    }
    setCertificateInfo(info);
    setCertificateDraft(info.settings);
    showToast("Certificate settings updated.", "success");
  }, [certificateDraft, showToast]);

  const importCertificateSettingsFile = useCallback(async () => {
    const info = await importCertificateFile();
    if (!info) {
      showToast("Certificate import is only available in the desktop app.", "warning");
      return;
    }
    if (info.cancelled) return;
    if (!info.ok) {
      showToast(info.error || "Failed to import certificate file.", "error");
      return;
    }
    setCertificateInfo(info);
    setCertificateDraft(info.settings);
    showToast("Certificate imported.", "success");
  }, [showToast]);

  const clearCertificateSettingsPem = useCallback(async () => {
    const info = await clearCertificatePem();
    if (!info?.ok) {
      showToast(info?.error || "Failed to clear certificates.", "error");
      return;
    }
    setCertificateInfo(info);
    setCertificateDraft(info.settings);
    showToast("Certificates cleared.", "success");
  }, [showToast]);

  const removeCertificateSettingsItem = useCallback(
    async (certificateId: string) => {
      const nextCertificates = certificateDraft.caCertificates.filter(
        (certificate) => certificate.id !== certificateId,
      );
      const info = await updateCertificateSettings({
        ...certificateDraft,
        caCertificates: nextCertificates,
        caCertificatePem: nextCertificates.map((certificate) => certificate.pem).join(""),
      });
      if (!info?.ok) {
        showToast(info?.error || "Failed to remove certificate.", "error");
        return;
      }
      setCertificateInfo(info);
      setCertificateDraft(info.settings);
      showToast("Certificate removed.", "success");
    },
    [certificateDraft, showToast],
  );

  const refreshAppZoomInfo = useCallback(async () => {
    const info = await getAppZoomInfo();
    if (!info) return null;
    setAppZoomInfo(info);
    return info;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refreshAppZoomInfo();
    return subscribeAppZoomChanges(setAppZoomInfo);
  }, [hydrated, refreshAppZoomInfo]);

  const applyAppZoomAction = useCallback(
    async (action: () => Promise<LayangAppZoomInfo | null>, successMessage: string) => {
      const info = await action();
      if (!info) {
        showToast("Zoom is only available in the desktop app.", "warning");
        return;
      }
      if (!info.ok) {
        showToast(info.error || "Failed to update zoom.", "error");
        return;
      }
      setAppZoomInfo(info);
      showToast(successMessage, "success");
    },
    [showToast],
  );

  const zoomAppIn = useCallback(() => applyAppZoomAction(increaseAppZoom, "App zoom increased."), [applyAppZoomAction]);

  const zoomAppOut = useCallback(
    () => applyAppZoomAction(decreaseAppZoom, "App zoom decreased."),
    [applyAppZoomAction],
  );

  const resetAppZoomLevel = useCallback(
    () => applyAppZoomAction(resetAppZoom, "App zoom reset to 100%."),
    [applyAppZoomAction],
  );

  const grpcMock = useGrpcMockController({
    hydrated,
    workspaceFolderPath,
    localDirtyFallbackMs: MOCK_LOCAL_DIRTY_FALLBACK_MS,
    showToast,
  });
  const {
    mockServer,
    setMockServer,
    mockServerStatus,
    setMockServerStatus,
    webAccessStatus,
    setWebAccessStatus,
    mockSettingsOpen,
    setMockSettingsOpen,
    mockScenarioEditorDraft,
    setMockScenarioEditorDraft,
    mockScenarioEditorDirty,
    setMockScenarioEditorDirty,
    mockScenarioEditorError,
    setMockScenarioEditorError,
    mockScenarioDialogOpen,
    setMockScenarioDialogOpen,
    mockScenarioEditing,
    setMockScenarioEditing,
    mockScenarioDraftId,
    setMockScenarioDraftId,
    mockRuntimeUpdateSeqRef,
    mockRuntimeAppliedSeqRef,
    mockRuntimeLastSyncSignatureRef,
    mockServerRef,
    markMockServerLocalDirty,
    clearMockServerLocalDirty,
    refreshGrpcMockServerFromWorkspace,
  } = grpcMock;

  useWorkspaceFolderAutosave({
    enabled: hydrated,
    delayMs: WORKSPACE_AUTOSAVE_DELAY_MS,
    workspaceFolderPath,
    workspaceAutosaveRef,
    getWorkspaceExportBundle,
    clearMockServerLocalDirty,
    dependencies: [
      transportMode,
      baseUrl,
      nativeTarget,
      environmentKey,
      environments,
      protoFiles,
      protoLibraries,
      activeProtoLibraryId,
      activeProtoVersionId,
      collections,
      selectedMethodKey,
      requestJson,
      metadata,
      examples,
      methodDocs,
      docResults,
      documentation,
      assertionJson,
      history,
      mockServer,
      restMockServer,
      wsMockServer,
      requestSessions,
      activeRequestId,
      sidebarOpen,
      sidebarWidthPx,
      responseHeight,
      responseWidth,
      requestResponseLayout,
      themeMode,
    ],
  });

  useMockRuntimeSync({
    delayMs: MOCK_RUNTIME_SYNC_DELAY_MS,
    mockServer,
    mockServerStatus,
    setMockServerStatus,
    loaded,
    protoFiles,
    protoRuntimeRegistry,
    workspaceFolderPath,
    activeProtoLibraryId,
    activeProtoVersionId,
    updateSeqRef: mockRuntimeUpdateSeqRef,
    appliedSeqRef: mockRuntimeAppliedSeqRef,
    lastSyncSignatureRef: mockRuntimeLastSyncSignatureRef,
  });

  const flushRunningMockServersBeforeRequest = useCallback(async () => {
    const tasks: Array<Promise<unknown>> = [];

    if (restMockStatus.running && window.electronRestMock?.update) {
      tasks.push(
        window.electronRestMock.update(buildRestMockPayloadSnapshot()).then((result) => {
          if (result?.ok) {
            setRestMockStatus((current) => ({ ...current, ...result, running: result.running ?? current.running }));
          }
          return result;
        }),
      );
    }

    if (wsMockStatus.running && window.electronWsMock?.update) {
      tasks.push(
        window.electronWsMock.update(buildWebSocketMockPayloadSnapshot()).then((result) => {
          if (result?.ok) {
            setWsMockStatus((current) => ({ ...current, ...result, running: result.running ?? current.running }));
          }
          return result;
        }),
      );
    }

    if (tasks.length) await Promise.allSettled(tasks);
  }, [
    restMockStatus.running,
    buildRestMockPayloadSnapshot,
    setRestMockStatus,
    wsMockStatus.running,
    buildWebSocketMockPayloadSnapshot,
    setWsMockStatus,
  ]);

  useEffect(() => {
    return () => {
      const client = wsClientRef.current;
      wsClientRef.current = null;
      try {
        if (client?.socket.readyState === WebSocket.OPEN || client?.socket.readyState === WebSocket.CONNECTING) {
          client.socket.close(1000, "App closed");
        }
      } catch {}
    };
  }, []);

  useEffect(() => {
    activeRequestIdRef.current = activeRequestId;
  }, [activeRequestId]);

  useEffect(() => {
    if (!hydrated) return;

    function handleRequestTabShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const key = event.key.toLowerCase();
      const hasTabModifier = event.ctrlKey || event.metaKey;

      if (hasTabModifier && key === "w") {
        if (requestSessions.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) closeAllRequestSessions();
        else if (activeRequestId) closeRequestSession(activeRequestId);
        return;
      }

      if (hasTabModifier && (event.key === "PageUp" || event.key === "PageDown") && requestSessions.length > 1) {
        event.preventDefault();
        const activeIndex = Math.max(
          0,
          requestSessions.findIndex((session) => session.id === activeRequestId),
        );
        const direction = event.key === "PageUp" ? -1 : 1;
        const nextIndex = (activeIndex + direction + requestSessions.length) % requestSessions.length;
        activateRequestSession(requestSessions[nextIndex]);
      }
    }

    window.addEventListener("keydown", handleRequestTabShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleRequestTabShortcut, { capture: true });
  }, [hydrated, activeRequestId, requestSessions]);

  useEffect(() => {
    if (!hydrated || !activeRequestId || sideSection === "proto-schemas") return;
    const session = requestSessions.find((item) => item.id === activeRequestId);
    if (!session || session.requestKind !== "grpc") return;

    const directSourceRequestId = session.sourceRequestId ?? session.methodKey;
    const directCollectionRequest = findCollectionRequestById(collections, directSourceRequestId);
    const sessionGrpcIdentity = grpcBindingIdentity(session.grpc, session.grpc?.methodFullName ?? session.methodKey);
    const collectionGrpcRequest =
      directCollectionRequest?.kind === "grpc"
        ? directCollectionRequest
        : collections
            .flatMap((collection) =>
              collection.requests.map((request) => ({ ...request, collectionName: collection.name })),
            )
            .find(
              (request) =>
                request.kind === "grpc" &&
                grpcBindingIdentity(request.grpc, request.grpc?.methodFullName ?? request.grpcMethodKey ?? "") ===
                  sessionGrpcIdentity,
            );
    const sourceRequestId = collectionGrpcRequest?.id ?? directSourceRequestId;
    const binding = session.grpc ?? collectionGrpcRequest?.grpc;
    const compiled = binding ? protoRuntimeRegistry.resolveVersion(binding.libraryId, binding.versionId) : null;
    const grpcLoaded = compiled?.loaded ?? loaded;
    const grpcMethodKey = binding?.methodFullName ?? collectionGrpcRequest?.grpcMethodKey ?? "";
    const grpcMethod = grpcMethodKey ? grpcLoaded?.methods.find((method) => methodKey(method) === grpcMethodKey) : null;
    if (!grpcMethod) return;

    if (compiled && (activeProtoLibraryId !== compiled.library.id || activeProtoVersionId !== compiled.version.id)) {
      setActiveProtoLibraryId(compiled.library.id);
      setActiveProtoVersionId(compiled.version.id);
      setLoaded(compiled.loaded);
    }
    if (selectedMethodKey !== grpcMethodKey || activeCollectionRequestId !== sourceRequestId) {
      setSelectedMethodKey(grpcMethodKey);
      setActiveCollectionRequestId(sourceRequestId);
    }

    const shouldHydrateSession =
      session.methodKey !== sourceRequestId ||
      session.sourceRequestId !== sourceRequestId ||
      session.requestKind !== "grpc" ||
      session.grpc !== binding ||
      session.title !== (collectionGrpcRequest?.name ?? session.title) ||
      session.serviceName !== (collectionGrpcRequest?.collectionName ?? session.serviceName) ||
      session.requestUrl !== (collectionGrpcRequest?.url ?? session.requestUrl);
    if (shouldHydrateSession) {
      const nextSession: RequestSession = {
        ...session,
        methodKey: sourceRequestId,
        sourceRequestId,
        requestKind: "grpc",
        grpc: binding,
        title: collectionGrpcRequest?.name ?? session.title,
        serviceName: collectionGrpcRequest?.collectionName ?? session.serviceName,
        requestUrl: collectionGrpcRequest?.url ?? session.requestUrl,
        requestJson: session.requestJson?.trim() ? session.requestJson : (collectionGrpcRequest?.body ?? "{}"),
        metadata: session.metadata.length ? session.metadata : (collectionGrpcRequest?.headers ?? []),
        transportMode: session.transportMode === "native-grpc" ? "native-grpc" : "grpc-web",
        baseUrl: stripGrpcMethodPathFromUrl(session.baseUrl || collectionGrpcRequest?.url, grpcMethod, baseUrl),
        updatedAt: new Date().toISOString(),
      };
      setRequestSessions((current) => current.map((item) => (item.id === session.id ? nextSession : item)));
    }
  }, [
    hydrated,
    loaded,
    activeRequestId,
    requestSessions,
    collections,
    selectedMethodKey,
    activeCollectionRequestId,
    baseUrl,
    activeProtoLibraryId,
    activeProtoVersionId,
    protoRuntimeRegistry,
    sideSection,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      runWhenIdle(() => window.localStorage.setItem(projectStorageKey, JSON.stringify(getProjectSnapshot())));
    }, 1100);
    return () => window.clearTimeout(timeout);
  }, [
    hydrated,
    transportMode,
    baseUrl,
    nativeTarget,
    environmentKey,
    environments,
    protoFiles,
    collections,
    selectedMethodKey,
    requestJson,
    metadata,
    examples,
    methodDocs,
    docResults,
    assertionJson,
    history,
    mockServer,
    restMockServer,
    wsMockServer,
    requestSessions,
    activeRequestId,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      runWhenIdle(() =>
        window.localStorage.setItem(
          layoutStorageKey,
          JSON.stringify({ sidebarOpen, sidebarWidthPx, responseHeight, responseWidth, requestResponseLayout }),
        ),
      );
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [hydrated, sidebarOpen, sidebarWidthPx, responseHeight, responseWidth, requestResponseLayout]);

  useEffect(() => {
    const storedDensity = window.localStorage.getItem("layang-density");
    if (storedDensity === "compact" || storedDensity === "comfortable") setDensityMode(storedDensity);
  }, []);

  const setWorkbenchDensity = useCallback((value: "compact" | "comfortable") => {
    setDensityMode(value);
    window.localStorage.setItem("layang-density", value);
  }, []);

  const theme = useWorkbenchTheme(themeMode);

  const activeSession = useMemo(
    () => requestSessions.find((session) => session.id === activeRequestId) ?? null,
    [requestSessions, activeRequestId],
  );

  const selectedMethod = useMemo(() => {
    if (!loaded || !selectedMethodKey) return null;
    return loaded.methods.find((method) => methodKey(method) === selectedMethodKey) ?? null;
  }, [loaded, selectedMethodKey]);

  const mockSelectedMethod = useMemo(() => {
    const explicitKey = mockSelectedMethodKey.trim();
    if (explicitKey) {
      const activeMatch = loaded?.methods.find((method) => methodKey(method) === explicitKey);
      if (activeMatch) return activeMatch;
      for (const source of mockServer.protoSources ?? []) {
        const compiled = protoRuntimeRegistry.resolveVersion(source.libraryId, source.versionId);
        const attachedMatch = compiled?.loaded.methods.find((method) => methodKey(method) === explicitKey);
        if (attachedMatch) return attachedMatch;
      }
    }
    const selectedMatch = loaded?.methods.find((method) => methodKey(method) === selectedMethodKey);
    if (selectedMatch) return selectedMatch;
    if (loaded?.methods[0]) return loaded.methods[0];
    for (const source of mockServer.protoSources ?? []) {
      const compiled = protoRuntimeRegistry.resolveVersion(source.libraryId, source.versionId);
      if (compiled?.loaded.methods[0]) return compiled.loaded.methods[0];
    }
    return null;
  }, [loaded, mockSelectedMethodKey, selectedMethodKey, mockServer.protoSources, protoRuntimeRegistry]);

  useEffect(() => {
    if (mockSelectedMethodKey || !mockSelectedMethod) return;
    setMockSelectedMethodKey(methodKey(mockSelectedMethod));
  }, [mockSelectedMethod, mockSelectedMethodKey]);

  const activeCollectionRequest = useMemo(() => {
    if (!activeCollectionRequestId) return null;
    for (const collection of collections) {
      const request = collection.requests.find((item) => item.id === activeCollectionRequestId);
      if (request) return { ...request, collectionName: collection.name };
    }
    return null;
  }, [collections, activeCollectionRequestId]);

  const activeMethodKey = selectedMethod ? methodKey(selectedMethod) : "";
  const activeCollectionKey = activeCollectionRequest
    ? `${activeCollectionRequest.collectionName ?? "Collection"}/${activeCollectionRequest.name}`
    : "";
  const activeDocKey =
    activeMethodKey || webSocketDocKey(activeCollectionRequest) || restDocKey(activeCollectionRequest);
  const activeExampleKey = activeMethodKey || activeCollectionKey;
  const currentExamples = useMemo(
    () => (activeExampleKey ? examples.filter((example) => savedExampleKey(example) === activeExampleKey) : []),
    [examples, activeExampleKey],
  );
  const currentHistory = useMemo(
    () => (activeExampleKey ? history.filter((item) => item.method === activeExampleKey) : []),
    [history, activeExampleKey],
  );
  const activeWebSocketMockScenarios = useMemo(() => {
    if (activeCollectionRequest?.kind !== "websocket") return [];
    const related = wsMockServer.scenarios.filter(
      (scenario) => scenario.requestId === activeCollectionRequest.id || scenario.id === activeCollectionRequest.id,
    );
    if (related.length) return related;
    return [createWebSocketMockScenarioForRequest(activeCollectionRequest, { id: activeCollectionRequest.id })];
  }, [activeCollectionRequest, wsMockServer.scenarios]);
  const selectedWebSocketScenarioId =
    activeCollectionRequest?.kind === "websocket"
      ? wsMockServer.selectedScenarioIds[activeCollectionRequest.id] || wsMockScenarioId || ""
      : "";
  const activeWebSocketMockScenario =
    activeWebSocketMockScenarios.find((scenario) => scenario.id === selectedWebSocketScenarioId) ??
    activeWebSocketMockScenarios[0] ??
    null;
  const activeWebSocketMockResponseText =
    activeWebSocketMockScenario?.responseText ??
    activeCollectionRequest?.mockResponse ??
    defaultWebSocketMockResponse(activeCollectionRequest?.name);
  const wsMockPort = wsMockServer.port;
  const wsMockPath = activeWebSocketMockScenario?.path ?? webSocketRequestPath(activeCollectionRequest);
  const wsMockIntervalMs = activeWebSocketMockScenario?.intervalMs ?? 1000;
  const wsMockLoop = activeWebSocketMockScenario?.loop ?? false;
  const wsMockMaxLoops = activeWebSocketMockScenario?.maxLoops ?? 0;
  const wsMockStreamOnConnect = activeWebSocketMockScenario?.streamOnConnect ?? false;
  const wsMockSidebarRows = useMemo(() => {
    const requestsById = new Map<string, ApiCollectionRequest & { collectionName?: string }>();
    for (const collection of collections) {
      for (const request of collection.requests) {
        if (request.kind === "websocket") requestsById.set(request.id, { ...request, collectionName: collection.name });
      }
    }
    return buildWebSocketMockPayloadSnapshot(wsMockServer).scenarios.map((scenario) => {
      const request = scenario.requestId ? requestsById.get(scenario.requestId) : undefined;
      return {
        id: scenario.id,
        scenarioId: scenario.id,
        requestId: scenario.requestId,
        name: scenario.name,
        requestName: request?.name ?? scenario.name,
        path: scenario.path,
        enabled: scenario.enabled !== false,
        intervalMs: scenario.intervalMs,
        loop: scenario.loop,
        maxLoops: scenario.maxLoops,
        url: `ws://127.0.0.1:${wsMockStatus.port ?? wsMockServer.port}${scenario.path}`,
      };
    });
  }, [collections, wsMockServer, wsMockStatus.port]);
  const activeRestMockScenarios = useMemo(() => {
    if (activeCollectionRequest?.kind !== "rest") return [];
    const related = restMockServer.scenarios.filter(
      (scenario) => scenario.requestId === activeCollectionRequest.id || scenario.id === activeCollectionRequest.id,
    );
    if (related.length) return related;
    return [createRestMockPresetScenario(activeCollectionRequest, "success")];
  }, [activeCollectionRequest, restMockServer.scenarios]);
  const activeRestMockScenario =
    activeRestMockScenarios.find((scenario) => scenario.id === restMockScenarioId) ??
    activeRestMockScenarios[0] ??
    null;
  const activeRestMockResponseText =
    activeRestMockScenario?.body ??
    activeCollectionRequest?.mockResponse ??
    defaultRestMockResponse(activeCollectionRequest?.name);

  function buildWebSocketMockPayloadSnapshot(project = wsMockServer): Pick<WebSocketMockProject, "port" | "scenarios"> {
    const wsRequests = collections.flatMap((collection) =>
      collection.requests
        .filter((request) => request.kind === "websocket")
        .map((request) => ({ ...request, collectionName: collection.name })),
    );
    const scenarios: WebSocketMockScenario[] = project.scenarios
      .filter((scenario) => !scenario.requestId || wsRequests.some((request) => request.id === scenario.requestId))
      .map((scenario) => ({
        ...scenario,
        path: normalizeWebSocketMockPath(scenario.path),
        intervalMs: Math.max(1, Math.floor(Number(scenario.intervalMs) || 1000)),
        maxLoops: Math.max(0, Math.floor(Number(scenario.maxLoops) || 0)),
        loop: Boolean(scenario.loop),
        streamOnConnect: Boolean(scenario.streamOnConnect),
        sendOnMessage: Boolean(scenario.sendOnMessage),
        matchMode:
          scenario.matchMode === "contains" || scenario.matchMode === "regex" || scenario.matchMode === "jsonPath"
            ? scenario.matchMode
            : "always",
        matchValue: scenario.matchValue ?? "",
        matchJsonPath: scenario.matchJsonPath ?? "",
      }));
    for (const request of wsRequests) {
      const hasScenario = scenarios.some((scenario) => scenario.requestId === request.id || scenario.id === request.id);
      if (!hasScenario) scenarios.push(createWebSocketMockScenarioForRequest(request, { id: request.id }));
    }
    const selectedScenarioIds = project.selectedScenarioIds ?? {};
    scenarios.sort((left, right) => {
      const leftSelected = left.requestId ? selectedScenarioIds[left.requestId] === left.id : false;
      const rightSelected = right.requestId ? selectedScenarioIds[right.requestId] === right.id : false;
      if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
      return 0;
    });
    return { port: normalizeWebSocketMockPort(project.port), scenarios };
  }

  function buildRestMockPayloadSnapshot(project = restMockServer) {
    const restRequests = collections.flatMap((collection) =>
      collection.requests
        .filter((request) => request.kind === "rest")
        .map((request) => ({ ...request, collectionName: collection.name })),
    );
    const scenarios: RestMockScenario[] = project.scenarios
      .filter((scenario) => !scenario.requestId || restRequests.some((request) => request.id === scenario.requestId))
      .map((scenario) => ({
        ...scenario,
        method: (scenario.method || "GET").toUpperCase(),
        priority: Math.trunc(Number(scenario.priority) || 0),
        status: Math.min(599, Math.max(100, Math.trunc(Number(scenario.status) || 200))),
        delayMs: Math.max(0, Math.trunc(Number(scenario.delayMs) || 0)),
        matchQuery: scenario.matchQuery ?? [],
        matchHeaders: scenario.matchHeaders ?? [],
        matchBodyContains: scenario.matchBodyContains ?? "",
        matchJsonPath: scenario.matchJsonPath ?? "",
        matchJsonEquals: scenario.matchJsonEquals ?? "",
      }));
    for (const request of restRequests) {
      const hasScenario = scenarios.some((scenario) => scenario.requestId === request.id || scenario.id === request.id);
      if (!hasScenario) scenarios.push(createRestMockPresetScenario(request, "success"));
    }
    return {
      port: normalizeRestMockPort(project.port),
      bindHost: normalizeRestMockBindHost(project.bindHost),
      scenarios,
    };
  }

  async function updateRunningRestMockServerSnapshot() {
    if (!restMockStatus.running || !window.electronRestMock?.update) return;
    const result = await window.electronRestMock.update(buildRestMockPayloadSnapshot());
    if (result?.ok)
      setRestMockStatus((current) => ({ ...current, ...result, running: result.running ?? current.running }));
  }
  const latestResultByMethod = useMemo(() => buildLatestResultByMethod(requestSessions), [requestSessions]);
  const savedDocResultByMethod = useMemo(() => buildSavedDocResultByMethod(docResults), [docResults]);
  const activeSelectedGrpcBinding = useMemo(() => {
    if (!selectedMethod) return undefined;
    const activeProto = findProtoVersion(protoLibraries, activeProtoLibraryId, activeProtoVersionId);
    return activeProto ? createPinnedGrpcBinding(activeProto.library, activeProto.version, selectedMethod) : undefined;
  }, [selectedMethod, protoLibraries, activeProtoLibraryId, activeProtoVersionId]);
  const currentMethodDoc = useMemo(() => {
    if (!activeMethodKey || !selectedMethod) return null;
    const identity = grpcBindingIdentity(activeSelectedGrpcBinding, activeMethodKey);
    return (
      methodDocs.find((doc) => grpcBindingIdentity(doc.grpc, doc.methodKey) === identity) ?? {
        ...getOrCreateMethodDoc(methodDocs, selectedMethod),
        grpc: activeSelectedGrpcBinding,
      }
    );
  }, [methodDocs, selectedMethod, activeMethodKey, activeSelectedGrpcBinding]);
  const currentWebSocketDoc = useMemo(() => {
    const key = webSocketDocKey(activeCollectionRequest);
    if (!key || activeCollectionRequest?.kind !== "websocket") return null;
    return (
      methodDocs.find((doc) => doc.methodKey === key) ?? {
        methodKey: key,
        serviceName: activeCollectionRequest.collectionName ?? "WebSocket Collection",
        methodName: activeCollectionRequest.name,
        published: false,
        updatedAt: activeCollectionRequest.updatedAt,
      }
    );
  }, [methodDocs, activeCollectionRequest]);
  const currentRestDoc = useMemo(() => {
    const key = restDocKey(activeCollectionRequest);
    if (!key || activeCollectionRequest?.kind !== "rest") return null;
    return (
      methodDocs.find((doc) => doc.methodKey === key) ?? {
        methodKey: key,
        serviceName: activeCollectionRequest.collectionName ?? "REST Collection",
        methodName: activeCollectionRequest.name,
        published: false,
        updatedAt: activeCollectionRequest.updatedAt,
      }
    );
  }, [methodDocs, activeCollectionRequest]);

  useEffect(() => {
    if (activeCollectionRequest?.kind !== "rest") {
      if (restMockScenarioId) setRestMockScenarioId("");
      return;
    }
    if (!activeRestMockScenarios.length) return;
    if (!activeRestMockScenarios.some((scenario) => scenario.id === restMockScenarioId)) {
      setRestMockScenarioId(activeRestMockScenarios[0].id);
    }
  }, [activeCollectionRequest, activeRestMockScenarios, restMockScenarioId]);

  useEffect(() => {
    if (activeCollectionRequest?.kind !== "websocket") {
      if (wsMockScenarioId) setWsMockScenarioId("");
      return;
    }
    if (!activeWebSocketMockScenarios.length) return;
    const selectedScenarioId = wsMockServer.selectedScenarioIds[activeCollectionRequest.id] || wsMockScenarioId;
    if (!activeWebSocketMockScenarios.some((scenario) => scenario.id === selectedScenarioId)) {
      selectWebSocketMockScenario(activeWebSocketMockScenarios[0].id);
    } else if (selectedScenarioId !== wsMockScenarioId) {
      setWsMockScenarioId(selectedScenarioId);
    }
  }, [activeCollectionRequest, activeWebSocketMockScenarios, wsMockScenarioId, wsMockServer.selectedScenarioIds]);

  const activeDocsResult = activeMethodKey
    ? ([...docResults]
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .find(
          (item) =>
            grpcBindingIdentity(item.grpc, item.methodKey) ===
            grpcBindingIdentity(activeSelectedGrpcBinding, activeMethodKey),
        )?.result ??
      requestSessions.find(
        (session) =>
          grpcBindingIdentity(session.grpc, session.methodKey) ===
          grpcBindingIdentity(activeSelectedGrpcBinding, activeMethodKey),
      )?.lastResult ??
      savedDocResultByMethod.get(activeMethodKey) ??
      latestResultByMethod.get(activeMethodKey) ??
      null)
    : null;
  const parsedMockConfig = useMemo(
    () => parseAllMockScenarioFiles(mockServer, loaded?.methods ?? []),
    [mockServer, loaded],
  );
  const allMockScenarios = parsedMockConfig.ok ? parsedMockConfig.bundle.scenarios : [];
  const documentationPages = useMemo<UnifiedDocsPage[]>(
    () =>
      buildUnifiedDocsPages(
        {
          collections,
          protoLibraries,
          examples,
          docResults,
          requestTabs: requestSessions,
          restMockServer,
          wsMockServer,
          documentation,
        },
        { workspaceName: "Layang Workspace", grpcScenarios: allMockScenarios },
      ),
    [
      collections,
      protoLibraries,
      examples,
      docResults,
      requestSessions,
      restMockServer,
      wsMockServer,
      documentation,
      allMockScenarios,
    ],
  );
  const activeRequestDocumentationPage = useMemo<UnifiedDocsPage | null>(
    () =>
      activeCollectionRequest
        ? (documentationPages.find((page) => page.id === `request:${activeCollectionRequest.id}`) ?? null)
        : null,
    [documentationPages, activeCollectionRequest],
  );
  const standaloneDocumentationPage = useMemo<UnifiedDocsPage | null>(
    () =>
      activeDocumentationPageId
        ? (documentationPages.find((page) => page.id === activeDocumentationPageId) ?? null)
        : null,
    [documentationPages, activeDocumentationPageId],
  );
  const activeDocumentationPage = standaloneDocumentationPage ?? activeRequestDocumentationPage;
  const activeDocumentationSource = activeDocumentationPage
    ? (documentation.sources.find(
        (source) => source.key === `${activeDocumentationPage.kind}:${activeDocumentationPage.entityId}`,
      ) ?? null)
    : null;

  function saveDocumentationSource(source: DocumentationSource) {
    setDocumentation((current) => upsertDocumentationSource(current, source));
    showToast("Documentation draft saved.", "success");
  }

  function updateDocumentationSettings(settings: ReturnType<typeof normalizeDocumentationState>["settings"]) {
    setDocumentation((current) => ({ ...normalizeDocumentationState(current), settings }));
  }

  function markDocumentationPublished(pageIds: string[]) {
    const pageById = new Map<string, UnifiedDocsPage>(documentationPages.map((page) => [page.id, page]));
    setDocumentation((current) => {
      const normalized = normalizeDocumentationState(current);
      const idSet = new Set(pageIds);
      const publications = [
        ...pageIds.flatMap((pageId) => {
          const page = pageById.get(pageId);
          return page
            ? [{ pageId, sourceHash: page.sourceHash, outputPath: "", publishedAt: new Date().toISOString() }]
            : [];
        }),
        ...normalized.publications.filter((item) => !idSet.has(item.pageId)),
      ];
      return { ...normalized, publications };
    });
  }

  async function publishDocumentationPage(pageId = activeDocumentationPage?.id ?? "") {
    if (!pageId) return;
    if (!workspaceFolderPath || !window.electronDocs?.build || !window.electronWorkspace?.saveFolder) {
      showToast("Save the workspace folder in the desktop app before publishing docs.", "warning");
      return;
    }
    try {
      const bundle = getWorkspaceExportBundle();
      const saveResult = await window.electronWorkspace.saveFolder(bundle, workspaceFolderPath);
      if (!saveResult.ok) throw new Error(saveResult.error || "Workspace save failed before documentation publish.");
      const result = await window.electronDocs.build({
        directoryPath: workspaceFolderPath,
        bundle,
        pageId,
        workspaceName: "Layang Workspace",
      });
      if (!result.ok) throw new Error(result.error || "Documentation publish failed.");
      markDocumentationPublished([pageId]);
      showToast("Documentation published as Markdown and static HTML.", "success");
    } catch (error) {
      showToast(`Publish docs failed: ${toErrorMessage(error)}`, "error");
    }
  }

  async function buildAllDocumentation() {
    if (!workspaceFolderPath || !window.electronDocs?.build || !window.electronWorkspace?.saveFolder) {
      showToast("Save the workspace folder in the desktop app before building docs.", "warning");
      return;
    }
    try {
      const bundle = getWorkspaceExportBundle();
      const saveResult = await window.electronWorkspace.saveFolder(bundle, workspaceFolderPath);
      if (!saveResult.ok) throw new Error(saveResult.error || "Workspace save failed before documentation build.");
      const result = await window.electronDocs.build({
        directoryPath: workspaceFolderPath,
        bundle,
        workspaceName: "Layang Workspace",
      });
      if (!result.ok) throw new Error(result.error || "Documentation build failed.");
      markDocumentationPublished(documentationPages.map((page) => page.id));
      showToast(
        `${result.report?.pageCount ?? documentationPages.length} documentation page(s) built. Static site and wiki export are ready.`,
        "success",
      );
    } catch (error) {
      showToast(`Build docs failed: ${toErrorMessage(error)}`, "error");
    }
  }

  async function checkDocumentationBuild() {
    if (!workspaceFolderPath || !window.electronDocs?.check) {
      showToast("Open a desktop workspace folder before checking docs.", "warning");
      return;
    }
    try {
      const result = await window.electronDocs.check({ directoryPath: workspaceFolderPath });
      if (!result.ok) {
        showToast(`${result.report?.staleCount ?? 0} documentation file(s) are stale.`, "warning");
        return;
      }
      showToast("Published documentation matches the current workspace.", "success");
    } catch (error) {
      showToast(`Check docs failed: ${toErrorMessage(error)}`, "error");
    }
  }

  function openDocumentationPage(page: UnifiedDocsPage) {
    setProtoPreview(null);
    setActiveDocumentationPageId(page.id);
    setSideSection("docs");
    setSidebarOpen(true);
  }

  function openDocumentationRequest(page: UnifiedDocsPage) {
    if (page.kind !== "request") return;
    for (const collection of collections) {
      const request = collection.requests.find((item) => item.id === page.entityId);
      if (!request) continue;
      setActiveDocumentationPageId("");
      selectCollectionRequest(collection, request);
      setSideSection("collections");
      setSidebarOpen(true);
      setRequestTab("body");
      return;
    }
  }

  useEffect(() => {
    const unsubscribe = window.electronDeepLink?.onOpen?.((url) => {
      try {
        const parsed = new URL(url);
        if (parsed.hostname !== "request") return;
        const requestId = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
        const page = documentationPages.find((item: UnifiedDocsPage) => item.id === `request:${requestId}`);
        if (!page) {
          showToast("The documentation request is not available in the active workspace.", "warning");
          return;
        }
        openDocumentationRequest(page);
      } catch {
        showToast("The Layang documentation link is invalid.", "warning");
      }
    });
    return unsubscribe;
  }, [documentationPages]);

  function openDocumentationSite() {
    if (!workspaceFolderPath || !window.electronWorkspace?.openPath) {
      showToast("Documentation site is available after building a desktop workspace.", "warning");
      return;
    }
    void window.electronWorkspace.openPath(workspaceFolderPath, "docs/site/index.html");
  }

  async function openDocumentationWikiExport() {
    if (!workspaceFolderPath || !window.electronWorkspace?.openPath) {
      showToast("Wiki export is available after building a desktop workspace.", "warning");
      return;
    }
    const result = await window.electronWorkspace.openPath(workspaceFolderPath, "docs/wiki-export");
    if (!result.ok) showToast("Build all documentation before opening the wiki export.", "warning");
  }

  const documentationSourceRevision = documentation.sources
    .map((source) => `${source.key}:${source.updatedAt}`)
    .sort()
    .join("|");
  useEffect(() => {
    if (documentation.settings.mode !== "publish-on-save" || !hydrated || !workspaceFolderPath) return;
    const timer = window.setTimeout(() => void buildAllDocumentation(), 900);
    return () => window.clearTimeout(timer);
  }, [documentation.settings.mode, documentationSourceRevision, hydrated, workspaceFolderPath]);

  const publishedDocs = useMemo(() => {
    const grpcDocs = methodDocs
      .filter((doc) => doc.published && !doc.methodKey.startsWith("ws:") && !doc.methodKey.startsWith("rest:"))
      .map((doc) => {
        const compiled = doc.grpc ? protoRuntimeRegistry.resolveVersion(doc.grpc.libraryId, doc.grpc.versionId) : null;
        const docLoaded = compiled?.loaded ?? loaded;
        const targetMethodKey = doc.grpc?.methodFullName ?? doc.methodKey;
        const method = docLoaded?.methods.find((item) => methodKey(item) === targetMethodKey);
        if (!method) {
          return {
            ...doc,
            generatedMarkdown:
              "# Unresolved proto reference\n\nThe documented method is pinned to a proto library or version that is no longer available.",
          };
        }
        const key = methodKey(method);
        const identity = grpcBindingIdentity(doc.grpc, key);
        const methodExamples = examples.filter((example) => savedExampleKey(example) === key);
        const savedResult = [...docResults]
          .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
          .find((item) => grpcBindingIdentity(item.grpc, item.methodKey) === identity)?.result;
        const session = requestSessions.find((item) => grpcBindingIdentity(item.grpc, item.methodKey) === identity);
        const mockBinding = mockServer.methodBindings?.[key];
        const includeMockScenarios = !doc.grpc || !mockBinding || grpcBindingIdentity(mockBinding, key) === identity;
        const methodMocks = includeMockScenarios
          ? allMockScenarios.filter(
              (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
            )
          : [];
        return {
          ...doc,
          serviceName: method.serviceName,
          methodName: method.methodName,
          generatedMarkdown: renderMethodPublicationMarkdown({
            method,
            examples: methodExamples,
            protoFiles: compiled?.version.files ?? protoFiles,
            latestResult: savedResult ?? session?.lastResult ?? null,
            mockScenarios: methodMocks,
            currentRequestJson: session?.requestJson,
            currentMetadata: session?.metadata,
          }),
        };
      });
    const wsDocs = methodDocs
      .filter((doc) => doc.published && doc.methodKey.startsWith("ws:"))
      .map((doc) => {
        const request = findWebSocketRequestForDocKey(collections, doc.methodKey);
        if (!request) return doc;
        const key = `${request.collectionName ?? "Collection"}/${request.name}`;
        const requestExamples = examples.filter((example) => savedExampleKey(example) === key);
        const session = requestSessions.find((item) => item.methodKey === request.id);
        return {
          ...doc,
          serviceName: request.collectionName ?? doc.serviceName,
          methodName: request.name,
          generatedMarkdown: renderWebSocketDocsMarkdown({
            collectionRequest: request,
            url: session?.baseUrl || request.url,
            message: session?.requestJson || request.body || "",
            examples: requestExamples,
            latestResult: session?.lastResult ?? null,
          }),
        };
      });
    const restDocs = methodDocs
      .filter((doc) => doc.published && doc.methodKey.startsWith("rest:"))
      .map((doc) => {
        const request = findRestRequestForDocKey(collections, doc.methodKey);
        if (!request) return doc;
        const session = requestSessions.find((item) => item.methodKey === request.id);
        const key = `${request.collectionName ?? "Collection"}/${request.name}`;
        const requestExamples = examples.filter((example) => savedExampleKey(example) === key);
        return {
          ...doc,
          serviceName: request.collectionName ?? doc.serviceName,
          methodName: request.name,
          generatedMarkdown: renderRestDocsMarkdown({
            collectionRequest: request,
            url: session?.requestUrl || buildRestRequestUrl(request, session?.baseUrl || request.url),
            latestResult: session?.lastResult ?? null,
            examples: requestExamples,
          }),
        };
      });
    return [...grpcDocs, ...wsDocs, ...restDocs];
  }, [
    loaded,
    methodDocs,
    examples,
    protoFiles,
    docResults,
    allMockScenarios,
    collections,
    requestSessions,
    protoRuntimeRegistry,
    mockServer.methodBindings,
  ]);
  const currentMockFile = useMemo(
    () => getMockMethodScenarioFile(mockServer, mockSelectedMethod),
    [mockServer, mockSelectedMethod],
  );
  const currentMockParse = useMemo(
    () => parseMockScenarioText(currentMockFile.scenarioText, currentMockFile.format, mockServer.port),
    [currentMockFile.scenarioText, currentMockFile.format, mockServer.port],
  );
  const currentMockScenarios = useMemo(() => {
    if (!mockSelectedMethod || !currentMockParse.ok) return [];
    return currentMockParse.bundle.scenarios.filter(
      (scenario) =>
        scenario.service === mockSelectedMethod.serviceName && scenario.method === mockSelectedMethod.methodName,
    );
  }, [mockSelectedMethod, currentMockParse]);
  const currentMockActiveScenario = useMemo(
    () =>
      getActiveScenarioForMethod(
        currentMockParse.ok ? currentMockParse.bundle.scenarios : [],
        mockSelectedMethod,
        mockServer.selectedScenarioIds,
      ),
    [currentMockParse, mockSelectedMethod, mockServer.selectedScenarioIds],
  );
  const currentMockSelectedScenarioId = currentMockActiveScenario?.id ?? currentMockScenarios[0]?.id ?? "";

  useEffect(() => {
    if (!hydrated || !mockSelectedMethod || currentMockScenarios.length === 0) return;
    const key = methodKey(mockSelectedMethod);
    const selectedId = mockServer.selectedScenarioIds[key];
    if (selectedId && currentMockScenarios.some((scenario) => scenario.id === selectedId)) return;
    const nextId = currentMockActiveScenario?.id ?? currentMockScenarios[0]?.id ?? "";
    if (!nextId) return;
    setMockServer((current) => {
      const currentSelectedId = current.selectedScenarioIds[key];
      if (currentSelectedId && currentMockScenarios.some((scenario) => scenario.id === currentSelectedId))
        return current;
      return {
        ...current,
        selectedScenarioIds: { ...current.selectedScenarioIds, [key]: nextId },
        updatedAt: new Date().toISOString(),
      };
    });
  }, [
    hydrated,
    mockSelectedMethod,
    currentMockScenarios,
    currentMockActiveScenario,
    mockServer.selectedScenarioIds,
    setMockServer,
  ]);

  const currentMockEditorKey = mockSelectedMethod
    ? `${methodKey(mockSelectedMethod)}:${currentMockSelectedScenarioId || "new"}:${currentMockFile.format}`
    : "";
  const currentMockEditorText = useMemo(() => {
    if (!mockSelectedMethod) return currentFileEmptyEditorText(currentMockFile.format);
    if (
      mockScenarioEditorDraft &&
      mockScenarioEditorDraft.methodKey === methodKey(mockSelectedMethod) &&
      mockScenarioEditorDraft.scenarioId === currentMockSelectedScenarioId &&
      mockScenarioEditorDraft.format === currentMockFile.format
    ) {
      return mockScenarioEditorDraft.text;
    }
    const scenario = currentMockActiveScenario ?? currentMockScenarios[0] ?? null;
    return scenario
      ? formatSingleMockScenarioForEditor(scenario, currentMockFile.format)
      : currentSingleScenarioEmptyEditorText(mockSelectedMethod, currentMockFile.format);
  }, [
    mockSelectedMethod,
    currentMockFile.format,
    mockScenarioEditorDraft,
    currentMockSelectedScenarioId,
    currentMockActiveScenario,
    currentMockScenarios,
  ]);
  const currentMockEditorParse = useMemo(() => {
    if (!mockSelectedMethod) {
      return parseSingleMockScenarioText(
        currentSingleScenarioEmptyEditorText(null, currentMockFile.format),
        currentMockFile.format,
        mockServer.port,
        null,
      );
    }
    const scenario = currentMockActiveScenario ?? currentMockScenarios[0] ?? null;
    const savedText = scenario
      ? formatSingleMockScenarioForEditor(scenario, currentMockFile.format)
      : currentSingleScenarioEmptyEditorText(mockSelectedMethod, currentMockFile.format);
    return parseSingleMockScenarioText(savedText, currentMockFile.format, mockServer.port, mockSelectedMethod);
  }, [currentMockActiveScenario, currentMockFile.format, currentMockScenarios, mockServer.port, mockSelectedMethod]);
  const mockMappingRows = useMemo(
    () =>
      buildMockMappingRows(
        loaded?.methods ?? [],
        parsedMockConfig.ok ? parsedMockConfig.bundle.scenarios : [],
        mockServer.selectedScenarioIds,
        mockServer.enabledMethods,
      ),
    [loaded, parsedMockConfig, mockServer.selectedScenarioIds, mockServer.enabledMethods],
  );

  const rawActiveTransportMode = activeSession?.transportMode ?? transportMode;
  const activeIsWebSocket = activeCollectionRequest?.kind === "websocket" || activeSession?.requestKind === "websocket";
  const activeIsRest = activeCollectionRequest?.kind === "rest" || activeSession?.requestKind === "rest";
  const activeTransportMode: TransportMode = activeIsWebSocket
    ? "websocket"
    : activeIsRest
      ? "rest"
      : rawActiveTransportMode === "websocket" || rawActiveTransportMode === "rest"
        ? "grpc-web"
        : rawActiveTransportMode;
  const webSocketSubprotocolValue = activeIsWebSocket
    ? (metadata.find((item) => item.key.trim().toLowerCase() === "sec-websocket-protocol")?.value ?? "")
    : "";
  const activeBaseUrl = activeIsWebSocket
    ? (activeSession?.baseUrl ?? activeCollectionRequest?.url ?? "ws://localhost:8080")
    : activeIsRest
      ? (activeSession?.baseUrl ?? activeCollectionRequest?.url ?? "http://127.0.0.1:3000")
      : grpcBaseUrlFallback(activeSession?.baseUrl, baseUrl);
  const activeNativeTarget = activeSession?.nativeTarget ?? nativeTarget;
  const activeEnvironmentKey = activeSession?.environmentKey ?? environmentKey;
  const activeTargetTransport: TransportMode = activeTransportMode === "native-grpc" ? "grpc-web" : activeTransportMode;
  const effectiveBaseUrl = featureGetEnvironmentTarget(
    environments,
    activeEnvironmentKey,
    activeTargetTransport,
    activeBaseUrl,
    activeNativeTarget,
  );
  const effectiveNativeTarget = featureGetEnvironmentTarget(
    environments,
    activeEnvironmentKey,
    "native-grpc",
    activeBaseUrl,
    activeNativeTarget,
  );
  const isNativeTransport = activeTransportMode === "native-grpc";
  const draftEffectiveBaseUrl = isNativeTransport ? effectiveBaseUrl : targetDraft;
  const draftEffectiveNativeTarget = isNativeTransport ? targetDraft : effectiveNativeTarget;

  useEffect(() => {
    setTargetDraft(isNativeTransport ? effectiveNativeTarget : effectiveBaseUrl);
  }, [
    activeRequestId,
    activeTransportMode,
    activeEnvironmentKey,
    effectiveBaseUrl,
    effectiveNativeTarget,
    isNativeTransport,
  ]);

  useEffect(() => {
    if (!mockServerStatus.running || !window.electronMock?.status) return;
    const timer = window.setInterval(() => {
      void window.electronMock?.status?.().then((result) => {
        if (!result?.running) return;
        setMockServerStatus((current) => {
          if (!current.running) return current;
          const currentLogs = current.requestLog ?? [];
          const nextLogs = result.requestLog ?? currentLogs;
          const currentLastLog = currentLogs.at(-1);
          const nextLastLog = nextLogs.at(-1);
          const unchanged =
            current.updatedAt === result.updatedAt &&
            current.configVersion === result.configVersion &&
            currentLogs.length === nextLogs.length &&
            currentLastLog?.id === nextLastLog?.id &&
            currentLastLog?.status === nextLastLog?.status;
          return unchanged ? current : { ...current, ...result };
        });
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [mockServerStatus.running]);

  useEffect(() => {
    if (!wsMockStatus.running || !window.electronWsMock?.update) return;
    const timer = window.setTimeout(() => {
      void window.electronWsMock?.update?.(buildWebSocketMockPayloadSnapshot()).then((result) => {
        if (result?.ok)
          setWsMockStatus((current) => ({ ...current, ...result, running: result.running ?? current.running }));
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [collections, wsMockServer, wsMockStatus.running]);

  useEffect(() => {
    if (!wsMockStatus.running || !window.electronWsMock?.status) return;
    const timer = window.setInterval(() => {
      void window.electronWsMock?.status?.().then((result) => {
        setWsMockStatus((current) => (current.running || result?.running ? { ...current, ...result } : current));
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [wsMockStatus.running]);

  useEffect(() => {
    if (!restMockStatus.running || !window.electronRestMock?.update) return;
    const timer = window.setTimeout(() => {
      void updateRunningRestMockServerSnapshot();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [collections, restMockServer, restMockStatus.running]);

  useEffect(() => {
    if (!restMockStatus.running || !window.electronRestMock?.status) return;
    const timer = window.setInterval(() => {
      void window.electronRestMock?.status?.().then((result) => {
        setRestMockStatus((current) => (current.running || result?.running ? { ...current, ...result } : current));
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [restMockStatus.running]);

  useEffect(() => {
    setMockScenarioEditorDraft(null);
    setMockScenarioEditorDirty(false);
    setMockScenarioEditorError("");
  }, [currentMockEditorKey]);

  const activeRunning = Boolean(activeSession?.running);
  const benchmark = useBenchmarkRunner({
    loaded,
    selectedMethod,
    requestJson,
    metadata,
    transportMode: activeTransportMode,
    targetDraft,
    baseUrl: activeBaseUrl,
    nativeTarget: activeNativeTarget,
    protoFiles: loaded?.protoFiles ?? protoFiles,
    showToast,
  });
  const liveSessionEvents = useLiveSessionEvents({
    activeRequestIdRef,
    setEvents,
    setRequestSessions,
  });
  const { appendLiveEventToSession } = liveSessionEvents;

  const requestSessionActions = useRequestSessionActions({
    activeBaseUrl,
    activeCollectionRequest,
    activeCollectionRequestId,
    activeEnvironmentKey,
    activeExampleKey,
    activeNativeTarget,
    activeRequestId,
    activeRequestIdRef,
    activeRunning,
    activeTransportMode,
    assertionJson,
    assertionResults,
    baseUrl,
    closeManualWebSocketClient: closeManualWebSocketClientProxy,
    collections,
    currentMockActiveScenario,
    currentMockScenarios,
    environmentKey,
    events,
    findCollectionRequestById,
    getProjectSnapshot,
    getWorkspaceExportBundle,
    grpcBaseUrlFallback,
    lastResult,
    loaded,
    metadata,
    nativeTarget,
    protoRuntimeRegistry,
    protoLibraries,
    activeProtoLibraryId,
    activeProtoVersionId,
    requestJson,
    requestRunner: requestRunnerRef,
    requestSessions,
    responseTab,
    selectedMethod,
    selectedMethodKey,
    setActiveCollectionRequestId,
    setActiveRequestId,
    setAssertionJson,
    setAssertionResults,
    setBaseUrl,
    setCollections,
    setEnvironmentKey,
    setError,
    setEvents,
    setHistory,
    setLastResult,
    setLoaded,
    setMetadata,
    setNativeTarget,
    setActiveProtoLibraryId,
    setActiveProtoVersionId,
    setRequestJson,
    setRequestSessions,
    setResponseTab,
    setSelectedMethodKey,
    setTransportMode,
    showToast,
    stripGrpcMethodPathFromUrl,
    transportMode,
    workspaceAutosaveRef,
    workspaceFolderPath,
    wsClientRef,
  });
  const {
    activateRequestSession,
    addMetadataRow,
    addRestPairRow,
    clearActiveResponse,
    clearActiveView,
    clearHistory,
    closeAllRequestSessions,
    closeOtherRequestSessions,
    closeRequestSession,
    generateRandomRequestJson,
    generateRequestJsonFromSelectedScenario,
    handleRequestJsonChange,
    patchActiveCollectionRequest,
    persistProjectSnapshotNow,
    prettifyRequestJson,
    removeMetadataRow,
    reorderRequestSessions,
    setAuthorizationMetadata,
    removeRestPairRow,
    selectMethod,
    updateActiveRestAuth,
    updateActiveRestBodyType,
    updateActiveRestMethod,
    updateActiveSession,
    updateMetadataRow,
    updateRequestSession,
    updateRestPairRow,
    upsertRequestSessionPreservingOrder,
  } = requestSessionActions;

  useEffect(() => {
    if (!hydrated || requestSessions.length === 0) return;

    const sourceIndex = buildRequestSessionSourceIndex(collections, loaded?.methods ?? []);
    for (const methodKeyValue of boundProtoMethodKeys) sourceIndex.validGrpcMethodKeys.add(methodKeyValue);
    const cleanup = cleanupRequestSessionsForDeletedSources(requestSessions, activeRequestId, sourceIndex);
    if (cleanup.removedSessions.length === 0) return;

    for (const session of cleanup.removedSessions) {
      requestRunnerRef.current?.cancelRequest?.(session.id);
      if (wsClientRef.current?.sessionId === session.id) closeManualWebSocketClientProxy("Source deleted", false);
    }

    setRequestSessions(cleanup.keptSessions);
    if (cleanup.activeSessionRemoved) {
      const replacementSession = cleanup.replacementSession;
      if (replacementSession) queueMicrotask(() => activateRequestSession(replacementSession));
      else queueMicrotask(clearActiveView);
    }
  }, [
    activeRequestId,
    activateRequestSession,
    boundProtoMethodKeys,
    clearActiveView,
    closeManualWebSocketClientProxy,
    collections,
    hydrated,
    loaded,
    requestSessions,
    setRequestSessions,
    wsClientRef,
  ]);

  const requestRunner = useRequestRunner({
    loaded,
    selectedMethod,
    requestJson,
    metadata,
    assertionJson,
    protoFiles: loaded?.protoFiles ?? protoFiles,
    requestSessions,
    activeSession: activeSession ?? undefined,
    activeRequestId,
    activeRequestIdRef,
    activeTransportMode,
    activeEnvironmentKey,
    activeBaseUrl,
    activeNativeTarget,
    targetDraft,
    activeCollectionRequest,
    responseTab,
    environments,
    setError,
    setEvents,
    setLastResult,
    setAssertionResults,
    setHistory,
    showToast,
    appendLiveEventToSession,
    upsertRequestSessionPreservingOrder,
    activateRequestSession,
    updateRequestSession,
    beforeRunRequest: flushRunningMockServersBeforeRequest,
  });
  requestRunnerRef.current = requestRunner;

  function stopDocumentationPage(page: UnifiedDocsPage) {
    if (page.kind !== "request") return;
    const session = requestSessions.find((item) => item.sourceRequestId === page.entityId || item.id === page.entityId);
    requestRunner.cancelRequest(session?.id);
  }

  async function runDocumentationPage(page: UnifiedDocsPage) {
    if (page.kind !== "request") return;
    for (const collection of collections) {
      const request = collection.requests.find((item) => item.id === page.entityId);
      if (!request) continue;
      const collectionRequest = { ...request, collectionName: collection.name };
      let method: RpcMethodInfo | undefined;
      if (request.kind === "grpc") {
        const compiled = request.grpc
          ? protoRuntimeRegistry.resolveVersion(request.grpc.libraryId, request.grpc.versionId)
          : null;
        const targetKey = request.grpc?.methodFullName ?? request.grpcMethodKey ?? "";
        method = (compiled?.loaded ?? loaded)?.methods.find((item) => methodKey(item) === targetKey);
        if (!method) {
          showToast("The request proto method cannot be resolved.", "warning");
          return;
        }
      }
      await requestRunner.runRequest({
        overrideMethod: method,
        overrideCollectionRequest: collectionRequest,
        overrideRequestJson: request.body || "{}",
        overrideMetadata: request.headers ?? [],
      });
      return;
    }
  }

  useEffect(() => {
    if (!compactViewport) return;
    setRequestResponseLayout("vertical");
  }, [compactViewport, setRequestResponseLayout]);

  const contextSidebarVisible = sidebarOpen && sideSection !== "source-control";
  const shellLeft = !compactViewport ? railWidth + (contextSidebarVisible ? sidebarWidthPx : 0) : 0;

  const viewDerived = useWorkbenchViewDerived({
    activeCollectionRequest,
    activeIsRest,
    activeIsWebSocket,
    activeTransportMode,
    currentExamples,
    draftEffectiveBaseUrl,
    draftEffectiveNativeTarget,
    events,
    hydrated,
    isNativeTransport,
    lastResult,
    loaded,
    metadata,
    requestJson,
    requestSessions,
    requestTab,
    selectedMethod,
    setRequestTab,
    targetDraft,
  });
  const {
    latestResponsePayload,
    messageEvents,
    previewUrl,
    reportPayload,
    requestFields,
    requestTabItems,
    responseFields,
    showEmptyWorkbench,
  } = viewDerived;

  function selectProtoLibraryVersion(libraryId: string, versionId: string) {
    const compiled = protoRuntimeRegistry.resolveVersion(libraryId, versionId);
    if (!compiled) {
      showToast("Proto library version could not be resolved.", "error");
      return;
    }
    if (compiled.library.lifecycle !== "archived" && compiled.version.lifecycle !== "archived") {
      setProtoLibraries((current) =>
        current.map((library) =>
          library.id === libraryId
            ? { ...library, defaultVersionId: versionId, updatedAt: new Date().toISOString() }
            : library,
        ),
      );
    }
    setActiveProtoLibraryId(libraryId);
    setActiveProtoVersionId(versionId);
    setProtoFiles(compiled.version.files);
    setLoaded(compiled.loaded);
  }

  function createProtoLibraryFromImport(name: string, versionLabel: string, files: ProtoSourceFile[]) {
    try {
      const nextLoaded = loadProtoFiles(files);
      const candidate = createProtoLibrary({ name, versionLabel, files });
      const importedChecksum = candidate.versions[0]?.checksum;
      const existing = protoLibraries.find((item) =>
        item.versions.some((version) => version.checksum === importedChecksum),
      );
      const targetLibrary = existing ?? candidate;
      if (!existing) setProtoLibraries((current) => [...current, candidate]);
      const targetVersion =
        targetLibrary.versions.find((version) => version.checksum === importedChecksum) ??
        targetLibrary.versions.find((version) => version.id === targetLibrary.defaultVersionId) ??
        targetLibrary.versions[0];
      let restoredCount = 0;
      let reviewCount = 0;
      if (targetVersion) {
        const restoration = restoreMissingGrpcReferencesForVersion({
          collections,
          library: targetLibrary,
          version: targetVersion,
        });
        restoredCount = restoration.restoredRequestIds.length;
        reviewCount = restoration.reviewRequestIds.length;
        if (restoredCount > 0) {
          setCollections(restoration.collections);
          syncRequestSessionsToCollections(restoration.collections);
        }
        const restoreRuntime = (binding: GrpcRequestBinding | undefined) => {
          if (!binding) return binding;
          return restoreMissingGrpcBinding({
            binding,
            library: targetLibrary,
            version: targetVersion,
            loaded: nextLoaded,
          }).binding;
        };
        setRequestSessions((current) => current.map((session) => ({ ...session, grpc: restoreRuntime(session.grpc) })));
        setMethodDocs((current) => current.map((doc) => ({ ...doc, grpc: restoreRuntime(doc.grpc) })));
        setDocResults((current) => current.map((snapshot) => ({ ...snapshot, grpc: restoreRuntime(snapshot.grpc) })));
        setMockServer((current) => ({
          ...current,
          methodBindings: Object.fromEntries(
            (Object.entries(current.methodBindings ?? {}) as Array<[string, GrpcRequestBinding]>).map(
              ([key, binding]) => [key, restoreRuntime(binding) ?? binding],
            ),
          ),
          updatedAt: new Date().toISOString(),
        }));
      }
      setActiveProtoLibraryId(targetLibrary.id);
      setActiveProtoVersionId(targetVersion?.id ?? "");
      const activeFiles = targetVersion?.files ?? files;
      setProtoFiles(activeFiles);
      setLoaded(nextLoaded);
      setProtoPreview([...activeFiles].sort((a, b) => a.name.localeCompare(b.name))[0] ?? null);
      setSideSection("proto-schemas");
      const restoredMessage =
        restoredCount > 0
          ? ` ${restoredCount} missing reference${restoredCount === 1 ? "" : "s"} restored${reviewCount > 0 ? `; ${reviewCount} need body review` : ""}.`
          : "";
      showToast(
        (existing
          ? `${targetLibrary.name} is already available in the global Proto Schemas registry.`
          : `${targetLibrary.name} added to global Proto Schemas.`) + restoredMessage,
        restoredCount > 0 ? "success" : existing ? "info" : "success",
      );
      return {
        library: targetLibrary,
        version: targetVersion,
        loaded: nextLoaded,
        method: nextLoaded.methods[0] ?? null,
      };
    } catch (error) {
      showToast(`Create global proto schema failed: ${toErrorMessage(error)}`, "error");
      throw error;
    }
  }

  function syncRequestSessionsToCollections(nextCollections: ApiCollection[]) {
    const requestById = new Map(
      nextCollections.flatMap((collection) =>
        collection.requests.map((request) => [request.id, { request, collectionName: collection.name }] as const),
      ),
    );
    setRequestSessions((current) =>
      current.map((session) => {
        const sourceRequestId =
          session.sourceRequestId ?? (requestById.has(session.methodKey) ? session.methodKey : undefined);
        const source = sourceRequestId ? requestById.get(sourceRequestId) : undefined;
        if (!source) return session;
        return {
          ...session,
          sourceRequestId,
          grpc: source.request.grpc,
          title: source.request.name,
          serviceName: source.collectionName,
          environmentKey: source.request.environmentKey ?? session.environmentKey,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  }

  function applyProtoVersionImportPlan(
    plan: ProtoVersionImportPlan,
    selectedRequestIds: ReadonlySet<string>,
    setAsDefault = true,
  ) {
    try {
      const next = applyProtoVersionImport({
        libraries: protoLibraries,
        collections,
        plan,
        selectedRequestIds,
        setAsDefault,
      });
      setProtoLibraries(next.libraries);
      setCollections(next.collections);
      syncRequestSessionsToCollections(next.collections);
      if (setAsDefault) {
        const nextLoaded = loadProtoFiles(plan.candidateVersion.files);
        setActiveProtoLibraryId(plan.libraryId);
        setActiveProtoVersionId(plan.candidateVersion.id);
        setProtoFiles(plan.candidateVersion.files);
        setLoaded(nextLoaded);
        setProtoPreview([...plan.candidateVersion.files].sort((a, b) => a.name.localeCompare(b.name))[0] ?? null);
        setSideSection("proto-schemas");
      }
      showToast(
        `${plan.candidateVersion.version} imported. ${selectedRequestIds.size} request${selectedRequestIds.size === 1 ? "" : "s"} updated.`,
        "success",
      );
    } catch (error) {
      showToast(`Import proto version failed: ${toErrorMessage(error)}`, "error");
      throw error;
    }
  }

  function activateProtoLifecycleSelection(libraries: ProtoLibrary[], nextLibraryId: string, nextVersionId: string) {
    setProtoLibraries(libraries);
    setActiveProtoLibraryId(nextLibraryId);
    setActiveProtoVersionId(nextVersionId);
    const next = findProtoVersion(libraries, nextLibraryId, nextVersionId);
    if (next) {
      const nextLoaded = loadProtoFiles(next.version.files);
      setProtoFiles(next.version.files);
      setLoaded(nextLoaded);
      setProtoPreview([...next.version.files].sort((a, b) => a.name.localeCompare(b.name))[0] ?? null);
      setSideSection("proto-schemas");
      return;
    }
    setProtoFiles([]);
    setLoaded(null);
    setProtoPreview(null);
  }

  function archiveProtoLibraryVersion(libraryId: string, versionId: string) {
    const result = archiveProtoVersion({ libraries: protoLibraries, libraryId, versionId });
    if (!result.ok) return result;
    activateProtoLifecycleSelection(result.libraries, result.nextLibraryId, result.nextVersionId);
    showToast("Proto revision archived. Existing references remain runnable.", "success");
    return { ...result, collections };
  }

  function restoreProtoLibraryVersion(libraryId: string, versionId: string) {
    const result = restoreProtoVersion({ libraries: protoLibraries, libraryId, versionId });
    if (!result.ok) return result;
    activateProtoLifecycleSelection(result.libraries, result.nextLibraryId, result.nextVersionId);
    showToast("Proto revision restored.", "success");
    return { ...result, collections };
  }

  function archiveGlobalProtoLibrary(libraryId: string) {
    const result = archiveProtoLibrary({ libraries: protoLibraries, libraryId });
    if (!result.ok) return result;
    activateProtoLifecycleSelection(result.libraries, result.nextLibraryId, result.nextVersionId);
    showToast("Proto schema archived. Existing references remain runnable.", "success");
    return { ...result, collections };
  }

  function restoreGlobalProtoLibrary(libraryId: string) {
    const result = restoreProtoLibrary({ libraries: protoLibraries, libraryId });
    if (!result.ok) return result;
    activateProtoLifecycleSelection(result.libraries, result.nextLibraryId, result.nextVersionId);
    showToast("Proto schema restored.", "success");
    return { ...result, collections };
  }

  function purgeProtoLibraryVersion(libraryId: string, versionId: string, referencePolicy: ProtoPurgeReferencePolicy) {
    const library = protoLibraries.find((item) => item.id === libraryId);
    const runtimeBindings: GrpcRequestBinding[] = [
      ...requestSessions.flatMap((session) => (session.grpc ? [session.grpc] : [])),
      ...methodDocs.flatMap((doc) => (doc.grpc ? [doc.grpc] : [])),
      ...docResults.flatMap((result) => (result.grpc ? [result.grpc] : [])),
      ...Object.values(mockServer.methodBindings ?? {}),
    ].filter((binding) => binding.libraryId === libraryId && binding.versionId === versionId);

    const replacement =
      referencePolicy.type === "move-compatible"
        ? findProtoVersion(protoLibraries, libraryId, referencePolicy.replacementVersionId)
        : null;
    const replacementBindingByIdentity = new Map<string, GrpcRequestBinding>();
    if (referencePolicy.type === "move-compatible") {
      if (!replacement) {
        return { ok: false as const, reason: "Select a valid replacement revision.", dependencies: [] };
      }
      const replacementLoaded = protoRuntimeRegistry.resolveVersion(
        replacement.library.id,
        replacement.version.id,
      )?.loaded;
      const unresolved = runtimeBindings.filter((binding) => {
        const method = replacementLoaded?.methods.find((item) => methodKey(item) === binding.methodFullName);
        if (!method) return true;
        const nextBinding = createPinnedGrpcBinding(replacement.library, replacement.version, method);
        if (binding.methodSignatureHash && nextBinding.methodSignatureHash !== binding.methodSignatureHash) {
          return true;
        }
        replacementBindingByIdentity.set(grpcBindingIdentity(binding, binding.methodFullName), nextBinding);
        return false;
      });
      if (unresolved.length > 0) {
        return {
          ok: false as const,
          reason: `${unresolved.length} open tab, mock, or docs binding(s) cannot be moved because the replacement method is missing or incompatible.`,
          dependencies: [],
        };
      }
    }

    const removesLibrary = (library?.versions.length ?? 0) <= 1;
    const replaceRuntimeBinding = (binding: GrpcRequestBinding | undefined) => {
      if (!binding || binding.libraryId !== libraryId || binding.versionId !== versionId) return binding;
      if (referencePolicy.type === "move-compatible") {
        return replacementBindingByIdentity.get(grpcBindingIdentity(binding, binding.methodFullName)) ?? binding;
      }
      return {
        ...binding,
        status: removesLibrary ? ("library-missing" as const) : ("version-missing" as const),
      };
    };

    const result = purgeProtoVersion({
      libraries: protoLibraries,
      collections,
      libraryId,
      versionId,
      referencePolicy,
    });
    if (!result.ok) return result;

    setCollections(result.collections);
    syncRequestSessionsToCollections(result.collections);
    setRequestSessions((current) =>
      current.map((session) => ({ ...session, grpc: replaceRuntimeBinding(session.grpc) })),
    );
    setMethodDocs((current) => current.map((doc) => ({ ...doc, grpc: replaceRuntimeBinding(doc.grpc) })));
    setDocResults((current) =>
      current.map((snapshot) => ({ ...snapshot, grpc: replaceRuntimeBinding(snapshot.grpc) })),
    );
    setMockServer((current) => ({
      ...current,
      methodBindings: Object.fromEntries(
        (Object.entries(current.methodBindings ?? {}) as Array<[string, GrpcRequestBinding]>).map(([key, binding]) => [
          key,
          replaceRuntimeBinding(binding) ?? binding,
        ]),
      ),
      updatedAt: new Date().toISOString(),
    }));
    activateProtoLifecycleSelection(result.libraries, result.nextLibraryId, result.nextVersionId);
    showToast(
      referencePolicy.type === "keep-unresolved"
        ? "Proto revision deleted. Existing references were kept unresolved."
        : "Proto revision deleted and compatible references were moved.",
      "success",
    );
    return result;
  }

  function purgeGlobalProtoLibrary(libraryId: string) {
    const markMissing = (binding: GrpcRequestBinding | undefined) =>
      binding?.libraryId === libraryId ? { ...binding, status: "library-missing" as const } : binding;
    const result = purgeProtoLibrary({ libraries: protoLibraries, collections, libraryId });
    if (!result.ok) return result;
    setCollections(result.collections);
    syncRequestSessionsToCollections(result.collections);
    setRequestSessions((current) => current.map((session) => ({ ...session, grpc: markMissing(session.grpc) })));
    setMethodDocs((current) => current.map((doc) => ({ ...doc, grpc: markMissing(doc.grpc) })));
    setDocResults((current) => current.map((snapshot) => ({ ...snapshot, grpc: markMissing(snapshot.grpc) })));
    setMockServer((current) => ({
      ...current,
      methodBindings: Object.fromEntries(
        (Object.entries(current.methodBindings ?? {}) as Array<[string, GrpcRequestBinding]>).map(([key, binding]) => [
          key,
          markMissing(binding) ?? binding,
        ]),
      ),
      updatedAt: new Date().toISOString(),
    }));
    activateProtoLifecycleSelection(result.libraries, result.nextLibraryId, result.nextVersionId);
    showToast("Proto schema deleted. Existing references were kept unresolved.", "success");
    return result;
  }

  function repairCollectionGrpcRequest(collectionId: string, requestId: string, candidate: ProtoRepairCandidate) {
    try {
      const nextCollections = repairGrpcRequestBinding({
        libraries: protoLibraries,
        collections,
        collectionId,
        requestId,
        candidate,
      });
      setCollections(nextCollections);
      syncRequestSessionsToCollections(nextCollections);
      showToast("gRPC schema reference updated.", "success");
    } catch (error) {
      showToast(`Schema reference update failed: ${toErrorMessage(error)}`, "error");
      throw error;
    }
  }

  function getProjectSnapshot(): ProjectData {
    return {
      version: 3,
      updatedAt: new Date().toISOString(),
      transportMode,
      baseUrl,
      nativeTarget,
      environmentKey,
      environments,
      protoFiles,
      protoLibraries,
      activeProtoLibraryId,
      activeProtoVersionId,
      collections,
      selectedMethodKey,
      requestJson,
      metadata,
      examples,
      methodDocs,
      docResults,
      documentation,
      assertionJson,
      history: history.slice(0, 50),
      mockServer,
      restMockServer,
      wsMockServer,
      requestTabs: requestSessions.map(compactRequestSessionForStorage),
      activeRequestId,
    };
  }

  function restoreExecutableGrpcTabs(
    sessions: RequestSession[],
    nextCollections: ApiCollection[],
    nextLoaded: LoadedProto | null,
  ): RequestSession[] {
    const restored = sessions.map((session): RequestSession => {
      if (session.requestKind !== "grpc" || !nextLoaded) return session;

      const collectionRequests = nextCollections.flatMap((collection) =>
        collection.requests.map((request) => ({ ...request, collectionName: collection.name })),
      );
      const persistedSourceRequestId = session.sourceRequestId ?? session.methodKey;
      const sessionIdentity = grpcBindingIdentity(session.grpc, session.grpc?.methodFullName ?? session.methodKey);
      const collectionRequest =
        collectionRequests.find((request) => request.id === persistedSourceRequestId) ??
        collectionRequests.find(
          (request) =>
            request.kind === "grpc" &&
            grpcBindingIdentity(request.grpc, request.grpc?.methodFullName ?? request.grpcMethodKey ?? "") ===
              sessionIdentity,
        ) ??
        null;
      const sourceRequestId = collectionRequest?.id ?? persistedSourceRequestId;
      const binding = session.grpc ?? collectionRequest?.grpc;
      const grpcMethodKey = binding?.methodFullName ?? collectionRequest?.grpcMethodKey ?? "";
      const grpcMethod = grpcMethodKey
        ? nextLoaded.methods.find((method) => methodKey(method) === grpcMethodKey)
        : null;

      return {
        ...session,
        methodKey: sourceRequestId,
        sourceRequestId,
        requestKind: "grpc",
        grpc: binding,
        title: collectionRequest?.name ?? session.title ?? grpcMethod?.methodName ?? "gRPC request",
        serviceName: collectionRequest?.collectionName ?? session.serviceName ?? grpcMethod?.serviceName,
        requestUrl: collectionRequest?.url ?? session.requestUrl,
        requestJson: session.requestJson?.trim() ? session.requestJson : (collectionRequest?.body ?? "{}"),
        metadata: session.metadata.length ? session.metadata : (collectionRequest?.headers ?? []),
        transportMode: session.transportMode === "native-grpc" ? "native-grpc" : "grpc-web",
        baseUrl: grpcMethod
          ? stripGrpcMethodPathFromUrl(session.baseUrl || collectionRequest?.url, grpcMethod, baseUrl)
          : session.baseUrl,
      };
    });

    const seenKeys = new Set<string>();
    return restored.filter((session) => {
      const key = session.methodKey || session.id;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
  }

  function protoRuntimeRegistryFor(libraries: ProtoLibrary[]): ProtoRuntimeRegistry {
    return new ProtoRuntimeRegistry(libraries);
  }

  function applyProject(project: ProjectData) {
    const nextProtoLibraries = normalizeProtoLibraries(project.protoLibraries, project.protoFiles);
    const activeProto = findProtoVersion(
      nextProtoLibraries,
      project.activeProtoLibraryId,
      project.activeProtoVersionId,
    );
    const nextProtoFiles = activeProto?.version.files ?? projectProtoFilesFromLibraries(nextProtoLibraries);
    let nextCollections = normalizeApiCollections(project.collections, nextProtoLibraries);
    const nextTabs = project.requestTabs ?? [];
    const nextActiveRequestId = nextTabs.some((session) => session.id === project.activeRequestId)
      ? (project.activeRequestId ?? "")
      : (nextTabs[0]?.id ?? "");

    setTransportMode(project.transportMode);
    setBaseUrl(project.baseUrl);
    setNativeTarget(project.nativeTarget);
    setEnvironmentKey(project.environmentKey ?? "default");
    setEnvironments(featureMergeEnvironments(project.environments));
    setProtoLibraries(nextProtoLibraries);
    setActiveProtoLibraryId(activeProto?.library.id ?? "");
    setActiveProtoVersionId(activeProto?.version.id ?? "");
    setProtoFiles(nextProtoFiles.length ? nextProtoFiles : project.protoFiles);
    setCollections(nextCollections);
    setMetadata(project.metadata.length ? project.metadata : defaultMetadata);
    setExamples(project.examples ?? []);
    setMethodDocs(project.methodDocs ?? []);
    setDocResults(project.docResults ?? []);
    setDocumentation(normalizeDocumentationState(project.documentation));
    setActiveDocumentationPageId("");
    setAssertionJson(project.assertionJson || defaultAssertion);
    setHistory(project.history ?? []);
    setMockServer(normalizeMockServerProject(project.mockServer));
    setRestMockServer(project.restMockServer ?? createDefaultRestMockProject());
    setWsMockServer(project.wsMockServer ?? createDefaultWebSocketMockProject());
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    setError("");

    if ((nextProtoFiles.length ? nextProtoFiles : project.protoFiles).length === 0) {
      setLoaded(null);
      setSelectedMethodKey("");
      setRequestSessions(nextTabs);
      setActiveRequestId(nextActiveRequestId);
      const activeSession = nextTabs.find((session) => session.id === nextActiveRequestId) ?? nextTabs[0];
      if (activeSession) activateRequestSession(activeSession);
      else setRequestJson(project.requestJson || "{}");
      return;
    }

    try {
      const result = activeProto
        ? (protoRuntimeRegistryFor(nextProtoLibraries).resolveVersion(activeProto.library.id, activeProto.version.id)
            ?.loaded ?? loadProtoFiles(activeProto.version.files))
        : loadProtoFiles(project.protoFiles);
      nextCollections = nextCollections.map((collection) => ({
        ...collection,
        requests: collection.requests.map((request) =>
          request.kind === "grpc"
            ? {
                ...request,
                grpc: hydrateLegacyGrpcBinding(request.grpc, request.grpcMethodKey, nextProtoLibraries, result.methods),
              }
            : request,
        ),
      }));
      setCollections(nextCollections);
      const restoredTabs = restoreExecutableGrpcTabs(nextTabs, nextCollections, result);
      const restoredActiveRequestId = restoredTabs.some((session) => session.id === project.activeRequestId)
        ? (project.activeRequestId ?? "")
        : (restoredTabs[0]?.id ?? "");

      setLoaded(result);
      setRequestSessions(restoredTabs);
      setActiveRequestId(restoredActiveRequestId);

      if (restoredTabs.length === 0) {
        activeRequestIdRef.current = "";
        setSelectedMethodKey("");
        setActiveCollectionRequestId("");
        setRequestJson(project.requestJson || "{}");
        setEvents([]);
        setLastResult(null);
        setAssertionResults([]);
        setResponseTab("messages");
        return;
      }

      const activeSession = restoredTabs.find((session) => session.id === restoredActiveRequestId) ?? restoredTabs[0];
      if (activeSession?.requestKind) {
        activateRequestSession(activeSession);
        return;
      }
      const preferredMethodKey = activeSession?.methodKey ?? project.selectedMethodKey;
      const method = result.methods.find((item) => methodKey(item) === preferredMethodKey) ?? result.methods[0];
      if (method) {
        setSelectedMethodKey(methodKey(method));
        if (activeSession) {
          activateRequestSession(activeSession);
        } else {
          setRequestJson(
            project.requestJson || JSON.stringify(generateExampleFromType(result.root, method.requestType), null, 2),
          );
        }
      } else {
        setSelectedMethodKey("");
        setRequestJson(project.requestJson || "{}");
      }
    } catch (err) {
      setLoaded(null);
      setSelectedMethodKey("");
      setRequestSessions(nextTabs);
      setActiveRequestId(nextActiveRequestId);
      setRequestJson(project.requestJson || "{}");
      setError(toErrorMessage(err));
    }
  }

  function showToast(message: string, severity: "info" | "success" | "warning" | "error" = "info") {
    setToast({ id: Date.now(), open: true, message, severity });
  }

  const uiActions = useWorkbenchUiActions({
    responseBodyRef,
    responseTab,
    setShowMessageTopButton,
    setPendingMessageCount,
    setThemeMode,
    themeMode,
  });
  const { handleResponseBodyScroll, scrollMessagesToTop, toggleTheme } = uiActions;

  const grpcMockEditorActions = useGrpcMockEditorActions({
    activeMethodKey: mockSelectedMethod ? methodKey(mockSelectedMethod) : "",
    applyProject,
    buildDefaultMockScenario,
    clamp,
    clearInheritedMockStreamOverridesForDefaultChange,
    clearMockServerLocalDirty,
    currentMockActiveScenario,
    currentMockEditorText,
    currentMockFile,
    currentMockScenarios,
    allMockScenarios,
    currentMockSelectedScenarioId,
    currentSingleScenarioEmptyEditorText,
    defaultMockPort,
    downloadTextFile,
    ensureUniqueMockScenarioId,
    formatMockScenarioBundle,
    formatSingleMockScenarioForEditor,
    generateRandomExampleFromType,
    getMockMethodScenarioFile,
    getProjectSnapshot,
    getWorkspaceExportBundle,
    loaded,
    markMockServerLocalDirty,
    mergeExternalScenarioScenariosIntoProject,
    methodKey,
    mockRuntimeAppliedSeqRef,
    mockRuntimeLastSyncSignatureRef,
    mockRuntimeUpdateSeqRef,
    mockScenarioDialogOpen,
    mockScenarioDraftId,
    mockScenarioEditing,
    mockScenarioEditorDraft,
    mockScenarioEditorDirty,
    mockScenarioInputRef,
    mockServer,
    mockServerRef,
    mockServerStatus,
    normalizeMockBindHost,
    normalizeMockPort,
    normalizeMockStreamSettings,
    parseAllMockScenarioFiles,
    parseExternalScenarioImportText,
    parseMockScenarioText,
    parseSingleMockScenarioText,
    persistProjectSnapshotNow,
    protoFiles,
    protoLibraries,
    protoRuntimeRegistry,
    setProtoLibraries,
    activeProtoLibraryId,
    activeProtoVersionId,
    refreshGrpcMockServerFromWorkspace,
    requestJson,
    resolveMockActiveScenarioIds,
    safeMockFileBaseName,
    safeMockScenarioRelativePath,
    selectMethod,
    selectedMethod: mockSelectedMethod,
    setMockScenarioDialogOpen,
    setMockScenarioDraftId,
    setMockScenarioEditing,
    setMockScenarioEditorDraft,
    setMockScenarioEditorDirty,
    setMockScenarioEditorError,
    setMockServer,
    setMockServerStatus,
    setWebAccessStatus,
    setMockSettingsOpen,
    setRequestTab,
    setSidebarOpen,
    setSideSection,
    setWorkspaceFolderPath,
    showToast,
    toErrorMessage,
    updateMockMethodScenarioFile,
    workspaceFolderPath,
    workspaceFolderStorageKey,
  });
  const {
    handleMockScenarioTextChange,
    handleMockPortChange,
    handleMockBindHostChange,
    handleGatewayModeChange,
    handleGatewayUpstreamChange,
    handleGatewayCaptureChange,
    handleGatewayListenSecurityChange,
    handleGatewayListenTlsPathChange,
    handleGatewayRequireClientCertificateChange,
    handleGrpcWebEnabledChange,
    handleGrpcWebHostChange,
    handleGrpcWebPortChange,
    handleGrpcWebSecurityChange,
    handleGrpcWebTlsPathChange,
    handleGrpcWebRequireClientCertificateChange,
    handleGrpcWebCorsOriginsChange,
    handleGrpcWebMaxConcurrentStreamsChange,
    handleGrpcWebHttp1FallbackChange,
    handleGatewaySecurityChange,
    handleGatewayTlsPathChange,
    handleGatewayRetryChange,
    handleGatewayProfileSelect,
    addGatewayProfile,
    deleteGatewayProfile,
    handleGatewayMethodBehaviorChange,
    saveGatewayCaptureAsMock,
    handleMockFormatChange,
    formatMockScenarioEditor,
    addMockScenarioFromCurrent,
    addMockScenarioForMethod,
    handleMockScenarioSelectChange,
    openMockScenarioManager,
    confirmRenameMockScenario,
    deleteEditingMockScenario,
    handleMockMethodEnabledChange,
    handleMockScenarioStreamSettingsChange,
    handleMockGlobalStreamBaseChange,
    importMockScenarioFile,
    exportMockScenarioFile,
    fetchMockScenarioFilesFromWorkspace,
    openMockScenarioFolder,
    startMockServer,
    stopMockServer,
    startWebAccess,
    stopWebAccess,
  } = grpcMockEditorActions;

  const handleResponseTabChange = useCallback(
    (value: ResponseTab) => {
      setResponseTab(value);
      if (activeRequestId) updateRequestSession(activeRequestId, { responseTab: value });
    },
    [activeRequestId],
  );

  const handleResponseFilterChange = useCallback((event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setResponseFilter(event.target.value);
  }, []);
  const clearResponseFilter = useCallback(() => setResponseFilter(""), []);
  const clearActiveResponseStable = useStableEventCallback(clearActiveResponse);

  const actionScope = {
    activeBaseUrl,
    activeCollectionRequest,
    activeCollectionRequestId,
    activeDocsResult,
    activeDocumentationPage,
    activeRequestDocumentationPage,
    standaloneDocumentationPage,
    activeDocumentationSource,
    activeDocumentationPageId,
    activeEnvironmentKey,
    activeExampleKey,
    activateRequestSession,
    activeIsRest,
    activeIsWebSocket,
    activeNativeTarget,
    activeRequestId,
    activeRequestIdRef,
    activeRestMockScenario,
    activeSession,
    activeTransportMode,
    activeWebSocketMockResponseText,
    activeWebSocketMockScenario,
    activeWebSocketMockScenarios,
    allMockScenarios,
    appendLiveEventToSession,
    assertionJson,
    assertionResults,
    baseUrl,
    benchmark,
    buildRestRequestUrl,
    calculateBenchmarkStats,
    clearActiveView,
    clearHistory,
    closeRequestSession,
    collectionNameDraft,
    collections,
    compactGrpcResultForStorage,
    compactRequestSessionForStorage,
    createDefaultRestMockProject,
    createDefaultWebSocketMockProject,
    createId,
    generateExampleFromType,
    buildGrpcWebUrl,
    methodKey,
    createRequestSession,
    createRestMockPresetScenario,
    createWebSocketMockScenarioForRequest,
    currentExamples,
    currentMockScenarios,
    currentRestDoc,
    currentWebSocketDoc,
    defaultRestMockResponse,
    defaultWebSocketMockResponse,
    docResults,
    downloadTextFile,
    draftEffectiveBaseUrl,
    draftEffectiveNativeTarget,
    envDialogMode,
    envDraftName,
    envDraftUrl,
    envDraftRestUrl,
    envDraftNativeTarget,
    envDraftGrpcWebUrl,
    envDraftWebSocketUrl,
    envEditingKey,
    environmentKey,
    environments,
    defaultEnvironments,
    examples,
    evaluateAssertions,
    eventToUiEvent,
    exampleInputRef,
    featureGetEnvironmentTransportTarget,
    featureMergeEnvironments,
    featureSetEnvironmentTransportTarget,
    findRestRequestForDocKey,
    findWebSocketRequestForDocKey,
    formatTimestampShort,
    grpcBaseUrlFallback,
    getProjectSnapshot,
    history,
    isSavedExample,
    isWebSocketUrl,
    lastResult,
    latestResultByMethod,
    loaded,
    mergeExamples,
    metadata,
    mockServer,
    methodDocs,
    nativeTarget,
    normalizeRestMockBindHost,
    normalizeRestMockPort,
    normalizeWebSocketMockPath,
    normalizeWebSocketMockPort,
    parsedMockConfig,
    patchActiveCollectionRequest,
    pendingCollectionImportRef,
    persistProjectSnapshotNow,
    previewUrl,
    protoFiles,
    protoLibraries,
    protoRuntimeRegistry,
    activeProtoLibraryId,
    activeProtoVersionId,
    protoInputRef,
    publishedDocs,
    renderMethodPublicationMarkdown,
    renderPublicDocsMarkdown,
    renderRestDocsMarkdown,
    renderWebSocketDocsMarkdown,
    renderWorkspaceProtoDocsHtml,
    renderWorkspaceProtoDocsMarkdown,
    reportPayload,
    requestJson,
    requestKindDraft,
    requestNameDraft,
    requestGrpcLibraryIdDraft,
    requestGrpcVersionIdDraft,
    requestGrpcMethodKeyDraft,
    requestRunner,
    requestSessions,
    requestTargetCollectionId,
    requestTargetFolderId,
    requestLocationEditable,
    responseTab,
    restDocKey,
    restMockScenarioId,
    restMockServer,
    restMockStatus,
    safeJsonParse,
    savedDocResultByMethod,
    savedExampleKey,
    selectMethod,
    selectedMethod,
    selectedMethodKey,
    setAssertionResults,
    setBaseUrl,
    setCollectionDialogOpen,
    setCollectionMenuAnchor,
    setCollectionNameDraft,
    setCollections,
    setProtoLibraries,
    setProtoPreview,
    setActiveProtoLibraryId,
    setActiveProtoVersionId,
    setDocResults,
    setDocsPreview,
    setEnvDialogMode,
    setEnvDialogOpen,
    setEnvDraftName,
    setEnvDraftUrl,
    setEnvDraftRestUrl,
    setEnvDraftNativeTarget,
    setEnvDraftGrpcWebUrl,
    setEnvDraftWebSocketUrl,
    setEnvEditingKey,
    setEnvMenuAnchor,
    setEnvironmentKey,
    setEnvironments,
    setError,
    setEvents,
    setExamples,
    setHistory,
    setLastResult,
    setLoaded,
    setMetadata,
    setMethodDocs,
    setNativeTarget,
    setRequestKindDraft,
    setRequestGrpcLibraryIdDraft,
    setRequestGrpcVersionIdDraft,
    setRequestGrpcMethodKeyDraft,
    setRequestNameDialogOpen,
    setRequestNameDraft,
    setRequestSessions,
    setRequestTab,
    setRequestTargetCollectionId,
    setRequestTargetFolderId,
    setRequestLocationEditable,
    setResponseTab,
    setRestMockScenarioId,
    setRestMockServer,
    setRestMockStatus,
    setSideSection,
    setSidebarOpen,
    setTargetDraft,
    setTransportMode,
    setWsBenchmarkResults,
    setWsBenchmarkRunning,
    setWsClientState,
    setWsMockScenarioId,
    setWsMockServer,
    setWsMockStatus,
    showToast,
    slugify,
    targetDraft,
    timestampForFile,
    toErrorMessage,
    transportMode,
    updateActiveSession,
    updateRequestSession,
    upsertRequestSessionPreservingOrder,
    upsertMethodDoc,
    webSocketDocKey,
    webSocketRequestPath,
    writeConsoleLog,
    wsBenchmarkAbortRef,
    wsBenchmarkIterations,
    wsBenchmarkResults,
    wsBenchmarkRunning,
    wsClientRef,
    wsMockScenarioId,
    wsMockServer,
    wsMockStatus,
  };

  const collectionActions = useCollectionActions(actionScope);
  const {
    openAddCollectionDialog,
    openAddCollectionRequestDialog,
    confirmAddCollection,
    confirmAddCollectionRequest,
    renameCollection,
    removeCollection,
    renameCollectionRequest,
    removeCollectionRequest,
    createCollectionFolder,
    renameCollectionFolder,
    removeCollectionFolder,
    moveCollectionTreeNode,
    selectCollectionRequest,
    importGrpcRequestIntoCollection,
    saveGrpcMethodToCollection,
    openGrpcMethodRequestDialog,
    addCollectionRequest,
  } = collectionActions;

  const workspaceIoActions = useWorkspaceIoActions({
    addCollectionRequest,
    applyProject,
    applyWorkspaceBundle,
    applyWorkspaceLayout,
    buildGrpcWebUrl,
    downloadTextFile,
    draftEffectiveBaseUrl,
    generateExampleFromType,
    getLayoutSnapshot,
    getProjectSnapshot,
    getWorkspaceExportBundle,
    isDocResultSnapshot,
    isMethodDoc,
    isProtoSourceFile,
    isSavedExample,
    layoutStorageKey,
    loadProtoFiles,
    loaded,
    looksLikeProjectData,
    mergeDocResults,
    mergeExamples,
    mergeExternalScenarioScenariosIntoProject,
    mergeMethodDocs,
    mergeProtoFiles,
    methodKey,
    normalizeProjectData,
    parseExternalScenarioImportText,
    parseExternalScenarioImportValue,
    parseSimpleYaml,
    pendingCollectionImportRef,
    projectInputRef,
    protoFiles,
    protoLibraries,
    protoRuntimeRegistry,
    activeProtoLibraryId,
    activeProtoVersionId,
    selectProtoLibraryVersion,
    protoFolderInputRef,
    protoInputRef,
    sampleProto,
    selectMethod,
    setAssertionResults,
    setError,
    setEvents,
    setExamples,
    setLastResult,
    setLoaded,
    setProtoFiles,
    setProtoLibraries,
    setProtoPreview,
    setActiveProtoLibraryId,
    setActiveProtoVersionId,
    setRequestJson,
    setSelectedMethodKey,
    setSideSection,
    setThemeMode,
    setWorkspaceFolderPath,
    setWorkspaceMenuAnchor,
    showToast,
    themeMode,
    timestampForFile,
    toErrorMessage,
    windowLocalStorageProjectStorageKey: projectStorageKey,
    workspaceFolderPath,
    workspaceFolderStorageKey,
  });
  const {
    createNewWorkspaceFolder,
    exportProject,
    handleProtoFiles,
    importWorkspaceFiles,
    loadSample,
    openProtoFolderImporter,
    openWorkspaceFolder,
    openWorkspaceImporter,
    removeProtoFile,
    saveWorkspaceFolder,
    saveWorkspaceFolderAs,
    saveWorkspaceLocally,
  } = workspaceIoActions;

  const environmentActions = useEnvironmentActions(actionScope);
  const {
    chooseEnvironment,
    openEnvironmentManager,
    bulkAddEnvironments,
    saveCurrentEnvironment,
    confirmSaveCurrentEnvironment,
    removeEditingEnvironment,
    handleTransportModeChange,
    handleTargetDraftChange,
    commitTargetDraft,
  } = environmentActions;

  const actionScopeWithCollection = {
    ...actionScope,
    ...collectionActions,
    ...environmentActions,
  };

  const requestRunnerActions = useRequestRunnerActions(actionScopeWithCollection);
  const {
    selectWebSocketMockScenario,
    updateActiveWebSocketMockScenario,
    updateActiveWebSocketMockResponse,
    updateWebSocketMockScenario,
    addWebSocketMockScenario,
    openWebSocketMockScenarioFromSidebar,
    handleWebSocketMockPortChange,
    copyActiveWebSocketMockResponse,
    updateWebSocketSubprotocol,
    updateActiveRestMockScenario,
    updateActiveRestMockResponse,
    addRestMockScenario,
    updateRestMockScenarioPair,
    addRestMockScenarioPair,
    removeRestMockScenarioPair,
    handleRestMockPortChange,
    handleRestMockBindHostChange,
    startRestMockServer,
    stopRestMockServer,
    startWebSocketMockServer,
    stopWebSocketMockServer,
    sendWebSocketMockOnce,
    closeManualWebSocketClient,
    handleConnectWebSocket,
    handleSendWebSocketMessage,
    exportCurrentBenchmark,
    runWebSocketBenchmark,
    stopWebSocketBenchmark,
    exportWebSocketBenchmark,
    runExample,
    copyPreviewUrl,
    exportResponse,
  } = requestRunnerActions;
  closeManualWebSocketClientRef.current = closeManualWebSocketClient;

  const exportResponseStable = useStableEventCallback(exportResponse);

  const docsActions = useDocsActions({
    ...actionScopeWithCollection,
    ...requestRunnerActions,
  });
  const {
    exportPublicDocs,
    exportGeneratedProtoDocsMarkdown,
    exportGeneratedProtoDocsHtml,
    previewCurrentMethodDoc,
    previewCurrentRestDoc,
    previewCurrentWebSocketDoc,
    publishCurrentRestDoc,
    publishCurrentWebSocketDoc,
    unpublishCurrentMethodDoc,
    unpublishCurrentRestDoc,
    unpublishCurrentWebSocketDoc,
    deleteCurrentMethodDoc,
    saveCurrentResultForDocs,
    openDocFromSidebar,
    unpublishMethodDoc,
    saveCurrentExample,
    exportCurrentMethodExamples,
    importExampleFile,
    loadExample,
    buildActiveRestDocsMarkdown,
    buildActiveWebSocketDocsMarkdown,
  } = docsActions;

  const saveCurrentResultForDocsStable = useStableEventCallback(saveCurrentResultForDocs);

  const viewContext = {
    Add,
    Alert,
    Api,
    AppBar,
    AppLogoIcon,
    Box,
    Button,
    Chip,
    ContentCopy,
    DarkMode,
    Delete,
    DesktopWindows,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    DocsIcon,
    Download,
    Edit,
    ExampleIcon,
    ExampleSidebar,
    ExamplesPanel,
    FeatureBenchmarkPanel,
    FeatureCodeTextField,
    UnifiedDocumentationPanel,
    UnifiedDocsSidebar,
    FeatureHistoryTable,
    FeatureJsonBlock,
    FeatureLatestResponseJsonViewer,
    FeatureMarkdownPreview,
    FeatureMessageTable,
    FeatureProtoSourceBlock,
    FeatureCollectionSidebar,
    FeatureSchemaTable,
    getWorkspaceExportBundle,
    FormControl,
    History,
    HistorySidebar,
    IconButton,
    InputAdornment,
    KeyboardArrowUp,
    Language,
    LightMode,
    ListItemText,
    Menu,
    MenuItem,
    MockServer,
    PanelBottom,
    PanelRight,
    Paper,
    PlayArrow,
    ProtoIcon,
    RailButton,
    RequestTabs,
    ResponseToolbar,
    ResponseWorkbenchTabs,
    RestDocsPanel,
    RestMockPanel,
    RestPairEditor,
    Search,
    Select,
    SidebarHeader,
    Snackbar,
    Stack,
    Switch,
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
    WebSocketMockSidebar,
    WindowControls,
    WorkbenchTabs,
    activateRequestSession,
    activeCollectionRequest,
    activeCollectionRequestId,
    activeDocKey,
    activeDocsResult,
    activeDocumentationPage,
    activeRequestDocumentationPage,
    standaloneDocumentationPage,
    activeDocumentationSource,
    activeDocumentationPageId,
    activeEnvironmentKey,
    activeExampleKey,
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
    addMockScenarioForMethod,
    addMockScenarioFromCurrent,
    addRestMockScenario,
    addRestMockScenarioPair,
    addRestPairRow,
    addWebSocketMockScenario,
    applyWorkspacePreference,
    beginResponseResize,
    resizeResponseByKeyboard,
    beginSidebarResize,
    benchmark,
    buildActiveRestDocsMarkdown,
    buildActiveWebSocketDocsMarkdown,
    buildAllDocumentation,
    checkDocumentationBuild,
    chooseCustomWorkspacePreference,
    chooseEnvironment,
    clearActiveResponseStable,
    clearHistory,
    clearResponseFilter,
    closeAllRequestSessions,
    closeManualWebSocketClient: closeManualWebSocketClientProxy,
    closeOtherRequestSessions,
    closeRequestSession,
    reorderRequestSessions,
    collectionDialogOpen,
    collectionMenuAnchor,
    collectionNameDraft,
    collections,
    colorTokens,
    commitTargetDraft,
    confirmAddCollection,
    confirmAddCollectionRequest,
    confirmRenameMockScenario,
    confirmSaveCurrentEnvironment,
    copyActiveWebSocketMockResponse,
    copyPreviewUrl,
    currentExamples,
    examples,
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
    documentation,
    documentationPages,
    deferredResponseFilter,
    deleteCurrentMethodDoc,
    deleteEditingMockScenario,
    designSystem,
    docsPreview,
    downloadTextFile,
    envDialogMode,
    envDialogOpen,
    envDraftName,
    envDraftUrl,
    envDraftRestUrl,
    envDraftNativeTarget,
    envDraftGrpcWebUrl,
    envDraftWebSocketUrl,
    envMenuAnchor,
    environments,
    events,
    exampleInputRef,
    exportCurrentBenchmark,
    exportCurrentMethodExamples,
    exportGeneratedProtoDocsHtml,
    exportGeneratedProtoDocsMarkdown,
    exportMockScenarioFile,
    fetchMockScenarioFilesFromWorkspace,
    exportProject,
    exportPublicDocs,
    exportResponseStable,
    exportWebSocketBenchmark,
    featureEnvironmentLabel,
    featureEnvironmentShortLabel,
    featureGetEnvironmentTransportTarget,
    formatMockScenarioEditor,
    generateRandomRequestJson,
    generateRequestJsonFromSelectedScenario,
    handleMockBindHostChange,
    handleGatewayModeChange,
    handleGatewayUpstreamChange,
    handleGatewayCaptureChange,
    handleGatewayListenSecurityChange,
    handleGatewayListenTlsPathChange,
    handleGatewayRequireClientCertificateChange,
    handleGrpcWebEnabledChange,
    handleGrpcWebHostChange,
    handleGrpcWebPortChange,
    handleGrpcWebSecurityChange,
    handleGrpcWebTlsPathChange,
    handleGrpcWebRequireClientCertificateChange,
    handleGrpcWebCorsOriginsChange,
    handleGrpcWebMaxConcurrentStreamsChange,
    handleGrpcWebHttp1FallbackChange,
    handleGatewaySecurityChange,
    handleGatewayTlsPathChange,
    handleGatewayRetryChange,
    handleGatewayProfileSelect,
    addGatewayProfile,
    deleteGatewayProfile,
    handleGatewayMethodBehaviorChange,
    saveGatewayCaptureAsMock,
    handleMockFormatChange,
    handleMockGlobalStreamBaseChange,
    handleMockMethodEnabledChange,
    handleMockPortChange,
    handleMockScenarioSelectChange,
    handleMockScenarioStreamSettingsChange,
    handleMockScenarioTextChange,
    handleProtoFiles,
    handleRequestJsonChange,
    handleResponseBodyScroll,
    handleResponseFilterChange,
    handleResponseTabChange,
    handleRestMockBindHostChange,
    handleRestMockPortChange,
    handleConnectWebSocket,
    handleSendWebSocketMessage,
    handleTargetDraftChange,
    handleTransportModeChange,
    handleWebSocketMockPortChange,
    iconButtonSx,
    importExampleFile,
    importGrpcRequestIntoCollection,
    saveGrpcMethodToCollection,
    openGrpcMethodRequestDialog,
    importMockScenarioFile,
    importWorkspaceFiles,
    isNativeBridgeAvailable,
    lastResult,
    latestResponsePayload,
    loadExample,
    loadSample,
    loaded,
    messageEvents,
    metadata,
    methodTypeLabel,
    minResponseHeight,
    minResponseWidth,
    mockMappingRows,
    mockSelectedMethod,
    mockSelectedMethodKey,
    setMockSelectedMethodKey,
    mockScenarioDialogOpen,
    mockScenarioDraftId,
    mockScenarioEditing,
    mockScenarioEditorDirty,
    mockScenarioEditorError,
    mockScenarioInputRef,
    mockServer,
    setMockServer,
    mockServerStatus,
    webAccessStatus,
    mockSettingsOpen,
    openAddCollectionDialog,
    openAddCollectionRequestDialog,
    openDocFromSidebar,
    openDocumentationPage,
    openDocumentationRequest,
    openDocumentationSite,
    openDocumentationWikiExport,
    openEnvironmentManager,
    bulkAddEnvironments,
    openMockScenarioFolder,
    openMockScenarioManager,
    openProtoFolderImporter,
    openWebSocketMockScenarioFromSidebar,
    createNewWorkspaceFolder,
    openWorkspaceFolder,
    openWorkspaceImporter,
    paletteMode,
    panelSx,
    parsedMockConfig,
    prettifyRequestJson,
    previewCurrentMethodDoc,
    previewCurrentRestDoc,
    previewCurrentWebSocketDoc,
    previewUrl,
    projectInputRef,
    protoFiles,
    protoLibraries,
    protoRuntimeRegistry,
    activeProtoLibraryId,
    activeProtoVersionId,
    selectProtoLibraryVersion,
    createProtoLibraryFromImport,
    applyProtoVersionImportPlan,
    archiveProtoLibraryVersion,
    restoreProtoLibraryVersion,
    purgeProtoLibraryVersion,
    archiveGlobalProtoLibrary,
    restoreGlobalProtoLibrary,
    purgeGlobalProtoLibrary,
    repairCollectionGrpcRequest,
    protoFolderInputRef,
    protoInputRef,
    protoPreview,
    publishCurrentRestDoc,
    publishCurrentWebSocketDoc,
    publishDocumentationPage,
    publishedDocs,
    railWidth,
    collectionFilter,
    removeCollection,
    removeCollectionRequest,
    createCollectionFolder,
    renameCollectionFolder,
    removeCollectionFolder,
    moveCollectionTreeNode,
    removeEditingEnvironment,
    removeMetadataRow,
    setAuthorizationMetadata,
    removeProtoFile,
    removeRestMockScenarioPair,
    removeRestPairRow,
    renameCollection,
    renameCollectionRequest,
    reportPayload,
    requestFields,
    requestJson,
    requestKindDraft,
    requestGrpcLibraryIdDraft,
    requestGrpcVersionIdDraft,
    requestGrpcMethodKeyDraft,
    requestTargetCollectionId,
    requestTargetFolderId,
    requestLocationEditable,
    requestNameDialogOpen,
    requestNameDraft,
    requestResponseLayout,
    setRequestResponseLayout,
    requestRunner,
    requestSessions,
    requestTab,
    requestTabItems,
    responseBodyRef,
    responseFields,
    responseFilter,
    responseSearchScope,
    setResponseSearchScope,
    pendingMessageCount,
    setPendingMessageCount,
    responseHeight,
    responseTab,
    responseWidth,
    restMethods,
    restMockServer,
    restMockStatus,
    runDocumentationPage,
    stopDocumentationPage,
    runExample,
    runWebSocketBenchmark,
    saveCurrentEnvironment,
    saveCurrentExample,
    saveCurrentResultForDocs,
    saveCurrentResultForDocsStable,
    saveDocumentationSource,
    saveWorkspaceFolder,
    saveWorkspaceFolderAs,
    saveWorkspaceLocally,
    savedExampleKey,
    scrollMessagesToTop,
    selectCollectionRequest,
    selectMethod,
    selectWebSocketMockScenario,
    selectedMethod,
    selectedMethodKey,
    sendWebSocketMockOnce,
    setCollectionDialogOpen,
    setCollectionMenuAnchor,
    setCollectionNameDraft,
    setDocsPreview,
    setActiveDocumentationPageId,
    setEnvDialogOpen,
    setEnvDraftName,
    setEnvDraftUrl,
    setEnvDraftRestUrl,
    setEnvDraftNativeTarget,
    setEnvDraftGrpcWebUrl,
    setEnvDraftWebSocketUrl,
    setEnvMenuAnchor,
    setEnvironmentKey,
    setExamples,
    setMockScenarioDialogOpen,
    setMockScenarioDraftId,
    setMockSettingsOpen,
    setNativeTarget,
    setProtoPreview,
    setCollectionFilter,
    setRequestNameDialogOpen,
    setRequestNameDraft,
    setRequestKindDraft,
    setRequestGrpcLibraryIdDraft,
    setRequestGrpcVersionIdDraft,
    setRequestGrpcMethodKeyDraft,
    setRequestTargetCollectionId,
    setRequestTargetFolderId,
    setRequestLocationEditable,
    setRequestTab,
    setTargetDraft,
    setTransportMode,
    setRestMockScenarioId,
    setSideSection,
    setSidebarOpen,
    setSidebarWidthPx,
    setToast,
    setWorkspaceMenuAnchor,
    setWsBenchmarkIterations,
    shellLeft,
    showEmptyWorkbench,
    showMessageTopButton,
    serviceProtocol,
    servicesSection,
    settingsSection,
    compactViewport,
    setServiceProtocol,
    setServicesSection,
    setSettingsSection,
    sideSection,
    sidebarOpen,
    sidebarWidthPx,
    slugify,
    startMockServer,
    startWebAccess,
    startRestMockServer,
    startWebSocketMockServer,
    stopMockServer,
    stopWebAccess,
    stopRestMockServer,
    stopWebSocketBenchmark,
    stopWebSocketMockServer,
    targetDraft,
    themeMode,
    densityMode,
    setWorkbenchDensity,
    timestampForFile,
    toast,
    toggleRequestResponseLayout,
    toggleTheme,
    transportTargetLabel,
    transportTargetPlaceholder,
    unpublishCurrentMethodDoc,
    unpublishCurrentRestDoc,
    unpublishCurrentWebSocketDoc,
    unpublishMethodDoc,
    updateDocumentationSettings,
    updateActiveRestAuth,
    updateActiveRestBodyType,
    updateActiveRestMethod,
    updateActiveRestMockResponse,
    updateActiveRestMockScenario,
    updateActiveWebSocketMockResponse,
    updateActiveWebSocketMockScenario,
    updateActiveSession,
    updateMetadataRow,
    updateRestMockScenarioPair,
    updateRestPairRow,
    updateWebSocketMockScenario,
    updateWebSocketSubprotocol,
    webSocketSubprotocolValue,
    certificateDraft,
    certificateInfo,
    certificateSettingsOpen,
    appZoomInfo,
    clearCertificateSettingsPem,
    clearLogFiles,
    importCertificateSettingsFile,
    removeCertificateSettingsItem,
    loggerDraft,
    loggerInfo,
    loggerLevelOptions,
    loggerSettingsOpen,
    openCertificateSettings,
    openLogFolder,
    openLoggerSettings,
    refreshCertificateSettings,
    refreshLoggerSettings,
    resetAppZoomLevel,
    saveCertificateSettings,
    saveLoggerSettings,
    setCertificateDraft,
    setCertificateSettingsOpen,
    setLoggerDraft,
    setLoggerSettingsOpen,
    workspaceFolderPath,
    workspaceMenuAnchor,
    zoomAppIn,
    zoomAppOut,
    workspaceSetupDefaultPath,
    workspaceSetupOpen,
    workspaceSetupPending,
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
    wsMockSidebarRows,
    wsMockStatus,
    wsMockStreamOnConnect,
  };

  return { theme, viewContext };
}

export type WorkbenchViewContext = ReturnType<typeof useWorkbenchContainerModel>["viewContext"];
