import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  MockFormat,
  MockMethodScenarioFile,
  MockServerProject,
} from "../../shared/workbench-types";
import { createDefaultMockServerProject, normalizeMockServerProject } from "./mock-scenario-model";
import { mockRuntimeStore } from "./runtime/mockRuntime.store";

type ToastSeverity = "info" | "success" | "warning" | "error";

type UseGrpcMockControllerOptions = {
  hydrated: boolean;
  workspaceFolderPath: string;
  localDirtyFallbackMs: number;
  showToast: (message: string, severity?: ToastSeverity) => void;
};

export function useGrpcMockController({
  hydrated,
  workspaceFolderPath,
  localDirtyFallbackMs,
  showToast,
}: UseGrpcMockControllerOptions) {
  const [mockServer, setMockServerState] = useState<MockServerProject>(() => createDefaultMockServerProject());
  const mockServerStatus = mockRuntimeStore.getGrpc();
  const setMockServerStatus = mockRuntimeStore.patchGrpc;
  const webAccessStatus = mockRuntimeStore.getWebAccess();
  const setWebAccessStatus = mockRuntimeStore.patchWebAccess;
  const [mockSettingsOpen, setMockSettingsOpen] = useState(false);
  const [mockScenarioEditorDraft, setMockScenarioEditorDraft] = useState<{
    methodKey: string;
    scenarioId: string;
    format: MockFormat;
    text: string;
  } | null>(null);
  const [mockScenarioEditorDirty, setMockScenarioEditorDirty] = useState(false);
  const [mockScenarioEditorError, setMockScenarioEditorError] = useState("");
  const [mockScenarioDialogOpen, setMockScenarioDialogOpen] = useState(false);
  const [mockScenarioEditing, setMockScenarioEditing] = useState<{ methodKey: string; scenarioId: string } | null>(
    null,
  );
  const [mockScenarioDraftId, setMockScenarioDraftId] = useState("");
  const mockRuntimeUpdateSeqRef = useRef(0);
  const mockRuntimeAppliedSeqRef = useRef(0);
  const mockRuntimeLastSyncSignatureRef = useRef("");
  const mockServerRef = useRef<MockServerProject>(mockServer);
  const mockServerApplyingWorkspaceRefreshRef = useRef(false);
  const mockServerLocalDirtyRef = useRef(false);
  const mockServerLocalDirtyUntilRef = useRef(0);

  function markMockServerLocalDirty(timeoutMs = localDirtyFallbackMs) {
    mockServerLocalDirtyRef.current = true;
    mockServerLocalDirtyUntilRef.current = Date.now() + timeoutMs;
  }

  function clearMockServerLocalDirty() {
    mockServerLocalDirtyRef.current = false;
    mockServerLocalDirtyUntilRef.current = 0;
  }

  function isMockServerLocalDirty() {
    return mockServerLocalDirtyRef.current || Date.now() < mockServerLocalDirtyUntilRef.current;
  }

  // Keep the ref and dirty guard in sync before React commits the next render.
  // Start can be clicked immediately after editing a scenario; without this wrapper
  // the disk refresh path can still observe the previous state and replace the draft.
  const setMockServer = useCallback<Dispatch<SetStateAction<MockServerProject>>>(
    (update) => {
      mockServerLocalDirtyRef.current = true;
      mockServerLocalDirtyUntilRef.current = Date.now() + localDirtyFallbackMs;
      setMockServerState((current) => {
        const next =
          typeof update === "function" ? (update as (value: MockServerProject) => MockServerProject)(current) : update;
        mockServerRef.current = next;
        return next;
      });
    },
    [localDirtyFallbackMs],
  );

  function mockServerDiskSignature(value: MockServerProject): string {
    const normalized = normalizeMockServerProject(value);
    const methodFiles = Object.fromEntries(
      Object.entries(normalized.methodFiles ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, file]) => [key, { format: file.format, scenarioText: file.scenarioText }]),
    );
    return JSON.stringify({
      port: normalized.port,
      protoSources: normalized.protoSources,
      security: normalized.security,
      limits: normalized.limits,
      bindHost: normalized.bindHost,
      format: normalized.format,
      streamDefaults: normalized.streamDefaults,
      selectedScenarioIds: normalized.selectedScenarioIds,
      enabledMethods: normalized.enabledMethods,
      methodFiles,
      methodBindings: normalized.methodBindings,
      gatewayProfiles: normalized.gatewayProfiles,
      activeGatewayProfileId: normalized.activeGatewayProfileId,
      scenarioText: normalized.scenarioText,
    });
  }

  async function refreshGrpcMockServerFromWorkspace(
    options: { silent?: boolean; respectLocalDirty?: boolean; throwOnError?: boolean; applyToState?: boolean } = {},
  ): Promise<MockServerProject> {
    if (!workspaceFolderPath || !window.electronWorkspace?.readMockServer) {
      const error = "Mock scenario file refresh is available after a workspace folder is opened or saved.";
      if (options.throwOnError) throw new Error(error);
      if (!options.silent) showToast(error, "warning");
      return mockServerRef.current;
    }
    if (options.respectLocalDirty !== false && isMockServerLocalDirty()) return mockServerRef.current;

    const result = await window.electronWorkspace.readMockServer(workspaceFolderPath);
    if (!result.ok) {
      const error = result.error || "Failed to read mock scenario files from workspace.";
      if (options.throwOnError) throw new Error(error);
      if (!options.silent) showToast(error, "error");
      return mockServerRef.current;
    }
    if (!result.mockServer) return mockServerRef.current;

    const next = normalizeMockServerProject(result.mockServer as Partial<MockServerProject>);
    const nextSignature = mockServerDiskSignature(next);
    if (options.applyToState !== false && nextSignature !== mockServerDiskSignature(mockServerRef.current)) {
      mockServerApplyingWorkspaceRefreshRef.current = true;
      setMockScenarioEditorDraft(null);
      setMockScenarioEditorDirty(false);
      setMockScenarioEditorError("");
      mockServerRef.current = next;
      setMockServerState(next);
      if (!options.silent) showToast("Mock scenario files reloaded from workspace.", "success");
    }
    return next;
  }

  useEffect(() => {
    mockServerRef.current = mockServer;
    if (!hydrated) return;
    if (mockServerApplyingWorkspaceRefreshRef.current) {
      mockServerApplyingWorkspaceRefreshRef.current = false;
      clearMockServerLocalDirty();
      return;
    }
    markMockServerLocalDirty();
  }, [mockServer, hydrated]);

  return {
    mockServer,
    setMockServer,
    mockServerStatus,
    setMockServerStatus,
    webAccessStatus,
    setWebAccessStatus,
    mockSettingsOpen,
    setMockSettingsOpen,
    mockScenarioEditorDraft,
    setMockScenarioEditorDraft,
    mockScenarioEditorDirty,
    setMockScenarioEditorDirty,
    mockScenarioEditorError,
    setMockScenarioEditorError,
    mockScenarioDialogOpen,
    setMockScenarioDialogOpen,
    mockScenarioEditing,
    setMockScenarioEditing,
    mockScenarioDraftId,
    setMockScenarioDraftId,
    mockRuntimeUpdateSeqRef,
    mockRuntimeAppliedSeqRef,
    mockRuntimeLastSyncSignatureRef,
    mockServerRef,
    markMockServerLocalDirty,
    clearMockServerLocalDirty,
    isMockServerLocalDirty,
    refreshGrpcMockServerFromWorkspace,
  };
}

export type { MockMethodScenarioFile };
