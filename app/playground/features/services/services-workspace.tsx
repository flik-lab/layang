"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
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
  Folder,
  HelpOutline,
  Language,
  MoreHoriz,
  OpenInNew,
  PlayArrow,
  Settings,
  Storage,
} from "@/components/shadcn/icons";
import { readProtoCatalog } from "@/lib/proto-catalog-client";
import { useMockCatalog } from "../mock-server/catalog/useMockCatalog";
import type { RpcMethodInfo } from "@/lib/types";
import { MethodStatusIndicator } from "../../shared/components/method-status-indicator";
import { WorkbenchTabs } from "@/components/ui/workbench";
import { RestMockPanel } from "../rest/rest-panels";
import { WebSocketMockPanel } from "../websocket/websocket-panels";
import { WebAccessSecurityPanel } from "./web-access-security-panel";
import { WebAccessPanel } from "./web-access-panel";
import { RuntimeLogs, WorkspaceFrame, EmptyCard } from "./services-runtime-ui";
import { chooseHttpsPemFiles } from "../../shared/certificate-settings";
import {
  createDefaultGatewayProfile,
} from "../mock-server/mock-scenario-model";
import { methodKey } from "../../shared/rpc-method-utils";
import { uiCopy } from "../../shared/ui-copy";
import { interactionStartedAt, measureInteraction } from "../../shared/performance/interaction-performance";
import { rpcMethodKindLabel } from "../mock-server/mock-scenario-ui";
import {
  useGrpcMockRuntimeStatus,
  useRestMockRuntimeStatus,
  useWebAccessRuntimeStatus,
  useWebSocketMockRuntimeStatus,
} from "../mock-server/runtime/useMockRuntimeSelector";
import { FileBasedGrpcScenarios } from "../mock-server/workspace/FileBasedGrpcScenarios";
import { MockHelpDrawer } from "../help/mock-help-drawer";
import { GrpcGettingStarted, RuntimeCard } from "./grpc-mock-home";
import { openMockHelp } from "../help/mock-help-store";
import type { MockCatalogMethodInput } from "../mock-server/catalog/mockCatalog.types";
import type { ScenarioExamples } from "../mock-server/scenario-templates";
import { safeGenerateExample } from "../mock-server/mock-scenario-examples";
import type { ProtoRuntimeRegistry } from "@/lib/proto-runtime-registry";
import { isScenarioMethodKey } from "../mock-server/workspace/CreateGrpcScenarioDialog";
import { mockingUiStore, useScenarioNavigation } from "../mock-server/workspace/mockingUi.store";
import { grpcMockOverviewMethodKey } from "../../shared/workbench-constants";
import { resolveEffectiveMockProtoSources } from "../mock-server/mock-proto-sources";
import type {
  GrpcGatewayProfile,
  GrpcWebProxyConfig,
  MockProtoSource,
  MockServerProject,
} from "../../shared/workbench-types";

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

type ViewContext = Record<string, any>;
type GrpcMockTab = "scenarios" | "proto" | "web-access" | "activity";
type GrpcMockSettingsPage = "server" | "security" | "web-server" | "defaults" | "advanced";
const GRPC_MOCK_SETTINGS_PAGES: ReadonlyArray<{ value: GrpcMockSettingsPage; label: string }> = [
  { value: "server", label: "Native server" },
  { value: "security", label: "Native security" },
  { value: "web-server", label: "Web Access" },
  { value: "defaults", label: "Stream defaults" },
  { value: "advanced", label: "Advanced" },
];
type AttachedMethod = {
  source: MockProtoSource;
  method: RpcMethodInfo;
};
type ScenarioDraftHandle = RefObject<(() => Promise<boolean>) | null>;

