/**
 * Workspace file names used by the Electron local-first folder bridge.
 *
 * This module is intentionally pure so it can be reused by a future CLI,
 * a file watcher, or tests without importing React/Electron UI code.
 */
export const workspaceFiles = {
  snapshot: "layang.workspace.json",
  project: "project.json",
  layout: "layout.json",
  settings: "settings.json",
  protosDir: "protos",
  environments: "environments/environments.json",
  examples: "examples/examples.json",
  docs: "docs/published-docs.json",
  docResults: "docs/saved-results.json",
  requestTabs: "requests/tabs.json",
  history: "history/history.json",
} as const;

/** Workspace envelope accepted by current and legacy importers. */
export type WorkspaceEnvelope = {
  type: "layang-workspace" | "grpc-lab-workspace";
  version: number;
  exportedAt: string;
  app: "Layang" | "gRPC Lab" | string;
  project: unknown;
  layout?: unknown;
  settings?: unknown;
};

/** Returns true when a value looks like a workspace envelope. */
export function isWorkspaceEnvelope(value: unknown): value is WorkspaceEnvelope {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<WorkspaceEnvelope>;
  return (
    record.type === "layang-workspace" || record.type === "grpc-lab-workspace" || typeof record.project === "object"
  );
}
