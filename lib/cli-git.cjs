"use strict";

const path = require("node:path");
const git = require("./git-client.cjs");
const gitUx = require("./git-ux-v2.cjs");

async function handleGitCommand(parsed, stdout) {
  const command = parsed.command;
  const flags = parsed.flags || {};
  const workspace = path.resolve(parsed.workspace || ".");
  let result;

  switch (command) {
    case "git:init":
      result = await git.initRepository(workspace, { initialBranch: flags.branch || "main" });
      break;
    case "git:clone":
      if (!flags.url) throw new Error("git:clone requires --url <repository-url>.");
      if (!flags.directory) throw new Error("git:clone requires --directory <target-folder>.");
      result = await git.cloneRepository({
        url: flags.url,
        directoryPath: flags.directory,
        branch: flags.branch,
        depth: flags.depth,
      });
      break;
    case "git:status":
      result = await git.statusRepository(workspace);
      break;
    case "git:diff":
      result = await git.getDiff(workspace, {
        file: flags.file || flags.path,
        staged: flags.staged,
        context: flags.context,
      });
      break;
    case "git:stage":
      result = await git.stagePaths(workspace, pathFlags(flags));
      break;
    case "git:unstage":
      result = await git.unstagePaths(workspace, pathFlags(flags));
      break;
    case "git:discard": {
      const paths = pathFlags(flags);
      if (!paths.length) throw new Error("git:discard requires --path <file> and --yes.");
      if (!flags.yes) throw new Error("git:discard permanently removes local changes and requires --yes.");
      result = await git.discardPaths(workspace, paths);
      break;
    }
    case "git:commit": {
      const messages = Array.isArray(flags.message) ? flags.message : flags.message ? [flags.message] : [];
      const message = String(flags.commitMessage || messages[0] || "").trim();
      if (!message) throw new Error("git:commit requires --message <text>.");
      result = await git.commitChanges(workspace, {
        message,
        body: flags.body,
        runChecks: flags.check !== false,
        force: flags.force,
      });
      break;
    }
    case "git:log":
      result = await git.listLog(workspace, {
        file: flags.file || flags.path,
        maxCount: flags.limit || flags.maxCount,
      });
      break;
    case "git:branches":
      result = await git.listBranches(workspace);
      break;
    case "git:branch-create":
      if (!flags.branch && !flags.name) throw new Error("git:branch-create requires --branch <name>.");
      result = await git.createBranch(workspace, flags.branch || flags.name, {
        startPoint: flags.startPoint,
        switch: flags.switch !== false,
      });
      break;
    case "git:branch-switch":
      if (!flags.branch && !flags.name) throw new Error("git:branch-switch requires --branch <name>.");
      result = await git.switchBranch(workspace, flags.branch || flags.name, { force: flags.force });
      break;
    case "git:fetch":
      result = await git.fetchRepository(workspace, { remote: flags.remote });
      break;
    case "git:remote-add":
      if (!flags.url) throw new Error("git:remote-add requires --url <repository-url>.");
      result = await git.addRemote(workspace, { name: flags.remote || flags.name || "origin", url: flags.url });
      break;
    case "git:remote-remove":
      result = await git.removeRemote(workspace, flags.remote || flags.name || "origin");
      break;
    case "git:pull":
      result = await git.pullRepository(workspace, {
        remote: flags.remote,
        branch: flags.branch,
        rebase: flags.rebase,
      });
      break;
    case "git:push":
      result = await git.pushRepository(workspace, {
        remote: flags.remote,
        branch: flags.branch,
        setUpstream: flags.setUpstream,
      });
      break;
    case "git:check":
      result = await git.preCommitCheck(workspace, { documentation: flags.documentation !== false });
      break;
    case "git:secrets":
      result = await git.scanSecrets(workspace, { changedOnly: !flags.all });
      break;
    case "git:merge-continue":
      result = await git.continueMerge(workspace);
      break;
    case "git:merge-abort":
      result = await git.abortMerge(workspace);
      break;
    case "git:change-sets":
      result = await gitUx.listChangeSets(workspace);
      break;
    case "git:change-set-create":
      if (!flags.name) throw new Error("git:change-set-create requires --name <title>.");
      result = await gitUx.upsertChangeSet(workspace, {
        id: flags.id,
        name: flags.name,
        description: flags.description,
        color: flags.color,
        paths: pathFlags(flags),
      });
      break;
    case "git:change-set-delete":
      if (!flags.id) throw new Error("git:change-set-delete requires --id <change-set-id>.");
      result = await gitUx.deleteChangeSet(workspace, flags.id);
      break;
    case "git:change-set-assign":
      if (!flags.id) throw new Error("git:change-set-assign requires --id <change-set-id>.");
      if (!pathFlags(flags).length) throw new Error("git:change-set-assign requires --path <file>.");
      result = await gitUx.assignChangeSetPaths(workspace, { id: flags.id, paths: pathFlags(flags) });
      break;
    case "git:review":
      if (!flags.path) throw new Error("git:review requires --path <file>.");
      result = await gitUx.markReview(workspace, { path: firstFlag(flags.path), status: flags.status || "reviewed" });
      break;
    case "git:review-summary":
      result = await gitUx.getReviewSummary(workspace);
      break;
    case "git:diff-enhanced":
      if (!flags.path && !flags.file) throw new Error("git:diff-enhanced requires --path <file>.");
      result = await gitUx.getEnhancedDiff(workspace, {
        file: flags.file || firstFlag(flags.path),
        staged: flags.staged,
        context: flags.context,
      });
      break;
    case "git:hunk-stage":
      result = await gitUx.stageHunks(workspace, {
        file: flags.file || firstFlag(flags.path),
        hunkIds: repeatFlag(flags.hunk),
      });
      break;
    case "git:hunk-unstage":
      result = await gitUx.unstageHunks(workspace, {
        file: flags.file || firstFlag(flags.path),
        hunkIds: repeatFlag(flags.hunk),
      });
      break;
    case "git:hunk-discard":
      if (!flags.yes) throw new Error("git:hunk-discard permanently removes local lines and requires --yes.");
      result = await gitUx.discardHunks(workspace, {
        file: flags.file || firstFlag(flags.path),
        hunkIds: repeatFlag(flags.hunk),
      });
      break;
    case "git:field-stage":
      result = await gitUx.stageStructuredFields(workspace, {
        file: flags.file || firstFlag(flags.path),
        fields: repeatFlag(flags.field),
      });
      break;
    case "git:field-unstage":
      result = await gitUx.unstageStructuredFields(workspace, {
        file: flags.file || firstFlag(flags.path),
        fields: repeatFlag(flags.field),
      });
      break;
    case "git:change-sets-clear":
      result = await gitUx.clearCompletedChangeSets(workspace);
      break;
    case "git:incoming":
      result = await gitUx.getIncomingPreview(workspace, {
        upstream: flags.upstream,
        includeDiff: flags.includeDiff !== false,
        limit: flags.limit,
      });
      break;
    case "git:outgoing":
      result = await gitUx.getOutgoingPreview(workspace, { upstream: flags.upstream, limit: flags.limit });
      break;
    case "git:commit-show":
      if (!flags.oid && !flags.commit) throw new Error("git:commit-show requires --oid <commit>.");
      result = await gitUx.getCommitDetails(workspace, flags.oid || flags.commit, {
        includeDiff: flags.includeDiff !== false,
      });
      break;
    case "git:graph":
      result = await gitUx.getHistoryGraph(workspace, { maxCount: flags.limit });
      break;
    case "git:entity-history":
      if (!flags.file && !flags.path) throw new Error("git:entity-history requires --path <file>.");
      result = await gitUx.getEntityHistory(workspace, flags.file || firstFlag(flags.path), { maxCount: flags.limit });
      break;
    case "git:branch-health":
      result = await gitUx.getBranchHealth(workspace, { base: flags.base });
      break;
    case "git:conflict-predict":
      result = await gitUx.predictConflicts(workspace, { target: flags.target || flags.upstream || flags.base });
      break;
    case "git:conflict-details":
      result = await gitUx.getConflictDetails(workspace, flags.file || firstFlag(flags.path));
      break;
    case "git:conflict-resolve":
      result = await gitUx.resolveConflict(workspace, {
        file: flags.file || firstFlag(flags.path),
        mode: flags.mode || "custom",
        content: flags.content,
      });
      break;
    case "git:worktrees":
      result = await gitUx.listWorktrees(workspace);
      break;
    case "git:worktree-add":
      if (!flags.directory && !flags.path) throw new Error("git:worktree-add requires --directory <folder>.");
      result = await gitUx.addWorktree(workspace, {
        path: flags.directory || firstFlag(flags.path),
        ref: flags.ref,
        newBranch: flags.branch,
      });
      break;
    case "git:worktree-remove":
      if (!flags.directory && !flags.path) throw new Error("git:worktree-remove requires --directory <folder>.");
      result = await gitUx.removeWorktree(workspace, {
        path: flags.directory || firstFlag(flags.path),
        force: flags.force,
      });
      break;
    case "git:worktree-prune":
      result = await gitUx.pruneWorktrees(workspace);
      break;
    case "git:commit-suggest":
      result = await gitUx.suggestCommit(workspace, { staged: flags.staged !== false });
      break;
    default:
      throw new Error(`Unsupported Git command: ${command}`);
  }

  if (flags.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatGitResult(command, result));
  if (command === "git:check") return result.ok ? 0 : 1;
  if (command === "git:secrets") return result.findings.length ? 1 : 0;
  return 0;
}