export function ServicesWorkspace({ ctx: shellCtx, draftHandle }: { ctx: ViewContext; draftHandle?: ScenarioDraftHandle }) {
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
    managedWindow,
    mockServer,
    mockServerStatus,
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
    sendRestMockPending,
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

  const workspaceContent = isGrpc ? (
    <GrpcMockWorkspace ctx={ctx} initialTab="scenarios" draftHandle={draftHandle} />
  ) : (
    <WorkspaceFrame
      title={isRest ? "REST Mock" : "WebSocket Mock"}
      description={
        isRest ? "Serve HTTP responses from local scenarios." : "Serve WebSocket messages from local scenarios."
      }
      contentOverflow="hidden"
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
          sx={{ minHeight: 0, flex: 1, overflow: "hidden" }}
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
            onSendPending={() => void sendRestMockPending()}
          />
        </Box>
      ) : (
        <Box
          role="tabpanel"
          id="websocket-mock-panel-scenarios"
          aria-labelledby="websocket-mock-tab-scenarios"
          tabIndex={0}
          sx={{ minHeight: 0, flex: 1, overflow: "hidden" }}
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
        grpcEndpoint={mockServerStatus?.localTarget ? `grpc://${mockServerStatus.localTarget}` : `grpc://${mockServer.bindHost}:${mockServer.port}`}
        runtimeActions={runtimeActions}
        webRunning={Boolean(webAccessStatus?.running)}
        webEndpoint={webAccessStatus?.url ?? `http://${mockServer.gatewayProfiles?.[0]?.web?.host ?? "127.0.0.1"}:${mockServer.gatewayProfiles?.[0]?.web?.port ?? 8080}`}
        restRunning={Boolean(restMockStatus?.running)}
        restEndpoint={restMockStatus?.url ?? `http://${restMockServer.bindHost}:${restMockServer.port}`}
        websocketRunning={Boolean(wsMockStatus?.running)}
        websocketEndpoint={wsMockStatus?.url ?? `ws://127.0.0.1:${wsMockPort}`}
        onToggle={(kind, checked) => void toggleRuntime(kind, checked)}
        onOpenSettings={() => setGrpcSettingsOpen(true)}
        onDetach={managedWindow?.context?.kind === "main" ? () => {
          void managedWindow.openDetached("mocking", { title: "Mocking" });
        } : undefined}
      />
      <Box sx={{ minHeight: 0, flex: 1, overflow: "hidden", display: "flex" }}>
        <Box sx={{ minWidth: 0, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>{workspaceContent}</Box>
        <MockHelpDrawer />
      </Box>
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
  grpcEndpoint,
  runtimeActions,
  webRunning,
  webEndpoint,
  restRunning,
  restEndpoint,
  websocketRunning,
  websocketEndpoint,
  onToggle,
  onOpenSettings,
  onDetach,
}: {
  grpcRunning: boolean;
  grpcEndpoint: string;
  runtimeActions: Partial<Record<"grpc" | "web" | "rest" | "websocket", "start" | "stop">>;
  webRunning: boolean;
  webEndpoint: string;
  restRunning: boolean;
  restEndpoint: string;
  websocketRunning: boolean;
  websocketEndpoint: string;
  onToggle: (kind: "grpc" | "web" | "rest" | "websocket", checked: boolean) => void;
  onOpenSettings: () => void;
  onDetach?: () => void;
}) {
  const items = [
    { kind: "grpc" as const, label: "gRPC Mock", endpoint: grpcEndpoint, checked: grpcRunning, pending: runtimeActions.grpc },
    { kind: "web" as const, label: "Web Access", endpoint: webEndpoint, checked: webRunning, pending: runtimeActions.web },
    { kind: "rest" as const, label: "REST Mock", endpoint: restEndpoint, checked: restRunning, pending: runtimeActions.rest },
    { kind: "websocket" as const, label: "WebSocket Mock", endpoint: websocketEndpoint, checked: websocketRunning, pending: runtimeActions.websocket },
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
          <Typography variant="caption" color={item.checked ? "text.primary" : "text.secondary"} title={item.endpoint}>
            {item.label}
          </Typography>
        </Stack>
      ))}
      <Box sx={{ flex: 1 }} />
      {onDetach ? (
        <Tooltip title="Open Mocking in a separate window">
          <Button size="small" variant="text" startIcon={<OpenInNew sx={{ fontSize: 14 }} />} onClick={onDetach} sx={{ flexShrink: 0 }}>
            Detach
          </Button>
        </Tooltip>
      ) : null}
      <Button size="small" variant="text" startIcon={<HelpOutline sx={{ fontSize: 14 }} />} onClick={() => openMockHelp()} sx={{ flexShrink: 0 }}>
        Help
      </Button>
      <Button size="small" variant="outlined" startIcon={<Settings sx={{ fontSize: 14 }} />} onClick={onOpenSettings} sx={{ flexShrink: 0 }}>
        Mock settings
      </Button>
    </Stack>
  );
}

