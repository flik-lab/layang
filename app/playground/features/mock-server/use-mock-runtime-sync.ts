import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { LoadedProto, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import type { ProtoRuntimeRegistry } from "@/lib/proto-runtime-registry";
import type { MockServerProject, MockServerStatus } from "../../shared/workbench-types";
import { defaultMockPort } from "../../shared/workbench-constants";
import {
  normalizeMockBindHost,
  normalizeMockPort,
  parseAllMockScenarioFiles,
  resolveMockActiveScenarioIds,
} from "./mock-scenario-model";

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
  mockServerStatus,
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
  const parsed = parseAllMockScenarioFiles(mockServer, schema.methods);
  if (!parsed.ok) {
    setMockServerStatus((current) =>
      current.running ? { ...current, message: `Live reload paused: ${parsed.error}` } : current,
    );
    return null;
  }
  const activeScenarioIds = resolveMockActiveScenarioIds(parsed.bundle, schema.methods, mockServer.selectedScenarioIds);
  const syncSignature = JSON.stringify({
    port: normalizeMockPort(mockServer.port, defaultMockPort),
    bindHost: normalizeMockBindHost(mockServer.bindHost),
    protoFiles: schema.protoFiles.map((file) => [file.name, file.text]),
    methods: schema.methods.map((method) => [
      method.serviceName,
      method.methodName,
      method.requestStream,
      method.responseStream,
      method.requestType,
      method.responseType,
    ]),
    scenarios: parsed.bundle.scenarios,
    streamDefaults: mockServer.streamDefaults,
    security: mockServer.security,
    limits: mockServer.limits,
    activeScenarioIds,
    enabledMethods: mockServer.enabledMethods,
  });
  if (syncSignature === lastSyncSignatureRef.current) return null;
  lastSyncSignatureRef.current = syncSignature;
  updateSeqRef.current += 1;
  const uiRuntimeRevision = updateSeqRef.current;
  const result = await mockUpdate({
    port: normalizeMockPort(mockServer.port, defaultMockPort),
    bindHost: normalizeMockBindHost(mockServer.bindHost),
    protoFiles: schema.protoFiles,
    methods: schema.methods,
    scenarios: parsed.bundle.scenarios,
    streamDefaults: mockServer.streamDefaults,
    security: mockServer.security,
    limits: mockServer.limits,
    activeScenarioIds,
    enabledMethods: mockServer.enabledMethods,
    workspaceDirectory: workspaceFolderPath || undefined,
    uiRuntimeRevision,
    mockServerUpdatedAt: mockServer.updatedAt,
  });
  if (uiRuntimeRevision < appliedSeqRef.current) return result;
  appliedSeqRef.current = uiRuntimeRevision;
  if (!result.ok) {
    setMockServerStatus((current) =>
      current.running ? { ...current, message: result.error ?? "Live reload failed." } : current,
    );
    return result;
  }
  setMockServerStatus((current) => {
    if (!current.running) return current;
    return {
      ...current,
      scenarioCount: result.scenarioCount ?? parsed.bundle.scenarios.length,
      activeScenarioIds: result.activeScenarioIds ?? activeScenarioIds,
      requestLog: result.requestLog ?? current.requestLog,
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
  });
  return result;
}

export function useMockRuntimeSync(options: UseMockRuntimeSyncOptions) {
  const { delayMs, mockServerStatus, loaded, protoFiles, mockServer, activeProtoLibraryId, activeProtoVersionId } =
    options;
  const latestOptionsRef = useRef(options);
  const syncInFlightRef = useRef(false);
  const syncPendingRef = useRef(false);
  latestOptionsRef.current = options;

  useEffect(() => {
    if (!mockServerStatus.running || mockServerStatus.runtimeKind === "gateway") return;
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
            await syncRunningMockServerFromEditor(latestOptionsRef.current);
          } while (syncPendingRef.current);
        } catch (error) {
          latestOptionsRef.current.setMockServerStatus((current) =>
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
    mockServerStatus.running,
    mockServerStatus.runtimeKind,
    delayMs,
    activeProtoLibraryId,
    activeProtoVersionId,
  ]);
}