function formatGitResult(command, result) {
  if (command === "git:diff" || command === "git:diff-enhanced")
    return `${result.text || "No line changes."}${result.text?.endsWith("\n") ? "" : "\n"}`;
  if (command === "git:log")
    return result.length
      ? `${result.map((item) => `${item.shortOid} ${item.subject} · ${item.authorName} · ${item.authoredAt}`).join("\n")}\n`
      : "No commits found.\n";
  if (command === "git:branches")
    return result.length
      ? `${result.map((item) => `${item.current ? "*" : " "} ${item.name}${item.upstream ? ` -> ${item.upstream}` : ""}${item.track ? ` ${item.track}` : ""}`).join("\n")}\n`
      : "No branches found.\n";
  if (command === "git:worktrees")
    return result.length
      ? `${result.map((item) => `${item.current ? "*" : " "} ${item.branch || (item.detached ? "detached" : "(no branch)")} · ${item.path}${item.locked ? " · locked" : ""}${item.prunable ? " · prunable" : ""}`).join("\n")}\n`
      : "No workspace copies found.\n";
  if (command === "git:entity-history")
    return result.length
      ? `${result.map((item) => `${item.shortOid} ${item.subject} · ${item.authorName} · ${item.authoredAt}`).join("\n")}\n`
      : "No entity history found.\n";
  if (command === "git:graph")
    return result.length
      ? `${result.map((item) => `${item.graph}${item.shortOid ? `${item.shortOid} ${item.subject}${item.refs ? ` (${item.refs})` : ""}` : ""}`).join("\n")}\n`
      : "No commits found.\n";
  if (command === "git:commit-show") {
    const lines = [
      `${result.shortOid} ${result.subject}`,
      `${result.authorName} <${result.authorEmail}> · ${result.authoredAt}`,
      `${result.files.length} changed file(s)`,
    ];
    for (const file of result.files)
      lines.push(`${file.status || "M"} ${file.path} · ${file.entity?.title || file.entity?.kind || "file"}`);
    return `${lines.join("\n")}\n`;
  }
  if (command === "git:change-sets") {
    const lines = [];
    for (const set of result.sets || [])
      lines.push(
        `${set.name} · ${set.changes.length} change(s) · ${set.stagedCount} staged · ${set.reviewedCount} reviewed`,
      );
    if ((result.unassigned || []).length) lines.push(`Unassigned Changes · ${result.unassigned.length}`);
    return lines.length ? `${lines.join("\n")}\n` : "No Change Sets or unassigned changes.\n";
  }
  if (command === "git:review-summary") {
    const excluded = (result.items || []).filter((item) => item.review === "excluded").length;
    return `Review: ${result.reviewed} reviewed, ${result.notReviewed} pending, ${result.needsAttention} need attention, ${excluded} excluded\n`;
  }
  if (command === "git:commit") return `Committed ${result.shortOid}: ${result.subject}\n`;
  if (command === "git:commit-suggest") return `${result.subject}\n${result.body ? `\n${result.body}\n` : ""}`;
  if (command === "git:incoming" || command === "git:outgoing")
    return `${command.slice(4)}: ${result.commits.length} commit(s), ${result.changes.length} changed entities\n`;
  if (command === "git:branch-health")
    return `Branch ${result.branch} vs ${result.base || "(none)"}: ↑${result.ahead} ↓${result.behind}, ${result.conflicts.length} conflict risk(s)\n`;
  if (command === "git:conflict-predict")
    return `Conflict prediction: ${result.risks.length} risk(s), ${result.safeOverlaps.length} safe overlap(s)\n`;
  if (command === "git:remote-add" || command === "git:remote-remove") return formatStatus(result);
  if (command === "git:check") {
    const lines = [`Pre-commit checks: ${result.ok ? "PASS" : "FAIL"}`];
    for (const item of result.checks) lines.push(`${item.passed ? "✓" : item.blocking ? "✗" : "!"} ${item.message}`);
    return `${lines.join("\n")}\n`;
  }
  if (command === "git:secrets") {
    if (!result.findings.length) return "No obvious secrets detected.\n";
    return `${result.findings.map((item) => `${item.severity.toUpperCase()} ${item.file}:${item.line} ${item.rule} ${item.preview}`).join("\n")}\n`;
  }
  if (result?.initialized !== undefined && result?.changes) {
    return formatStatus(result);
  }
  return `${command} completed.\n`;
}

function formatStatus(status) {
  const lines = [
    `Repository: ${status.root}`,
    `Branch: ${status.branch || "detached"}${status.upstream ? ` -> ${status.upstream}` : ""}`,
    `Sync: ↑${status.ahead || 0} ↓${status.behind || 0}`,
    `Changes: ${status.changes.length} (${status.stagedCount} staged, ${status.unstagedCount} unstaged, ${status.conflictCount} conflicts)`,
  ];
  for (const change of status.changes) {
    const marker = change.conflict ? "UU" : change.untracked ? "??" : change.xy;
    lines.push(`${marker} ${change.path} · ${change.entity.kind}`);
  }
  return `${lines.join("\n")}\n`;
}

function firstFlag(value) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}
function repeatFlag(value) {
  return Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
}

function pathFlags(flags) {
  const value = flags.path ?? flags.file;
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

module.exports = { handleGitCommand, formatGitResult };
