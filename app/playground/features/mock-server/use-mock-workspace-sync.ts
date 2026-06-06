import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { WorkspaceExportBundle } from "../../shared/workbench-types";
import { runWhenIdle } from "../workspace/workspace-model";

type WorkspaceAutosaveState = {
  lastPayload: string;
  saving: boolean;
  pendingPayload: string;
  pendingBundle: WorkspaceExportBundle | null;
  pendingPath: string;
};

type UseWorkspaceFolderAutosaveOptions = {
  enabled: boolean;
  delayMs: number;
  workspaceFolderPath: string;
  workspaceAutosaveRef: MutableRefObject<WorkspaceAutosaveState>;
  getWorkspaceExportBundle: () => WorkspaceExportBundle;
  clearMockServerLocalDirty: () => void;
  dependencies: unknown[];
};

export function useWorkspaceFolderAutosave({
  enabled,
  delayMs,
  workspaceFolderPath,
  workspaceAutosaveRef,
  getWorkspaceExportBundle,
  clearMockServerLocalDirty,
  dependencies,
}: UseWorkspaceFolderAutosaveOptions) {
  useEffect(() => {
    if (!enabled || !workspaceFolderPath || !window.electronWorkspace?.saveFolder) return;
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
              const result = await window.electronWorkspace?.saveFolder?.(pendingBundle, pendingPath);
              if (!result || result.ok !== false) {
                saveState.lastPayload = pendingPayload;
                if (!saveState.pendingBundle) clearMockServerLocalDirty();
              }
            }
          } catch (err) {
            console.warn("Workspace autosave failed.", err);
          } finally {
            saveState.saving = false;
          }
        };

        void flushWorkspaceAutosave();
      });
    }, delayMs);
    return () => window.clearTimeout(timeout);
  }, [
    enabled,
    workspaceFolderPath,
    delayMs,
    getWorkspaceExportBundle,
    clearMockServerLocalDirty,
    workspaceAutosaveRef,
    ...dependencies,
  ]);
}

type UseMockWorkspaceSyncOptions = {
  enabled: boolean;
  workspaceFolderPath: string;
  refreshIntervalMs: number;
  isMockServerLocalDirty: () => boolean;
  workspaceAutosaveRef: MutableRefObject<WorkspaceAutosaveState>;
  refreshGrpcMockServerFromWorkspace: (options?: { silent?: boolean; respectLocalDirty?: boolean }) => Promise<unknown>;
};

export function useMockWorkspaceSync({
  enabled,
  workspaceFolderPath,
  refreshIntervalMs,
  isMockServerLocalDirty,
  workspaceAutosaveRef,
  refreshGrpcMockServerFromWorkspace,
}: UseMockWorkspaceSyncOptions) {
  useEffect(() => {
    if (!enabled || !workspaceFolderPath || !window.electronWorkspace?.readMockServer) return;
    let cancelled = false;
    const autosaveBusy = () => workspaceAutosaveRef.current.saving || workspaceAutosaveRef.current.pendingBundle;
    const reloadFromDisk = async (options: { force?: boolean } = {}) => {
      if (
        cancelled ||
        autosaveBusy() ||
        (!options.force && isMockServerLocalDirty())
      )
        return;
      await refreshGrpcMockServerFromWorkspace({ silent: true, respectLocalDirty: !options.force }).catch((err) => {
        console.warn("Mock scenario workspace refresh failed.", err);
      });
    };
    const reloadFromDiskOnFocus = () => void reloadFromDisk({ force: true });
    const interval = window.setInterval(() => void reloadFromDisk(), refreshIntervalMs);
    window.addEventListener("focus", reloadFromDiskOnFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", reloadFromDiskOnFocus);
    };
  }, [
    enabled,
    workspaceFolderPath,
    refreshIntervalMs,
    isMockServerLocalDirty,
    workspaceAutosaveRef,
    refreshGrpcMockServerFromWorkspace,
  ]);
}
