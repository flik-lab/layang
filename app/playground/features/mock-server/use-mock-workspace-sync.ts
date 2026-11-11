import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { WorkspaceExportBundle } from "../../shared/workbench-types";
import { runWhenIdle } from "../workspace/workspace-model";
import { enqueueWorkspaceAutosave, type WorkspaceAutosaveState } from "../workspace/workspace-autosave";

type UseWorkspaceFolderAutosaveOptions = {
  enabled: boolean;
  delayMs: number;
  workspaceFolderPath: string;
  workspaceAutosaveRef: MutableRefObject<WorkspaceAutosaveState>;
  getWorkspaceExportBundle: () => WorkspaceExportBundle;
  dependencies: unknown[];
};

export function useWorkspaceFolderAutosave({
  enabled,
  delayMs,
  workspaceFolderPath,
  workspaceAutosaveRef,
  getWorkspaceExportBundle,
  dependencies,
}: UseWorkspaceFolderAutosaveOptions) {
  useEffect(() => {
    if (!enabled || !workspaceFolderPath || !window.electronWorkspace?.saveFolder) return;
    const timeout = window.setTimeout(() => {
      runWhenIdle(() => {
        const bundle = getWorkspaceExportBundle();
        const saveState = workspaceAutosaveRef.current;
        void enqueueWorkspaceAutosave(saveState, bundle, workspaceFolderPath).catch((error) => {
          console.warn("Workspace autosave pending retry.", error);
        });
      });
    }, delayMs);
    return () => window.clearTimeout(timeout);
  }, [
    enabled,
    workspaceFolderPath,
    delayMs,
    getWorkspaceExportBundle,
    workspaceAutosaveRef,
    ...dependencies,
  ]);
}