export function GrpcMockWorkspace({ ctx, initialTab = "scenarios", draftHandle }: { ctx: ViewContext; initialTab?: GrpcMockTab; draftHandle?: ScenarioDraftHandle }) {
  const {
    mockSelectedMethodKey,
    mockServer,
    mockServerStatus,
    protoLibraries,
    selectProtoLibraryVersion,
    setMockSelectedMethodKey,
    setMockServer,
    startMockServer,
    stopMockServer,
    startWebAccess,
    stopWebAccess,
    webAccessStatus,
  } = ctx;
  const [scenarioTotal, setScenarioTotal] = useState(0);
  const [scenarioCreateRequested, setScenarioCreateRequested] = useState(false);
  const handleScenarioCreateRequest = useCallback(() => setScenarioCreateRequested(false), []);
  const [tab, setTab] = useState<GrpcMockTab>(initialTab);
  const scenarioNavigation = useScenarioNavigation();
  useEffect(() => {
    if (!scenarioNavigation || (scenarioNavigation.methodKey && scenarioNavigation.methodKey !== mockSelectedMethodKey)) return;
    setTab("scenarios");
    setScenarioCreateRequested(scenarioNavigation.create);
    mockingUiStore.consumeScenarioNavigation(scenarioNavigation);
  }, [scenarioNavigation, mockSelectedMethodKey]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachLibraryId, setAttachLibraryId] = useState("");
  const [attachVersionId, setAttachVersionId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<GrpcMockSettingsPage>("server");
  const [nativeRuntimeAction, setNativeRuntimeAction] = useState<"start" | "stop" | null>(null);
  const [webRuntimeAction, setWebRuntimeAction] = useState<"start" | "stop" | null>(null);
  const openSettings = (page: GrpcMockSettingsPage) => {
    setSettingsPage(page);
    setSettingsOpen(true);
  };

  const sourceRefs = useMemo(
    () => resolveEffectiveMockProtoSources(mockServer.protoSources, protoLibraries),
    [mockServer.protoSources, protoLibraries],
  );
  const { summary, methods } = useMockCatalog();
  const protoRuntimeRegistry: ProtoRuntimeRegistry | undefined = ctx.protoRuntimeRegistry;
  const getScenarioExamples = useCallback((method: MockCatalogMethodInput): ScenarioExamples | null => {
    try {
      const root = protoRuntimeRegistry?.resolveVersion(method.libraryId, method.versionId)?.loaded.root;
      if (!root) return null;
      return { request: safeGenerateExample(root, method.requestType), response: safeGenerateExample(root, method.responseType) };
    } catch {
      return null;
    }
  }, [protoRuntimeRegistry]);

  const nativeRunning = Boolean(mockServerStatus.running);
  const webRunning = Boolean(webAccessStatus?.running);
  const nativeIssues = [
    !ctx.workspaceFolderPath ? "Open or save a workspace" : "",
    sourceRefs.length === 0 ? "Import a Proto schema" : "",
  ].filter(Boolean);
  const canStartNative = nativeIssues.length === 0;
  const canStartWeb = sourceRefs.length > 0;
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
    setMockServer((current: MockServerProject) => ({
      ...current,
      // Removing a pin returns this library to the automatic workspace-default revision.
      // Method bindings/scenarios stay intact and are revalidated against the effective schema.
      protoSources: (current.protoSources ?? []).filter((item) => item.libraryId !== source.libraryId),
      updatedAt: new Date().toISOString(),
    }));
  }

  async function toggleGrpcRuntime(): Promise<void> {
    if (nativeRuntimeAction || (!nativeRunning && !canStartNative)) return;
    setNativeRuntimeAction(nativeRunning ? "stop" : "start");
    try {
      if (nativeRunning) await stopMockServer();
      else await startMockServer();
    } finally {
      setNativeRuntimeAction(null);
    }
  }

  async function toggleWebRuntime(): Promise<void> {
    if (webRuntimeAction || (!webRunning && !canStartWeb)) return;
    setWebRuntimeAction(webRunning ? "stop" : "start");
    try {
      if (webRunning) await stopWebAccess();
      else await startWebAccess();
    } finally {
      setWebRuntimeAction(null);
    }
  }

  const focusedMethod = tab === "scenarios" && isScenarioMethodKey(mockSelectedMethodKey);
  return (
    <WorkspaceFrame title="gRPC" description="Mock gRPC methods from your proto files. Native gRPC serves apps and services; Web Access serves browsers." focused={focusedMethod}>
      <Stack spacing={focusedMethod ? 0 : 1} sx={{ minHeight: 0, flex: 1 }}>
        {!focusedMethod && <>
        <GrpcGettingStarted steps={[
          {
            id: "schema",
            title: "Import a proto schema",
            hint: summary.totalMethods > 0 ? `${summary.totalMethods} methods loaded` : "Methods appear in the Mocking sidebar after import",
            done: sourceRefs.length > 0 || summary.totalMethods > 0,
            action: { label: "Open Schemas", onClick: () => ctx.setSideSection?.("proto-schemas") },
          },
          {
            id: "scenario",
            title: "Create your first scenario",
            hint: "Start from a template generated from the proto",
            done: scenarioTotal > 0,
            action: { label: "New scenario", icon: <Add sx={{ fontSize: 15 }} />, onClick: () => { setTab("scenarios"); setScenarioCreateRequested(true); } },
          },
          {
            id: "server",
            title: "Start the native gRPC server",
            hint: nativeIssues.length ? nativeIssues.join(" · ") : nativeEndpoint,
            done: nativeRunning,
            action: { label: "Start", icon: <PlayArrow sx={{ fontSize: 15 }} />, disabled: !canStartNative || nativeRuntimeAction !== null, onClick: () => void toggleGrpcRuntime() },
          },
        ]} />
        <Stack direction={{ xs: "column", lg: "row" }} spacing={0.8}>
          <RuntimeCard
            title="Native gRPC"
            icon={<Storage sx={{ fontSize: 16 }} />}
            running={nativeRunning}
            statusLabel={nativeRunning && mockServerStatus.runtimeSource === "cli" ? "Running · CLI" : nativeRunning ? "Running" : "Stopped"}
            endpoint={nativeEndpoint}
            detail={`${summary.totalMethods} methods · ${scenarioTotal} scenarios`}
            issues={nativeIssues}
            pending={nativeRuntimeAction}
            canStart={canStartNative}
            settingsLabel="Open Native gRPC settings"
            onSettings={() => openSettings("server")}
            onToggle={() => void toggleGrpcRuntime()}
          />
          <RuntimeCard
            title="Web Access"
            icon={<Language sx={{ fontSize: 16 }} />}
            running={webRunning}
            statusLabel={webRunning ? "Running" : "Stopped"}
            badges={webConfig?.security?.type === "tls" ? <Chip size="small" variant="outlined" label="HTTPS · HTTP/2" /> : null}
            endpoint={browserUrl}
            detail={`gRPC-Web for browsers → ${nativeEndpoint}`}
            issues={canStartWeb ? [] : ["Import a Proto schema"]}
            pending={webRuntimeAction}
            canStart={canStartWeb}
            settingsLabel="Open Web Access settings"
            onSettings={() => openSettings("web-server")}
            onToggle={() => void toggleWebRuntime()}
          />
        </Stack>

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
        </>}

        <Box sx={{ minHeight: 0, flex: 1 }}>
          {tab === "scenarios" ? (
            <FileBasedGrpcScenarios key={ctx.workspaceFolderPath || ""}
              directoryPath={ctx.workspaceFolderPath || ""} selectedMethodKey={mockSelectedMethodKey}
              onShowAll={() => setMockSelectedMethodKey(grpcMockOverviewMethodKey)}
              methods={methods} runtimeStatus={mockServerStatus} createRequested={scenarioCreateRequested} onCreateRequestHandled={handleScenarioCreateRequest}
              gatewayProfileId={mockServer.activeGatewayProfileId || "default-gateway"}
              getExamples={getScenarioExamples}
              onIndexChange={setScenarioTotal} draftHandle={draftHandle} />
          ) : tab === "proto" ? (
            <ProtoSourcesPanel
              ctx={ctx}
              sources={sourceRefs}
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
                setScenarioCreateRequested(true);
                // Scenario creation is exclusively managed by the canonical v3 editor.
                setTab("scenarios");
              }}
            />
          ) : tab === "web-access" ? (
            <WebAccessPanel ctx={ctx} onOpenSettings={() => openSettings("web-server")} />
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
  onSaveAndRestart: (next: MockServerProject) => Promise<void> | undefined;
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
      <DialogTitle>Mock settings</DialogTitle>
      <DialogContent sx={{ height: "min(72vh, 620px)", overflow: "hidden" }}>
        <Stack direction="row" spacing={1.2} sx={{ height: "100%", minHeight: 0, pt: 0.25 }}>
          <Stack
            spacing={0.35}
            sx={{ width: 160, flexShrink: 0, overflowY: "auto" }}
            role="tablist"
            aria-label="Mock settings sections"
          >
            {GRPC_MOCK_SETTINGS_PAGES.map(({ value, label }) => (
              <Button
                key={value}
                size="small"
                role="tab"
                aria-selected={page === value}
                variant={page === value ? "contained" : "text"}
                onClick={() => onPageChange(value)}
                sx={{ justifyContent: "flex-start" }}
              >
                {label}
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
                  <Typography variant="h6">Web Access</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Browser-facing gRPC-Web listener used by Web Access. It forwards calls to the native gRPC mock.
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
                                  patchWeb({ security: { type: "insecure" } });
                                }
                              }}
                            >
                              <MenuItem value="insecure">HTTP</MenuItem>
                              <MenuItem value="tls">HTTPS</MenuItem>
                            </Select>
                          </FormControl>
                          {web.security?.type === "tls" && Number(web.port) !== 8443 ? (
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <Typography variant="caption" color="text.secondary">Recommended HTTPS port: 8443</Typography>
                              <Button size="small" variant="text" onClick={() => patchWeb({ port: 8443 })}>Use 8443</Button>
                            </Stack>
                          ) : null}
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
  onAttach,
  onDetach,
  onCreateScenario,
}: {
  ctx: ViewContext;
  sources: MockProtoSource[];
  onAttach: () => void;
  onDetach: (source: MockProtoSource) => void;
  onCreateScenario: (item: AttachedMethod) => void;
}) {
  const {
    mockSelectedMethodKey,
    mockServer,
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
    ? protoRuntimeRegistry.getVersion(selectedSource.libraryId, selectedSource.versionId)
    : null;
  const selectedVersion = selectedCompiled?.version;
  const [methodCatalog, setMethodCatalog] = useState<{
    version: typeof selectedVersion;
    methods: RpcMethodInfo[];
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!selectedVersion) return;
    const controller = new AbortController();
    void readProtoCatalog(selectedVersion, controller.signal).then(
      (methods) => {
        if (!controller.signal.aborted) setMethodCatalog({ version: selectedVersion, methods });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setMethodCatalog({ version: selectedVersion, methods: [], error: String(error) });
      },
    );
    return () => controller.abort();
  }, [selectedVersion]);
  const selectedMethods = useMemo<AttachedMethod[]>(() => {
    if (!selectedSource || !methodCatalog || methodCatalog.version !== selectedVersion) return [];
    return methodCatalog.methods.map((method) => ({ source: selectedSource, method }));
  }, [methodCatalog, selectedSource, selectedVersion]);
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
    setMockServer((current: MockServerProject) => {
      const currentSources = current.protoSources ?? [];
      const hasLibraryPin = currentSources.some((item) => item.libraryId === source.libraryId);
      return {
      ...current,
      protoSources: hasLibraryPin
        ? currentSources.map((item) =>
            item.libraryId === source.libraryId ? { ...item, versionId: nextVersionId } : item,
          )
        : [...currentSources, { libraryId: source.libraryId, versionId: nextVersionId }],
      methodBindings: Object.fromEntries(
        Object.entries(current.methodBindings ?? {}).map(([key, binding]: [string, any]) => [
          key,
          binding.libraryId === source.libraryId && binding.versionId === source.versionId
            ? { ...binding, versionId: nextVersionId }
            : binding,
        ]),
      ),
      updatedAt: new Date().toISOString(),
      };
    });
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
          <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="space-between" sx={{ mb: 0.7 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1">Proto</Typography>
              <Typography variant="caption" color="text.secondary">
                Synced automatically from workspace Proto Schemas.
              </Typography>
            </Box>
            <Button size="small" onClick={onAttach} startIcon={<Add />}>
              Attach
            </Button>
          </Stack>
          {sources.length === 0 ? (
            <EmptyCard title="No Proto schema" body="Import a schema in Proto Schemas; Mocking will pick it up automatically." />
          ) : (
            <Stack spacing={0.5}>
              {sources.map((source) => {
                const compiled = protoRuntimeRegistry.getVersion(source.libraryId, source.versionId);
                const key = `${source.libraryId}:${source.versionId}`;
                const pinned = (mockServer.protoSources ?? []).some((item: MockProtoSource) => item.libraryId === source.libraryId);
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
                          {compiled?.version.version ?? source.versionId} · {scenarioCount} used · {pinned ? "pinned" : "auto"}
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
            <EmptyCard title="Select Proto" body="Choose a workspace Proto schema." />
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

              {methodCatalog?.version === selectedVersion && methodCatalog?.error ? (
                <Alert severity="error">{methodCatalog.error}</Alert>
              ) : methodCatalog?.version !== selectedVersion ? (
                <Typography color="text.secondary">Indexing Proto methods…</Typography>
              ) : selectedMethodGroups.length === 0 ? (
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
                        // Proto method browsing must never load or parse the scenario bodies.
                        // Runtime activation is managed explicitly in the Scenarios tab.
                        const unsupportedReason = item.method.requestStream
                          ? "Client-streaming and bidirectional-streaming mocks are not supported yet."
                          : "";
                        const errorDetail = unsupportedReason;

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
          disabled={
            !sourceMenu ||
            !(mockServer.protoSources ?? []).some((item: MockProtoSource) => item.libraryId === sourceMenu.source.libraryId)
          }
          onClick={() => {
            if (sourceMenu) onDetach(sourceMenu.source);
            setSourceMenu(null);
          }}
        >
          Use automatic revision
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
