"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  InputAdornment,
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
  Delete,
  Edit,
  Folder,
  MockServer,
  MoreHoriz,
  PlayArrow,
  Refresh,
  Search,
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
import { testHttpsEndpoint } from "../../shared/certificate-settings";
import {
  buildDefaultMockScenario,
  ensureUniqueMockScenarioId,
  formatMockScenarioBundle,
  formatSingleMockScenarioForEditor,
  getMockMethodScenarioFile,
  parseMockScenarioText,
  parseSingleMockScenarioText,
  saveMockScenarioForMethod,
  updateMockMethodScenarioFile,
} from "../mock-server/mock-scenario-model";
import { methodKey } from "../../shared/rpc-method-utils";
import { uiCopy } from "../../shared/ui-copy";
import { mockScenarioDisplayName, rpcMethodKindLabel } from "../mock-server/mock-scenario-ui";
import type { MockFormat, MockScenario, MockServerProject, MockProtoSource } from "../../shared/workbench-types";

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

const webAccessSectionSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 2.5,
  p: { xs: 1.25, sm: 1.75 },
  bgcolor: "background.paper",
} as const;

type ViewContext = Record<string, any>;
type GrpcMockTab = "scenarios" | "proto" | "web-access" | "activity";
type GrpcMockActivityView = "requests" | "logs";
type GrpcMockSettingsPage = "server" | "security" | "defaults" | "advanced";
const grpcMockTabs = ["scenarios", "proto", "web-access", "activity"] as const;
const grpcMockActivityTabs = ["requests", "logs"] as const;
type AttachedMethod = {
  source: MockProtoSource;
  library: any;
  version: any;
  root: any;
  method: RpcMethodInfo;
};
export type GrpcMockScenarioRow = AttachedMethod & { scenario: MockScenario; enabled: boolean; selected: boolean };
type ScenarioRow = GrpcMockScenarioRow;
type ScenarioMethodGroup = AttachedMethod & {
  scenarios: ScenarioRow[];
  activeScenario: ScenarioRow | null;
  enabled: boolean;
  errorDetail: string;
};
type ScenarioServiceGroup = { serviceName: string; methods: ScenarioMethodGroup[] };
type ScenarioProtoGroup = {
  source: MockProtoSource;
  library: any;
  version: any;
  services: ScenarioServiceGroup[];
  methodCount: number;
  scenarioCount: number;
};
type ScenarioActionMenu = {
  anchor: HTMLElement;
  method: ScenarioMethodGroup;
  scenario: ScenarioRow | null;
};

