"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Alert,
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
  ListItemButton,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@/components/shadcn/compat";
import {
  Add,
  Close,
  ContentCopy,
  Folder,
  MockServer,
  MoreHoriz,
  PlayArrow,
  Refresh,
  Settings,
  StopCircle,
} from "@/components/shadcn/icons";
import type { RpcMethodInfo } from "@/lib/types";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import { MethodStatusIndicator } from "../../shared/components/method-status-indicator";
import { WorkbenchPanel, WorkbenchPanelHeader, WorkbenchTabs } from "@/components/ui/workbench";
import { RestMockPanel } from "../rest/rest-panels";
import { WebSocketMockPanel } from "../websocket/websocket-panels";
import { CodeTextField as FeatureCodeTextField } from "../request-editor/request-editor-panels";
import { WebAccessSecurityPanel } from "./web-access-security-panel";
import { chooseHttpsPemFiles, testHttpsEndpoint } from "../../shared/certificate-settings";
import {
  createDefaultGatewayProfile,
  formatSingleMockScenarioForEditor,
  getMockMethodScenarioFile,
  parseMockScenarioText,
  parseSingleMockScenarioText,
  saveMockScenarioForMethod,
} from "../mock-server/mock-scenario-model";
import { methodKey } from "../../shared/rpc-method-utils";
import { uiCopy } from "../../shared/ui-copy";
import { interactionStartedAt, measureInteraction } from "../../shared/performance/interaction-performance";
import { grpcMockOverviewMethodKey } from "../../shared/workbench-constants";
import { mockScenarioDisplayName, rpcMethodKindLabel } from "../mock-server/mock-scenario-ui";
import { useMockCatalog, useMockCatalogSourceSync } from "../mock-server/catalog/useMockCatalog";
import {
  useGrpcMockRuntimeStatus,
  useRestMockRuntimeStatus,
  useWebAccessRuntimeStatus,
  useWebSocketMockRuntimeStatus,
} from "../mock-server/runtime/useMockRuntimeSelector";
import { MockCatalogPanel } from "../mock-server/workspace/MockCatalogList";
import type { MockCatalogMethodRow } from "../mock-server/catalog/mockCatalog.types";
import type {
  GrpcGatewayProfile,
  GrpcWebProxyConfig,
  MockFormat,
  MockProtoSource,
  MockScenario,
  MockServerProject,
} from "../../shared/workbench-types";

const cardSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 2,
  p: 1.2,
} as const;

const webAccessPageSx = {
  width: "100%",
  maxWidth: 960,
  mx: "auto",
} as const;

function useImmediateMockMethodSelection(
  setMockSelectedMethodKey: (key: string) => void,
  selectProtoLibraryVersion: (
    libraryId: string,
    versionId: string,
    options?: { persistDefault?: boolean },
  ) => void,
) {
  return useCallback(
    (key: string, source: { libraryId: string; versionId: string }) => {
      const startedAt = interactionStartedAt();
      setMockSelectedMethodKey(key);
      selectProtoLibraryVersion(source.libraryId, source.versionId, { persistDefault: false });
      window.requestAnimationFrame(() => measureInteraction("mock-method-select", startedAt));
    },
    [selectProtoLibraryVersion, setMockSelectedMethodKey],
  );
}

const webAccessSectionSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 2.5,
  p: { xs: 1.25, sm: 1.75 },
  bgcolor: "background.paper",
} as const;

type ViewContext = Record<string, any>;
type GrpcMockTab = "scenarios" | "proto" | "web-access" | "activity";
type GrpcMockSettingsPage = "server" | "security" | "web-server" | "defaults" | "advanced";
type AttachedMethod = {
  source: MockProtoSource;
  library: any;
  version: any;
  root: any;
  method: RpcMethodInfo;
};
export type GrpcMockScenarioRow = AttachedMethod & { scenario: MockScenario; enabled: boolean; selected: boolean };
type ScenarioRow = GrpcMockScenarioRow;


export function ServicesWorkspace({ ctx: shellCtx }: { ctx: ViewContext }) {
  const mockServerRuntimeStatus = useGrpcMockRuntimeStatus();
  const restRuntimeStatus = useRestMockRuntimeStatus();
  const webSocketRuntimeStatus = useWebSocketMockRuntimeStatus();
  const webAccessRuntimeStatus = useWebAccessRuntimeStatus();
  const ctx: ViewContext = useMemo<ViewContext>(
    () => ({
      ...shellCtx,
      mockServerStatus: mockServerRuntimeStatus,
      restMockStatus: restRuntimeStatus,
      wsMockStatus: webSocketRuntimeStatus,
      webAccessStatus: webAccessRuntimeStatus,
    }),
    [shellCtx, mockServerRuntimeStatus, restRuntimeStatus, webSocketRuntimeStatus, webAccessRuntimeStatus],
  );
  const {
    activeCollectionRequest,
    activeRestMockResponseText,
    activeRestMockScenario,
    activeRestMockScenarios,
    activeWebSocketMockResponseText,
    activeWebSocketMockScenario,
    activeWebSocketMockScenarios,
    addRestMockScenario,
    addRestMockScenarioPair,
    addWebSocketMockScenario,
    copyActiveWebSocketMockResponse,
    mockServer,
    mockServerStatus,
    protoRuntimeRegistry,
    setMockServer,
    startMockServer,
    stopMockServer,
    startWebAccess,
    stopWebAccess,
    webAccessStatus,
    handleRestMockBindHostChange,
    handleRestMockPortChange,
    handleWebSocketMockPortChange,
    restMockServer,
    restMockStatus,
    selectWebSocketMockScenario,
    sendWebSocketMockOnce,
    serviceProtocol,
    setRestMockScenarioId,
    startRestMockServer,
    startWebSocketMockServer,
    stopRestMockServer,
    stopWebSocketMockServer,
    updateActiveRestMockResponse,
    updateActiveRestMockScenario,
    updateActiveWebSocketMockResponse,
    updateActiveWebSocketMockScenario,
    updateRestMockScenarioPair,
    removeRestMockScenarioPair,
    wsMockIntervalMs,
    wsMockLoop,
    wsMockMaxLoops,
    wsMockPath,
    wsMockPort,
    wsMockStatus,
    wsMockStreamOnConnect,
  } = ctx;
  useMockCatalogSourceSync({ mockServer, mockServerStatus, protoRuntimeRegistry });
  const [protocolTab, setProtocolTab] = useState<"scenarios" | "activity">("scenarios");
  const [grpcSettingsOpen, setGrpcSettingsOpen] = useState(false);
  const [grpcSettingsPage, setGrpcSettingsPage] = useState<GrpcMockSettingsPage>("server");
  type RuntimeKind = "grpc" | "web" | "rest" | "websocket";
  type RuntimeAction = "start" | "stop";
  const [runtimeActions, setRuntimeActions] = useState<Partial<Record<RuntimeKind, RuntimeAction>>>({});
  const pendingRuntimeKindsRef = useRef(new Set<RuntimeKind>());

  const isGrpc = serviceProtocol === "grpc-mock" || serviceProtocol === "web-access";
  const isRest = serviceProtocol === "rest";
  const protocolStatus = isRest ? restMockStatus : wsMockStatus;

  const grpcOverviewSelected = ctx.mockSelectedMethodKey === grpcMockOverviewMethodKey;
  const workspaceContent = isGrpc ? (
    grpcOverviewSelected ? <GrpcMockWorkspace ctx={ctx} initialTab="scenarios" /> : <GrpcFocusedMockWorkspace ctx={ctx} />
  ) : (
    <WorkspaceFrame
      title={isRest ? "REST Mock" : "WebSocket Mock"}
      description={
        isRest ? "Serve HTTP responses from local scenarios." : "Serve WebSocket messages from local scenarios."
      }
    >
      <WorkbenchTabs
        value={protocolTab}
        ariaLabel={`${isRest ? "REST" : "WebSocket"} Mock sections`}
        idPrefix={isRest ? "rest-mock" : "websocket-mock"}
        variant="underline"
        bordered={false}
        className="mb-2"
        items={[
          { value: "scenarios", label: "Scenarios" },
          { value: "activity", label: "Activity" },
        ]}
        onValueChange={(value) => setProtocolTab(value as "scenarios" | "activity")}
      />
      {protocolTab === "activity" ? (
        <Box
          role="tabpanel"
          id={`${isRest ? "rest-mock" : "websocket-mock"}-panel-activity`}
          aria-labelledby={`${isRest ? "rest-mock" : "websocket-mock"}-tab-activity`}
          tabIndex={0}
          sx={{ minHeight: 0, flex: 1, overflow: "auto" }}
        >
          <RuntimeLogs status={protocolStatus} />
        </Box>
      ) : isRest ? (
        <Box
          role="tabpanel"
          id="rest-mock-panel-scenarios"
          aria-labelledby="rest-mock-tab-scenarios"
          tabIndex={0}
          sx={{ minHeight: 0, flex: 1, overflow: "auto" }}
        >
          <RestMockPanel
            request={activeCollectionRequest?.kind === "rest" ? activeCollectionRequest : null}
            scenarios={activeRestMockScenarios}
            activeScenario={activeRestMockScenario}
            mockResponseText={activeRestMockResponseText}
            status={restMockStatus}
            project={restMockServer}
            onMockResponseTextChange={updateActiveRestMockResponse}
            onPortChange={handleRestMockPortChange}
            onBindHostChange={handleRestMockBindHostChange}
            onScenarioSelect={setRestMockScenarioId}
            onScenarioChange={updateActiveRestMockScenario}
            onScenarioPairAdd={addRestMockScenarioPair}
            onScenarioPairUpdate={updateRestMockScenarioPair}
            onScenarioPairRemove={removeRestMockScenarioPair}
            onAddScenario={addRestMockScenario}
            onStart={() => void startRestMockServer()}
            onStop={() => void stopRestMockServer()}
          />
        </Box>
      ) : (
        <Box
          role="tabpanel"
          id="websocket-mock-panel-scenarios"
          aria-labelledby="websocket-mock-tab-scenarios"
          tabIndex={0}
          sx={{ minHeight: 0, flex: 1, overflow: "auto" }}
        >
          <WebSocketMockPanel
            request={activeCollectionRequest}
            mockResponseText={activeWebSocketMockResponseText}
            onMockResponseTextChange={updateActiveWebSocketMockResponse}
            status={wsMockStatus}
            port={wsMockPort}
            pathValue={wsMockPath}
            intervalMs={wsMockIntervalMs}
            loop={wsMockLoop}
            maxLoops={wsMockMaxLoops}
            streamOnConnect={wsMockStreamOnConnect}
            scenarios={activeWebSocketMockScenarios}
            activeScenario={activeWebSocketMockScenario}
            requestPaths={wsMockStatus.requestPaths}
            onPortChange={handleWebSocketMockPortChange}
            onPathChange={(value: string) => updateActiveWebSocketMockScenario({ path: value })}
            onIntervalMsChange={(value: number) => updateActiveWebSocketMockScenario({ intervalMs: value })}
            onLoopChange={(value: boolean) => updateActiveWebSocketMockScenario({ loop: value })}
            onMaxLoopsChange={(value: number) => updateActiveWebSocketMockScenario({ maxLoops: value })}
            onStreamOnConnectChange={(value: boolean) => updateActiveWebSocketMockScenario({ streamOnConnect: value })}
            onScenarioSelect={selectWebSocketMockScenario}
            onScenarioChange={updateActiveWebSocketMockScenario}
            onAddScenario={addWebSocketMockScenario}
            onStart={() => void startWebSocketMockServer()}
            onStop={() => void stopWebSocketMockServer()}
            onSendOnce={() => void sendWebSocketMockOnce()}
            onCopy={copyActiveWebSocketMockResponse}
          />
        </Box>
      )}
    </WorkspaceFrame>
  );

  const toggleRuntime = async (kind: RuntimeKind, checked: boolean) => {
    if (pendingRuntimeKindsRef.current.has(kind)) return;
    pendingRuntimeKindsRef.current.add(kind);
    setRuntimeActions((current) => ({ ...current, [kind]: checked ? "start" : "stop" }));
    try {
      if (kind === "grpc") {
        if (checked) await startMockServer();
        else await stopMockServer();
        return;
      }
      if (kind === "web") {
        if (checked) await startWebAccess();
        else await stopWebAccess();
        return;
      }
      if (kind === "rest") {
        if (checked) await startRestMockServer();
        else await stopRestMockServer();
        return;
      }
      if (checked) await startWebSocketMockServer();
      else await stopWebSocketMockServer();
    } finally {
      pendingRuntimeKindsRef.current.delete(kind);
      setRuntimeActions((current) => {
        const next = { ...current };
        delete next[kind];
        return next;
      });
    }
  };

  return (
    <Box sx={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <MockRuntimeStrip
        grpcRunning={Boolean(mockServerStatus?.running)}
        runtimeActions={runtimeActions}
        webRunning={Boolean(webAccessStatus?.running)}
        restRunning={Boolean(restMockStatus?.running)}
        websocketRunning={Boolean(wsMockStatus?.running)}
        onToggle={(kind, checked) => void toggleRuntime(kind, checked)}
        onOpenSettings={() => setGrpcSettingsOpen(true)}
      />
      <Box sx={{ minHeight: 0, flex: 1, overflow: "hidden" }}>{workspaceContent}</Box>
      <GrpcMockSettingsDialog
        open={grpcSettingsOpen}
        page={grpcSettingsPage}
        onPageChange={setGrpcSettingsPage}
        mockServer={mockServer}
        running={Boolean(mockServerStatus?.running)}
        webRunning={Boolean(webAccessStatus?.running)}
        onClose={() => setGrpcSettingsOpen(false)}
        onSave={(next) => setMockServer({ ...next, updatedAt: new Date().toISOString() })}
        onSaveAndRestart={async (next) => {
          const grpcWasRunning = Boolean(mockServerStatus?.running);
          const webWasRunning = Boolean(webAccessStatus?.running);
          if (webWasRunning) await stopWebAccess();
          if (grpcWasRunning) await stopMockServer();
          const nextProject = { ...next, updatedAt: new Date().toISOString() };
          setMockServer(nextProject);
          if (grpcWasRunning) await startMockServer(nextProject);
          if (webWasRunning) {
            const profile =
              nextProject.gatewayProfiles.find((item) => item.id === nextProject.activeGatewayProfileId) ??
              nextProject.gatewayProfiles[0];
            await startWebAccess(profile, nextProject);
          }
        }}
      />
    </Box>
  );
}

function MockRuntimeStrip({
  grpcRunning,
  runtimeActions,
  webRunning,
  restRunning,
  websocketRunning,
  onToggle,
  onOpenSettings,
}: {
  grpcRunning: boolean;
  runtimeActions: Partial<Record<"grpc" | "web" | "rest" | "websocket", "start" | "stop">>;
  webRunning: boolean;
  restRunning: boolean;
  websocketRunning: boolean;
  onToggle: (kind: "grpc" | "web" | "rest" | "websocket", checked: boolean) => void;
  onOpenSettings: () => void;
}) {
  const items = [
    { kind: "grpc" as const, label: "gRPC Mock", checked: grpcRunning, pending: runtimeActions.grpc },
    { kind: "web" as const, label: "Web Access", checked: webRunning, pending: runtimeActions.web },
    { kind: "rest" as const, label: "REST Mock", checked: restRunning, pending: runtimeActions.rest },
    { kind: "websocket" as const, label: "WebSocket Mock", checked: websocketRunning, pending: runtimeActions.websocket },
  ];
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.9}
      sx={{
        minHeight: 38,
        px: 1.25,
        borderBottom: "1px solid var(--border-strong)",
        bgcolor: "background.default",
        flexShrink: 0,
        overflowX: "auto",
      }}
      aria-label="Mock runtimes"
    >
      <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: "0.04em", color: "text.secondary", mr: 0.3 }}>
        RUNTIMES
      </Typography>
      {items.map((item) => (
        <Stack
          key={item.kind}
          direction="row"
          alignItems="center"
          spacing={0.3}
          sx={{ flexShrink: 0 }}
          aria-busy={Boolean(item.pending)}
        >
          <Switch
            size="small"
            checked={item.checked}
            disabled={Boolean(item.pending)}
            loading={Boolean(item.pending)}
            sx={{ pointerEvents: item.pending ? "none" : "auto" }}
            inputProps={{
              "aria-label": `${item.label} ${item.pending ? "loading" : item.checked ? "active" : "inactive"}`,
            }}
            onChange={(event: any) => onToggle(item.kind, event.target.checked)}
          />
          <Typography variant="caption" color={item.checked ? "text.primary" : "text.secondary"}>
            {item.label}
          </Typography>
        </Stack>
      ))}
      <Box sx={{ flex: 1 }} />
      <Button size="small" variant="outlined" startIcon={<Settings sx={{ fontSize: 14 }} />} onClick={onOpenSettings} sx={{ flexShrink: 0 }}>
        Mock Settings
      </Button>
    </Stack>
  );
}

