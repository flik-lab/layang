import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { LoadedProto, ProtoSourceFile } from "@/lib/types";
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
  workspaceFolderPath: string;
  updateSeqRef: MutableRefObject<number>;
  appliedSeqRef: MutableRefObject<number>;
  lastSyncSignatureRef: MutableRefObject<string>;
};

async function syncRunningMockServerFromEditor({
  mockServer,
  mockServerStatus,
  setMockServerStatus,
  loaded,
  protoFiles,
  workspaceFolderPath,
  updateSeqRef,
  appliedSeqRef,
  lastSyncSignatureRef,
}: Omit<UseMockRuntimeSyncOptions, "delayMs">) {
  if (!mockServerStatus.running || !loaded || !window.electronMock?.update) return;
  const parsed = parseAllMockScenarioFiles(mockServer, loaded.methods);
  if (parsed.ok === false) {
    setMockServerStatus((current: MockServerStatus) =>
      current.running ? { ...current, message: `Live reload paused: ${parsed.error}` } : current,
    );
    return;
  }
  const activeScenarioIds = resolveMockActiveScenarioIds(parsed.bundle, loaded.methods, mockServer.selectedScenarioIds);
  const syncSignature = JSON.stringify({
    port: normalizeMockPort(mockServer.port, defaultMockPort),
    bindHost: normalizeMockBindHost(mockServer.bindHost),
    protoFiles: protoFiles.map((file) => [file.name, file.text]),
    methods: loaded.methods.map((method) => [
      method.serviceName,
      method.methodName,
      method.requestStream,
      method.responseStream,
      method.requestType,
      method.responseType,
    ]),
    scenarios: parsed.bundle.scenarios,
    streamDefaults: mockServer.streamDefaults,
    activeScenarioIds,
    enabledMethods: mockServer.enabledMethods,
    mockServerUpdatedAt: mockServer.updatedAt,
  });
  if (syncSignature === lastSyncSignatureRef.current) return;
  lastSyncSignatureRef.current = syncSignature;
  updateSeqRef.current += 1;
  const uiRuntimeRevision = updateSeqRef.current;
  const result = await window.electronMock.update({
    port: normalizeMockPort(mockServer.port, defaultMockPort),
    bindHost: normalizeMockBindHost(mockServer.bindHost),
    protoFiles,
    methods: loaded.methods,
    scenarios: parsed.bundle.scenarios,
    streamDefaults: mockServer.streamDefaults,
    activeScenarioIds,
    enabledMethods: mockServer.enabledMethods,
    workspaceDirectory: workspaceFolderPath || undefined,
    uiRuntimeRevision,
    mockServerUpdatedAt: mockServer.updatedAt,
  });
  if (uiRuntimeRevision < appliedSeqRef.current) return;
  appliedSeqRef.current = uiRuntimeRevision;
  if (!result.ok) {
    setMockServerStatus((current: MockServerStatus) =>
      current.running ? { ...current, message: result.error ?? "Live reload failed." } : current,
    );
    return;
  }
  setMockServerStatus((current: MockServerStatus) =>
    current.running
      ? {
          ...current,
          scenarioCount: result.scenarioCount ?? parsed.bundle.scenarios.length,
          activeScenarioIds: result.activeScenarioIds ?? activeScenarioIds,
          configVersion: result.configVersion ?? current.configVersion,
          updatedAt: result.updatedAt ?? current.updatedAt,
          port: result.port ?? current.port,
          url: result.url ?? current.url,
          bindHost: result.bindHost ?? current.bindHost,
          bindAddress: result.bindAddress ?? current.bindAddress,
          localTarget: result.localTarget ?? current.localTarget,
          apisixTarget: result.apisixTarget ?? current.apisixTarget,
          reachableTargets: result.reachableTargets ?? current.reachableTargets,
          methodCount: result.methodCount ?? current.methodCount,
          message: result.message ?? (result.restarted ? "Mock runtime reloaded." : "Mock config updated."),
        }
      : current,
  );
}

export function useMockRuntimeSync(options: UseMockRuntimeSyncOptions) {
  const { delayMs, mockServerStatus, loaded, protoFiles, mockServer } = options;
  useEffect(() => {
    if (!mockServerStatus.running || !loaded || !window.electronMock?.update) return;
    const timer = window.setTimeout(() => {
      void syncRunningMockServerFromEditor(options);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [mockServer, loaded, protoFiles, mockServerStatus.running, delayMs]);
}
