import type { WorkspaceExportBundle } from "../../shared/workbench-types";

export type WorkspaceAutosaveState = {
  lastPayload: string;
  saving: boolean;
  pendingPayload: string;
  pendingBundle: WorkspaceExportBundle | null;
  pendingPath: string;
  flushPromise: Promise<void> | null;
};

export function createWorkspaceAutosaveState(): WorkspaceAutosaveState {
  return {
    lastPayload: "",
    saving: false,
    pendingPayload: "",
    pendingBundle: null,
    pendingPath: "",
    flushPromise: null,
  };
}

export function workspaceBundlePayload(bundle: WorkspaceExportBundle): string {
  return JSON.stringify({
    project: bundle.project,
    layout: bundle.layout,
    settings: bundle.settings,
  });
}

async function flushWorkspaceAutosaveQueue(state: WorkspaceAutosaveState): Promise<void> {
  if (state.flushPromise) return state.flushPromise;

  state.flushPromise = (async () => {
    state.saving = true;
    try {
      while (state.pendingBundle && state.pendingPath) {
        const pendingBundle = state.pendingBundle;
        const pendingPayload = state.pendingPayload;
        const pendingPath = state.pendingPath;
        state.pendingBundle = null;

        const result = await window.electronWorkspace?.saveFolder?.(pendingBundle, pendingPath);
        if (!result || result.ok !== false) state.lastPayload = pendingPayload;
      }
    } catch (error) {
      console.warn("Workspace autosave failed.", error);
    } finally {
      state.saving = false;
      state.flushPromise = null;
    }
  })();

  return state.flushPromise;
}

export async function enqueueWorkspaceAutosave(
  state: WorkspaceAutosaveState,
  bundle: WorkspaceExportBundle,
  workspaceFolderPath: string,
): Promise<void> {
  if (!workspaceFolderPath || !window.electronWorkspace?.saveFolder) return;

  const payload = workspaceBundlePayload(bundle);
  if (payload === state.lastPayload && !state.pendingBundle && !state.saving) return;

  state.pendingPayload = payload;
  state.pendingBundle = bundle;
  state.pendingPath = workspaceFolderPath;

  // A new payload can arrive while a previous flush is finishing. Keep joining or
  // starting flushes until the shared queue is fully drained so older snapshots
  // can never complete after and overwrite the latest gRPC mock state.
  while (state.pendingBundle || state.saving || state.flushPromise) {
    await flushWorkspaceAutosaveQueue(state);
    if (!state.pendingBundle && !state.saving && !state.flushPromise) break;
  }
}
