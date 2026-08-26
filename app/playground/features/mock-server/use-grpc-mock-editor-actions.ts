"use client";

import type {
  MockFormat,
  MockMethodScenarioFile,
  MockScenario,
  MockScenarioBundle,
  MockServerProject,
  MockServerStatus,
  MockStreamSettings,
  GrpcGatewayMode,
  GrpcGatewayProfile,
  GrpcGatewayMethodBehavior,
  GrpcGatewaySecurity,
  WorkspaceExportBundle,
} from "../../shared/workbench-types";
import type { LoadedProto, RpcMethodInfo } from "@/lib/types";
import { createDefaultGatewayProfile, normalizeGatewayProfile, saveMockScenarioForMethod } from "./mock-scenario-core";
import { syncRunningMockServerFromEditor } from "./use-mock-runtime-sync";
import { createPinnedGrpcBinding, findProtoVersion } from "../proto-library/proto-library-domain";
import type { ProtoLibrary } from "../proto-library/proto-library-types";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type MockScenarioEditorDraft = {
  methodKey: string;
  scenarioId: string;
  format: MockFormat;
  text: string;
} | null;

type MockRuntimeReady = {
  ok: true;
  localTarget: string;
  status: MockServerStatus;
};

type MockRuntimeFailure = {
  ok: false;
  error: string;
};

type ActionContext = Record<string, any> & {
  loaded: LoadedProto | null;
  selectedMethod: RpcMethodInfo | null;
  mockServer: MockServerProject;
  setMockServer: StateSetter<MockServerProject>;
  mockServerStatus: MockServerStatus;
  setMockServerStatus: StateSetter<MockServerStatus>;
  setMockScenarioEditorDraft: StateSetter<MockScenarioEditorDraft>;
  setMockScenarioEditorDirty: StateSetter<boolean>;
  setMockScenarioEditorError: StateSetter<string>;
  currentMockScenarios: MockScenario[];
  allMockScenarios: MockScenario[];
  mockScenarioEditorDirty: boolean;
  protoFiles: Array<{ name: string; text: string }>;
  protoLibraries: ProtoLibrary[];
  activeProtoLibraryId: string;
  activeProtoVersionId: string;
};

