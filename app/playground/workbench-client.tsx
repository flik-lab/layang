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
  Switch,
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
  createDefaultMockStreamDefaults,
  currentFileEmptyEditorText,
  describeMockMatcher,
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
import { eventToUiEvent, writeConsoleLog } from "./features/request-runner/request-result-utils";
import { createRequestSession } from "./features/request-runner/request-session-model";
import { downloadTextFile } from "./shared/browser-utils";
import { EmptyState } from "./shared/components/empty-state";
import { toErrorMessage } from "./shared/error-utils";
import { formatTimestampShort, timestampForFile } from "./shared/formatters";
import { safeJsonParse } from "./shared/json-utils";
import { clamp } from "./shared/number-utils";
import { methodKey, methodTypeLabel } from "./shared/rpc-method-utils";
import { createId, savedExampleKey, slugify } from "./shared/entity-utils";
import {
  buttonSx,
  compactCardSx,
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
  AssertionResult,
  DocResultSnapshot,
  EnvironmentConfig,
  EnvironmentKey,
  HistoryItem,
  LegacyWorkspace,
  MethodDoc,
  MockFormat,
  MockMethodScenarioFile,
  MockMethodScenarioRow,
  MockParseResult,
  MockScenarioBundle,
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
} from "./shared/workbench-types";
import type { GrpcEvent, GrpcResult, LoadedProto, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";

type CompatTheme = ReturnType<typeof createTheme>;

type ButtonClickEvent = ReactMouseEvent<HTMLButtonElement>;
type ElementClickEvent = ReactMouseEvent<HTMLElement>;
type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SelectInputChangeEvent = ChangeEvent<HTMLSelectElement>;
type SwitchInputChangeEvent = ChangeEvent<HTMLInputElement>;
type TextInputKeyboardEvent = ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>;

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
  const [loaded, setLoaded] = useState<LoadedProto | null>(null);
  const [selectedMethodKey, setSelectedMethodKey] = useState("");
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
  const responseBodyRef = useRef<HTMLDivElement | null>(null);
  const [showMessageTopButton, setShowMessageTopButton] = useState(false);
  const [requestSessions, setRequestSessions] = useState<RequestSession[]>([]);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [isNativeBridgeAvailable, setIsNativeBridgeAvailable] = useState(false);
  const _abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const sidebarResizeRef = useRef(false);
  const responseResizeRef = useRef(false);
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

  const activeMethodKey = selectedMethod ? methodKey(selectedMethod) : "";
  const currentExamples = useMemo(
    () => (activeMethodKey ? examples.filter((example) => savedExampleKey(example) === activeMethodKey) : []),
    [examples, activeMethodKey],
  );
  const currentHistory = useMemo(
    () => (activeMethodKey ? history.filter((item) => item.method === activeMethodKey) : []),
    [history, activeMethodKey],
  );
  const latestResultByMethod = useMemo(() => buildLatestResultByMethod(requestSessions), [requestSessions]);
  const savedDocResultByMethod = useMemo(() => buildSavedDocResultByMethod(docResults), [docResults]);
  const currentMethodDoc = useMemo(
    () => (activeMethodKey ? getOrCreateMethodDoc(methodDocs, selectedMethod) : null),
    [methodDocs, selectedMethod, activeMethodKey],
  );
  const activeDocsResult = activeMethodKey
    ? (savedDocResultByMethod.get(activeMethodKey) ?? latestResultByMethod.get(activeMethodKey) ?? null)
    : null;
  const parsedMockConfig = useMemo(
    () => parseAllMockScenarioFiles(mockServer, loaded?.methods ?? []),
    [mockServer, loaded],
  );
  const allMockScenarios = parsedMockConfig.ok ? parsedMockConfig.bundle.scenarios : [];
  const publishedDocs = useMemo(
    () =>
      buildPublishableDocs(
        loaded?.methods ?? [],
        methodDocs,
        examples,
        protoFiles,
        savedDocResultByMethod,
        allMockScenarios,
      ),
    [loaded, methodDocs, examples, protoFiles, savedDocResultByMethod, allMockScenarios],
  );
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

  const activeTransportMode = activeSession?.transportMode ?? transportMode;
  const activeBaseUrl = activeSession?.baseUrl ?? baseUrl;
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
  const draftEffectiveBaseUrl = activeTransportMode === "grpc-web" ? targetDraft : effectiveBaseUrl;
  const draftEffectiveNativeTarget = activeTransportMode === "native-grpc" ? targetDraft : effectiveNativeTarget;

  useEffect(() => {
    setTargetDraft(activeTransportMode === "grpc-web" ? effectiveBaseUrl : effectiveNativeTarget);
  }, [activeRequestId, activeTransportMode, activeEnvironmentKey, effectiveBaseUrl, effectiveNativeTarget]);

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
    ? activeTransportMode === "grpc-web"
      ? buildGrpcWebUrl(draftEffectiveBaseUrl, selectedMethod.serviceName, selectedMethod.methodName)
      : `${draftEffectiveNativeTarget.replace(/\/+$/, "")}/${selectedMethod.serviceName}/${selectedMethod.methodName}`
    : activeTransportMode === "grpc-web"
      ? draftEffectiveBaseUrl
      : draftEffectiveNativeTarget;

  const messageEvents = events.filter((event) => event.kind === "message");
  const reportPayload = useMemo(
    () => ({
      exportedAt: hydrated ? new Date().toISOString() : "",
      transportMode: activeTransportMode,
      target: activeTransportMode === "grpc-web" ? draftEffectiveBaseUrl : draftEffectiveNativeTarget,
      method: selectedMethod ? methodLabel(selectedMethod) : null,
      request: safeJsonParse(requestJson),
      metadata: metadata.filter((item) => item.key.trim()),
      result: lastResult,
      events,
      assertions: assertionResults,
    }),
    [
      hydrated,
      activeTransportMode,
      draftEffectiveBaseUrl,
      draftEffectiveNativeTarget,
      selectedMethod,
      requestJson,
      metadata,
      lastResult,
      events,
      assertionResults,
    ],
  );

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
      setRequestJson(project.requestJson || "{}");
      return;
    }

    try {
      const result = loadProtoFiles(project.protoFiles);
      setLoaded(result);
      const activeSession =
        project.requestTabs.find((session) => session.id === project.activeRequestId) ?? project.requestTabs[0];
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

    showToast("Endpoint data loaded.", "success");
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
   * Imports proto files or endpoint bundles selected by the user.
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
          endpointBundles.length ? "Endpoint data loaded." : "No .proto or endpoint .json file selected.",
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
      selectMethod(result.root, method);
      setSideSection("registry");
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      showToast(message, "error");
    } finally {
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
    const key = methodKey(method);
    const existing = requestSessions.find((session) => session.methodKey === key);
    if (existing) {
      activateRequestSession(existing);
      return;
    }

    const session = createRequestSession(root, method, {
      metadata,
      transportMode: activeTransportMode,
      baseUrl: activeBaseUrl,
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
    setSelectedMethodKey(session.methodKey);
    setRequestJson(session.requestJson);
    setMetadata(session.metadata.length ? session.metadata : defaultMetadata);
    setTransportMode(session.transportMode ?? transportMode);
    setBaseUrl(session.baseUrl ?? baseUrl);
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
   * Closes all request tabs except the active one.
   */
  function closeOtherRequestSessions() {
    if (!activeRequestId) return;
    requestSessions
      .filter((session) => session.id !== activeRequestId)
      .forEach((session) => {
        requestRunner.cancelRequest(session.id);
      });
    setRequestSessions((current) => current.filter((session) => session.id === activeRequestId));
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
    if (!activeMethodKey) return;
    setHistory((current) => current.filter((item) => item.method !== activeMethodKey));
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
    if (activeEnvironmentKey !== "default" && activeEnvironmentKey !== "manual") {
      setEnvironments((current) =>
        current.map((env) =>
          env.key === activeEnvironmentKey
            ? activeTransportMode === "grpc-web"
              ? { ...env, grpcWebBaseUrl: value }
              : { ...env, nativeTarget: value }
            : env,
        ),
      );
      return;
    }

    if (activeTransportMode === "grpc-web") {
      setBaseUrl(value);
      updateActiveSession({ baseUrl: value });
    } else {
      setNativeTarget(value);
      updateActiveSession({ nativeTarget: value });
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
    const currentUrl = activeTransportMode === "grpc-web" ? draftEffectiveBaseUrl : draftEffectiveNativeTarget;
    setEnvDialogMode("create");
    setEnvEditingKey("");
    setEnvDraftName(selectedMethod ? `${selectedMethod.methodName} Env` : "New Environment");
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
        activeTransportMode === "grpc-web" ? "gRPC-Web base URL is required." : "Native gRPC target is required.",
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
                grpcWebBaseUrl: activeTransportMode === "grpc-web" ? url : env.grpcWebBaseUrl,
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
      grpcWebBaseUrl: activeTransportMode === "grpc-web" ? url : draftEffectiveBaseUrl,
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
    setEnvDraftUrl(activeTransportMode === "grpc-web" ? env.grpcWebBaseUrl : env.nativeTarget);
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
   * Updates the JSON assertion/test editor.
   */
  function handleAssertionJsonChange(value: string) {
    setAssertionJson(value);
    updateActiveSession({ assertionJson: value });
  }

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
      return next;
    });
  }

  /**
   * Saves the current request as an example for the active method.
   */
  function saveCurrentExample() {
    if (!selectedMethod) return;
    const example: SavedExample = {
      id: createId(),
      name: `${selectedMethod.methodName} example ${currentExamples.length + 1}`,
      serviceName: selectedMethod.serviceName,
      methodName: selectedMethod.methodName,
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
    if (!selectedMethod || currentExamples.length === 0) return;
    downloadTextFile(
      `layang-examples-${selectedMethod.methodName}-${timestampForFile()}.json`,
      JSON.stringify(
        {
          version: 1,
          type: "layang-examples",
          method: { serviceName: selectedMethod.serviceName, methodName: selectedMethod.methodName },
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
      const matching = activeMethodKey
        ? incoming.find((example) => savedExampleKey(example) === activeMethodKey)
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
    if (!selectedMethod) return;
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
    if (!loaded) return;
    const found = loaded.methods.find(
      (method) => method.serviceName === example.serviceName && method.methodName === example.methodName,
    );
    if (!found) return;
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
  }

  /**
   * Runs an example against its matching method.
   */
  async function runExample(example: SavedExample) {
    const method = loaded?.methods.find(
      (item) => item.serviceName === example.serviceName && item.methodName === example.methodName,
    );
    await requestRunner.runRequest({
      overrideMethod: method,
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
              sx={{ width: 166, flexShrink: 0, justifyContent: "flex-start", WebkitAppRegion: "no-drag" }}
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
                  <UploadFile fontSize="small" /> Import workspace / proto / docs / examples
                </MenuItem>
                <MenuItem onClick={openProtoFolderImporter}>
                  <UploadFile fontSize="small" /> Import proto folder
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
              sx={{ alignSelf: "stretch", width: 12, flexShrink: 0, WebkitAppRegion: "drag" }}
            />
            <Tooltip title={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}>
              <IconButton size="small" onClick={toggleTheme} sx={{ flexShrink: 0, WebkitAppRegion: "no-drag" }}>
                {themeMode === "dark" ? (
                  <DarkMode sx={{ fontSize: 16 }} color="primary" />
                ) : (
                  <LightMode sx={{ fontSize: 16 }} color="primary" />
                )}
              </IconButton>
            </Tooltip>
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
          accept=".proto"
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
            label="APIs"
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
            label="Mocks"
            status={mockServerStatus.running ? "running" : "idle"}
            onClick={() => {
              setSideSection("mocks");
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
              />
              {sideSection === "registry" && (
                <Stack direction="row" spacing={0.7}>
                  <Button
                    fullWidth
                    size="small"
                    variant="contained"
                    startIcon={<UploadFile />}
                    onClick={() => protoInputRef.current?.click()}
                  >
                    Import
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => protoFolderInputRef.current?.click()}
                    sx={{ minWidth: 72 }}
                  >
                    Folder
                  </Button>
                  <Button size="small" variant="outlined" onClick={loadSample} sx={{ minWidth: 68 }}>
                    Sample
                  </Button>
                </Stack>
              )}
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
                  placeholder="Search APIs"
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
                    endpointGroups={endpointGroups}
                    selectedMethodKey={selectedMethodKey}
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
                  />
                )}
                {sideSection === "examples" && (
                  <ExampleSidebar
                    examples={currentExamples}
                    onLoad={loadExample}
                    onRun={(example) => void runExample(example)}
                    onDelete={(id) => setExamples((current) => current.filter((item) => item.id !== id))}
                    onClear={() =>
                      setExamples((current) => current.filter((item) => savedExampleKey(item) !== activeMethodKey))
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
                {sideSection === "docs" && (
                  <FeatureDocsSidebar
                    docs={publishedDocs}
                    activeMethodKey={activeMethodKey}
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
                      title={selectedMethod ? selectedMethod.methodName : "Select an API method"}
                    >
                      {selectedMethod ? `${selectedMethod.methodName}` : "Select an API method"}
                    </Typography>
                    {selectedMethod && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={selectedMethod.responseStream ? "secondary" : "primary"}
                        label={methodTypeLabel(selectedMethod)}
                      />
                    )}
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    title={selectedMethod?.serviceName ?? "Import proto files to build the registry."}
                  >
                    {selectedMethod?.serviceName ?? "Import proto files to build the registry."}
                  </Typography>
                </Box>
                {activeRunning ? (
                  <Tooltip title="Stop running request">
                    <IconButton size="small" color="warning" onClick={() => requestRunner.cancelRequest()}>
                      <StopCircle fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<PlayArrow />}
                    disabled={!selectedMethod || (activeTransportMode === "native-grpc" && !isNativeBridgeAvailable)}
                    onClick={() => {
                      commitTargetDraft();
                      void requestRunner.runRequest();
                    }}
                  >
                    {selectedMethod?.responseStream ? "Start stream" : "Send"}
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
                  sx={{ width: 54, minWidth: 54, px: 0.5, justifyContent: "center", flexShrink: 0 }}
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
                    const target = activeTransportMode === "grpc-web" ? env.grpcWebBaseUrl : env.nativeTarget;
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
                <FormControl size="small" sx={{ width: 145 }}>
                  <Select
                    value={activeTransportMode}
                    onChange={(event: SelectInputChangeEvent) =>
                      handleTransportModeChange(event.target.value as TransportMode)
                    }
                  >
                    <MenuItem value="grpc-web">gRPC-Web</MenuItem>
                    <MenuItem value="native-grpc">Native gRPC</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  fullWidth
                  value={targetDraft}
                  onChange={(event: TextInputChangeEvent) => handleTargetDraftChange(event.target.value)}
                  onBlur={() => commitTargetDraft()}
                  onKeyDown={(event: TextInputKeyboardEvent) => {
                    if (event.key === "Enter") commitTargetDraft();
                  }}
                  placeholder={activeTransportMode === "grpc-web" ? "APISIX / Envoy base URL" : "localhost:50051"}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        {activeTransportMode === "grpc-web" ? (
                          <Language sx={{ fontSize: 16 }} />
                        ) : (
                          <DesktopWindows sx={{ fontSize: 16 }} />
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

              <WorkbenchTabs<RequestTab>
                value={requestTab}
                onChange={setRequestTab}
                items={[
                  { value: "body", label: "Body" },
                  { value: "metadata", label: "Metadata" },
                  { value: "schema", label: "Schema" },
                  { value: "docs", label: "Docs" },
                  { value: "benchmark", label: "Benchmark" },
                  {
                    value: "examples",
                    label: currentExamples.length ? `Examples ${currentExamples.length}` : "Examples",
                  },
                  { value: "mock", label: "Mock" },
                  { value: "assertions", label: "Tests" },
                ]}
              />
              <Box sx={{ p: designSystem.space.panelPadding, minHeight: 0, flex: 1, overflow: "auto" }}>
                {requestTab === "body" && (
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
                )}
                {requestTab === "metadata" && (
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
                )}
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
                {requestTab === "docs" && (
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
                )}
                {requestTab === "benchmark" && (
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
                )}
                {requestTab === "examples" && (
                  <ExamplesPanel
                    examples={currentExamples}
                    selectedMethod={selectedMethod}
                    onSave={saveCurrentExample}
                    onImport={() => exampleInputRef.current?.click()}
                    onExport={exportCurrentMethodExamples}
                    onLoad={loadExample}
                    onRun={(example) => void runExample(example)}
                    onDelete={(id) => setExamples((current) => current.filter((item) => item.id !== id))}
                  />
                )}
                {requestTab === "mock" && (
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
                )}
                {requestTab === "assertions" && (
                  <Stack spacing={1}>
                    <Typography variant="subtitle1">Tests</Typography>
                    <Alert severity="info">
                      Fill Expected/Tests as JSON assertions, for example{" "}
                      <code>{JSON.stringify({ grpcStatus: "0", minMessages: 1, maxLatencyMs: 1000 })}</code>. Leave it
                      empty to skip validation.
                    </Alert>
                    <FeatureCodeTextField
                      value={assertionJson}
                      onChange={handleAssertionJsonChange}
                      minRows={7}
                      language="json"
                    />
                    <AssertionResults results={assertionResults} />
                  </Stack>
                )}
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
                  <Stack spacing={1.2}>
                    <AssertionResults results={assertionResults} />
                    <FeatureJsonBlock value={reportPayload} highlightQuery={deferredResponseFilter} />
                  </Stack>
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
                label={activeTransportMode === "grpc-web" ? "gRPC-Web base URL" : "Native gRPC target"}
                value={envDraftUrl}
                onChange={(event: TextInputChangeEvent) => setEnvDraftUrl(event.target.value)}
                placeholder={activeTransportMode === "grpc-web" ? "http://127.0.0.1:9080/grpc/web" : "127.0.0.1:50051"}
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
function ExampleSidebar({
  examples,
  onLoad,
  onRun,
  onDelete,
  onClear,
}: {
  examples: SavedExample[];
  onLoad: (example: SavedExample) => void;
  onRun: (example: SavedExample) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  if (examples.length === 0) return <SmallEmpty body="Save a request as an example." />;
  return (
    <Stack spacing={designSystem.space.gap}>
      <Button size="small" color="error" variant="text" onClick={onClear} sx={{ ...buttonSx, alignSelf: "flex-start" }}>
        Clear examples
      </Button>
      {examples.map((example) => (
        <Paper key={example.id} variant="outlined" sx={compactCardSx}>
          <Stack spacing={0.7}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={520} noWrap title={example.name}>
                {example.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                title={`${example.serviceName}/${example.methodName}`}
                display="block"
              >
                {example.serviceName}/{example.methodName}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Button size="small" variant="outlined" onClick={() => onLoad(example)} sx={buttonSx}>
                Load
              </Button>
              <Button size="small" variant="contained" onClick={() => onRun(example)} sx={buttonSx}>
                Run
              </Button>
              <IconButton size="small" color="error" onClick={() => onDelete(example.id)} sx={iconButtonSx}>
                <Delete sx={{ fontSize: 14 }} />
              </IconButton>
            </Stack>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

/**
 * Renders method-scoped request history in the sidebar.
 */
function HistorySidebar({ history, onClear }: { history: HistoryItem[]; onClear: () => void }) {
  if (history.length === 0) return <SmallEmpty body="Request history appears here." />;
  return (
    <Stack spacing={designSystem.space.gap}>
      <Button size="small" color="error" variant="text" onClick={onClear} sx={{ ...buttonSx, alignSelf: "flex-start" }}>
        Clear history
      </Button>
      {history.slice(0, 30).map((item) => (
        <Paper key={item.id} variant="outlined" sx={compactCardSx}>
          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
            <Typography
              variant="body2"
              fontWeight={540}
              noWrap
              title={item.method.split("/").pop()}
              sx={{ minWidth: 0 }}
            >
              {item.method.split("/").pop()}
            </Typography>
            <Chip size="small" label={item.status} />
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap title={item.method} display="block">
            {item.method}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {item.durationMs} ms - {formatTimestampShort(item.timestamp)}
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
}

/**
 * Renders a compact empty-state card.
 */
function SmallEmpty({ body }: { body: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
    </Paper>
  );
}

function MethodMockSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Switch
      checked={checked}
      onChange={(event: SwitchInputChangeEvent) => onChange(event.target.checked)}
      aria-label={checked ? "Mock enabled for method" : "Mock disabled for method"}
      title={checked ? "Mock enabled" : "Mock disabled"}
    />
  );
}

/**
 * Renders compact mock server controls inside the left sidebar.
 */
function MockServerSidebar({
  mockServer,
  selectedMethod,
  status,
  currentFile,
  currentParseResult,
  onSettings,
  onGenerate,
  onStart,
  onStop,
  onImport,
  onExport,
}: {
  mockServer: MockServerProject;
  selectedMethod: RpcMethodInfo | null;
  status: MockServerStatus;
  currentFile: MockMethodScenarioFile;
  currentParseResult: MockParseResult;
  onSettings: () => void;
  onGenerate: () => void;
  onStart: () => void;
  onStop: () => void;
  onImport: () => void;
  onExport: () => void;
}) {
  return (
    <Stack spacing={designSystem.space.gap}>
      <Paper variant="outlined" sx={compactCardSx}>
        <Stack spacing={0.8}>
          <Stack direction="row" spacing={0.6} alignItems="center" justifyContent="space-between">
            <Typography variant="body2" fontWeight={560}>
              Mock server
            </Typography>
            <Chip
              size="small"
              color={status.running ? "success" : "default"}
              label={status.running ? "Running" : "Stopped"}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block">
            Port {status.port ?? mockServer.port}
          </Typography>
          {status.url && (
            <Typography variant="caption" color="text.secondary" display="block">
              {status.url}
            </Typography>
          )}
          {status.message && (
            <Typography variant="caption" color="text.secondary" display="block">
              {status.message}
            </Typography>
          )}
          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
            <Button size="small" variant="outlined" onClick={onSettings} sx={buttonSx}>
              Settings
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<PlayArrow />}
              onClick={onStart}
              disabled={status.running}
              sx={buttonSx}
            >
              Start
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<StopCircle />}
              onClick={onStop}
              disabled={!status.running}
              sx={buttonSx}
            >
              Stop
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={compactCardSx}>
        <Stack spacing={0.7}>
          <Typography variant="body2" fontWeight={560}>
            Current method file
          </Typography>
          <Typography variant="caption" color={selectedMethod ? "text.secondary" : "error"} display="block">
            {selectedMethod
              ? `${safeMockFileBaseName(selectedMethod)}.${currentFile.format === "yaml" ? "yaml" : "json"}`
              : "Select a method first"}
          </Typography>
          <Typography variant="caption" color={currentParseResult.ok ? "text.secondary" : "error"} display="block">
            {currentParseResult.ok ? "Method mock file ready" : currentParseResult.error}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
            <Button size="small" variant="outlined" onClick={onGenerate} disabled={!selectedMethod} sx={buttonSx}>
              Add scenario
            </Button>
            <Button size="small" variant="outlined" onClick={onImport} disabled={!selectedMethod} sx={buttonSx}>
              Import
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={onExport}
              disabled={!selectedMethod || !currentParseResult.ok}
              sx={buttonSx}
            >
              Export
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}

/**
 * Renders mock server settings that apply across the running server and all method files.
 */
function MockServerSettingsDialog({
  open,
  onClose,
  mockServer,
  status,
  parseResult,
  mappingRows,
  onPortChange,
  onScenarioSelectChange,
  onMethodEnabledChange,
  onScenarioStreamSettingsChange,
  onStreamBaseChange,
  onStart,
  onStop,
}: {
  open: boolean;
  onClose: () => void;
  mockServer: MockServerProject;
  status: MockServerStatus;
  parseResult: MockParseResult;
  mappingRows: MockMethodScenarioRow[];
  onPortChange: (value: string) => void;
  onScenarioSelectChange: (method: RpcMethodInfo, scenarioId: string) => void;
  onMethodEnabledChange: (method: RpcMethodInfo, enabled: boolean) => void;
  onScenarioStreamSettingsChange: (
    method: RpcMethodInfo,
    scenarioId: string,
    patch: Partial<MockStreamSettings>,
  ) => void;
  onStreamBaseChange: (patch: Partial<MockStreamSettings>) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const streamDefaults = mockServer.streamDefaults ?? createDefaultMockStreamDefaults();
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Mock server settings</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={1.2} sx={{ mt: 0.5 }}>
          <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="end" flexWrap="wrap">
                <TextField
                  size="small"
                  type="number"
                  label="Port"
                  value={String(mockServer.port)}
                  onChange={(event: TextInputChangeEvent) => onPortChange(event.target.value)}
                  sx={{ width: 120 }}
                />
                {status.running ? (
                  <Button size="small" color="error" variant="outlined" startIcon={<StopCircle />} onClick={onStop}>
                    Stop
                  </Button>
                ) : (
                  <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={onStart}>
                    Start
                  </Button>
                )}
                <Box sx={{ flex: 1, minWidth: 160 }} />
                <Chip
                  size="small"
                  color={status.running ? "success" : "default"}
                  label={status.running ? `Running on ${status.port ?? mockServer.port}` : "Stopped"}
                />
              </Stack>
              <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap">
                <Typography variant="caption" color="text.secondary" display="block">
                  Default stream
                </Typography>
                <TextField
                  size="small"
                  type="number"
                  label="Interval ms"
                  value={String(streamDefaults.intervalMs ?? 0)}
                  onChange={(event: TextInputChangeEvent) =>
                    onStreamBaseChange({ intervalMs: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
                  }
                  sx={{ width: 130 }}
                />
                <Stack spacing={0.3}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Loop
                  </Typography>
                  <FormControl size="small" sx={{ width: 120 }}>
                    <Select
                      value={streamDefaults.loop ? "yes" : "no"}
                      onChange={(event: SelectInputChangeEvent) =>
                        onStreamBaseChange({ loop: event.target.value === "yes" })
                      }
                    >
                      <MenuItem value="no">No</MenuItem>
                      <MenuItem value="yes">Yes</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
                <TextField
                  size="small"
                  type="number"
                  label="Max loops"
                  value={String(streamDefaults.maxLoops ?? 0)}
                  onChange={(event: TextInputChangeEvent) =>
                    onStreamBaseChange({ maxLoops: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
                  }
                  helperText="0 = infinite"
                  sx={{ width: 130 }}
                />
              </Stack>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
            <Stack spacing={0.9}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap">
                <Typography variant="body2" fontWeight={560}>
                  Methods
                </Typography>
              </Stack>
              {parseResult.ok ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Mock</TableCell>
                        <TableCell>Method</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Scenario</TableCell>
                        <TableCell>Stream override</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {mappingRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5}>Import proto files before adding scenarios.</TableCell>
                        </TableRow>
                      ) : (
                        mappingRows.map((row) => {
                          const stream = row.activeScenario?.stream;
                          const canStream = row.mode === "server-stream" && Boolean(row.activeScenario);
                          return (
                            <TableRow key={`settings-${row.methodKey}`}>
                              <TableCell sx={{ width: 72 }}>
                                <MethodMockSwitch
                                  checked={row.methodEnabled}
                                  onChange={(checked) => onMethodEnabledChange(row.method, checked)}
                                />
                              </TableCell>
                              <TableCell title={`${row.serviceName}/${row.methodName}`}>{row.methodName}</TableCell>
                              <TableCell>{row.mode}</TableCell>
                              <TableCell sx={{ minWidth: 230 }}>
                                {row.scenarios.length ? (
                                  <FormControl size="small" sx={{ minWidth: 220 }}>
                                    <Select
                                      value={row.activeScenarioId || row.scenarios[0]?.id || ""}
                                      onChange={(event: SelectInputChangeEvent) =>
                                        onScenarioSelectChange(row.method, String(event.target.value))
                                      }
                                    >
                                      {row.scenarios.map((scenario) => (
                                        <MenuItem
                                          key={`scenario-option-${row.methodKey}-${scenario.id}`}
                                          value={scenario.id}
                                        >
                                          {scenario.id}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                ) : (
                                  <Typography variant="caption" color="error" display="block">
                                    No scenario
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell sx={{ minWidth: 360 }}>
                                {canStream ? (
                                  <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
                                    <TextField
                                      size="small"
                                      type="number"
                                      label="Interval"
                                      value={String(stream?.intervalMs ?? streamDefaults.intervalMs ?? 0)}
                                      onChange={(event: TextInputChangeEvent) =>
                                        onScenarioStreamSettingsChange(row.method, row.activeScenarioId, {
                                          intervalMs: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                                        })
                                      }
                                      sx={{ width: 110 }}
                                    />
                                    <Stack spacing={0.3}>
                                      <Typography variant="caption" color="text.secondary" display="block">
                                        Loop
                                      </Typography>
                                      <FormControl size="small" sx={{ width: 110 }}>
                                        <Select
                                          value={(stream?.loop ?? streamDefaults.loop) ? "yes" : "no"}
                                          onChange={(event: SelectInputChangeEvent) =>
                                            onScenarioStreamSettingsChange(row.method, row.activeScenarioId, {
                                              loop: event.target.value === "yes",
                                            })
                                          }
                                        >
                                          <MenuItem value="no">No</MenuItem>
                                          <MenuItem value="yes">Yes</MenuItem>
                                        </Select>
                                      </FormControl>
                                    </Stack>
                                    <TextField
                                      size="small"
                                      type="number"
                                      label="Max"
                                      value={String(stream?.maxLoops ?? streamDefaults.maxLoops ?? 0)}
                                      onChange={(event: TextInputChangeEvent) =>
                                        onScenarioStreamSettingsChange(row.method, row.activeScenarioId, {
                                          maxLoops: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                                        })
                                      }
                                      sx={{ width: 100 }}
                                    />
                                  </Stack>
                                ) : (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    {row.mode === "unary" ? "Unary method" : "Streaming type not supported"}
                                  </Typography>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Alert severity="error" variant="filled">
                  {parseResult.error}
                </Alert>
              )}
            </Stack>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Renders the selected method mock file editor and per-method scenario controls.
 */
function MockServerPanel({
  selectedMethod,
  status,
  currentFile,
  currentParseResult,
  editorText,
  streamDefaults,
  mappingRows,
  onScenarioTextChange,
  onFormatChange,
  onFormat,
  onAddScenario,
  onScenarioSelectChange,
  onMethodEnabledChange,
  onScenarioStreamSettingsChange,
  onEditScenario,
  onImport,
  onExport,
  onOpenFolder,
  onOpenSettings,
}: {
  selectedMethod: RpcMethodInfo | null;
  status: MockServerStatus;
  currentFile: MockMethodScenarioFile;
  currentParseResult: MockParseResult;
  editorText: string;
  streamDefaults: Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>;
  mappingRows: MockMethodScenarioRow[];
  onScenarioTextChange: (value: string) => void;
  onFormatChange: (format: MockFormat) => void;
  onFormat: () => void;
  onAddScenario: () => void;
  onScenarioSelectChange: (method: RpcMethodInfo, scenarioId: string) => void;
  onMethodEnabledChange: (method: RpcMethodInfo, enabled: boolean) => void;
  onScenarioStreamSettingsChange: (
    method: RpcMethodInfo,
    scenarioId: string,
    patch: Partial<MockStreamSettings>,
  ) => void;
  onEditScenario: (method: RpcMethodInfo, scenarioId: string) => void;
  onImport: () => void;
  onExport: () => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
}) {
  const currentRow = selectedMethod
    ? mappingRows.find((row) => row.methodKey === methodKey(selectedMethod))
    : undefined;
  const currentScenarios = currentRow?.scenarios ?? [];
  const streamBase = streamDefaults ?? createDefaultMockStreamDefaults();
  const activeStream = currentRow?.activeScenario?.stream;
  const selectedScenarioId = currentRow?.activeScenarioId || currentScenarios[0]?.id || "";
  return (
    <Stack spacing={1.2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap">
        <Stack spacing={0.2} sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1">Method mock scenarios</Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {selectedMethod
              ? `${selectedMethod.serviceName}/${selectedMethod.methodName} - ${safeMockFileBaseName(selectedMethod)}.${currentFile.format === "yaml" ? "yaml" : "json"}`
              : "Select a method to edit its own mock file"}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
          <Chip
            size="small"
            label={status.running ? "Running" : "Stopped"}
            color={status.running ? "success" : "default"}
          />
          <Button size="small" variant="outlined" onClick={onOpenSettings}>
            Mock settings
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
        <FormControl size="small" sx={{ width: 96 }} disabled={!selectedMethod}>
          <Select
            value={currentFile.format}
            onChange={(event: SelectInputChangeEvent) => onFormatChange(event.target.value as MockFormat)}
          >
            <MenuItem value="json">JSON</MenuItem>
            <MenuItem value="yaml">YAML</MenuItem>
          </Select>
        </FormControl>
        <Button size="small" variant="outlined" onClick={onAddScenario} disabled={!selectedMethod}>
          Add scenario
        </Button>
        <Button size="small" variant="outlined" onClick={onImport} disabled={!selectedMethod}>
          Import
        </Button>
        <Button size="small" variant="outlined" onClick={onExport} disabled={!selectedMethod || !currentParseResult.ok}>
          Export
        </Button>
        <Button size="small" variant="outlined" onClick={onOpenFolder}>
          Open folder
        </Button>
        <Button size="small" variant="outlined" onClick={onFormat} disabled={!selectedMethod}>
          Format
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
        <Stack spacing={0.8}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap">
            <Typography variant="body2" fontWeight={560}>
              Scenario for current method
            </Typography>
            {selectedMethod && (
              <Typography variant="caption" color="text.secondary" display="block">
                {currentFile.format.toUpperCase()}
              </Typography>
            )}
          </Stack>
          {!selectedMethod ? (
            <SmallEmpty body="Select a method to edit that method's mock file." />
          ) : currentScenarios.length === 0 ? (
            <SmallEmpty body="No scenario exists for this method yet. Click Add scenario." />
          ) : (
            <Stack spacing={0.8}>
              <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap">
                <MethodMockSwitch
                  checked={Boolean(currentRow?.methodEnabled)}
                  onChange={(checked) => onMethodEnabledChange(selectedMethod, checked)}
                />
                <Typography variant="body2" fontWeight={540}>
                  {currentRow?.methodEnabled ? "Mock enabled" : "Mock disabled"}
                </Typography>
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <Select
                    value={selectedScenarioId}
                    onChange={(event: SelectInputChangeEvent) =>
                      onScenarioSelectChange(selectedMethod, String(event.target.value))
                    }
                  >
                    {currentScenarios.map((scenario) => (
                      <MenuItem key={`current-scenario-${scenario.id}`} value={scenario.id}>
                        {scenario.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Tooltip title="Edit scenario">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => onEditScenario(selectedMethod, selectedScenarioId)}
                      disabled={!selectedScenarioId}
                      sx={iconButtonSx}
                    >
                      <Edit sx={{ fontSize: 15 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                {currentRow?.activeScenario && (
                  <Chip size="small" label={describeMockMatcher(currentRow.activeScenario.input)} />
                )}
              </Stack>
              {selectedMethod.responseStream && currentRow?.activeScenario ? (
                <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap">
                  <TextField
                    size="small"
                    type="number"
                    label="Interval ms"
                    value={String(activeStream?.intervalMs ?? streamBase.intervalMs ?? 0)}
                    onChange={(event: TextInputChangeEvent) =>
                      onScenarioStreamSettingsChange(selectedMethod, selectedScenarioId, {
                        intervalMs: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                      })
                    }
                    sx={{ width: 130 }}
                  />
                  <Stack spacing={0.3}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Loop
                    </Typography>
                    <FormControl size="small" sx={{ width: 120 }}>
                      <Select
                        value={(activeStream?.loop ?? streamBase.loop) ? "yes" : "no"}
                        onChange={(event: SelectInputChangeEvent) =>
                          onScenarioStreamSettingsChange(selectedMethod, selectedScenarioId, {
                            loop: event.target.value === "yes",
                          })
                        }
                      >
                        <MenuItem value="no">No</MenuItem>
                        <MenuItem value="yes">Yes</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>
                  <TextField
                    size="small"
                    type="number"
                    label="Max loops"
                    value={String(activeStream?.maxLoops ?? streamBase.maxLoops ?? 0)}
                    onChange={(event: TextInputChangeEvent) =>
                      onScenarioStreamSettingsChange(selectedMethod, selectedScenarioId, {
                        maxLoops: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                      })
                    }
                    helperText="0 = infinite"
                    sx={{ width: 130 }}
                  />
                  <Chip
                    size="small"
                    label={`${currentRow.activeScenario.stream?.responses?.length ?? 0} stream response`}
                  />
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary" display="block">
                  Unary scenarios use output data only.
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </Paper>

      <Stack spacing={0.6}>
        <Typography variant="body2" fontWeight={560}>
          Selected scenario JSON/YAML editor
        </Typography>
        <FeatureCodeTextField
          value={editorText}
          onChange={onScenarioTextChange}
          minRows={15}
          maxRows={28}
          language={currentFile.format}
        />
      </Stack>
    </Stack>
  );
}

/**
 * Renders the full examples editor panel.
 */
function ExamplesPanel({
  examples,
  selectedMethod,
  onSave,
  onImport,
  onExport,
  onLoad,
  onRun,
  onDelete,
}: {
  examples: SavedExample[];
  selectedMethod: RpcMethodInfo | null;
  onSave: () => void;
  onImport: () => void;
  onExport: () => void;
  onLoad: (example: SavedExample) => void;
  onRun: (example: SavedExample) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Stack spacing={1}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography variant="subtitle1">Method examples</Typography>
        <Stack direction="row" spacing={0.6}>
          <Button size="small" variant="outlined" onClick={onImport} sx={buttonSx}>
            Load example
          </Button>
          <Button size="small" variant="outlined" onClick={onExport} disabled={examples.length === 0} sx={buttonSx}>
            Export
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<Add />}
            disabled={!selectedMethod}
            onClick={onSave}
            sx={buttonSx}
          >
            Save current
          </Button>
        </Stack>
      </Stack>
      {examples.length === 0 ? (
        <EmptyState
          title="No saved examples"
          body="Save a request from this menu, or load an example JSON for the matching method."
        />
      ) : (
        <Stack spacing={0.8}>
          {examples.map((example) => (
            <Paper key={example.id} variant="outlined" sx={compactCardSx}>
              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={540} noWrap title={example.name}>
                    {example.name}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    noWrap
                    title={`${example.serviceName}/${example.methodName}`}
                  >
                    {example.serviceName}/{example.methodName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatTimestampShort(example.createdAt)}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.6} alignItems="center" sx={{ flexShrink: 0 }}>
                  <Button size="small" variant="outlined" onClick={() => onLoad(example)} sx={buttonSx}>
                    Load
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<PlayArrow />}
                    onClick={() => onRun(example)}
                    sx={buttonSx}
                  >
                    Run
                  </Button>
                  <IconButton size="small" color="error" onClick={() => onDelete(example.id)} sx={iconButtonSx}>
                    <Delete sx={{ fontSize: 16 }} />
                  </IconButton>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * Renders request assertion/test results.
 */
function AssertionResults({ results }: { results: AssertionResult[] }) {
  if (results.length === 0)
    return <Alert severity="info">Tests are optional. Leave this empty to skip validation.</Alert>;
  return (
    <Stack spacing={0.8}>
      {results.map((result) => (
        <Alert
          key={result.name}
          severity={result.status === "passed" ? "success" : result.status === "failed" ? "error" : "info"}
        >
          <strong>{result.name}</strong>: {result.detail}
        </Alert>
      ))}
    </Stack>
  );
}

/**
 * Formats a saved example body as a readable preview while preserving indentation.
 */
function _formatExamplePreview(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "{}";
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}