export function ServicesWorkspace({ ctx }: { ctx: ViewContext }) {
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
  const [protocolTab, setProtocolTab] = useState<"scenarios" | "activity">("scenarios");

  if (serviceProtocol === "grpc-mock" || serviceProtocol === "web-access") {
    return <GrpcMockWorkspace ctx={ctx} initialTab={serviceProtocol === "web-access" ? "web-access" : "scenarios"} />;
  }

  const isRest = serviceProtocol === "rest";
  const protocolStatus = isRest ? restMockStatus : wsMockStatus;
  return (
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
        bordered={false}
        className="mb-2 p-0"
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
}

export function GrpcMockWorkspace({ ctx, initialTab = "scenarios" }: { ctx: ViewContext; initialTab?: GrpcMockTab }) {
  const {
    addMockScenarioForMethod,
    handleMockMethodEnabledChange,
    handleMockScenarioSelectChange,
    mockSelectedMethod,
    mockServer,
    mockServerStatus,
    mockScenarioEditorDirty,
    fetchMockScenarioFilesFromWorkspace,
    openMockScenarioFolder,
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
  const [tab, setTab] = useState<GrpcMockTab>(initialTab);
  const [activityView, setActivityView] = useState<GrpcMockActivityView>("requests");
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newMethodKey, setNewMethodKey] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachLibraryId, setAttachLibraryId] = useState("");
  const [attachVersionId, setAttachVersionId] = useState("");
  const [pendingCreate, setPendingCreate] = useState<AttachedMethod | null>(null);
  const [scenarioMenu, setScenarioMenu] = useState<ScenarioActionMenu | null>(null);
  const [managedMethodKey, setManagedMethodKey] = useState("");
  const [focusedScenarioKey, setFocusedScenarioKey] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<GrpcMockSettingsPage>("server");
  const [scenarioEditorDirty, setScenarioEditorDirty] = useState(false);
  const [scenarioEditorOpen, setScenarioEditorOpen] = useState(false);
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
    return rows.sort((a, b) =>
      `${a.method.serviceName}/${a.method.methodName}`.localeCompare(`${b.method.serviceName}/${b.method.methodName}`),
    );
  }, [sourceRefs, protoRuntimeRegistry]);

  const mockableMethods = useMemo(
    () => attachedMethods.filter((item) => !item.method.requestStream),
    [attachedMethods],
  );

  const allScenarioRows = useMemo<ScenarioRow[]>(() => {
    const rows: ScenarioRow[] = [];
    for (const item of attachedMethods) {
      const key = methodKey(item.method);
      const file = getMockMethodScenarioFile(mockServer, item.method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, mockServer.port);
      if (!parsed.ok) continue;
      const methodScenarios = parsed.bundle.scenarios.filter(
        (value) => value.service === item.method.serviceName && value.method === item.method.methodName,
      );
      const persistedScenarioId = mockServer.selectedScenarioIds[key];
      const effectiveScenarioId = methodScenarios.some((scenario) => scenario.id === persistedScenarioId)
        ? persistedScenarioId
        : methodScenarios[0]?.id;
      for (const scenario of methodScenarios) {
        rows.push({
          ...item,
          scenario,
          enabled: mockServer.enabledMethods[key] !== false,
          selected: effectiveScenarioId === scenario.id,
        });
      }
    }
    return rows.sort((a, b) => {
      const methodCompare = `${a.method.serviceName}/${a.method.methodName}`.localeCompare(
        `${b.method.serviceName}/${b.method.methodName}`,
      );
      return methodCompare || a.scenario.id.localeCompare(b.scenario.id);
    });
  }, [attachedMethods, mockServer]);

  const allScenarioProtoGroups = useMemo<ScenarioProtoGroup[]>(() => {
    return sourceRefs
      .map((source) => {
        const sourceMethods = attachedMethods.filter(
          (item) => item.source.libraryId === source.libraryId && item.source.versionId === source.versionId,
        );
        const serviceMap = new Map<string, ScenarioMethodGroup[]>();
        let scenarioCount = 0;

        for (const item of sourceMethods) {
          const key = methodKey(item.method);
          const scenarios = allScenarioRows.filter(
            (row) =>
              row.source.libraryId === source.libraryId &&
              row.source.versionId === source.versionId &&
              methodKey(row.method) === key,
          );
          scenarioCount += scenarios.length;
          const file = getMockMethodScenarioFile(mockServer, item.method);
          const parsed = parseMockScenarioText(file.scenarioText, file.format, mockServer.port);
          const unsupportedReason = item.method.requestStream
            ? "Client-streaming and bidirectional-streaming mocks are not supported yet."
            : "";
          const invalidScenarioReason = parsed.ok
            ? ""
            : `${file.format.toUpperCase()} scenario file is invalid. ${parsed.error}`;
          const methods = serviceMap.get(item.method.serviceName) ?? [];
          methods.push({
            ...item,
            scenarios,
            activeScenario: scenarios.find((row) => row.selected) ?? null,
            enabled: mockServer.enabledMethods[key] !== false,
            errorDetail: unsupportedReason || invalidScenarioReason,
          });
          serviceMap.set(item.method.serviceName, methods);
        }

        return {
          source,
          library: sourceMethods[0]?.library,
          version: sourceMethods[0]?.version,
          services: [...serviceMap.entries()].map(([serviceName, methods]) => ({ serviceName, methods })),
          methodCount: sourceMethods.length,
          scenarioCount,
        };
      })
      .filter((group) => group.methodCount > 0);
  }, [allScenarioRows, attachedMethods, mockServer, sourceRefs]);

  const scenarioProtoGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return allScenarioProtoGroups;

    return allScenarioProtoGroups
      .map((proto) => {
        const protoMatches = `${proto.library?.name ?? ""} ${proto.version?.version ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
        const services = proto.services
          .map((service) => {
            const serviceMatches = service.serviceName.toLowerCase().includes(normalizedQuery);
            const methods = service.methods.filter((method) => {
              if (protoMatches || serviceMatches) return true;
              const scenarioSearch = method.scenarios
                .map(
                  (row) =>
                    `${row.scenario.id} ${row.scenario.description ?? ""} ${mockScenarioDisplayName(row.scenario, row.method)}`,
                )
                .join(" ");
              return `${method.method.methodName} ${rpcMethodKindLabel(method.method)} ${scenarioSearch}`
                .toLowerCase()
                .includes(normalizedQuery);
            });
            return { ...service, methods };
          })
          .filter((service) => service.methods.length > 0);
        return { ...proto, services };
      })
      .filter((proto) => proto.services.length > 0);
  }, [allScenarioProtoGroups, query]);

  const visibleMethodCount = useMemo(
    () =>
      scenarioProtoGroups.reduce(
        (total, proto) =>
          total + proto.services.reduce((serviceTotal, service) => serviceTotal + service.methods.length, 0),
        0,
      ),
    [scenarioProtoGroups],
  );

  const managedMethod = useMemo(
    () =>
      allScenarioProtoGroups
        .flatMap((proto) => proto.services)
        .flatMap((service) => service.methods)
        .find((method) => methodKey(method.method) === managedMethodKey) ?? null,
    [allScenarioProtoGroups, managedMethodKey],
  );

  const selectedScenarioRow = useMemo(
    () =>
      allScenarioRows.find((row) => `${methodKey(row.method)}:${row.scenario.id}` === focusedScenarioKey) ??
      allScenarioRows.find((row) => row.selected) ??
      allScenarioRows[0] ??
      null,
    [allScenarioRows, focusedScenarioKey],
  );

  useEffect(() => {
    if (tab === "web-access" || !mockSelectedMethod) return;
    const selectedKey = methodKey(mockSelectedMethod);
    const matchingRows = allScenarioRows.filter((row) => methodKey(row.method) === selectedKey);
    if (matchingRows.length > 0) {
      setFocusedScenarioKey((currentKey) => {
        const currentStillExists = matchingRows.some(
          (row) => `${methodKey(row.method)}:${row.scenario.id}` === currentKey,
        );
        if (currentStillExists) return currentKey;
        const persistedScenarioId = mockServer.selectedScenarioIds[selectedKey];
        const preferred =
          matchingRows.find((row) => row.scenario.id === persistedScenarioId) ??
          matchingRows.find((row) => row.selected) ??
          matchingRows[0];
        return `${methodKey(preferred.method)}:${preferred.scenario.id}`;
      });
      setTab("scenarios");
      return;
    }
    const attached = mockableMethods.find((item) => methodKey(item.method) === selectedKey);
    if (attached) {
      setNewMethodKey(selectedKey);
      setTab("scenarios");
      return;
    }
    setTab("proto");
  }, [mockSelectedMethod, allScenarioRows, mockableMethods, mockServer.selectedScenarioIds]);

  useEffect(() => {
    if (!pendingCreate || !mockSelectedMethod || methodKey(mockSelectedMethod) !== methodKey(pendingCreate.method))
      return;
    addMockScenarioForMethod(mockSelectedMethod);
    setPendingCreate(null);
    setNewOpen(false);
    setTab("scenarios");
  }, [pendingCreate, mockSelectedMethod, addMockScenarioForMethod]);

  const requestLogs = mockServerStatus.requestLog ?? [];
  const selectedRequest = requestLogs.find((item: any) => item.id === selectedRequestId) ?? requestLogs[0] ?? null;

  function selectAttachedMethod(item: AttachedMethod, scenarioId?: string) {
    const nextKey = scenarioId ? `${methodKey(item.method)}:${scenarioId}` : "";
    selectProtoLibraryVersion(item.source.libraryId, item.source.versionId);
    setMockSelectedMethodKey(methodKey(item.method));
    if (scenarioId) setFocusedScenarioKey(nextKey);
    return true;
  }

  function openScenarioEditor(row: ScenarioRow) {
    selectAttachedMethod(row, row.scenario.id);
    setScenarioEditorDirty(false);
    setScenarioEditorOpen(true);
  }

  function closeScenarioEditor() {
    if (scenarioEditorDirty && !window.confirm("Discard unsaved scenario changes?")) return;
    setScenarioEditorDirty(false);
    setScenarioEditorOpen(false);
  }

  function createScenario(item: AttachedMethod) {
    if (item.method.requestStream) return;
    selectAttachedMethod(item);
    setPendingCreate(item);
  }

  function saveScenario(row: ScenarioRow, nextScenario: MockScenario, format?: MockFormat) {
    const saved = saveMockScenarioForMethod(mockServer, row.method, row.scenario.id, nextScenario, format);
    if (!saved) return;
    setMockServer(saved.project);
    setFocusedScenarioKey(`${methodKey(row.method)}:${saved.scenario.id}`);
    setScenarioEditorDirty(false);
  }

  function setScenarioActive(row: ScenarioRow, active: boolean) {
    if (active) {
      selectAttachedMethod(row, row.scenario.id);
      handleMockScenarioSelectChange(row.method, row.scenario.id);
      handleMockMethodEnabledChange(row.method, true);
      setFocusedScenarioKey(`${methodKey(row.method)}:${row.scenario.id}`);
      return;
    }
    if (row.selected) handleMockMethodEnabledChange(row.method, false);
  }

  function openScenarioActions(anchor: HTMLElement, method: ScenarioMethodGroup) {
    setScenarioMenu({ anchor, method, scenario: method.activeScenario });
  }

  function manageScenarios(method: ScenarioMethodGroup) {
    selectProtoLibraryVersion(method.source.libraryId, method.source.versionId);
    setMockSelectedMethodKey(methodKey(method.method));
    setManagedMethodKey(methodKey(method.method));
  }

  function selectScenarioFromMethod(method: ScenarioMethodGroup, scenarioId: string) {
    const row = method.scenarios.find((scenario) => scenario.scenario.id === scenarioId);
    if (!row) return;

    const key = methodKey(method.method);
    selectProtoLibraryVersion(method.source.libraryId, method.source.versionId);
    setMockSelectedMethodKey(key);
    setFocusedScenarioKey(`${key}:${scenarioId}`);
    setMockServer((current: MockServerProject) => ({
      ...current,
      selectedScenarioIds: {
        ...current.selectedScenarioIds,
        [key]: scenarioId,
      },
      enabledMethods: {
        ...current.enabledMethods,
        [key]: true,
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  function attachSource() {
    const library = protoLibraries.find((item: any) => item.id === attachLibraryId);
    const version = library?.versions?.find((item: any) => item.id === attachVersionId);
    if (!library || !version) return;
    setMockServer((current: MockServerProject) => ({
      ...current,
      protoSources: [
        ...(current.protoSources ?? []).filter((item) => item.libraryId !== library.id),
        { libraryId: library.id, versionId: version.id },
      ],
      methodBindings: Object.fromEntries(
        Object.entries(current.methodBindings ?? {}).map(([key, binding]: [string, any]) => [
          key,
          binding.libraryId === library.id ? { ...binding, versionId: version.id } : binding,
        ]),
      ),
      updatedAt: new Date().toISOString(),
    }));
    selectProtoLibraryVersion(library.id, version.id);
    setAttachOpen(false);
  }

  function detachSource(source: MockProtoSource) {
    const scenarioCount = allScenarioRows.filter(
      (row) => row.source.libraryId === source.libraryId && row.source.versionId === source.versionId,
    ).length;
    if (scenarioCount > 0) {
      window.alert(
        `This Proto is used by ${scenarioCount} scenario${scenarioCount === 1 ? "" : "s"}. Delete or migrate those scenarios before detaching it.`,
      );
      return;
    }
    setMockServer((current: MockServerProject) => ({
      ...current,
      protoSources: (current.protoSources ?? []).filter(
        (item) => !(item.libraryId === source.libraryId && item.versionId === source.versionId),
      ),
      methodBindings: Object.fromEntries(
        Object.entries(current.methodBindings ?? {}).filter(
          ([, binding]: [string, any]) =>
            !(binding.libraryId === source.libraryId && binding.versionId === source.versionId),
        ),
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  function duplicateScenario(row: ScenarioRow) {
    let duplicatedId = "";
    setMockServer((current: MockServerProject) => {
      const file = getMockMethodScenarioFile(current, row.method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      if (!parsed.ok) return current;
      const scenarios = parsed.bundle.scenarios.filter(
        (item) => item.service === row.method.serviceName && item.method === row.method.methodName,
      );
      const used = new Set(scenarios.map((item) => item.id));
      let id = `${row.scenario.id}-copy`;
      let index = 2;
      while (used.has(id)) id = `${row.scenario.id}-copy-${index++}`;
      duplicatedId = id;
      const clone = {
        ...row.scenario,
        id,
        description: row.scenario.description ? `${row.scenario.description} (copy)` : "Copied scenario",
      };
      const next = updateMockMethodScenarioFile(current, row.method, {
        scenarioText: formatMockScenarioBundle({ ...parsed.bundle, scenarios: [clone, ...scenarios] }, file.format),
      });
      const key = methodKey(row.method);
      return {
        ...next,
        selectedScenarioIds: { ...next.selectedScenarioIds, [key]: id },
        enabledMethods: { ...next.enabledMethods, [key]: true },
      };
    });
    selectAttachedMethod(row, duplicatedId || row.scenario.id);
  }

  function deleteScenario(row: ScenarioRow) {
    if (!window.confirm(`Delete scenario “${row.scenario.id}”?`)) return;
    setMockServer((current: MockServerProject) => {
      const file = getMockMethodScenarioFile(current, row.method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      if (!parsed.ok) return current;
      const remaining = parsed.bundle.scenarios.filter((item) => item.id !== row.scenario.id);
      const next = updateMockMethodScenarioFile(current, row.method, {
        scenarioText: formatMockScenarioBundle({ ...parsed.bundle, scenarios: remaining }, file.format),
      });
      const key = methodKey(row.method);
      const methodRemaining = remaining.filter(
        (item) => item.service === row.method.serviceName && item.method === row.method.methodName,
      );
      const selectedScenarioIds = { ...next.selectedScenarioIds };
      if (selectedScenarioIds[key] === row.scenario.id) {
        if (methodRemaining[0]) selectedScenarioIds[key] = methodRemaining[0].id;
        else delete selectedScenarioIds[key];
      }
      return {
        ...next,
        selectedScenarioIds,
        enabledMethods: {
          ...next.enabledMethods,
          [key]: methodRemaining.length > 0 && next.enabledMethods[key] !== false,
        },
      };
    });
  }

  function createScenarioFromRequest(log: any) {
    const item = attachedMethods.find(
      (value) => value.method.serviceName === log?.serviceName && value.method.methodName === log?.methodName,
    );
    if (!item) return;
    let createdScenarioId = "";
    setMockServer((current: MockServerProject) => {
      const file = getMockMethodScenarioFile(current, item.method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      if (!parsed.ok) return current;
      const methodScenarios = parsed.bundle.scenarios.filter(
        (scenario) => scenario.service === item.method.serviceName && scenario.method === item.method.methodName,
      );
      const requestJson = JSON.stringify(log?.request ?? {}, null, 2);
      const scenario = ensureUniqueMockScenarioId(
        buildDefaultMockScenario(item.method, item.root, methodScenarios.length, requestJson, current.streamDefaults),
        methodScenarios,
      );
      createdScenarioId = scenario.id;
      const next = updateMockMethodScenarioFile(current, item.method, {
        scenarioText: formatMockScenarioBundle(
          { ...parsed.bundle, scenarios: [scenario, ...methodScenarios] },
          file.format,
        ),
      });
      const key = methodKey(item.method);
      return {
        ...next,
        selectedScenarioIds: { ...next.selectedScenarioIds, [key]: scenario.id },
        enabledMethods: { ...next.enabledMethods, [key]: true },
      };
    });
    selectAttachedMethod(item, createdScenarioId || undefined);
    setTab("scenarios");
  }

  const activeScenarioRows = allScenarioRows.filter((row) => row.enabled && row.selected);
  const nativeStartIssues = [
    sourceRefs.length === 0 ? "Attach a Proto" : "",
    allScenarioRows.length === 0 ? "Create a scenario" : "",
    activeScenarioRows.length === 0 ? "Select an active scenario" : "",
    mockScenarioEditorDirty ? "Save mock scenario" : "",
  ].filter(Boolean);
  const runMode = mockServer.runMode === "web-access" ? "web-access" : "native";
  const activeWebProfile =
    mockServer.gatewayProfiles?.find((item: any) => item.id === mockServer.activeGatewayProfileId) ??
    mockServer.gatewayProfiles?.[0];
  const webConfig = activeWebProfile?.web;
  const webTargetMode = activeWebProfile?.webUpstreamMode === "custom" ? "custom" : "local-mock";
  const customWebTarget = activeWebProfile?.upstreams?.[0]?.target?.trim?.() ?? "";
  const webSetupRequired = !activeWebProfile || !webConfig || (webTargetMode === "custom" && !customWebTarget);
  const nativeRunning = Boolean(mockServerStatus.running);
  const webRunning = Boolean(webAccessStatus?.running);
  const runModeRunning = runMode === "web-access" ? webRunning : nativeRunning;
  const nativeEndpoint = `${mockServer.bindHost}:${mockServerStatus.port ?? mockServer.port}`;
  const browserHost = ["0.0.0.0", "::", "[::]"].includes(webConfig?.host ?? "")
    ? "localhost"
    : (webConfig?.host ?? "127.0.0.1");
  const browserUrl =
    webAccessStatus?.url ??
    `${webConfig?.security?.type === "tls" ? "https" : "http"}://${browserHost}:${webConfig?.port ?? 8080}`;
  const webTarget =
    webTargetMode === "custom" ? customWebTarget || "Not configured" : (mockServerStatus.localTarget ?? nativeEndpoint);
  const runModeEndpoint = runMode === "web-access" ? `${browserUrl} → ${webTarget}` : nativeEndpoint;
  const webStartIssues = [
    sourceRefs.length === 0 ? "Attach a Proto" : "",
    attachedMethods.length === 0 ? "Use a Proto with RPC methods" : "",
    webTargetMode === "local-mock" && allScenarioRows.length === 0 ? "Create a scenario" : "",
    webTargetMode === "local-mock" && activeScenarioRows.length === 0 ? "Select an active scenario" : "",
    mockScenarioEditorDirty ? "Save mock scenario" : "",
    webSetupRequired ? "Set up Web Access" : "",
  ].filter(Boolean);
  const runModeIssues = runMode === "web-access" ? webStartIssues : nativeStartIssues;
  const canStartRuntime = runModeIssues.length === 0;
  const runtimeSetupRequired = runMode === "web-access" && webSetupRequired;
  const runtimeStatusLabel =
    runtimeAction === "start"
      ? "Starting"
      : runtimeAction === "stop"
        ? "Stopping"
        : runModeRunning
          ? "Running"
          : "Stopped";
  const runtimeActionLabel =
    runtimeAction === "start"
      ? "Starting…"
      : runtimeAction === "stop"
        ? "Stopping…"
        : runModeRunning
          ? "Stop"
          : runtimeSetupRequired
            ? "Set up"
            : "Start";

  function requestWebAccessSection(tab: "overview" | "logs" | "settings") {
    setWebAccessSectionRequest((current) => ({ id: current.id + 1, tab }));
    setTab("web-access");
  }

  function changeRunMode(nextMode: "native" | "web-access") {
    if (runtimeAction || runModeRunning || nextMode === runMode) return;
    setMockServer((current: MockServerProject) => ({
      ...current,
      runMode: nextMode,
      updatedAt: new Date().toISOString(),
    }));
  }

  async function startRuntime() {
    if (runtimeAction || runModeRunning || !canStartRuntime || mockScenarioEditorDirty) return;
    setRuntimeAction("start");
    try {
      if (runMode === "web-access") await startWebAccess();
      else await startMockServer();
    } finally {
      setRuntimeAction(null);
    }
  }

  async function stopRuntime() {
    if (runtimeAction || !runModeRunning) return;
    setRuntimeAction("stop");
    try {
      if (runMode === "web-access") await stopWebAccess();
      else await stopMockServer();
    } finally {
      setRuntimeAction(null);
    }
  }

  function handleRuntimeAction() {
    if (runtimeSetupRequired && !runModeRunning) {
      requestWebAccessSection("settings");
      return;
    }
    if (runModeRunning) void stopRuntime();
    else void startRuntime();
  }

  return (
    <WorkspaceFrame title="gRPC" description="Run native gRPC mocks and expose them to browser clients.">
      <Stack spacing={1} sx={{ minHeight: 0, flex: 1 }}>
        <Paper variant="outlined" sx={{ px: 1, py: 0.8 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={0.8} alignItems={{ md: "center" }}>
            <Stack spacing={0.25} sx={{ width: { xs: "100%", md: 180 }, flexShrink: 0 }}>
              <Typography variant="caption" color="text.secondary">
                Run mode
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={runMode}
                  disabled={runModeRunning || runtimeAction !== null}
                  inputProps={{ "aria-label": "gRPC run mode" }}
                  onChange={(event: any) =>
                    changeRunMode(String(event.target.value) === "web-access" ? "web-access" : "native")
                  }
                >
                  <MenuItem value="native">Native gRPC</MenuItem>
                  <MenuItem value="web-access">Web access</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" spacing={0.65} alignItems="center" sx={{ minWidth: 0 }}>
                <Chip size="small" color={runModeRunning ? "success" : "default"} label={runtimeStatusLabel} />
                <Typography variant="body2" fontFamily="monospace" noWrap title={runModeEndpoint}>
                  {runModeEndpoint}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" noWrap>
                {runMode === "web-access"
                  ? webTargetMode === "custom"
                    ? "Browser bridge to a custom gRPC server"
                    : "Browser bridge backed by the local gRPC Mock"
                  : `${allScenarioRows.length} scenarios · ${sourceRefs.length} Proto${query.trim() ? ` · ${visibleMethodCount} methods` : ""}`}
              </Typography>
            </Box>

            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={{ flexShrink: 0, alignSelf: { xs: "flex-end", md: "center" } }}
            >
              <Tooltip title={runMode === "web-access" ? "Web access settings" : "gRPC Mock settings"}>
                <IconButton
                  aria-label={runMode === "web-access" ? "Open Web access settings" : "Open gRPC Mock settings"}
                  onClick={() => {
                    if (runMode === "web-access") requestWebAccessSection("settings");
                    else setSettingsOpen(true);
                  }}
                >
                  <Settings />
                </IconButton>
              </Tooltip>
              <Button
                size="small"
                color={runModeRunning ? "error" : "primary"}
                variant="contained"
                startIcon={runModeRunning || runtimeAction === "stop" ? <StopCircle /> : <PlayArrow />}
                disabled={runtimeAction !== null || (!runModeRunning && !runtimeSetupRequired && !canStartRuntime)}
                onClick={handleRuntimeAction}
                sx={{
                  minWidth: 112,
                  color: runModeRunning ? "error.contrastText" : undefined,
                  bgcolor: runModeRunning ? "error.main" : undefined,
                  boxShadow: "none",
                  "&:hover": runModeRunning
                    ? { color: "error.contrastText", bgcolor: "error.dark", boxShadow: "none" }
                    : { boxShadow: "none" },
                  "&:focus-visible": {
                    outline: "2px solid",
                    outlineColor: runModeRunning ? "error.light" : "primary.light",
                    outlineOffset: 2,
                  },
                }}
              >
                {runtimeActionLabel}
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {!runModeRunning && !canStartRuntime ? (
          <Alert
            severity="info"
            variant="outlined"
            action={
              <Button
                size="small"
                onClick={() => {
                  if (runtimeSetupRequired) requestWebAccessSection("settings");
                  else setTab(sourceRefs.length === 0 ? "proto" : "scenarios");
                }}
              >
                {runtimeSetupRequired ? "Set up" : sourceRefs.length === 0 ? "Attach Proto" : "Review"}
              </Button>
            }
          >
            Before starting: {runModeIssues.join(" · ")}
          </Alert>
        ) : null}

        <WorkbenchTabs
          value={tab}
          ariaLabel="gRPC sections"
          idPrefix="grpc-mock"
          bordered={false}
          className="p-0"
          items={grpcMockTabs.map((value) => ({
            value,
            label:
              value === "scenarios"
                ? "Methods"
                : value === "proto"
                  ? "Proto"
                  : value === "web-access"
                    ? "Web access"
                    : "Activity",
            count: value === "scenarios" ? attachedMethods.length : value === "proto" ? sourceRefs.length : undefined,
          }))}
          onValueChange={(value) => setTab(value as GrpcMockTab)}
        />

        {tab === "scenarios" && (
          <Box
            role="tabpanel"
            id="grpc-mock-panel-scenarios"
            aria-labelledby="grpc-mock-tab-scenarios"
            tabIndex={0}
            sx={{ minHeight: 0, flex: 1, overflow: "auto" }}
          >
            <Stack direction="row" spacing={0.6} sx={{ pb: 0.8 }}>
              <TextField
                size="small"
                fullWidth
                value={query}
                onChange={(event: any) => setQuery(event.target.value)}
                placeholder="Search Proto, method, or scenario"
                inputProps={{ "aria-label": "Search gRPC Mock methods and scenarios" }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search sx={{ fontSize: 15 }} />
                    </InputAdornment>
                  ),
                }}
              />
              <Tooltip title={uiCopy.actions.addScenario}>
                <IconButton
                  color="primary"
                  aria-label={uiCopy.actions.addScenario}
                  onClick={() => {
                    setNewMethodKey(
                      mockSelectedMethod &&
                        mockableMethods.some((item) => methodKey(item.method) === methodKey(mockSelectedMethod))
                        ? methodKey(mockSelectedMethod)
                        : mockableMethods[0]
                          ? methodKey(mockableMethods[0].method)
                          : "",
                    );
                    setNewOpen(true);
                  }}
                >
                  <Add />
                </IconButton>
              </Tooltip>
            </Stack>

            {scenarioProtoGroups.length === 0 ? (
              <EmptyCard
                title={query.trim() ? "No results" : "No Proto methods"}
                body={
                  query.trim()
                    ? "Try another search."
                    : sourceRefs.length
                      ? "The attached Proto revisions do not contain mockable methods."
                      : "Attach a Proto first."
                }
              />
            ) : (
              <Stack spacing={1} aria-label="gRPC Mock methods grouped by Proto">
                {scenarioProtoGroups.map((proto) => {
                  const protoKey = `${proto.source.libraryId}:${proto.source.versionId}`;
                  return (
                    <Paper key={protoKey} variant="outlined" sx={{ overflow: "hidden" }}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={0.5}
                        alignItems={{ sm: "center" }}
                        sx={{ px: 1.1, py: 0.85, bgcolor: "action.hover" }}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="subtitle1" noWrap title={proto.library?.name ?? "Proto"}>
                            {proto.library?.name ?? "Proto"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {proto.version?.version ?? proto.source.versionId}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {proto.methodCount} method{proto.methodCount === 1 ? "" : "s"} · {proto.scenarioCount}{" "}
                          scenario{proto.scenarioCount === 1 ? "" : "s"}
                        </Typography>
                      </Stack>

                      <Stack spacing={1} sx={{ p: 1 }}>
                        {proto.services.map((service) => (
                          <Stack key={`${protoKey}:${service.serviceName}`} spacing={0.45}>
                            <Stack direction="row" spacing={0.7} alignItems="center" sx={{ px: 0.5 }}>
                              <Typography variant="caption" fontWeight={600} color="text.secondary" noWrap>
                                {service.serviceName}
                              </Typography>
                              <Divider sx={{ flex: 1 }} />
                            </Stack>

                            {service.methods.map((method) => {
                              const key = methodKey(method.method);
                              const selected = Boolean(mockSelectedMethod && methodKey(mockSelectedMethod) === key);
                              const activeScenario = method.activeScenario;
                              const running = Boolean(
                                mockServerStatus.running && method.enabled && activeScenario && !method.errorDetail,
                              );
                              const warningDetail =
                                method.scenarios.length === 0
                                  ? "Add a scenario before enabling this method."
                                  : !activeScenario
                                    ? "Choose an active scenario."
                                    : !method.enabled
                                      ? "The active scenario is disabled."
                                      : "";

                              const selectMethod = () => {
                                selectProtoLibraryVersion(method.source.libraryId, method.source.versionId);
                                setMockSelectedMethodKey(key);
                                if (activeScenario) {
                                  setFocusedScenarioKey(`${key}:${activeScenario.scenario.id}`);
                                }
                              };

                              return (
                                <Box
                                  key={`${protoKey}:${key}`}
                                  role="group"
                                  tabIndex={0}
                                  aria-label={`${method.method.methodName} mock method`}
                                  aria-current={selected ? "true" : undefined}
                                  onClick={selectMethod}
                                  onKeyDown={(event: any) => {
                                    if (event.currentTarget !== event.target) return;
                                    if (event.key === " " || event.key === "Enter") {
                                      event.preventDefault();
                                      selectMethod();
                                    }
                                  }}
                                  sx={{
                                    minWidth: 0,
                                    border: "1px solid",
                                    borderColor: selected ? "primary.main" : "divider",
                                    borderLeft: "2px solid",
                                    borderLeftColor: selected ? "primary.main" : "transparent",
                                    borderRadius: 1,
                                    bgcolor: selected ? "action.selected" : "transparent",
                                    px: 1,
                                    py: 0.75,
                                    "&:hover": { bgcolor: selected ? "action.selected" : "action.hover" },
                                  }}
                                >
                                  <Stack direction="row" spacing={0.6} alignItems="flex-start">
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                      <Typography
                                        variant="body2"
                                        fontWeight={500}
                                        noWrap
                                        title={method.method.methodName}
                                      >
                                        {method.method.methodName}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary" noWrap>
                                        {rpcMethodKindLabel(method.method)}
                                      </Typography>
                                    </Box>

                                    {method.errorDetail ? (
                                      <MethodStatusIndicator
                                        tone="error"
                                        title="Method unavailable"
                                        detail={method.errorDetail}
                                        context={`${method.method.serviceName}/${method.method.methodName}`}
                                      />
                                    ) : running ? (
                                      <MethodStatusIndicator
                                        tone="running"
                                        title="Mock running"
                                        detail={`Serving ${activeScenario?.scenario.id ?? "the active scenario"}.`}
                                        context={`${method.method.serviceName}/${method.method.methodName}`}
                                      />
                                    ) : warningDetail ? (
                                      <MethodStatusIndicator
                                        tone="warning"
                                        title={method.scenarios.length === 0 ? "No scenarios" : "Method not active"}
                                        detail={warningDetail}
                                        context={`${method.method.serviceName}/${method.method.methodName}`}
                                      />
                                    ) : null}
                                  </Stack>

                                  {!method.errorDetail ? (
                                    <Stack
                                      direction={{ xs: "column", sm: "row" }}
                                      spacing={0.55}
                                      alignItems={{ sm: "flex-end" }}
                                      sx={{ mt: 0.7 }}
                                      onPointerDown={(event: any) => event.stopPropagation()}
                                      onMouseDown={(event: any) => event.stopPropagation()}
                                      onClick={(event: any) => event.stopPropagation()}
                                      onKeyDown={(event: any) => event.stopPropagation()}
                                    >
                                      {method.scenarios.length > 0 ? (
                                        <Stack spacing={0.3} sx={{ minWidth: 0, flex: 1 }}>
                                          <Typography variant="caption" color="text.secondary">
                                            Active scenario
                                          </Typography>
                                          <FormControl size="small" fullWidth>
                                            <Select
                                              value={activeScenario?.scenario.id ?? ""}
                                              displayEmpty
                                              sx={{ minHeight: 38 }}
                                              inputProps={{
                                                "aria-label": `Active scenario for ${method.method.methodName}`,
                                              }}
                                              onChange={(event: any) =>
                                                selectScenarioFromMethod(method, String(event.target.value))
                                              }
                                            >
                                              <MenuItem value="" disabled>
                                                Choose scenario
                                              </MenuItem>
                                              {method.scenarios.map((row) => {
                                                const displayName = mockScenarioDisplayName(row.scenario, row.method);
                                                const optionLabel =
                                                  displayName === row.scenario.id
                                                    ? displayName
                                                    : `${displayName} — ${row.scenario.id}`;
                                                return (
                                                  <MenuItem key={`${key}:${row.scenario.id}`} value={row.scenario.id}>
                                                    {optionLabel}
                                                  </MenuItem>
                                                );
                                              })}
                                            </Select>
                                          </FormControl>
                                        </Stack>
                                      ) : (
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          startIcon={<Add />}
                                          onClick={() => createScenario(method)}
                                          sx={{ alignSelf: { sm: "flex-end" } }}
                                        >
                                          {uiCopy.actions.addScenario}
                                        </Button>
                                      )}

                                      <Tooltip title="Scenario settings">
                                        <span>
                                          <IconButton
                                            size="small"
                                            aria-label={`Scenario settings for ${method.method.methodName}`}
                                            disabled={method.scenarios.length === 0}
                                            onClick={(event: any) => openScenarioActions(event.currentTarget, method)}
                                            sx={{ width: 38, height: 38, mb: method.scenarios.length > 0 ? 0.1 : 0 }}
                                          >
                                            <Settings sx={{ fontSize: 16 }} />
                                          </IconButton>
                                        </span>
                                      </Tooltip>
                                    </Stack>
                                  ) : null}
                                </Box>
                              );
                            })}
                          </Stack>
                        ))}
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Box>
        )}

        {tab === "proto" && (
          <Box
            role="tabpanel"
            id="grpc-mock-panel-proto"
            aria-labelledby="grpc-mock-tab-proto"
            tabIndex={0}
            sx={{ minHeight: 0, flex: 1, overflow: "hidden" }}
          >
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
              onCreateScenario={createScenario}
            />
          </Box>
        )}

        {tab === "web-access" && (
          <Box
            role="tabpanel"
            id="grpc-mock-panel-web-access"
            aria-labelledby="grpc-mock-tab-web-access"
            tabIndex={0}
            sx={{ minHeight: 0, flex: 1, overflow: "auto" }}
          >
            <WebAccessPanel ctx={ctx} requestedSection={webAccessSectionRequest} />
          </Box>
        )}

        {tab === "activity" && (
          <Stack
            role="tabpanel"
            id="grpc-mock-panel-activity"
            aria-labelledby="grpc-mock-tab-activity"
            tabIndex={0}
            spacing={0.8}
            sx={{ minHeight: 0, flex: 1 }}
          >
            <WorkbenchTabs
              value={activityView}
              ariaLabel="gRPC Mock activity"
              idPrefix="grpc-mock-activity"
              bordered={false}
              className="p-0"
              items={grpcMockActivityTabs.map((value) => ({
                value,
                label: value === "requests" ? "Requests" : "Logs",
                count: value === "requests" ? requestLogs.length : undefined,
              }))}
              onValueChange={(value) => setActivityView(value as GrpcMockActivityView)}
            />
            {activityView === "requests" ? (
              <Stack
                role="tabpanel"
                id="grpc-mock-activity-panel-requests"
                aria-labelledby="grpc-mock-activity-tab-requests"
                tabIndex={0}
                direction={{ xs: "column", md: "row" }}
                spacing={1}
                sx={{ minHeight: 0, flex: 1 }}
              >
                <Box sx={{ width: { xs: "100%", md: 420 }, overflow: "auto" }}>
                  {requestLogs.length === 0 ? (
                    <EmptyCard title="No requests" body="Start gRPC Mock and invoke one of its methods." />
                  ) : (
                    <Stack spacing={0.45} role="listbox" aria-label="gRPC Mock requests">
                      {requestLogs.map((log: any) => (
                        <ListItemButton
                          key={log.id}
                          selected={selectedRequest?.id === log.id}
                          role="option"
                          aria-selected={selectedRequest?.id === log.id}
                          onClick={() => setSelectedRequestId(log.id)}
                          sx={{
                            border: "1px solid",
                            borderColor: selectedRequest?.id === log.id ? "primary.main" : "divider",
                          }}
                        >
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {log.methodName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {log.serviceName} · {log.scenarioId ?? uiCopy.status.unmatched}
                            </Typography>
                          </Box>
                          <Chip size="small" color={log.matched ? "success" : "warning"} label={log.status} />
                          <Typography variant="caption" color="text.secondary">
                            {log.durationMs} ms
                          </Typography>
                        </ListItemButton>
                      ))}
                    </Stack>
                  )}
                </Box>
                <Paper variant="outlined" sx={{ ...cardSx, minWidth: 0, flex: 1, overflow: "auto" }}>
                  {!selectedRequest ? (
                    <Typography variant="body2" color="text.secondary">
                      Select a request.
                    </Typography>
                  ) : (
                    <Stack spacing={0.8}>
                      <Typography variant="subtitle1">{selectedRequest.methodName}</Typography>
                      <InfoRow label="Scenario" value={selectedRequest.scenarioId ?? uiCopy.status.unmatched} />
                      <InfoRow label="Status" value={selectedRequest.status} />
                      <Typography variant="caption" color="text.secondary">
                        Request
                      </Typography>
                      <Box
                        component="pre"
                        sx={{ m: 0, p: 1, borderRadius: 1.5, bgcolor: "action.hover", overflow: "auto", fontSize: 12 }}
                      >
                        {JSON.stringify(selectedRequest.request ?? {}, null, 2)}
                      </Box>
                      <Stack direction="row" spacing={0.6}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ContentCopy />}
                          onClick={() =>
                            copyTextWithAnnouncement(
                              JSON.stringify(selectedRequest.request ?? {}, null, 2),
                              "Request JSON",
                            )
                          }
                        >
                          Copy
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Add />}
                          disabled={
                            !attachedMethods.some(
                              (item) =>
                                item.method.serviceName === selectedRequest.serviceName &&
                                item.method.methodName === selectedRequest.methodName,
                            )
                          }
                          onClick={() => createScenarioFromRequest(selectedRequest)}
                        >
                          {uiCopy.actions.addScenario}
                        </Button>
                      </Stack>
                    </Stack>
                  )}
                </Paper>
              </Stack>
            ) : (
              <Box
                role="tabpanel"
                id="grpc-mock-activity-panel-logs"
                aria-labelledby="grpc-mock-activity-tab-logs"
                tabIndex={0}
                sx={{ minHeight: 0, flex: 1 }}
              >
                <RuntimeLogs status={mockServerStatus} />
              </Box>
            )}
          </Stack>
        )}
      </Stack>

      <Menu anchorEl={scenarioMenu?.anchor ?? null} open={Boolean(scenarioMenu)} onClose={() => setScenarioMenu(null)}>
        <MenuItem
          disabled={!scenarioMenu?.scenario}
          onClick={() => {
            if (scenarioMenu?.scenario) openScenarioEditor(scenarioMenu.scenario);
            setScenarioMenu(null);
          }}
        >
          <Edit sx={{ fontSize: 15, mr: 0.7 }} />
          Edit source
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (scenarioMenu) manageScenarios(scenarioMenu.method);
            setScenarioMenu(null);
          }}
        >
          <Settings sx={{ fontSize: 15, mr: 0.7 }} />
          Manage scenarios
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (scenarioMenu) createScenario(scenarioMenu.method);
            setScenarioMenu(null);
          }}
        >
          <Add sx={{ fontSize: 15, mr: 0.7 }} />
          {uiCopy.actions.addScenario}
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={!scenarioMenu?.scenario}
          onClick={() => {
            if (scenarioMenu?.scenario) setScenarioActive(scenarioMenu.scenario, !scenarioMenu.method.enabled);
            setScenarioMenu(null);
          }}
        >
          {scenarioMenu?.method.enabled ? "Disable method" : "Enable method"}
        </MenuItem>
        <MenuItem
          disabled={!scenarioMenu?.scenario}
          onClick={() => {
            if (scenarioMenu?.scenario) duplicateScenario(scenarioMenu.scenario);
            setScenarioMenu(null);
          }}
        >
          <ContentCopy sx={{ fontSize: 15, mr: 0.7 }} />
          Duplicate active
        </MenuItem>
        <MenuItem
          disabled={!scenarioMenu?.scenario}
          onClick={() => {
            if (scenarioMenu?.scenario) deleteScenario(scenarioMenu.scenario);
            setScenarioMenu(null);
          }}
          sx={{ color: "error.main" }}
        >
          <Delete sx={{ fontSize: 15, mr: 0.7 }} />
          Delete active
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(managedMethod)} onClose={() => setManagedMethodKey("")} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" noWrap>
                {managedMethod?.method.methodName ?? "Manage scenarios"}
              </Typography>
              {managedMethod ? (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {managedMethod.method.serviceName} · {rpcMethodKindLabel(managedMethod.method)}
                </Typography>
              ) : null}
            </Box>
            <IconButton aria-label="Close scenario manager" onClick={() => setManagedMethodKey("")}>
              <Close />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ minHeight: 180 }}>
          {!managedMethod || managedMethod.scenarios.length === 0 ? (
            <EmptyCard title="No scenarios" body="Add a scenario for this method." />
          ) : (
            <Stack spacing={0.5} role="listbox" aria-label="Method scenarios">
              {managedMethod.scenarios.map((row) => {
                const active = managedMethod.activeScenario?.scenario.id === row.scenario.id && managedMethod.enabled;
                const displayName = mockScenarioDisplayName(row.scenario, row.method);
                return (
                  <Paper
                    key={`${methodKey(row.method)}:${row.scenario.id}`}
                    variant="outlined"
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: 0.5,
                      px: 0.9,
                      py: 0.65,
                      borderColor: active ? "primary.main" : "divider",
                      bgcolor: active ? "action.selected" : "transparent",
                    }}
                  >
                    <ListItemButton
                      component="div"
                      role="option"
                      aria-selected={active}
                      selected={active}
                      onClick={() => setScenarioActive(row, true)}
                      sx={{ minWidth: 0, px: 0.35, py: 0.25, borderRadius: 1 }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" fontWeight={500} noWrap>
                          {displayName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {row.scenario.id}
                          {active ? " · Active" : ""}
                        </Typography>
                      </Box>
                    </ListItemButton>
                    <Stack direction="row" spacing={0.2}>
                      <Tooltip title="Edit source">
                        <IconButton
                          size="small"
                          aria-label={`Edit ${row.scenario.id}`}
                          onClick={() => {
                            setManagedMethodKey("");
                            openScenarioEditor(row);
                          }}
                        >
                          <Edit sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Duplicate">
                        <IconButton
                          size="small"
                          aria-label={`Duplicate ${row.scenario.id}`}
                          onClick={() => duplicateScenario(row)}
                        >
                          <ContentCopy sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Delete ${row.scenario.id}`}
                          onClick={() => deleteScenario(row)}
                        >
                          <Delete sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between" }}>
          <Button
            size="small"
            startIcon={<Add />}
            disabled={!managedMethod}
            onClick={() => {
              if (managedMethod) createScenario(managedMethod);
            }}
          >
            {uiCopy.actions.addScenario}
          </Button>
          <Button onClick={() => setManagedMethodKey("")}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New Scenario</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 0.5 }}>
            {mockableMethods.length === 0 ? (
              <Alert severity="warning">Attach a Proto with unary or server-streaming methods first.</Alert>
            ) : (
              <Stack spacing={0.45}>
                <Typography variant="caption" color="text.secondary">
                  Method
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={newMethodKey}
                    inputProps={{ "aria-label": "Method" }}
                    onChange={(event: any) => setNewMethodKey(String(event.target.value))}
                  >
                    {mockableMethods.map((item) => (
                      <MenuItem
                        key={`${item.source.libraryId}:${item.source.versionId}:${methodKey(item.method)}`}
                        value={methodKey(item.method)}
                      >
                        {item.method.serviceName} / {item.method.methodName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!newMethodKey}
            onClick={() => {
              const item = mockableMethods.find((value) => methodKey(value.method) === newMethodKey);
              if (item) createScenario(item);
            }}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={attachOpen} onClose={() => setAttachOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Attach Proto</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 0.5 }}>
            <Stack spacing={0.45}>
              <Typography variant="caption" color="text.secondary">
                Schema
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={attachLibraryId}
                  inputProps={{ "aria-label": "Schema" }}
                  onChange={(event: any) => {
                    const id = String(event.target.value);
                    const library = protoLibraries.find((item: any) => item.id === id);
                    setAttachLibraryId(id);
                    setAttachVersionId(library?.defaultVersionId ?? library?.versions?.[0]?.id ?? "");
                  }}
                >
                  {protoLibraries.map((library: any) => (
                    <MenuItem key={library.id} value={library.id}>
                      {library.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <Stack spacing={0.45}>
              <Typography variant="caption" color="text.secondary">
                Revision
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={attachVersionId}
                  inputProps={{ "aria-label": "Revision" }}
                  onChange={(event: any) => setAttachVersionId(String(event.target.value))}
                >
                  {(protoLibraries.find((item: any) => item.id === attachLibraryId)?.versions ?? [])
                    .filter((version: any) => version.lifecycle !== "archived")
                    .map((version: any) => (
                      <MenuItem key={version.id} value={version.id}>
                        {version.version}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttachOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!attachLibraryId || !attachVersionId} onClick={attachSource}>
            Attach
          </Button>
        </DialogActions>
      </Dialog>

      <GrpcScenarioSourceDialog
        open={scenarioEditorOpen && Boolean(selectedScenarioRow)}
        row={selectedScenarioRow}
        mockServer={mockServer}
        onClose={closeScenarioEditor}
        onSaveScenario={(scenario, format) => {
          if (selectedScenarioRow) saveScenario(selectedScenarioRow, scenario, format);
        }}
        onDirtyChange={setScenarioEditorDirty}
        onFetchFile={fetchMockScenarioFilesFromWorkspace}
        onOpenFolder={openMockScenarioFolder}
      />

      <GrpcMockSettingsDialog
        open={settingsOpen}
        page={settingsPage}
        onPageChange={setSettingsPage}
        mockServer={mockServer}
        running={Boolean(mockServerStatus.running)}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => setMockServer({ ...next, updatedAt: new Date().toISOString() })}
        onSaveAndRestart={async (next) => {
          if (mockServerStatus.running) await stopMockServer();
          const nextProject = { ...next, updatedAt: new Date().toISOString() };
          setMockServer(nextProject);
          await startMockServer(nextProject);
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
  const loopEnabled = Boolean(selectedDraftScenario?.stream?.loop ?? mockServer.streamDefaults.loop);
  const loopCount = Math.max(
    0,
    Number(selectedDraftScenario?.stream?.maxLoops ?? mockServer.streamDefaults.maxLoops) || 0,
  );

  function changeSource(nextSource: string) {
    setSource(nextSource);
  }

  function patchSelectedStream(patch: { loop?: boolean; maxLoops?: number }) {
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
          bordered={false}
          className="min-h-0 p-0"
        />

        {row.method.responseStream ? (
          <Paper variant="outlined" sx={{ px: 1, py: 0.65 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={0.9} alignItems={{ sm: "center" }}>
              <Stack direction="row" spacing={0.55} alignItems="center" sx={{ minWidth: 105 }}>
                <Typography variant="body2">Loop</Typography>
                <Switch
                  checked={loopEnabled}
                  inputProps={{ "aria-label": `Loop ${row.scenario.id}` }}
                  onChange={(_event: any, checked: boolean) => patchSelectedStream({ loop: checked })}
                />
              </Stack>
              <TextField
                size="small"
                type="number"
                label="Count"
                value={String(loopCount)}
                disabled={!loopEnabled}
                helperText={loopEnabled ? "0 means unlimited" : undefined}
                inputProps={{ min: 0, step: 1, "aria-label": uiCopy.fields.loopCount }}
                onChange={(event: any) =>
                  patchSelectedStream({ maxLoops: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
                }
                sx={{ width: 145 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0, flex: 1 }}>
                {loopEnabled
                  ? loopCount === 0
                    ? "Repeats until the client disconnects."
                    : `Repeats ${loopCount} additional time${loopCount === 1 ? "" : "s"}.`
                  : "Sends once."}
              </Typography>
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
          <Button size="small" variant="contained" disabled={!dirty} onClick={save}>
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
  onClose,
  onSave,
  onSaveAndRestart,
}: {
  open: boolean;
  page: GrpcMockSettingsPage;
  onPageChange: (page: GrpcMockSettingsPage) => void;
  mockServer: MockServerProject;
  running: boolean;
  onClose: () => void;
  onSave: (next: MockServerProject) => void;
  onSaveAndRestart: (next: MockServerProject) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<MockServerProject>(() => structuredClone(mockServer));
  useEffect(() => {
    if (open) setDraft(structuredClone(mockServer));
  }, [open, mockServer]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(mockServer);
  const restartRequired =
    draft.bindHost !== mockServer.bindHost ||
    draft.port !== mockServer.port ||
    JSON.stringify(draft.security) !== JSON.stringify(mockServer.security) ||
    JSON.stringify(draft.limits) !== JSON.stringify(mockServer.limits);
  const patch = (next: Partial<MockServerProject>) => setDraft((current) => ({ ...current, ...next }));

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
      <DialogContent sx={{ height: 430, overflow: "hidden" }}>
        <Stack direction="row" spacing={1.2} sx={{ height: "100%", minHeight: 0, pt: 0.25 }}>
          <Stack
            spacing={0.35}
            sx={{ width: 160, flexShrink: 0, overflowY: "auto" }}
            role="tablist"
            aria-label="gRPC Mock settings sections"
          >
            {(["server", "security", "defaults", "advanced"] as const).map((value) => (
              <Button
                key={value}
                size="small"
                role="tab"
                aria-selected={page === value}
                variant={page === value ? "contained" : "text"}
                onClick={() => onPageChange(value)}
                sx={{ justifyContent: "flex-start" }}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </Button>
            ))}
          </Stack>
          <Box aria-hidden="true" sx={{ width: 1, alignSelf: "stretch", bgcolor: "divider", flexShrink: 0 }} />
          <Box role="tabpanel" sx={{ minWidth: 0, flex: 1, height: "100%", overflowY: "auto", pr: 0.5 }}>
            {running && dirty && restartRequired && (
              <Alert severity="info" sx={{ mb: 1 }}>
                These changes require a restart.
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
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    Request logging
                  </Typography>
                  <Switch
                    checked={draft.limits.requestLogs}
                    inputProps={{ "aria-label": "Request logging" }}
                    onChange={(_event: any, checked: boolean) =>
                      patch({ limits: { ...draft.limits, requestLogs: checked } })
                    }
                  />
                </Stack>
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
        {running && (
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
                  <Typography variant="caption" color="text.secondary">
                    {selectedCompiled.version.version}
                  </Typography>
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
                          selectProtoLibraryVersion(item.source.libraryId, item.source.versionId);
                          setMockSelectedMethodKey(key);
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
          bordered={false}
          className="p-0"
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
  const gatewayLogs = status.gateway?.logs ?? [];
  const directLogs = status.logs ?? [];
  const requestLogs = status.requestLog ?? [];
  const logs = gatewayLogs.length
    ? gatewayLogs
    : directLogs.length
      ? directLogs.map((item: any, index: number) =>
          typeof item === "string" ? { id: `${index}-${item}`, timestamp: Date.now(), message: item } : item,
        )
      : requestLogs.map((item: any) => ({
          id: item.id,
          timestamp: item.timestamp,
          message: `${item.serviceName}.${item.methodName} · ${item.scenarioId ?? uiCopy.status.unmatched} · ${item.status}`,
        }));
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