function GrpcFocusedMockWorkspace({ ctx }: { ctx: ViewContext }) {
  const {
    addMockScenarioForMethod,
    currentMockActiveScenario,
    currentMockEditorText,
    currentMockFile,
    currentMockScenarios,
    discardMockScenarioEditorDraft,
    handleMockFormatChange,
    handleMockMethodEnabledChange,
    handleMockScenarioSelectChange,
    handleMockScenarioTextChange,
    mockScenarioEditorDirty,
    mockScenarioEditorError,
    mockSelectedMethod,
    mockServer,
    openMockScenarioFolder,
    openMockScenarioManager,
    saveMockScenarioEditorDraft,
    setMockScenarioEditorDirty,
    setMockScenarioEditorError,
    setMockServer,
  } = ctx;
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const method = mockSelectedMethod as RpcMethodInfo | null;
  const key = method ? methodKey(method) : "";
  const enabled = method ? mockServer.enabledMethods?.[key] !== false : false;
  const focusedScenario = currentMockActiveScenario ?? currentMockScenarios?.[0] ?? null;
  const selectedScenarioId = focusedScenario?.id ?? "";
  const focusedIntervalMs = Math.max(
    0,
    Math.floor(Number(focusedScenario?.stream?.intervalMs ?? mockServer.streamDefaults.intervalMs) || 0),
  );
  const focusedLoop = Boolean(focusedScenario?.stream?.loop ?? mockServer.streamDefaults.loop);
  const focusedLoopCount = Math.max(
    0,
    Math.floor(Number(focusedScenario?.stream?.maxLoops ?? mockServer.streamDefaults.maxLoops) || 0),
  );
  const editorIdentity = `${key}:${selectedScenarioId}:${currentMockFile?.format ?? "yaml"}`;
  const [editorText, setEditorText] = useState(currentMockEditorText ?? "");
  const [editorBaseline, setEditorBaseline] = useState(currentMockEditorText ?? "");
  const [editorDirty, setEditorDirty] = useState(Boolean(mockScenarioEditorDirty));
  const [editorError, setEditorError] = useState(mockScenarioEditorError ?? "");
  const [editorRevision, setEditorRevision] = useState(0);
  const editorTextRef = useRef(currentMockEditorText ?? "");
  const editorDirtyRef = useRef(Boolean(mockScenarioEditorDirty));
  const editorValidationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (editorValidationTimerRef.current !== null) window.clearTimeout(editorValidationTimerRef.current);
    const nextText = currentMockEditorText ?? "";
    editorTextRef.current = nextText;
    editorDirtyRef.current = Boolean(mockScenarioEditorDirty);
    setEditorText(nextText);
    setEditorBaseline(nextText);
    setEditorDirty(Boolean(mockScenarioEditorDirty));
    setEditorError(mockScenarioEditorError ?? "");
  }, [editorIdentity]);

  useEffect(() => {
    return () => {
      if (editorValidationTimerRef.current !== null) window.clearTimeout(editorValidationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"]')) return;
      event.preventDefault();
      if (editorDirtyRef.current && !editorError) saveLocalEditor();
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [editorError, editorIdentity]);

  function queueEditorValidation(nextText: string) {
    if (!method) return;
    if (editorValidationTimerRef.current !== null) window.clearTimeout(editorValidationTimerRef.current);
    editorValidationTimerRef.current = window.setTimeout(() => {
      editorValidationTimerRef.current = null;
      const parsed = parseSingleMockScenarioText(nextText, currentMockFile.format, mockServer.port, method);
      const nextError = parsed.ok ? "" : parsed.error;
      setEditorError(nextError);
      setMockScenarioEditorError(nextError);
    }, 350);
  }

  function changeEditorText(nextText: string) {
    editorTextRef.current = nextText;
    if (!editorDirtyRef.current) {
      editorDirtyRef.current = true;
      setEditorDirty(true);
      setMockScenarioEditorDirty(true);
    }
    queueEditorValidation(nextText);
  }

  function parseLocalEditor() {
    if (!method) return null;
    const parsed = parseSingleMockScenarioText(editorTextRef.current, currentMockFile.format, mockServer.port, method);
    if (!parsed.ok) {
      setEditorError(parsed.error);
      setMockScenarioEditorError(parsed.error);
      return null;
    }
    const scenario = parsed.bundle.scenarios[0] ?? null;
    if (!scenario) {
      const nextError = "No scenario found in the editor.";
      setEditorError(nextError);
      setMockScenarioEditorError(nextError);
      return null;
    }
    setEditorError("");
    setMockScenarioEditorError("");
    return scenario;
  }

  function formatLocalEditor() {
    const scenario = parseLocalEditor();
    if (!scenario) return;
    const formatted = formatSingleMockScenarioForEditor(scenario, currentMockFile.format);
    editorTextRef.current = formatted;
    setEditorText(formatted);
    setEditorRevision((current) => current + 1);
  }

  function revertLocalEditor() {
    if (editorValidationTimerRef.current !== null) window.clearTimeout(editorValidationTimerRef.current);
    editorValidationTimerRef.current = null;
    editorTextRef.current = editorBaseline;
    editorDirtyRef.current = false;
    setEditorText(editorBaseline);
    setEditorRevision((current) => current + 1);
    setEditorDirty(false);
    setEditorError("");
    discardMockScenarioEditorDraft();
  }

  function saveLocalEditor() {
    const scenario = parseLocalEditor();
    if (!scenario) return;
    if (editorValidationTimerRef.current !== null) window.clearTimeout(editorValidationTimerRef.current);
    editorValidationTimerRef.current = null;
    const formatted = formatSingleMockScenarioForEditor(scenario, currentMockFile.format);
    editorTextRef.current = formatted;
    setEditorText(formatted);
    setEditorBaseline(formatted);
    setEditorRevision((current) => current + 1);
    setEditorDirty(false);
    editorDirtyRef.current = false;
    saveMockScenarioEditorDraft(formatted);
  }

  function patchFocusedStream(patch: { intervalMs?: number; loop?: boolean; maxLoops?: number }) {
    if (!method || !focusedScenario || editorDirtyRef.current) return;
    const nextScenario: MockScenario = {
      ...focusedScenario,
      stream: {
        ...(focusedScenario.stream ?? { responses: [] }),
        ...patch,
      },
    };
    const saved = saveMockScenarioForMethod(
      mockServer,
      method,
      focusedScenario.id,
      nextScenario,
      currentMockFile.format,
    );
    if (!saved) return;
    setMockServer(saved.project);
    const formatted = formatSingleMockScenarioForEditor(saved.scenario, currentMockFile.format);
    editorTextRef.current = formatted;
    editorDirtyRef.current = false;
    setEditorText(formatted);
    setEditorBaseline(formatted);
    setEditorRevision((current) => current + 1);
    setEditorDirty(false);
    setEditorError("");
    setMockScenarioEditorDirty(false);
    setMockScenarioEditorError("");
  }
  if (!method) {
    return (
      <WorkspaceFrame title="Mocking" description="Select a gRPC method from the Mocking sidebar.">
        <Box sx={{ flex: 1, display: "grid", placeItems: "center", color: "text.secondary" }}>
          <Typography variant="body2">Select a method to edit its mock scenario.</Typography>
        </Box>
      </WorkspaceFrame>
    );
  }

  return (
    <Paper elevation={0} sx={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 0 }}>
      <Stack direction="row" alignItems="center" spacing={0.8} sx={{ minHeight: 54, px: 1.5, borderBottom: "1px solid var(--border-strong)", flexShrink: 0 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap title={method.methodName}>{method.methodName}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{method.serviceName} · {rpcMethodKindLabel(method)}</Typography>
        </Box>
      </Stack>

      <Stack direction="row" alignItems="center" spacing={0.65} sx={{ minHeight: 42, px: 1.5, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <Typography variant="caption" color="text.secondary">Scenario</Typography>
        <FormControl size="small" sx={{ minWidth: 220, maxWidth: 360 }}>
          <Select
            value={selectedScenarioId}
            displayEmpty
            inputProps={{ "aria-label": `Scenario for ${method.methodName}` }}
            onChange={(event: any) => handleMockScenarioSelectChange(method, String(event.target.value))}
          >
            {currentMockScenarios?.length ? currentMockScenarios.map((scenario: MockScenario) => (
              <MenuItem key={scenario.id} value={scenario.id}>{mockScenarioDisplayName(scenario, method)}</MenuItem>
            )) : <MenuItem value="" disabled>No scenarios</MenuItem>}
          </Select>
        </FormControl>
        <Button size="small" variant="outlined" startIcon={<Settings sx={{ fontSize: 14 }} />} onClick={(event: any) => setSettingsAnchor(event.currentTarget)}>
          Scenario Settings
        </Button>
        <Stack direction="row" alignItems="center" spacing={0.4} sx={{ ml: "auto" }}>
          <Typography variant="caption" color="text.secondary">Active</Typography>
          <Switch size="small" checked={enabled} disabled={!currentMockScenarios?.length} onChange={(event: any) => handleMockMethodEnabledChange(method, event.target.checked)} />
        </Stack>
      </Stack>

      {method.responseStream && focusedScenario ? (
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.8}
          sx={{ minHeight: 44, px: 1.5, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 52 }}>
            Periodic
          </Typography>
          <Stack direction="row" alignItems="center" spacing={0.45} sx={{ flexShrink: 0 }}>
            <Typography variant="caption">Interval (ms)</Typography>
            <TextField
              key={`interval:${editorIdentity}:${focusedIntervalMs}`}
              size="small"
              type="number"
              defaultValue={String(focusedIntervalMs)}
              disabled={editorDirty}
              inputProps={{ min: 0, step: 10, "aria-label": `Interval for ${method.methodName}` }}
              onBlur={(event: any) =>
                patchFocusedStream({ intervalMs: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
              }
              sx={{ width: 112, "& .MuiInputBase-root": { minHeight: 32, height: 32 } }}
            />
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.3}>
            <Typography variant="caption">Loop</Typography>
            <Switch
              size="small"
              checked={focusedLoop}
              disabled={editorDirty}
              inputProps={{ "aria-label": `Loop ${method.methodName}` }}
              onChange={(_event: any, checked: boolean) => patchFocusedStream({ loop: checked })}
            />
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.45} sx={{ flexShrink: 0 }}>
            <Typography variant="caption">Count</Typography>
            <TextField
              key={`count:${editorIdentity}:${focusedLoopCount}`}
              size="small"
              type="number"
              defaultValue={String(focusedLoopCount)}
              disabled={editorDirty || !focusedLoop}
              inputProps={{ min: 0, step: 1, "aria-label": `Loop count for ${method.methodName}` }}
              onBlur={(event: any) =>
                patchFocusedStream({ maxLoops: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
              }
              sx={{ width: 96, "& .MuiInputBase-root": { minHeight: 32, height: 32 } }}
            />
          </Stack>
          {focusedLoop ? (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
              0 = unlimited
            </Typography>
          ) : null}
        </Stack>
      ) : null}

      <Menu anchorEl={settingsAnchor} open={Boolean(settingsAnchor)} onClose={() => setSettingsAnchor(null)}>
        <MenuItem onClick={() => { setSettingsAnchor(null); addMockScenarioForMethod(method); }}>Add scenario</MenuItem>
        <MenuItem disabled={!selectedScenarioId} onClick={() => { setSettingsAnchor(null); openMockScenarioManager(method, selectedScenarioId); }}>Manage scenario</MenuItem>
        <MenuItem onClick={() => { setSettingsAnchor(null); void openMockScenarioFolder(); }}>Open scenario folder</MenuItem>
        <MenuItem onClick={() => { setSettingsAnchor(null); handleMockMethodEnabledChange(method, !enabled); }}>{enabled ? "Disable mock" : "Enable mock"}</MenuItem>
      </Menu>

      <Box sx={{ minHeight: 0, flex: 1, display: "flex", flexDirection: "column", p: 1.25, gap: 0.65 }}>
        <Stack direction="row" alignItems="center" spacing={0.45} sx={{ minHeight: 28 }}>
          <Button size="small" variant={currentMockFile?.format === "yaml" ? "contained" : "text"} disabled={editorDirty} onClick={() => handleMockFormatChange("yaml")}>YAML</Button>
          <Button size="small" variant={currentMockFile?.format === "json" ? "contained" : "text"} disabled={editorDirty} onClick={() => handleMockFormatChange("json")}>JSON</Button>
          <Box sx={{ flex: 1 }} />
          {editorError ? <Typography variant="caption" color="error.main" noWrap title={editorError}>{editorError}</Typography> : null}
          <Button size="small" variant="text" onClick={formatLocalEditor} disabled={!currentMockScenarios?.length}>Format</Button>
          <Button size="small" variant="text" onClick={revertLocalEditor} disabled={!editorDirty}>Revert</Button>
          <Button
            size="small"
            variant="contained"
            onClick={saveLocalEditor}
            disabled={!editorDirty || Boolean(editorError)}
            aria-keyshortcuts="Control+S Meta+S"
          >
            Save
          </Button>
        </Stack>
        <Box sx={{ minHeight: 0, flex: 1 }}>
          <FeatureCodeTextField
            value={editorText}
            onChange={changeEditorText}
            buffered
            onBlur={(text) => {
              if (editorDirtyRef.current) handleMockScenarioTextChange(text);
            }}
            minRows={18}
            fullHeight
            language={currentMockFile?.format ?? "yaml"}
            showFormatAction={false}
            fullscreenTitle={`${method.methodName} scenario`}
            resetKey={`${editorIdentity}:${editorRevision}`}
          />
        </Box>
      </Box>
    </Paper>
  );
}

export function GrpcMockWorkspace({ ctx, initialTab = "scenarios" }: { ctx: ViewContext; initialTab?: GrpcMockTab }) {
  const {
    addMockScenarioForMethod,
    handleMockMethodEnabledChange,
    handleMockScenarioSelectChange,
    mockSelectedMethodKey,
    mockServer,
    mockServerStatus,
    openMockScenarioManager,
    protoLibraries,
    protoRuntimeRegistry,
    selectProtoLibraryVersion,
    setMockSelectedMethodKey,
    setMockServer,
    startMockServer,
    stopMockServer,
    startWebAccess,
    stopWebAccess,
    webAccessStatus,
  } = ctx;
  const catalog = useMockCatalog();
  const [tab, setTab] = useState<GrpcMockTab>(initialTab);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachLibraryId, setAttachLibraryId] = useState("");
  const [attachVersionId, setAttachVersionId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<GrpcMockSettingsPage>("server");
  const [runtimeAction, setRuntimeAction] = useState<"start" | "stop" | null>(null);
  const [webAccessSectionRequest, setWebAccessSectionRequest] = useState<{
    id: number;
    tab: "overview" | "logs" | "settings";
  }>({ id: 0, tab: "overview" });

  const sourceRefs = useMemo(
    () => [...(mockServer.protoSources ?? [])] as MockProtoSource[],
    [mockServer.protoSources],
  );
  const attachedMethods = useMemo<AttachedMethod[]>(() => {
    const rows: AttachedMethod[] = [];
    for (const source of sourceRefs) {
      const compiled = protoRuntimeRegistry.resolveVersion(source.libraryId, source.versionId);
      if (!compiled) continue;
      for (const method of compiled.loaded.methods) {
        rows.push({ source, library: compiled.library, version: compiled.version, root: compiled.loaded.root, method });
      }
    }
    return rows;
  }, [sourceRefs, protoRuntimeRegistry]);

  const nativeRunning = Boolean(mockServerStatus.running);
  const webRunning = Boolean(webAccessStatus?.running);
  const runMode = mockServer.runMode === "web-access" ? "web-access" : "native";
  const runModeRunning = runMode === "web-access" ? webRunning : nativeRunning;
  const configuredMethods = catalog.summary.ready + catalog.summary.live;
  const nativeIssues = [
    sourceRefs.length === 0 ? "Attach a Proto" : "",
    catalog.syncing ? "Indexing Mocking catalog" : "",
    catalog.summary.totalScenarios === 0 ? "Create a scenario" : "",
    configuredMethods === 0 ? "Enable a configured scenario" : "",
  ].filter(Boolean);
  const canStartRuntime = runMode === "web-access" ? sourceRefs.length > 0 : nativeIssues.length === 0;
  const nativeEndpoint = `${mockServer.bindHost}:${mockServerStatus.port ?? mockServer.port}`;
  const activeWebProfile =
    mockServer.gatewayProfiles?.find((item: GrpcGatewayProfile) => item.id === mockServer.activeGatewayProfileId) ??
    mockServer.gatewayProfiles?.[0];
  const webConfig = activeWebProfile?.web;
  const browserHost = ["0.0.0.0", "::", "[::]"].includes(webConfig?.host ?? "")
    ? "localhost"
    : (webConfig?.host ?? "127.0.0.1");
  const browserUrl =
    webAccessStatus?.url ??
    `${webConfig?.security?.type === "tls" ? "https" : "http"}://${browserHost}:${webConfig?.port ?? 8080}`;
  const endpoint = runMode === "web-access" ? browserUrl : nativeEndpoint;

  const selectCatalogMethod = useCallback(
    (row: MockCatalogMethodRow) => {
      selectProtoLibraryVersion(row.libraryId, row.versionId, { persistDefault: false });
      setMockSelectedMethodKey(row.methodKey);
    },
    [selectProtoLibraryVersion, setMockSelectedMethodKey],
  );

  function attachSource(): void {
    const library = protoLibraries.find((item: { id: string }) => item.id === attachLibraryId);
    const version = library?.versions?.find((item: { id: string }) => item.id === attachVersionId);
    if (!library || !version) return;
    setMockServer((current: MockServerProject) => ({
      ...current,
      protoSources: [
        ...(current.protoSources ?? []).filter((item) => item.libraryId !== library.id),
        { libraryId: library.id, versionId: version.id },
      ],
      methodBindings: Object.fromEntries(
        Object.entries(current.methodBindings ?? {}).map(([key, binding]) => {
          const currentBinding = binding as { libraryId: string; versionId: string };
          return [
            key,
            currentBinding.libraryId === library.id ? { ...currentBinding, versionId: version.id } : currentBinding,
          ];
        }),
      ),
      updatedAt: new Date().toISOString(),
    }));
    selectProtoLibraryVersion(library.id, version.id, { persistDefault: false });
    setAttachOpen(false);
  }

  function detachSource(source: MockProtoSource): void {
    if (
      catalog.summary.totalScenarios > 0 &&
      !window.confirm("Detach this Proto? Scenario data remains in the workspace and can be reattached later.")
    ) {
      return;
    }
    setMockServer((current: MockServerProject) => ({
      ...current,
      protoSources: (current.protoSources ?? []).filter(
        (item) => !(item.libraryId === source.libraryId && item.versionId === source.versionId),
      ),
      methodBindings: Object.fromEntries(
        Object.entries(current.methodBindings ?? {}).filter(([, binding]) => {
          const currentBinding = binding as { libraryId: string; versionId: string };
          return !(currentBinding.libraryId === source.libraryId && currentBinding.versionId === source.versionId);
        }),
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  async function toggleRuntime(): Promise<void> {
    if (runtimeAction) return;
    if (!runModeRunning && !canStartRuntime) return;
    setRuntimeAction(runModeRunning ? "stop" : "start");
    try {
      if (runMode === "web-access") {
        if (runModeRunning) await stopWebAccess();
        else await startWebAccess();
      } else if (runModeRunning) {
        await stopMockServer();
      } else {
        await startMockServer();
      }
    } finally {
      setRuntimeAction(null);
    }
  }

  function changeRunMode(nextMode: "native" | "web-access"): void {
    if (runtimeAction || runModeRunning || nextMode === runMode) return;
    setMockServer((current: MockServerProject) => ({
      ...current,
      runMode: nextMode,
      updatedAt: new Date().toISOString(),
    }));
  }

  return (
    <WorkspaceFrame title="gRPC" description="Worker-indexed gRPC mock catalog and runtime controls.">
      <Stack spacing={1} sx={{ minHeight: 0, flex: 1 }}>
        <Paper variant="outlined" sx={{ px: 1, py: 0.65 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={0.8} alignItems={{ md: "center" }}>
            <FormControl size="small" sx={{ width: { xs: "100%", md: 180 }, flexShrink: 0 }}>
              <Select
                value={runMode}
                disabled={runModeRunning || runtimeAction !== null}
                inputProps={{ "aria-label": "gRPC run mode" }}
                onChange={(event: { target: { value: unknown } }) =>
                  changeRunMode(String(event.target.value) === "web-access" ? "web-access" : "native")
                }
              >
                <MenuItem value="native">Native gRPC</MenuItem>
                <MenuItem value="web-access">Web access</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" spacing={0.65} alignItems="center" sx={{ minWidth: 0 }}>
                <Chip
                  size="small"
                  color={runModeRunning ? "success" : "default"}
                  label={
                    runModeRunning && runMode === "native" && mockServerStatus.runtimeSource === "cli"
                      ? "Running · CLI"
                      : runModeRunning
                        ? "Running"
                        : "Stopped"
                  }
                />
                <Typography variant="body2" fontFamily="monospace" noWrap title={endpoint}>
                  {endpoint}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" noWrap>
                {catalog.summary.totalMethods} methods · {catalog.summary.totalScenarios} scenarios · {sourceRefs.length} Proto
              </Typography>
            </Box>
            <Tooltip title={runMode === "web-access" ? "Web access settings" : "gRPC Mock settings"}>
              <IconButton
                aria-label={runMode === "web-access" ? "Open Web access settings" : "Open gRPC Mock settings"}
                onClick={() => {
                  if (runMode === "web-access") {
                    setWebAccessSectionRequest((current) => ({ id: current.id + 1, tab: "settings" }));
                    setTab("web-access");
                  } else {
                    setSettingsOpen(true);
                  }
                }}
              >
                <Settings />
              </IconButton>
            </Tooltip>
            <Button
              size="small"
              color={runModeRunning ? "error" : "primary"}
              variant="contained"
              disabled={runtimeAction !== null || (!runModeRunning && !canStartRuntime)}
              startIcon={runModeRunning ? <StopCircle /> : <PlayArrow />}
              onClick={() => void toggleRuntime()}
            >
              {runtimeAction ? (runtimeAction === "start" ? "Starting…" : "Stopping…") : runModeRunning ? "Stop" : "Start"}
            </Button>
          </Stack>
          {!runModeRunning && runMode === "native" && nativeIssues.length > 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.45 }}>
              {nativeIssues.join(" · ")}
            </Typography>
          ) : null}
        </Paper>

        <WorkbenchTabs
          value={tab}
          ariaLabel="gRPC Mock sections"
          idPrefix="grpc-mock"
          variant="underline"
          bordered={false}
          items={[
            { value: "scenarios", label: "Scenarios" },
            { value: "proto", label: "Proto" },
            { value: "web-access", label: "Web Access" },
            { value: "activity", label: "Activity" },
          ]}
          onValueChange={(value) => setTab(value as GrpcMockTab)}
        />

        <Box sx={{ minHeight: 0, flex: 1 }}>
          {tab === "scenarios" ? (
            <MockCatalogPanel
              running={nativeRunning}
              port={mockServerStatus.port ?? mockServer.port}
              selectedMethodKey={mockSelectedMethodKey}
              onSelectMethod={(row) => selectCatalogMethod(row)}
              onScenarioChange={handleMockScenarioSelectChange}
              onEnabledChange={handleMockMethodEnabledChange}
              onAddScenario={addMockScenarioForMethod}
              onManageScenario={openMockScenarioManager}
            />
          ) : tab === "proto" ? (
            <ProtoSourcesPanel
              ctx={ctx}
              sources={sourceRefs}
              attachedMethods={attachedMethods}
              onAttach={() => {
                const first = protoLibraries[0];
                setAttachLibraryId(first?.id ?? "");
                setAttachVersionId(first?.defaultVersionId ?? first?.versions?.[0]?.id ?? "");
                setAttachOpen(true);
              }}
              onDetach={detachSource}
              onCreateScenario={(item) => {
                selectProtoLibraryVersion(item.source.libraryId, item.source.versionId, { persistDefault: false });
                setMockSelectedMethodKey(methodKey(item.method));
                addMockScenarioForMethod(item.method);
                setTab("scenarios");
              }}
            />
          ) : tab === "web-access" ? (
            <WebAccessPanel ctx={ctx} requestedSection={webAccessSectionRequest} />
          ) : (
            <Box sx={{ minHeight: 0, height: "100%", overflow: "auto" }}>
              <RuntimeLogs status={mockServerStatus} />
            </Box>
          )}
        </Box>
      </Stack>

      <Dialog open={attachOpen} onClose={() => setAttachOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Attach Proto</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 0.5 }}>
            <FormControl size="small" fullWidth>
              <Select
                value={attachLibraryId}
                inputProps={{ "aria-label": "Schema" }}
                onChange={(event: { target: { value: unknown } }) => {
                  const id = String(event.target.value);
                  const library = protoLibraries.find((item: { id: string }) => item.id === id);
                  setAttachLibraryId(id);
                  setAttachVersionId(library?.defaultVersionId ?? library?.versions?.[0]?.id ?? "");
                }}
              >
                {protoLibraries.map((library: { id: string; name: string }) => (
                  <MenuItem key={library.id} value={library.id}>{library.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <Select
                value={attachVersionId}
                inputProps={{ "aria-label": "Revision" }}
                onChange={(event: { target: { value: unknown } }) => setAttachVersionId(String(event.target.value))}
              >
                {(protoLibraries.find((item: { id: string }) => item.id === attachLibraryId)?.versions ?? [])
                  .filter((version: { lifecycle?: string }) => version.lifecycle !== "archived")
                  .map((version: { id: string; version: string }) => (
                    <MenuItem key={version.id} value={version.id}>{version.version}</MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttachOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!attachLibraryId || !attachVersionId} onClick={attachSource}>Attach</Button>
        </DialogActions>
      </Dialog>

      <GrpcMockSettingsDialog
        open={settingsOpen}
        page={settingsPage}
        onPageChange={setSettingsPage}
        mockServer={mockServer}
        running={nativeRunning}
        webRunning={webRunning}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => setMockServer({ ...next, updatedAt: new Date().toISOString() })}
        onSaveAndRestart={async (next) => {
          const grpcWasRunning = nativeRunning;
          const webWasRunning = webRunning;
          if (webWasRunning) await stopWebAccess();
          if (grpcWasRunning) await stopMockServer();
          const nextProject = { ...next, updatedAt: new Date().toISOString() };
          setMockServer(nextProject);
          if (grpcWasRunning) await startMockServer(nextProject);
          if (webWasRunning) {
            const profile =
              nextProject.gatewayProfiles.find((item: GrpcGatewayProfile) => item.id === nextProject.activeGatewayProfileId) ??
              nextProject.gatewayProfiles[0];
            if (profile) await startWebAccess(profile, nextProject);
          }
        }}
      />
    </WorkspaceFrame>
  );
}

export function GrpcScenarioSourceDialog({
  open,
  row,
  mockServer,
  onClose,
  onSaveScenario,
  onDirtyChange,
  onFetchFile,
  onOpenFolder,
}: {
  open: boolean;
  row: GrpcMockScenarioRow | null;
  mockServer: MockServerProject;
  onClose: () => void;
  onSaveScenario: (scenario: MockScenario, format: MockFormat) => void;
  onDirtyChange: (dirty: boolean) => void;
  onFetchFile: () => Promise<MockServerProject | null>;
  onOpenFolder: (relativePath?: string) => void | Promise<void>;
}) {
  return (
    <Dialog open={open && Boolean(row)} onClose={onClose} fullWidth maxWidth="md">
      {row ? (
        <ScenarioSourceEditor
          key={`${methodKey(row.method)}:${row.scenario.id}`}
          row={row}
          mockServer={mockServer}
          onClose={onClose}
          onSaveScenario={onSaveScenario}
          onDirtyChange={onDirtyChange}
          onFetchFile={onFetchFile}
          onOpenFolder={onOpenFolder}
        />
      ) : null}
    </Dialog>
  );
}

function compactScenarioEditorError(error: string, format: MockFormat) {
  const firstLine =
    error
      .split(/\r?\n/u)
      .find((line) => line.trim())
      ?.trim() ?? "Invalid source.";
  const detail = firstLine.replace(/^invalid\s+(?:yaml|json)\s*:?\s*/iu, "");
  return `${format.toUpperCase()} error · ${detail}`;
}

function ScenarioSourceEditor({
  row,
  mockServer,
  onClose,
  onSaveScenario,
  onDirtyChange,
  onFetchFile,
  onOpenFolder,
}: {
  row: ScenarioRow;
  mockServer: MockServerProject;
  onClose: () => void;
  onSaveScenario: (scenario: MockScenario, format: MockFormat) => void;
  onDirtyChange: (dirty: boolean) => void;
  onFetchFile: () => Promise<MockServerProject | null>;
  onOpenFolder: (relativePath?: string) => void | Promise<void>;
}) {
  const file = getMockMethodScenarioFile(mockServer, row.method);
  const canonicalFormat = file.format;
  const canonicalSource = formatSingleMockScenarioForEditor(row.scenario, canonicalFormat);
  const [baselineSource, setBaselineSource] = useState(canonicalSource);
  const [baselineFormat, setBaselineFormat] = useState<MockFormat>(canonicalFormat);
  const [source, setSource] = useState(canonicalSource);
  const [editorFormat, setEditorFormat] = useState<MockFormat>(canonicalFormat);
  const [error, setError] = useState("");
  const [syncingFile, setSyncingFile] = useState(false);
  const dirty = source !== baselineSource || editorFormat !== baselineFormat;
  const [parsedScenario, setParsedScenario] = useState<MockScenario | null>(row.scenario);
  const [lastValidScenario, setLastValidScenario] = useState<MockScenario | null>(row.scenario);

  useEffect(() => {
    setBaselineSource(canonicalSource);
    setBaselineFormat(canonicalFormat);
    setSource(canonicalSource);
    setEditorFormat(canonicalFormat);
    setParsedScenario(row.scenario);
    setLastValidScenario(row.scenario);
    setError("");
  }, [canonicalFormat, canonicalSource, row.scenario.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parsed = parseSingleMockScenarioText(source, editorFormat, mockServer.port, row.method);
      if (!parsed.ok) {
        setParsedScenario(null);
        setError(parsed.error);
        return;
      }
      const scenario = parsed.bundle.scenarios[0] ?? null;
      setParsedScenario(scenario);
      if (scenario) setLastValidScenario(scenario);
      setError(scenario ? "" : "No scenario found in the editor.");
    }, 180);
    return () => window.clearTimeout(timer);
  }, [editorFormat, mockServer.port, row.method, source]);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function parseEditorSource() {
    const parsed = parseSingleMockScenarioText(source, editorFormat, mockServer.port, row.method);
    if (!parsed.ok) {
      setError(parsed.error);
      return null;
    }
    const scenario = parsed.bundle.scenarios[0];
    if (!scenario) {
      setError("No scenario found in the editor.");
      return null;
    }
    setError("");
    return {
      scenario,
      text: formatSingleMockScenarioForEditor(scenario, editorFormat),
    };
  }

  function format() {
    const parsed = parseEditorSource();
    if (parsed) setSource(parsed.text);
  }

  function changeEditorFormat(nextFormat: MockFormat) {
    if (nextFormat === editorFormat) return;
    const parsed = parseSingleMockScenarioText(source, editorFormat, mockServer.port, row.method);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const scenario = parsed.bundle.scenarios[0];
    if (!scenario) return;
    setEditorFormat(nextFormat);
    setSource(formatSingleMockScenarioForEditor(scenario, nextFormat));
    setError("");
  }

  function discard() {
    setSource(baselineSource);
    setEditorFormat(baselineFormat);
    const parsed = parseSingleMockScenarioText(baselineSource, baselineFormat, mockServer.port, row.method);
    setError(parsed.ok ? "" : parsed.error);
  }

  function save() {
    const parsed = parseEditorSource();
    if (!parsed) return;
    setSource(parsed.text);
    setBaselineSource(parsed.text);
    setBaselineFormat(editorFormat);
    onSaveScenario(parsed.scenario, editorFormat);
  }

  async function syncFile() {
    if (dirty && !window.confirm("Replace unsaved editor changes with the latest scenario file from disk?")) return;
    setSyncingFile(true);
    try {
      const refreshed = await onFetchFile();
      if (!refreshed) return;
      const latestFile = getMockMethodScenarioFile(refreshed, row.method);
      const parsed = parseMockScenarioText(latestFile.scenarioText, latestFile.format, refreshed.port);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      const latestScenario = parsed.bundle.scenarios.find(
        (scenario) =>
          scenario.service === row.method.serviceName &&
          scenario.method === row.method.methodName &&
          scenario.id === row.scenario.id,
      );
      if (!latestScenario) {
        setError(`Scenario "${row.scenario.id}" no longer exists in the workspace file.`);
        return;
      }
      const latestSource = formatSingleMockScenarioForEditor(latestScenario, latestFile.format);
      setSource(latestSource);
      setEditorFormat(latestFile.format);
      setLastValidScenario(latestScenario);
      setError("");
    } finally {
      setSyncingFile(false);
    }
  }

  const selectedDraftScenario = parsedScenario ?? lastValidScenario;
  const intervalMs = Math.max(
    0,
    Number(selectedDraftScenario?.stream?.intervalMs ?? mockServer.streamDefaults.intervalMs) || 0,
  );
  const loopEnabled = Boolean(selectedDraftScenario?.stream?.loop ?? mockServer.streamDefaults.loop);
  const loopCount = Math.max(
    0,
    Number(selectedDraftScenario?.stream?.maxLoops ?? mockServer.streamDefaults.maxLoops) || 0,
  );

  function changeSource(nextSource: string) {
    setSource(nextSource);
  }

  function patchSelectedStream(patch: { intervalMs?: number; loop?: boolean; maxLoops?: number }) {
    const parsed = parseSingleMockScenarioText(source, editorFormat, mockServer.port, row.method);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const scenario = parsed.bundle.scenarios[0];
    if (!scenario) return;
    const nextScenario: MockScenario = {
      ...scenario,
      stream: {
        ...(scenario.stream ?? { responses: [] }),
        ...patch,
      },
    };
    setLastValidScenario(nextScenario);
    setError("");
    setSource(formatSingleMockScenarioForEditor(nextScenario, editorFormat));
  }

  function handleEditorShortcut(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    if (dirty) save();
  }

  const methodKind = rpcMethodKindLabel(row.method);
  const scenarioId = selectedDraftScenario?.id ?? row.scenario.id;
  const validationMessage = error ? compactScenarioEditorError(error, editorFormat) : "";

  return (
    <>
      <DialogTitle sx={{ py: 1.1, px: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" noWrap title={scenarioId}>
              {scenarioId}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              title={`${row.library.name} · ${row.version.version} · ${methodKind}`}
            >
              {row.method.serviceName} / {row.method.methodName} · {editorFormat.toUpperCase()}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.4} alignItems="center">
            <Chip
              size="small"
              color={row.selected && row.enabled ? "primary" : "default"}
              label={row.selected && row.enabled ? uiCopy.status.active : uiCopy.status.inactive}
            />
            {dirty ? <Chip size="small" color="warning" label={uiCopy.status.unsaved} /> : null}
            <Tooltip title="Close editor">
              <IconButton aria-label="Close scenario editor" onClick={onClose}>
                <Close />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </DialogTitle>

      <DialogContent
        onKeyDown={handleEditorShortcut}
        sx={{
          height: "min(62vh, 520px)",
          minHeight: 360,
          minWidth: 0,
          overflow: "hidden",
          p: 1.2,
          display: "flex",
          flexDirection: "column",
          gap: 0.8,
        }}
      >
        <WorkbenchTabs
          value={editorFormat}
          items={[
            { value: "yaml", label: "YAML" },
            { value: "json", label: "JSON" },
          ]}
          onValueChange={(value) => changeEditorFormat(value as MockFormat)}
          ariaLabel="Mock scenario source format"
          idPrefix={`mock-source-format-${row.scenario.id}`}
          variant="pill"
          bordered={false}
          className="min-h-0 p-0"
        />

        {row.method.responseStream ? (
          <Paper variant="outlined" sx={{ px: 1, py: 0.6 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, flexWrap: "nowrap" }}>
              <Stack direction="row" spacing={0.45} alignItems="center" sx={{ flexShrink: 0 }}>
                <Typography variant="caption">Interval (ms)</Typography>
                <TextField
                  size="small"
                  type="number"
                  value={String(intervalMs)}
                  inputProps={{ min: 0, step: 1, "aria-label": `Interval (ms) ${row.scenario.id}` }}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    patchSelectedStream({ intervalMs: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
                  }
                  sx={{ width: 112, "& .MuiInputBase-root": { minHeight: 32, height: 32 } }}
                />
              </Stack>
              <Stack direction="row" spacing={0.45} alignItems="center" sx={{ minHeight: 36 }}>
                <Typography variant="body2">Loop</Typography>
                <Switch
                  size="small"
                  checked={loopEnabled}
                  inputProps={{ "aria-label": `Loop ${row.scenario.id}` }}
                  onChange={(_event: ChangeEvent<HTMLInputElement>, checked: boolean) => patchSelectedStream({ loop: checked })}
                />
              </Stack>
              <Stack direction="row" spacing={0.45} alignItems="center" sx={{ flexShrink: 0 }}>
                <Typography variant="caption">Count</Typography>
                <TextField
                  size="small"
                  type="number"
                  value={String(loopCount)}
                  disabled={!loopEnabled}
                  inputProps={{ min: 0, step: 1, "aria-label": uiCopy.fields.loopCount }}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    patchSelectedStream({ maxLoops: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
                  }
                  sx={{ width: 96, "& .MuiInputBase-root": { minHeight: 32, height: 32 } }}
                />
              </Stack>
              {loopEnabled ? (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
                  0 = unlimited
                </Typography>
              ) : null}
            </Stack>
          </Paper>
        ) : null}

        {error ? (
          <Alert
            severity="error"
            variant="outlined"
            title={error}
            sx={{
              py: 0.1,
              "& .MuiAlert-icon": { py: 0.35 },
              "& .MuiAlert-message": { py: 0.35, fontSize: 12 },
            }}
          >
            {validationMessage}
          </Alert>
        ) : null}

        <Box sx={{ minHeight: 0, flex: 1 }}>
          <FeatureCodeTextField
            value={source}
            onChange={changeSource}
            minRows={12}
            language={editorFormat}
            onFormat={format}
            formatAriaLabel={`Format ${editorFormat.toUpperCase()}`}
            showFormatAction={false}
            fullscreenTitle={`${scenarioId} · gRPC mock scenario`}
            fullHeight
          />
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          justifyContent: "space-between",
          gap: 1,
          px: 1.5,
          py: 1,
        }}
      >
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button size="small" variant="text" startIcon={<Folder />} onClick={() => void onOpenFolder()}>
            {uiCopy.actions.openFolder}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Refresh />}
            disabled={syncingFile}
            onClick={() => void syncFile()}
          >
            {syncingFile ? "Syncing…" : uiCopy.actions.syncFile}
          </Button>
        </Stack>
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" onClick={format}>
            Format
          </Button>
          <Button size="small" variant="text" disabled={!dirty} onClick={discard}>
            {uiCopy.actions.revert}
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={!dirty}
            onClick={save}
            aria-keyshortcuts="Control+S Meta+S"
          >
            Save
          </Button>
        </Stack>
      </DialogActions>
    </>
  );
}

function GrpcMockSettingsDialog({
  open,
  page,
  onPageChange,
  mockServer,
  running,
  webRunning = false,
  onClose,
  onSave,
  onSaveAndRestart,
}: {
  open: boolean;
  page: GrpcMockSettingsPage;
  onPageChange: (page: GrpcMockSettingsPage) => void;
  mockServer: MockServerProject;
  running: boolean;
  webRunning?: boolean;
  onClose: () => void;
  onSave: (next: MockServerProject) => void;
  onSaveAndRestart: (next: MockServerProject) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<MockServerProject>(() => structuredClone(mockServer));
  const [nativeTlsBrowseBusy, setNativeTlsBrowseBusy] = useState(false);
  useEffect(() => {
    if (open) setDraft(structuredClone(mockServer));
  }, [open, mockServer]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(mockServer);
  const restartRequired =
    draft.bindHost !== mockServer.bindHost ||
    draft.port !== mockServer.port ||
    JSON.stringify(draft.security) !== JSON.stringify(mockServer.security) ||
    JSON.stringify(draft.limits) !== JSON.stringify(mockServer.limits) ||
    JSON.stringify(draft.gatewayProfiles) !== JSON.stringify(mockServer.gatewayProfiles) ||
    draft.activeGatewayProfileId !== mockServer.activeGatewayProfileId;
  const patch = (next: Partial<MockServerProject>) => setDraft((current) => ({ ...current, ...next }));
  const activeGatewayProfile =
    draft.gatewayProfiles.find((profile) => profile.id === draft.activeGatewayProfileId) ??
    draft.gatewayProfiles[0] ??
    createDefaultGatewayProfile();
  const web = activeGatewayProfile.web;

  function patchActiveGatewayProfile(profilePatch: Partial<GrpcGatewayProfile>) {
    setDraft((current) => {
      const fallback = current.gatewayProfiles[0] ?? createDefaultGatewayProfile();
      const profiles = current.gatewayProfiles.length ? current.gatewayProfiles : [fallback];
      const active = profiles.find((profile) => profile.id === current.activeGatewayProfileId) ?? fallback;
      const activeId = active.id;
      return {
        ...current,
        activeGatewayProfileId: activeId,
        gatewayProfiles: profiles.map((profile) =>
          profile.id === activeId
            ? { ...profile, ...profilePatch, updatedAt: new Date().toISOString() }
            : profile,
        ),
      };
    });
  }

  function patchWeb(webPatch: Partial<GrpcWebProxyConfig>) {
    patchActiveGatewayProfile({ web: { ...web, ...webPatch } });
  }

  async function browseNativeTlsCertificate() {
    if (nativeTlsBrowseBusy) return;
    setNativeTlsBrowseBusy(true);
    try {
      const result = await chooseHttpsPemFiles();
      if (!result?.ok || result.cancelled || !result.certificatePath || !result.privateKeyPath) return;
      patch({
        security: {
          ...draft.security,
          tls: true,
          certificatePath: result.certificatePath,
          privateKeyPath: result.privateKeyPath,
          clientCaPath: result.caPath || draft.security.clientCaPath,
        },
      });
    } finally {
      setNativeTlsBrowseBusy(false);
    }
  }

  function save() {
    onSave(draft);
    onClose();
  }

  async function saveAndRestart() {
    await onSaveAndRestart(draft);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>gRPC Mock settings</DialogTitle>
      <DialogContent sx={{ height: "min(72vh, 620px)", overflow: "hidden" }}>
        <Stack direction="row" spacing={1.2} sx={{ height: "100%", minHeight: 0, pt: 0.25 }}>
          <Stack
            spacing={0.35}
            sx={{ width: 160, flexShrink: 0, overflowY: "auto" }}
            role="tablist"
            aria-label="gRPC Mock settings sections"
          >
            {(["server", "security", "web-server", "defaults", "advanced"] as const).map((value) => (
              <Button
                key={value}
                size="small"
                role="tab"
                aria-selected={page === value}
                variant={page === value ? "contained" : "text"}
                onClick={() => onPageChange(value)}
                sx={{ justifyContent: "flex-start" }}
              >
                {value === "web-server" ? "Web server" : value[0].toUpperCase() + value.slice(1)}
              </Button>
            ))}
          </Stack>
          <Box aria-hidden="true" sx={{ width: 1, alignSelf: "stretch", bgcolor: "divider", flexShrink: 0 }} />
          <Box role="tabpanel" sx={{ minWidth: 0, flex: 1, height: "100%", overflowY: "auto", pr: 0.5 }}>
            {(running || webRunning) && dirty && restartRequired && (
              <Alert severity="info" sx={{ mb: 1 }}>
                These changes require a restart for any affected running mock or Web Access listener.
              </Alert>
            )}
            {page === "server" && (
              <Stack spacing={1} sx={{ width: "100%", maxWidth: 520 }}>
                <Typography variant="h6">Server</Typography>
                <TextField
                  size="small"
                  label="Host"
                  value={draft.bindHost}
                  onChange={(event: any) => patch({ bindHost: event.target.value })}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Port"
                  value={String(draft.port)}
                  onChange={(event: any) =>
                    patch({ port: Math.max(1, Math.min(65535, Number(event.target.value) || 50055)) })
                  }
                />
              </Stack>
            )}
            {page === "security" && (
              <Stack spacing={1} sx={{ width: "100%", maxWidth: 520 }}>
                <Typography variant="h6">Security</Typography>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    TLS
                  </Typography>
                  <Switch
                    checked={draft.security.tls}
                    inputProps={{ "aria-label": "TLS" }}
                    onChange={(_event: any, checked: boolean) =>
                      patch({ security: { ...draft.security, tls: checked } })
                    }
                  />
                </Stack>
                {draft.security.tls && (
                  <>
                    <Alert severity="info" variant="outlined">
                      Use your own PEM certificate and private key for the native gRPC Mock listener. Layang will not
                      install or replace OS trust when you use these files.
                    </Alert>
                    <TextField
                      size="small"
                      label="Certificate"
                      value={draft.security.certificatePath}
                      onChange={(event: any) =>
                        patch({ security: { ...draft.security, certificatePath: event.target.value } })
                      }
                    />
                    <TextField
                      size="small"
                      label="Private key"
                      value={draft.security.privateKeyPath}
                      onChange={(event: any) =>
                        patch({ security: { ...draft.security, privateKeyPath: event.target.value } })
                      }
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Folder />}
                      disabled={nativeTlsBrowseBusy}
                      onClick={() => void browseNativeTlsCertificate()}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      {nativeTlsBrowseBusy ? "Selecting…" : "Select own certificate & key"}
                    </Button>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        Client certificate
                      </Typography>
                      <Switch
                        checked={draft.security.requireClientCertificate}
                        inputProps={{ "aria-label": "Client certificate" }}
                        onChange={(_event: any, checked: boolean) =>
                          patch({ security: { ...draft.security, requireClientCertificate: checked } })
                        }
                      />
                    </Stack>
                    {draft.security.requireClientCertificate && (
                      <TextField
                        size="small"
                        label="CA certificate"
                        value={draft.security.clientCaPath}
                        onChange={(event: any) =>
                          patch({ security: { ...draft.security, clientCaPath: event.target.value } })
                        }
                      />
                    )}
                  </>
                )}
              </Stack>
            )}
            {page === "web-server" && (
              <Stack spacing={1.2} sx={{ width: "100%", maxWidth: 560 }}>
                <Box>
                  <Typography variant="h6">Web server</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Browser-facing gRPC-Web settings stay available here and in gRPC → Web access → Settings.
                  </Typography>
                </Box>

                <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 2 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" fontWeight={600}>
                          Browser listener
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Exposes browser-compatible gRPC-Web over HTTP or HTTPS.
                        </Typography>
                      </Box>
                      <Switch
                        checked={web.enabled !== false}
                        inputProps={{ "aria-label": "Enable Web server" }}
                        onChange={(_event: any, checked: boolean) => patchWeb({ enabled: checked })}
                      />
                    </Stack>

                    {web.enabled !== false ? (
                      <>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <TextField
                            size="small"
                            label="Host"
                            value={web.host ?? "127.0.0.1"}
                            onChange={(event: any) => patchWeb({ host: event.target.value })}
                            sx={{ minWidth: 0, flex: 1 }}
                          />
                          <TextField
                            size="small"
                            type="number"
                            label="Port"
                            value={String(web.port ?? 8080)}
                            onChange={(event: any) =>
                              patchWeb({ port: Math.max(1, Math.min(65535, Number(event.target.value) || 8080)) })
                            }
                            sx={{ width: { xs: "100%", sm: 150 } }}
                          />
                        </Stack>
                        <Stack spacing={0.35} sx={{ maxWidth: 240 }}>
                          <Typography variant="caption" color="text.secondary">
                            Protocol
                          </Typography>
                          <FormControl size="small" fullWidth>
                            <Select
                              value={web.security?.type ?? "insecure"}
                              inputProps={{ "aria-label": "Web server protocol" }}
                              onChange={(event: any) => {
                                const nextType = String(event.target.value) === "tls" ? "tls" : "insecure";
                                if (nextType === "tls") {
                                  patchWeb({
                                    port: Number(web.port) === 8080 ? 8443 : web.port,
                                    security:
                                      web.security?.type === "tls"
                                        ? web.security
                                        : {
                                            type: "tls",
                                            certificateMode: "local",
                                            certificateId: "",
                                            certificatePath: "",
                                            privateKeyPath: "",
                                            certificateChainPath: "",
                                            clientCaPath: "",
                                            pfxPath: "",
                                            passphraseSecretId: "",
                                            requireClientCertificate: false,
                                          },
                                  });
                                } else {
                                  patchWeb({
                                    port: Number(web.port) === 8443 ? 8080 : web.port,
                                    security: { type: "insecure" },
                                  });
                                }
                              }}
                            >
                              <MenuItem value="insecure">HTTP</MenuItem>
                              <MenuItem value="tls">HTTPS</MenuItem>
                            </Select>
                          </FormControl>
                        </Stack>
                      </>
                    ) : null}
                  </Stack>
                </Paper>

                {web.enabled !== false && web.security?.type === "tls" ? (
                  <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 2 }}>
                    <Stack spacing={0.9}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          HTTPS certificate
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Generate local trust, or provide your own PEM/PFX certificate without removing Web Access
                          configuration.
                        </Typography>
                      </Box>
                      <WebAccessSecurityPanel
                        host={web.host ?? "127.0.0.1"}
                        security={web.security}
                        onChange={(security) => patchWeb({ security })}
                      />
                    </Stack>
                  </Paper>
                ) : null}

                {web.enabled !== false ? (
                  <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 2 }}>
                    <Stack spacing={1}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          gRPC target
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Forward browser traffic to this local mock or to another native gRPC server.
                        </Typography>
                      </Box>
                      <Stack spacing={0.35} sx={{ maxWidth: 320 }}>
                        <Typography variant="caption" color="text.secondary">
                          Target source
                        </Typography>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={activeGatewayProfile.webUpstreamMode === "custom" ? "custom" : "local-mock"}
                            inputProps={{ "aria-label": "Web server target source" }}
                            onChange={(event: any) =>
                              patchActiveGatewayProfile({
                                webUpstreamMode: String(event.target.value) === "custom" ? "custom" : "local-mock",
                              })
                            }
                          >
                            <MenuItem value="local-mock">Local gRPC Mock</MenuItem>
                            <MenuItem value="custom">Custom native gRPC server</MenuItem>
                          </Select>
                        </FormControl>
                      </Stack>
                      {activeGatewayProfile.webUpstreamMode === "custom" ? (
                        <Stack spacing={1}>
                          <TextField
                            size="small"
                            label="Target"
                            placeholder="127.0.0.1:50051"
                            value={activeGatewayProfile.upstreams?.[0]?.target ?? ""}
                            onChange={(event: any) => {
                              const currentUpstream = activeGatewayProfile.upstreams?.[0] ?? {
                                target: "",
                                weight: 1,
                                security: { type: "insecure" as const },
                              };
                              patchActiveGatewayProfile({
                                upstreams: [
                                  {
                                    ...currentUpstream,
                                    target: String(event.target.value)
                                      .replace(/^https?:\/\//i, "")
                                      .replace(/^grpcs?:\/\//i, ""),
                                  },
                                  ...(activeGatewayProfile.upstreams?.slice(1) ?? []),
                                ],
                              });
                            }}
                          />
                          <Stack spacing={0.35} sx={{ maxWidth: 220 }}>
                            <Typography variant="caption" color="text.secondary">
                              Upstream TLS
                            </Typography>
                            <FormControl size="small" fullWidth>
                              <Select
                                value={activeGatewayProfile.upstreams?.[0]?.security?.type ?? "insecure"}
                                inputProps={{ "aria-label": "Web server upstream TLS" }}
                                onChange={(event: any) => {
                                  const currentUpstream = activeGatewayProfile.upstreams?.[0] ?? {
                                    target: "",
                                    weight: 1,
                                    security: { type: "insecure" as const },
                                  };
                                  const nextSecurity =
                                    String(event.target.value) === "tls"
                                      ? { type: "tls" as const }
                                      : { type: "insecure" as const };
                                  patchActiveGatewayProfile({
                                    upstreams: [
                                      { ...currentUpstream, security: nextSecurity },
                                      ...(activeGatewayProfile.upstreams?.slice(1) ?? []),
                                    ],
                                  });
                                }}
                              >
                                <MenuItem value="insecure">Off</MenuItem>
                                <MenuItem value="tls">On</MenuItem>
                              </Select>
                            </FormControl>
                          </Stack>
                        </Stack>
                      ) : (
                        <Alert severity="info" variant="outlined">
                          Web Access uses the local gRPC Mock and follows the method enable/disable state from the gRPC
                          dashboard.
                        </Alert>
                      )}
                    </Stack>
                  </Paper>
                ) : null}

                {web.enabled !== false ? (
                  <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 2 }}>
                    <Stack spacing={1}>
                      <Typography variant="body2" fontWeight={600}>
                        Browser support
                      </Typography>
                      <TextField
                        size="small"
                        fullWidth
                        label="CORS origins"
                        value={(web.cors?.allowedOrigins ?? []).join(", ")}
                        helperText="Separate multiple browser origins with commas."
                        onChange={(event: any) =>
                          patchWeb({
                            cors: {
                              ...(web.cors ?? {}),
                              allowedOrigins: String(event.target.value)
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean),
                            },
                          })
                        }
                      />
                      <TextField
                        size="small"
                        type="number"
                        label="Max concurrent streams"
                        value={String(web.maxConcurrentStreams ?? 100)}
                        onChange={(event: any) =>
                          patchWeb({
                            maxConcurrentStreams: Math.max(
                              6,
                              Math.min(1000, Math.floor(Number(event.target.value) || 100)),
                            ),
                          })
                        }
                        sx={{ maxWidth: 220 }}
                      />
                    </Stack>
                  </Paper>
                ) : null}
              </Stack>
            )}
            {page === "defaults" && (
              <Stack spacing={1} sx={{ width: "100%", maxWidth: 520 }}>
                <Typography variant="h6">Defaults</Typography>
                <TextField
                  size="small"
                  type="number"
                  label={uiCopy.fields.intervalMs}
                  value={String(draft.streamDefaults.intervalMs)}
                  onChange={(event: any) =>
                    patch({
                      streamDefaults: {
                        ...draft.streamDefaults,
                        intervalMs: Math.max(0, Number(event.target.value) || 0),
                      },
                    })
                  }
                />
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    Loop
                  </Typography>
                  <Switch
                    checked={draft.streamDefaults.loop}
                    inputProps={{ "aria-label": "Default loop" }}
                    onChange={(_event: any, checked: boolean) =>
                      patch({ streamDefaults: { ...draft.streamDefaults, loop: checked } })
                    }
                  />
                </Stack>
                <TextField
                  size="small"
                  type="number"
                  label={uiCopy.fields.loopCount}
                  helperText="0 means unlimited"
                  value={String(draft.streamDefaults.maxLoops)}
                  onChange={(event: any) =>
                    patch({
                      streamDefaults: {
                        ...draft.streamDefaults,
                        maxLoops: Math.max(0, Number(event.target.value) || 0),
                      },
                    })
                  }
                />
              </Stack>
            )}
            {page === "advanced" && (
              <Stack spacing={1} sx={{ width: "100%", maxWidth: 520 }}>
                <Typography variant="h6">Advanced</Typography>
                <TextField
                  size="small"
                  type="number"
                  label="Max receive (MB)"
                  value={String(Math.round(draft.limits.maxReceiveBytes / 1024 / 1024))}
                  onChange={(event: any) =>
                    patch({
                      limits: {
                        ...draft.limits,
                        maxReceiveBytes: Math.max(1, Number(event.target.value) || 1) * 1024 * 1024,
                      },
                    })
                  }
                />
                <TextField
                  size="small"
                  type="number"
                  label="Max send (MB)"
                  value={String(Math.round(draft.limits.maxSendBytes / 1024 / 1024))}
                  onChange={(event: any) =>
                    patch({
                      limits: {
                        ...draft.limits,
                        maxSendBytes: Math.max(1, Number(event.target.value) || 1) * 1024 * 1024,
                      },
                    })
                  }
                />
                <TextField
                  size="small"
                  type="number"
                  label="Keepalive (s)"
                  value={String(Math.round(draft.limits.keepaliveMs / 1000))}
                  onChange={(event: any) =>
                    patch({
                      limits: { ...draft.limits, keepaliveMs: Math.max(1, Number(event.target.value) || 1) * 1000 },
                    })
                  }
                />
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="outlined" disabled={!dirty} onClick={save}>
          Save
        </Button>
        {(running || webRunning) && (
          <Button variant="contained" disabled={!dirty} onClick={() => void saveAndRestart()}>
            Save & restart
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function ProtoSourcesPanel({
  ctx,
  sources,
  attachedMethods,
  onAttach,
  onDetach,
  onCreateScenario,
}: {
  ctx: ViewContext;
  sources: MockProtoSource[];
  attachedMethods: AttachedMethod[];
  onAttach: () => void;
  onDetach: (source: MockProtoSource) => void;
  onCreateScenario: (item: AttachedMethod) => void;
}) {
  const {
    mockSelectedMethodKey,
    mockServer,
    mockServerStatus,
    protoLibraries,
    protoRuntimeRegistry,
    selectProtoLibraryVersion,
    setMockSelectedMethodKey,
    setMockServer,
  } = ctx;
  const [selectedSourceKey, setSelectedSourceKey] = useState(() =>
    sources[0] ? `${sources[0].libraryId}:${sources[0].versionId}` : "",
  );
  const [sourceMenu, setSourceMenu] = useState<{ anchor: HTMLElement; source: MockProtoSource } | null>(null);
  const [revisionSource, setRevisionSource] = useState<MockProtoSource | null>(null);
  const [revisionId, setRevisionId] = useState("");
  const selectMockMethodImmediate = useImmediateMockMethodSelection(
    setMockSelectedMethodKey,
    selectProtoLibraryVersion,
  );
  useEffect(() => {
    if (!sources.some((source) => `${source.libraryId}:${source.versionId}` === selectedSourceKey))
      setSelectedSourceKey(sources[0] ? `${sources[0].libraryId}:${sources[0].versionId}` : "");
  }, [sources, selectedSourceKey]);
  const selectedSource =
    sources.find((source) => `${source.libraryId}:${source.versionId}` === selectedSourceKey) ?? sources[0];
  const selectedCompiled = selectedSource
    ? protoRuntimeRegistry.resolveVersion(selectedSource.libraryId, selectedSource.versionId)
    : null;
  const selectedMethods = useMemo(
    () =>
      attachedMethods.filter(
        (item) =>
          item.source.libraryId === selectedSource?.libraryId && item.source.versionId === selectedSource?.versionId,
      ),
    [attachedMethods, selectedSource?.libraryId, selectedSource?.versionId],
  );
  const selectedMethodGroups = useMemo(() => {
    const groups = new Map<string, AttachedMethod[]>();
    for (const item of selectedMethods) {
      const current = groups.get(item.method.serviceName) ?? [];
      current.push(item);
      groups.set(item.method.serviceName, current);
    }
    return [...groups.entries()].map(([serviceName, methods]) => ({ serviceName, methods }));
  }, [selectedMethods]);

  function replaceRevision(source: MockProtoSource, nextVersionId: string) {
    if (!nextVersionId || nextVersionId === source.versionId) return;
    setMockServer((current: MockServerProject) => ({
      ...current,
      protoSources: (current.protoSources ?? []).map((item) =>
        item.libraryId === source.libraryId && item.versionId === source.versionId
          ? { ...item, versionId: nextVersionId }
          : item,
      ),
      methodBindings: Object.fromEntries(
        Object.entries(current.methodBindings ?? {}).map(([key, binding]: [string, any]) => [
          key,
          binding.libraryId === source.libraryId && binding.versionId === source.versionId
            ? { ...binding, versionId: nextVersionId }
            : binding,
        ]),
      ),
      updatedAt: new Date().toISOString(),
    }));
    setSelectedSourceKey(`${source.libraryId}:${nextVersionId}`);
    selectProtoLibraryVersion(source.libraryId, nextVersionId);
  }

  function latestVersionId(source: MockProtoSource) {
    const library = protoLibraries.find((item: any) => item.id === source.libraryId);
    const available = (library?.versions ?? []).filter((version: any) => version.lifecycle !== "archived");
    return library?.defaultVersionId || available[0]?.id || source.versionId;
  }

  return (
    <>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ minHeight: 0, flex: 1 }}>
        <Box sx={{ width: { xs: "100%", md: 330 }, overflow: "auto" }}>
          <Stack direction="row" alignItems="center" sx={{ mb: 0.7 }}>
            <Typography variant="subtitle1" sx={{ flex: 1 }}>
              Proto
            </Typography>
            <Tooltip title="Attach Proto">
              <IconButton color="primary" aria-label="Attach Proto" onClick={onAttach}>
                <Add />
              </IconButton>
            </Tooltip>
          </Stack>
          {sources.length === 0 ? (
            <EmptyCard title="No Proto attached" body="Attach a schema from the global registry." />
          ) : (
            <Stack spacing={0.5}>
              {sources.map((source) => {
                const compiled = protoRuntimeRegistry.resolveVersion(source.libraryId, source.versionId);
                const key = `${source.libraryId}:${source.versionId}`;
                const scenarioCount = Object.values(mockServer.methodBindings ?? {}).filter(
                  (binding: any) => binding.libraryId === source.libraryId && binding.versionId === source.versionId,
                ).length;
                return (
                  <Stack key={key} direction="row" spacing={0.35} alignItems="stretch">
                    <ListItemButton
                      selected={selectedSourceKey === key}
                      aria-pressed={selectedSourceKey === key}
                      onClick={() => setSelectedSourceKey(key)}
                      sx={{
                        minWidth: 0,
                        flex: 1,
                        border: "1px solid",
                        borderColor: selectedSourceKey === key ? "primary.main" : "divider",
                      }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {compiled?.library.name ?? "Missing schema"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {compiled?.version.version ?? source.versionId} · {compiled?.loaded.methods.length ?? 0}{" "}
                          methods · {scenarioCount} used
                        </Typography>
                      </Box>
                    </ListItemButton>
                    <IconButton
                      size="small"
                      aria-label={`Actions for ${compiled?.library.name ?? "Proto"}`}
                      onClick={(event: any) => setSourceMenu({ anchor: event.currentTarget, source })}
                    >
                      <MoreHoriz sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1, overflow: "auto" }}>
          {!selectedCompiled ? (
            <EmptyCard title="Select Proto" body="Choose an attached Proto source." />
          ) : (
            <Stack spacing={1}>
              <Stack direction="row" alignItems="flex-end" spacing={1}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="h6" noWrap>
                    {selectedCompiled.library.name}
                  </Typography>
                  <FormControl size="small" sx={{ mt: 0.45, minWidth: 150 }}>
                    <Select
                      value={selectedCompiled.version.id}
                      inputProps={{ "aria-label": `Mock Proto revision for ${selectedCompiled.library.name}` }}
                      onChange={(event: any) =>
                        replaceRevision(selectedSource, String(event.target.value))
                      }
                    >
                      {(selectedCompiled.library.versions ?? [])
                        .filter((version: any) => version.lifecycle !== "archived")
                        .map((version: any) => (
                          <MenuItem key={version.id} value={version.id}>
                            {version.version}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {selectedMethods.length} method{selectedMethods.length === 1 ? "" : "s"}
                </Typography>
              </Stack>

              {selectedMethodGroups.length === 0 ? (
                <EmptyCard title="No methods" body="This Proto revision does not contain RPC methods." />
              ) : (
                <Stack spacing={1.2} role="listbox" aria-label="Proto methods">
                  {selectedMethodGroups.map((group) => (
                    <Stack key={group.serviceName} spacing={0.35}>
                      <Stack direction="row" spacing={0.7} alignItems="center" sx={{ px: 0.75 }}>
                        <Typography variant="caption" fontWeight={600} color="text.secondary" noWrap>
                          {group.serviceName}
                        </Typography>
                        <Divider sx={{ flex: 1 }} />
                      </Stack>

                      {group.methods.map((item) => {
                        const key = methodKey(item.method);
                        const selected = mockSelectedMethodKey === key;
                        const scenarioFile = getMockMethodScenarioFile(mockServer, item.method);
                        const parsed = parseMockScenarioText(
                          scenarioFile.scenarioText,
                          scenarioFile.format,
                          mockServer.port,
                        );
                        const methodScenarios = parsed.ok
                          ? parsed.bundle.scenarios.filter(
                              (scenario) =>
                                scenario.service === item.method.serviceName &&
                                scenario.method === item.method.methodName,
                            )
                          : [];
                        const unsupportedReason = item.method.requestStream
                          ? "Client-streaming and bidirectional-streaming mocks are not supported yet."
                          : "";
                        const invalidScenarioReason = parsed.ok
                          ? ""
                          : `${scenarioFile.format.toUpperCase()} scenario file is invalid. ${parsed.error}`;
                        const errorDetail = unsupportedReason || invalidScenarioReason;
                        const activeScenarioId = mockServer.selectedScenarioIds[key] ?? methodScenarios[0]?.id;
                        const running = Boolean(
                          mockServerStatus?.running &&
                            !errorDetail &&
                            mockServer.enabledMethods[key] !== false &&
                            methodScenarios.some((scenario) => scenario.id === activeScenarioId),
                        );

                        const selectMethod = () => {
                          selectMockMethodImmediate(key, item.source);
                        };

                        return (
                          <ListItemButton
                            key={key}
                            component="div"
                            role="option"
                            tabIndex={0}
                            selected={selected}
                            aria-selected={selected}
                            onClick={selectMethod}
                            onDoubleClick={() => {
                              if (errorDetail) return;
                              selectMethod();
                              onCreateScenario(item);
                            }}
                            onKeyDown={(event: any) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                selectMethod();
                              }
                            }}
                            sx={{
                              minHeight: 50,
                              px: 1,
                              py: 0.6,
                              gap: 0.75,
                              borderRadius: 1,
                              borderLeft: "2px solid",
                              borderLeftColor: selected ? "primary.main" : "transparent",
                              bgcolor: selected ? "action.selected" : "transparent",
                              "&.Mui-selected": { bgcolor: "action.selected" },
                              "&:hover": { bgcolor: selected ? "action.selected" : "action.hover" },
                              "&:hover .method-row-action, &:focus-within .method-row-action": { opacity: 1 },
                            }}
                          >
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography variant="body2" fontWeight={500} noWrap title={item.method.methodName}>
                                {item.method.methodName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {rpcMethodKindLabel(item.method)}
                              </Typography>
                            </Box>

                            {errorDetail ? (
                              <MethodStatusIndicator
                                tone="error"
                                title="Method unavailable"
                                detail={errorDetail}
                                context={`${item.method.serviceName}/${item.method.methodName}`}
                              />
                            ) : running ? (
                              <MethodStatusIndicator
                                tone="running"
                                title="Running"
                                detail="This method is serving its active scenario."
                                context={`${item.method.serviceName}/${item.method.methodName}`}
                                ariaLabel="Method is running"
                              />
                            ) : null}

                            {!errorDetail ? (
                              <Tooltip title={uiCopy.actions.addScenario}>
                                <IconButton
                                  className="method-row-action"
                                  size="small"
                                  aria-label={`${uiCopy.actions.addScenario} for ${item.method.methodName}`}
                                  onClick={(event: any) => {
                                    event.stopPropagation();
                                    selectMethod();
                                    onCreateScenario(item);
                                  }}
                                  sx={{
                                    width: 26,
                                    height: 26,
                                    flexShrink: 0,
                                    opacity: selected ? 1 : 0.55,
                                    color: "primary.main",
                                  }}
                                >
                                  <Add sx={{ fontSize: 15 }} />
                                </IconButton>
                              </Tooltip>
                            ) : null}
                          </ListItemButton>
                        );
                      })}
                    </Stack>
                  ))}
                </Stack>
              )}
            </Stack>
          )}
        </Box>
      </Stack>

      <Menu anchorEl={sourceMenu?.anchor ?? null} open={Boolean(sourceMenu)} onClose={() => setSourceMenu(null)}>
        <MenuItem
          onClick={() => {
            if (sourceMenu) setSelectedSourceKey(`${sourceMenu.source.libraryId}:${sourceMenu.source.versionId}`);
            setSourceMenu(null);
          }}
        >
          View methods
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (sourceMenu) {
              setRevisionSource(sourceMenu.source);
              setRevisionId(sourceMenu.source.versionId);
            }
            setSourceMenu(null);
          }}
        >
          Change revision
        </MenuItem>
        <MenuItem
          disabled={!sourceMenu || latestVersionId(sourceMenu.source) === sourceMenu.source.versionId}
          onClick={() => {
            if (sourceMenu) replaceRevision(sourceMenu.source, latestVersionId(sourceMenu.source));
            setSourceMenu(null);
          }}
        >
          Update to latest
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            if (sourceMenu) onDetach(sourceMenu.source);
            setSourceMenu(null);
          }}
          sx={{ color: "error.main" }}
        >
          Detach
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(revisionSource)} onClose={() => setRevisionSource(null)} fullWidth maxWidth="sm">
        <DialogTitle>Change revision</DialogTitle>
        <DialogContent>
          <Stack spacing={0.45} sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Revision
            </Typography>
            <FormControl size="small" fullWidth>
              <Select
                value={revisionId}
                inputProps={{ "aria-label": "Revision" }}
                onChange={(event: any) => setRevisionId(String(event.target.value))}
              >
                {(protoLibraries.find((item: any) => item.id === revisionSource?.libraryId)?.versions ?? [])
                  .filter((version: any) => version.lifecycle !== "archived")
                  .map((version: any) => (
                    <MenuItem key={version.id} value={version.id}>
                      {version.version}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevisionSource(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!revisionSource || !revisionId || revisionId === revisionSource.versionId}
            onClick={() => {
              if (revisionSource) replaceRevision(revisionSource, revisionId);
              setRevisionSource(null);
            }}
          >
            Change
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function WebAccessPanel({
  ctx,
  requestedSection,
}: {
  ctx: ViewContext;
  requestedSection?: { id: number; tab: "overview" | "logs" | "settings" };
}) {
  const {
    mockServer,
    mockServerStatus,
    setMockServer,
    startWebAccess,
    stopWebAccess,
    webAccessStatus,
    handleTargetDraftChange,
    commitTargetDraft,
    setSideSection,
  } = ctx;
  const [tab, setTab] = useState<"overview" | "logs" | "settings">("overview");
  const [runtimeAction, setRuntimeAction] = useState<"start" | "stop" | null>(null);
  useEffect(() => {
    if (!requestedSection?.id) return;
    setTab(requestedSection.tab);
  }, [requestedSection?.id, requestedSection?.tab]);
  const [httpsTest, setHttpsTest] = useState<{ running: boolean; message: string; ok?: boolean }>({
    running: false,
    message: "",
  });
  const profile =
    mockServer.gatewayProfiles.find((item: any) => item.id === mockServer.activeGatewayProfileId) ??
    mockServer.gatewayProfiles[0];
  const [draft, setDraft] = useState<any>(() => structuredClone(profile));
  useEffect(() => setDraft(structuredClone(profile)), [profile]);
  const web = profile?.web ?? {};
  const upstream = profile?.upstreams?.[0];
  const draftWeb = draft?.web ?? {};
  const draftUpstream = draft?.upstreams?.[0] ?? {
    id: "web-access-upstream",
    name: "gRPC Server",
    target: "localhost:50051",
    security: { type: "insecure" },
  };
  const targetMode = draft?.webUpstreamMode === "custom" ? "custom" : "local-mock";
  const localMockTarget =
    mockServerStatus.localTarget ?? `${mockServer.bindHost || "127.0.0.1"}:${mockServerStatus.port ?? mockServer.port}`;
  const running = Boolean(webAccessStatus.running);
  const browserHost = ["0.0.0.0", "::", "[::]"].includes(web.host ?? "") ? "localhost" : (web.host ?? "127.0.0.1");
  const browserUrl =
    webAccessStatus.url ?? `${web.security?.type === "tls" ? "https" : "http"}://${browserHost}:${web.port ?? 8080}`;
  const dirty = Boolean(profile) && JSON.stringify(draft) !== JSON.stringify(profile);
  const restartRequired =
    dirty &&
    (draftWeb.host !== web.host ||
      draftWeb.port !== web.port ||
      JSON.stringify(draftWeb.security) !== JSON.stringify(web.security) ||
      targetMode !== (profile?.webUpstreamMode === "custom" ? "custom" : "local-mock") ||
      draftUpstream.target !== upstream?.target ||
      JSON.stringify(draftUpstream.security) !== JSON.stringify(upstream?.security));

  function patchWeb(patch: Record<string, unknown>) {
    setDraft((current: any) => ({
      ...current,
      web: { ...(current?.web ?? {}), ...patch },
      updatedAt: new Date().toISOString(),
    }));
  }

  function patchUpstream(patch: Record<string, unknown>) {
    setDraft((current: any) => ({
      ...current,
      mode: "gateway",
      noMatchBehavior: "proxy",
      upstreams: [{ ...(current?.upstreams?.[0] ?? draftUpstream), ...patch }],
      updatedAt: new Date().toISOString(),
    }));
  }

  function commit(next: any) {
    setMockServer((current: MockServerProject) => ({
      ...current,
      gatewayProfiles: current.gatewayProfiles.map((item) => (item.id === next.id ? next : item)),
      activeGatewayProfileId: next.id,
      updatedAt: new Date().toISOString(),
    }));
  }

  async function saveAndRestart() {
    if (runtimeAction) return;
    setRuntimeAction("start");
    try {
      if (running) await stopWebAccess();
      commit(draft);
      await startWebAccess(draft);
    } finally {
      setRuntimeAction(null);
    }
  }

  function useBrowserUrl() {
    handleTargetDraftChange(browserUrl);
    commitTargetDraft(browserUrl);
    setSideSection("collections");
  }

  async function testBrowserHttps() {
    if (!running || !browserUrl.startsWith("https://") || httpsTest.running) return;
    setHttpsTest({ running: true, message: "" });
    const result = await testHttpsEndpoint(`${browserUrl.replace(/\/$/, "")}/healthz`);
    if (!result) {
      setHttpsTest({ running: false, ok: false, message: "HTTPS test is available only in the desktop application." });
      return;
    }
    setHttpsTest({
      running: false,
      ok: result.ok,
      message: result.ok
        ? `HTTPS connection succeeded${result.protocol ? ` via ${result.protocol}` : ""}.`
        : result.error || `HTTPS returned status ${result.statusCode ?? "unknown"}.`,
    });
  }

  return (
    <Stack
      spacing={1.25}
      sx={{
        minHeight: 0,
        flex: 1,
        px: { xs: 0.75, sm: 1.25, lg: 1.75 },
        pb: 1.5,
      }}
    >
      <Box sx={webAccessPageSx}>
        <WorkbenchTabs
          value={tab}
          ariaLabel="Web Access sections"
          idPrefix="web-access"
          variant="underline"
          bordered={false}
          items={[
            { value: "overview", label: "Overview" },
            { value: "logs", label: "Logs" },
            { value: "settings", label: "Settings" },
          ]}
          onValueChange={(value) => setTab(value as typeof tab)}
        />
      </Box>

      {!running && webAccessStatus.message && /failed|error|could not|unavailable/i.test(webAccessStatus.message) ? (
        <Alert severity="error" variant="outlined" sx={webAccessPageSx}>
          {webAccessStatus.message}
        </Alert>
      ) : null}

      {tab === "overview" && (
        <Stack
          role="tabpanel"
          id="web-access-panel-overview"
          aria-labelledby="web-access-tab-overview"
          tabIndex={0}
          spacing={1.25}
          sx={webAccessPageSx}
        >
          <Paper variant="outlined" sx={webAccessSectionSx}>
            <Stack spacing={1.25}>
              <Box>
                <Typography variant="subtitle1">Connection</Typography>
                <Typography variant="body2" color="text.secondary">
                  Browser endpoint and the gRPC server currently used by Web Access.
                </Typography>
              </Box>
              <Divider />
              <Stack spacing={0.15}>
                <InfoRow label="Listener" value={`${web.host ?? "127.0.0.1"}:${web.port ?? 8080}`} />
                <InfoRow label="Browser URL" value={browserUrl} />
                <InfoRow
                  label="Target mode"
                  value={profile?.webUpstreamMode === "custom" ? "Custom server" : "Local gRPC Mock"}
                />
                <InfoRow
                  label="gRPC server"
                  value={
                    profile?.webUpstreamMode === "custom" ? (upstream?.target ?? "Not configured") : localMockTarget
                  }
                />
                <InfoRow label="Browser protocol" value={web.security?.type === "tls" ? "HTTPS" : "HTTP"} />
                {web.security?.type === "tls" ? (
                  <InfoRow
                    label="Certificate"
                    value={
                      web.security.certificateMode === "pfx"
                        ? "PFX / P12"
                        : web.security.certificateMode === "local"
                          ? "Local trusted"
                          : "PEM"
                    }
                  />
                ) : null}
                <InfoRow label="Upstream TLS" value={upstream?.security?.type === "tls" ? "On" : "Off"} />
              </Stack>
              {httpsTest.message ? (
                <Alert severity={httpsTest.ok ? "success" : "error"} variant="outlined">
                  {httpsTest.message}
                </Alert>
              ) : null}
              <Stack
                direction="row"
                spacing={0.75}
                justifyContent="flex-end"
                flexWrap="wrap"
                useFlexGap
                sx={{ pt: 0.25 }}
              >
                {browserUrl.startsWith("https://") ? (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!running || httpsTest.running}
                    onClick={() => void testBrowserHttps()}
                  >
                    {httpsTest.running ? "Testing…" : "Test HTTPS"}
                  </Button>
                ) : null}
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ContentCopy />}
                  onClick={() => copyTextWithAnnouncement(browserUrl, "Browser URL")}
                >
                  Copy URL
                </Button>
                <Button size="small" variant="contained" onClick={useBrowserUrl}>
                  Use in request
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Stack>
      )}

      {tab === "logs" && (
        <Box
          role="tabpanel"
          id="web-access-panel-logs"
          aria-labelledby="web-access-tab-logs"
          tabIndex={0}
          sx={{ ...webAccessPageSx, minHeight: 0, flex: 1 }}
        >
          <Paper variant="outlined" sx={{ ...webAccessSectionSx, minHeight: 160 }}>
            <RuntimeLogs status={webAccessStatus} />
          </Paper>
        </Box>
      )}

      {tab === "settings" && (
        <Stack
          role="tabpanel"
          id="web-access-panel-settings"
          aria-labelledby="web-access-tab-settings"
          tabIndex={0}
          spacing={1.25}
          sx={webAccessPageSx}
        >
          {running && dirty && restartRequired ? (
            <Alert severity="info" variant="outlined">
              These changes require a restart.
            </Alert>
          ) : null}

          <WebAccessSettingsSection
            title="Browser listener"
            description="Choose the address and protocol exposed to browser clients."
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
              <TextField
                size="small"
                label="Host"
                value={draftWeb.host ?? "127.0.0.1"}
                onChange={(event: any) => patchWeb({ host: event.target.value })}
                sx={{ minWidth: 0, flex: 1 }}
              />
              <TextField
                size="small"
                type="number"
                label="Port"
                value={String(draftWeb.port ?? 8080)}
                onChange={(event: any) =>
                  patchWeb({ port: Math.max(1, Math.min(65535, Number(event.target.value) || 8080)) })
                }
                sx={{ width: { xs: "100%", sm: 170 }, flexShrink: 0 }}
              />
            </Stack>
            <Stack spacing={0.5} sx={{ maxWidth: { xs: "100%", sm: 260 } }}>
              <Typography variant="caption" color="text.secondary">
                Protocol
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={draftWeb.security?.type ?? "insecure"}
                  inputProps={{ "aria-label": "Browser protocol" }}
                  onChange={(event: any) => {
                    const nextType = String(event.target.value) === "tls" ? "tls" : "insecure";
                    if (nextType === "tls") {
                      patchWeb({
                        port: Number(draftWeb.port) === 8080 ? 8443 : draftWeb.port,
                        security:
                          draftWeb.security?.type === "tls"
                            ? draftWeb.security
                            : {
                                type: "tls",
                                certificateMode: "local",
                                certificateId: "",
                                certificatePath: "",
                                privateKeyPath: "",
                                certificateChainPath: "",
                                clientCaPath: "",
                                pfxPath: "",
                                passphraseSecretId: "",
                                requireClientCertificate: false,
                              },
                      });
                    } else {
                      patchWeb({
                        port: Number(draftWeb.port) === 8443 ? 8080 : draftWeb.port,
                        security: { type: "insecure" },
                      });
                    }
                  }}
                >
                  <MenuItem value="insecure">HTTP</MenuItem>
                  <MenuItem value="tls">HTTPS</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </WebAccessSettingsSection>

          {draftWeb.security?.type === "tls" ? (
            <WebAccessSettingsSection
              title="HTTPS certificate"
              description="Configure the certificate presented to browser clients."
            >
              <WebAccessSecurityPanel
                host={draftWeb.host ?? "127.0.0.1"}
                security={draftWeb.security}
                onChange={(security) => patchWeb({ security })}
              />
            </WebAccessSettingsSection>
          ) : null}

          <WebAccessSettingsSection
            title="gRPC server"
            description="Select whether Web Access forwards to the local mock or another native gRPC server."
          >
            <Stack spacing={0.5} sx={{ maxWidth: { xs: "100%", sm: 360 } }}>
              <Typography variant="caption" color="text.secondary">
                Target source
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={targetMode}
                  inputProps={{ "aria-label": "Web Access target source" }}
                  onChange={(event: any) => {
                    const mode = String(event.target.value) === "custom" ? "custom" : "local-mock";
                    setDraft((current: any) => ({
                      ...current,
                      webUpstreamMode: mode,
                      updatedAt: new Date().toISOString(),
                    }));
                  }}
                >
                  <MenuItem value="local-mock">Local gRPC Mock</MenuItem>
                  <MenuItem value="custom">Custom native gRPC server</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            {targetMode === "local-mock" ? (
              <Alert severity={mockServerStatus.running ? "success" : "info"} variant="outlined">
                Web Access forwards to <strong>{localMockTarget}</strong>. The local gRPC Mock starts automatically when
                needed.
              </Alert>
            ) : (
              <Stack spacing={1.1}>
                <TextField
                  size="small"
                  label="Target"
                  placeholder="127.0.0.1:50051"
                  value={draftUpstream.target ?? ""}
                  helperText="Native gRPC host and port; do not include http://."
                  onChange={(event: any) =>
                    patchUpstream({
                      target: event.target.value.replace(/^https?:\/\//i, "").replace(/^grpcs?:\/\//i, ""),
                    })
                  }
                />
                <Stack spacing={0.5} sx={{ maxWidth: { xs: "100%", sm: 220 } }}>
                  <Typography variant="caption" color="text.secondary">
                    Upstream TLS
                  </Typography>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={draftUpstream.security?.type ?? "insecure"}
                      inputProps={{ "aria-label": "Upstream TLS" }}
                      onChange={(event: any) =>
                        patchUpstream({
                          security: { ...(draftUpstream.security ?? {}), type: String(event.target.value) },
                        })
                      }
                    >
                      <MenuItem value="insecure">Off</MenuItem>
                      <MenuItem value="tls">On</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
              </Stack>
            )}
          </WebAccessSettingsSection>

          <WebAccessSettingsSection
            title="Browser support"
            description="Allow the browser origins that may call this endpoint."
          >
            <TextField
              size="small"
              fullWidth
              label="CORS origins"
              placeholder="http://localhost:3000, https://app.example.com"
              value={(draftWeb.cors?.allowedOrigins ?? []).join(", ")}
              helperText="Separate multiple origins with commas."
              onChange={(event: any) =>
                patchWeb({
                  cors: {
                    ...(draftWeb.cors ?? {}),
                    allowedOrigins: String(event.target.value)
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </WebAccessSettingsSection>

          <Paper
            variant="outlined"
            sx={{
              ...webAccessSectionSx,
              py: { xs: 1, sm: 1.2 },
            }}
          >
            <Stack direction="row" spacing={0.75} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
              <Button variant="text" disabled={!dirty} onClick={() => setDraft(structuredClone(profile))}>
                Reset
              </Button>
              <Button variant="outlined" disabled={!dirty} onClick={() => commit(draft)}>
                Save
              </Button>
              {running ? (
                <Button variant="contained" disabled={!dirty} onClick={() => void saveAndRestart()}>
                  Save & restart
                </Button>
              ) : null}
            </Stack>
          </Paper>
        </Stack>
      )}
    </Stack>
  );
}

function WebAccessSettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={webAccessSectionSx}>
      <Stack spacing={1.25}>
        <Box>
          <Typography variant="subtitle1">{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
        <Divider />
        {children}
      </Stack>
    </Paper>
  );
}

function RuntimeLogs({ status }: { status: any }) {
  const directLogs = status.logs ?? [];
  const logs = directLogs.map((item: any, index: number) =>
    typeof item === "string" ? { id: `${index}-${item}`, timestamp: Date.now(), message: item } : item,
  );
  return logs.length ? (
    <Stack spacing={0.5}>
      {logs
        .slice()
        .reverse()
        .map((log: any) => (
          <Paper key={log.id} variant="outlined" sx={{ px: 1, py: 0.65 }}>
            <Stack direction="row" spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {new Date(log.timestamp).toLocaleTimeString()}
              </Typography>
              <Typography variant="body2" sx={{ minWidth: 0, flex: 1 }}>
                {log.message ?? `${log.method ?? "Runtime"} ${log.status ?? ""}`}
              </Typography>
            </Stack>
          </Paper>
        ))}
    </Stack>
  ) : (
    <EmptyCard title="No logs" body={status.message || "Runtime logs will appear here."} />
  );
}

function WorkspaceFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <WorkbenchPanel>
      <WorkbenchPanelHeader icon={<MockServer sx={{ fontSize: 18 }} />} title={title} description={description} />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-[10px]">{children}</div>
    </WorkbenchPanel>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ py: 0.35 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: "right", wordBreak: "break-all" }}>
        {value}
      </Typography>
    </Stack>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Paper variant="outlined" sx={{ ...cardSx, py: 4, textAlign: "center" }}>
      <Typography variant="subtitle1">{title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
    </Paper>
  );
}
