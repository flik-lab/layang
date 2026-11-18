"use client";

import type {

  MockScenario,

  MockServerProject,
  MockServerStatus,

  GrpcGatewayMode,
  GrpcGatewayProfile,
  GrpcGatewayMethodBehavior,
  GrpcGatewaySecurity,
  WorkspaceExportBundle,
} from "../../shared/workbench-types";
import type { LoadedProto, RpcMethodInfo } from "@/lib/types";
import { createDefaultGatewayProfile, normalizeGatewayProfile } from "./mock-scenario-core";
import { createPinnedGrpcBinding, findProtoVersion } from "../proto-library/proto-library-domain";
import type { ProtoLibrary } from "../proto-library/proto-library-types";
import { recordGuiCliCommand } from "../cli/cli-command-history";
import { performanceStats } from "../../shared/performance/performance-stats.store";
import { resolveMockRuntimeSchema } from "./resolve-runtime-schema";
import { notifyScenarioCatalogChanged } from "./catalog/scenario-catalog-events";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type MockRuntimeReady = {
  ok: true;
  localTarget: string;
  status: MockServerStatus;
};

type MockRuntimeFailure = {
  ok: false;
  error: string;
};

function yieldForRuntimeUiPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      setTimeout(resolve, 0);
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });
}

type ActionContext = Record<string, any> & {
  loaded: LoadedProto | null;
  selectedMethod: RpcMethodInfo | null;
  mockServer: MockServerProject;
  setMockServer: StateSetter<MockServerProject>;
  mockServerStatus: MockServerStatus;
  setMockServerStatus: StateSetter<MockServerStatus>;
  protoFiles: Array<{ name: string; text: string }>;
  protoLibraries: ProtoLibrary[];
  activeProtoLibraryId: string;
  activeProtoVersionId: string;
};

