"use strict";

const path = require("node:path");
const { ipcMain } = require("electron");
const git = require("../../lib/git-client.cjs");
const gitUx = require("../../lib/git-ux-v2.cjs");

function registerGitIpc() {
  handle("git:info", async (payload) => git.detectRepository(requireDirectory(payload)));
  handle("git:init", async (payload) => git.initRepository(requireDirectory(payload), payload || {}));
  handle("git:clone", async (payload) =>
    git.cloneRepository({
      url: payload?.url,
      directoryPath: requireDirectory(payload),
      branch: payload?.branch,
      depth: payload?.depth,
    }),
  );
  handle("git:status", async (payload) => git.statusRepository(requireDirectory(payload)));
  handle("git:diff", async (payload) => git.getDiff(requireDirectory(payload), payload || {}));
  handle("git:stage", async (payload) => git.stagePaths(requireDirectory(payload), payload?.paths));
  handle("git:unstage", async (payload) => git.unstagePaths(requireDirectory(payload), payload?.paths));
  handle("git:discard", async (payload) => git.discardPaths(requireDirectory(payload), payload?.paths));
  handle("git:commit", async (payload) => git.commitChanges(requireDirectory(payload), payload || {}));
  handle("git:log", async (payload) => git.listLog(requireDirectory(payload), payload || {}));
  handle("git:branches", async (payload) => git.listBranches(requireDirectory(payload)));
  handle("git:branch-create", async (payload) =>
    git.createBranch(requireDirectory(payload), payload?.name, payload || {}),
  );
  handle("git:branch-switch", async (payload) =>
    git.switchBranch(requireDirectory(payload), payload?.name, payload || {}),
  );
  handle("git:fetch", async (payload) => git.fetchRepository(requireDirectory(payload), payload || {}));
  handle("git:remote-add", async (payload) => git.addRemote(requireDirectory(payload), payload || {}));
  handle("git:remote-remove", async (payload) => git.removeRemote(requireDirectory(payload), payload?.name));
  handle("git:pull", async (payload) => git.pullRepository(requireDirectory(payload), payload || {}));
  handle("git:push", async (payload) => git.pushRepository(requireDirectory(payload), payload || {}));
  handle("git:check", async (payload) => git.preCommitCheck(requireDirectory(payload), payload || {}));
  handle("git:scan-secrets", async (payload) => git.scanSecrets(requireDirectory(payload), payload || {}));
  handle("git:merge-continue", async (payload) => git.continueMerge(requireDirectory(payload)));
  handle("git:merge-abort", async (payload) => git.abortMerge(requireDirectory(payload)));

  handle("git:ux-state", async (payload) => gitUx.getGitUxState(requireDirectory(payload)));
  handle("git:change-sets", async (payload) => gitUx.listChangeSets(requireDirectory(payload)));
  handle("git:change-set-save", async (payload) => gitUx.upsertChangeSet(requireDirectory(payload), payload || {}));
  handle("git:change-set-delete", async (payload) => gitUx.deleteChangeSet(requireDirectory(payload), payload?.id));
  handle("git:change-set-assign", async (payload) =>
    gitUx.assignChangeSetPaths(requireDirectory(payload), payload || {}),
  );
  handle("git:review-mark", async (payload) => gitUx.markReview(requireDirectory(payload), payload || {}));
  handle("git:review-summary", async (payload) => gitUx.getReviewSummary(requireDirectory(payload)));
  handle("git:diff-enhanced", async (payload) => gitUx.getEnhancedDiff(requireDirectory(payload), payload || {}));
  handle("git:hunk-stage", async (payload) => gitUx.stageHunks(requireDirectory(payload), payload || {}));
  handle("git:hunk-unstage", async (payload) => gitUx.unstageHunks(requireDirectory(payload), payload || {}));
  handle("git:hunk-discard", async (payload) => gitUx.discardHunks(requireDirectory(payload), payload || {}));
  handle("git:field-stage", async (payload) => gitUx.stageStructuredFields(requireDirectory(payload), payload || {}));
  handle("git:field-unstage", async (payload) =>
    gitUx.unstageStructuredFields(requireDirectory(payload), payload || {}),
  );
  handle("git:change-sets-clear-completed", async (payload) =>
    gitUx.clearCompletedChangeSets(requireDirectory(payload)),
  );
  handle("git:incoming", async (payload) => gitUx.getIncomingPreview(requireDirectory(payload), payload || {}));
  handle("git:outgoing", async (payload) => gitUx.getOutgoingPreview(requireDirectory(payload), payload || {}));
  handle("git:commit-details", async (payload) =>
    gitUx.getCommitDetails(requireDirectory(payload), payload?.oid, payload || {}),
  );
  handle("git:history-graph", async (payload) => gitUx.getHistoryGraph(requireDirectory(payload), payload || {}));
  handle("git:entity-history", async (payload) =>
    gitUx.getEntityHistory(requireDirectory(payload), payload?.file, payload || {}),
  );
  handle("git:branch-health", async (payload) => gitUx.getBranchHealth(requireDirectory(payload), payload || {}));
  handle("git:conflict-predict", async (payload) => gitUx.predictConflicts(requireDirectory(payload), payload || {}));
  handle("git:conflict-details", async (payload) => gitUx.getConflictDetails(requireDirectory(payload), payload?.file));
  handle("git:conflict-resolve", async (payload) => gitUx.resolveConflict(requireDirectory(payload), payload || {}));
  handle("git:worktrees", async (payload) => gitUx.listWorktrees(requireDirectory(payload)));
  handle("git:worktree-add", async (payload) => gitUx.addWorktree(requireDirectory(payload), payload || {}));
  handle("git:worktree-remove", async (payload) => gitUx.removeWorktree(requireDirectory(payload), payload || {}));
  handle("git:worktree-prune", async (payload) => gitUx.pruneWorktrees(requireDirectory(payload)));
  handle("git:commit-suggest", async (payload) => gitUx.suggestCommit(requireDirectory(payload), payload || {}));
}

function handle(channel, action) {
  ipcMain.handle(channel, async (_event, payload) => {
    try {
      const result = await action(payload || {});
      return { ok: true, result };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        check: error?.check,
      };
    }
  });
}

function requireDirectory(payload) {
  const value = String(payload?.directoryPath || "").trim();
  if (!value) throw new Error("Workspace directory is required.");
  if (value.includes("\u0000")) throw new Error("Invalid workspace directory.");
  return path.resolve(value);
}

module.exports = { registerGitIpc };
