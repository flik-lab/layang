import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { LoadedProto, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import type { ProtoRuntimeRegistry } from "@/lib/proto-runtime-registry";
import type { MockServerProject, MockServerStatus } from "../../shared/workbench-types";
import { defaultMockPort } from "../../shared/workbench-constants";
import { performanceStats } from "../../shared/performance/performance-stats.store";
import { normalizeMockBindHost, normalizeMockPort } from "./mock-scenario-model";
import { mockRuntimeStore } from "./runtime/mockRuntime.store";

type UseMockRuntimeSyncOptions = {
  delayMs: number;
  mockServer: MockServerProject;
  mockServerStatus: MockServerStatus;
  setMockServerStatus: Dispatch<SetStateAction<MockServerStatus>>;
  loaded: LoadedProto | null;
  protoFiles: ProtoSourceFile[];
  protoRuntimeRegistry: ProtoRuntimeRegistry;
  workspaceFolderPath: string;
  activeProtoLibraryId: string;
  activeProtoVersionId: string;
  updateSeqRef: MutableRefObject<number>;
  appliedSeqRef: MutableRefObject<number>;
  lastSyncSignatureRef: MutableRefObject<string>;
};

function resolveRuntimeSchema(
  options: Pick<
    UseMockRuntimeSyncOptions,
    "mockServer" | "loaded" | "protoFiles" | "protoRuntimeRegistry" | "activeProtoLibraryId" | "activeProtoVersionId"
  >,
) {
  const { mockServer, loaded, protoFiles, protoRuntimeRegistry, activeProtoLibraryId, activeProtoVersionId } = options;
  const sources = mockServer.protoSources?.length
    ? mockServer.protoSources
    : activeProtoLibraryId && activeProtoVersionId
      ? [{ libraryId: activeProtoLibraryId, versionId: activeProtoVersionId }]
      : [];
  const compiled = sources
    .map((source) => protoRuntimeRegistry.resolveVersion(source.libraryId, source.versionId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!compiled.length && loaded && protoFiles.length) return { protoFiles, methods: loaded.methods };
  const fileMap = new Map<string, ProtoSourceFile>();
  const methodMap = new Map<string, RpcMethodInfo>();
  for (const item of compiled) {
    for (const file of item.version.files) fileMap.set(`${file.name}\u0000${file.text}`, file);
    for (const method of item.loaded.methods) methodMap.set(`${method.serviceName}/${method.methodName}`, method);
  }
  return { protoFiles: [...fileMap.values()], methods: [...methodMap.values()] };
}

export async function syncRunningMockServerFromEditor({
  mockServer,
  setMockServerStatus,
  loaded,
  protoFiles,
  protoRuntimeRegistry,
  workspaceFolderPath,
  activeProtoLibraryId,
  activeProtoVersionId,
  updateSeqRef,
  appliedSeqRef,
  lastSyncSignatureRef,
}: Omit<UseMockRuntimeSyncOptions, "delayMs">) {
  const mockServerStatus = mockRuntimeStore.getGrpc();
  if (!mockServerStatus.running || mockServerStatus.runtimeKind === "gateway") return null;
  const mockUpdate = window.electronMock?.update;
  if (!mockUpdate) return null;
  const schema = resolveRuntimeSchema({
    mockServer,
    loaded,
    protoFiles,
    protoRuntimeRegistry,
    activeProtoLibraryId,
    activeProtoVersionId,
  });
  if (!schema.methods.length || !schema.protoFiles.length) return null;

  const syncSignature = createMockRuntimeSyncSignature(mockServer, schema.methods);
  if (syncSignature === lastSyncSignatureRef.current) return null;

  updateSeqRef.current += 1;
  const uiRuntimeRevision = updateSeqRef.current;
  const mockUpdateStartedAt = performance.now();
  const result = await mockUpdate({
    port: normalizeMockPort(mockServer.port, defaultMockPort),
    bindHost: normalizeMockBindHost(mockServer.bindHost),
    protoFiles: schema.protoFiles,
    methods: schema.methods,
    methodFiles: mockServer.methodFiles,
    streamDefaults: mockServer.streamDefaults,
    security: mockServer.security,
    limits: mockServer.limits,
    activeScenarioIds: mockServer.selectedScenarioIds,
    enabledMethods: mockServer.enabledMethods,
    workspaceDirectory: workspaceFolderPath || undefined,
    uiRuntimeRevision,
    mockServerUpdatedAt: mockServer.updatedAt,
  });
  performanceStats.recordMockDuration("server-update", performance.now() - mockUpdateStartedAt);
  if (uiRuntimeRevision < appliedSeqRef.current) return result;
  appliedSeqRef.current = uiRuntimeRevision;
  if (!result.ok) {
    setMockServerStatus((current: MockServerStatus) =>
      current.running ? { ...current, message: result.error ?? "Live reload failed." } : current,
    );
    return result;
  }
  lastSyncSignatureRef.current = syncSignature;
  setMockServerStatus((current: MockServerStatus) => {
    if (!current.running) return current;
    const next: MockServerStatus = {
      ...current,
      scenarioCount: result.scenarioCount ?? current.scenarioCount,
      activeScenarioIds: result.activeScenarioIds ?? current.activeScenarioIds,
      configVersion: result.configVersion ?? current.configVersion,
      updatedAt: result.updatedAt ?? current.updatedAt,
      port: result.port ?? current.port,
      url: result.url ?? current.url,
      bindHost: result.bindHost ?? current.bindHost,
      bindAddress: result.bindAddress ?? current.bindAddress,
      localTarget: result.localTarget ?? current.localTarget,
      reachableTargets: result.reachableTargets ?? current.reachableTargets,
      methodCount: result.methodCount ?? current.methodCount,
      message: result.message ?? (result.restarted ? "gRPC Mock reloaded." : "gRPC Mock updated."),
    };
    return mockRuntimeStatusEqual(current, next) ? current : next;
  });
  return result;
}

function createMockRuntimeSyncSignature(mockServer: MockServerProject, methods: RpcMethodInfo[]): string {
  const fileRevision = Object.entries(mockServer.methodFiles ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, file]) => `${key}:${file.format}:${file.scenarioText.length}`)
    .join("|");
  return JSON.stringify({
    updatedAt: mockServer.updatedAt ?? "",
    port: normalizeMockPort(mockServer.port, defaultMockPort),
    bindHost: normalizeMockBindHost(mockServer.bindHost),
    protoSources: mockServer.protoSources,
    methods: methods.map((method) => [method.serviceName, method.methodName, method.requestStream, method.responseStream]),
    methodFileRevision: fileRevision,
    streamDefaults: mockServer.streamDefaults,
    security: mockServer.security,
    limits: mockServer.limits,
    activeScenarioIds: mockServer.selectedScenarioIds,
    enabledMethods: mockServer.enabledMethods,
  });
}