export function useGrpcMockEditorActions(ctx: ActionContext) {
  const {
    activeProtoLibraryId,
    activeProtoVersionId,
    clamp,
    defaultMockPort,
    getProjectSnapshot,
    getWorkspaceExportBundle,
    loaded,
    methodKey,
    mockRuntimeAppliedSeqRef,
    mockRuntimeUpdateSeqRef,
    mockServer,
    mockServerRef,
    mockServerStatus,
    normalizeMockBindHost,
    normalizeMockPort,
    persistProjectSnapshotNow,
    protoFiles,
    protoLibraries,
    protoRuntimeRegistry,
    selectedMethod,
    setMockServer,
    setMockServerStatus,
    setWebAccessStatus,
    webAccessStatus,
    setWorkspaceFolderPath,
    showToast,
    toErrorMessage,
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
    const store = window.electronMockScenarioStore;
    if (!store || !workspaceFolderPath) {
      showToast("Save a workspace folder before saving a Gateway capture.", "warning");
      return;
    }
    try {
      const result = await saveCapture({ profileId, captureId });
      if (!result.ok || !result.scenario) {
        showToast(result.error ?? "Gateway capture could not be converted to a mock scenario.", "error");
        return;
      }
      const scenario = result.scenario as MockScenario;
      const saved = await store.save(workspaceFolderPath,
        { methodKey: capturedMethodKey, scenarioId: scenario.id }, JSON.stringify(scenario), 0, "");
      if (!saved.ok) throw new Error(saved.conflict
        ? "A scenario with this capture ID already exists; open it in the scenario editor."
        : saved.error || "Capture save failed.");
      notifyScenarioCatalogChanged(workspaceFolderPath);
      showToast("Gateway capture saved to v3. Apply it explicitly to activate it.", "success");
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
      // The ref is updated synchronously by the controller. Use its
      // current settings when persisting the workspace.
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

      const openResult = await window.electronWorkspace.openPath(nextPath, "mocks/grpc/scenarios", {
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
    return resolveMockRuntimeSchema(project, {
      protoLibraries, protoRuntimeRegistry, activeProtoLibraryId, activeProtoVersionId, loaded, protoFiles,
    }, new AbortController().signal);
  }

  /**
   * Starts the native runtime from one explicit project snapshot and verifies the
   * main-process status before reporting success. This is the shared first-click
   * start path for the request Mock tab, Services, and Web Access.
   */
  async function startMockRuntime(projectOverride?: MockServerProject): Promise<MockRuntimeReady | MockRuntimeFailure> {
    try {
      setMockServerStatus((current) => ({
        ...current,
        running: false,
        runtimeKind: "mock",
        message: "Starting gRPC Mock...",
      }));
      // Give React/Electron one frame to paint the pending state before schema
      // resolution and scenario parsing do synchronous work on large projects.
      await yieldForRuntimeUiPaint();
      // The editor state is authoritative when Start is pressed. Disk reload is an
      // explicit Fetch action; doing it implicitly here can restore stale files and
      // make a newly edited scenario disappear.
      const effectiveMockServer: MockServerProject = projectOverride ?? mockServerRef?.current ?? mockServer;
      const projectSnapshot = {
        ...getProjectSnapshot(),
        mockServer: effectiveMockServer,
        updatedAt: new Date().toISOString(),
      };
      const schema = await resolveRuntimeSchema(effectiveMockServer);
      if (!schema.protoFiles.length || !schema.methods.length) {
        return { ok: false, error: "Import at least one Proto schema before starting gRPC Mock." };
      }
      const activeScenarioIds = effectiveMockServer.selectedScenarioIds ?? {};
      if (!window.electronMock?.start) {
        return { ok: false, error: "gRPC Mock is available in the desktop app only." };
      }
      const port = normalizeMockPort(effectiveMockServer.port, defaultMockPort);
      mockRuntimeUpdateSeqRef.current += 1;
      const uiRuntimeRevision = mockRuntimeUpdateSeqRef.current;
      if (!workspaceFolderPath) {
        return { ok: false, error: "Save a workspace folder before starting file-based gRPC Mock." };
      }
      // The privileged main/utility runtime compiles v3 scenarios from disk;
      // the renderer must not hydrate or hash the old methodFiles map.
      const mockStartStartedAt = performance.now();
      const result = await window.electronMock.start({
        port,
        bindHost: normalizeMockBindHost(effectiveMockServer.bindHost),
        protoFiles: schema.protoFiles,
        methods: schema.methods,
        streamDefaults: effectiveMockServer.streamDefaults,
        security: effectiveMockServer.security,
        limits: effectiveMockServer.limits,
        activeScenarioIds,
        enabledMethods: effectiveMockServer.enabledMethods,
        workspaceDirectory: workspaceFolderPath || undefined,
        uiRuntimeRevision,
        mockServerUpdatedAt: effectiveMockServer.updatedAt,
      });
      performanceStats.recordMockDuration("server-start", performance.now() - mockStartStartedAt);
      if (!result.ok) {
        return { ok: false, error: result.error ?? "gRPC Mock failed to start." };
      }
      if (result.appliedRevision !== uiRuntimeRevision ||
          typeof result.scenarioContentHash !== "string" || !result.scenarioContentHash) {
        return { ok: false, error: "gRPC Mock did not confirm the starting scenario revision and content hash." };
      }

      const confirmed = window.electronMock.status ? await window.electronMock.status() : { ...result, running: true };
      const activeIdsMatch = Object.entries(activeScenarioIds).every(
        ([key, scenarioId]) => !confirmed.activeScenarioIds || confirmed.activeScenarioIds[key] === scenarioId,
      );
      const methodCountMatches = confirmed.methodCount === undefined || confirmed.methodCount === schema.methods.length;
      if (!confirmed.running || !activeIdsMatch || !methodCountMatches) {
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
        scenarioCount: confirmed.scenarioCount ?? result.scenarioCount ?? 0,
        methodCount: confirmed.methodCount ?? result.methodCount ?? schema.methods.length,
        activeScenarioIds: confirmed.activeScenarioIds ?? result.activeScenarioIds ?? activeScenarioIds,
        enabledMethods: confirmed.enabledMethods ?? effectiveMockServer.enabledMethods,
        requestLog: confirmed.requestLog ?? result.requestLog ?? [],
        startedAt: new Date().toISOString(),
        configVersion: confirmed.configVersion ?? result.configVersion,
        appliedRevision: confirmed.appliedRevision ?? result.appliedRevision,
        scenarioContentHash: confirmed.scenarioContentHash ?? result.scenarioContentHash,
        source: confirmed.source ?? result.source,
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
    recordGuiCliCommand({
      command: "layang mock:start --protocol grpc --daemon",
      label: "Start gRPC mock from GUI",
      workspacePath: workspaceFolderPath,
    });
    showToast(`gRPC Mock running on ${outcome.localTarget}.`, "success");
    return outcome.localTarget;
  }

  async function ensureMockRuntimeSnapshot(project: MockServerProject): Promise<MockRuntimeReady | MockRuntimeFailure> {
    // Native v3 snapshots are owned by the main/utility process. No renderer
    // legacy scenario digest comparison or implicit Apply is allowed here.
    const confirmed = await window.electronMock?.status?.().catch(() => null);
    if (!confirmed?.running) return startMockRuntime(project);
    const localTarget = confirmed.localTarget ??
      `${confirmed.bindHost ?? normalizeMockBindHost(project.bindHost)}:${confirmed.port ?? normalizeMockPort(project.port, defaultMockPort)}`;
    return { ok: true, localTarget, status: { ...confirmed, running: true, runtimeKind: "mock" } };
  }

  /** Stops only the native gRPC mock runtime. */
  async function stopMockServer() {
    // CLI-started runtimes run in their own daemon process. Stop that daemon
    // instead of calling the Electron in-process mock service.
    if (mockServerStatus.runtimeSource === "cli" && window.electronCli?.stopMockRuntime) {
      setMockServerStatus((current) => ({ ...current, message: "Stopping CLI mock runtime..." }));
      const result = await window.electronCli.stopMockRuntime(workspaceFolderPath);
      if (!result?.ok) {
        showToast(`Stop CLI mock runtime failed: ${result?.error ?? "Unknown error"}`, "error");
        return;
      }
      setMockServerStatus({ running: false, runtimeKind: "mock", message: result.message });
      showToast(result.message || "CLI mock runtime stopped.", "success");
      return;
    }

    // Reflect the user's stop command immediately. The main process force-closes
    // active streams and confirms cleanup asynchronously.
    setMockServerStatus({ running: false, runtimeKind: "mock", message: "Stopping gRPC Mock..." });
    try {
      const activeWebProfile = mockServer.gatewayProfiles.find((item) => item.id === mockServer.activeGatewayProfileId);
      if (webAccessStatus?.running && activeWebProfile?.webUpstreamMode !== "custom") {
        await stopWebAccess();
      }
      const result = await window.electronMock?.stop?.();
      setMockServerStatus({ running: false, runtimeKind: "mock", message: result?.message });
      recordGuiCliCommand({
        command: "layang mock:stop --protocol grpc",
        label: "Stop gRPC mock from GUI",
        workspacePath: workspaceFolderPath,
      });
      showToast("gRPC Mock stopped.", "success");
    } catch (err) {
      showToast(`Stop gRPC Mock failed: ${toErrorMessage(err)}`, "error");
    }
  }

  /** Starts the single-upstream gRPC-Web bridge used by browser clients. */
  async function startWebAccess(profileOverride?: GrpcGatewayProfile, projectOverride?: MockServerProject) {
    try {
      setWebAccessStatus((current: MockServerStatus) => ({
        ...current,
        running: false,
        runtimeKind: "gateway",
        message: "Starting Web Access...",
      }));
      // Web Access can need to synchronize/start the native mock first. Paint the
      // pending state before that work so the click always feels immediate.
      await yieldForRuntimeUiPaint();
      const effectiveMockServer: MockServerProject = projectOverride ?? mockServerRef?.current ?? mockServer;
      const projectSnapshot = {
        ...getProjectSnapshot(),
        mockServer: effectiveMockServer,
        updatedAt: new Date().toISOString(),
      };
      const schema = await resolveRuntimeSchema(effectiveMockServer);
      if (!schema.protoFiles.length || !schema.methods.length) {
        const message = "Import at least one Proto schema before starting Web Access.";
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
        "http://localhost:12999",
        "http://127.0.0.1:12999",
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
      // Runtime readiness is the foreground action. Workspace persistence must not
      // extend the perceived startup time or serialize the click behind disk I/O.
      const persistence = persistProjectSnapshotNow?.(projectSnapshot);
      if (persistence) {
        void persistence.catch((error: unknown) => {
          console.warn("Persisting the running Web Access snapshot failed.", error);
        });
      }
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

    openMockScenarioFolder,
    startMockServer,
    stopMockServer,
    startWebAccess,
    stopWebAccess,
  };
}
