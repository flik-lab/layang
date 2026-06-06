"use client";

import type { ColorMode } from "../../design-system";
import type {
  ProjectData,
  LegacyWorkspace,
  WorkspaceExportBundle,
  WorkspaceImportRecord,
  WorkspaceLayoutSnapshot,
} from "../../shared/workbench-types";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type WorkspaceBundleActionsScope = {
  applyProject: (project: ProjectData) => void;
  applyWorkspaceLayout: (layout: Partial<WorkspaceLayoutSnapshot>) => void;
  getLayoutSnapshot: () => WorkspaceLayoutSnapshot;
  getProjectSnapshot: () => ProjectData;
  looksLikeProjectData: (value: unknown) => boolean;
  normalizeProjectData: (value: Partial<ProjectData> | LegacyWorkspace | null | undefined) => ProjectData;
  projectStorageKey: string;
  setThemeMode: StateSetter<ColorMode>;
  themeMode: ColorMode;
};

export function useWorkspaceBundleActions(scope: WorkspaceBundleActionsScope) {
  const {
    applyProject,
    applyWorkspaceLayout,
    getLayoutSnapshot,
    getProjectSnapshot,
    looksLikeProjectData,
    normalizeProjectData,
    projectStorageKey,
    setThemeMode,
    themeMode,
  } = scope;

  function buildWorkspaceExportBundle(project = getProjectSnapshot()): WorkspaceExportBundle {
    return {
      type: "layang-workspace" as const,
      version: 4,
      exportedAt: new Date().toISOString(),
      app: "Layang",
      project,
      layout: getLayoutSnapshot(),
      settings: { themeMode },
    };
  }

  function getWorkspaceExportBundle(project = getProjectSnapshot()): WorkspaceExportBundle {
    return buildWorkspaceExportBundle(project);
  }

  function applyWorkspaceBundle(value: unknown): boolean {
    const envelope = typeof value === "object" && value !== null ? (value as WorkspaceImportRecord) : {};
    const payload = envelope.project ?? envelope.workspace;
    if (!payload && !looksLikeProjectData(envelope)) return false;

    const project = normalizeProjectData((payload ?? envelope) as Partial<ProjectData> | LegacyWorkspace);
    applyProject(project);
    window.localStorage.setItem(projectStorageKey, JSON.stringify(project));

    if (envelope.layout) {
      applyWorkspaceLayout(envelope.layout);
    }

    if (envelope.settings?.themeMode === "light" || envelope.settings?.themeMode === "dark") {
      setThemeMode(envelope.settings.themeMode);
      window.localStorage.setItem("layang-theme", envelope.settings.themeMode);
    }

    return true;
  }

  return { applyWorkspaceBundle, buildWorkspaceExportBundle, getWorkspaceExportBundle };
}
