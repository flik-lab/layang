"use client";

import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type UIEvent as ReactUiEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { colorTokens, designSystem, paletteMode, type ColorMode } from "./design-system";
import type * as protobuf from "protobufjs";
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
  CssBaseline,
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
  ThemeProvider,
  Tooltip,
  Typography,
  createTheme,
  useMediaQuery,
} from "@/components/shadcn/compat";
import { generateExampleFromType, listMessageFields } from "@/lib/example-generator";
import { buildGrpcWebUrl } from "@/lib/grpc-web-client";
import { hasNativeGrpcBridge } from "@/lib/native-grpc-client";
import { loadProtoFiles, methodLabel } from "@/lib/proto-loader";
import { BenchmarkPanel as FeatureBenchmarkPanel, calculateBenchmarkStats } from "./features/benchmark/benchmark-panel";
import {
  DocsSidebar as FeatureDocsSidebar,
  MarkdownPreview as FeatureMarkdownPreview,
  MethodDocsPanel as FeatureMethodDocsPanel,
} from "./features/docs-publisher/docs-publisher-panel";
import {
  buildLatestResultByMethod,
  buildPublishableDocs,
  buildSavedDocResultByMethod,
  renderMethodPublicationMarkdown,
  renderPublicDocsMarkdown,
  renderWorkspaceProtoDocsHtml,
  renderWorkspaceProtoDocsMarkdown,
} from "./features/docs-publisher/docs-renderer";
import {
  defaultEnvironments,
  environmentLabel as featureEnvironmentLabel,
  environmentShortLabel as featureEnvironmentShortLabel,
  getEnvironmentTarget as featureGetEnvironmentTarget,
  mergeEnvironments as featureMergeEnvironments,
} from "./features/environments/environment-model";
import {
  buildEndpointGroups as buildFeatureEndpointGroups,
  ProtoSourceBlock as FeatureProtoSourceBlock,
  RegistryPanel as FeatureRegistryPanel,
} from "./features/proto-registry/proto-registry-panel";
import {
  CodeTextField as FeatureCodeTextField,
  SchemaTable as FeatureSchemaTable,
} from "./features/request-editor/request-editor-panels";
import { ExamplesPanel } from "./features/examples/examples-panel";
import {
  MockServerPanel,
  MockServerSettingsDialog,
  MockServerSidebar,
} from "./features/mock-server/mock-server-panels";
import { ExampleSidebar, HistorySidebar } from "./features/sidebar/sidebar-panels";
import {
  WebSocketBenchmarkPanel,
  WebSocketDocsPanel,
  WebSocketMockPanel,
  WebSocketMockSidebar,
  renderWebSocketDocsMarkdown,
} from "./features/websocket/websocket-panels";
import {
  appendLimitedUiEvent,
  applyWorkspaceLayoutSnapshot,
  compactGrpcResultForStorage,
  compactRequestSessionForStorage,
  compactUiEvent,
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
  normalizeVisibleResponseTab,
  readStoredProject,
  runWhenIdle,
  upsertMethodDoc,
} from "./features/workspace/workspace-model";
import {
  AppLogoIcon,
  RailButton,
  RequestTabs,
  SidebarHeader,
  WindowControls,
  WorkbenchTabs,
} from "./features/shell/shell-components";
import {
  buildDefaultMockScenario,
  buildMockMappingRows,
  createDefaultMockServerProject,
  currentFileEmptyEditorText,
  ensureUniqueMockScenarioId,
  formatMockScenarioBundle,
  formatSingleMockScenarioForEditor,
  extractRequestBodyFromMockScenario,
  generateRandomExampleFromType,
  getActiveScenarioForMethod,
  getMockMethodScenarioFile,
  mergeExternalScenarioScenariosIntoProject,
  normalizeMockPort,
  normalizeMockStreamSettings,
  normalizeMockServerProject,
  parseAllMockScenarioFiles,
  parseExternalScenarioImportText,
  parseExternalScenarioImportValue,
  parseMockScenarioText,
  parseSimpleYaml,
  replaceActiveMockScenarioInMethodFile,
  resolveMockActiveScenarioIds,
  safeMockFileBaseName,
  updateMockMethodScenarioFile,
} from "./features/mock-server/mock-scenario-model";
import {
  HistoryTable as FeatureHistoryTable,
  JsonBlock as FeatureJsonBlock,
  MessageTable as FeatureMessageTable,
} from "./features/response-viewer/response-viewer";
import { ResponseToolbar, ResponseWorkbenchTabs } from "./features/response-viewer/response-toolbar";
import { evaluateAssertions, eventToUiEvent, writeConsoleLog } from "./features/request-runner/request-result-utils";
import { createRequestSession } from "./features/request-runner/request-session-model";
import { downloadTextFile } from "./shared/browser-utils";
import { toErrorMessage } from "./shared/error-utils";
import { formatTimestampShort, timestampForFile } from "./shared/formatters";
import { safeJsonParse } from "./shared/json-utils";
import { clamp } from "./shared/number-utils";
import { methodKey, methodTypeLabel } from "./shared/rpc-method-utils";
import { createId, savedExampleKey, slugify } from "./shared/entity-utils";
import {
  defaultAssertion,
  defaultMetadata,
  defaultMockPort,
  defaultResponseHeight,
  iconButtonSx,
  layoutStorageKey,
  legacyLayoutStorageKey,
  maxSidebarWidth,
  minResponseHeight,
  minSidebarWidth,
  panelSx,
  projectStorageKey,
  railWidth,
  sampleProto,
  sidebarWidth,
  workspaceFolderStorageKey,
} from "./shared/workbench-constants";
import { useStableEventCallback } from "./hooks/use-stable-event-callback";
import { useBenchmarkRunner } from "./hooks/use-benchmark-runner";
import { useRequestRunner } from "./hooks/use-request-runner";
import type {
  ApiCollection,
  ApiCollectionRequest,
  ApiRequestKind,
  AssertionResult,
  BenchmarkResult,
  DocResultSnapshot,
  EnvironmentConfig,
  EnvironmentKey,
  HistoryItem,
  LegacyWorkspace,
  MethodDoc,
  MockFormat,
  MockMethodScenarioFile,
  MockServerProject,
  MockServerStatus,
  MockStreamSettings,
  ProjectData,
  RequestSession,
  RequestTab,
  ResponseTab,
  SavedExample,
  SideSection,
  TransportMode,
  UiEvent,
  WorkspaceExportBundle,
  WorkspaceImportRecord,
  WorkspaceLayoutSnapshot,
  WebSocketMockStatus,
  MockScenarioBundle,
} from "./shared/workbench-types";
import type { GrpcEvent, GrpcResult, LoadedProto, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";

type CompatTheme = ReturnType<typeof createTheme>;

type WebSocketClientState = {
  readyState: "closed" | "connecting" | "open";
  url: string;
  sessionId: string;
  messageCount: number;
  lastError?: string;
};

type ManagedWebSocketClient = {
  socket: WebSocket;
  sessionId: string;
  requestId: string;
  url: string;
  startedAt: Date;
  messages: unknown[];
};

function webSocketDocKey(request: Pick<ApiCollectionRequest, "id"> | null | undefined) {
  return request?.id ? `ws:${request.id}` : "";
}

function findWebSocketRequestForDocKey(collections: ApiCollection[], key: string) {
  const requestId = key.startsWith("ws:") ? key.slice(3) : key;
  for (const collection of collections) {
    const request = collection.requests.find((item) => item.id === requestId && item.kind === "websocket");
    if (request) return { ...request, collectionName: collection.name };
  }
  return null;
}

type ButtonClickEvent = ReactMouseEvent<HTMLButtonElement>;
type ElementClickEvent = ReactMouseEvent<HTMLElement>;
type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SelectInputChangeEvent = ChangeEvent<HTMLSelectElement>;
type TextInputKeyboardEvent = ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>;

function isWebSocketUrl(value?: string) {
  return /^wss?:\/\//i.test((value ?? "").trim());
}

function grpcBaseUrlFallback(candidate: string | undefined, fallback: string | undefined) {
  if (candidate && !isWebSocketUrl(candidate)) return candidate;
  if (fallback && !isWebSocketUrl(fallback)) return fallback;
  return "http://localhost:9080/grpc/web";
}

function defaultWebSocketMockResponse(name = "WebSocket Request") {
  return JSON.stringify(
    [
      {
        type: "message",
        request: name,
        count: "{{count}}",
        message: "Hello from mock WebSocket",
        timestamp: "{{now}}",
      },
      {
        type: "message",
        request: name,
        count: "{{count}}",
        message: "Second mock WebSocket message",
        timestamp: "{{now}}",
      },
    ],
    null,
    2,
  );
}

export default function PlaygroundPage() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [themeMode, setThemeMode] = useState<ColorMode>("dark");
  const [hydrated, setHydrated] = useState(false);
  const [sideSection, setSideSection] = useState<SideSection>("registry");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidthPx, setSidebarWidthPx] = useState(sidebarWidth);
  const [responseHeight, setResponseHeight] = useState(defaultResponseHeight);
  const [_requestCollapsed, setRequestCollapsed] = useState(false);
  const [transportMode, setTransportMode] = useState<TransportMode>("grpc-web");
  const [baseUrl, setBaseUrl] = useState("http://localhost:9080/grpc/web");
  const [nativeTarget, setNativeTarget] = useState("localhost:50051");
  const [environmentKey, setEnvironmentKey] = useState<EnvironmentKey>("default");
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>(defaultEnvironments);
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
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [lastResult, setLastResult] = useState<GrpcResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [mockServer, setMockServer] = useState<MockServerProject>(() => createDefaultMockServerProject());
  const [mockServerStatus, setMockServerStatus] = useState<MockServerStatus>({ running: false });
  const [mockSettingsOpen, setMockSettingsOpen] = useState(false);
  const [mockScenarioEditorDraft, setMockScenarioEditorDraft] = useState<{
    methodKey: string;
    scenarioId: string;
    format: MockFormat;
    text: string;
  } | null>(null);
  const [mockScenarioDialogOpen, setMockScenarioDialogOpen] = useState(false);
  const [mockScenarioEditing, setMockScenarioEditing] = useState<{ methodKey: string; scenarioId: string } | null>(
    null,
  );
  const [mockScenarioDraftId, setMockScenarioDraftId] = useState("");
  const [assertionResults, setAssertionResults] = useState<AssertionResult[]>([]);
  const [responseFilter, setResponseFilter] = useState("");
  const [registryFilter, setRegistryFilter] = useState("");
  const deferredResponseFilter = useDeferredValue(responseFilter);
  const deferredRegistryFilter = useDeferredValue(registryFilter);
  const [_error, setError] = useState("");
  const [toast, setToast] = useState<{
    id: number;
    open: boolean;
    message: string;
    severity: "info" | "success" | "warning" | "error";
  }>({ id: 0, open: false, message: "", severity: "info" });
  const [workspaceMenuAnchor, setWorkspaceMenuAnchor] = useState<HTMLElement | null>(null);
  const [collectionMenuAnchor, setCollectionMenuAnchor] = useState<HTMLElement | null>(null);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [collectionNameDraft, setCollectionNameDraft] = useState("");
  const [requestNameDialogOpen, setRequestNameDialogOpen] = useState(false);
  const [requestNameDraft, setRequestNameDraft] = useState("");
  const [requestTargetCollectionId, setRequestTargetCollectionId] = useState("");
  const pendingCollectionImportRef = useRef<string>("");
  const [workspaceFolderPath, setWorkspaceFolderPath] = useState("");
  const [envMenuAnchor, setEnvMenuAnchor] = useState<HTMLElement | null>(null);
  const [envDialogOpen, setEnvDialogOpen] = useState(false);
  const [envDialogMode, setEnvDialogMode] = useState<"create" | "edit">("create");
  const [envEditingKey, setEnvEditingKey] = useState<EnvironmentKey>("");
  const [envDraftName, setEnvDraftName] = useState("");
  const [envDraftUrl, setEnvDraftUrl] = useState("");
  const [docsPreview, setDocsPreview] = useState<{ title: string; markdown: string } | null>(null);
  const [protoPreview, setProtoPreview] = useState<ProtoSourceFile | null>(null);
  const [requestTab, setRequestTab] = useState<RequestTab>("body");
  const [responseTab, setResponseTab] = useState<ResponseTab>("messages");
  const [wsBenchmarkIterations, setWsBenchmarkIterations] = useState(5);
  const [wsBenchmarkResults, setWsBenchmarkResults] = useState<BenchmarkResult[]>([]);
  const [wsBenchmarkRunning, setWsBenchmarkRunning] = useState(false);
  const [wsMockResponseText, setWsMockResponseText] = useState(defaultWebSocketMockResponse());
  const [wsMockPort, setWsMockPort] = useState(8090);
  const [wsMockPath, setWsMockPath] = useState("/mock/ws");
  const [wsMockIntervalMs, setWsMockIntervalMs] = useState(1000);
  const [wsMockLoop, setWsMockLoop] = useState(false);
  const [wsMockMaxLoops, setWsMockMaxLoops] = useState(0);
  const [wsMockStreamOnConnect, setWsMockStreamOnConnect] = useState(false);
  const [wsMockStatus, setWsMockStatus] = useState<WebSocketMockStatus>({ running: false });
  const wsClientRef = useRef<ManagedWebSocketClient | null>(null);
  const [wsClientState, setWsClientState] = useState<WebSocketClientState>({
    readyState: "closed",
    url: "",
    sessionId: "",
    messageCount: 0,
  });
  const responseBodyRef = useRef<HTMLDivElement | null>(null);
  const [showMessageTopButton, setShowMessageTopButton] = useState(false);
  const [requestSessions, setRequestSessions] = useState<RequestSession[]>([]);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [isNativeBridgeAvailable, setIsNativeBridgeAvailable] = useState(false);
  const _abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const sidebarResizeRef = useRef(false);
  const responseResizeRef = useRef(false);
  const wsBenchmarkAbortRef = useRef<AbortController | null>(null);
  const _cancelledRunIdsRef = useRef<Set<string>>(new Set());
  const activeRequestIdRef = useRef("");
  const workspaceAutosaveRef = useRef<{
    lastPayload: string;
    saving: boolean;
    pendingPayload: string;
    pendingBundle: WorkspaceExportBundle | null;
    pendingPath: string;
  }>({
    lastPayload: "",
    saving: false,
    pendingPayload: "",
    pendingBundle: null,
    pendingPath: "",
  });
  const protoInputRef = useRef<HTMLInputElement | null>(null);
  const protoFolderInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const exampleInputRef = useRef<HTMLInputElement | null>(null);
  const mockScenarioInputRef = useRef<HTMLInputElement | null>(null);
  const [targetDraft, setTargetDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsNativeBridgeAvailable(hasNativeGrpcBridge());
    const storedTheme =
      window.localStorage.getItem("layang-theme") ?? window.localStorage.getItem("grpc-web-lab-theme");
    const initialThemeMode: ColorMode =
      storedTheme === "light" || storedTheme === "dark" ? storedTheme : prefersDark ? "dark" : "light";
    setThemeMode(initialThemeMode);
    const storedWorkspacePath = window.localStorage.getItem(workspaceFolderStorageKey) ?? "";
    setWorkspaceFolderPath(storedWorkspacePath);

    /**
     * Applies locally cached layout only when no workspace folder can be loaded from disk.
     */
    function applyCachedLayout(): WorkspaceLayoutSnapshot {
      const nextLayout: WorkspaceLayoutSnapshot = { sidebarOpen, sidebarWidthPx, responseHeight };
      try {
        const rawLayout =
          window.localStorage.getItem(layoutStorageKey) ?? window.localStorage.getItem(legacyLayoutStorageKey);
        const layout = rawLayout
          ? (JSON.parse(rawLayout) as Partial<{
              sidebarOpen: boolean;
              sidebarWidthPx: number;
              responseHeight: number;
              requestCollapsed: boolean;
            }>)
          : {};
        if (typeof layout.sidebarOpen === "boolean") {
          nextLayout.sidebarOpen = layout.sidebarOpen;
          setSidebarOpen(layout.sidebarOpen);
        }
        if (typeof layout.sidebarWidthPx === "number") {
          nextLayout.sidebarWidthPx = clamp(layout.sidebarWidthPx, minSidebarWidth, maxSidebarWidth);
          setSidebarWidthPx(nextLayout.sidebarWidthPx);
        }
        if (typeof layout.responseHeight === "number") {
          nextLayout.responseHeight = Math.max(minResponseHeight, layout.responseHeight);
          setResponseHeight(nextLayout.responseHeight);
        }
        setRequestCollapsed(false);
      } catch {
        // Keep default layout when stored preferences cannot be parsed.
      }
      return nextLayout;
    }

    async function loadInitialWorkspace() {
      if (storedWorkspacePath && window.electronWorkspace?.openFolder) {
        try {
          const result = await window.electronWorkspace.openFolder(storedWorkspacePath);
          if (!cancelled && result.ok && result.bundle) {
            const imported = applyWorkspaceBundle(result.bundle);
            if (imported) {
              const nextPath = result.directoryPath ?? storedWorkspacePath;
              setWorkspaceFolderPath(nextPath);
              window.localStorage.setItem(workspaceFolderStorageKey, nextPath);
              setHydrated(true);
              return;
            }
          }
        } catch (err) {
          console.warn("Failed to auto-load workspace folder; falling back to local draft.", err);
        }
      }

      if (cancelled) return;
      const cachedLayout = applyCachedLayout();
      const cachedProject = readStoredProject();

      if (window.electronWorkspace?.ensureDefaultFolder) {
        try {
          const defaultWorkspaceBundle: WorkspaceExportBundle = {
            type: "layang-workspace",
            version: 4,
            exportedAt: new Date().toISOString(),
            app: "Layang",
            project: cachedProject,
            layout: cachedLayout,
            settings: { themeMode: initialThemeMode },
          };
          const result = await window.electronWorkspace.ensureDefaultFolder(defaultWorkspaceBundle);
          if (!cancelled && result.ok && result.directoryPath) {
            setWorkspaceFolderPath(result.directoryPath);
            window.localStorage.setItem(workspaceFolderStorageKey, result.directoryPath);
            if (result.bundle && !result.created) {
              const imported = applyWorkspaceBundle(result.bundle);
              if (imported) {
                setHydrated(true);
                return;
              }
            }
          }
        } catch (err) {
          console.warn("Failed to create default workspace folder; continuing with local draft.", err);
        }
      }

      if (cancelled) return;
      applyProject(cachedProject);
      setHydrated(true);
    }

    void loadInitialWorkspace();
    return () => {
      cancelled = true;
    };
  }, [prefersDark]);

  useEffect(() => {
    return () => {
      const client = wsClientRef.current;
      wsClientRef.current = null;
      try {
        if (client?.socket.readyState === WebSocket.OPEN || client?.socket.readyState === WebSocket.CONNECTING) {
          client.socket.close(1000, "App closed");
        }
      } catch {
        // Ignore browser WebSocket close errors during unmount.
      }
    };
  }, []);

  useEffect(() => {
    activeRequestIdRef.current = activeRequestId;
  }, [activeRequestId]);

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
    requestSessions,
    activeRequestId,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      runWhenIdle(() =>
        window.localStorage.setItem(layoutStorageKey, JSON.stringify({ sidebarOpen, sidebarWidthPx, responseHeight })),
      );
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [hydrated, sidebarOpen, sidebarWidthPx, responseHeight]);

  useEffect(() => {
    if (!hydrated || !workspaceFolderPath || !window.electronWorkspace?.saveFolder) return;
    const timeout = window.setTimeout(() => {
      runWhenIdle(() => {
        const bundle = getWorkspaceExportBundle();
        const nextPayload = JSON.stringify({
          project: bundle.project,
          layout: bundle.layout,
          settings: bundle.settings,
        });
        const saveState = workspaceAutosaveRef.current;
        if (nextPayload === saveState.lastPayload) return;

        saveState.pendingPayload = nextPayload;
        saveState.pendingBundle = bundle;
        saveState.pendingPath = workspaceFolderPath;
        if (saveState.saving) return;

        const flushWorkspaceAutosave = async () => {
          saveState.saving = true;
          try {
            while (saveState.pendingBundle && saveState.pendingPath) {
              const pendingBundle = saveState.pendingBundle;
              const pendingPayload = saveState.pendingPayload;
              const pendingPath = saveState.pendingPath;
              saveState.pendingBundle = null;
              await window.electronWorkspace?.saveFolder?.(pendingBundle, pendingPath);
              saveState.lastPayload = pendingPayload;
            }
          } catch (err) {
            console.warn("Workspace autosave failed.", err);
          } finally {
            saveState.saving = false;
          }
        };

        void flushWorkspaceAutosave();
      });
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [
    hydrated,
    workspaceFolderPath,
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
    requestSessions,
    activeRequestId,
    sidebarOpen,
    sidebarWidthPx,
    responseHeight,
    themeMode,
  ]);

  useEffect(() => {
    /**
     * Stops active resize tracking and restores cursor/user-select state.
     */
    function stopResize() {
      sidebarResizeRef.current = false;
      responseResizeRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    /**
     * Updates sidebar or response panel size while the user drags a resize handle.
     */
    function handleResizeMove(event: MouseEvent) {
      if (sidebarResizeRef.current) {
        const nextWidth = event.clientX - railWidth;
        if (nextWidth < minSidebarWidth - 36) {
          setSidebarOpen(false);
          sidebarResizeRef.current = false;
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        } else {
          setSidebarWidthPx(clamp(nextWidth, minSidebarWidth, maxSidebarWidth));
        }
      }

      if (responseResizeRef.current) {
        const reservedTop = 260;
        const maxHeight = Math.max(
          minResponseHeight,
          window.innerHeight - designSystem.size.titlebarHeight - reservedTop,
        );
        setResponseHeight(clamp(window.innerHeight - event.clientY - 10, minResponseHeight, maxHeight));
      }
    }

    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", stopResize);
    return () => {
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, []);

  const theme = useMemo(() => {
    const modeColors = colorTokens[paletteMode(themeMode)];
    return createTheme({
      palette: {
        mode: themeMode,
        primary: { main: modeColors.primary },
        secondary: { main: modeColors.secondary },
        background: {
          default: modeColors.bg,
          paper: modeColors.surface,
        },
        divider: modeColors.border,
        text: {
          primary: modeColors.text,
          secondary: modeColors.textMuted,
        },
        action: {
          hover: modeColors.hover,
          selected: modeColors.selected,
        },
      },
      shape: { borderRadius: 8 },
      typography: {
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: designSystem.font.base,
        h6: { fontSize: designSystem.font.heading, fontWeight: 560, lineHeight: 1.25 },
        subtitle1: { fontSize: designSystem.font.title, fontWeight: 560, lineHeight: 1.25 },
        body1: { fontSize: designSystem.font.body, lineHeight: 1.45 },
        body2: { fontSize: designSystem.font.label, lineHeight: 1.4 },
        caption: { fontSize: designSystem.font.caption, lineHeight: 1.35 },
        button: { textTransform: "none", fontWeight: 520, fontSize: designSystem.font.label, lineHeight: 1.15 },
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            "*": {
              scrollbarWidth: "thin",
              scrollbarColor: `${modeColors.scrollbarThumb} ${modeColors.scrollbarTrack}`,
            },
            "*::-webkit-scrollbar": { width: 9, height: 9 },
            "*::-webkit-scrollbar-track": { background: modeColors.scrollbarTrack },
            "*::-webkit-scrollbar-thumb": {
              background: modeColors.scrollbarThumb,
              borderRadius: 999,
              border: `2px solid ${modeColors.scrollbarTrack}`,
            },
            "*::-webkit-scrollbar-thumb:hover": { background: modeColors.scrollbarThumbHover },
          },
        },
        MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
        MuiButton: {
          styleOverrides: {
            root: {
              minHeight: designSystem.size.buttonHeight,
              borderRadius: 7,
              paddingInline: 10,
              fontSize: designSystem.font.label,
              boxShadow: "none",
            },
            sizeSmall: {
              minHeight: designSystem.size.buttonSmallHeight,
              paddingInline: 9,
            },
          },
        },
        MuiIconButton: {
          styleOverrides: {
            sizeSmall: {
              width: designSystem.size.iconButton,
              height: designSystem.size.iconButton,
              padding: 3,
            },
          },
        },
        MuiMenuItem: { styleOverrides: { root: { minHeight: 30, fontSize: designSystem.font.label, gap: 6 } } },
        MuiListItemButton: { styleOverrides: { root: { minHeight: designSystem.size.compactRow, borderRadius: 8 } } },
        MuiListItemText: {
          styleOverrides: {
            primary: { fontSize: designSystem.font.label },
            secondary: { fontSize: designSystem.font.caption },
          },
        },
        MuiTab: {
          styleOverrides: {
            root: {
              minHeight: designSystem.size.tabHeight,
              padding: "7px 12px",
              fontSize: designSystem.font.label,
              textTransform: "none",
            },
          },
        },
        MuiTabs: { styleOverrides: { root: { minHeight: designSystem.size.tabHeight } } },
        MuiChip: { styleOverrides: { root: { height: 22, fontSize: designSystem.font.caption } } },
        MuiTableCell: { styleOverrides: { root: { fontSize: designSystem.font.label, padding: "7px 10px" } } },
        MuiInputBase: {
          styleOverrides: { root: { fontSize: designSystem.font.label }, input: { fontSize: designSystem.font.label } },
        },
        MuiTextField: { defaultProps: { variant: "outlined" } },
      },
    });
  }, [themeMode]);

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
  const activeDocKey = activeMethodKey || webSocketDocKey(activeCollectionRequest);
  const activeExampleKey = activeMethodKey || activeCollectionKey;
  const currentExamples = useMemo(
    () => (activeExampleKey ? examples.filter((example) => savedExampleKey(example) === activeExampleKey) : []),
    [examples, activeExampleKey],
  );
  const currentHistory = useMemo(
    () => (activeExampleKey ? history.filter((item) => item.method === activeExampleKey) : []),
    [history, activeExampleKey],
  );
  const activeWebSocketMockResponseText =
    activeCollectionRequest?.kind === "websocket"
      ? (activeCollectionRequest.mockResponse ?? wsMockResponseText)
      : wsMockResponseText;
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
    return [...grpcDocs, ...wsDocs];
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
      (scenario) => scenario.service === selectedMethod.serviceName && scenario.method === selectedMethod.methodName,
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
  const currentMockEditorKey =
    selectedMethod && currentMockActiveScenario
      ? `${methodKey(selectedMethod)}:${currentMockActiveScenario.id}:${currentMockFile.format}`
      : "";
  const currentMockEditorText = useMemo(() => {
    if (!selectedMethod || !currentMockActiveScenario) return currentFileEmptyEditorText(currentMockFile.format);
    if (
      mockScenarioEditorDraft &&
      mockScenarioEditorDraft.methodKey === methodKey(selectedMethod) &&
      mockScenarioEditorDraft.scenarioId === currentMockActiveScenario.id &&
      mockScenarioEditorDraft.format === currentMockFile.format
    ) {
      return mockScenarioEditorDraft.text;
    }
    return formatSingleMockScenarioForEditor(currentMockActiveScenario, currentMockFile.format);
  }, [selectedMethod, currentMockActiveScenario, currentMockFile.format, mockScenarioEditorDraft]);
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
  const activeTransportMode: TransportMode = activeIsWebSocket
    ? "websocket"
    : rawActiveTransportMode === "websocket"
      ? "grpc-web"
      : rawActiveTransportMode;
  const webSocketSubprotocolValue = activeIsWebSocket
    ? (metadata.find((item) => item.key.trim().toLowerCase() === "sec-websocket-protocol")?.value ?? "")
    : "";
  const activeBaseUrl = activeIsWebSocket
    ? (activeSession?.baseUrl ?? activeCollectionRequest?.url ?? "ws://localhost:8080")
    : grpcBaseUrlFallback(activeSession?.baseUrl, baseUrl);
  const activeNativeTarget = activeSession?.nativeTarget ?? nativeTarget;
  const activeEnvironmentKey = activeSession?.environmentKey ?? environmentKey;
  const effectiveBaseUrl = featureGetEnvironmentTarget(
    environments,
    activeEnvironmentKey,
    "grpc-web",
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
    if (!mockServerStatus.running || !loaded || !window.electronMock?.update) return;
    const timer = window.setTimeout(() => {
      void syncRunningMockServerFromEditor();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [mockServer, loaded, mockServerStatus.running]);

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
      void window.electronWsMock
        ?.update?.({
          responseText: activeWebSocketMockResponseText,
          intervalMs: wsMockIntervalMs,
          loop: wsMockLoop,
          maxLoops: wsMockMaxLoops,
          streamOnConnect: wsMockStreamOnConnect,
          sendOnMessage: false,
        })
        .then((result) => {
          if (result?.ok)
            setWsMockStatus((current) => ({ ...current, ...result, running: result.running ?? current.running }));
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    activeWebSocketMockResponseText,
    wsMockIntervalMs,
    wsMockLoop,
    wsMockMaxLoops,
    wsMockStreamOnConnect,
    wsMockStatus.running,
  ]);

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
  const shellLeft = railWidth + (sidebarOpen ? sidebarWidthPx : 0);

  const requestFields = useMemo(() => {
    if (!loaded || !selectedMethod) return [];
    try {
      return listMessageFields(loaded.root, selectedMethod.requestType);
    } catch {
      return [];
    }
  }, [loaded, selectedMethod]);

  const responseFields = useMemo(() => {
    if (!loaded || !selectedMethod) return [];
    try {
      return listMessageFields(loaded.root, selectedMethod.responseType);
    } catch {
      return [];
    }
  }, [loaded, selectedMethod]);

  const previewUrl = selectedMethod
    ? activeTransportMode === "native-grpc"
      ? `${draftEffectiveNativeTarget.replace(/\/+$/, "")}/${selectedMethod.serviceName}/${selectedMethod.methodName}`
      : buildGrpcWebUrl(draftEffectiveBaseUrl, selectedMethod.serviceName, selectedMethod.methodName)
    : isNativeTransport
      ? draftEffectiveNativeTarget
      : draftEffectiveBaseUrl;

  const messageEvents = events.filter((event) => event.kind === "message");
  const reportPayload = useMemo(
    () => ({
      exportedAt: hydrated ? new Date().toISOString() : "",
      transportMode: activeTransportMode,
      target: isNativeTransport ? draftEffectiveNativeTarget : draftEffectiveBaseUrl,
      method: selectedMethod ? methodLabel(selectedMethod) : (activeCollectionRequest?.name ?? null),
      request: safeJsonParse(requestJson),
      metadata: metadata.filter((item) => item.key.trim()),
      result: lastResult,
      events,
    }),
    [
      hydrated,
      activeTransportMode,
      draftEffectiveBaseUrl,
      draftEffectiveNativeTarget,
      selectedMethod,
      activeCollectionRequest,
      isNativeTransport,
      requestJson,
      metadata,
      lastResult,
      events,
    ],
  );
  const requestTabItems = useMemo<Array<{ value: RequestTab; label: string }>>(
    () =>
      activeIsWebSocket
        ? [
            { value: "body", label: "Message" },
            { value: "metadata", label: "Headers" },
            { value: "examples", label: currentExamples.length ? `Examples ${currentExamples.length}` : "Examples" },
            { value: "mock", label: "Mock" },
            { value: "docs", label: "Docs" },
            { value: "benchmark", label: "Benchmark" },
          ]
        : [
            { value: "body", label: "Body" },
            { value: "metadata", label: "Metadata" },
            { value: "schema", label: "Schema" },
            { value: "docs", label: "Docs" },
            { value: "benchmark", label: "Benchmark" },
            { value: "examples", label: currentExamples.length ? `Examples ${currentExamples.length}` : "Examples" },
            { value: "mock", label: "Mock" },
          ],
    [activeIsWebSocket, currentExamples.length],
  );

  useEffect(() => {
    if (!requestTabItems.some((item) => item.value === requestTab)) setRequestTab("body");
  }, [requestTab, requestTabItems]);

  /**
   * Appends a transport event to the matching request tab without leaking data into another tab.
   */
  function appendLiveEventToSession(sessionId: string, event: GrpcEvent) {
    writeConsoleLog(event);

    if (event.type === "log" || event.type === "end") {
      return;
    }

    const uiEvent = compactUiEvent(eventToUiEvent(event));
    const isActiveSession = !sessionId || activeRequestIdRef.current === sessionId;

    if (sessionId && !isActiveSession) {
      setRequestSessions((sessions) =>
        sessions.map((session) => {
          if (session.id !== sessionId) return session;
          return {
            ...session,
            events: appendLimitedUiEvent(session.events ?? [], uiEvent),
            updatedAt: new Date().toISOString(),
          };
        }),
      );
    }

    if (isActiveSession) {
      setEvents((current) => appendLimitedUiEvent(current, uiEvent));
    }
  }

  /**
   * Builds the serializable project snapshot used for persistence and export.
   */
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
      requestTabs: requestSessions.map(compactRequestSessionForStorage),
      activeRequestId,
    };
  }

  /**
   * Hydrates application state from a saved project snapshot.
   */
  function applyProject(project: ProjectData) {
    setTransportMode(project.transportMode);
    setBaseUrl(project.baseUrl);
    setNativeTarget(project.nativeTarget);
    setEnvironmentKey(project.environmentKey ?? "default");
    setEnvironments(featureMergeEnvironments(project.environments));
    setProtoFiles(project.protoFiles);
    setCollections(normalizeApiCollections(project.collections));
    setMetadata(project.metadata.length ? project.metadata : defaultMetadata);
    setExamples(project.examples ?? []);
    setMethodDocs(project.methodDocs ?? []);
    setDocResults(project.docResults ?? []);
    setAssertionJson(project.assertionJson || defaultAssertion);
    setHistory(project.history ?? []);
    setMockServer(normalizeMockServerProject(project.mockServer));
    setRequestSessions(project.requestTabs ?? []);
    setActiveRequestId(project.activeRequestId ?? "");
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    setError("");

    if (project.protoFiles.length === 0) {
      setLoaded(null);
      setSelectedMethodKey("");
      const activeSession =
        project.requestTabs.find((session) => session.id === project.activeRequestId) ?? project.requestTabs[0];
      if (activeSession) activateRequestSession(activeSession);
      else setRequestJson(project.requestJson || "{}");
      return;
    }

    try {
      const result = loadProtoFiles(project.protoFiles);
      setLoaded(result);
      const activeSession =
        project.requestTabs.find((session) => session.id === project.activeRequestId) ?? project.requestTabs[0];
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
      setRequestJson(project.requestJson || "{}");
      setError(toErrorMessage(err));
    }
  }

  /**
   * Applies layout preferences imported from a portable workspace bundle.
   */
  function applyWorkspaceLayout(layout: Partial<WorkspaceLayoutSnapshot>) {
    applyWorkspaceLayoutSnapshot(layout, { setSidebarOpen, setSidebarWidthPx, setResponseHeight });
    window.localStorage.setItem(
      layoutStorageKey,
      JSON.stringify({
        sidebarOpen: typeof layout.sidebarOpen === "boolean" ? layout.sidebarOpen : sidebarOpen,
        sidebarWidthPx:
          typeof layout.sidebarWidthPx === "number"
            ? clamp(layout.sidebarWidthPx, minSidebarWidth, maxSidebarWidth)
            : sidebarWidthPx,
        responseHeight:
          typeof layout.responseHeight === "number"
            ? Math.max(minResponseHeight, layout.responseHeight)
            : responseHeight,
      }),
    );
  }

  /**
   * Returns the current layout preferences that should travel with workspace exports.
   */
  function getLayoutSnapshot(): WorkspaceLayoutSnapshot {
    return {
      sidebarOpen,
      sidebarWidthPx,
      responseHeight,
    };
  }

  /**
   * Writes the current project, layout, and theme to local storage immediately.
   */
  function saveProjectNow() {
    window.localStorage.setItem(projectStorageKey, JSON.stringify(getProjectSnapshot()));
    window.localStorage.setItem(layoutStorageKey, JSON.stringify(getLayoutSnapshot()));
    window.localStorage.setItem("layang-theme", themeMode);
  }

  /**
   * Saves the entire current workspace locally from the logo menu.
   */
  function saveWorkspaceLocally() {
    setWorkspaceMenuAnchor(null);
    saveProjectNow();
    showToast("Workspace saved locally.", "success");
  }

  /**
   * Builds the portable workspace bundle used to move all local data to another PC.
   */
  function getWorkspaceExportBundle(): WorkspaceExportBundle {
    return {
      type: "layang-workspace",
      version: 4,
      exportedAt: new Date().toISOString(),
      app: "Layang",
      project: getProjectSnapshot(),
      layout: getLayoutSnapshot(),
      settings: { themeMode },
    };
  }

  /**
   * Exports every workspace asset: proto files, environments, examples, docs, saved results, tabs, and layout.
   */
  function exportProject() {
    setWorkspaceMenuAnchor(null);
    downloadTextFile(
      `layang-workspace-${timestampForFile()}.json`,
      JSON.stringify(getWorkspaceExportBundle(), null, 2),
      "application/json",
    );
  }

  /**
   * Saves the current workspace as a Git-friendly folder using the Electron bridge.
   */
  async function saveWorkspaceFolder() {
    setWorkspaceMenuAnchor(null);
    if (!window.electronWorkspace?.saveFolder) {
      showToast("Workspace folders are available in the desktop app only. Use export JSON in the browser.", "warning");
      return;
    }

    try {
      const result = await window.electronWorkspace.saveFolder(
        getWorkspaceExportBundle(),
        workspaceFolderPath || undefined,
      );
      if (!result.ok || result.cancelled) return;
      const nextPath = result.directoryPath ?? workspaceFolderPath;
      if (nextPath) {
        setWorkspaceFolderPath(nextPath);
        window.localStorage.setItem(workspaceFolderStorageKey, nextPath);
      }
      showToast("Workspace folder saved.", "success");
    } catch (err) {
      showToast(`Save workspace folder failed: ${toErrorMessage(err)}`, "error");
    }
  }

  /**
   * Always asks for a target directory before saving a workspace folder.
   */
  async function saveWorkspaceFolderAs() {
    setWorkspaceMenuAnchor(null);
    if (!window.electronWorkspace?.saveFolder) {
      showToast("Workspace folders are available in the desktop app only. Use export JSON in the browser.", "warning");
      return;
    }

    try {
      const result = await window.electronWorkspace.saveFolder(getWorkspaceExportBundle());
      if (!result.ok || result.cancelled) return;
      if (result.directoryPath) {
        setWorkspaceFolderPath(result.directoryPath);
        window.localStorage.setItem(workspaceFolderStorageKey, result.directoryPath);
      }
      showToast("Workspace folder saved.", "success");
    } catch (err) {
      showToast(`Save workspace folder failed: ${toErrorMessage(err)}`, "error");
    }
  }

  /**
   * Opens a Layang workspace folder from disk and applies its project, layout, and settings.
   */
  async function openWorkspaceFolder() {
    setWorkspaceMenuAnchor(null);
    if (!window.electronWorkspace?.openFolder) {
      showToast("Workspace folders are available in the desktop app only. Import JSON in the browser.", "warning");
      return;
    }

    try {
      const result = await window.electronWorkspace.openFolder();
      if (!result.ok || result.cancelled || !result.bundle) return;
      const imported = applyWorkspaceBundle(result.bundle);
      const nextPath = result.directoryPath ?? "";
      if (nextPath) {
        setWorkspaceFolderPath(nextPath);
        window.localStorage.setItem(workspaceFolderStorageKey, nextPath);
      }
      showToast(
        imported ? "Workspace folder loaded." : "The selected folder does not contain supported workspace data.",
        imported ? "success" : "warning",
      );
    } catch (err) {
      showToast(`Open workspace folder failed: ${toErrorMessage(err)}`, "error");
    }
  }

  /**
   * Applies a portable workspace envelope and returns whether project data was found.
   */
  function applyWorkspaceBundle(value: unknown): boolean {
    const envelope: WorkspaceImportRecord =
      typeof value === "object" && value !== null ? (value as WorkspaceImportRecord) : {};
    const payload = envelope.project ?? envelope.workspace;
    if (!payload && !looksLikeProjectData(envelope as Partial<ProjectData>)) return false;

    const project = normalizeProjectData((payload ?? envelope) as Partial<ProjectData> | LegacyWorkspace);
    applyProject(project);
    window.localStorage.setItem(projectStorageKey, JSON.stringify(project));

    if (envelope.layout) {
      applyWorkspaceLayout(envelope.layout);
    }

    if (envelope.settings?.themeMode === "light" || envelope.settings?.themeMode === "dark") {
      setThemeMode(envelope.settings.themeMode);
      window.localStorage.setItem("layang-theme", envelope.settings.themeMode);
    }

    return true;
  }

  /**
   * Opens the workspace importer from the logo menu.
   */
  function openWorkspaceImporter() {
    setWorkspaceMenuAnchor(null);
    projectInputRef.current?.click();
  }

  /**
   * Opens a directory picker-style file input for importing a full proto folder tree.
   */
  function openProtoFolderImporter() {
    setWorkspaceMenuAnchor(null);
    protoFolderInputRef.current?.click();
  }

  /**
   * Imports an exported endpoint bundle and merges its proto files and examples.
   */
  async function importEndpointBundleText(text: string) {
    const parsed = JSON.parse(text) as unknown;
    const bundle = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const bundledProtoFiles = Array.isArray(bundle.protoFiles) ? bundle.protoFiles.filter(isProtoSourceFile) : [];
    const bundledExamples = Array.isArray(bundle.examples) ? bundle.examples.filter(isSavedExample) : [];

    if (bundledProtoFiles.length > 0) {
      const merged = mergeProtoFiles(protoFiles, bundledProtoFiles);
      const result = loadProtoFiles(merged);
      setProtoFiles(merged);
      setLoaded(result);
      const methodInfo = bundle.method as Partial<RpcMethodInfo> | undefined;
      const method =
        result.methods.find(
          (item) => item.serviceName === methodInfo?.serviceName && item.methodName === methodInfo?.methodName,
        ) ?? result.methods[0];
      if (method) selectMethod(result.root, method);
    }

    if (bundledExamples.length > 0) {
      setExamples((current) => mergeExamples(current, bundledExamples));
    }

    showToast("Collection data loaded.", "success");
  }

  /**
   * Imports workspace assets selected from the logo menu. Full workspace JSON files replace the current workspace;
   * loose proto files, endpoint bundles, and example JSON files are merged into the current workspace.
   */
  async function importWorkspaceFiles(files: FileList | null) {
    const fileArray = Array.from(files ?? []);
    if (fileArray.length === 0) return;

    let nextProject = getProjectSnapshot();
    let importedWorkspaces = 0;
    let importedProtos = 0;
    let importedExamples = 0;
    let importedBundles = 0;
    let importedDocs = 0;

    try {
      for (const file of fileArray) {
        const lowerName = file.name.toLowerCase();
        const text = await file.text();

        if (lowerName.endsWith(".proto")) {
          nextProject = {
            ...nextProject,
            protoFiles: mergeProtoFiles(nextProject.protoFiles, [
              { name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, text },
            ]),
          };
          importedProtos += 1;
          continue;
        }

        if (!lowerName.endsWith(".json") && !lowerName.endsWith(".yaml") && !lowerName.endsWith(".yml")) {
          continue;
        }

        if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) {
          const ExternalScenarioScenarios = parseExternalScenarioImportText(text, "yaml", null);
          if (ExternalScenarioScenarios.length > 0) {
            nextProject = mergeExternalScenarioScenariosIntoProject(
              nextProject,
              ExternalScenarioScenarios,
              loaded?.methods ?? [],
            );
            importedBundles += 1;
            continue;
          }
        }

        const parsed = lowerName.endsWith(".json") ? (JSON.parse(text) as unknown) : (parseSimpleYaml(text) as unknown);
        const ExternalScenarioScenarios = parseExternalScenarioImportValue(parsed, null);
        if (ExternalScenarioScenarios.length > 0 && !looksLikeProjectData(parsed)) {
          nextProject = mergeExternalScenarioScenariosIntoProject(
            nextProject,
            ExternalScenarioScenarios,
            loaded?.methods ?? [],
          );
          importedBundles += 1;
          continue;
        }

        const record: WorkspaceImportRecord =
          typeof parsed === "object" && parsed !== null ? (parsed as WorkspaceImportRecord) : {};
        const payload = record.project ?? record.workspace;

        if (payload || looksLikeProjectData(record as Partial<ProjectData>)) {
          nextProject = normalizeProjectData((payload ?? record) as Partial<ProjectData> | LegacyWorkspace);
          importedWorkspaces += 1;

          if (record.layout) {
            applyWorkspaceLayout(record.layout);
          }

          if (record.settings?.themeMode === "light" || record.settings?.themeMode === "dark") {
            setThemeMode(record.settings.themeMode);
            window.localStorage.setItem("layang-theme", record.settings.themeMode);
          }
          continue;
        }

        const bundledProtoFiles = Array.isArray(record.protoFiles) ? record.protoFiles.filter(isProtoSourceFile) : [];
        const bundledExamples = Array.isArray(record.examples)
          ? record.examples.filter(isSavedExample)
          : Array.isArray(parsed)
            ? parsed.filter(isSavedExample)
            : [];
        const bundledDocs = Array.isArray(record.methodDocs) ? record.methodDocs.filter(isMethodDoc) : [];
        const bundledDocResults = Array.isArray(record.docResults) ? record.docResults.filter(isDocResultSnapshot) : [];

        if (bundledProtoFiles.length > 0) {
          nextProject = { ...nextProject, protoFiles: mergeProtoFiles(nextProject.protoFiles, bundledProtoFiles) };
          importedProtos += bundledProtoFiles.length;
          importedBundles += 1;
        }

        if (bundledExamples.length > 0) {
          nextProject = { ...nextProject, examples: mergeExamples(nextProject.examples, bundledExamples) };
          importedExamples += bundledExamples.length;
        }

        if (bundledDocs.length > 0 || bundledDocResults.length > 0) {
          nextProject = {
            ...nextProject,
            methodDocs: mergeMethodDocs(nextProject.methodDocs, bundledDocs),
            docResults: mergeDocResults(nextProject.docResults, bundledDocResults),
          };
          importedDocs += bundledDocs.length + bundledDocResults.length;
        }
      }

      applyProject(nextProject);
      window.localStorage.setItem(projectStorageKey, JSON.stringify(nextProject));
      const parts = [
        importedWorkspaces ? `${importedWorkspaces} workspace` : "",
        importedProtos ? `${importedProtos} proto` : "",
        importedExamples ? `${importedExamples} example` : "",
        importedBundles ? `${importedBundles} bundle` : "",
        importedDocs ? `${importedDocs} docs item` : "",
      ].filter(Boolean);
      showToast(
        parts.length ? `Imported ${parts.join(", ")}.` : "No supported workspace data found.",
        parts.length ? "success" : "warning",
      );
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      showToast(message, "error");
    } finally {
      if (projectInputRef.current) projectInputRef.current.value = "";
    }
  }

  /**
   * Imports collection files or endpoint bundles selected by the user.
   */
  async function handleProtoFiles(files: FileList | null) {
    setError("");
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    if (!files || files.length === 0) return;

    try {
      const fileArray = Array.from(files);
      const endpointBundles = fileArray.filter((file) => file.name.toLowerCase().endsWith(".json"));
      for (const file of endpointBundles) {
        await importEndpointBundleText(await file.text());
      }

      const protoOnly = fileArray.filter((file) => file.name.toLowerCase().endsWith(".proto"));
      if (protoOnly.length === 0) {
        showToast(
          endpointBundles.length ? "Collection data loaded." : "No collection .json or .proto file selected.",
          endpointBundles.length ? "success" : "warning",
        );
        return;
      }

      const incoming = await Promise.all(
        protoOnly.map(async (file) => ({
          name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
          text: await file.text(),
        })),
      );
      const merged = mergeProtoFiles(protoFiles, incoming);
      const result = loadProtoFiles(merged);
      setProtoFiles(merged);
      setLoaded(result);

      if (result.methods.length === 0) {
        setSelectedMethodKey("");
        setRequestJson("{}");
        setError("Proto loaded, but no RPC methods were found.");
        showToast("Proto loaded, but no RPC methods were found.", "warning");
        return;
      }

      const method =
        result.methods.find((item) =>
          incoming.some((file) =>
            methodKey(item)
              .toLowerCase()
              .includes(file.name.toLowerCase().replace(/\.proto$/, "")),
          ),
        ) ?? result.methods[0];
      const pendingCollectionId = pendingCollectionImportRef.current;
      pendingCollectionImportRef.current = "";
      if (pendingCollectionId) {
        addCollectionRequest(pendingCollectionId, "grpc", {
          name: method.methodName,
          url: buildGrpcWebUrl(draftEffectiveBaseUrl, method.serviceName, method.methodName),
          grpcMethodKey: methodKey(method),
          body: JSON.stringify(generateExampleFromType(result.root, method.requestType), null, 2),
        });
      } else {
        selectMethod(result.root, method);
      }
      setSideSection("registry");
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      showToast(message, "error");
    } finally {
      pendingCollectionImportRef.current = "";
      if (protoInputRef.current) protoInputRef.current.value = "";
    }
  }

  /**
   * Removes a proto source file and rebuilds the loaded registry.
   */
  function removeProtoFile(name: string) {
    const next = protoFiles.filter((file) => file.name !== name);
    setProtoFiles(next);
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);

    if (next.length === 0) {
      setLoaded(null);
      setSelectedMethodKey("");
      setRequestJson("{}");
      return;
    }

    try {
      const result = loadProtoFiles(next);
      setLoaded(result);
      const method = result.methods[0];
      if (method) selectMethod(result.root, method);
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      showToast(message, "error");
      setLoaded(null);
      setSelectedMethodKey("");
    }
  }

  /**
   * Loads the built-in sample proto so the app can be tried quickly.
   */
  function loadSample() {
    setError("");
    const sample = [{ name: "greeter.proto", text: sampleProto }];
    try {
      const merged = mergeProtoFiles(protoFiles, sample);
      const result = loadProtoFiles(merged);
      setProtoFiles(merged);
      setLoaded(result);
      if (result.methods[0]) selectMethod(result.root, result.methods[0]);
      setSideSection("registry");
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      showToast(message, "error");
    }
  }

  /**
   * Displays a transient status message to the user.
   */
  function showToast(message: string, severity: "info" | "success" | "warning" | "error" = "info") {
    setToast({ id: Date.now(), open: true, message, severity });
  }

  function handleResponseBodyScroll(event: ReactUiEvent<HTMLDivElement>) {
    if (responseTab !== "messages") return;
    setShowMessageTopButton(event.currentTarget.scrollTop > 96);
  }

  function scrollMessagesToTop() {
    responseBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setShowMessageTopButton(false);
  }

  useEffect(() => {
    if (responseTab !== "messages") {
      setShowMessageTopButton(false);
      return;
    }
    const node = responseBodyRef.current;
    setShowMessageTopButton(Boolean(node && node.scrollTop > 96));
  }, [responseTab]);

  /**
   * Selects a method and reuses an existing tab for the same service/method pair.
   */
  function selectMethod(root: protobuf.Root, method: RpcMethodInfo) {
    setActiveCollectionRequestId("");
    const key = methodKey(method);
    const existing = requestSessions.find((session) => session.methodKey === key);
    if (existing) {
      activateRequestSession(existing);
      return;
    }

    const grpcTransportMode: TransportMode = activeTransportMode === "native-grpc" ? "native-grpc" : "grpc-web";
    const session = createRequestSession(root, method, {
      metadata,
      transportMode: grpcTransportMode,
      baseUrl: grpcBaseUrlFallback(activeBaseUrl, baseUrl),
      nativeTarget: activeNativeTarget,
      environmentKey: activeEnvironmentKey,
      assertionJson,
    });
    setRequestSessions((current) => [session, ...current.filter((item) => item.methodKey !== key)].slice(0, 16));
    activateRequestSession(session);
  }

  /**
   * Makes a request tab active and restores its request/response state.
   */
  function activateRequestSession(session: RequestSession) {
    if (activeRequestIdRef.current && activeRequestIdRef.current !== session.id) {
      updateRequestSession(activeRequestIdRef.current, { events, lastResult, assertionResults, responseTab });
    }

    activeRequestIdRef.current = session.id;
    setActiveRequestId(session.id);
    if (session.requestKind) {
      setActiveCollectionRequestId(session.methodKey);
      setSelectedMethodKey("");
    } else {
      setActiveCollectionRequestId("");
      setSelectedMethodKey(session.methodKey);
    }
    setRequestJson(session.requestJson);
    setMetadata(session.metadata.length ? session.metadata : defaultMetadata);
    const nextTransportMode: TransportMode =
      session.requestKind === "websocket"
        ? "websocket"
        : session.transportMode === "websocket"
          ? "grpc-web"
          : (session.transportMode ?? transportMode);
    setTransportMode(nextTransportMode);
    if (session.requestKind !== "websocket") setBaseUrl(grpcBaseUrlFallback(session.baseUrl, baseUrl));
    setNativeTarget(session.nativeTarget ?? nativeTarget);
    setEnvironmentKey(session.environmentKey ?? environmentKey);
    setAssertionJson(session.assertionJson ?? assertionJson);
    setEvents(session.events ?? []);
    setLastResult(session.lastResult ?? null);
    setAssertionResults(session.assertionResults ?? []);
    setResponseTab(normalizeVisibleResponseTab(session.responseTab));
  }

  /**
   * Clears the active editor and response view state.
   */
  function clearActiveView() {
    activeRequestIdRef.current = "";
    setActiveRequestId("");
    setSelectedMethodKey("");
    setActiveCollectionRequestId("");
    setRequestJson("{}");
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    setResponseTab("messages");
  }

  /**
   * Closes one request tab and selects the next available tab.
   */
  function closeRequestSession(sessionId: string) {
    requestRunner.cancelRequest(sessionId);
    if (wsClientRef.current?.sessionId === sessionId) closeManualWebSocketClient("Tab closed");
    setRequestSessions((current) => {
      const next = current.filter((session) => session.id !== sessionId);

      if (sessionId === activeRequestId) {
        const replacement = next[0];
        if (replacement) queueMicrotask(() => activateRequestSession(replacement));
        else queueMicrotask(clearActiveView);
      }

      return next;
    });
  }

  /**
   * Closes every request tab.
   */
  function closeAllRequestSessions() {
    requestSessions.forEach((session) => {
      requestRunner.cancelRequest(session.id);
    });
    setRequestSessions([]);
    clearActiveView();
  }

  /**
   * Closes all request tabs except the target tab.
   */
  function closeOtherRequestSessions(sessionId = activeRequestId) {
    if (!sessionId) return;
    const keptSession = requestSessions.find((session) => session.id === sessionId);
    requestSessions
      .filter((session) => session.id !== sessionId)
      .forEach((session) => {
        requestRunner.cancelRequest(session.id);
      });
    setRequestSessions((current) => current.filter((session) => session.id === sessionId));
    if (keptSession && sessionId !== activeRequestId) queueMicrotask(() => activateRequestSession(keptSession));
  }

  /**
   * Clears only the active tab response payload and events.
   */
  function clearActiveResponse() {
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    setResponseTab("messages");
    updateActiveSession({
      events: [],
      lastResult: null,
      assertionResults: [],
      responseTab: "messages",
      status: activeRunning ? "running" : "idle",
    });
  }

  /**
   * Clears history for the active method only.
   */
  function clearHistory() {
    if (!activeExampleKey) return;
    setHistory((current) => current.filter((item) => item.method !== activeExampleKey));
  }

  /**
   * Patches a request tab by id while preserving unrelated tabs.
   */
  function updateRequestSession(sessionId: string, patch: Partial<RequestSession>) {
    if (!sessionId) return;
    setRequestSessions((current) =>
      current.map((session) =>
        session.id === sessionId ? { ...session, ...patch, updatedAt: new Date().toISOString() } : session,
      ),
    );
  }

  /**
   * Patches the currently active request tab.
   */
  function updateActiveSession(patch: Partial<RequestSession>) {
    updateRequestSession(activeRequestId, patch);
  }

  /**
   * Updates the saved definition for the active custom collection request.
   */
  function patchActiveCollectionRequest(patch: Partial<ApiCollectionRequest>) {
    if (!activeCollectionRequestId) return;
    setCollections((current) =>
      current.map((collection) => ({
        ...collection,
        requests: collection.requests.map((request) =>
          request.id === activeCollectionRequestId
            ? { ...request, ...patch, updatedAt: new Date().toISOString() }
            : request,
        ),
        updatedAt: collection.requests.some((request) => request.id === activeCollectionRequestId)
          ? new Date().toISOString()
          : collection.updatedAt,
      })),
    );
  }

  function updateActiveWebSocketMockResponse(value: string) {
    setWsMockResponseText(value);
    if (activeCollectionRequest?.kind === "websocket") patchActiveCollectionRequest({ mockResponse: value });
  }

  async function copyActiveWebSocketMockResponse() {
    try {
      await navigator.clipboard?.writeText(activeWebSocketMockResponseText);
      showToast("WebSocket mock response copied.", "success");
    } catch {
      showToast("Unable to copy WebSocket mock response.", "warning");
    }
  }

  function updateWebSocketSubprotocol(value: string) {
    const next = value.trim() ? [{ key: "Sec-WebSocket-Protocol", value }] : [];
    setMetadata(next);
    updateActiveSession({ metadata: next });
    patchActiveCollectionRequest({ headers: next });
  }

  function buildWebSocketMockPayload() {
    return {
      port: Math.max(1, Math.min(65535, Math.floor(Number(wsMockPort) || 8090))),
      path: wsMockPath.trim() || "/mock/ws",
      responseText: activeWebSocketMockResponseText,
      intervalMs: Math.max(1, Math.floor(Number(wsMockIntervalMs) || 1000)),
      loop: wsMockLoop,
      maxLoops: Math.max(0, Math.floor(Number(wsMockMaxLoops) || 0)),
      streamOnConnect: wsMockStreamOnConnect,
      sendOnMessage: false,
    };
  }

  async function startWebSocketMockServer() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket") {
      showToast("Select a WebSocket request before starting a WS mock server.", "warning");
      return;
    }
    if (!window.electronWsMock?.start) {
      showToast("WebSocket mock server is available in the desktop app only.", "warning");
      return;
    }
    const result = await window.electronWsMock.start(buildWebSocketMockPayload());
    if (!result?.ok) {
      showToast(result?.error || "Unable to start WebSocket mock server.", "error");
      return;
    }
    setWsMockStatus({ running: true, ...result });
    if (result.port) setWsMockPort(result.port);
    if (result.path) setWsMockPath(result.path);
    if (result.url) {
      setTargetDraft(result.url);
      updateActiveSession({ baseUrl: result.url, requestUrl: result.url });
      patchActiveCollectionRequest({ url: result.url });
    }
    showToast("WebSocket mock server started.", "success");
  }

  async function stopWebSocketMockServer() {
    if (!window.electronWsMock?.stop) {
      showToast("WebSocket mock server is available in the desktop app only.", "warning");
      return;
    }
    const result = await window.electronWsMock.stop();
    if (!result?.ok) {
      showToast(result?.error || "Unable to stop WebSocket mock server.", "error");
      return;
    }
    setWsMockStatus({ running: false });
    showToast("WebSocket mock server stopped.", "success");
  }

  async function sendWebSocketMockOnce() {
    if (!window.electronWsMock?.send) {
      showToast("WebSocket mock server is available in the desktop app only.", "warning");
      return;
    }
    const result = await window.electronWsMock.send({ responseText: activeWebSocketMockResponseText });
    if (!result?.ok) {
      showToast(result?.error || "Start the WebSocket mock server before sending a message.", "warning");
      return;
    }
    setWsMockStatus((current) => ({ ...current, ...result, running: result.running ?? current.running }));
    const sent = result.sent ?? 0;
    showToast(
      sent > 0
        ? `Sent mock message to ${sent} WebSocket client(s).`
        : "No mock message was sent. Connect a client or enable Loop after the sequence is finished.",
      sent > 0 ? "success" : "info",
    );
  }

  function webSocketProtocolsFromActiveMetadata() {
    const value = metadata.find((item) => item.key.trim().toLowerCase() === "sec-websocket-protocol")?.value ?? "";
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function buildWebSocketResult(
    client: ManagedWebSocketClient,
    trailers: Record<string, string> = { "grpc-status": "0", "grpc-message": "WebSocket connected" },
  ): GrpcResult {
    const completedAt = new Date();
    return {
      httpStatus: 101,
      headers: { upgrade: "websocket" },
      trailers,
      messages: [...client.messages],
      totalMessages: client.messages.length,
      durationMs: completedAt.getTime() - client.startedAt.getTime(),
      requestUrl: client.url,
      startedAt: client.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      transport: "websocket",
    };
  }

  function updateWebSocketLiveResult(client: ManagedWebSocketClient) {
    const result = buildWebSocketResult(client);
    const evaluatedAssertions = evaluateAssertions(result, assertionJson);
    if (activeRequestIdRef.current === client.sessionId) {
      setLastResult(result);
      setAssertionResults(evaluatedAssertions);
      setResponseTab("messages");
    }
    updateRequestSession(client.sessionId, {
      lastResult: result,
      assertionResults: evaluatedAssertions,
      responseTab: "messages",
      status: "running",
    });
  }

  function prepareWebSocketClientSession(url: string) {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket") {
      showToast("Select a WebSocket request before sending a message.", "warning");
      return null;
    }
    const now = new Date().toISOString();
    const reusableSession =
      requestSessions.find((session) => session.methodKey === activeCollectionRequest.id) ??
      (activeSession?.methodKey === activeCollectionRequest.id ? activeSession : null);
    const session: RequestSession = {
      id: reusableSession?.id ?? createId(),
      methodKey: activeCollectionRequest.id,
      title: activeCollectionRequest.name,
      serviceName: activeCollectionRequest.collectionName ?? "WebSocket Collection",
      requestJson,
      metadata: metadata.map((item) => ({ ...item })),
      transportMode: "websocket",
      requestKind: "websocket",
      requestUrl: url,
      baseUrl: url,
      nativeTarget: activeNativeTarget,
      environmentKey: activeEnvironmentKey,
      assertionJson,
      responseTab: "messages",
      events: [],
      lastResult: null,
      assertionResults: [],
      running: true,
      status: "running",
      openedAt: reusableSession?.openedAt ?? now,
      updatedAt: now,
    };
    setError("");
    upsertRequestSessionPreservingOrder(session);
    activateRequestSession(session);
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    setResponseTab("messages");
    return session;
  }

  function appendWebSocketEvent(sessionId: string, event: GrpcEvent) {
    appendLiveEventToSession(sessionId, event);
  }

  function closeManualWebSocketClient(reason = "Closed by user", notify = true) {
    const client = wsClientRef.current;
    if (!client) return;
    wsClientRef.current = null;
    try {
      if (client.socket.readyState === WebSocket.OPEN || client.socket.readyState === WebSocket.CONNECTING) {
        client.socket.close(1000, reason);
      }
    } catch {
      // Ignore browser WebSocket close errors.
    }
    setWsClientState((current) => ({ ...current, readyState: "closed" }));
    updateRequestSession(client.sessionId, { running: false, status: "done" });
    if (notify) showToast("WebSocket disconnected.", "info");
  }

  function sendMessageThroughActiveWebSocket(client: ManagedWebSocketClient) {
    const body = requestJson.trim();
    if (!body) {
      showToast("Message body is empty. Add data in the Message tab before sending.", "warning");
      return false;
    }
    client.socket.send(body);
    appendWebSocketEvent(client.sessionId, {
      type: "log",
      level: "info",
      message: "WebSocket message sent",
      details: safeJsonParse(body),
    });
    updateActiveSession({ requestJson: body, requestUrl: client.url, baseUrl: client.url, status: "running" });
    patchActiveCollectionRequest({ body, url: client.url });
    showToast("WebSocket message sent.", "success");
    return true;
  }

  function handleSendWebSocketMessage() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket") {
      showToast("Select a WebSocket request before sending a message.", "warning");
      return;
    }
    const url = (targetDraft || activeCollectionRequest.url || activeBaseUrl).trim();
    if (!url || !isWebSocketUrl(url)) {
      showToast("Use a ws:// or wss:// URL before sending a WebSocket message.", "warning");
      return;
    }
    commitTargetDraft(url);

    const existing = wsClientRef.current;
    if (
      existing &&
      existing.requestId === activeCollectionRequest.id &&
      existing.url === url &&
      existing.socket.readyState === WebSocket.OPEN
    ) {
      sendMessageThroughActiveWebSocket(existing);
      return;
    }

    if (existing) closeManualWebSocketClient("Switching WebSocket request", false);
    const session = prepareWebSocketClientSession(url);
    if (!session) return;

    let socket: WebSocket;
    try {
      const protocols = webSocketProtocolsFromActiveMetadata();
      socket = protocols.length ? new WebSocket(url, protocols) : new WebSocket(url);
    } catch (err) {
      updateRequestSession(session.id, { running: false, status: "error" });
      showToast(toErrorMessage(err), "error");
      return;
    }

    const client: ManagedWebSocketClient = {
      socket,
      sessionId: session.id,
      requestId: activeCollectionRequest.id,
      url,
      startedAt: new Date(),
      messages: [],
    };
    wsClientRef.current = client;
    setWsClientState({ readyState: "connecting", url, sessionId: session.id, messageCount: 0 });
    appendWebSocketEvent(session.id, { type: "log", level: "info", message: "Opening WebSocket", details: { url } });

    socket.onopen = () => {
      appendWebSocketEvent(session.id, {
        type: "headers",
        httpStatus: 101,
        headers: { upgrade: "websocket" },
        contentType: "",
      });
      setWsClientState({ readyState: "open", url, sessionId: session.id, messageCount: client.messages.length });
      sendMessageThroughActiveWebSocket(client);
    };

    socket.onmessage = (event) => {
      const value = safeJsonParse(String(event.data));
      client.messages.push(value);
      appendWebSocketEvent(session.id, { type: "message", index: client.messages.length - 1, value });
      setWsClientState({ readyState: "open", url, sessionId: session.id, messageCount: client.messages.length });
      updateWebSocketLiveResult(client);
    };

    socket.onerror = () => {
      const message = "WebSocket connection failed.";
      appendWebSocketEvent(session.id, { type: "error", message, details: { url } });
      setWsClientState((current) => ({ ...current, readyState: "closed", lastError: message }));
      updateRequestSession(session.id, { running: false, status: "error" });
      showToast(message, "error");
    };

    socket.onclose = (event) => {
      const ok = event.wasClean || client.messages.length > 0 || event.code === 1000;
      const trailers = {
        "grpc-status": ok ? "0" : "2",
        "grpc-message": event.reason || (ok ? "WebSocket closed" : "WebSocket closed unexpectedly"),
        "websocket-code": String(event.code),
      };
      appendWebSocketEvent(session.id, { type: "trailers", trailers });
      const result = buildWebSocketResult(client, trailers);
      const evaluatedAssertions = evaluateAssertions(result, assertionJson);
      if (activeRequestIdRef.current === session.id) {
        setLastResult(result);
        setAssertionResults(evaluatedAssertions);
      }
      updateRequestSession(session.id, {
        lastResult: result,
        assertionResults: evaluatedAssertions,
        running: false,
        status: ok ? "done" : "error",
      });
      const timestamp = new Date().toISOString();
      setHistory((current) =>
        [
          {
            id: createId(),
            method: `${activeCollectionRequest.collectionName ?? "Collection"}/${activeCollectionRequest.name}`,
            status: trailers["grpc-status"],
            durationMs: result.durationMs,
            messageCount: client.messages.length,
            time: formatTimestampShort(timestamp),
            timestamp,
          },
          ...current,
        ].slice(0, 80),
      );
      if (wsClientRef.current?.sessionId === session.id) wsClientRef.current = null;
      setWsClientState({ readyState: "closed", url, sessionId: session.id, messageCount: client.messages.length });
    };
  }

  function openAddCollectionDialog() {
    setCollectionMenuAnchor(null);
    setCollectionNameDraft(nextCollectionName());
    setCollectionDialogOpen(true);
  }

  function nextCollectionName() {
    let index = collections.length + 1;
    let name = collections.length === 0 ? "Untitled WS Collection" : `Untitled WS Collection ${index}`;
    const names = new Set(collections.map((collection) => collection.name.toLowerCase()));
    while (names.has(name.toLowerCase())) {
      index += 1;
      name = `Untitled WS Collection ${index}`;
    }
    return name;
  }

  function nextWebSocketRequestName(collectionId: string) {
    const collection = collections.find((item) => item.id === collectionId);
    const names = new Set((collection?.requests ?? []).map((request) => request.name.toLowerCase()));
    let index = (collection?.requests.length ?? 0) + 1;
    let name = index <= 1 ? "New WebSocket Request" : `New WebSocket Request ${index}`;
    while (names.has(name.toLowerCase())) {
      index += 1;
      name = `New WebSocket Request ${index}`;
    }
    return name;
  }

  function openAddWebSocketRequestDialog(collectionId: string) {
    setRequestTargetCollectionId(collectionId);
    setRequestNameDraft(nextWebSocketRequestName(collectionId));
    setRequestNameDialogOpen(true);
  }

  function confirmAddWebSocketRequest() {
    const name = requestNameDraft.trim();
    if (!requestTargetCollectionId) {
      setRequestNameDialogOpen(false);
      return;
    }
    if (!name) {
      showToast("WebSocket request name is required.", "warning");
      return;
    }
    addCollectionRequest(requestTargetCollectionId, "websocket", {
      name,
      mockResponse: defaultWebSocketMockResponse(name),
    });
    setRequestNameDialogOpen(false);
    setRequestTargetCollectionId("");
  }

  function confirmAddCollection() {
    const name = collectionNameDraft.trim();
    if (!name) {
      showToast("Collection name is required.", "warning");
      return;
    }
    const now = new Date().toISOString();
    const collection: ApiCollection = { id: createId(), name, requests: [], createdAt: now, updatedAt: now };
    setCollections((current) => [collection, ...current]);
    setCollectionDialogOpen(false);
    showToast("WebSocket collection added.", "success");
  }

  function removeCollection(collectionId: string) {
    setCollections((current) => current.filter((collection) => collection.id !== collectionId));
    const removedRequestIds = new Set(
      collections.find((collection) => collection.id === collectionId)?.requests.map((request) => request.id) ?? [],
    );
    setRequestSessions((current) => current.filter((session) => !removedRequestIds.has(session.methodKey)));
    if (removedRequestIds.has(activeCollectionRequestId)) clearActiveView();
  }

  function createCollectionRequest(
    collectionId: string,
    kind: ApiRequestKind,
    overrides: Partial<ApiCollectionRequest> = {},
  ): ApiCollectionRequest {
    const now = new Date().toISOString();
    const defaultName = kind === "grpc" ? "gRPC Request" : "WebSocket Request";
    const defaultUrl = kind === "grpc" ? draftEffectiveBaseUrl : "ws://localhost:8080";
    return {
      id: createId(),
      collectionId,
      name: overrides.name ?? defaultName,
      kind,
      method: overrides.method,
      url: overrides.url ?? defaultUrl,
      grpcMethodKey: overrides.grpcMethodKey,
      body: overrides.body ?? (kind === "grpc" ? "{}" : ""),
      headers: overrides.headers ?? [],
      mockResponse:
        overrides.mockResponse ??
        (kind === "websocket" ? defaultWebSocketMockResponse(overrides.name ?? defaultName) : undefined),
      createdAt: now,
      updatedAt: now,
    };
  }

  function addCollectionRequest(
    collectionId: string,
    kind: ApiRequestKind,
    overrides: Partial<ApiCollectionRequest> = {},
  ) {
    const request = createCollectionRequest(collectionId, kind, overrides);
    const existingCollection = collections.find((collection) => collection.id === collectionId);
    const fallbackCollection: ApiCollection = {
      id: collectionId,
      name: "Collection",
      requests: [],
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
    const nextCollection = {
      ...(existingCollection ?? fallbackCollection),
      requests: [request, ...(existingCollection?.requests ?? [])],
      updatedAt: new Date().toISOString(),
    };
    setCollections((current) =>
      current.map((collection) => (collection.id === collectionId ? nextCollection : collection)),
    );
    selectCollectionRequest(nextCollection, request);
    showToast(`${request.name} added.`, "success");
  }

  function importGrpcRequestIntoCollection(collectionId: string) {
    pendingCollectionImportRef.current = collectionId;
    protoInputRef.current?.click();
  }

  function createCollectionRequestSession(collection: ApiCollection, request: ApiCollectionRequest): RequestSession {
    const now = new Date().toISOString();
    const mode: TransportMode = request.kind === "websocket" ? "websocket" : "grpc-web";
    return {
      id: createId(),
      methodKey: request.id,
      title: request.name,
      serviceName: collection.name,
      requestJson: request.body || (request.kind === "grpc" ? "{}" : ""),
      metadata: request.headers.length ? request.headers.map((item) => ({ ...item })) : [],
      transportMode: mode,
      requestKind: request.kind,
      requestUrl: request.url,
      httpMethod: request.method,
      baseUrl: request.url,
      nativeTarget: activeNativeTarget,
      environmentKey: activeEnvironmentKey,
      assertionJson,
      responseTab: "messages",
      events: [],
      lastResult: null,
      assertionResults: [],
      running: false,
      status: "idle",
      openedAt: now,
      updatedAt: now,
    };
  }

  function selectCollectionRequest(collection: ApiCollection, request: ApiCollectionRequest) {
    if (request.kind === "grpc" && request.grpcMethodKey && loaded) {
      const grpcMethod = loaded.methods.find((method) => methodKey(method) === request.grpcMethodKey);
      if (grpcMethod) {
        selectMethod(loaded.root, grpcMethod);
        return;
      }
    }
    const existing = requestSessions.find((session) => session.methodKey === request.id);
    const session = existing ?? createCollectionRequestSession(collection, request);
    if (!existing) upsertRequestSessionPreservingOrder(session);
    activateRequestSession(session);
    setRequestTab("body");
  }

  /**
   * Inserts a new request tab or updates an existing one without changing tab order.
   */
  function upsertRequestSessionPreservingOrder(session: RequestSession) {
    setRequestSessions((current) => {
      const existingIndex = current.findIndex((item) => item.id === session.id || item.methodKey === session.methodKey);
      if (existingIndex === -1) return [session, ...current].slice(0, 16);

      const next = [...current];
      next[existingIndex] = session;
      return next.slice(0, 16);
    });
  }

  /**
   * Updates the active transport mode.
   */
  function handleTransportModeChange(value: TransportMode) {
    if (value === "rest") return;
    if (activeIsWebSocket && value !== "websocket") return;
    if (!activeIsWebSocket && value === "websocket") return;
    setTransportMode(value);
    updateActiveSession({ transportMode: value });
  }

  /**
   * Updates the active environment selection.
   */
  function handleEnvironmentKeyChange(value: EnvironmentKey) {
    setEnvironmentKey(value);
    updateActiveSession({ environmentKey: value });
  }

  /**
   * Commits a URL/target change to the active session or saved environment.
   */
  function handleTargetChange(value: string) {
    if (activeIsWebSocket) {
      updateActiveSession({ baseUrl: value, requestUrl: value });
      patchActiveCollectionRequest({ url: value });
      return;
    }

    if (activeEnvironmentKey !== "default" && activeEnvironmentKey !== "manual") {
      setEnvironments((current) =>
        current.map((env) =>
          env.key === activeEnvironmentKey
            ? activeTransportMode === "native-grpc"
              ? { ...env, nativeTarget: value }
              : { ...env, grpcWebBaseUrl: value }
            : env,
        ),
      );
      return;
    }

    if (activeTransportMode === "native-grpc") {
      setNativeTarget(value);
      updateActiveSession({ nativeTarget: value });
    } else {
      setBaseUrl(value);
      updateActiveSession({ baseUrl: value, requestUrl: value });
      patchActiveCollectionRequest({ url: value });
    }
  }

  /**
   * Updates the fast local URL/target draft without persisting on every keystroke.
   */
  function handleTargetDraftChange(value: string) {
    setTargetDraft(value);
  }

  /**
   * Persists the current URL/target draft after editing completes.
   */
  function commitTargetDraft(value = targetDraft) {
    handleTargetChange(value);
  }

  /**
   * Opens the dialog for saving the current URL/target as an environment.
   */
  function saveCurrentEnvironment() {
    setEnvMenuAnchor(null);
    const currentUrl = activeTransportMode === "native-grpc" ? draftEffectiveNativeTarget : draftEffectiveBaseUrl;
    setEnvDialogMode("create");
    setEnvEditingKey("");
    setEnvDraftName(
      selectedMethod
        ? `${selectedMethod.methodName} Env`
        : activeCollectionRequest
          ? `${activeCollectionRequest.name} Env`
          : "New Environment",
    );
    setEnvDraftUrl(currentUrl);
    setEnvDialogOpen(true);
  }

  /**
   * Validates and saves the environment draft.
   */
  function confirmSaveCurrentEnvironment() {
    const name = envDraftName.trim();
    const url = envDraftUrl.trim();
    if (!name) {
      showToast("Environment name is required.", "warning");
      return;
    }
    if (!url) {
      showToast(
        activeTransportMode === "native-grpc" ? "Native gRPC target is required." : "Request URL is required.",
        "warning",
      );
      return;
    }

    if (envDialogMode === "edit" && envEditingKey) {
      setEnvironments((current) =>
        current.map((env) =>
          env.key === envEditingKey
            ? {
                ...env,
                label: name,
                grpcWebBaseUrl: activeTransportMode === "native-grpc" ? env.grpcWebBaseUrl : url,
                nativeTarget: activeTransportMode === "native-grpc" ? url : env.nativeTarget,
              }
            : env,
        ),
      );
      setEnvDialogOpen(false);
      showToast(`Environment updated: ${name}`, "success");
      return;
    }

    const key = `custom-${slugify(name)}-${Date.now().toString(36)}`;
    const env: EnvironmentConfig = {
      key,
      label: name,
      grpcWebBaseUrl: activeTransportMode === "native-grpc" ? draftEffectiveBaseUrl : url,
      nativeTarget: activeTransportMode === "native-grpc" ? url : draftEffectiveNativeTarget,
    };
    setEnvironments((current) => featureMergeEnvironments([...current, env]));
    handleEnvironmentKeyChange(key);
    setEnvDialogOpen(false);
    showToast(`Environment saved: ${env.label}`, "success");
  }

  /**
   * Applies an environment from the compact environment menu.
   */
  function chooseEnvironment(key: EnvironmentKey) {
    handleEnvironmentKeyChange(key);
    setEnvMenuAnchor(null);
  }

  /**
   * Opens the environment edit dialog from the right-click menu action.
   */
  function openEnvironmentManager(env: EnvironmentConfig) {
    setEnvMenuAnchor(null);
    setEnvDialogMode("edit");
    setEnvEditingKey(env.key);
    setEnvDraftName(env.label);
    setEnvDraftUrl(activeTransportMode === "native-grpc" ? env.nativeTarget : env.grpcWebBaseUrl);
    setEnvDialogOpen(true);
  }

  /**
   * Removes a custom environment and falls back to manual/default selection.
   */
  function removeEditingEnvironment() {
    if (!envEditingKey || defaultEnvironments.some((env) => env.key === envEditingKey)) {
      showToast("Default environments can be updated, but not removed.", "warning");
      return;
    }
    setEnvironments((current) => current.filter((env) => env.key !== envEditingKey));
    if (activeEnvironmentKey === envEditingKey) handleEnvironmentKeyChange("manual");
    setEnvDialogOpen(false);
    showToast("Environment removed.", "success");
  }

  /**
   * Updates the request JSON for the active method.
   */
  function handleRequestJsonChange(value: string) {
    setRequestJson(value);
    updateActiveSession({ requestJson: value });
    patchActiveCollectionRequest({ body: value });
  }

  /**
   * Formats the request body as pretty JSON.
   */
  function prettifyRequestJson() {
    try {
      const text = JSON.stringify(JSON.parse(requestJson), null, 2);
      handleRequestJsonChange(text);
      showToast("Body JSON formatted.", "success");
    } catch (err) {
      showToast(`Invalid JSON: ${toErrorMessage(err)}`, "error");
    }
  }

  /**
   * Generates a random request body from the selected protobuf request type.
   */
  function generateRandomRequestJson() {
    if (!loaded || !selectedMethod) return;
    try {
      const randomBody = generateRandomExampleFromType(loaded.root, selectedMethod.requestType);
      handleRequestJsonChange(JSON.stringify(randomBody, null, 2));
      showToast("Random body generated from proto field types.", "success");
    } catch (err) {
      showToast(toErrorMessage(err), "error");
    }
  }

  /**
   * Generates the request body from the selected mock scenario input matcher.
   */
  function generateRequestJsonFromSelectedScenario() {
    if (!selectedMethod) {
      showToast("Select a method before generating a body from a scenario.", "warning");
      return;
    }
    const scenario = currentMockActiveScenario ?? currentMockScenarios[0];
    if (!scenario) {
      showToast("No scenario is available for the selected method.", "warning");
      return;
    }
    const body = extractRequestBodyFromMockScenario(scenario);
    if (body === undefined) {
      showToast("Selected scenario has no input equals/contains data.", "warning");
      return;
    }
    handleRequestJsonChange(JSON.stringify(body, null, 2));
    showToast(`Body generated from scenario ${scenario.id}.`, "success");
  }

  /**
   * Updates only the active scenario shown in the editor. Other scenarios stay in the method file.
   */
  function handleMockScenarioTextChange(value: string) {
    if (!selectedMethod || !currentMockActiveScenario) return;
    setMockScenarioEditorDraft({
      methodKey: methodKey(selectedMethod),
      scenarioId: currentMockActiveScenario.id,
      format: currentMockFile.format,
      text: value,
    });
    const parsed = parseMockScenarioText(value, currentMockFile.format, mockServer.port);
    if (!parsed.ok || parsed.bundle.scenarios.length === 0) return;
    const nextScenario = {
      ...parsed.bundle.scenarios[0],
      id: parsed.bundle.scenarios[0].id || currentMockActiveScenario.id,
      service: selectedMethod.serviceName,
      method: selectedMethod.methodName,
    };
    setMockServer((current) =>
      replaceActiveMockScenarioInMethodFile(current, selectedMethod, currentMockActiveScenario.id, nextScenario),
    );
  }

  /**
   * Updates the mock server port. Scenario files stay split per method.
   */
  function handleMockPortChange(value: string) {
    const port = clamp(Math.floor(Number(value) || defaultMockPort), 1, 65535);
    setMockServer((current) => ({ ...current, port, updatedAt: new Date().toISOString() }));
  }

  /**
   * Switches the selected method scenario file between JSON and YAML.
   */
  function handleMockFormatChange(format: MockFormat) {
    if (!selectedMethod) {
      setMockServer((current) => ({ ...current, format, updatedAt: new Date().toISOString() }));
      return;
    }
    setMockServer((current) => {
      const file = getMockMethodScenarioFile(current, selectedMethod);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      const nextText = parsed.ok ? formatMockScenarioBundle(parsed.bundle, format) : file.scenarioText;
      return updateMockMethodScenarioFile({ ...current, format }, selectedMethod, { format, scenarioText: nextText });
    });
  }

  /**
   * Formats the selected method scenario file with stable JSON/YAML indentation.
   */
  function formatMockScenarioEditor() {
    if (!selectedMethod) {
      showToast("Select a method before formatting a mock scenario file.", "warning");
      return;
    }
    const file = getMockMethodScenarioFile(mockServer, selectedMethod);
    const parsed = parseMockScenarioText(file.scenarioText, file.format, mockServer.port);
    if (!parsed.ok) {
      showToast(parsed.error, "error");
      return;
    }
    setMockServer((current) =>
      updateMockMethodScenarioFile(current, selectedMethod, {
        scenarioText: formatMockScenarioBundle(parsed.bundle, file.format),
      }),
    );
    showToast("Method mock scenario file formatted.", "success");
  }

  /**
   * Rebuilds one external mock scenario file per loaded proto method.
   */
  function _generateMockMappingFromProto() {
    const methods = loaded?.methods ?? [];
    if (methods.length === 0) {
      showToast("Import proto files before generating mock mappings.", "warning");
      return;
    }
    setMockServer((current) => {
      const previous = current.methodFiles ?? {};
      const nextFiles: Record<string, MockMethodScenarioFile> = { ...previous };
      const selectedScenarioIds = { ...current.selectedScenarioIds };
      const enabledMethods = { ...current.enabledMethods };
      methods.forEach((method, index) => {
        const key = methodKey(method);
        const previousFile = previous[key];
        if (previousFile) {
          const parsed = parseMockScenarioText(previousFile.scenarioText, previousFile.format, current.port);
          const existingScenarios = parsed.ok
            ? parsed.bundle.scenarios.filter(
                (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
              )
            : [];
          if (!selectedScenarioIds[key] && existingScenarios.length) selectedScenarioIds[key] = existingScenarios[0].id;
          if (!(key in enabledMethods)) enabledMethods[key] = existingScenarios.length > 0;
          return;
        }
        const scenario = buildDefaultMockScenario(
          method,
          loaded?.root,
          index,
          key === activeMethodKey ? requestJson : undefined,
          current.streamDefaults,
        );
        const fileFormat = current.format;
        const bundle: MockScenarioBundle = { version: 1, scenarios: [scenario] };
        nextFiles[key] = {
          format: fileFormat,
          scenarioText: formatMockScenarioBundle(bundle, fileFormat),
          updatedAt: new Date().toISOString(),
        };
        selectedScenarioIds[key] = scenario.id;
        enabledMethods[key] = true;
      });
      return {
        ...current,
        selectedScenarioIds,
        enabledMethods,
        methodFiles: nextFiles,
        updatedAt: new Date().toISOString(),
      };
    });
    setRequestTab("mock");
    setSideSection("mocks");
    setSidebarOpen(true);
    showToast(`Generated ${methods.length} mock file(s), one per method.`, "success");
  }

  /**
   * Adds one editable mock scenario for the active method and current request.
   */
  function addMockScenarioFromCurrent() {
    if (!selectedMethod) {
      showToast("Select a method before adding a mock scenario.", "warning");
      return;
    }
    addMockScenarioForMethod(selectedMethod);
  }

  /**
   * Adds one editable mock scenario for a specific method into that method's own file.
   */
  function addMockScenarioForMethod(method: RpcMethodInfo) {
    setMockServer((current) => {
      const file = getMockMethodScenarioFile(current, method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      const bundle: MockScenarioBundle = parsed.ok ? parsed.bundle : { version: 1, scenarios: [] };
      const methodScenarios = bundle.scenarios.filter(
        (item) => item.service === method.serviceName && item.method === method.methodName,
      );
      const key = methodKey(method);
      const scenario = ensureUniqueMockScenarioId(
        buildDefaultMockScenario(method, loaded?.root, methodScenarios.length, undefined, current.streamDefaults),
        methodScenarios,
      );
      const nextBundle: MockScenarioBundle = {
        ...bundle,
        scenarios: [scenario, ...methodScenarios],
      };
      const nextProject = updateMockMethodScenarioFile(current, method, {
        scenarioText: formatMockScenarioBundle(nextBundle, file.format),
      });
      return {
        ...nextProject,
        selectedScenarioIds: { ...nextProject.selectedScenarioIds, [key]: scenario.id },
        enabledMethods: { ...nextProject.enabledMethods, [key]: true },
      };
    });
    if (loaded) selectMethod(loaded.root, method);
    setRequestTab("mock");
    setMockSettingsOpen(false);
    setSideSection("mocks");
    setSidebarOpen(true);
    showToast(`Scenario added for ${method.methodName}.`, "success");
  }

  /**
   * Chooses the scenario that will be used when this method is enabled for mocking.
   */
  function handleMockScenarioSelectChange(method: RpcMethodInfo, scenarioId: string) {
    const key = methodKey(method);
    if (!scenarioId) return;
    setMockServer((current) => ({
      ...current,
      selectedScenarioIds: { ...current.selectedScenarioIds, [key]: scenarioId },
      updatedAt: new Date().toISOString(),
    }));
  }

  /** Opens the method-only scenario rename/delete dialog. */
  function openMockScenarioManager(method: RpcMethodInfo, scenarioId: string) {
    if (!scenarioId) return;
    setMockScenarioEditing({ methodKey: methodKey(method), scenarioId });
    setMockScenarioDraftId(scenarioId);
    setMockScenarioDialogOpen(true);
  }

  /** Renames the selected method scenario id and keeps the dropdown selection in sync. */
  function confirmRenameMockScenario() {
    if (!loaded || !mockScenarioEditing) return;
    const method = loaded.methods.find((item) => methodKey(item) === mockScenarioEditing.methodKey);
    if (!method) return;
    const nextId = mockScenarioDraftId.trim();
    if (!nextId) {
      showToast("Scenario name is required.", "warning");
      return;
    }
    const file = getMockMethodScenarioFile(mockServer, method);
    const parsed = parseMockScenarioText(file.scenarioText, file.format, mockServer.port);
    if (!parsed.ok) {
      showToast(parsed.error, "error");
      return;
    }
    const methodScenarios = parsed.bundle.scenarios.filter(
      (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
    );
    const exists = methodScenarios.some(
      (scenario) => scenario.id === nextId && scenario.id !== mockScenarioEditing.scenarioId,
    );
    if (exists) {
      showToast("Scenario name already exists for this method.", "warning");
      return;
    }
    if (!methodScenarios.some((scenario) => scenario.id === mockScenarioEditing.scenarioId)) {
      showToast("Scenario was not found for this method.", "warning");
      return;
    }
    setMockServer((current) => {
      const currentFile = getMockMethodScenarioFile(current, method);
      const currentParsed = parseMockScenarioText(currentFile.scenarioText, currentFile.format, current.port);
      if (!currentParsed.ok) return current;
      const nextScenarios = currentParsed.bundle.scenarios
        .filter((scenario) => scenario.service === method.serviceName && scenario.method === method.methodName)
        .map((scenario) => (scenario.id === mockScenarioEditing.scenarioId ? { ...scenario, id: nextId } : scenario));
      const nextBundle: MockScenarioBundle = { ...currentParsed.bundle, scenarios: nextScenarios };
      const nextProject = updateMockMethodScenarioFile(current, method, {
        scenarioText: formatMockScenarioBundle(nextBundle, currentFile.format),
      });
      const key = methodKey(method);
      const selectedScenarioIds = { ...nextProject.selectedScenarioIds };
      if (selectedScenarioIds[key] === mockScenarioEditing.scenarioId) selectedScenarioIds[key] = nextId;
      return { ...nextProject, selectedScenarioIds, updatedAt: new Date().toISOString() };
    });
    setMockScenarioEditorDraft(null);
    setMockScenarioDialogOpen(false);
    showToast("Scenario renamed.", "success");
  }

  /** Deletes the selected method scenario without touching other method files. */
  function deleteEditingMockScenario() {
    if (!loaded || !mockScenarioEditing) return;
    const method = loaded.methods.find((item) => methodKey(item) === mockScenarioEditing.methodKey);
    if (!method) return;
    const file = getMockMethodScenarioFile(mockServer, method);
    const parsed = parseMockScenarioText(file.scenarioText, file.format, mockServer.port);
    if (!parsed.ok) {
      showToast(parsed.error, "error");
      return;
    }
    if (
      !parsed.bundle.scenarios.some(
        (scenario) =>
          scenario.service === method.serviceName &&
          scenario.method === method.methodName &&
          scenario.id === mockScenarioEditing.scenarioId,
      )
    ) {
      showToast("Scenario was not found for this method.", "warning");
      return;
    }
    setMockServer((current) => {
      const currentFile = getMockMethodScenarioFile(current, method);
      const currentParsed = parseMockScenarioText(currentFile.scenarioText, currentFile.format, current.port);
      if (!currentParsed.ok) return current;
      const remaining = currentParsed.bundle.scenarios.filter(
        (scenario) =>
          !(
            scenario.service === method.serviceName &&
            scenario.method === method.methodName &&
            scenario.id === mockScenarioEditing.scenarioId
          ),
      );
      const nextBundle: MockScenarioBundle = { ...currentParsed.bundle, scenarios: remaining };
      const nextProject = updateMockMethodScenarioFile(current, method, {
        scenarioText: formatMockScenarioBundle(nextBundle, currentFile.format),
      });
      const key = methodKey(method);
      const methodRemaining = remaining.filter(
        (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
      );
      const selectedScenarioIds = { ...nextProject.selectedScenarioIds };
      if (
        selectedScenarioIds[key] === mockScenarioEditing.scenarioId ||
        !methodRemaining.some((scenario) => scenario.id === selectedScenarioIds[key])
      ) {
        if (methodRemaining[0]) selectedScenarioIds[key] = methodRemaining[0].id;
        else delete selectedScenarioIds[key];
      }
      const enabledMethods = { ...nextProject.enabledMethods };
      if (!methodRemaining.length) enabledMethods[key] = false;
      return { ...nextProject, selectedScenarioIds, enabledMethods, updatedAt: new Date().toISOString() };
    });
    setMockScenarioEditorDraft(null);
    setMockScenarioDialogOpen(false);
    showToast("Scenario deleted.", "success");
  }

  /**
   * Enables or disables mocking for one method without deleting that method's scenarios.
   */
  function handleMockMethodEnabledChange(method: RpcMethodInfo, enabled: boolean) {
    const key = methodKey(method);
    setMockServer((current) => ({
      ...current,
      enabledMethods: { ...current.enabledMethods, [key]: enabled },
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Updates stream overrides for one scenario. These values override the global defaults.
   */
  function handleMockScenarioStreamSettingsChange(
    method: RpcMethodInfo,
    scenarioId: string,
    patch: Partial<MockStreamSettings>,
  ) {
    setMockServer((current) => {
      const file = getMockMethodScenarioFile(current, method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      if (!parsed.ok) return current;
      const nextBundle: MockScenarioBundle = {
        ...parsed.bundle,
        scenarios: parsed.bundle.scenarios.map((scenario) => {
          if (
            scenario.service !== method.serviceName ||
            scenario.method !== method.methodName ||
            scenario.id !== scenarioId
          )
            return scenario;
          const currentStream = scenario.stream ?? {};
          const nextStream = normalizeMockStreamSettings({ ...currentStream, ...patch }, currentStream);
          return {
            ...scenario,
            stream: {
              ...currentStream,
              ...nextStream,
              responses: currentStream.responses,
            },
          };
        }),
      };
      return updateMockMethodScenarioFile(current, method, {
        scenarioText: formatMockScenarioBundle(nextBundle, file.format),
      });
    });
  }

  /**
   * Updates the global stream defaults stored once in mocks/mock-server.json.
   */
  function handleMockGlobalStreamBaseChange(patch: Partial<MockStreamSettings>) {
    setMockServer((current) => {
      const nextBase = normalizeMockStreamSettings(
        { ...current.streamDefaults, ...patch },
        current.streamDefaults,
      ) as Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>;
      if (patch.loop === true && patch.maxLoops === undefined && (nextBase.maxLoops ?? 0) <= 1) nextBase.maxLoops = 0;
      return { ...current, streamDefaults: nextBase, updatedAt: new Date().toISOString() };
    });
  }

  /**
   * Imports external mock JSON/YAML stubs into method scenario files.
   * If the stub does not name a service/method, the currently selected method is used.
   */
  async function importMockScenarioFile(files: FileList | null) {
    const fileArray = Array.from(files ?? []);
    if (fileArray.length === 0) return;
    try {
      let imported = 0;
      let nextProject = getProjectSnapshot();
      const fallbackMethod = selectedMethod ?? null;
      for (const file of fileArray) {
        const text = await file.text();
        const format: MockFormat = file.name.toLowerCase().endsWith(".json") ? "json" : "yaml";
        const scenarios = parseExternalScenarioImportText(text, format, fallbackMethod);
        if (scenarios.length === 0) {
          const parsed = parseMockScenarioText(text, format, mockServer.port);
          if (!parsed.ok) throw new Error(parsed.error);
          scenarios.push(
            ...parsed.bundle.scenarios.map((scenario) =>
              fallbackMethod
                ? { ...scenario, service: fallbackMethod.serviceName, method: fallbackMethod.methodName }
                : scenario,
            ),
          );
        }
        nextProject = mergeExternalScenarioScenariosIntoProject(nextProject, scenarios, loaded?.methods ?? []);
        imported += scenarios.length;
      }
      applyProject(nextProject);
      if (fallbackMethod) {
        setRequestTab("mock");
        setSideSection("mocks");
        setSidebarOpen(true);
      }
      showToast(
        imported ? `Imported ${imported} external mock scenario(s).` : "No supported external mock scenarios found.",
        imported ? "success" : "warning",
      );
    } catch (err) {
      showToast(toErrorMessage(err), "error");
    } finally {
      if (mockScenarioInputRef.current) mockScenarioInputRef.current.value = "";
    }
  }

  /**
   * Exports the selected method scenario file in JSON/YAML format.
   */
  function exportMockScenarioFile() {
    if (!selectedMethod) {
      showToast("Select a method before exporting a mock scenario file.", "warning");
      return;
    }
    const file = getMockMethodScenarioFile(mockServer, selectedMethod);
    const parsed = parseMockScenarioText(file.scenarioText, file.format, mockServer.port);
    if (!parsed.ok) {
      showToast(parsed.error, "error");
      return;
    }
    const extension = file.format === "json" ? "json" : "yaml";
    const mime = file.format === "json" ? "application/json" : "application/x-yaml";
    downloadTextFile(
      `${safeMockFileBaseName(selectedMethod)}.${extension}`,
      formatMockScenarioBundle(parsed.bundle, file.format),
      mime,
    );
  }

  /**
   * Opens the workspace mock scenario folder so JSON/YAML files can be edited directly on disk.
   */
  async function openMockScenarioFolder() {
    if (!window.electronWorkspace?.saveFolder || !window.electronWorkspace?.openPath) {
      showToast("Open mock scenario folder is available in the desktop app only.", "warning");
      return;
    }

    const diskMockServer = selectedMethod
      ? updateMockMethodScenarioFile(mockServer, selectedMethod, currentMockFile)
      : mockServer;
    if (diskMockServer !== mockServer) setMockServer(diskMockServer);

    const project = { ...getProjectSnapshot(), mockServer: diskMockServer, updatedAt: new Date().toISOString() };
    const bundle: WorkspaceExportBundle = {
      ...getWorkspaceExportBundle(),
      exportedAt: new Date().toISOString(),
      project,
    };

    try {
      const saveResult = await window.electronWorkspace.saveFolder(bundle, workspaceFolderPath || undefined);
      if (!saveResult.ok || saveResult.cancelled) return;
      const nextPath = saveResult.directoryPath ?? workspaceFolderPath;
      if (!nextPath) {
        showToast("Workspace folder path is missing.", "warning");
        return;
      }

      setWorkspaceFolderPath(nextPath);
      window.localStorage.setItem(workspaceFolderStorageKey, nextPath);
      const relativePath = selectedMethod
        ? `mocks/scenarios/${safeMockFileBaseName(selectedMethod)}.${currentMockFile.format === "yaml" ? "yaml" : "json"}`
        : "mocks/scenarios";
      const openResult = await window.electronWorkspace.openPath(nextPath, relativePath, {
        ensureDirectory: !selectedMethod,
        reveal: Boolean(selectedMethod),
      });
      if (!openResult.ok) {
        showToast(`Open mock scenario folder failed: ${openResult.error ?? "Unknown error"}`, "error");
        return;
      }
      showToast(selectedMethod ? "Mock scenario file opened in folder." : "Mock scenario folder opened.", "success");
    } catch (err) {
      showToast(`Open mock scenario folder failed: ${toErrorMessage(err)}`, "error");
    }
  }

  /**
   * Pushes current JSON/YAML editor content into the running runtime without closing active streams.
   */
  async function syncRunningMockServerFromEditor() {
    if (!mockServerStatus.running || !loaded || !window.electronMock?.update) return;
    const parsed = parseAllMockScenarioFiles(mockServer, loaded.methods);
    if (!parsed.ok) {
      setMockServerStatus((current) =>
        current.running ? { ...current, message: `Live reload paused: ${parsed.error}` } : current,
      );
      return;
    }
    const activeScenarioIds = resolveMockActiveScenarioIds(
      parsed.bundle,
      loaded.methods,
      mockServer.selectedScenarioIds,
    );
    const result = await window.electronMock.update({
      scenarios: parsed.bundle.scenarios,
      streamDefaults: mockServer.streamDefaults,
      activeScenarioIds,
      enabledMethods: mockServer.enabledMethods,
    });
    if (!result.ok) {
      setMockServerStatus((current) =>
        current.running ? { ...current, message: result.error ?? "Live reload failed." } : current,
      );
      return;
    }
    setMockServerStatus((current) =>
      current.running
        ? {
            ...current,
            scenarioCount: result.scenarioCount ?? parsed.bundle.scenarios.length,
            activeScenarioIds: result.activeScenarioIds ?? activeScenarioIds,
            configVersion: result.configVersion ?? current.configVersion,
            updatedAt: result.updatedAt ?? current.updatedAt,
            message: "Mock config updated.",
          }
        : current,
    );
  }

  /**
   * Starts the desktop native mock server for unary and server-streaming methods.
   */
  async function startMockServer() {
    const parsed = parseAllMockScenarioFiles(mockServer, loaded?.methods ?? []);
    if (!parsed.ok) {
      showToast(parsed.error, "error");
      return;
    }
    if (!loaded || protoFiles.length === 0) {
      showToast("Import proto files before starting the mock server.", "warning");
      return;
    }
    if (!window.electronMock?.start) {
      showToast(
        "Mock server runtime is available in the desktop app only. You can still edit/export scenario files in the browser.",
        "warning",
      );
      return;
    }

    try {
      const port = normalizeMockPort(mockServer.port, defaultMockPort);
      const activeScenarioIds = resolveMockActiveScenarioIds(
        parsed.bundle,
        loaded.methods,
        mockServer.selectedScenarioIds,
      );
      const result = await window.electronMock.start({
        port,
        protoFiles,
        methods: loaded.methods,
        scenarios: parsed.bundle.scenarios,
        streamDefaults: mockServer.streamDefaults,
        activeScenarioIds,
        enabledMethods: mockServer.enabledMethods,
        workspaceDirectory: workspaceFolderPath || undefined,
      });
      if (!result.ok) {
        showToast(result.error ?? "Mock server failed to start.", "error");
        return;
      }
      setMockServerStatus({
        running: true,
        port: result.port ?? port,
        url: result.url ?? `grpc://0.0.0.0:${port}`,
        scenarioCount: result.scenarioCount ?? parsed.bundle.scenarios.length,
        methodCount: result.methodCount ?? loaded.methods.length,
        activeScenarioIds: result.activeScenarioIds ?? activeScenarioIds,
        startedAt: new Date().toISOString(),
        configVersion: result.configVersion,
        updatedAt: new Date().toISOString(),
      });
      setNativeTarget(`0.0.0.0:${result.port ?? port}`);
      setTransportMode("native-grpc");
      updateActiveSession({ transportMode: "native-grpc", nativeTarget: `0.0.0.0:${result.port ?? port}` });
      showToast(`Mock server running on port ${result.port ?? port}.`, "success");
    } catch (err) {
      showToast(`Mock server failed: ${toErrorMessage(err)}`, "error");
    }
  }

  /**
   * Stops the desktop native mock server.
   */
  async function stopMockServer() {
    try {
      const result = await window.electronMock?.stop?.();
      setMockServerStatus({ running: false, message: result?.message });
      showToast("Mock server stopped.", "success");
    } catch (err) {
      showToast(`Stop mock server failed: ${toErrorMessage(err)}`, "error");
    }
  }

  /**
   * Exports the active benchmark run with its target, request, stats, and raw samples.
   */
  function exportCurrentBenchmark() {
    if (!selectedMethod) return;
    if (benchmark.results.length === 0) {
      showToast("Run a benchmark before exporting benchmark results.", "warning");
      return;
    }
    const stats = calculateBenchmarkStats(benchmark.results);
    const bundle = {
      kind: "layang-benchmark",
      version: 1,
      exportedAt: new Date().toISOString(),
      method: selectedMethod,
      endpoint: previewUrl,
      transportMode: activeTransportMode,
      requestJson: safeJsonParse(requestJson),
      metadata: metadata.filter((item) => item.key.trim()),
      config: {
        mode: selectedMethod.responseStream ? "streaming" : "unary",
        iterations: benchmark.iterations,
        periodMs: selectedMethod.responseStream ? benchmark.periodMs : undefined,
      },
      stats: {
        total: benchmark.results.length,
        successful: stats.successful.length,
        failed: stats.failed.length,
        averageMs: stats.average,
        fastestMs: stats.fastest,
        slowestMs: stats.slowest,
        p50Ms: stats.p50,
        p95Ms: stats.p95,
        errorRate: stats.errorRate,
      },
      results: benchmark.results,
    };
    downloadTextFile(
      `layang-benchmark-${selectedMethod.methodName}-${timestampForFile()}.json`,
      JSON.stringify(bundle, null, 2),
      "application/json",
    );
  }

  function websocketProtocolsFromMetadataRows(rows: MetadataPair[]): string[] {
    const protocolHeader = rows.find((item) => item.key.trim().toLowerCase() === "sec-websocket-protocol");
    if (!protocolHeader) return [];
    return protocolHeader.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function runSingleWebSocketBenchmarkProbe(
    url: string,
    body: string,
    rows: MetadataPair[],
    signal: AbortSignal,
  ): Promise<{ ok: boolean; status: string; durationMs: number; messageCount: number }> {
    const started = performance.now();
    const protocols = websocketProtocolsFromMetadataRows(rows);
    return new Promise((resolve, reject) => {
      let settled = false;
      let opened = false;
      let messageCount = 0;
      let socket: WebSocket | null = null;
      const finish = (ok: boolean, status: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        resolve({ ok, status, durationMs: performance.now() - started, messageCount });
      };
      const abort = () => {
        try {
          socket?.close(1000, "Benchmark stopped");
        } catch {
          // Ignore close errors.
        }
        reject(new DOMException("Aborted", "AbortError"));
      };
      const timeout = window.setTimeout(() => {
        try {
          socket?.close(1000, "Benchmark timeout");
        } catch {
          // Ignore close errors.
        }
        finish(opened || messageCount > 0, messageCount ? "message received" : "open timeout");
      }, 5000);

      try {
        socket = protocols.length ? new WebSocket(url, protocols) : new WebSocket(url);
      } catch (error) {
        window.clearTimeout(timeout);
        reject(error);
        return;
      }

      signal.addEventListener("abort", abort);
      socket.onopen = () => {
        opened = true;
        const payload = body.trim();
        if (payload) socket?.send(payload);
        if (!payload) {
          try {
            socket?.close(1000, "Benchmark open complete");
          } catch {
            // Ignore close errors.
          }
          finish(true, "open");
        }
      };
      socket.onmessage = () => {
        messageCount += 1;
        try {
          socket?.close(1000, "Benchmark sample complete");
        } catch {
          // Ignore close errors.
        }
        finish(true, "message received");
      };
      socket.onerror = () => finish(false, "connection error");
      socket.onclose = (event) =>
        finish(opened || event.wasClean || messageCount > 0, event.reason || `close ${event.code}`);
    });
  }

  async function runWebSocketBenchmark() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket" || wsBenchmarkRunning) {
      showToast("Select a WebSocket request before running a benchmark.", "warning");
      return;
    }
    const url = targetDraft.trim();
    if (!url) {
      showToast("WebSocket URL is required.", "warning");
      return;
    }
    const runs = Math.max(1, Math.min(1000, Math.trunc(wsBenchmarkIterations || 1)));
    const abortController = new AbortController();
    wsBenchmarkAbortRef.current = abortController;
    setWsBenchmarkResults([]);
    setWsBenchmarkRunning(true);
    try {
      for (let index = 1; index <= runs; index += 1) {
        if (abortController.signal.aborted) break;
        const timestamp = new Date().toISOString();
        try {
          const result = await runSingleWebSocketBenchmarkProbe(url, requestJson, metadata, abortController.signal);
          setWsBenchmarkResults((current) => [
            ...current,
            {
              id: createId(),
              index,
              status: result.status,
              durationMs: result.durationMs,
              messageCount: result.messageCount,
              ok: result.ok,
              timestamp,
            },
          ]);
        } catch (err) {
          if (abortController.signal.aborted) break;
          setWsBenchmarkResults((current) => [
            ...current,
            {
              id: createId(),
              index,
              status: toErrorMessage(err),
              durationMs: 0,
              messageCount: 0,
              ok: false,
              timestamp,
            },
          ]);
        }
      }
      showToast(
        abortController.signal.aborted ? "WebSocket benchmark stopped." : "WebSocket benchmark finished.",
        abortController.signal.aborted ? "warning" : "success",
      );
    } finally {
      if (wsBenchmarkAbortRef.current === abortController) wsBenchmarkAbortRef.current = null;
      setWsBenchmarkRunning(false);
    }
  }

  function stopWebSocketBenchmark() {
    wsBenchmarkAbortRef.current?.abort();
  }

  function exportWebSocketBenchmark() {
    if (!activeCollectionRequest || wsBenchmarkResults.length === 0) {
      showToast("Run a WebSocket benchmark before exporting benchmark results.", "warning");
      return;
    }
    const stats = calculateBenchmarkStats(wsBenchmarkResults);
    downloadTextFile(
      `layang-ws-benchmark-${slugify(activeCollectionRequest.name)}-${timestampForFile()}.json`,
      JSON.stringify(
        {
          kind: "layang-websocket-benchmark",
          version: 1,
          exportedAt: new Date().toISOString(),
          collection: activeCollectionRequest.collectionName ?? "Collection",
          request: activeCollectionRequest.name,
          endpoint: targetDraft,
          requestMessage: requestJson,
          headers: metadata.filter((item) => item.key.trim()),
          stats: {
            total: wsBenchmarkResults.length,
            successful: stats.successful.length,
            failed: stats.failed.length,
            averageMs: stats.average,
            fastestMs: stats.fastest,
            slowestMs: stats.slowest,
            p50Ms: stats.p50,
            p95Ms: stats.p95,
            errorRate: stats.errorRate,
          },
          latestResponse: lastResult,
          results: wsBenchmarkResults,
        },
        null,
        2,
      ),
      "application/json",
    );
  }

  /**
   * Switches the response panel tab without recreating the tab strip on every live event.
   */
  const handleResponseTabChange = useCallback(
    (value: ResponseTab) => {
      setResponseTab(value);
      if (activeRequestId) updateRequestSession(activeRequestId, { responseTab: value });
    },
    [activeRequestId],
  );

  const handleResponseFilterChange = useCallback((event: TextInputChangeEvent) => {
    setResponseFilter(event.target.value);
  }, []);
  const clearResponseFilter = useCallback(() => setResponseFilter(""), []);
  const exportResponseStable = useStableEventCallback(exportResponse);
  const saveCurrentResultForDocsStable = useStableEventCallback(saveCurrentResultForDocs);
  const clearActiveResponseStable = useStableEventCallback(clearActiveResponse);

  /**
   * Starts left sidebar resize tracking.
   */
  function beginSidebarResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    sidebarResizeRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  /**
   * Starts response panel resize tracking.
   */
  function beginResponseResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    responseResizeRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }

  /**
   * Toggles between light and dark theme modes.
   */
  function toggleTheme() {
    const next = themeMode === "dark" ? "light" : "dark";
    setThemeMode(next);
    window.localStorage.setItem("layang-theme", next);
  }

  /**
   * Adds a request metadata row.
   */
  function addMetadataRow() {
    setMetadata((current) => {
      const next = [...current, { key: "", value: "" }];
      updateActiveSession({ metadata: next });
      patchActiveCollectionRequest({ headers: next });
      return next;
    });
  }

  /**
   * Updates a request metadata key or value.
   */
  function updateMetadataRow(index: number, field: keyof MetadataPair, value: string) {
    setMetadata((current) => {
      const next = current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item));
      updateActiveSession({ metadata: next });
      patchActiveCollectionRequest({ headers: next });
      return next;
    });
  }

  /**
   * Removes a request metadata row.
   */
  function removeMetadataRow(index: number) {
    setMetadata((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      updateActiveSession({ metadata: next });
      patchActiveCollectionRequest({ headers: next });
      return next;
    });
  }

  /**
   * Saves the current request as an example for the active method.
   */
  function saveCurrentExample() {
    if (!selectedMethod && !activeCollectionRequest) return;
    const serviceName = selectedMethod?.serviceName ?? activeCollectionRequest?.collectionName ?? "Collection";
    const methodName = selectedMethod?.methodName ?? activeCollectionRequest?.name ?? "WebSocket Request";
    const example: SavedExample = {
      id: createId(),
      name: `${methodName} example ${currentExamples.length + 1}`,
      serviceName,
      methodName,
      requestJson,
      metadata,
      expectedJson: assertionJson,
      createdAt: new Date().toISOString(),
    };
    setExamples((current) => [example, ...current]);
    setSideSection("examples");
    setRequestTab("examples");
  }

  /**
   * Exports examples for the active method only.
   */
  function exportCurrentMethodExamples() {
    if ((!selectedMethod && !activeCollectionRequest) || currentExamples.length === 0) return;
    const serviceName = selectedMethod?.serviceName ?? activeCollectionRequest?.collectionName ?? "Collection";
    const methodName = selectedMethod?.methodName ?? activeCollectionRequest?.name ?? "WebSocket Request";
    downloadTextFile(
      `layang-examples-${slugify(methodName)}-${timestampForFile()}.json`,
      JSON.stringify(
        {
          version: 1,
          type: "layang-examples",
          method: { serviceName, methodName },
          examples: currentExamples,
        },
        null,
        2,
      ),
      "application/json",
    );
  }

  /**
   * Imports example JSON and routes entries to their matching method.
   */
  async function importExampleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
      const incoming = Array.isArray(record.examples)
        ? record.examples.filter(isSavedExample)
        : Array.isArray(parsed)
          ? parsed.filter(isSavedExample)
          : [];
      if (incoming.length === 0) {
        showToast("No valid examples found in that file.", "warning");
        return;
      }
      setExamples((current) => mergeExamples(current, incoming));
      const matching = activeExampleKey
        ? incoming.find((example) => savedExampleKey(example) === activeExampleKey)
        : incoming[0];
      if (matching) loadExample(matching);
      showToast(`${incoming.length} example(s) loaded.`, "success");
    } catch (err) {
      showToast(toErrorMessage(err), "error");
    } finally {
      if (exampleInputRef.current) exampleInputRef.current.value = "";
    }
  }

  /**
   * Saves the latest response for the active method so generated docs can include it later.
   */
  function saveCurrentResultForDocs() {
    if (!selectedMethod) {
      if (activeCollectionRequest?.kind === "websocket") {
        showToast("Open the WebSocket Docs tab to preview or export docs with the latest response.", "info");
      }
      return;
    }
    const sourceResult = lastResult ?? activeDocsResult;
    if (!sourceResult) {
      showToast("Run this method before saving a result for docs.", "warning");
      return;
    }
    const key = methodKey(selectedMethod);
    const snapshot: DocResultSnapshot = {
      methodKey: key,
      serviceName: selectedMethod.serviceName,
      methodName: selectedMethod.methodName,
      result: compactGrpcResultForStorage(sourceResult),
      savedAt: new Date().toISOString(),
    };
    setDocResults((current) => [snapshot, ...current.filter((item) => item.methodKey !== key)].slice(0, 500));
    showToast("Latest response saved for generated docs.", "success");
  }

  /**
   * Marks the active method as publishable in the generated Docs sidebar/export.
   */
  function publishCurrentMethodDoc() {
    if (!selectedMethod) return;
    const key = methodKey(selectedMethod);
    setMethodDocs((current) =>
      upsertMethodDoc(current, {
        methodKey: key,
        serviceName: selectedMethod.serviceName,
        methodName: selectedMethod.methodName,
        published: true,
        updatedAt: new Date().toISOString(),
      }),
    );
    setSideSection("docs");
    setSidebarOpen(true);
    showToast("Generated method docs published to the Docs sidebar.", "success");
  }

  /**
   * Removes the active method from the published sidebar/export list.
   */
  function unpublishCurrentMethodDoc() {
    if (!selectedMethod) return;
    const key = methodKey(selectedMethod);
    setMethodDocs((current) =>
      current.map((doc) =>
        doc.methodKey === key ? { ...doc, published: false, updatedAt: new Date().toISOString() } : doc,
      ),
    );
    showToast("Method docs unpublished.", "success");
  }

  /**
   * Deletes the active method docs publish state and saved docs response snapshot.
   */
  function deleteCurrentMethodDoc() {
    if (!selectedMethod) return;
    const key = methodKey(selectedMethod);
    setMethodDocs((current) => current.filter((doc) => doc.methodKey !== key));
    setDocResults((current) => current.filter((item) => item.methodKey !== key));
    showToast("Generated docs entry removed for this method.", "success");
  }

  function buildActiveWebSocketDocsMarkdown() {
    return renderWebSocketDocsMarkdown({
      collectionRequest: activeCollectionRequest,
      url: targetDraft,
      message: requestJson,
      examples: currentExamples,
      latestResult: lastResult,
    });
  }

  function publishCurrentWebSocketDoc() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket") return;
    const key = webSocketDocKey(activeCollectionRequest);
    setMethodDocs((current) =>
      upsertMethodDoc(current, {
        methodKey: key,
        serviceName: activeCollectionRequest.collectionName ?? "WebSocket Collection",
        methodName: activeCollectionRequest.name,
        published: true,
        updatedAt: new Date().toISOString(),
        generatedMarkdown: buildActiveWebSocketDocsMarkdown(),
      }),
    );
    setSideSection("docs");
    setSidebarOpen(true);
    showToast("WebSocket docs published to the Docs sidebar.", "success");
  }

  function unpublishCurrentWebSocketDoc() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket") return;
    const key = webSocketDocKey(activeCollectionRequest);
    setMethodDocs((current) =>
      current.map((doc) =>
        doc.methodKey === key ? { ...doc, published: false, updatedAt: new Date().toISOString() } : doc,
      ),
    );
    showToast("WebSocket docs unpublished.", "success");
  }

  function previewCurrentWebSocketDoc() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket") return;
    setDocsPreview({
      title: `${activeCollectionRequest.collectionName ?? "Collection"}/${activeCollectionRequest.name}`,
      markdown: buildActiveWebSocketDocsMarkdown(),
    });
  }

  /**
   * Opens the generated documentation preview for the active method.
   */
  function previewCurrentMethodDoc() {
    if (!selectedMethod) return;
    setDocsPreview({
      title: `${selectedMethod.serviceName}/${selectedMethod.methodName}`,
      markdown: renderMethodPublicationMarkdown({
        method: selectedMethod,
        examples: currentExamples,
        protoFiles,
        latestResult: activeDocsResult,
        mockScenarios: currentMockScenarios,
        currentRequestJson: requestJson,
        currentMetadata: metadata,
      }),
    });
  }

  /**
   * Exports all published method docs and their examples as one markdown file for static publishing.
   */
  function exportPublicDocs() {
    const markdown = renderPublicDocsMarkdown(publishedDocs);
    downloadTextFile(`layang-public-docs-${timestampForFile()}.md`, markdown, "text/markdown");
  }

  /**
   * Generates full workspace API docs directly from the loaded proto registry.
   */
  function exportGeneratedProtoDocsMarkdown() {
    if (!loaded || loaded.methods.length === 0) {
      showToast("Import proto files before generating docs.", "warning");
      return;
    }
    const markdown = renderWorkspaceProtoDocsMarkdown({
      methods: loaded.methods,
      protoFiles,
      examples,
      docResults,
      requestSessions,
      mockBundle: parsedMockConfig.ok ? parsedMockConfig.bundle : null,
      environments,
    });
    downloadTextFile(`layang-proto-docs-${timestampForFile()}.md`, markdown, "text/markdown");
  }

  /**
   * Generates standalone HTML docs from the loaded proto registry.
   */
  function exportGeneratedProtoDocsHtml() {
    if (!loaded || loaded.methods.length === 0) {
      showToast("Import proto files before generating docs.", "warning");
      return;
    }
    const markdown = renderWorkspaceProtoDocsMarkdown({
      methods: loaded.methods,
      protoFiles,
      examples,
      docResults,
      requestSessions,
      mockBundle: parsedMockConfig.ok ? parsedMockConfig.bundle : null,
      environments,
    });
    downloadTextFile(
      `layang-proto-docs-${timestampForFile()}.html`,
      renderWorkspaceProtoDocsHtml(markdown),
      "text/html",
    );
  }

  /**
   * Opens a publishable doc entry from the Docs sidebar.
   */
  function openDocFromSidebar(doc: MethodDoc) {
    if (doc.methodKey.startsWith("ws:")) {
      const request = findWebSocketRequestForDocKey(collections, doc.methodKey);
      const session = request ? requestSessions.find((item) => item.methodKey === request.id) : null;
      const key = request
        ? `${request.collectionName ?? "Collection"}/${request.name}`
        : `${doc.serviceName}/${doc.methodName}`;
      const requestExamples = examples.filter((example) => savedExampleKey(example) === key);
      setDocsPreview({
        title: key,
        markdown: request
          ? renderWebSocketDocsMarkdown({
              collectionRequest: request,
              url: session?.baseUrl || request.url,
              message: session?.requestJson || request.body || "",
              examples: requestExamples,
              latestResult: session?.lastResult ?? null,
            })
          : doc.generatedMarkdown || "# WebSocket docs\n\nRequest not found in this workspace.",
      });
      return;
    }

    const found = loaded?.methods.find(
      (method) => method.serviceName === doc.serviceName && method.methodName === doc.methodName,
    );
    if (!found) return;
    const key = methodKey(found);
    const methodExamples = examples.filter((example) => savedExampleKey(example) === key);
    const methodMocks = allMockScenarios.filter(
      (scenario) => scenario.service === found.serviceName && scenario.method === found.methodName,
    );
    const session = requestSessions.find((item) => item.methodKey === key);
    setDocsPreview({
      title: `${found.serviceName}/${found.methodName}`,
      markdown: renderMethodPublicationMarkdown({
        method: found,
        examples: methodExamples,
        protoFiles,
        latestResult: savedDocResultByMethod.get(key) ?? latestResultByMethod.get(key) ?? null,
        mockScenarios: methodMocks,
        currentRequestJson: session?.requestJson,
        currentMetadata: session?.metadata,
      }),
    });
  }

  /**
   * Unpublishes one docs entry from the sidebar without deleting its editable draft.
   */
  function unpublishMethodDoc(key: string) {
    setMethodDocs((current) =>
      current.map((doc) =>
        doc.methodKey === key ? { ...doc, published: false, updatedAt: new Date().toISOString() } : doc,
      ),
    );
    showToast("Method docs unpublished.", "success");
  }

  /**
   * Loads an example into its matching request tab.
   */
  function loadExample(example: SavedExample) {
    const found = loaded?.methods.find(
      (method) => method.serviceName === example.serviceName && method.methodName === example.methodName,
    );
    if (found && loaded) {
      const key = methodKey(found);
      const existing = requestSessions.find((session) => session.methodKey === key);
      if (existing?.running) {
        showToast(
          `${found.methodName} is running in ${existing.title}. Stop it before loading another example.`,
          "warning",
        );
        return;
      }
      const session: RequestSession = existing
        ? {
            ...existing,
            requestJson: example.requestJson,
            metadata: example.metadata.map((item) => ({ ...item })),
            assertionJson: example.expectedJson,
            updatedAt: new Date().toISOString(),
          }
        : createRequestSession(loaded.root, found, {
            requestJson: example.requestJson,
            metadata: example.metadata,
            transportMode: activeTransportMode,
            baseUrl: activeBaseUrl,
            nativeTarget: activeNativeTarget,
            assertionJson: example.expectedJson,
          });

      upsertRequestSessionPreservingOrder(session);
      activateRequestSession(session);
      setRequestTab("body");
      return;
    }

    for (const collection of collections) {
      const request = collection.requests.find(
        (item) => collection.name === example.serviceName && item.name === example.methodName,
      );
      if (!request) continue;
      const existing = requestSessions.find((session) => session.methodKey === request.id);
      if (existing?.running) {
        showToast(
          `${request.name} is running in ${existing.title}. Stop it before loading another example.`,
          "warning",
        );
        return;
      }
      const session: RequestSession = existing
        ? {
            ...existing,
            requestJson: example.requestJson,
            metadata: example.metadata.map((item) => ({ ...item })),
            assertionJson: example.expectedJson,
            updatedAt: new Date().toISOString(),
          }
        : createCollectionRequestSession(collection, {
            ...request,
            body: example.requestJson,
            headers: example.metadata.map((item) => ({ ...item })),
          });
      upsertRequestSessionPreservingOrder(session);
      activateRequestSession(session);
      patchActiveCollectionRequest({ body: example.requestJson, headers: example.metadata });
      setRequestTab("body");
      return;
    }

    showToast("No matching gRPC method or WebSocket request found for that example.", "warning");
  }

  /**
   * Runs an example against its matching method.
   */
  async function runExample(example: SavedExample) {
    const method = loaded?.methods.find(
      (item) => item.serviceName === example.serviceName && item.methodName === example.methodName,
    );
    let collectionRequest = null as (ApiCollectionRequest & { collectionName?: string }) | null;
    if (!method) {
      for (const collection of collections) {
        const request = collection.requests.find(
          (item) => collection.name === example.serviceName && item.name === example.methodName,
        );
        if (request) {
          collectionRequest = { ...request, collectionName: collection.name };
          break;
        }
      }
    }
    await requestRunner.runRequest({
      overrideMethod: method,
      overrideCollectionRequest: collectionRequest,
      overrideRequestJson: example.requestJson,
      overrideMetadata: example.metadata,
      overrideAssertionJson: example.expectedJson,
    });
  }

  /**
   * Copies the resolved endpoint URL to the clipboard.
   */
  function copyPreviewUrl() {
    navigator.clipboard?.writeText(previewUrl).catch(() => undefined);
  }

  /**
   * Exports the active response as a JSON report.
   */
  function exportResponse() {
    downloadTextFile(
      `layang-response-${timestampForFile()}.json`,
      JSON.stringify(reportPayload, null, 2),
      "application/json",
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ height: "100vh", bgcolor: "background.default", color: "text.primary", overflow: "hidden" }}>
        <AppBar
          position="fixed"
          elevation={0}
          sx={{
            zIndex: 1201,
            top: 0,
            left: 0,
            right: 0,
            width: "100vw",
            height: designSystem.size.titlebarHeight,
            justifyContent: "center",
            borderBottom: "1px solid",
            borderColor: (theme: CompatTheme) => colorTokens[paletteMode(theme.palette.mode)].border,
            bgcolor: (theme: CompatTheme) => colorTokens[paletteMode(theme.palette.mode)].titlebarBg,
            color: "text.primary",
            WebkitAppRegion: "drag",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.55}
            sx={{ px: 0.65, height: "100%", width: "100%", minWidth: 0, WebkitAppRegion: "drag" }}
          >
            <Stack
              direction="row"
              spacing={0.7}
              alignItems="center"
              sx={{ width: 166, flexShrink: 0, justifyContent: "flex-start", WebkitAppRegion: "drag" }}
            >
              <Tooltip title="Layang workspace">
                <Button
                  size="small"
                  aria-label="Layang workspace menu"
                  onClick={(event: ButtonClickEvent) => setWorkspaceMenuAnchor(event.currentTarget)}
                  sx={{
                    WebkitAppRegion: "no-drag",
                    height: 28,
                    minWidth: 0,
                    px: 0.75,
                    gap: "6px",
                    borderColor: "transparent",
                  }}
                >
                  <AppLogoIcon size={19} />
                  <Typography variant="body2" fontWeight={700} noWrap>
                    Layang
                  </Typography>
                </Button>
              </Tooltip>
              <Menu
                anchorEl={workspaceMenuAnchor}
                open={Boolean(workspaceMenuAnchor)}
                onClose={() => setWorkspaceMenuAnchor(null)}
              >
                <MenuItem onClick={saveWorkspaceLocally}>
                  <Storage fontSize="small" /> Save browser snapshot
                </MenuItem>
                <MenuItem onClick={() => void saveWorkspaceFolder()}>
                  <Storage fontSize="small" /> Save workspace folder
                </MenuItem>
                <MenuItem onClick={() => void saveWorkspaceFolderAs()}>
                  <Download fontSize="small" /> Save workspace folder as...
                </MenuItem>
                <MenuItem onClick={() => void openWorkspaceFolder()}>
                  <UploadFile fontSize="small" /> Open workspace folder
                </MenuItem>
                <Divider />
                <MenuItem onClick={exportProject}>
                  <Download fontSize="small" /> Export portable JSON
                </MenuItem>
                <MenuItem onClick={openWorkspaceImporter}>
                  <UploadFile fontSize="small" /> Import workspace / collection / docs / examples
                </MenuItem>
                <MenuItem onClick={openProtoFolderImporter}>
                  <UploadFile fontSize="small" /> Import gRPC proto / collection folder
                </MenuItem>
                <Divider />
                <MenuItem
                  onClick={() => {
                    setWorkspaceMenuAnchor(null);
                    exportPublicDocs();
                  }}
                >
                  <DocsIcon fontSize="small" /> Export published docs
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setWorkspaceMenuAnchor(null);
                    exportGeneratedProtoDocsMarkdown();
                  }}
                >
                  <DocsIcon fontSize="small" /> Generate proto docs Markdown
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setWorkspaceMenuAnchor(null);
                    exportGeneratedProtoDocsHtml();
                  }}
                >
                  <DocsIcon fontSize="small" /> Generate proto docs HTML
                </MenuItem>
                {workspaceFolderPath && (
                  <MenuItem disabled>
                    <ListItemText primary="Folder" secondary={workspaceFolderPath} />
                  </MenuItem>
                )}
              </Menu>
            </Stack>
            <Box sx={{ WebkitAppRegion: "drag", minWidth: 0, flex: "1 1 auto", height: "100%", display: "flex" }}>
              <RequestTabs
                sessions={requestSessions}
                activeRequestId={activeRequestId}
                onActivate={(session) => activateRequestSession(session)}
                onClose={closeRequestSession}
                onCancel={requestRunner.cancelRequest}
                onCloseAll={closeAllRequestSessions}
                onCloseOther={closeOtherRequestSessions}
                placement="top"
              />
            </Box>
            <Box
              aria-label="Drag window"
              sx={{ alignSelf: "stretch", width: 72, flexShrink: 0, WebkitAppRegion: "drag" }}
            />
            <WindowControls />
          </Stack>
        </AppBar>

        <input
          ref={projectInputRef}
          hidden
          multiple
          type="file"
          accept=".json,.proto,.md,.txt,.yaml,.yml"
          onChange={(event: ChangeEvent<HTMLInputElement>) => void importWorkspaceFiles(event.target.files)}
        />
        <input
          ref={protoFolderInputRef}
          hidden
          multiple
          type="file"
          accept=".proto,.json"
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => void handleProtoFiles(event.target.files)}
        />

        <Box
          sx={{
            position: "fixed",
            top: designSystem.size.titlebarHeight,
            bottom: 0,
            left: 0,
            width: railWidth,
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: (theme: CompatTheme) => colorTokens[paletteMode(theme.palette.mode)].railBg,
            pt: 1,
          }}
        >
          <RailButton
            active={sidebarOpen && sideSection === "registry"}
            icon={<Api />}
            label="Collections"
            onClick={() => {
              setSideSection("registry");
              setSidebarOpen(true);
            }}
          />
          <RailButton
            active={sidebarOpen && sideSection === "examples"}
            icon={<ExampleIcon />}
            label="Examples"
            onClick={() => {
              setSideSection("examples");
              setSidebarOpen(true);
            }}
          />
          <RailButton
            active={sidebarOpen && sideSection === "history"}
            icon={<History />}
            label="History"
            onClick={() => {
              setSideSection("history");
              setSidebarOpen(true);
            }}
          />
          <RailButton
            active={sidebarOpen && sideSection === "mocks"}
            icon={<MockServer />}
            label="gRPC Mock"
            status={mockServerStatus.running ? "running" : "idle"}
            onClick={() => {
              setSideSection("mocks");
              setSidebarOpen(true);
            }}
          />
          <RailButton
            active={sidebarOpen && sideSection === "ws-mocks"}
            icon={<Stream />}
            label="WS Mock"
            onClick={() => {
              setSideSection("ws-mocks");
              setSidebarOpen(true);
            }}
          />
          <RailButton
            active={sidebarOpen && sideSection === "docs"}
            icon={<DocsIcon />}
            label="Docs"
            onClick={() => {
              setSideSection("docs");
              setSidebarOpen(true);
            }}
          />
          <Box
            sx={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 10,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Tooltip title={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`} placement="right">
              <IconButton size="small" aria-label="Toggle theme" onClick={toggleTheme} sx={iconButtonSx}>
                {themeMode === "dark" ? (
                  <DarkMode sx={{ fontSize: 16 }} color="primary" />
                ) : (
                  <LightMode sx={{ fontSize: 16 }} color="primary" />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {sidebarOpen && (
          <Box
            sx={{
              position: "fixed",
              top: designSystem.size.titlebarHeight,
              bottom: 0,
              left: railWidth,
              width: sidebarWidthPx,
              borderRight: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
              overflow: "hidden",
            }}
          >
            <Stack spacing={0.8} sx={{ p: 1, height: "100%" }}>
              <SidebarHeader
                section={sideSection}
                protoCount={protoFiles.length}
                exampleCount={currentExamples.length}
                historyCount={currentHistory.length}
                docsCount={publishedDocs.length}
                mockCount={0}
                onHide={() => setSidebarOpen(false)}
                action={
                  sideSection === "registry" ? (
                    <Tooltip title="Collection menu">
                      <IconButton
                        size="small"
                        aria-label="Collection menu"
                        onClick={(event: ButtonClickEvent) => setCollectionMenuAnchor(event.currentTarget)}
                      >
                        <Add sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  ) : undefined
                }
              />
              <Menu
                anchorEl={collectionMenuAnchor}
                open={sideSection === "registry" && Boolean(collectionMenuAnchor)}
                onClose={() => setCollectionMenuAnchor(null)}
              >
                <MenuItem onClick={openAddCollectionDialog}>
                  <Add fontSize="small" /> Add WS Collection
                </MenuItem>
                <Divider />
                <MenuItem
                  onClick={() => {
                    setCollectionMenuAnchor(null);
                    protoInputRef.current?.click();
                  }}
                >
                  <UploadFile fontSize="small" /> Import gRPC proto / collection
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setCollectionMenuAnchor(null);
                    protoFolderInputRef.current?.click();
                  }}
                >
                  <UploadFile fontSize="small" /> Import collection folder
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setCollectionMenuAnchor(null);
                    loadSample();
                  }}
                >
                  <ExampleIcon fontSize="small" /> Load sample gRPC collection
                </MenuItem>
              </Menu>
              <input
                ref={protoInputRef}
                hidden
                multiple
                type="file"
                accept=".proto,.json"
                onChange={(event: ChangeEvent<HTMLInputElement>) => void handleProtoFiles(event.target.files)}
              />
              <input
                ref={exampleInputRef}
                hidden
                type="file"
                accept=".json"
                onChange={(event: ChangeEvent<HTMLInputElement>) => void importExampleFile(event.target.files)}
              />
              <input
                ref={mockScenarioInputRef}
                hidden
                multiple
                type="file"
                accept=".json,.yaml,.yml"
                onChange={(event: ChangeEvent<HTMLInputElement>) => void importMockScenarioFile(event.target.files)}
              />
              {sideSection === "registry" && (
                <TextField
                  size="small"
                  value={registryFilter}
                  onChange={(event: TextInputChangeEvent) => setRegistryFilter(event.target.value)}
                  placeholder="Search collections"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search sx={{ fontSize: 16 }} />
                      </InputAdornment>
                    ),
                  }}
                />
              )}
              <Divider />
              <Box sx={{ overflow: "auto", pb: 1, flex: 1 }}>
                {sideSection === "registry" && (
                  <FeatureRegistryPanel
                    protoFiles={protoFiles}
                    collections={collections}
                    endpointGroups={endpointGroups}
                    selectedMethodKey={selectedMethodKey}
                    selectedCollectionRequestId={activeCollectionRequestId}
                    loaded={loaded}
                    onRemoveProto={removeProtoFile}
                    onOpenProto={setProtoPreview}
                    onExportProto={(file) =>
                      downloadTextFile(
                        `layang-proto-${file.name.replace(/[^a-z0-9_.-]/gi, "-")}-${timestampForFile()}.proto`,
                        file.text,
                        "text/x-protobuf",
                      )
                    }
                    onSelectMethod={(method) => loaded && selectMethod(loaded.root, method)}
                    onSelectCollectionRequest={selectCollectionRequest}
                    onAddCollectionRequest={openAddWebSocketRequestDialog}
                    onImportGrpcRequest={importGrpcRequestIntoCollection}
                    onRemoveCollection={removeCollection}
                  />
                )}
                {sideSection === "examples" && (
                  <ExampleSidebar
                    examples={currentExamples}
                    onLoad={loadExample}
                    onRun={(example) => void runExample(example)}
                    onDelete={(id) => setExamples((current) => current.filter((item) => item.id !== id))}
                    onClear={() =>
                      setExamples((current) => current.filter((item) => savedExampleKey(item) !== activeExampleKey))
                    }
                  />
                )}
                {sideSection === "history" && <HistorySidebar history={currentHistory} onClear={clearHistory} />}
                {sideSection === "mocks" && (
                  <MockServerSidebar
                    mockServer={mockServer}
                    selectedMethod={selectedMethod}
                    status={mockServerStatus}
                    currentFile={currentMockFile}
                    currentParseResult={currentMockParse}
                    onSettings={() => setMockSettingsOpen(true)}
                    onGenerate={addMockScenarioFromCurrent}
                    onStart={() => void startMockServer()}
                    onStop={() => void stopMockServer()}
                    onImport={() => mockScenarioInputRef.current?.click()}
                    onExport={exportMockScenarioFile}
                  />
                )}
                {sideSection === "ws-mocks" && (
                  <WebSocketMockSidebar
                    request={activeCollectionRequest?.kind === "websocket" ? activeCollectionRequest : null}
                    mockResponseText={activeWebSocketMockResponseText}
                    latestResult={activeIsWebSocket ? lastResult : null}
                    status={wsMockStatus}
                    port={wsMockPort}
                    pathValue={wsMockPath}
                    intervalMs={wsMockIntervalMs}
                    loop={wsMockLoop}
                    maxLoops={wsMockMaxLoops}
                    streamOnConnect={wsMockStreamOnConnect}
                    onMockResponseTextChange={updateActiveWebSocketMockResponse}
                    onPortChange={setWsMockPort}
                    onPathChange={setWsMockPath}
                    onIntervalMsChange={setWsMockIntervalMs}
                    onLoopChange={setWsMockLoop}
                    onMaxLoopsChange={setWsMockMaxLoops}
                    onStreamOnConnectChange={setWsMockStreamOnConnect}
                    onStart={() => void startWebSocketMockServer()}
                    onStop={() => void stopWebSocketMockServer()}
                    onSendOnce={() => void sendWebSocketMockOnce()}
                    onCopy={copyActiveWebSocketMockResponse}
                  />
                )}
                {sideSection === "docs" && (
                  <FeatureDocsSidebar
                    docs={publishedDocs}
                    activeMethodKey={activeDocKey}
                    onExport={exportPublicDocs}
                    onOpen={(doc) => openDocFromSidebar(doc)}
                    onUnpublish={(doc) => unpublishMethodDoc(doc.methodKey)}
                  />
                )}
              </Box>
            </Stack>
            <Box
              onMouseDown={beginSidebarResize}
              sx={{
                position: "absolute",
                top: 0,
                right: -3,
                width: 6,
                height: "100%",
                cursor: "col-resize",
                zIndex: 2,
                "&:hover": { bgcolor: "primary.main", opacity: 0.4 },
              }}
            />
          </Box>
        )}

        <Box
          component="main"
          sx={{
            position: "fixed",
            top: designSystem.size.titlebarHeight,
            left: shellLeft,
            right: 0,
            bottom: 0,
            px: 1.1,
            py: 1,
            overflow: "hidden",
          }}
        >
          <Stack spacing={0.8} sx={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
            <Paper
              elevation={0}
              sx={{ ...panelSx, flex: "1 1 auto", minHeight: 220, display: "flex", flexDirection: "column" }}
            >
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ px: 1.4, py: 0.8, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={0.8} alignItems="center">
                    <Typography
                      variant="subtitle1"
                      noWrap
                      title={
                        selectedMethod
                          ? selectedMethod.methodName
                          : (activeCollectionRequest?.name ?? "Select a collection request")
                      }
                    >
                      {selectedMethod
                        ? `${selectedMethod.methodName}`
                        : (activeCollectionRequest?.name ?? "Select a collection request")}
                    </Typography>
                    {(selectedMethod || activeCollectionRequest) && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={
                          selectedMethod?.responseStream || activeCollectionRequest?.kind === "websocket"
                            ? "secondary"
                            : "primary"
                        }
                        label={
                          selectedMethod
                            ? methodTypeLabel(selectedMethod)
                            : activeCollectionRequest?.kind === "websocket"
                              ? "WebSocket"
                              : activeCollectionRequest?.kind === "grpc"
                                ? "gRPC"
                                : "Request"
                        }
                      />
                    )}
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    title={
                      selectedMethod?.serviceName ??
                      activeCollectionRequest?.collectionName ??
                      "Import or add a collection request."
                    }
                  >
                    {selectedMethod?.serviceName ??
                      activeCollectionRequest?.collectionName ??
                      "Import or add a collection request."}
                  </Typography>
                </Box>
                {activeRunning ? (
                  <Tooltip title="Stop running request">
                    <IconButton
                      size="small"
                      color="warning"
                      onClick={() => {
                        if (wsClientRef.current?.sessionId === activeRequestId) closeManualWebSocketClient();
                        else requestRunner.cancelRequest();
                      }}
                    >
                      <StopCircle fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<PlayArrow />}
                    disabled={
                      (!selectedMethod && !activeCollectionRequest) ||
                      activeCollectionRequest?.kind === "grpc" ||
                      (activeTransportMode === "native-grpc" && !isNativeBridgeAvailable)
                    }
                    onClick={() => {
                      commitTargetDraft();
                      void requestRunner.runRequest();
                    }}
                  >
                    {activeCollectionRequest?.kind === "websocket"
                      ? requestJson.trim()
                        ? "Connect & send"
                        : "Connect"
                      : selectedMethod?.responseStream
                        ? "Start stream"
                        : "Send"}
                  </Button>
                )}
              </Stack>

              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ px: 1.4, py: 0.8, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  onClick={(event: ButtonClickEvent) => setEnvMenuAnchor(event.currentTarget)}
                  title={featureEnvironmentLabel(environments, activeEnvironmentKey)}
                  sx={{ width: 88, minWidth: 88, px: 0.5, justifyContent: "center", flexShrink: 0 }}
                >
                  <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {featureEnvironmentShortLabel(environments, activeEnvironmentKey)}
                  </Box>
                </Button>
                <Menu anchorEl={envMenuAnchor} open={Boolean(envMenuAnchor)} onClose={() => setEnvMenuAnchor(null)}>
                  <MenuItem selected={activeEnvironmentKey === "default"} onClick={() => chooseEnvironment("default")}>
                    None
                  </MenuItem>
                  <MenuItem selected={activeEnvironmentKey === "manual"} onClick={() => chooseEnvironment("manual")}>
                    Manually Specify
                  </MenuItem>
                  <Divider />
                  {environments.map((env) => {
                    const target = activeTransportMode === "native-grpc" ? env.nativeTarget : env.grpcWebBaseUrl;
                    return (
                      <MenuItem
                        key={env.key}
                        selected={activeEnvironmentKey === env.key}
                        onClick={() => chooseEnvironment(env.key)}
                      >
                        <ListItemText
                          primary={env.label}
                          secondary={target}
                          primaryTypographyProps={{ noWrap: true, title: env.label }}
                          secondaryTypographyProps={{ noWrap: true, title: target }}
                        />
                        <Tooltip title="Edit environment">
                          <IconButton
                            size="small"
                            aria-label={`Edit ${env.label}`}
                            onClick={(event: ElementClickEvent) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openEnvironmentManager(env);
                            }}
                            sx={{ ml: 1, flexShrink: 0 }}
                          >
                            <Edit sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </MenuItem>
                    );
                  })}
                  <Divider />
                  <MenuItem onClick={saveCurrentEnvironment}>
                    <Add sx={{ fontSize: 16, mr: 1 }} /> Save New Environment
                  </MenuItem>
                </Menu>
                <FormControl size="small" sx={{ width: activeIsWebSocket ? 132 : 145 }}>
                  <Select
                    value={
                      activeIsWebSocket
                        ? "websocket"
                        : activeTransportMode === "rest"
                          ? "grpc-web"
                          : activeTransportMode
                    }
                    disabled={activeIsWebSocket}
                    onChange={(event: SelectInputChangeEvent) =>
                      handleTransportModeChange(event.target.value as TransportMode)
                    }
                  >
                    {activeIsWebSocket ? (
                      <MenuItem value="websocket">WebSocket</MenuItem>
                    ) : (
                      [
                        <MenuItem key="grpc-web" value="grpc-web">
                          gRPC-Web
                        </MenuItem>,
                        <MenuItem key="native-grpc" value="native-grpc">
                          Native gRPC
                        </MenuItem>,
                      ]
                    )}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  fullWidth
                  className="workbench-url-input"
                  value={targetDraft}
                  onChange={(event: TextInputChangeEvent) => handleTargetDraftChange(event.target.value)}
                  onBlur={() => commitTargetDraft()}
                  onKeyDown={(event: TextInputKeyboardEvent) => {
                    if (event.key === "Enter") commitTargetDraft();
                  }}
                  placeholder={
                    activeIsWebSocket
                      ? "ws://localhost:8080"
                      : activeTransportMode === "native-grpc"
                        ? "localhost:50051"
                        : "APISIX / Envoy base URL"
                  }
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        {activeIsWebSocket ? (
                          <Stream sx={{ fontSize: 16 }} />
                        ) : activeTransportMode === "native-grpc" ? (
                          <DesktopWindows sx={{ fontSize: 16 }} />
                        ) : (
                          <Language sx={{ fontSize: 16 }} />
                        )}
                      </InputAdornment>
                    ),
                  }}
                />
                <Tooltip title="Copy endpoint">
                  <IconButton size="small" onClick={copyPreviewUrl}>
                    <ContentCopy sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Box
                sx={{
                  px: 1.4,
                  py: 0.8,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  bgcolor: (theme: CompatTheme) => colorTokens[paletteMode(theme.palette.mode)].surfaceAlt,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontFamily: "monospace", wordBreak: "break-all", color: "text.secondary" }}
                >
                  {previewUrl}
                </Typography>
              </Box>

              <WorkbenchTabs<RequestTab> value={requestTab} onChange={setRequestTab} items={requestTabItems} />
              <Box sx={{ p: designSystem.space.panelPadding, minHeight: 0, flex: 1, overflow: "auto" }}>
                {requestTab === "body" &&
                  (activeIsWebSocket ? (
                    <Stack spacing={1} sx={{ minHeight: 0 }}>
                      <Stack
                        direction="row"
                        spacing={0.7}
                        alignItems="center"
                        justifyContent="space-between"
                        flexWrap="wrap"
                        useFlexGap
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle1">WebSocket send data</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Data from this body is sent to the WebSocket after the connection opens. Leave it empty for
                            connect-only.
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Chip
                            size="small"
                            variant="outlined"
                            color={
                              wsClientState.readyState === "open"
                                ? "success"
                                : wsClientState.readyState === "connecting"
                                  ? "warning"
                                  : "default"
                            }
                            label={
                              wsClientState.readyState === "open"
                                ? `Connected${wsClientState.messageCount ? ` · ${wsClientState.messageCount} msg` : ""}`
                                : wsClientState.readyState === "connecting"
                                  ? "Connecting"
                                  : "Disconnected"
                            }
                          />
                          {wsClientState.readyState === "open" && (
                            <Button size="small" variant="outlined" onClick={() => closeManualWebSocketClient()}>
                              Disconnect
                            </Button>
                          )}
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={prettifyRequestJson}
                            disabled={!requestJson.trim()}
                          >
                            Prettier JSON
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<PlayArrow />}
                            onClick={handleSendWebSocketMessage}
                            disabled={
                              !activeCollectionRequest ||
                              activeCollectionRequest.kind !== "websocket" ||
                              wsClientState.readyState === "connecting"
                            }
                          >
                            Send
                          </Button>
                        </Stack>
                      </Stack>
                      <FeatureCodeTextField
                        value={requestJson}
                        onChange={handleRequestJsonChange}
                        minRows={7}
                        maxRows={12}
                        language="json"
                      />
                    </Stack>
                  ) : (
                    <Stack spacing={1} sx={{ minHeight: 0 }}>
                      <Stack
                        direction="row"
                        spacing={0.7}
                        alignItems="center"
                        justifyContent="space-between"
                        flexWrap="wrap"
                        useFlexGap
                      >
                        <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap" useFlexGap>
                          {selectedMethod && currentMockScenarios.length > 0 && (
                            <FormControl size="small" sx={{ width: 220 }}>
                              <Select
                                value={currentMockActiveScenario?.id ?? currentMockScenarios[0]?.id ?? ""}
                                onChange={(event: SelectInputChangeEvent) =>
                                  handleMockScenarioSelectChange(selectedMethod, String(event.target.value))
                                }
                              >
                                {currentMockScenarios.map((scenario) => (
                                  <MenuItem key={scenario.id} value={scenario.id}>
                                    {scenario.id}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          )}
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={generateRequestJsonFromSelectedScenario}
                            disabled={!selectedMethod || currentMockScenarios.length === 0}
                          >
                            Generate from scenario
                          </Button>
                        </Stack>
                        <Stack direction="row" spacing={0.7} alignItems="center">
                          <Button size="small" variant="outlined" onClick={prettifyRequestJson}>
                            Prettier JSON
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={generateRandomRequestJson}
                            disabled={!selectedMethod}
                          >
                            Generate random
                          </Button>
                        </Stack>
                      </Stack>
                      <FeatureCodeTextField
                        value={requestJson}
                        onChange={handleRequestJsonChange}
                        minRows={7}
                        maxRows={12}
                        language="json"
                      />
                    </Stack>
                  ))}
                {requestTab === "metadata" &&
                  (activeIsWebSocket ? (
                    <Stack spacing={1.1}>
                      <Stack spacing={0.25}>
                        <Typography variant="subtitle1">WebSocket subprotocol</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Optional WebSocket subprotocol. Message data is sent from the Message tab.
                        </Typography>
                      </Stack>
                      <TextField
                        size="small"
                        label="Sec-WebSocket-Protocol"
                        fullWidth
                        value={webSocketSubprotocolValue}
                        onChange={(event: TextInputChangeEvent) => updateWebSocketSubprotocol(event.target.value)}
                        placeholder="json, chat.v1"
                        helperText="Comma-separated subprotocols, for example json, chat.v1."
                      />
                    </Stack>
                  ) : (
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle1">Metadata</Typography>
                        <Button size="small" startIcon={<Add />} onClick={addMetadataRow}>
                          Add row
                        </Button>
                      </Stack>
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Key</TableCell>
                              <TableCell>Value</TableCell>
                              <TableCell width={56}>Action</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {metadata.map((item, index) => (
                              <TableRow key={`${item.key}-${item.value}`}>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    value={item.key}
                                    onChange={(event: TextInputChangeEvent) =>
                                      updateMetadataRow(index, "key", event.target.value)
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    value={item.value}
                                    onChange={(event: TextInputChangeEvent) =>
                                      updateMetadataRow(index, "value", event.target.value)
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <IconButton size="small" color="error" onClick={() => removeMetadataRow(index)}>
                                    <Delete sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Stack>
                  ))}
                {requestTab === "schema" && (
                  <Stack spacing={1.2}>
                    <FeatureSchemaTable
                      title="Request schema"
                      typeName={selectedMethod?.requestType}
                      fields={requestFields}
                    />
                    <FeatureSchemaTable
                      title="Response schema"
                      typeName={selectedMethod?.responseType}
                      fields={responseFields}
                    />
                  </Stack>
                )}
                {requestTab === "history" && (
                  <FeatureHistoryTable
                    history={currentHistory}
                    filterQuery={deferredResponseFilter}
                    onClear={clearHistory}
                  />
                )}
                {requestTab === "docs" &&
                  (activeIsWebSocket ? (
                    <WebSocketDocsPanel
                      collectionRequest={activeCollectionRequest}
                      url={targetDraft}
                      message={requestJson}
                      examples={currentExamples}
                      latestResult={lastResult}
                      doc={currentWebSocketDoc}
                      onPreview={previewCurrentWebSocketDoc}
                      onPublish={publishCurrentWebSocketDoc}
                      onUnpublish={unpublishCurrentWebSocketDoc}
                      onExport={() =>
                        activeCollectionRequest &&
                        downloadTextFile(
                          `layang-ws-docs-${slugify(activeCollectionRequest.name)}-${timestampForFile()}.md`,
                          buildActiveWebSocketDocsMarkdown(),
                          "text/markdown",
                        )
                      }
                    />
                  ) : (
                    <FeatureMethodDocsPanel
                      selectedMethod={selectedMethod}
                      doc={currentMethodDoc}
                      examples={currentExamples}
                      docsResult={activeDocsResult}
                      onPreview={previewCurrentMethodDoc}
                      onSaveResult={saveCurrentResultForDocs}
                      onExportPublic={exportPublicDocs}
                      onPublish={publishCurrentMethodDoc}
                      onUnpublish={unpublishCurrentMethodDoc}
                      onDelete={deleteCurrentMethodDoc}
                    />
                  ))}
                {requestTab === "benchmark" &&
                  (activeIsWebSocket ? (
                    <WebSocketBenchmarkPanel
                      request={activeCollectionRequest}
                      iterations={wsBenchmarkIterations}
                      onIterationsChange={setWsBenchmarkIterations}
                      running={wsBenchmarkRunning}
                      results={wsBenchmarkResults}
                      lastResult={lastResult}
                      onRun={() => void runWebSocketBenchmark()}
                      onStop={stopWebSocketBenchmark}
                      onExport={exportWebSocketBenchmark}
                    />
                  ) : (
                    <FeatureBenchmarkPanel
                      selectedMethod={selectedMethod}
                      iterations={benchmark.iterations}
                      onIterationsChange={benchmark.setIterations}
                      periodMs={benchmark.periodMs}
                      onPeriodMsChange={benchmark.setPeriodMs}
                      running={benchmark.running}
                      results={benchmark.results}
                      onRun={() => void benchmark.runBenchmark()}
                      onStop={benchmark.stopBenchmark}
                      onExportBenchmark={exportCurrentBenchmark}
                    />
                  ))}
                {requestTab === "examples" && (
                  <ExamplesPanel
                    examples={currentExamples}
                    selectedMethod={selectedMethod}
                    canSave={Boolean(selectedMethod || activeCollectionRequest)}
                    onSave={saveCurrentExample}
                    onImport={() => exampleInputRef.current?.click()}
                    onExport={exportCurrentMethodExamples}
                    onLoad={loadExample}
                    onRun={(example) => void runExample(example)}
                    onDelete={(id) => setExamples((current) => current.filter((item) => item.id !== id))}
                  />
                )}
                {requestTab === "mock" &&
                  (activeIsWebSocket ? (
                    <WebSocketMockPanel
                      request={activeCollectionRequest}
                      mockResponseText={activeWebSocketMockResponseText}
                      onMockResponseTextChange={updateActiveWebSocketMockResponse}
                      latestResult={lastResult}
                      status={wsMockStatus}
                      port={wsMockPort}
                      pathValue={wsMockPath}
                      intervalMs={wsMockIntervalMs}
                      loop={wsMockLoop}
                      maxLoops={wsMockMaxLoops}
                      streamOnConnect={wsMockStreamOnConnect}
                      onPortChange={setWsMockPort}
                      onPathChange={setWsMockPath}
                      onIntervalMsChange={setWsMockIntervalMs}
                      onLoopChange={setWsMockLoop}
                      onMaxLoopsChange={setWsMockMaxLoops}
                      onStreamOnConnectChange={setWsMockStreamOnConnect}
                      onStart={() => void startWebSocketMockServer()}
                      onStop={() => void stopWebSocketMockServer()}
                      onSendOnce={() => void sendWebSocketMockOnce()}
                      onCopy={copyActiveWebSocketMockResponse}
                    />
                  ) : (
                    <MockServerPanel
                      selectedMethod={selectedMethod}
                      status={mockServerStatus}
                      currentFile={currentMockFile}
                      currentParseResult={currentMockParse}
                      editorText={currentMockEditorText}
                      streamDefaults={mockServer.streamDefaults}
                      mappingRows={mockMappingRows}
                      onScenarioTextChange={handleMockScenarioTextChange}
                      onFormatChange={handleMockFormatChange}
                      onFormat={formatMockScenarioEditor}
                      onAddScenario={addMockScenarioFromCurrent}
                      onScenarioSelectChange={handleMockScenarioSelectChange}
                      onMethodEnabledChange={handleMockMethodEnabledChange}
                      onScenarioStreamSettingsChange={handleMockScenarioStreamSettingsChange}
                      onEditScenario={openMockScenarioManager}
                      onImport={() => mockScenarioInputRef.current?.click()}
                      onExport={exportMockScenarioFile}
                      onOpenFolder={() => void openMockScenarioFolder()}
                      onOpenSettings={() => setMockSettingsOpen(true)}
                    />
                  ))}
              </Box>
            </Paper>

            <Box
              onMouseDown={beginResponseResize}
              sx={{
                height: 6,
                flexShrink: 0,
                cursor: "row-resize",
                borderRadius: 999,
                bgcolor: "divider",
                opacity: 0.55,
                "&:hover": { bgcolor: "primary.main", opacity: 0.85 },
              }}
            />

            <Paper
              elevation={0}
              sx={{
                ...panelSx,
                flex: `0 0 ${responseHeight}px`,
                minHeight: minResponseHeight,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <ResponseToolbar
                filter={responseFilter}
                hasEvents={events.length > 0}
                hasLastResult={Boolean(lastResult)}
                onFilterChange={handleResponseFilterChange}
                onClearFilter={clearResponseFilter}
                onExport={exportResponseStable}
                onSaveDocs={saveCurrentResultForDocsStable}
                onClearResponse={clearActiveResponseStable}
              />
              <ResponseWorkbenchTabs value={responseTab} onChange={handleResponseTabChange} />
              <Box
                ref={responseBodyRef}
                className="response-selectable"
                onScroll={handleResponseBodyScroll}
                sx={{
                  p: designSystem.space.panelPadding,
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  position: "relative",
                }}
              >
                {responseTab === "messages" && (
                  <FeatureMessageTable
                    empty="Run a request to see messages."
                    events={messageEvents}
                    filterQuery={deferredResponseFilter}
                  />
                )}
                {responseTab === "messages" && showMessageTopButton && (
                  <Tooltip title="Top message">
                    <IconButton
                      size="small"
                      color="primary"
                      aria-label="Scroll to top message"
                      onClick={scrollMessagesToTop}
                      sx={{
                        position: "fixed",
                        right: 24,
                        bottom: 76,
                        zIndex: 60,
                        bgcolor: "background.paper",
                        borderColor: "divider",
                        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.22)",
                      }}
                    >
                      <KeyboardArrowUp fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {responseTab === "raw" && (
                  <FeatureJsonBlock value={lastResult ?? events} highlightQuery={deferredResponseFilter} />
                )}
                {responseTab === "history" && (
                  <FeatureHistoryTable
                    history={currentHistory}
                    filterQuery={deferredResponseFilter}
                    onClear={clearHistory}
                  />
                )}
                {responseTab === "report" && (
                  <FeatureJsonBlock value={reportPayload} highlightQuery={deferredResponseFilter} />
                )}
              </Box>
            </Paper>
          </Stack>
        </Box>
        <MockServerSettingsDialog
          open={mockSettingsOpen}
          onClose={() => setMockSettingsOpen(false)}
          mockServer={mockServer}
          status={mockServerStatus}
          parseResult={parsedMockConfig}
          mappingRows={mockMappingRows}
          onPortChange={handleMockPortChange}
          onScenarioSelectChange={handleMockScenarioSelectChange}
          onMethodEnabledChange={handleMockMethodEnabledChange}
          onScenarioStreamSettingsChange={handleMockScenarioStreamSettingsChange}
          onStreamBaseChange={handleMockGlobalStreamBaseChange}
          onStart={() => void startMockServer()}
          onStop={() => void stopMockServer()}
        />

        <Dialog open={mockScenarioDialogOpen} onClose={() => setMockScenarioDialogOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>Edit Scenario</DialogTitle>
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
              <Typography variant="caption" color="text.secondary">
                This only renames or deletes the selected scenario for the current method file.
              </Typography>
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
          <DialogTitle>Add WS Collection</DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            <Stack spacing={1.2} sx={{ mt: 0.5 }}>
              <Alert severity="warning" variant="outlined">
                WebSocket is a beta version and is not stable yet.
              </Alert>
              <TextField
                autoFocus
                size="small"
                label="WebSocket collection name"
                value={collectionNameDraft}
                onChange={(event: TextInputChangeEvent) => setCollectionNameDraft(event.target.value)}
                onKeyDown={(event: TextInputKeyboardEvent) => {
                  if (event.key === "Enter") confirmAddCollection();
                }}
                placeholder="Sample WebSocket Collection"
              />
              <Typography variant="caption" color="text.secondary">
                After this collection is created, use the + button in its row to add WebSocket requests. Import proto
                files when you need gRPC.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCollectionDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={confirmAddCollection}>
              Add WS Collection
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={requestNameDialogOpen} onClose={() => setRequestNameDialogOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>Add WebSocket Request</DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            <Stack spacing={1.2} sx={{ mt: 0.5 }}>
              <Alert severity="warning" variant="outlined">
                WebSocket is a beta version and is not stable yet.
              </Alert>
              <TextField
                autoFocus
                size="small"
                label="WebSocket request name"
                value={requestNameDraft}
                onChange={(event: TextInputChangeEvent) => setRequestNameDraft(event.target.value)}
                onKeyDown={(event: TextInputKeyboardEvent) => {
                  if (event.key === "Enter") confirmAddWebSocketRequest();
                }}
                placeholder="Chat stream"
              />
              <Typography variant="caption" color="text.secondary">
                The name is used for the tab, history, examples, docs, and WebSocket mock response template.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRequestNameDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={confirmAddWebSocketRequest}>
              Add Request
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={envDialogOpen} onClose={() => setEnvDialogOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>{envDialogMode === "edit" ? "Update Environment" : "Save Environment"}</DialogTitle>
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
                label={activeTransportMode === "native-grpc" ? "Native gRPC target" : "Request URL / base URL"}
                value={envDraftUrl}
                onChange={(event: TextInputChangeEvent) => setEnvDraftUrl(event.target.value)}
                placeholder={activeTransportMode === "native-grpc" ? "127.0.0.1:50051" : "https://api.example.com"}
              />
              <Typography variant="caption" color="text.secondary">
                {envDialogMode === "edit"
                  ? "Update the selected environment for the active transport. Use the edit icon in the environment menu to update or remove environments."
                  : "Saved environment will be attached to the active method tab and can be reused from the environment menu."}
              </Typography>
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
        <Dialog open={Boolean(protoPreview)} onClose={() => setProtoPreview(null)} fullWidth maxWidth="lg">
          <DialogTitle>{protoPreview?.name ?? "Proto source"}</DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            {protoPreview && <FeatureProtoSourceBlock file={protoPreview} />}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() =>
                protoPreview &&
                downloadTextFile(
                  `layang-proto-${protoPreview.name.replace(/[^a-z0-9_.-]/gi, "-")}-${timestampForFile()}.proto`,
                  protoPreview.text,
                  "text/x-protobuf",
                )
              }
            >
              Export proto
            </Button>
            <Button variant="contained" onClick={() => setProtoPreview(null)}>
              Close
            </Button>
          </DialogActions>
        </Dialog>
        <Snackbar
          key={toast.id}
          open={toast.open}
          autoHideDuration={3000}
          onClose={() => setToast((current) => ({ ...current, open: false }))}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            severity={toast.severity}
            variant="filled"
            onClose={() => setToast((current) => ({ ...current, open: false }))}
            sx={{ maxWidth: 560 }}
          >
            {toast.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

/**
 * Creates an isolated request tab for one service/method pair.
 */
/**
 * Renders method-scoped saved examples in the sidebar.
 */

/**
 * Renders method-scoped request history in the sidebar.
 */

/**
 * Renders a compact empty-state card.
 */

/**
 * Renders compact mock server controls inside the left sidebar.
 */

/**
 * Renders mock server settings that apply across the running server and all method files.
 */

/**
 * Renders the selected method mock file editor and per-method scenario controls.
 */

/**
 * Renders the full examples editor panel.
 */

/**
 * Formats a saved example body as a readable preview while preserving indentation.
 */