function mockRuntimeStatusEqual(left: MockServerStatus, right: MockServerStatus): boolean {
  return left.running === right.running &&
    left.runtimeKind === right.runtimeKind &&
    left.port === right.port &&
    left.url === right.url &&
    left.bindHost === right.bindHost &&
    left.bindAddress === right.bindAddress &&
    left.localTarget === right.localTarget &&
    left.methodCount === right.methodCount &&
    left.scenarioCount === right.scenarioCount &&
    left.configVersion === right.configVersion &&
    left.updatedAt === right.updatedAt &&
    left.message === right.message &&
    left.activeScenarioIds === right.activeScenarioIds &&
    left.reachableTargets === right.reachableTargets;
}

export function useMockRuntimeSync(options: UseMockRuntimeSyncOptions) {
  const { delayMs, loaded, protoFiles, mockServer, activeProtoLibraryId, activeProtoVersionId } = options;
  const latestOptionsRef = useRef(options);
  const syncInFlightRef = useRef(false);
  const syncPendingRef = useRef(false);
  latestOptionsRef.current = options;

  useEffect(() => {
    const runtimeStatus = mockRuntimeStore.getGrpc();
    if (!runtimeStatus.running || runtimeStatus.runtimeKind === "gateway") return;
    const timer = window.setTimeout(() => {
      if (syncInFlightRef.current) {
        syncPendingRef.current = true;
        return;
      }

      syncInFlightRef.current = true;
      void (async () => {
        try {
          do {
            syncPendingRef.current = false;
            await syncRunningMockServerFromEditor({
              ...latestOptionsRef.current,
              mockServerStatus: mockRuntimeStore.getGrpc(),
            });
          } while (syncPendingRef.current);
        } catch (error) {
          latestOptionsRef.current.setMockServerStatus((current: MockServerStatus) =>
            current.running
              ? { ...current, message: `Live reload failed: ${error instanceof Error ? error.message : String(error)}` }
              : current,
          );
        } finally {
          syncInFlightRef.current = false;
        }
      })();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [
    mockServer,
    loaded,
    protoFiles,
    delayMs,
    activeProtoLibraryId,
    activeProtoVersionId,
  ]);
}
