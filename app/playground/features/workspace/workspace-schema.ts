/**
 * Workspace file names used by the Electron local-first folder bridge.
 *
 * This module is intentionally pure so it can be reused by a future CLI,
 * a file watcher, or tests without importing React/Electron UI code.
 */
export const workspaceFiles = {
  manifest: "layang.yml",
  collectionsDir: "collections",
  protosDir: "protos",
  environmentsDir: "environments",
  examplesDir: "examples",
  mocksDir: "mocks",
  docsDir: "docs/published",
  localDir: ".layang",

  // Legacy v4 migration inputs. These are read only when layang.yml is absent.
  snapshot: "layang.workspace.json",
  project: "project.json",
  layout: "layout.json",
  settings: "settings.json",
  legacyEnvironments: "environments/environments.json",
  collections: "collections/collections.json",
  legacyCollections: "collections/collections.json",
  legacyExamples: "examples/examples.json",
  legacyDocs: "docs/published-docs.json",
  legacyDocResults: "docs/saved-results.json",
  legacyRequestTabs: "requests/tabs.json",
  legacyHistory: "history/history.json",
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