export function useGrpcMockEditorActions(ctx: ActionContext) {
  const {
    activeMethodKey,
    activeProtoLibraryId,
    activeProtoVersionId,
    applyProject,
    buildDefaultMockScenario,
    clamp,
    clearInheritedMockStreamOverridesForDefaultChange,
    currentMockActiveScenario,
    currentMockEditorText,
    currentMockFile,
    currentMockScenarios,
    currentMockSelectedScenarioId,
    defaultMockPort,
    downloadTextFile,
    ensureUniqueMockScenarioId,
    formatMockScenarioBundle,
    formatSingleMockScenarioForEditor,
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
    refreshGrpcMockServerFromWorkspace,
    requestJson,
    resolveMockActiveScenarioIds,
    safeMockFileBaseName,
    selectMethod,
    selectedMethod,
    setMockScenarioDialogOpen,
    setMockScenarioDraftId,
    setMockScenarioEditing,
    setMockScenarioEditorDraft,
    setMockScenarioEditorDirty,
    setMockScenarioEditorError,
    setMockServer,
    setMockServerStatus,
    setWebAccessStatus,
    webAccessStatus,
    setMockSettingsOpen,
    setRequestTab,
    setSideSection,
    setSidebarOpen,
    setWorkspaceFolderPath,
    showToast,
    toErrorMessage,
    updateMockMethodScenarioFile,
    workspaceFolderPath,
    workspaceFolderStorageKey,
  } = ctx;

  const activeProtoVersion = findProtoVersion(protoLibraries, activeProtoLibraryId, activeProtoVersionId);

  function attachActiveMethodBinding(project: MockServerProject): MockServerProject {
    if (!selectedMethod || !activeProtoVersion) return project;
    const key = methodKey(selectedMethod);
    return {
      ...project,
      methodBindings: {
        ...(project.methodBindings ?? {}),
        [key]: createPinnedGrpcBinding(activeProtoVersion.library, activeProtoVersion.version, selectedMethod),
      },
    };
  }

  function setBoundMockServer(update: (current: MockServerProject) => MockServerProject) {
    setMockServer((current) => attachActiveMethodBinding(update(current)));
  }

  function clearMockScenarioEditorDraftState() {
    setMockScenarioEditorDraft(null);
    setMockScenarioEditorDirty(false);
    setMockScenarioEditorError("");
  }

  function handleMockScenarioTextChange(value: string) {
    if (!selectedMethod) return;
    const key = methodKey(selectedMethod);
    setMockScenarioEditorDraft({
      methodKey: key,
      scenarioId: currentMockSelectedScenarioId,
      format: currentMockFile.format,
      text: value,
    });
    setMockScenarioEditorDirty(true);
    const parsed = parseSingleMockScenarioText(value, currentMockFile.format, mockServer.port, selectedMethod);
    setMockScenarioEditorError(parsed.ok ? "" : parsed.error);
  }

  function saveMockScenarioEditorDraft() {
    if (!selectedMethod) return;
    const key = methodKey(selectedMethod);
    const draftMatches =
      mockScenarioEditorDraft &&
      mockScenarioEditorDraft.methodKey === key &&
      mockScenarioEditorDraft.scenarioId === currentMockSelectedScenarioId &&
      mockScenarioEditorDraft.format === currentMockFile.format;
    const editorText = draftMatches ? mockScenarioEditorDraft.text : currentMockEditorText;
    const parsed = parseSingleMockScenarioText(editorText, currentMockFile.format, mockServer.port, selectedMethod);
    if (!parsed.ok) {
      setMockScenarioEditorError(parsed.error);
      showToast(parsed.error, "error");
      return;
    }
    const nextScenario = parsed.bundle.scenarios[0];
    if (!nextScenario) {
      const error = "No scenario found to save.";
      setMockScenarioEditorError(error);
      showToast(error, "warning");
      return;
    }
    const replacementId =
      currentMockSelectedScenarioId ||
      mockServer.selectedScenarioIds[key] ||
      currentMockScenarios[0]?.id ||
      nextScenario.id;
    setBoundMockServer((current) => {
      const file = getMockMethodScenarioFile(current, selectedMethod);
      const currentParsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      const existing = currentParsed.ok
        ? currentParsed.bundle.scenarios.filter(
            (scenario: MockScenario) =>
              scenario.service === selectedMethod.serviceName && scenario.method === selectedMethod.methodName,
          )
        : [];
      const remaining = existing.filter(
        (scenario: MockScenario) => scenario.id !== replacementId && scenario.id !== nextScenario.id,
      );
      const nextBundle: MockScenarioBundle = {
        version: currentParsed.ok ? currentParsed.bundle.version : 1,
        scenarios: [nextScenario, ...remaining],
      };
      const nextProject = updateMockMethodScenarioFile(current, selectedMethod, {
        format: currentMockFile.format,
        scenarioText: formatMockScenarioBundle(nextBundle, currentMockFile.format),
      });
      return {
        ...nextProject,
        selectedScenarioIds: { ...nextProject.selectedScenarioIds, [key]: nextScenario.id },
        enabledMethods: { ...nextProject.enabledMethods, [key]: true },
        updatedAt: new Date().toISOString(),
      };
    });
    clearMockScenarioEditorDraftState();
    showToast("Mock scenario saved.", "success");
  }

  function discardMockScenarioEditorDraft() {
    clearMockScenarioEditorDraftState();
  }

  function ensureMockScenarioEditorSaved() {
    if (!mockScenarioEditorDirty) return true;
    showToast("Save mock scenario before running.", "warning");
    return false;
  }

  /**
   * Updates the mock server port. Scenario files stay split per method.
   */
  function handleMockPortChange(value: string) {
    const port = clamp(Math.floor(Number(value) || defaultMockPort), 1, 65535);
    setBoundMockServer((current) => ({
      ...current,
      port,
      gatewayProfiles: current.gatewayProfiles.map((profile) =>
        profile.id === current.activeGatewayProfileId
          ? { ...profile, listenPort: port, updatedAt: new Date().toISOString() }
          : profile,
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateActiveGatewayProfile(patch: Record<string, unknown>) {
    setMockServer((current) => {
      const profiles = current.gatewayProfiles?.length ? current.gatewayProfiles : [createDefaultGatewayProfile()];
      const activeId = current.activeGatewayProfileId || profiles[0].id;
      return {
        ...current,
        gatewayProfiles: profiles.map((profile) =>
          profile.id === activeId
            ? normalizeGatewayProfile({ ...profile, ...patch, updatedAt: new Date().toISOString() })
            : profile,
        ),
        activeGatewayProfileId: activeId,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function handleGatewayModeChange(mode: GrpcGatewayMode) {
    updateActiveGatewayProfile({ mode });
  }

  function handleGatewayUpstreamChange(value: string) {
    setMockServer((current) => {
      const profiles = current.gatewayProfiles?.length ? current.gatewayProfiles : [createDefaultGatewayProfile()];
      const activeId = current.activeGatewayProfileId || profiles[0].id;
      return {
        ...current,
        gatewayProfiles: profiles.map((profile) => {
          if (profile.id !== activeId) return profile;
          const security = profile.upstreams[0]?.security ?? { type: "insecure" as const };
          const targets = value
            .split(",")
            .map((target) => target.trim())
            .filter(Boolean);
          return normalizeGatewayProfile({
            ...profile,
            upstreams: targets.map((target) => ({ target, weight: 1, security })),
            updatedAt: new Date().toISOString(),
          });
        }),
        activeGatewayProfileId: activeId,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function handleGatewaySecurityChange(type: "insecure" | "tls") {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    const currentSecurity = profile?.upstreams[0]?.security;
    const security: GrpcGatewaySecurity =
      type === "tls"
        ? {
            type: "tls",
            caPath: currentSecurity?.type === "tls" ? currentSecurity.caPath : "",
            clientCertPath: currentSecurity?.type === "tls" ? currentSecurity.clientCertPath : "",
            clientKeyPath: currentSecurity?.type === "tls" ? currentSecurity.clientKeyPath : "",
            serverNameOverride: currentSecurity?.type === "tls" ? currentSecurity.serverNameOverride : "",
          }
        : { type: "insecure" };
    updateActiveGatewayProfile({
      upstreams: (profile?.upstreams ?? []).map((upstream) => ({ ...upstream, security })),
    });
  }

  function handleGatewayTlsPathChange(
    field: "caPath" | "clientCertPath" | "clientKeyPath" | "serverNameOverride",
    value: string,
  ) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    const currentSecurity = profile?.upstreams[0]?.security;
    const security: GrpcGatewaySecurity = {
      type: "tls",
      caPath: currentSecurity?.type === "tls" ? currentSecurity.caPath : "",
      clientCertPath: currentSecurity?.type === "tls" ? currentSecurity.clientCertPath : "",
      clientKeyPath: currentSecurity?.type === "tls" ? currentSecurity.clientKeyPath : "",
      serverNameOverride: currentSecurity?.type === "tls" ? currentSecurity.serverNameOverride : "",
      [field]: value,
    };
    updateActiveGatewayProfile({
      upstreams: (profile?.upstreams ?? []).map((upstream) => ({ ...upstream, security })),
    });
  }

  function handleGatewayListenSecurityChange(type: "insecure" | "tls") {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    updateActiveGatewayProfile({
      listenSecurity:
        type === "tls"
          ? {
              type: "tls",
              certificatePath: profile?.listenSecurity?.type === "tls" ? profile.listenSecurity.certificatePath : "",
              privateKeyPath: profile?.listenSecurity?.type === "tls" ? profile.listenSecurity.privateKeyPath : "",
              clientCaPath: profile?.listenSecurity?.type === "tls" ? profile.listenSecurity.clientCaPath : "",
              requireClientCertificate:
                profile?.listenSecurity?.type === "tls" ? profile.listenSecurity.requireClientCertificate : false,
            }
          : { type: "insecure" },
    });
  }

  function handleGatewayListenTlsPathChange(
    field: "certificatePath" | "privateKeyPath" | "clientCaPath",
    value: string,
  ) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    const security =
      profile?.listenSecurity?.type === "tls"
        ? profile.listenSecurity
        : {
            type: "tls" as const,
            certificatePath: "",
            privateKeyPath: "",
            clientCaPath: "",
            requireClientCertificate: false,
          };
    updateActiveGatewayProfile({ listenSecurity: { ...security, [field]: value } });
  }

  function handleGatewayRequireClientCertificateChange(value: boolean) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    const security =
      profile?.listenSecurity?.type === "tls"
        ? profile.listenSecurity
        : {
            type: "tls" as const,
            certificatePath: "",
            privateKeyPath: "",
            clientCaPath: "",
            requireClientCertificate: false,
          };
    updateActiveGatewayProfile({ listenSecurity: { ...security, requireClientCertificate: value } });
  }

  function handleGrpcWebEnabledChange(enabled: boolean) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    updateActiveGatewayProfile({ web: { ...(profile?.web ?? createDefaultGatewayProfile().web), enabled } });
  }

  function handleGrpcWebHostChange(host: string) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    updateActiveGatewayProfile({ web: { ...(profile?.web ?? createDefaultGatewayProfile().web), host } });
  }

  function handleGrpcWebPortChange(value: string) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    const web = profile?.web ?? createDefaultGatewayProfile().web;
    const port = clamp(Math.floor(Number(value) || (web.security.type === "tls" ? 8443 : 8080)), 1, 65535);
    updateActiveGatewayProfile({ web: { ...web, port } });
  }

  function handleGrpcWebSecurityChange(type: "insecure" | "tls") {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    const web = profile?.web ?? createDefaultGatewayProfile().web;
    const current = web.security;
    updateActiveGatewayProfile({
      web: {
        ...web,
        port: type === "tls" && web.port === 8080 ? 8443 : type === "insecure" && web.port === 8443 ? 8080 : web.port,
        security:
          type === "tls"
            ? {
                type: "tls",
                certificatePath: current.type === "tls" ? current.certificatePath : "",
                privateKeyPath: current.type === "tls" ? current.privateKeyPath : "",
                clientCaPath: current.type === "tls" ? current.clientCaPath : "",
                requireClientCertificate: current.type === "tls" ? current.requireClientCertificate : false,
              }
            : { type: "insecure" },
      },
    });
  }

  function handleGrpcWebTlsPathChange(field: "certificatePath" | "privateKeyPath" | "clientCaPath", value: string) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    const web = profile?.web ?? createDefaultGatewayProfile().web;
    const security =
      web.security.type === "tls"
        ? web.security
        : {
            type: "tls" as const,
            certificatePath: "",
            privateKeyPath: "",
            clientCaPath: "",
            requireClientCertificate: false,
          };
    updateActiveGatewayProfile({ web: { ...web, security: { ...security, [field]: value } } });
  }

  function handleGrpcWebRequireClientCertificateChange(value: boolean) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    const web = profile?.web ?? createDefaultGatewayProfile().web;
    const security =
      web.security.type === "tls"
        ? web.security
        : {
            type: "tls" as const,
            certificatePath: "",
            privateKeyPath: "",
            clientCaPath: "",
            requireClientCertificate: false,
          };
    updateActiveGatewayProfile({ web: { ...web, security: { ...security, requireClientCertificate: value } } });
  }

  function handleGrpcWebCorsOriginsChange(value: string) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    const web = profile?.web ?? createDefaultGatewayProfile().web;
    const allowedOrigins = value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    updateActiveGatewayProfile({ web: { ...web, cors: { ...web.cors, allowedOrigins } } });
  }

  function handleGrpcWebMaxConcurrentStreamsChange(value: string) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    const web = profile?.web ?? createDefaultGatewayProfile().web;
    const maxConcurrentStreams = clamp(Math.floor(Number(value) || 100), 6, 1000);
    updateActiveGatewayProfile({ web: { ...web, maxConcurrentStreams } });
  }

  function handleGrpcWebHttp1FallbackChange(value: boolean) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    const web = profile?.web ?? createDefaultGatewayProfile().web;
    updateActiveGatewayProfile({ web: { ...web, allowHttp1Fallback: value } });
  }

  function handleGatewayCaptureChange(enabled: boolean) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    updateActiveGatewayProfile({
      capture: { ...(profile?.capture ?? createDefaultGatewayProfile().capture), enabled },
    });
  }

  function handleGatewayRetryChange(enabled: boolean) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    updateActiveGatewayProfile({ retry: { ...(profile?.retry ?? createDefaultGatewayProfile().retry), enabled } });
  }

  function handleGatewayProfileSelect(profileId: string) {
    setMockServer((current) => ({
      ...current,
      activeGatewayProfileId: profileId,
      updatedAt: new Date().toISOString(),
    }));
  }

  function addGatewayProfile() {
    setMockServer((current) => {
      const base = createDefaultGatewayProfile();
      const index = current.gatewayProfiles.length + 1;
      const profile = {
        ...base,
        id: `gateway-${Date.now()}`,
        name: `Gateway ${index}`,
        listenPort: base.listenPort + index - 1,
        web: { ...base.web, port: base.web.port + index - 1 },
      };
      return {
        ...current,
        gatewayProfiles: [...current.gatewayProfiles, profile],
        activeGatewayProfileId: profile.id,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function deleteGatewayProfile() {
    setMockServer((current) => {
      if (current.gatewayProfiles.length <= 1) return current;
      const remaining = current.gatewayProfiles.filter((item) => item.id !== current.activeGatewayProfileId);
      return {
        ...current,
        gatewayProfiles: remaining,
        activeGatewayProfileId: remaining[0].id,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function handleGatewayMethodBehaviorChange(methodKeyValue: string, behavior: GrpcGatewayMethodBehavior) {
    const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
    updateActiveGatewayProfile({
      methodBehaviors: { ...(profile?.methodBehaviors ?? {}), [methodKeyValue]: behavior },
    });
  }

  async function saveGatewayCaptureAsMock(captureId: string, capturedMethodKey: string) {
    const saveCapture = window.electronGateway?.saveCapture;
    if (!saveCapture) {
      showToast("Gateway capture is available in the desktop app only.", "warning");
      return;
    }
    const profileId = mockServer.activeGatewayProfileId;
    const method = loaded?.methods.find((item: RpcMethodInfo) => methodKey(item) === capturedMethodKey);
    if (!method) {
      showToast(`Method ${capturedMethodKey} is not available in the active proto revision.`, "error");
      return;
    }
    try {
      const result = await saveCapture({ profileId, captureId });
      if (!result.ok || !result.scenario) {
        showToast(result.error ?? "Gateway capture could not be converted to a mock scenario.", "error");
        return;
      }
      const scenario = result.scenario as MockScenario;
      setMockServer((current) => {
        const file = getMockMethodScenarioFile(current, method);
        const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
        const scenarios = parsed.ok ? parsed.bundle.scenarios : [];
        const nextBundle: MockScenarioBundle = {
          version: parsed.ok ? parsed.bundle.version : 1,
          scenarios: [scenario, ...scenarios.filter((item: MockScenario) => item.id !== scenario.id)],
        };
        const next = updateMockMethodScenarioFile(current, method, {
          format: file.format,
          scenarioText: formatMockScenarioBundle(nextBundle, file.format),
        });
        const key = methodKey(method);
        return {
          ...next,
          selectedScenarioIds: { ...next.selectedScenarioIds, [key]: scenario.id },
          enabledMethods: { ...next.enabledMethods, [key]: true },
          updatedAt: new Date().toISOString(),
        };
      });
      showToast("Gateway capture saved as an editable mock scenario.", "success");
    } catch (error) {
      showToast(`Save capture failed: ${toErrorMessage(error)}`, "error");
    }
  }

  function handleMockBindHostChange(value: string) {
    const bindHost = normalizeMockBindHost(value);
    setBoundMockServer((current) => ({
      ...current,
      bindHost,
      gatewayProfiles: current.gatewayProfiles.map((profile) =>
        profile.id === current.activeGatewayProfileId
          ? { ...profile, listenHost: bindHost, updatedAt: new Date().toISOString() }
          : profile,
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Converts the active mock source between JSON and YAML without applying an invalid draft.
   */
  function handleMockFormatChange(format: MockFormat) {
    if (!selectedMethod) {
      setBoundMockServer((current) => {
        const parsed = parseMockScenarioText(current.scenarioText, current.format, current.port);
        return {
          ...current,
          format,
          scenarioText: parsed.ok
            ? formatMockScenarioBundle(parsed.bundle, format)
            : formatMockScenarioBundle({ version: 1, scenarios: [] }, format),
          updatedAt: new Date().toISOString(),
        };
      });
      return;
    }
    setBoundMockServer((current) => {
      const file = getMockMethodScenarioFile(current, selectedMethod);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      if (!parsed.ok) {
        setMockScenarioEditorError(parsed.error);
        showToast(parsed.error, "error");
        return current;
      }
      return updateMockMethodScenarioFile({ ...current, format }, selectedMethod, {
        format,
        scenarioText: formatMockScenarioBundle(parsed.bundle, format),
      });
    });
  }

  /**
   * Formats the active single-scenario editor with stable JSON/YAML indentation.
   */
  function formatMockScenarioEditor() {
    if (!selectedMethod) {
      showToast("Select a method before formatting a mock scenario.", "warning");
      return;
    }
    const file = getMockMethodScenarioFile(mockServer, selectedMethod);
    const editorText =
      mockScenarioEditorDraft &&
      mockScenarioEditorDraft.methodKey === methodKey(selectedMethod) &&
      mockScenarioEditorDraft.scenarioId === currentMockSelectedScenarioId &&
      mockScenarioEditorDraft.format === file.format
        ? mockScenarioEditorDraft.text
        : currentMockEditorText;
    const parsed = parseSingleMockScenarioText(editorText, file.format, mockServer.port, selectedMethod);
    if (!parsed.ok) {
      setMockScenarioEditorError(parsed.error);
      showToast(parsed.error, "error");
      return;
    }
    const scenario = parsed.bundle.scenarios[0];
    if (!scenario) {
      setMockScenarioEditorError("No scenario found to format.");
      showToast("No scenario found to format.", "warning");
      return;
    }
    const formattedText = formatSingleMockScenarioForEditor(scenario, file.format);
    setMockScenarioEditorDraft({
      methodKey: methodKey(selectedMethod),
      scenarioId: currentMockSelectedScenarioId,
      format: file.format,
      text: formattedText,
    });
    setMockScenarioEditorDirty(true);
    setMockScenarioEditorError("");
    showToast("Mock scenario formatted.", "success");
  }

  /**
   * Rebuilds one external mock scenario file per loaded proto method.
   */
  function _generateMockMappingFromProto() {
    const methods = loaded?.methods ?? [];
    if (methods.length === 0) {
      showToast("Open a gRPC request from a collection before generating mock mappings.", "warning");
      return;
    }
    setBoundMockServer((current) => {
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
                (scenario: MockScenario) =>
                  scenario.service === method.serviceName && scenario.method === method.methodName,
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
    setSideSection("services");
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
    clearMockScenarioEditorDraftState();
    setBoundMockServer((current) => {
      const file = getMockMethodScenarioFile(current, method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      const bundle: MockScenarioBundle = parsed.ok ? parsed.bundle : { version: 1, scenarios: [] };
      const methodScenarios = bundle.scenarios.filter(
        (item: MockScenario) => item.service === method.serviceName && item.method === method.methodName,
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
    setSideSection("services");
    setSidebarOpen(true);
    showToast(`Scenario added for ${method.methodName}.`, "success");
  }

  /**
   * Chooses the scenario that will be used when this method is enabled for mocking.
   */
  function handleMockScenarioSelectChange(method: RpcMethodInfo, scenarioId: string) {
    const key = methodKey(method);
    if (!scenarioId) return;
    clearMockScenarioEditorDraftState();
    setBoundMockServer((current) => ({
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
      (scenario: MockScenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
    );
    const exists = methodScenarios.some(
      (scenario: MockScenario) => scenario.id === nextId && scenario.id !== mockScenarioEditing.scenarioId,
    );
    if (exists) {
      showToast("Scenario name already exists for this method.", "warning");
      return;
    }
    if (!methodScenarios.some((scenario: MockScenario) => scenario.id === mockScenarioEditing.scenarioId)) {
      showToast("Scenario was not found for this method.", "warning");
      return;
    }
    setBoundMockServer((current) => {
      const currentFile = getMockMethodScenarioFile(current, method);
      const currentParsed = parseMockScenarioText(currentFile.scenarioText, currentFile.format, current.port);
      if (!currentParsed.ok) return current;
      const scenario = currentParsed.bundle.scenarios.find(
        (item: MockScenario) =>
          item.service === method.serviceName &&
          item.method === method.methodName &&
          item.id === mockScenarioEditing.scenarioId,
      );
      if (!scenario) return current;
      return (
        saveMockScenarioForMethod(
          current,
          method,
          mockScenarioEditing.scenarioId,
          { ...scenario, id: nextId },
          currentFile.format,
        )?.project ?? current
      );
    });
    clearMockScenarioEditorDraftState();
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
        (scenario: MockScenario) =>
          scenario.service === method.serviceName &&
          scenario.method === method.methodName &&
          scenario.id === mockScenarioEditing.scenarioId,
      )
    ) {
      showToast("Scenario was not found for this method.", "warning");
      return;
    }
    setBoundMockServer((current) => {
      const currentFile = getMockMethodScenarioFile(current, method);
      const currentParsed = parseMockScenarioText(currentFile.scenarioText, currentFile.format, current.port);
      if (!currentParsed.ok) return current;
      const remaining = currentParsed.bundle.scenarios.filter(
        (scenario: MockScenario) =>
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
        (scenario: MockScenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
      );
      const selectedScenarioIds = { ...nextProject.selectedScenarioIds };
      if (
        selectedScenarioIds[key] === mockScenarioEditing.scenarioId ||
        !methodRemaining.some((scenario: MockScenario) => scenario.id === selectedScenarioIds[key])
      ) {
        if (methodRemaining[0]) selectedScenarioIds[key] = methodRemaining[0].id;
        else delete selectedScenarioIds[key];
      }
      const enabledMethods = { ...nextProject.enabledMethods };
      if (!methodRemaining.length) enabledMethods[key] = false;
      return { ...nextProject, selectedScenarioIds, enabledMethods, updatedAt: new Date().toISOString() };
    });
    clearMockScenarioEditorDraftState();
    setMockScenarioDialogOpen(false);
    showToast("Scenario deleted.", "success");
  }

  /**
   * Enables or disables mocking for one method without deleting that method's scenarios.
   */
  function handleMockMethodEnabledChange(method: RpcMethodInfo, enabled: boolean) {
    const key = methodKey(method);
    setBoundMockServer((current) => ({
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
    patch: MockStreamSettings,
  ) {
    const hasUnsavedScenarioDraft =
      mockScenarioEditorDirty &&
      mockScenarioEditorDraft?.methodKey === methodKey(method) &&
      mockScenarioEditorDraft.scenarioId === scenarioId;
    if (hasUnsavedScenarioDraft) {
      showToast("Save the scenario before changing stream settings.", "warning");
      return;
    }
    markMockServerLocalDirty();
    setBoundMockServer((current) => {
      const file = getMockMethodScenarioFile(current, method);
      const parsed = parseMockScenarioText(file.scenarioText, file.format, current.port);
      if (!parsed.ok) return current;
      const nextBundle: MockScenarioBundle = {
        ...parsed.bundle,
        scenarios: parsed.bundle.scenarios.map((scenario: MockScenario) => {
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
   * Updates the global stream defaults stored once in mocks/grpc/server.yml.
   */
  function handleMockGlobalStreamBaseChange(patch: MockStreamSettings) {
    if (mockScenarioEditorDirty) {
      showToast("Save the scenario before changing global stream defaults.", "warning");
      return;
    }
    markMockServerLocalDirty();
    setBoundMockServer((current) => {
      const previousBase = current.streamDefaults;
      const nextBase = normalizeMockStreamSettings(
        { ...current.streamDefaults, ...patch },
        current.streamDefaults,
      ) as Required<Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>;
      if (patch.loop === true && patch.maxLoops === undefined && (nextBase.maxLoops ?? 0) <= 1) nextBase.maxLoops = 0;
      const changedKeys = (
        ["intervalMs", "loop", "maxLoops"] as Array<keyof Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">>
      ).filter((key) => Object.hasOwn(patch, key) && previousBase[key] !== nextBase[key]);
      const nextProject = clearInheritedMockStreamOverridesForDefaultChange(current, previousBase, changedKeys);
      return { ...nextProject, streamDefaults: nextBase, updatedAt: new Date().toISOString() };
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
            ...parsed.bundle.scenarios.map((scenario: MockScenario) =>
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
        setSideSection("services");
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
   * Exports the active scenario in its active JSON or YAML format.
   */
  function exportMockScenarioFile() {
    if (!selectedMethod) {
      showToast("Select a method before exporting a mock scenario.", "warning");
      return;
    }
    const scenario = currentMockActiveScenario ?? currentMockScenarios[0];
    if (!scenario) {
      showToast("No scenario is available to export.", "warning");
      return;
    }
    const file = getMockMethodScenarioFile(mockServer, selectedMethod);
    const extension = file.format === "yaml" ? "yaml" : "json";
    downloadTextFile(
      `${safeMockFileBaseName(selectedMethod)}.${scenario.id}.${extension}`,
      formatSingleMockScenarioForEditor(scenario, file.format),
      file.format === "yaml" ? "application/x-yaml" : "application/json",
    );
  }

  /**
   * Manually pulls the latest mock scenario files from the workspace folder.
   * This replaces automatic external-file polling so disk edits only apply when the user asks for them.
   */
  async function fetchMockScenarioFilesFromWorkspace() {
    try {
      const refreshed = await refreshGrpcMockServerFromWorkspace({
        silent: true,
        respectLocalDirty: false,
        throwOnError: true,
        applyToState: false,
      });
      showToast("Latest mock file loaded into the editor. Save to apply it.", "success");
      return refreshed;
    } catch (err) {
      showToast(`Sync mock scenario file failed: ${toErrorMessage(err)}`, "error");
      return null;
    }
  }

  /**
   * Opens the workspace mock scenario folder so JSON/YAML files can be edited directly on disk.
   */
  async function openMockScenarioFolder() {
    if (!window.electronWorkspace?.saveFolder || !window.electronWorkspace?.openPath) {
      showToast("Open mock scenario folder is available in the desktop app only.", "warning");
      return;
    }

    try {
      let nextPath = workspaceFolderPath;
      // The ref is updated synchronously by the controller. Re-applying the
      // render-time currentMockFile here can overwrite a rename/save performed
      // immediately before Open Folder with the previous render's file.
      const diskMockServer = mockServerRef?.current ?? mockServer;
      const project = { ...getProjectSnapshot(), mockServer: diskMockServer, updatedAt: new Date().toISOString() };

      if (!nextPath) {
        const bundle: WorkspaceExportBundle = {
          ...getWorkspaceExportBundle(),
          exportedAt: new Date().toISOString(),
          project,
        };
        const saveResult = await window.electronWorkspace.saveFolder(bundle);
        if (!saveResult.ok || saveResult.cancelled) return;
        nextPath = saveResult.directoryPath ?? "";
        if (!nextPath) {
          showToast("Workspace folder path is missing.", "warning");
          return;
        }
        setWorkspaceFolderPath(nextPath);
        window.localStorage.setItem(workspaceFolderStorageKey, nextPath);
      } else {
        await persistProjectSnapshotNow?.(project);
      }

      const openResult = await window.electronWorkspace.openPath(nextPath, "mocks/grpc/methods", {
        ensureDirectory: true,
        reveal: false,
      });
      if (!openResult.ok) {
        showToast(`Open mock scenario folder failed: ${openResult.error ?? "Unknown error"}`, "error");
        return;
      }
      showToast("Mock scenario folder opened.", "success");
    } catch (err) {
      showToast(`Open mock scenario folder failed: ${toErrorMessage(err)}`, "error");
    }
  }

  function resolveRuntimeSchema(project: MockServerProject) {
    const configuredSources = project.protoSources?.length
      ? project.protoSources
      : activeProtoLibraryId && activeProtoVersionId
        ? [{ libraryId: activeProtoLibraryId, versionId: activeProtoVersionId }]
        : [];
    const compiled = configuredSources
      .map((source) => protoRuntimeRegistry?.resolveVersion?.(source.libraryId, source.versionId))
      .filter(Boolean);
    if (!compiled.length && loaded && protoFiles.length) {
      return { protoFiles, methods: loaded.methods, sources: configuredSources };
    }
    const uniqueFiles = new Map<string, { name: string; text: string }>();
    const uniqueMethods = new Map<string, RpcMethodInfo>();
    for (const item of compiled) {
      for (const file of item.version.files ?? []) {
        const key = `${file.name}\u0000${file.text}`;
        if (!uniqueFiles.has(key)) uniqueFiles.set(key, file);
      }
      for (const method of item.loaded.methods ?? []) {
        const key = methodKey(method);
        if (!uniqueMethods.has(key)) uniqueMethods.set(key, method);
      }
    }
    return {
      protoFiles: [...uniqueFiles.values()],
      methods: [...uniqueMethods.values()],
      sources: configuredSources,
    };
  }

  /**
   * Starts the native runtime from one explicit project snapshot and verifies the
   * main-process status before reporting success. This is the shared first-click
   * start path for the request Mock tab, Services, and Web Access.
   */
  async function startMockRuntime(projectOverride?: MockServerProject): Promise<MockRuntimeReady | MockRuntimeFailure> {
    try {
      if (!ensureMockScenarioEditorSaved()) return { ok: false, error: "Save the mock scenario before starting." };
      // The editor state is authoritative when Start is pressed. Disk reload is an
      // explicit Fetch action; doing it implicitly here can restore stale files and
      // make a newly edited scenario disappear.
      const effectiveMockServer: MockServerProject = projectOverride ?? mockServerRef?.current ?? mockServer;
      const projectSnapshot = {
        ...getProjectSnapshot(),
        mockServer: effectiveMockServer,
        updatedAt: new Date().toISOString(),
      };
      const schema = resolveRuntimeSchema(effectiveMockServer);
      if (!schema.protoFiles.length || !schema.methods.length) {
        return { ok: false, error: "Attach at least one Proto source before starting gRPC Mock." };
      }
      const parsed = parseAllMockScenarioFiles(effectiveMockServer, schema.methods);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error };
      }
      const activeScenarioIds = resolveMockActiveScenarioIds(
        parsed.bundle,
        schema.methods,
        effectiveMockServer.selectedScenarioIds,
      );
      if (!window.electronMock?.start) {
        return { ok: false, error: "gRPC Mock is available in the desktop app only." };
      }
      const port = normalizeMockPort(effectiveMockServer.port, defaultMockPort);
      mockRuntimeLastSyncSignatureRef.current = "";
      mockRuntimeUpdateSeqRef.current += 1;
      const uiRuntimeRevision = mockRuntimeUpdateSeqRef.current;
      const result = await window.electronMock.start({
        port,
        bindHost: normalizeMockBindHost(effectiveMockServer.bindHost),
        protoFiles: schema.protoFiles,
        methods: schema.methods,
        scenarios: parsed.bundle.scenarios,
        streamDefaults: effectiveMockServer.streamDefaults,
        security: effectiveMockServer.security,
        limits: effectiveMockServer.limits,
        activeScenarioIds,
        enabledMethods: effectiveMockServer.enabledMethods,
        workspaceDirectory: workspaceFolderPath || undefined,
        uiRuntimeRevision,
        mockServerUpdatedAt: effectiveMockServer.updatedAt,
      });
      if (!result.ok) {
        return { ok: false, error: result.error ?? "gRPC Mock failed to start." };
      }

      const confirmed = window.electronMock.status ? await window.electronMock.status() : { ...result, running: true };
      const activeIdsMatch = Object.entries(activeScenarioIds).every(
        ([key, scenarioId]) => !confirmed.activeScenarioIds || confirmed.activeScenarioIds[key] === scenarioId,
      );
      const scenarioCountMatches =
        confirmed.scenarioCount === undefined || confirmed.scenarioCount === parsed.bundle.scenarios.length;
      const methodCountMatches = confirmed.methodCount === undefined || confirmed.methodCount === schema.methods.length;
      if (!confirmed.running || !activeIdsMatch || !scenarioCountMatches || !methodCountMatches) {
        await window.electronMock.stop?.().catch(() => undefined);
        return { ok: false, error: "gRPC Mock did not become ready with the latest scenario configuration." };
      }

      mockRuntimeAppliedSeqRef.current = Math.max(mockRuntimeAppliedSeqRef.current, uiRuntimeRevision);
      const runtimePort = Number(confirmed.port ?? result.port ?? port);
      const runtimeHost = String(confirmed.bindHost ?? result.bindHost ?? effectiveMockServer.bindHost);
      const localTarget = confirmed.localTarget ?? result.localTarget ?? `${runtimeHost}:${runtimePort}`;
      const status: MockServerStatus = {
        running: true,
        runtimeKind: "mock",
        port: runtimePort,
        url: confirmed.url ?? result.url ?? `grpc://${localTarget}`,
        bindHost: runtimeHost,
        bindAddress: confirmed.bindAddress ?? result.bindAddress ?? localTarget,
        localTarget,
        reachableTargets: confirmed.reachableTargets ?? result.reachableTargets,
        scenarioCount: confirmed.scenarioCount ?? result.scenarioCount ?? parsed.bundle.scenarios.length,
        methodCount: confirmed.methodCount ?? result.methodCount ?? schema.methods.length,
        activeScenarioIds: confirmed.activeScenarioIds ?? result.activeScenarioIds ?? activeScenarioIds,
        enabledMethods: confirmed.enabledMethods ?? effectiveMockServer.enabledMethods,
        requestLog: confirmed.requestLog ?? result.requestLog ?? [],
        startedAt: new Date().toISOString(),
        configVersion: confirmed.configVersion ?? result.configVersion,
        updatedAt: confirmed.updatedAt ?? new Date().toISOString(),
        message: "gRPC Mock running.",
      };
      setMockServerStatus(status);
      // Starting the runtime must not wait for a potentially busy workspace
      // autosave queue. Persist the exact confirmed snapshot in the background.
      const persistence = persistProjectSnapshotNow?.(projectSnapshot);
      if (persistence) {
        void persistence.catch((error: unknown) => {
          console.warn("Persisting the running gRPC Mock snapshot failed.", error);
        });
      }
      return { ok: true, localTarget, status };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  }

  async function startMockServer(projectOverride?: MockServerProject) {
    const outcome = await startMockRuntime(projectOverride);
    if (!outcome.ok) {
      setMockServerStatus({ running: false, runtimeKind: "mock", message: outcome.error });
      showToast(`gRPC Mock failed: ${outcome.error}`, "error");
      return null;
    }
    showToast(`gRPC Mock running on ${outcome.localTarget}.`, "success");
    return outcome.localTarget;
  }

  async function ensureMockRuntimeSnapshot(project: MockServerProject): Promise<MockRuntimeReady | MockRuntimeFailure> {
    const actualStatus = await window.electronMock?.status?.().catch(() => null);
    const runtimeStatus = actualStatus?.running
      ? { ...actualStatus, runtimeKind: "mock" as const }
      : mockServerStatus.running && mockServerStatus.runtimeKind !== "gateway"
        ? mockServerStatus
        : null;
    if (!runtimeStatus) return startMockRuntime(project);

    try {
      const result = await syncRunningMockServerFromEditor({
        mockServer: project,
        mockServerStatus: runtimeStatus,
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
      if (result?.ok === false) return { ok: false, error: result.error ?? "gRPC Mock live synchronization failed." };
      const confirmed = await window.electronMock?.status?.();
      if (!confirmed?.running) return { ok: false, error: "gRPC Mock stopped before Web Access became ready." };
      const localTarget =
        confirmed.localTarget ??
        `${confirmed.bindHost ?? normalizeMockBindHost(project.bindHost)}:${confirmed.port ?? normalizeMockPort(project.port, defaultMockPort)}`;
      return {
        ok: true,
        localTarget,
        status: { ...confirmed, running: true, runtimeKind: "mock" },
      };
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  }

  /** Stops only the native gRPC mock runtime. */
  async function stopMockServer() {
    // Reflect the user's stop command immediately. The main process force-closes
    // active streams and confirms cleanup asynchronously.
    setMockServerStatus({ running: false, runtimeKind: "mock", message: "Stopping gRPC Mock..." });
    try {
      const activeWebProfile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
      if (webAccessStatus?.running && activeWebProfile?.webUpstreamMode !== "custom") {
        await stopWebAccess();
      }
      const result = await window.electronMock?.stop?.();
      mockRuntimeLastSyncSignatureRef.current = "";
      setMockServerStatus({ running: false, runtimeKind: "mock", message: result?.message });
      showToast("gRPC Mock stopped.", "success");
    } catch (err) {
      showToast(`Stop gRPC Mock failed: ${toErrorMessage(err)}`, "error");
    }
  }

  /** Starts the single-upstream gRPC-Web bridge used by browser clients. */
  async function startWebAccess(profileOverride?: GrpcGatewayProfile) {
    try {
      if (!ensureMockScenarioEditorSaved()) return false;
      const effectiveMockServer: MockServerProject = mockServerRef?.current ?? mockServer;
      const projectSnapshot = {
        ...getProjectSnapshot(),
        mockServer: effectiveMockServer,
        updatedAt: new Date().toISOString(),
      };
      await persistProjectSnapshotNow?.(projectSnapshot);
      const schema = resolveRuntimeSchema(effectiveMockServer);
      if (!schema.protoFiles.length || !schema.methods.length) {
        const message = "Attach at least one Proto source before starting Web Access.";
        setWebAccessStatus({ running: false, runtimeKind: "gateway", message });
        showToast(message, "warning");
        return false;
      }
      if (!window.electronGateway?.start) {
        const message = "Web Access is available in the desktop app only.";
        setWebAccessStatus({ running: false, runtimeKind: "gateway", message });
        showToast(message, "warning");
        return false;
      }
      const stored =
        profileOverride ??
        effectiveMockServer.gatewayProfiles.find((item) => item.id === effectiveMockServer.activeGatewayProfileId) ??
        effectiveMockServer.gatewayProfiles[0] ??
        createDefaultGatewayProfile();
      const targetMode = stored.webUpstreamMode === "custom" ? "custom" : "local-mock";
      let upstreamTarget = stored.upstreams?.[0]?.target?.trim() ?? "";
      let upstreamSecurity = stored.upstreams?.[0]?.security ?? { type: "insecure" as const };

      if (targetMode === "local-mock") {
        const runtime = await ensureMockRuntimeSnapshot(effectiveMockServer);
        if (!runtime.ok) {
          const message = `The local gRPC Mock is not ready: ${runtime.error}`;
          setWebAccessStatus({ running: false, runtimeKind: "gateway", message });
          showToast(message, "error");
          return false;
        }
        upstreamTarget = runtime.localTarget;
        upstreamSecurity = effectiveMockServer.security.tls
          ? {
              type: "tls" as const,
              caPath: effectiveMockServer.security.certificatePath,
              clientCertPath: "",
              clientKeyPath: "",
              serverNameOverride: "localhost",
            }
          : { type: "insecure" as const };
      }

      if (!upstreamTarget) {
        const message =
          targetMode === "local-mock"
            ? "The local gRPC Mock could not be started. Review its active Proto and scenario first."
            : "Set the custom native gRPC Server target before starting Web Access.";
        setWebAccessStatus({ running: false, runtimeKind: "gateway", message });
        showToast(message, "warning");
        return false;
      }

      const previousOrigins = stored.web?.cors?.allowedOrigins ?? [];
      const legacyDefaultOrigins = new Set([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ]);
      const allowedOrigins =
        !previousOrigins.length || previousOrigins.every((origin) => legacyDefaultOrigins.has(origin))
          ? ["*"]
          : previousOrigins;
      const profile = normalizeGatewayProfile({
        ...stored,
        name: "Web Access",
        mode: "gateway",
        // This native listener is only an implementation detail of the browser bridge.
        // Let the OS select a free port so it never conflicts with gRPC Mock.
        listenHost: "127.0.0.1",
        listenPort: 0,
        webUpstreamMode: targetMode,
        upstreams: [
          {
            ...(stored.upstreams?.[0] ?? { weight: 1 }),
            target: upstreamTarget,
            weight: 1,
            security: upstreamSecurity,
          },
        ],
        methodBehaviors: {},
        noMatchBehavior: "proxy",
        // A local mock can disappear for a few milliseconds during a fast
        // stop/start. Retry that small hand-off window and never leave the
        // browser bridge locked behind a circuit breaker after it is healthy.
        retry: { ...stored.retry, enabled: true, maxRetries: 5, backoffMs: 75 },
        circuitBreaker: { ...stored.circuitBreaker, enabled: false },
        web: {
          ...stored.web,
          enabled: true,
          cors: { ...stored.web?.cors, allowedOrigins },
        },
      });
      // normalizeGatewayProfile treats persisted ports as user-facing values; Web Access
      // intentionally overrides the hidden native listener with an ephemeral port.
      profile.listenPort = 0;
      const result = await window.electronGateway.start({
        profile: {
          ...profile,
          protoLibraryId: schema.sources[0]?.libraryId,
          protoVersionId: schema.sources[0]?.versionId,
        },
        protoFiles: schema.protoFiles,
        methods: schema.methods,
        scenarios: [],
        activeScenarioIds: {},
        enabledMethods: {},
        workspaceDirectory: workspaceFolderPath || undefined,
      });
      if (!result.ok) {
        const message = result.error ?? "Web Access failed to start.";
        setWebAccessStatus({ running: false, runtimeKind: "gateway", message });
        showToast(message, "error");
        return false;
      }
      const confirmed = window.electronGateway.status
        ? await window.electronGateway.status({ profileId: profile.id })
        : result;
      if (!confirmed.ok || !confirmed.running || !confirmed.webUrl) {
        await window.electronGateway.stop?.({ profileId: profile.id }).catch(() => undefined);
        const message = confirmed.error ?? "Web Access did not become ready.";
        setWebAccessStatus({ running: false, runtimeKind: "gateway", message });
        showToast(message, "error");
        return false;
      }
      setWebAccessStatus({
        running: true,
        runtimeKind: "gateway",
        gateway: confirmed,
        port: confirmed.webPort ?? result.webPort ?? profile.web.port,
        url: confirmed.webUrl,
        bindHost: confirmed.webHost ?? result.webHost ?? profile.web.host,
        bindAddress: confirmed.webUrl,
        methodCount: confirmed.methodCount ?? result.methodCount ?? schema.methods.length,
        startedAt: confirmed.startedAt ?? result.startedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        message: `Web Access forwarding to ${upstreamTarget}.`,
      });
      showToast(`Web Access running at ${confirmed.webUrl}`, "success");
      return true;
    } catch (err) {
      const message = `Web Access failed: ${toErrorMessage(err)}`;
      setWebAccessStatus({ running: false, runtimeKind: "gateway", message });
      showToast(message, "error");
      return false;
    }
  }

  /** Stops only the browser bridge. */
  async function stopWebAccess() {
    try {
      const profile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
      const result = await window.electronGateway?.stop?.({ profileId: profile?.id });
      setWebAccessStatus({ running: false, runtimeKind: "gateway", message: result?.message });
      showToast("Web Access stopped.", "success");
    } catch (err) {
      showToast(`Stop Web Access failed: ${toErrorMessage(err)}`, "error");
    }
  }

  return {
    handleMockScenarioTextChange,
    saveMockScenarioEditorDraft,
    discardMockScenarioEditorDraft,
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
    _generateMockMappingFromProto,
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
  };
}
