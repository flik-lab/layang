"use strict";

/**
 * Main-process registry of workspace folders the user has granted Layang access to.
 *
 * The renderer names folders in many IPC payloads (`directoryPath`, `workspacePath`).
 * Without this registry a compromised renderer could name any folder on disk
 * (for example a system directory) and have the main process write, open or run
 * Git inside it. A folder becomes trusted only through a user-controlled path:
 *
 * - a native folder dialog,
 * - the default per-user workspace folder,
 * - the saved workspace preference or a CLI launch argument,
 * - a native confirmation dialog shown by the main process (`requestAccess`).
 *
 * Trusted roots are persisted so previously opened workspaces keep working.
 * A path is allowed when it is a trusted root or lies inside one.
 */

const fs = require("node:fs");
const path = require("node:path");

const MAX_TRUSTED_ROOTS = 100;
const STORE_VERSION = 1;

class WorkspaceAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkspaceAccessError";
    this.code = "WORKSPACE_NOT_TRUSTED";
  }
}

function isCaseInsensitivePlatform(platform) {
  return platform === "win32" || platform === "darwin";
}

/**
 * Resolves a path and follows symlinks for the deepest existing ancestor, so a
 * symlink inside a trusted folder cannot point the check somewhere else.
 */
function canonicalizePath(input, { realpath = fs.realpathSync.native } = {}) {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw || raw.includes("\u0000")) return "";
  const resolved = path.resolve(raw);
  const missing = [];
  let current = resolved;
  for (;;) {
    try {
      const real = realpath(current);
      return missing.length ? path.join(real, ...missing.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return resolved;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

function createWorkspaceAccess(options = {}) {
  const platform = options.platform || process.platform;
  const storePath = options.storePath || "";
  const confirm = typeof options.confirm === "function" ? options.confirm : async () => false;
  const realpath = options.realpath || fs.realpathSync.native;
  const logger = options.logger || null;
  const roots = new Map();

  const compareKey = (value) => (isCaseInsensitivePlatform(platform) ? value.toLowerCase() : value);
  const canonical = (value) => canonicalizePath(value, { realpath });

  function load() {
    if (!storePath) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
      const list = Array.isArray(parsed?.roots) ? parsed.roots : [];
      for (const item of list) addRoot(item, { persist: false });
    } catch (error) {
      if (error?.code !== "ENOENT") logger?.warn?.("failed to read trusted workspace roots", { error: String(error) });
    }
  }

  function persist() {
    if (!storePath) return;
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      const tempPath = `${storePath}.${process.pid}.tmp`;
      fs.writeFileSync(tempPath, `${JSON.stringify({ version: STORE_VERSION, roots: [...roots.values()] }, null, 2)}\n`, {
        mode: 0o600,
      });
      fs.renameSync(tempPath, storePath);
    } catch (error) {
      logger?.warn?.("failed to persist trusted workspace roots", { error: String(error) });
    }
  }

  function isFilesystemRoot(value) {
    return path.dirname(value) === value;
  }

  function addRoot(directoryPath, { persist: shouldPersist = true } = {}) {
    const value = canonical(directoryPath);
    // Never trust a whole drive or `/`: that would make the registry meaningless.
    if (!value || isFilesystemRoot(value)) return "";
    const key = compareKey(value);
    roots.delete(key);
    roots.set(key, value);
    while (roots.size > MAX_TRUSTED_ROOTS) roots.delete(roots.keys().next().value);
    if (shouldPersist) persist();
    return value;
  }

  function findTrustedRoot(targetPath) {
    const value = canonical(targetPath);
    if (!value) return "";
    const key = compareKey(value);
    for (const [rootKey, rootValue] of roots) {
      if (key === rootKey || key.startsWith(rootKey.endsWith(path.sep) ? rootKey : `${rootKey}${path.sep}`)) {
        return rootValue;
      }
    }
    return "";
  }

  function isAllowed(targetPath) {
    return Boolean(findTrustedRoot(targetPath));
  }

  /** Returns the resolved path, or throws when it is outside every trusted root. */
  function assertAllowed(targetPath) {
    const raw = typeof targetPath === "string" ? targetPath.trim() : "";
    if (!raw) throw new WorkspaceAccessError("Workspace directory is required.");
    if (raw.includes("\u0000")) throw new WorkspaceAccessError("Invalid workspace directory.");
    if (!isAllowed(raw)) {
      throw new WorkspaceAccessError(
        "Layang has not been given access to this folder. Open it with Open workspace folder first.",
      );
    }
    return path.resolve(raw);
  }

  /**
   * Allows the folder if it is already trusted; otherwise asks the user with a
   * native dialog owned by the main process. Returns the resolved path or "".
   */
  async function requestAccess(targetPath, context = {}) {
    const raw = typeof targetPath === "string" ? targetPath.trim() : "";
    if (!raw || raw.includes("\u0000")) return "";
    if (isAllowed(raw)) return path.resolve(raw);
    const value = canonical(raw);
    if (!value || isFilesystemRoot(value)) return "";
    const approved = await confirm(value, context);
    if (!approved) return "";
    addRoot(value);
    return path.resolve(raw);
  }

  function list() {
    return [...roots.values()];
  }

  load();

  return { addRoot, assertAllowed, isAllowed, requestAccess, findTrustedRoot, list };
}

let activeWorkspaceAccess = null;

/**
 * Creates the process-wide registry. `dialog` and `getWindow` come from Electron;
 * they are injected so this module stays loadable in plain Node tests.
 */
function configureWorkspaceAccess({ app, dialog, getWindow, logger } = {}) {
  activeWorkspaceAccess = createWorkspaceAccess({
    storePath: app ? path.join(app.getPath("userData"), "trusted-workspaces.json") : "",
    logger,
    confirm: async (directoryPath, context = {}) => {
      if (!dialog) return false;
      const win = typeof getWindow === "function" ? getWindow() : undefined;
      const result = await dialog.showMessageBox(win || undefined, {
        type: "question",
        buttons: ["Allow", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: "Allow folder access",
        message: "Allow Layang to use this folder?",
        detail: `${directoryPath}\n\n${
          context.reason || "Layang will read and write workspace files in this folder."
        }\n\nOnly allow folders you chose yourself.`,
      });
      return result.response === 0;
    },
  });
  return activeWorkspaceAccess;
}

function getWorkspaceAccess() {
  if (!activeWorkspaceAccess) activeWorkspaceAccess = createWorkspaceAccess();
  return activeWorkspaceAccess;
}

module.exports = {
  WorkspaceAccessError,
  canonicalizePath,
  configureWorkspaceAccess,
  createWorkspaceAccess,
  getWorkspaceAccess,
};
