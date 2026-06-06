"use client";

import { type ChangeEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { BenchmarkPanel as FeatureBenchmarkPanel, calculateBenchmarkStats } from "../benchmark/benchmark-panel";
import {
  DocsSidebar as FeatureDocsSidebar,
  MarkdownPreview as FeatureMarkdownPreview,
  MethodDocsPanel as FeatureMethodDocsPanel,
} from "../docs-publisher/docs-publisher-panel";
import {
  buildLatestResultByMethod,
  buildPublishableDocs,
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
import {
  buildEndpointGroups as buildFeatureEndpointGroups,
  ProtoSourceBlock as FeatureProtoSourceBlock,
  RegistryPanel as FeatureRegistryPanel,
} from "../proto-registry/proto-registry-panel";
import {
  CodeTextField as FeatureCodeTextField,
  SchemaTable as FeatureSchemaTable,
} from "../request-editor/request-editor-panels";
import { ExamplesPanel } from "../examples/examples-panel";
import { MockServerPanel, MockServerSettingsDialog, MockServerSidebar } from "../mock-server/mock-server-panels";
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
import { toErrorMessage } from "../../shared/error-utils";
import { formatTimestampShort, timestampForFile } from "../../shared/formatters";
import { safeJsonParse } from "../../shared/json-utils";
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
import { useMockRuntimeSync } from "../mock-server/use-mock-runtime-sync";
import { useMockWorkspaceSync, useWorkspaceFolderAutosave } from "../mock-server/use-mock-workspace-sync";
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
  SideSection,
  TransportMode,
  WebSocketMockProject,
  WebSocketMockScenario,
  RestMockScenario,
} from "../../shared/workbench-types";
import type { LoadedProto, MetadataPair, ProtoSourceFile } from "@/lib/types";

type RequestRunnerHandle = ReturnType<typeof useRequestRunner>;

const MOCK_RUNTIME_SYNC_DELAY_MS = 120;
const WORKSPACE_AUTOSAVE_DELAY_MS = 1400;
const MOCK_WORKSPACE_REFRESH_INTERVAL_MS = 600;
const MOCK_LOCAL_DIRTY_FALLBACK_MS = 8000;
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
  const [hydrated, setHydrated] = useState(false);
  const [sideSection, setSideSection] = useState<SideSection>("registry");
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
  const [baseUrl, setBaseUrl] = useState("http://localhost:9080/grpc/web");
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
  } = environmentController;
  const [protoFiles, setProtoFiles] = useState<ProtoSourceFile[]>([]);
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const [loaded, setLoaded] = useState<LoadedProto | null>(null);
  const [selectedMethodKey, setSelectedMethodKey] = useState("");
  const [activeCollectionRequestId, setActiveCollectionRequestId] = useState("");
  const [requestJson, setRequestJson] = useState("{}");
  const [metadata, setMetadata] = useState<MetadataPair[]>(defaultMetadata);
  const [examples, setExamples] = useState<SavedExample[]>([]);
  const [methodDocs, setMethodDocs] = useState<MethodDoc[]>([]);
  const [docResults, setDocResults] = useState<DocResultSnapshot[]>([]);
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
  const initialMockWorkspaceRefreshPathRef = useRef("");
  const closeManualWebSocketClientProxy = useCallback((reason = "Closed by user", notify = true) => {
    closeManualWebSocketClientRef.current(reason, notify);
  }, []);
  const [registryFilter, setRegistryFilter] = useState("");
  const deferredRegistryFilter = useDeferredValue(registryFilter);
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
    requestTargetCollectionId,
    setRequestTargetCollectionId,
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
    mockSettingsOpen,
    setMockSettingsOpen,
    mockScenarioEditorDraft,
    setMockScenarioEditorDraft,
    mockScenarioDialogOpen,
    setMockScenarioDialogOpen,
    mockScenarioEditing,
    setMockScenarioEditing,
    mockScenarioDraftId,
    setMockScenarioDraftId,
    mockRuntimeUpdateSeqRef,
    mockRuntimeAppliedSeqRef,
    mockRuntimeLastSyncSignatureRef,
    markMockServerLocalDirty,
    clearMockServerLocalDirty,
    isMockServerLocalDirty,
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
      sidebarOpen,
      sidebarWidthPx,
      responseHeight,
      responseWidth,
      requestResponseLayout,
      themeMode,
    ],
  });

  useMockWorkspaceSync({
    enabled: hydrated,
    workspaceFolderPath,
    refreshIntervalMs: MOCK_WORKSPACE_REFRESH_INTERVAL_MS,
    isMockServerLocalDirty,
    workspaceAutosaveRef,
    refreshGrpcMockServerFromWorkspace,
  });

  useMockRuntimeSync({
    delayMs: MOCK_RUNTIME_SYNC_DELAY_MS,
    mockServer,
    mockServerStatus,
    setMockServerStatus,
    loaded,
    protoFiles,
    workspaceFolderPath,
    updateSeqRef: mockRuntimeUpdateSeqRef,
    appliedSeqRef: mockRuntimeAppliedSeqRef,
    lastSyncSignatureRef: mockRuntimeLastSyncSignatureRef,
  });

  useEffect(() => {
    if (!hydrated || !workspaceFolderPath || initialMockWorkspaceRefreshPathRef.current === workspaceFolderPath) return;
    initialMockWorkspaceRefreshPathRef.current = workspaceFolderPath;
    void refreshGrpcMockServerFromWorkspace({ silent: true, respectLocalDirty: false });
  }, [hydrated, workspaceFolderPath, refreshGrpcMockServerFromWorkspace]);

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
    if (!hydrated || !loaded || !activeRequestId) return;
    const session = requestSessions.find((item) => item.id === activeRequestId);
    if (!session) return;

    const collectionGrpcRequest =
      session.requestKind === "grpc" ? findCollectionRequestById(collections, session.methodKey) : null;
    const grpcMethodKey = collectionGrpcRequest?.grpcMethodKey ?? (!session.requestKind ? session.methodKey : "");
    if (!grpcMethodKey) return;

    const grpcMethod = loaded.methods.find((method) => methodKey(method) === grpcMethodKey);
    if (!grpcMethod) return;

    if (selectedMethodKey !== grpcMethodKey || activeCollectionRequestId) {
      setSelectedMethodKey(grpcMethodKey);
      setActiveCollectionRequestId("");
    }

    if (session.requestKind === "grpc" || session.methodKey !== grpcMethodKey) {
      const nextSession: RequestSession = {
        ...session,
        methodKey: grpcMethodKey,
        title: grpcMethod.methodName,
        serviceName: grpcMethod.serviceName,
        requestKind: undefined,
        requestUrl: undefined,
        httpMethod: undefined,
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

  const theme = useWorkbenchTheme(themeMode);

  const activeSession = useMemo(
    () => requestSessions.find((session) => session.id === activeRequestId) ?? null,
    [requestSessions, activeRequestId],
  );

  const selectedMethod = useMemo(() => {
    if (!loaded || !selectedMethodKey) return null;
    return loaded.methods.find((method) => methodKey(method) === selectedMethodKey) ?? null;
  }, [loaded, selectedMethodKey]);

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
      (scenario) =>
        scenario.requestId === activeCollectionRequest.id || scenario.id === activeCollectionRequest.id,
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
      (scenario) =>
        scenario.requestId === activeCollectionRequest.id || scenario.id === activeCollectionRequest.id,
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
      .filter(
        (scenario) => !scenario.requestId || wsRequests.some((request) => request.id === scenario.requestId),
      )
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
      .filter(
        (scenario) => !scenario.requestId || restRequests.some((request) => request.id === scenario.requestId),
      )
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
  const currentMethodDoc = useMemo(
    () => (activeMethodKey ? getOrCreateMethodDoc(methodDocs, selectedMethod) : null),
    [methodDocs, selectedMethod, activeMethodKey],
  );
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
    ? (savedDocResultByMethod.get(activeMethodKey) ?? latestResultByMethod.get(activeMethodKey) ?? null)
    : null;
  const parsedMockConfig = useMemo(
    () => parseAllMockScenarioFiles(mockServer, loaded?.methods ?? []),
    [mockServer, loaded],
  );
  const allMockScenarios = parsedMockConfig.ok ? parsedMockConfig.bundle.scenarios : [];
  const publishedDocs = useMemo(() => {
    const grpcDocs = buildPublishableDocs(
      loaded?.methods ?? [],
      methodDocs,
      examples,
      protoFiles,
      savedDocResultByMethod,
      allMockScenarios,
    );
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
        return {
          ...doc,
          serviceName: request.collectionName ?? doc.serviceName,
          methodName: request.name,
          generatedMarkdown: renderRestDocsMarkdown({
            collectionRequest: request,
            url: session?.requestUrl || buildRestRequestUrl(request, session?.baseUrl || request.url),
            latestResult: session?.lastResult ?? null,
          }),
        };
      });
    return [...grpcDocs, ...wsDocs, ...restDocs];
  }, [
    loaded,
    methodDocs,
    examples,
    protoFiles,
    savedDocResultByMethod,
    allMockScenarios,
    collections,
    requestSessions,
  ]);
  const currentMockFile = useMemo(
    () => getMockMethodScenarioFile(mockServer, selectedMethod),
    [mockServer, selectedMethod],
  );
  const currentMockParse = useMemo(
    () => parseMockScenarioText(currentMockFile.scenarioText, currentMockFile.format, mockServer.port),
    [currentMockFile.scenarioText, currentMockFile.format, mockServer.port],
  );
  const currentMockScenarios = useMemo(() => {
    if (!selectedMethod || !currentMockParse.ok) return [];
    return currentMockParse.bundle.scenarios.filter(
      (scenario) =>
        scenario.service === selectedMethod.serviceName && scenario.method === selectedMethod.methodName,
    );
  }, [selectedMethod, currentMockParse]);
  const currentMockActiveScenario = useMemo(
    () =>
      getActiveScenarioForMethod(
        currentMockParse.ok ? currentMockParse.bundle.scenarios : [],
        selectedMethod,
        mockServer.selectedScenarioIds,
      ),
    [currentMockParse, selectedMethod, mockServer.selectedScenarioIds],
  );
  const currentMockSelectedScenarioId = currentMockActiveScenario?.id ?? currentMockScenarios[0]?.id ?? "";

  useEffect(() => {
    if (!hydrated || !selectedMethod || currentMockScenarios.length === 0) return;
    const key = methodKey(selectedMethod);
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
    selectedMethod,
    currentMockScenarios,
    currentMockActiveScenario,
    mockServer.selectedScenarioIds,
    setMockServer,
  ]);

  const currentMockEditorKey = selectedMethod
    ? `${methodKey(selectedMethod)}:${currentMockSelectedScenarioId || "new"}:${currentMockFile.format}`
    : "";
  const currentMockEditorText = useMemo(() => {
    if (!selectedMethod) return currentFileEmptyEditorText(currentMockFile.format);
    if (
      mockScenarioEditorDraft &&
      mockScenarioEditorDraft.methodKey === methodKey(selectedMethod) &&
      mockScenarioEditorDraft.scenarioId === currentMockSelectedScenarioId &&
      mockScenarioEditorDraft.format === currentMockFile.format
    ) {
      return mockScenarioEditorDraft.text;
    }
    const scenario = currentMockActiveScenario ?? currentMockScenarios[0] ?? null;
    return scenario
      ? formatSingleMockScenarioForEditor(scenario, currentMockFile.format)
      : currentSingleScenarioEmptyEditorText(selectedMethod, currentMockFile.format);
  }, [
    selectedMethod,
    currentMockFile.format,
    mockScenarioEditorDraft,
    currentMockSelectedScenarioId,
    currentMockActiveScenario,
    currentMockScenarios,
  ]);
  const currentMockEditorParse = useMemo(
    () => parseSingleMockScenarioText(currentMockEditorText, currentMockFile.format, mockServer.port, selectedMethod),
    [currentMockEditorText, currentMockFile.format, mockServer.port, selectedMethod],
  );
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

  const endpointGroups = useMemo(() => {
    if (!loaded) return [];
    return buildFeatureEndpointGroups(loaded.methods, protoFiles, deferredRegistryFilter);
  }, [loaded, protoFiles, deferredRegistryFilter]);

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
        setMockServerStatus((current) => (current.running ? { ...current, ...result } : current));
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
    protoFiles,
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
    setMetadata,
    setNativeTarget,
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

    const cleanup = cleanupRequestSessionsForDeletedSources(
      requestSessions,
      activeRequestId,
      buildRequestSessionSourceIndex(collections, loaded?.methods ?? []),
    );
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
    protoFiles,
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
  });
  requestRunnerRef.current = requestRunner;
  const shellLeft = railWidth + (sidebarOpen ? sidebarWidthPx : 0);

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

  function getProjectSnapshot(): ProjectData {
    return {
      version: 2,
      updatedAt: new Date().toISOString(),
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

      const collectionRequest =
        findCollectionRequestById(nextCollections, session.methodKey) ??
        nextCollections
          .flatMap((collection) =>
            collection.requests.map((request) => ({ ...request, collectionName: collection.name })),
          )
          .find((request) => request.kind === "grpc" && request.grpcMethodKey === session.methodKey) ??
        null;
      const grpcMethodKey = collectionRequest?.grpcMethodKey ?? session.methodKey;
      if (!grpcMethodKey) return session;

      const grpcMethod = nextLoaded.methods.find((method) => methodKey(method) === grpcMethodKey);
      if (!grpcMethod) return session;

      return {
        ...session,
        methodKey: grpcMethodKey,
        title: session.title || grpcMethod.methodName,
        serviceName: grpcMethod.serviceName,
        requestKind: undefined,
        requestUrl: undefined,
        httpMethod: undefined,
        requestJson: session.requestJson?.trim() ? session.requestJson : (collectionRequest?.body ?? "{}"),
        metadata: session.metadata.length ? session.metadata : (collectionRequest?.headers ?? []),
        transportMode: session.transportMode === "native-grpc" ? "native-grpc" : "grpc-web",
        baseUrl: stripGrpcMethodPathFromUrl(session.baseUrl || collectionRequest?.url, grpcMethod, baseUrl),
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

  function applyProject(project: ProjectData) {
    const nextCollections = normalizeApiCollections(project.collections);
    const nextTabs = project.requestTabs ?? [];
    const nextActiveRequestId = nextTabs.some((session) => session.id === project.activeRequestId)
      ? (project.activeRequestId ?? "")
      : (nextTabs[0]?.id ?? "");

    setTransportMode(project.transportMode);
    setBaseUrl(project.baseUrl);
    setNativeTarget(project.nativeTarget);
    setEnvironmentKey(project.environmentKey ?? "default");
    setEnvironments(featureMergeEnvironments(project.environments));
    setProtoFiles(project.protoFiles);
    setCollections(nextCollections);
    setMetadata(project.metadata.length ? project.metadata : defaultMetadata);
    setExamples(project.examples ?? []);
    setMethodDocs(project.methodDocs ?? []);
    setDocResults(project.docResults ?? []);
    setAssertionJson(project.assertionJson || defaultAssertion);
    setHistory(project.history ?? []);
    setMockServer(normalizeMockServerProject(project.mockServer));
    setRestMockServer(project.restMockServer ?? createDefaultRestMockProject());
    setWsMockServer(project.wsMockServer ?? createDefaultWebSocketMockProject());
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    setError("");

    if (project.protoFiles.length === 0) {
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
      const result = loadProtoFiles(project.protoFiles);
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
    setThemeMode,
    themeMode,
  });
  const { handleResponseBodyScroll, scrollMessagesToTop, toggleTheme } = uiActions;

  const grpcMockEditorActions = useGrpcMockEditorActions({
    activeMethodKey,
    applyProject,
    buildDefaultMockScenario,
    clamp,
    clearInheritedMockStreamOverridesForDefaultChange,
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
    mockRuntimeLastSyncSignatureRef,
    mockScenarioDialogOpen,
    mockScenarioDraftId,
    mockScenarioEditing,
    mockScenarioEditorDraft,
    mockScenarioInputRef,
    mockServer,
    normalizeMockBindHost,
    normalizeMockPort,
    normalizeMockStreamSettings,
    parseAllMockScenarioFiles,
    parseExternalScenarioImportText,
    parseMockScenarioText,
    parseSingleMockScenarioText,
    protoFiles,
    refreshGrpcMockServerFromWorkspace,
    requestJson,
    resolveMockActiveScenarioIds,
    safeMockFileBaseName,
    safeMockScenarioRelativePath,
    selectMethod,
    selectedMethod,
    setMockScenarioDialogOpen,
    setMockScenarioDraftId,
    setMockScenarioEditing,
    setMockScenarioEditorDraft,
    setMockServer,
    setMockServerStatus,
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
    openMockScenarioFolder,
    startMockServer,
    stopMockServer,
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
    requestRunner,
    requestSessions,
    requestTargetCollectionId,
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
    setDocResults,
    setDocsPreview,
    setEnvDialogMode,
    setEnvDialogOpen,
    setEnvDraftName,
    setEnvDraftUrl,
    setEnvEditingKey,
    setEnvMenuAnchor,
    setEnvironmentKey,
    setEnvironments,
    setError,
    setEvents,
    setExamples,
    setHistory,
    setLastResult,
    setMetadata,
    setMethodDocs,
    setNativeTarget,
    setRequestKindDraft,
    setRequestNameDialogOpen,
    setRequestNameDraft,
    setRequestSessions,
    setRequestTab,
    setRequestTargetCollectionId,
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
    selectCollectionRequest,
    importGrpcRequestIntoCollection,
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
    FeatureDocsSidebar,
    FeatureHistoryTable,
    FeatureJsonBlock,
    FeatureLatestResponseJsonViewer,
    FeatureMarkdownPreview,
    FeatureMessageTable,
    FeatureMethodDocsPanel,
    FeatureProtoSourceBlock,
    FeatureRegistryPanel,
    FeatureSchemaTable,
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
    MockServerPanel,
    MockServerSettingsDialog,
    MockServerSidebar,
    PanelBottom,
    PanelRight,
    Paper,
    PlayArrow,
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
    beginSidebarResize,
    benchmark,
    buildActiveRestDocsMarkdown,
    buildActiveWebSocketDocsMarkdown,
    chooseCustomWorkspacePreference,
    chooseEnvironment,
    clearActiveResponseStable,
    clearHistory,
    clearResponseFilter,
    closeAllRequestSessions,
    closeManualWebSocketClient: closeManualWebSocketClientProxy,
    closeOtherRequestSessions,
    closeRequestSession,
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
    deferredResponseFilter,
    deleteCurrentMethodDoc,
    deleteEditingMockScenario,
    designSystem,
    docsPreview,
    downloadTextFile,
    endpointGroups,
    envDialogMode,
    envDialogOpen,
    envDraftName,
    envDraftUrl,
    envMenuAnchor,
    environments,
    events,
    exampleInputRef,
    exportCurrentBenchmark,
    exportCurrentMethodExamples,
    exportGeneratedProtoDocsHtml,
    exportGeneratedProtoDocsMarkdown,
    exportMockScenarioFile,
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
    handleSendWebSocketMessage,
    handleTargetDraftChange,
    handleTransportModeChange,
    handleWebSocketMockPortChange,
    iconButtonSx,
    importExampleFile,
    importGrpcRequestIntoCollection,
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
    mockScenarioDialogOpen,
    mockScenarioDraftId,
    mockScenarioEditing,
    mockScenarioInputRef,
    mockServer,
    mockServerStatus,
    mockSettingsOpen,
    openAddCollectionDialog,
    openAddCollectionRequestDialog,
    openDocFromSidebar,
    openEnvironmentManager,
    openMockScenarioFolder,
    openMockScenarioManager,
    openProtoFolderImporter,
    openWebSocketMockScenarioFromSidebar,
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
    protoFolderInputRef,
    protoInputRef,
    protoPreview,
    publishCurrentRestDoc,
    publishCurrentWebSocketDoc,
    publishedDocs,
    railWidth,
    registryFilter,
    removeCollection,
    removeCollectionRequest,
    removeEditingEnvironment,
    removeMetadataRow,
    removeProtoFile,
    removeRestMockScenarioPair,
    removeRestPairRow,
    renameCollection,
    renameCollectionRequest,
    reportPayload,
    requestFields,
    requestJson,
    requestKindDraft,
    requestNameDialogOpen,
    requestNameDraft,
    requestResponseLayout,
    requestRunner,
    requestSessions,
    requestTab,
    requestTabItems,
    responseBodyRef,
    responseFields,
    responseFilter,
    responseHeight,
    responseTab,
    responseWidth,
    restMethods,
    restMockServer,
    restMockStatus,
    runExample,
    runWebSocketBenchmark,
    saveCurrentEnvironment,
    saveCurrentExample,
    saveCurrentResultForDocs,
    saveCurrentResultForDocsStable,
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
    setEnvDialogOpen,
    setEnvDraftName,
    setEnvDraftUrl,
    setEnvMenuAnchor,
    setExamples,
    setMockScenarioDialogOpen,
    setMockScenarioDraftId,
    setMockSettingsOpen,
    setProtoPreview,
    setRegistryFilter,
    setRequestNameDialogOpen,
    setRequestNameDraft,
    setRequestTab,
    setRestMockScenarioId,
    setSideSection,
    setSidebarOpen,
    setToast,
    setWorkspaceMenuAnchor,
    setWsBenchmarkIterations,
    shellLeft,
    showEmptyWorkbench,
    showMessageTopButton,
    sideSection,
    sidebarOpen,
    sidebarWidthPx,
    slugify,
    startMockServer,
    startRestMockServer,
    startWebSocketMockServer,
    stopMockServer,
    stopRestMockServer,
    stopWebSocketBenchmark,
    stopWebSocketMockServer,
    targetDraft,
    themeMode,
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
    updateActiveRestAuth,
    updateActiveRestBodyType,
    updateActiveRestMethod,
    updateActiveRestMockResponse,
    updateActiveRestMockScenario,
    updateActiveWebSocketMockResponse,
    updateActiveWebSocketMockScenario,
    updateMetadataRow,
    updateRestMockScenarioPair,
    updateRestPairRow,
    updateWebSocketMockScenario,
    updateWebSocketSubprotocol,
    webSocketSubprotocolValue,
    clearLogFiles,
    loggerDraft,
    loggerInfo,
    loggerLevelOptions,
    loggerSettingsOpen,
    openLogFolder,
    openLoggerSettings,
    refreshLoggerSettings,
    saveLoggerSettings,
    setLoggerDraft,
    setLoggerSettingsOpen,
    workspaceFolderPath,
    workspaceMenuAnchor,
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
