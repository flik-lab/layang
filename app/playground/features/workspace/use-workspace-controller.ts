import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { hasNativeGrpcBridge } from "@/lib/native-grpc-client";
import type { ColorMode } from "../../design-system";
import { toErrorMessage } from "../../shared/error-utils";
import { workspaceFolderStorageKey } from "../../shared/workbench-constants";
import type { ProjectData, WorkspaceExportBundle } from "../../shared/workbench-types";
import { readStoredProject } from "./workspace-model";
import { createWorkspaceAutosaveState } from "./workspace-autosave";

type ToastSeverity = "info" | "success" | "warning" | "error";

type UseWorkspaceControllerOptions = {
  prefersDark: boolean;
  applyCachedLayout: () => unknown;
  applyProject: (project: ProjectData) => void;
  applyWorkspaceBundle: (value: unknown) => boolean;
  getWorkspaceExportBundle: () => WorkspaceExportBundle;
  setHydrated: Dispatch<SetStateAction<boolean>>;
  setThemeMode: Dispatch<SetStateAction<ColorMode>>;
  setIsNativeBridgeAvailable: Dispatch<SetStateAction<boolean>>;
  showToast: (message: string, severity?: ToastSeverity) => void;
};

export function useWorkspaceController({
  prefersDark,
  applyCachedLayout,
  applyProject,
  applyWorkspaceBundle,
  getWorkspaceExportBundle,
  setHydrated,
  setThemeMode,
  setIsNativeBridgeAvailable,
  showToast,
}: UseWorkspaceControllerOptions) {
  const [workspaceMenuAnchor, setWorkspaceMenuAnchor] = useState<HTMLElement | null>(null);
  const [workspaceFolderPath, setWorkspaceFolderPath] = useState("");
  const [workspaceSetupOpen, setWorkspaceSetupOpen] = useState(false);
  const [workspaceSetupDefaultPath, setWorkspaceSetupDefaultPath] = useState("");
  const [workspaceSetupPending, setWorkspaceSetupPending] = useState(false);
  const workspaceAutosaveRef = useRef(createWorkspaceAutosaveState());
  const externalRevisionRef = useRef("");
  const pendingExternalRevisionRef = useRef({ fingerprint: "", seen: 0 });
  const externalReloadBusyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setIsNativeBridgeAvailable(hasNativeGrpcBridge());
    const storedTheme =
      window.localStorage.getItem("layang-theme") ?? window.localStorage.getItem("grpc-web-lab-theme");
    const initialThemeMode: ColorMode =
      storedTheme === "light" || storedTheme === "dark" ? storedTheme : prefersDark ? "dark" : "light";
    setThemeMode(initialThemeMode);
    const storedWorkspacePath = window.localStorage.getItem(workspaceFolderStorageKey) ?? "";
    setWorkspaceFolderPath(storedWorkspacePath);

    function rememberWorkspaceFolder(nextPath: string) {
      setWorkspaceFolderPath(nextPath);
      window.localStorage.setItem(workspaceFolderStorageKey, nextPath);
    }

    async function loadInitialWorkspace() {
      const cachedLayout = applyCachedLayout() as WorkspaceExportBundle["layout"];
      const cachedProject = readStoredProject();
      const workspacePreference = window.electronWorkspace?.getPreference
        ? await window.electronWorkspace.getPreference().catch(() => null)
        : null;

      if (storedWorkspacePath && window.electronWorkspace?.openFolder) {
        try {
          const result = await window.electronWorkspace.openFolder(storedWorkspacePath);
          if (!cancelled && result.ok && result.bundle) {
            const bundleRecord = result.bundle as { project?: { updatedAt?: string }; updatedAt?: string };
            const folderUpdatedAt = Date.parse(bundleRecord.project?.updatedAt ?? bundleRecord.updatedAt ?? "");
            const cachedUpdatedAt = Date.parse(cachedProject.updatedAt ?? "");
            const localDraftIsNewer =
              Number.isFinite(cachedUpdatedAt) && Number.isFinite(folderUpdatedAt) && cachedUpdatedAt > folderUpdatedAt;

            if (localDraftIsNewer) {
              const nextPath = result.directoryPath ?? storedWorkspacePath;
              rememberWorkspaceFolder(nextPath);
              applyProject(cachedProject);
              setHydrated(true);
              return;
            }

            const imported = applyWorkspaceBundle(result.bundle);
            if (imported) {
              const nextPath = result.directoryPath ?? storedWorkspacePath;
              rememberWorkspaceFolder(nextPath);
              setHydrated(true);
              return;
            }
          }
        } catch (err) {
          console.warn("Failed to auto-load workspace folder; falling back to local draft.", err);
        }
      }

      if (cancelled) return;

      if (!storedWorkspacePath && workspacePreference?.ok && !workspacePreference.hasCustomPreference) {
        setWorkspaceSetupDefaultPath(
          workspacePreference.defaultDirectoryPath ?? workspacePreference.directoryPath ?? "",
        );
        applyProject(cachedProject);
        setHydrated(true);
        setWorkspaceSetupOpen(true);
        return;
      }

      if (window.electronWorkspace?.ensureDefaultFolder) {
        try {
          const defaultWorkspaceBundle: WorkspaceExportBundle = {
            type: "layang-workspace",
            version: 5,
            exportedAt: new Date().toISOString(),
            app: "Layang",
            project: cachedProject,
            layout: cachedLayout,
            settings: { themeMode: initialThemeMode },
          };
          const result = await window.electronWorkspace.ensureDefaultFolder(defaultWorkspaceBundle);
          if (!cancelled && result.ok && result.directoryPath) {
            rememberWorkspaceFolder(result.directoryPath);
            if (result.bundle && !result.created) {
              const imported = applyWorkspaceBundle(result.bundle);
              if (imported) {
                setHydrated(true);
                return;
              }
            }
          }
        } catch (err) {
          console.warn("Failed to create default workspace folder; continuing with local draft.", err);
        }
      }

      if (cancelled) return;
      applyProject(cachedProject);
      setHydrated(true);
    }

    void loadInitialWorkspace();
    return () => {
      cancelled = true;
    };
  }, [prefersDark]);

  useEffect(() => {
    if (!workspaceFolderPath || !window.electronWorkspace?.getRevision || !window.electronWorkspace?.openFolder) return;
    let cancelled = false;
    externalRevisionRef.current = "";

    async function checkExternalWorkspaceChanges() {
      if (cancelled || externalReloadBusyRef.current) return;
      const autosave = workspaceAutosaveRef.current;
      if (autosave.saving || autosave.pendingBundle || autosave.flushPromise) return;

      const revision = await window.electronWorkspace?.getRevision?.(workspaceFolderPath).catch(() => null);
      if (!revision?.ok || !revision.fingerprint || revision.writeInProgress) return;

      // Internal autosave can touch many files. The main process records the final
      // fingerprint so those writes never masquerade as an external edit.
      if (revision.internalFingerprint && revision.fingerprint === revision.internalFingerprint) {
        externalRevisionRef.current = revision.fingerprint;
        pendingExternalRevisionRef.current = { fingerprint: "", seen: 0 };
        return;
      }

      if (!externalRevisionRef.current) {
        externalRevisionRef.current = revision.fingerprint;
        return;
      }
      if (externalRevisionRef.current === revision.fingerprint) {
        pendingExternalRevisionRef.current = { fingerprint: "", seen: 0 };
        return;
      }
      if (Date.now() - Number(revision.internalWriteAt || 0) < 2_000) return;

      // Wait until the same external fingerprint is observed twice. This avoids
      // reloading halfway through a Git checkout or an editor saving several files.
      const pending = pendingExternalRevisionRef.current;
      if (pending.fingerprint !== revision.fingerprint) {
        pendingExternalRevisionRef.current = { fingerprint: revision.fingerprint, seen: 1 };
        return;
      }
      pending.seen += 1;
      if (pending.seen < 2) return;

      externalReloadBusyRef.current = true;
      try {
        const result = await window.electronWorkspace?.openFolder?.(workspaceFolderPath);
        if (!cancelled && result?.ok && result.bundle && applyWorkspaceBundle(result.bundle)) {
          externalRevisionRef.current = revision.fingerprint;
          pendingExternalRevisionRef.current = { fingerprint: "", seen: 0 };
          showToast("Workspace reloaded after external file changes.", "info");
        }
      } catch (error) {
        if (!cancelled) showToast(`External workspace reload failed: ${toErrorMessage(error)}`, "warning");
      } finally {
        externalReloadBusyRef.current = false;
      }
    }

    void checkExternalWorkspaceChanges();
    const interval = window.setInterval(() => void checkExternalWorkspaceChanges(), 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [workspaceFolderPath, applyWorkspaceBundle, showToast]);

  async function applyWorkspacePreference(directoryPath?: string) {
    if (!window.electronWorkspace?.ensureFolder) return;

    setWorkspaceSetupPending(true);
    try {
      if (directoryPath) {
        await window.electronWorkspace.setPreference?.(directoryPath);
      } else {
        await window.electronWorkspace.setPreference?.("");
      }

      const targetPath = directoryPath || workspaceSetupDefaultPath;
      const result = await window.electronWorkspace.ensureFolder(getWorkspaceExportBundle(), targetPath);
      if (!result.ok || !result.directoryPath) {
        showToast(result.error || "Workspace folder setup failed.", "error");
        return;
      }

      if (result.bundle && !result.created) {
        const imported = applyWorkspaceBundle(result.bundle);
        if (!imported) {
          showToast("The selected folder does not contain supported workspace data.", "warning");
        }
      }

      setWorkspaceSetupOpen(false);
      setWorkspaceFolderPath(result.directoryPath);
      window.localStorage.setItem(workspaceFolderStorageKey, result.directoryPath);
      showToast("Workspace folder configured.", "success");
    } catch (err) {
      showToast(`Workspace folder setup failed: ${toErrorMessage(err)}`, "error");
    } finally {
      setWorkspaceSetupPending(false);
    }
  }

  async function chooseCustomWorkspacePreference() {
    if (!window.electronWorkspace?.chooseFolder) return;
    try {
      const result = await window.electronWorkspace.chooseFolder("Choose Layang workspace folder");
      if (!result.ok || result.cancelled || !result.directoryPath) return;
      await applyWorkspacePreference(result.directoryPath);
    } catch (err) {
      showToast(`Open workspace folder failed: ${toErrorMessage(err)}`, "error");
    }
  }

  return {
    workspaceMenuAnchor,
    setWorkspaceMenuAnchor,
    workspaceFolderPath,
    setWorkspaceFolderPath,
    workspaceSetupOpen,
    setWorkspaceSetupOpen,
    workspaceSetupDefaultPath,
    setWorkspaceSetupDefaultPath,
    workspaceSetupPending,
    setWorkspaceSetupPending,
    workspaceAutosaveRef,
    applyWorkspacePreference,
    chooseCustomWorkspacePreference,
  };
}
