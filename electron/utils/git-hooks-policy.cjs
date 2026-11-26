"use strict";

/**
 * Asks the user before Layang runs a repository's Git hooks.
 *
 * Hooks are programs that live in the repository (`.git/hooks` or the folder named
 * by `core.hooksPath`). A workspace that came from somewhere else, such as a
 * downloaded ZIP with a `.git` folder, can carry hooks that run on commit, push,
 * pull or checkout. The first time an operation that can run hooks is used in a
 * repository that has hooks, the main process shows a native dialog. The answer
 * is remembered per repository together with the list of hook names, so the user
 * is asked again when the hooks change.
 */

const fs = require("node:fs");
const path = require("node:path");

const STORE_VERSION = 1;
const MAX_REMEMBERED_REPOSITORIES = 200;

/** IPC channels whose Git commands can run hooks (commit, push, merge, checkout). */
const HOOK_RUNNING_GIT_CHANNELS = Object.freeze([
  "git:commit",
  "git:merge-continue",
  "git:pull",
  "git:push",
  "git:branch-create",
  "git:branch-switch",
  "git:discard",
  "git:hunk-discard",
  "git:worktree-add",
]);

function createGitHooksPolicy(options = {}) {
  const storePath = options.storePath || "";
  const listHooks = options.listHooks;
  const confirm = typeof options.confirm === "function" ? options.confirm : async () => "skip";
  const platform = options.platform || process.platform;
  const logger = options.logger || null;
  const decisions = new Map();

  const keyFor = (root) => {
    const resolved = path.resolve(root);
    return platform === "win32" || platform === "darwin" ? resolved.toLowerCase() : resolved;
  };

  function load() {
    if (!storePath) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
      for (const item of Array.isArray(parsed?.repositories) ? parsed.repositories : []) {
        if (!item || typeof item.root !== "string") continue;
        if (item.decision !== "run" && item.decision !== "skip") continue;
        decisions.set(keyFor(item.root), {
          root: item.root,
          decision: item.decision,
          hooks: Array.isArray(item.hooks) ? item.hooks.map(String) : [],
        });
      }
    } catch (error) {
      if (error?.code !== "ENOENT") logger?.warn?.("failed to read Git hook decisions", { error: String(error) });
    }
  }

  function persist() {
    if (!storePath) return;
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      const tempPath = `${storePath}.${process.pid}.tmp`;
      fs.writeFileSync(
        tempPath,
        `${JSON.stringify({ version: STORE_VERSION, repositories: [...decisions.values()] }, null, 2)}\n`,
        { mode: 0o600 },
      );
      fs.renameSync(tempPath, storePath);
    } catch (error) {
      logger?.warn?.("failed to persist Git hook decisions", { error: String(error) });
    }
  }

  function remember(root, decision, hooks) {
    const key = keyFor(root);
    decisions.delete(key);
    decisions.set(key, { root, decision, hooks });
    while (decisions.size > MAX_REMEMBERED_REPOSITORIES) decisions.delete(decisions.keys().next().value);
    persist();
  }

  /**
   * Returns "run", "skip" or "cancel" for an operation in `directoryPath`.
   * Repositories without hooks always return "run".
   */
  async function decide(directoryPath) {
    let found;
    try {
      found = await listHooks(directoryPath);
    } catch {
      // Not a repository (yet) or Git missing: the operation itself reports that error.
      return "run";
    }
    if (!found || !Array.isArray(found.hooks) || found.hooks.length === 0) return "run";

    const saved = decisions.get(keyFor(found.root));
    if (saved && saved.hooks.join("\n") === found.hooks.join("\n")) return saved.decision;

    const answer = await confirm({ root: found.root, hooksDirectory: found.hooksDirectory, hooks: found.hooks });
    if (answer === "run" || answer === "skip") {
      remember(found.root, answer, found.hooks);
      return answer;
    }
    return "cancel";
  }

  load();
  return { decide };
}

let activePolicy = null;

function configureGitHooksPolicy({ app, dialog, getWindow, listHooks, logger } = {}) {
  activePolicy = createGitHooksPolicy({
    storePath: app ? path.join(app.getPath("userData"), "git-hook-decisions.json") : "",
    listHooks,
    logger,
    confirm: async ({ root, hooks }) => {
      if (!dialog) return "skip";
      const win = typeof getWindow === "function" ? getWindow() : undefined;
      const result = await dialog.showMessageBox(win || undefined, {
        type: "warning",
        buttons: ["Skip hooks", "Run hooks", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: "Git hooks",
        message: "This repository has Git hooks. Run them?",
        detail:
          `${root}\n\nHooks: ${hooks.join(", ")}\n\n` +
          "Git hooks are programs stored in the repository. They run on your computer when you commit, " +
          "push, pull or switch branches. Only run them if you trust where this repository came from.\n\n" +
          "Layang remembers your answer for this repository and asks again if its hooks change.",
      });
      return result.response === 1 ? "run" : result.response === 0 ? "skip" : "cancel";
    },
  });
  return activePolicy;
}

function getGitHooksPolicy() {
  if (!activePolicy) throw new Error("Git hooks policy is not configured.");
  return activePolicy;
}

module.exports = {
  HOOK_RUNNING_GIT_CHANNELS,
  configureGitHooksPolicy,
  createGitHooksPolicy,
  getGitHooksPolicy,
};
