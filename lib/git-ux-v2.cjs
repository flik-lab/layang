"use strict";

const _fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const crypto = require("node:crypto");
const core = require("./git-client.cjs");
const { parseYaml, stringifyYaml } = require("./workspace-yaml.cjs");

const execFileAsync = promisify(execFile);
const STATE_VERSION = 2;
const MAX_OUTPUT = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT = 60_000;
const SAFE_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  LC_ALL: "C",
  LANG: "C",
};

async function getGitUxState(directoryPath) {
  const root = await repositoryRoot(directoryPath);
  const file = stateFile(root);
  const raw = await fsp.readFile(file, "utf8").catch(() => "");
  let parsed = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  return normalizeState(parsed);
}

async function saveGitUxState(directoryPath, nextState) {
  const root = await repositoryRoot(directoryPath);
  const state = normalizeState(nextState);
  const file = stateFile(root);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await ensureLocalStateExcluded(root);
  await atomicWrite(file, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

async function listChangeSets(directoryPath) {
  const root = await repositoryRoot(directoryPath);
  const [state, status] = await Promise.all([getGitUxState(root), core.statusRepository(root)]);
  const changesByPath = new Map(status.changes.map((change) => [change.path, change]));
  const assigned = new Set();
  const sets = state.changeSets.map((set) => {
    const changes = set.paths.map((item) => changesByPath.get(item)).filter(Boolean);
    changes.forEach((item) => {
      assigned.add(item.path);
    });
    return {
      ...set,
      changes,
      missingPaths: set.paths.filter((item) => !changesByPath.has(item)),
      stagedCount: changes.filter((item) => item.staged).length,
      reviewedCount: changes.filter((item) => state.reviews[item.path]?.status === "reviewed").length,
    };
  });
  const unassigned = status.changes.filter((change) => !assigned.has(change.path));
  return {
    sets,
    unassigned,
    suggestions: suggestChangeSets(status.changes, state.changeSets),
    reviews: state.reviews,
  };
}

async function upsertChangeSet(directoryPath, input = {}) {
  const root = await repositoryRoot(directoryPath);
  const state = await getGitUxState(root);
  const id = sanitizeId(input.id || createId("change-set"));
  const now = new Date().toISOString();
  const current = state.changeSets.find((item) => item.id === id);
  const paths = normalizeRelativePaths(root, input.paths ?? current?.paths ?? []);
  const next = {
    id,
    name: cleanText(input.name ?? current?.name ?? "Change Set", 120),
    description: cleanText(input.description ?? current?.description ?? "", 1000),
    color: normalizeColor(input.color ?? current?.color),
    paths,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
  state.changeSets = [...state.changeSets.filter((item) => item.id !== id), next];
  await saveGitUxState(root, state);
  return listChangeSets(root);
}

async function deleteChangeSet(directoryPath, id) {
  const root = await repositoryRoot(directoryPath);
  const state = await getGitUxState(root);
  state.changeSets = state.changeSets.filter((item) => item.id !== sanitizeId(id));
  await saveGitUxState(root, state);
  return listChangeSets(root);
}

async function assignChangeSetPaths(directoryPath, input = {}) {
  const root = await repositoryRoot(directoryPath);
  const state = await getGitUxState(root);
  const setId = sanitizeId(input.id);
  const paths = normalizeRelativePaths(root, input.paths);
  for (const set of state.changeSets) set.paths = set.paths.filter((item) => !paths.includes(item));
  const target = state.changeSets.find((item) => item.id === setId);
  if (!target) throw new Error("Change Set was not found.");
  target.paths = [...new Set([...target.paths, ...paths])].sort();
  target.updatedAt = new Date().toISOString();
  await saveGitUxState(root, state);
  return listChangeSets(root);
}

async function markReview(directoryPath, input = {}) {
  const root = await repositoryRoot(directoryPath);
  const state = await getGitUxState(root);
  const relative = safeRelativePath(root, input.path);
  const status = ["reviewed", "needs-attention", "excluded", "not-reviewed"].includes(input.status)
    ? input.status
    : "reviewed";
  if (status === "not-reviewed") delete state.reviews[relative];
  else state.reviews[relative] = { status, updatedAt: new Date().toISOString() };
  await saveGitUxState(root, state);
  return state.reviews;
}

async function clearCompletedChangeSets(directoryPath) {
  const root = await repositoryRoot(directoryPath);
  const [state, status] = await Promise.all([getGitUxState(root), core.statusRepository(root)]);
  const changed = new Set(status.changes.map((item) => item.path));
  state.changeSets = state.changeSets.filter((set) => set.paths.some((item) => changed.has(item)));
  for (const file of Object.keys(state.reviews)) if (!changed.has(file)) delete state.reviews[file];
  await saveGitUxState(root, state);
  return listChangeSets(root);
}

async function getEnhancedDiff(directoryPath, options = {}) {
  const root = await repositoryRoot(directoryPath);
  const file = safeRelativePath(root, options.file);
  const staged = Boolean(options.staged);
  const diff = await core.getDiff(root, { file, staged, context: options.context ?? 4 });
  const parsed = parseUnifiedDiff(diff.text);
  const versions = await readFileVersions(root, file);
  const leftText = staged ? versions.head : versions.index;
  const rightText = staged ? versions.index : versions.worktree;
  const structured = buildStructuredDiff(file, leftText, rightText, parsed.hunks);
  return {
    ...diff,
    hunks: parsed.hunks,
    files: parsed.files,
    structured,
    leftLabel: staged ? "HEAD" : "Index",
    rightLabel: staged ? "Staged" : "Working Tree",
    leftText,
    rightText,
  };
}

async function stageHunks(directoryPath, input = {}) {
  const root = await repositoryRoot(directoryPath);
  const file = safeRelativePath(root, input.file);
  const diff = await core.getDiff(root, { file, staged: false, context: 4 });
  const patch = selectHunks(diff.text, input.hunkIds);
  if (!patch.trim()) throw new Error("No matching diff hunk was selected.");
  await runGitWithInput(root, ["apply", "--cached", "--whitespace=nowarn", "--recount", "-"], patch);
  return core.statusRepository(root);
}

async function unstageHunks(directoryPath, input = {}) {
  const root = await repositoryRoot(directoryPath);
  const file = safeRelativePath(root, input.file);
  const diff = await core.getDiff(root, { file, staged: true, context: 4 });
  const patch = selectHunks(diff.text, input.hunkIds);
  if (!patch.trim()) throw new Error("No matching staged hunk was selected.");
  await runGitWithInput(root, ["apply", "--cached", "--reverse", "--whitespace=nowarn", "--recount", "-"], patch);
  return core.statusRepository(root);
}

async function discardHunks(directoryPath, input = {}) {
  const root = await repositoryRoot(directoryPath);
  const file = safeRelativePath(root, input.file);
  const diff = await core.getDiff(root, { file, staged: false, context: 4 });
  const patch = selectHunks(diff.text, input.hunkIds);
  if (!patch.trim()) throw new Error("No matching diff hunk was selected.");
  await runGitWithInput(root, ["apply", "--reverse", "--whitespace=nowarn", "--recount", "-"], patch);
  return core.statusRepository(root);
}

async function stageStructuredFields(directoryPath, input = {}) {
  const root = await repositoryRoot(directoryPath);
  const file = safeRelativePath(root, input.file);
  const fields = normalizeFieldPaths(input.fields);
  if (!fields.length) throw new Error("Select one or more structured fields to stage.");
  const versions = await readFileVersions(root, file);
  const format = structuredFormat(file);
  if (!format) throw new Error("Semantic field staging supports deterministic YAML and JSON files.");
  const indexText = versions.index || emptyStructuredText(format);
  const worktreeText = versions.worktree || emptyStructuredText(format);
  const indexValue = parseStructuredText(format, indexText);
  const worktreeValue = parseStructuredText(format, worktreeText);
  for (const field of fields) copyStructuredPath(indexValue, worktreeValue, field);
  const nextText =
    format === "yaml"
      ? patchYamlFields(indexText, worktreeText, fields) || serializeStructuredText(format, indexValue)
      : serializeStructuredText(format, indexValue);
  await updateIndexContent(root, file, deepEqual(indexValue, worktreeValue) ? worktreeText : nextText);
  return core.statusRepository(root);
}

async function unstageStructuredFields(directoryPath, input = {}) {
  const root = await repositoryRoot(directoryPath);
  const file = safeRelativePath(root, input.file);
  const fields = normalizeFieldPaths(input.fields);
  if (!fields.length) throw new Error("Select one or more structured fields to unstage.");
  const versions = await readFileVersions(root, file);
  const format = structuredFormat(file);
  if (!format) throw new Error("Semantic field staging supports deterministic YAML and JSON files.");
  const indexText = versions.index || emptyStructuredText(format);
  const headText = versions.head || emptyStructuredText(format);
  const indexValue = parseStructuredText(format, indexText);
  const headValue = parseStructuredText(format, headText);
  for (const field of fields) copyStructuredPath(indexValue, headValue, field);
  const nextText =
    format === "yaml"
      ? patchYamlFields(indexText, headText, fields) || serializeStructuredText(format, indexValue)
      : serializeStructuredText(format, indexValue);
  await updateIndexContent(root, file, deepEqual(indexValue, headValue) ? headText : nextText);
  return core.statusRepository(root);
}

async function getIncomingPreview(directoryPath, options = {}) {
  const root = await repositoryRoot(directoryPath);
  const status = await core.statusRepository(root);
  const upstream = options.upstream || status.upstream;
  if (!upstream) return { available: false, upstream: "", commits: [], changes: [], diff: "", behind: 0 };
  const count = await runGit(root, ["rev-list", "--count", `HEAD..${upstream}`], { allowExitCodes: [0, 128] });
  const behind = Number(count.stdout.trim() || 0);
  const commits = await readCommitRange(root, `HEAD..${upstream}`, options.limit || 50);
  const nameStatus = await runGit(root, ["diff", "--name-status", "--find-renames", `HEAD..${upstream}`], {
    allowExitCodes: [0, 128],
  });
  const changes = parseNameStatus(nameStatus.stdout).map((item) => ({
    ...item,
    entity: core.describeWorkspaceEntity(item.path),
  }));
  const diff =
    options.includeDiff === false
      ? ""
      : (await runGit(root, ["diff", "--no-color", "--stat", `HEAD..${upstream}`], { allowExitCodes: [0, 128] }))
          .stdout;
  const prevention = await predictConflicts(root, { target: upstream });
  return { available: true, upstream, commits, changes, diff, behind, prevention };
}

async function getOutgoingPreview(directoryPath, options = {}) {
  const root = await repositoryRoot(directoryPath);
  const status = await core.statusRepository(root);
  const upstream = options.upstream || status.upstream;
  if (!upstream) return { available: false, upstream: "", commits: [], changes: [], ahead: status.ahead };
  const commits = await readCommitRange(root, `${upstream}..HEAD`, options.limit || 50);
  const nameStatus = await runGit(root, ["diff", "--name-status", "--find-renames", `${upstream}..HEAD`], {
    allowExitCodes: [0, 128],
  });
  return {
    available: true,
    upstream,
    commits,
    changes: parseNameStatus(nameStatus.stdout).map((item) => ({
      ...item,
      entity: core.describeWorkspaceEntity(item.path),
    })),
    ahead: commits.length,
  };
}

async function getCommitDetails(directoryPath, oid, options = {}) {
  const root = await repositoryRoot(directoryPath);
  const revision = safeRevision(oid);
  const format = "%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%s%x1f%b%x1e";
  const info = await runGit(root, ["show", "-s", `--format=${format}`, revision]);
  const [record] = info.stdout.split("\x1e").filter(Boolean);
  const [fullOid, shortOid, authorName, authorEmail, authoredAt, parents, subject, body] = String(record || "")
    .trim()
    .split("\x1f");
  const nameStatus = await runGit(root, ["show", "--format=", "--name-status", "--find-renames", revision]);
  const numstat = await runGit(root, ["show", "--format=", "--numstat", revision]);
  const stats = parseNumstat(numstat.stdout);
  const files = parseNameStatus(nameStatus.stdout).map((item) => ({
    ...item,
    ...stats.get(item.path),
    entity: core.describeWorkspaceEntity(item.path),
  }));
  const diff =
    options.includeDiff === false ? "" : (await runGit(root, ["show", "--format=", "--no-color", revision])).stdout;
  return {
    oid: fullOid,
    shortOid,
    authorName,
    authorEmail,
    authoredAt,
    parents: parents ? parents.split(" ") : [],
    subject,
    body,
    files,
    diff,
  };
}

async function getHistoryGraph(directoryPath, options = {}) {
  const root = await repositoryRoot(directoryPath);
  const maxCount = Math.min(300, positiveInt(options.maxCount, 100));
  const format = "%x1f%H%x1f%h%x1f%an%x1f%aI%x1f%D%x1f%s";
  const result = await runGit(
    root,
    ["log", "--graph", "--all", "--decorate=short", `--max-count=${maxCount}`, `--pretty=format:${format}`],
    { allowExitCodes: [0, 128] },
  );
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => parseGraphLine(line));
}

async function getEntityHistory(directoryPath, file, options = {}) {
  const root = await repositoryRoot(directoryPath);
  const relative = safeRelativePath(root, file);
  const maxCount = Math.min(200, positiveInt(options.maxCount, 50));
  const format = "%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e";
  const result = await runGit(
    root,
    ["log", "--follow", `--max-count=${maxCount}`, `--format=${format}`, "--", relative],
    { allowExitCodes: [0, 128] },
  );
  return result.stdout
    .split("\x1e")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((record) => {
      const [oid, shortOid, authorName, authoredAt, subject] = record.split("\x1f");
      return { oid, shortOid, authorName, authoredAt, subject, entity: core.describeWorkspaceEntity(relative) };
    });
}

async function getBranchHealth(directoryPath, options = {}) {
  const root = await repositoryRoot(directoryPath);
  const status = await core.statusRepository(root);
  const base = options.base || defaultBaseBranch(await core.listBranches(root), status.branch);
  if (!base || base === status.branch) {
    return {
      branch: status.branch,
      base,
      ahead: status.ahead,
      behind: status.behind,
      conflicts: [],
      changes: status.changes,
    };
  }
  const counts = await runGit(root, ["rev-list", "--left-right", "--count", `${base}...HEAD`], {
    allowExitCodes: [0, 128],
  });
  const [behind, ahead] = counts.stdout.trim().split(/\s+/).map(Number);
  const prevention = await predictConflicts(root, { target: base });
  return {
    branch: status.branch,
    base,
    ahead: ahead || 0,
    behind: behind || 0,
    conflicts: prevention.risks,
    changes: status.changes,
    prevention,
  };
}

async function predictConflicts(directoryPath, options = {}) {
  const root = await repositoryRoot(directoryPath);
  const target = safeRevision(options.target || "@{upstream}");
  const mergeBaseResult = await runGit(root, ["merge-base", "HEAD", target], { allowExitCodes: [0, 1, 128] });
  const mergeBase = mergeBaseResult.stdout.trim();
  if (!mergeBase) return { available: false, target, risks: [], safeOverlaps: [], mergeBase: "" };
  const [oursRaw, theirsRaw] = await Promise.all([
    runGit(root, ["diff", "--name-only", `${mergeBase}..HEAD`], { allowExitCodes: [0, 128] }),
    runGit(root, ["diff", "--name-only", `${mergeBase}..${target}`], { allowExitCodes: [0, 128] }),
  ]);
  const ours = new Set(oursRaw.stdout.split(/\r?\n/).filter(Boolean));
  const theirs = new Set(theirsRaw.stdout.split(/\r?\n/).filter(Boolean));
  const overlap = [...ours].filter((item) => theirs.has(item));
  const risks = [];
  const safeOverlaps = [];
  for (const file of overlap) {
    const detail = await compareSemanticOverlap(root, mergeBase, "HEAD", target, file);
    const item = { file, entity: core.describeWorkspaceEntity(file), ...detail };
    if (detail.risk === "low") safeOverlaps.push(item);
    else risks.push(item);
  }
  return {
    available: true,
    target,
    mergeBase,
    risks,
    safeOverlaps,
    oursOnly: [...ours].filter((item) => !theirs.has(item)),
    theirsOnly: [...theirs].filter((item) => !ours.has(item)),
  };
}

async function getConflictDetails(directoryPath, file) {
  const root = await repositoryRoot(directoryPath);
  const relative = safeRelativePath(root, file);
  const [base, ours, theirs, result] = await Promise.all([
    showIndexStage(root, 1, relative),
    showIndexStage(root, 2, relative),
    showIndexStage(root, 3, relative),
    fsp.readFile(path.join(root, relative), "utf8").catch(() => ""),
  ]);
  return {
    file: relative,
    entity: core.describeWorkspaceEntity(relative),
    base,
    ours,
    theirs,
    result,
    structured: {
      ours: buildStructuredDiff(relative, base, ours, []),
      theirs: buildStructuredDiff(relative, base, theirs, []),
      result: buildStructuredDiff(relative, base, result, []),
    },
  };
}

async function resolveConflict(directoryPath, input = {}) {
  const root = await repositoryRoot(directoryPath);
  const relative = safeRelativePath(root, input.file);
  const mode = input.mode || "custom";
  if (mode === "ours" || mode === "theirs") {
    await runGit(root, ["checkout", `--${mode}`, "--", relative]);
  } else if (mode === "base") {
    const base = await showIndexStage(root, 1, relative);
    await atomicWrite(path.join(root, relative), base);
  } else if (mode === "custom") {
    if (typeof input.content !== "string") throw new Error("Resolved content is required.");
    await atomicWrite(path.join(root, relative), normalizeLf(input.content));
  } else {
    throw new Error("Unsupported conflict resolution mode.");
  }
  await runGit(root, ["add", "--", relative]);
  return core.statusRepository(root);
}

async function listWorktrees(directoryPath) {
  const root = await repositoryRoot(directoryPath);
  const result = await runGit(root, ["worktree", "list", "--porcelain"]);
  return parseWorktrees(result.stdout).map((item) => ({
    ...item,
    current: path.resolve(item.path) === path.resolve(root),
  }));
}

async function addWorktree(directoryPath, input = {}) {
  const root = await repositoryRoot(directoryPath);
  const target = safeWorktreePath(input.path);
  const args = ["worktree", "add"];
  if (input.newBranch) args.push("-b", sanitizeBranch(input.newBranch));
  args.push(target);
  if (input.ref) args.push(safeRevision(input.ref));
  await runGit(root, args, { timeout: 5 * 60_000 });
  return listWorktrees(root);
}

async function removeWorktree(directoryPath, input = {}) {
  const root = await repositoryRoot(directoryPath);
  const target = safeWorktreePath(input.path);
  const args = ["worktree", "remove"];
  if (input.force) args.push("--force");
  args.push(target);
  await runGit(root, args, { timeout: 5 * 60_000 });
  return listWorktrees(root);
}

async function pruneWorktrees(directoryPath) {
  const root = await repositoryRoot(directoryPath);
  await runGit(root, ["worktree", "prune"]);
  return listWorktrees(root);
}

async function suggestCommit(directoryPath, options = {}) {
  const root = await repositoryRoot(directoryPath);
  const status = await core.statusRepository(root);
  const changes = status.changes.filter((item) => (options.staged === false ? item.unstaged : item.staged));
  if (!changes.length) {
    return {
      subject: "",
      body: "",
      scopes: [],
      groups: [],
      mode: "focused",
      summary: emptyCommitSummary(),
    };
  }

  const groups = groupChanges(changes).sort(
    (a, b) => b.changes.length - a.changes.length || a.title.localeCompare(b.title),
  );
  const scopes = [...new Set(changes.map((item) => scopeFromKind(item.entity.kind)).filter(Boolean))];
  const summary = await buildCommitSummary(root, changes, options.staged !== false);
  const globalMode = shouldUseGlobalCommitSuggestion(changes, groups, scopes, summary);

  if (globalMode) {
    const type = inferGlobalCommitType(changes, summary);
    const subject = buildGlobalCommitSubject(type, changes, summary);
    const body = buildGlobalCommitBody(groups, summary);
    return { subject, body, scopes, groups, mode: "global", summary };
  }

  const primary = groups[0];
  const type = inferCommitType(changes);
  const scope = inferCommitScope(primary?.changes || changes);
  const verb = inferCommitVerb(changes);
  const title = primary?.title || changes[0].entity.title || "workspace changes";
  const subject = `${type}${scope ? `(${scope})` : ""}: ${verb} ${toSentenceCase(title)}`.slice(0, 72);
  const body = buildFocusedCommitBody(groups, summary);
  return { subject, body, scopes, groups, mode: "focused", summary };
}

function emptyCommitSummary() {
  return {
    fileCount: 0,
    groupCount: 0,
    additions: 0,
    deletions: 0,
    binaryFiles: 0,
    statusCounts: {},
    entityCounts: {},
    entityLabels: [],
    protocols: [],
    initialWorkspace: false,
  };
}

async function buildCommitSummary(root, changes, staged) {
  const summary = emptyCommitSummary();
  summary.fileCount = changes.length;
  summary.groupCount = groupChanges(changes).length;

  for (const change of changes) {
    summary.statusCounts[change.status] = (summary.statusCounts[change.status] || 0) + 1;
    const label = entitySummaryLabel(change);
    summary.entityCounts[label] = (summary.entityCounts[label] || 0) + 1;
    const protocol = protocolFromChange(change);
    if (protocol && !summary.protocols.includes(protocol)) summary.protocols.push(protocol);
  }

  summary.entityLabels = Object.entries(summary.entityCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
  summary.protocols.sort();
  summary.initialWorkspace = isInitialWorkspaceCommit(changes);

  const args = ["diff", "--numstat"];
  if (staged) args.push("--cached");
  const numstat = await runGit(root, args, { allowExitCodes: [0, 128] }).catch(() => ({ stdout: "" }));
  for (const line of String(numstat.stdout || "").split(/\r?\n/)) {
    if (!line) continue;
    const [added, deleted] = line.split("\t");
    if (added === "-" || deleted === "-") {
      summary.binaryFiles += 1;
      continue;
    }
    summary.additions += Number(added) || 0;
    summary.deletions += Number(deleted) || 0;
  }
  return summary;
}

function shouldUseGlobalCommitSuggestion(changes, groups, scopes, summary) {
  if (summary.initialWorkspace) return true;
  if (changes.length >= 8) return true;
  if (groups.length >= 3) return true;
  if (scopes.length >= 3) return true;
  if (summary.entityLabels.length >= 4) return true;
  return false;
}

function inferGlobalCommitType(changes, summary) {
  const labels = new Set(summary.entityLabels);
  if ([...labels].every((label) => label === "documentation" || label === "generated docs")) return "docs";
  if ([...labels].every((label) => ["examples", "mock scenarios", "tests"].includes(label))) return "test";
  if (summary.initialWorkspace) return "chore";
  const featureKinds = changes.some(
    (item) =>
      item.status === "added" &&
      /request|proto|schema|collection|gateway|environment/i.test(`${item.entity.kind} ${item.path}`),
  );
  if (featureKinds) return "feat";
  return "chore";
}

function buildGlobalCommitSubject(type, changes, summary) {
  if (summary.initialWorkspace) return "chore(workspace): initialize API workspace";
  const labels = summary.entityLabels.filter((label) => label !== "repository setup");
  if (labels.length > 0 && labels.length <= 3 && summary.fileCount < 16) {
    return `${type}(workspace): update ${joinHuman(labels)}`.slice(0, 72);
  }
  const verb = changes.every((item) => item.status === "deleted") ? "clean up" : "update";
  return `${type}(workspace): ${verb} API workspace`.slice(0, 72);
}

function buildGlobalCommitBody(groups, summary) {
  const lines = [];
  const entityEntries = Object.entries(summary.entityCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (entityEntries.length) {
    lines.push(
      `- update ${entityEntries.map(([label, count]) => `${count} ${pluralizeLabel(label, count)}`).join(", ")}`,
    );
  }
  if (summary.protocols.length) lines.push(`- cover ${joinHuman(summary.protocols)} workflows`);

  for (const group of groups.slice(0, 6)) {
    lines.push(`- ${summarizeGroup(group)}`);
  }
  if (groups.length > 6) lines.push(`- include ${groups.length - 6} additional related change groups`);

  const stats = [`${summary.fileCount} staged ${summary.fileCount === 1 ? "file" : "files"}`];
  if (summary.additions || summary.deletions) stats.push(`+${summary.additions}/-${summary.deletions}`);
  if (summary.binaryFiles) stats.push(`${summary.binaryFiles} binary`);
  lines.push("", `Change summary: ${stats.join(" · ")}`);
  return lines.join("\n");
}

function buildFocusedCommitBody(groups, summary) {
  const lines = groups.slice(0, 8).map((group) => `- ${summarizeGroup(group)}`);
  if (summary.fileCount > 1 || summary.additions || summary.deletions) {
    const stats = [`${summary.fileCount} ${summary.fileCount === 1 ? "file" : "files"}`];
    if (summary.additions || summary.deletions) stats.push(`+${summary.additions}/-${summary.deletions}`);
    lines.push("", `Change summary: ${stats.join(" · ")}`);
  }
  return lines.join("\n");
}

function entitySummaryLabel(change) {
  const source = `${change.entity.kind} ${change.path}`.toLowerCase();
  if (/docs\/(?:published|site|wiki-export)/.test(source)) return "generated docs";
  if (/documentation|\.md$/.test(source)) return "documentation";
  if (/example/.test(source)) return "examples";
  if (/mock|scenario/.test(source)) return "mock scenarios";
  if (/proto|schema/.test(source)) return "schemas";
  if (/grpc|rest|websocket/.test(source) && /request/.test(source)) return "requests";
  if (/environment/.test(source)) return "environments";
  if (/collection/.test(source)) return "collections";
  if (/gateway/.test(source)) return "gateways";
  if (/test/.test(source)) return "tests";
  if (/\.gitignore|\.gitattributes|layang\.(?:workspace\.)?ya?ml/.test(source)) return "repository setup";
  return "workspace files";
}

function protocolFromChange(change) {
  const source = `${change.entity.kind} ${change.path}`.toLowerCase();
  if (/grpc/.test(source)) return "gRPC";
  if (/websocket|\.ws\.|\.websocket\./.test(source)) return "WebSocket";
  if (/rest|http/.test(source)) return "REST";
  return "";
}

function isInitialWorkspaceCommit(changes) {
  if (!changes.length || !changes.every((item) => ["added", "untracked"].includes(item.status))) return false;
  const paths = changes.map((item) => String(item.path).toLowerCase());
  return (
    paths.some((item) => /(?:^|\/)layang(?:\.workspace)?\.ya?ml$/.test(item)) &&
    paths.some((item) => item === ".gitignore" || item === ".gitattributes")
  );
}

function pluralizeLabel(label, count) {
  if (count === 1) {
    if (label === "examples") return "example";
    if (label === "mock scenarios") return "mock scenario";
    if (label === "schemas") return "schema";
    if (label === "requests") return "request";
    if (label === "environments") return "environment";
    if (label === "collections") return "collection";
    if (label === "gateways") return "gateway";
    if (label === "tests") return "test";
    if (label === "workspace files") return "workspace file";
  }
  return label;
}

function joinHuman(values) {
  const items = [...new Set(values.filter(Boolean))];
  if (items.length <= 1) return items[0] || "workspace changes";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

async function getReviewSummary(directoryPath) {
  const root = await repositoryRoot(directoryPath);
  const [state, status] = await Promise.all([getGitUxState(root), core.statusRepository(root)]);
  const staged = status.changes.filter((item) => item.staged);
  const items = staged.map((change) => ({ ...change, review: state.reviews[change.path]?.status || "not-reviewed" }));
  return {
    items,
    reviewed: items.filter((item) => item.review === "reviewed").length,
    needsAttention: items.filter((item) => item.review === "needs-attention").length,
    notReviewed: items.filter((item) => item.review === "not-reviewed").length,
    complete: items.length > 0 && items.every((item) => ["reviewed", "excluded"].includes(item.review)),
  };
}

function parseUnifiedDiff(text) {
  const lines = String(text || "")
    .replace(/\r?\n$/, "")
    .split(/\r?\n/);
  const files = [];
  const hunks = [];
  let currentFile = null;
  let currentHunk = null;
  let fileHeader = [];
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (currentHunk) finishHunk();
      currentFile = { header: [line], oldPath: "", newPath: "", hunks: [] };
      files.push(currentFile);
      fileHeader = currentFile.header;
      continue;
    }
    if (!currentFile) continue;
    if (line.startsWith("--- ")) {
      currentFile.oldPath = stripDiffPath(line.slice(4));
      fileHeader.push(line);
      continue;
    }
    if (line.startsWith("+++ ")) {
      currentFile.newPath = stripDiffPath(line.slice(4));
      fileHeader.push(line);
      continue;
    }
    if (line.startsWith("@@ ")) {
      if (currentHunk) finishHunk();
      currentHunk = {
        id: "",
        header: line,
        lines: [],
        oldStart: 0,
        oldCount: 0,
        newStart: 0,
        newCount: 0,
        additions: 0,
        deletions: 0,
        context: 0,
      };
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        currentHunk.oldStart = Number(match[1]);
        currentHunk.oldCount = Number(match[2] || 1);
        currentHunk.newStart = Number(match[3]);
        currentHunk.newCount = Number(match[4] || 1);
      }
      continue;
    }
    if (currentHunk) {
      currentHunk.lines.push(line);
      if (line.startsWith("+") && !line.startsWith("+++")) currentHunk.additions += 1;
      else if (line.startsWith("-") && !line.startsWith("---")) currentHunk.deletions += 1;
      else currentHunk.context += 1;
    } else fileHeader.push(line);
  }
  if (currentHunk) finishHunk();
  return { files, hunks };

  function finishHunk() {
    if (!currentHunk || !currentFile) return;
    currentHunk.id = hashId(
      `${currentFile.newPath || currentFile.oldPath}:${currentHunk.header}:${currentHunk.lines.join("\n")}`,
    );
    currentHunk.file = currentFile.newPath || currentFile.oldPath;
    currentHunk.patch = `${[...currentFile.header, currentHunk.header, ...currentHunk.lines].join("\n")}\n`;
    currentFile.hunks.push(currentHunk);
    hunks.push(currentHunk);
    currentHunk = null;
  }
}

function selectHunks(diffText, ids) {
  const parsed = parseUnifiedDiff(diffText);
  const selected = new Set(Array.isArray(ids) ? ids : ids ? [ids] : []);
  const parts = [];
  for (const file of parsed.files) {
    const hunks = file.hunks.filter((hunk) => !selected.size || selected.has(hunk.id));
    if (!hunks.length) continue;
    parts.push(file.header.join("\n"));
    for (const hunk of hunks) parts.push([hunk.header, ...hunk.lines].join("\n"));
  }
  return parts.length ? `${parts.join("\n")}\n` : "";
}

function buildStructuredDiff(file, leftText, rightText, hunks = []) {
  const extension = path.extname(file).toLowerCase();
  const isYaml = /\.ya?ml$/i.test(file);
  const isJson = extension === ".json";
  const isMarkdown = extension === ".md";
  if (!isYaml && !isJson && !isMarkdown) return [];
  if (isMarkdown) return markdownSectionDiff(leftText, rightText, hunks);
  let left;
  let right;
  try {
    left = isJson ? JSON.parse(leftText || "{}") : parseYaml(leftText || "{}");
    right = isJson ? JSON.parse(rightText || "{}") : parseYaml(rightText || "{}");
  } catch {
    return [];
  }
  const leftFlat = flattenValue(left);
  const rightFlat = flattenValue(right);
  const paths = [...new Set([...leftFlat.keys(), ...rightFlat.keys()])].sort();
  return paths
    .filter((key) => !deepEqual(leftFlat.get(key), rightFlat.get(key)))
    .map((key) => ({
      path: key,
      before: leftFlat.has(key) ? leftFlat.get(key) : undefined,
      after: rightFlat.has(key) ? rightFlat.get(key) : undefined,
      change: !leftFlat.has(key) ? "added" : !rightFlat.has(key) ? "deleted" : "modified",
      hunkIds: findHunksForField(key, hunks),
    }));
}

function markdownSectionDiff(leftText, rightText, hunks) {
  const left = splitMarkdownSections(leftText);
  const right = splitMarkdownSections(rightText);
  const names = [...new Set([...left.keys(), ...right.keys()])];
  return names
    .filter((name) => left.get(name) !== right.get(name))
    .map((name) => ({
      path: name,
      before: left.get(name),
      after: right.get(name),
      change: !left.has(name) ? "added" : !right.has(name) ? "deleted" : "modified",
      hunkIds: hunks.map((hunk) => hunk.id),
    }));
}

function suggestChangeSets(changes, existingSets) {
  const assigned = new Set(existingSets.flatMap((set) => set.paths));
  return groupChanges(changes.filter((item) => !assigned.has(item.path))).map((group) => ({
    id: createId("suggestion"),
    name: group.title,
    description: `${group.changes.length} related ${group.changes.length === 1 ? "change" : "changes"}`,
    paths: group.changes.map((item) => item.path),
    reason: group.reason,
    entities: group.changes.map((item) => item.entity),
  }));
}

function groupChanges(changes) {
  const groups = new Map();
  for (const change of changes) {
    const key = relationshipKey(change.path, change.entity);
    const group = groups.get(key) || {
      key,
      title: humanizeKey(key, change.entity),
      reason: "entity relationship",
      changes: [],
    };
    group.changes.push(change);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function relationshipKey(file, entity) {
  const normalized = String(file).replaceAll("\\", "/");
  const basename = path.posix.basename(normalized);
  const stable = basename.match(/--([a-z]+-[a-z0-9-]+)/i)?.[1];
  if (stable) return stable.replace(/^(?:example|mock|request)-/, "");
  const folder = path.posix.dirname(normalized);
  const semantic = basename
    .replace(/\.(?:rest|grpc|websocket|example|scenario)?\.?ya?ml$/i, "")
    .replace(/\.md$/i, "")
    .replace(/--[^.]+$/, "");
  if (["example", "mock scenario", "documentation"].includes(entity.kind))
    return `${folder.replace(/\/(?:examples|mocks|docs).*$/, "")}:${semantic}`;
  return `${folder}:${semantic}`;
}

function humanizeKey(key, entity) {
  const tail = key.split(":").pop().replace(/[-_]+/g, " ").trim();
  const title = entity?.title && entity.title !== "collection" ? entity.title : tail;
  return title ? `Change: ${toSentenceCase(title)}` : "Workspace changes";
}

async function compareSemanticOverlap(root, baseRef, oursRef, theirsRef, file) {
  const [base, ours, theirs] = await Promise.all([
    showRefFile(root, baseRef, file),
    showRefFile(root, oursRef, file),
    showRefFile(root, theirsRef, file),
  ]);
  const oursDiff = buildStructuredDiff(file, base, ours, []);
  const theirsDiff = buildStructuredDiff(file, base, theirs, []);
  if (!oursDiff.length || !theirsDiff.length)
    return { risk: "medium", oursFields: [], theirsFields: [], overlappingFields: [] };
  const oursFields = oursDiff.map((item) => item.path);
  const theirsFields = theirsDiff.map((item) => item.path);
  const overlappingFields = oursFields.filter((item) => theirsFields.includes(item));
  return { risk: overlappingFields.length ? "high" : "low", oursFields, theirsFields, overlappingFields };
}

async function readFileVersions(root, file) {
  const worktree = await fsp.readFile(path.join(root, file), "utf8").catch(() => "");
  const head = await showRefFile(root, "HEAD", file);
  const index = await runGit(root, ["show", `:${file}`], { allowExitCodes: [0, 128] }).then((item) =>
    item.code === 0 ? item.stdout : head,
  );
  return { head, index, worktree };
}

async function showRefFile(root, ref, file) {
  const result = await runGit(root, ["show", `${safeRevision(ref)}:${safeRelativePath(root, file)}`], {
    allowExitCodes: [0, 128],
  });
  return result.code === 0 ? result.stdout : "";
}

async function showIndexStage(root, stage, file) {
  const result = await runGit(root, ["show", `:${stage}:${file}`], { allowExitCodes: [0, 128] });
  return result.code === 0 ? result.stdout : "";
}

function flattenValue(value, prefix = "", output = new Map()) {
  if (Array.isArray(value)) {
    if (!value.length) output.set(prefix || "$", []);
    value.forEach((item, index) => {
      flattenValue(item, `${prefix}[${index}]`, output);
    });
    return output;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) output.set(prefix || "$", {});
    for (const [key, item] of entries) flattenValue(item, prefix ? `${prefix}.${key}` : key, output);
    return output;
  }
  output.set(prefix || "$", value);
  return output;
}

function splitMarkdownSections(text) {
  const lines = String(text || "").split(/\r?\n/);
  const sections = new Map();
  let name = "Preamble";
  let buffer = [];
  const flush = () => sections.set(name, buffer.join("\n").trim());
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      flush();
      name = match[2].trim();
      buffer = [line];
    } else buffer.push(line);
  }
  flush();
  return sections;
}

function findHunksForField(field, hunks) {
  const tokens = field
    .replace(/\[\d+\]/g, "")
    .split(".")
    .filter(Boolean);
  return hunks
    .filter((hunk) =>
      tokens.some((token) => hunk.lines.some((line) => line.includes(`${token}:`) || line.includes(`"${token}"`))),
    )
    .map((hunk) => hunk.id);
}

function parseNameStatus(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const code = parts[0];
      const renamed = /^[RC]/.test(code) && parts.length >= 3;
      return {
        status: statusName(code[0]),
        code,
        originalPath: renamed ? parts[1] : "",
        path: renamed ? parts[2] : parts[1],
      };
    })
    .filter((item) => item.path);
}

function parseNumstat(text) {
  const output = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    const [added, deleted, file] = line.split("\t");
    if (!file) continue;
    output.set(file, {
      additions: added === "-" ? null : Number(added),
      deletions: deleted === "-" ? null : Number(deleted),
    });
  }
  return output;
}

function parseGraphLine(line) {
  const marker = line.indexOf("\x1f");
  if (marker < 0) return { graph: line, oid: "", shortOid: "", authorName: "", authoredAt: "", refs: "", subject: "" };
  const graph = line.slice(0, marker);
  const [oid, shortOid, authorName, authoredAt, refs, subject] = line.slice(marker + 1).split("\x1f");
  return { graph, oid, shortOid, authorName, authoredAt, refs, subject };
}

function parseWorktrees(text) {
  const output = [];
  let current = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line) {
      if (current) output.push(current);
      current = null;
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");
    if (key === "worktree")
      current = { path: value, head: "", branch: "", detached: false, bare: false, locked: false, prunable: false };
    else if (!current) continue;
    else if (key === "HEAD") current.head = value;
    else if (key === "branch") current.branch = value.replace(/^refs\/heads\//, "");
    else if (key === "detached") current.detached = true;
    else if (key === "bare") current.bare = true;
    else if (key === "locked") current.locked = value || true;
    else if (key === "prunable") current.prunable = value || true;
  }
  if (current) output.push(current);
  return output;
}

async function readCommitRange(root, range, limit) {
  const format = "%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e";
  const result = await runGit(
    root,
    ["log", `--max-count=${Math.min(200, positiveInt(limit, 50))}`, `--format=${format}`, range],
    { allowExitCodes: [0, 128] },
  );
  return result.stdout
    .split("\x1e")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((record) => {
      const [oid, shortOid, authorName, authorEmail, authoredAt, subject] = record.split("\x1f");
      return { oid, shortOid, authorName, authorEmail, authoredAt, subject };
    });
}

function inferCommitType(changes) {
  const kinds = changes.map((item) => item.entity.kind);
  if (kinds.every((item) => item === "documentation")) return "docs";
  if (kinds.some((item) => item === "mock scenario"))
    return kinds.some((item) => /deleted|modified/.test(item.status)) ? "fix" : "test";
  if (kinds.some((item) => item === "example")) return "test";
  if (kinds.some((item) => item === "proto source")) return "chore";
  if (changes.some((item) => item.status === "added")) return "feat";
  return "fix";
}

function inferCommitScope(changes) {
  const scopes = changes.map((item) => scopeFromKind(item.entity.kind)).filter(Boolean);
  return scopes.every((item) => item === scopes[0]) ? scopes[0] : "api";
}

function scopeFromKind(kind) {
  if (/grpc/i.test(kind)) return "grpc";
  if (/rest/i.test(kind)) return "rest";
  if (/websocket/i.test(kind)) return "ws";
  if (/proto/i.test(kind)) return "proto";
  if (/mock/i.test(kind)) return "mock";
  if (/example/i.test(kind)) return "example";
  if (/documentation/i.test(kind)) return "docs";
  return "workspace";
}

function inferCommitVerb(changes) {
  if (changes.every((item) => item.status === "deleted")) return "remove";
  if (changes.some((item) => item.status === "added")) return "add";
  if (changes.some((item) => item.status === "renamed")) return "rename";
  if (changes.every((item) => item.entity.kind === "documentation")) return "document";
  return "update";
}

function summarizeGroup(group) {
  const statuses = [...new Set(group.changes.map((item) => item.status))];
  return `${statuses.join("/")} ${group.title.replace(/^Change:\s*/, "")} (${group.changes.length} files)`;
}

function defaultBaseBranch(branches, current) {
  const names = branches.filter((item) => !item.remote).map((item) => item.name);
  return ["main", "master", "develop"].find((item) => names.includes(item) && item !== current) || "";
}

function structuredFormat(file) {
  if (/\.ya?ml$/i.test(file)) return "yaml";
  if (/\.json$/i.test(file)) return "json";
  return "";
}
function emptyStructuredText(format) {
  return format === "json" ? "{}\n" : "{}\n";
}
function parseStructuredText(format, text) {
  try {
    return format === "json" ? JSON.parse(text || "{}") : parseYaml(text || "{}");
  } catch (error) {
    throw new Error(
      `Cannot parse structured file for field staging: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
function serializeStructuredText(format, value) {
  return format === "json" ? `${JSON.stringify(value, null, 2)}\n` : stringifyYaml(value);
}
function normalizeFieldPaths(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(
      list
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
function patchYamlFields(targetText, sourceText, fields) {
  const targetLines = normalizeLf(targetText).replace(/\n$/, "").split("\n");
  const sourceLines = normalizeLf(sourceText).replace(/\n$/, "").split("\n");
  const targetMap = mapYamlRanges(targetLines);
  const sourceMap = mapYamlRanges(sourceLines);
  const edits = [];
  for (const field of fields) {
    const target = targetMap.get(field);
    const source = sourceMap.get(field);
    if (!target || !source) return "";
    edits.push({ start: target.start, end: target.end, replacement: sourceLines.slice(source.start, source.end) });
  }
  edits.sort((a, b) => b.start - a.start);
  for (const edit of edits) targetLines.splice(edit.start, edit.end - edit.start, ...edit.replacement);
  return `${targetLines.join("\n")}\n`;
}
function mapYamlRanges(lines) {
  const output = new Map();
  const stack = [];
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!raw.trim() || raw.trimStart().startsWith("#") || raw.trimStart().startsWith("- ")) continue;
    const match = raw.match(/^(\s*)([^:#][^:]*):(?:\s*(.*))?$/);
    if (!match) continue;
    const indent = match[1].replace(/\t/g, "  ").length;
    const key = decodeYamlKey(match[2].trim());
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const pathName = [...stack.map((item) => item.key), key].join(".");
    let end = index + 1;
    while (end < lines.length) {
      const next = lines[end];
      if (!next.trim()) {
        end += 1;
        continue;
      }
      const nextIndent = (next.match(/^(\s*)/)?.[1] || "").replace(/\t/g, "  ").length;
      if (nextIndent <= indent) break;
      end += 1;
    }
    output.set(pathName, { start: index, end });
    if (!String(match[3] || "").trim()) stack.push({ indent, key });
  }
  return output;
}
function decodeYamlKey(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}
function copyStructuredPath(targetRoot, sourceRoot, field) {
  const tokens = parseFieldPath(field);
  if (!tokens.length) throw new Error(`Invalid structured field path: ${field}`);
  const source = getPathState(sourceRoot, tokens);
  if (!source.exists) deletePathValue(targetRoot, tokens);
  else setPathValue(targetRoot, tokens, structuredCloneValue(source.value));
}
function parseFieldPath(field) {
  const tokens = [];
  String(field || "").replace(/(?:^|\.)([^.[\]]+)|\[(\d+)\]/g, (_match, key, index) => {
    tokens.push(key !== undefined ? key : Number(index));
    return "";
  });
  return tokens;
}
function getPathState(root, tokens) {
  let current = root;
  for (const token of tokens) {
    if (current == null || !(token in Object(current))) return { exists: false, value: undefined };
    current = current[token];
  }
  return { exists: true, value: current };
}
function setPathValue(root, tokens, value) {
  let current = root;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (current[token] == null || typeof current[token] !== "object")
      current[token] = typeof next === "number" ? [] : {};
    current = current[token];
  }
  current[tokens[tokens.length - 1]] = value;
}
function deletePathValue(root, tokens) {
  let current = root;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    current = current?.[tokens[index]];
    if (current == null) return;
  }
  const last = tokens[tokens.length - 1];
  if (Array.isArray(current) && typeof last === "number") current.splice(last, 1);
  else if (current && typeof current === "object") delete current[last];
}
function structuredCloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
async function updateIndexContent(root, file, content) {
  const temp = path.join(os.tmpdir(), `layang-index-${process.pid}-${Date.now()}-${crypto.randomUUID()}`);
  await fsp.writeFile(temp, normalizeLf(content), "utf8");
  try {
    const hash = (await runGit(root, ["hash-object", "-w", temp])).stdout.trim();
    const modeResult = await runGit(root, ["ls-files", "-s", "--", file], { allowExitCodes: [0] });
    const mode = modeResult.stdout.trim().split(/\s+/)[0] || "100644";
    await runGit(root, ["update-index", "--add", "--cacheinfo", mode, hash, file]);
  } finally {
    await fsp.rm(temp, { force: true }).catch(() => undefined);
  }
}

function normalizeState(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: STATE_VERSION,
    changeSets: Array.isArray(source.changeSets)
      ? source.changeSets.map((item) => ({
          id: sanitizeId(item.id || createId("change-set")),
          name: cleanText(item.name || "Change Set", 120),
          description: cleanText(item.description || "", 1000),
          color: normalizeColor(item.color),
          paths: Array.isArray(item.paths) ? [...new Set(item.paths.map(String))].sort() : [],
          createdAt: String(item.createdAt || new Date().toISOString()),
          updatedAt: String(item.updatedAt || new Date().toISOString()),
        }))
      : [],
    reviews: source.reviews && typeof source.reviews === "object" ? source.reviews : {},
    preferences: {
      historyMode: source.preferences?.historyMode === "graph" ? "graph" : "simple",
      autoFetch: Boolean(source.preferences?.autoFetch),
      protectedBranches: Array.isArray(source.preferences?.protectedBranches)
        ? source.preferences.protectedBranches.map(String)
        : ["main", "master"],
    },
  };
}

async function ensureLocalStateExcluded(root) {
  const gitDirResult = await runGit(root, ["rev-parse", "--git-path", "info/exclude"]);
  const excludeFile = path.resolve(root, gitDirResult.stdout.trim());
  const marker = ".layang/local-state/";
  const current = await fsp.readFile(excludeFile, "utf8").catch(() => "");
  if (current.split(/\r?\n/).some((line) => line.trim() === marker)) return;
  await fsp.mkdir(path.dirname(excludeFile), { recursive: true });
  await fsp.appendFile(
    excludeFile,
    `${current && !current.endsWith("\n") ? "\n" : ""}# Layang local Git UX state\n${marker}\n`,
    "utf8",
  );
}
function stateFile(root) {
  return path.join(root, ".layang", "local-state", "git-ux-v2.json");
}
async function repositoryRoot(directoryPath) {
  return (await core.detectRepository(directoryPath)).initialized
    ? (await core.detectRepository(directoryPath)).root
    : path.resolve(directoryPath);
}
function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
function hashId(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);
}
function sanitizeId(value) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(text)) throw new Error("Invalid local Git UX identifier.");
  return text;
}
function cleanText(value, max) {
  return String(value || "")
    .replaceAll("\u0000", "")
    .replace(/\r/g, "")
    .trim()
    .slice(0, max);
}
function normalizeColor(value) {
  return ["blue", "green", "orange", "purple", "gray"].includes(value) ? value : "blue";
}
function normalizeLf(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}
function normalizeRelativePaths(root, values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return [...new Set(list.map((item) => safeRelativePath(root, item)))].sort();
}
function safeRelativePath(root, value) {
  const raw = String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
  const absolute = path.resolve(root, raw);
  const relative = path.relative(root, absolute).replaceAll("\\", "/");
  if (!relative || relative === "." || relative.startsWith("../") || path.isAbsolute(relative))
    throw new Error(`Path is outside the repository: ${value}`);
  return relative;
}
function safeWorktreePath(value) {
  const target = path.resolve(String(value || ""));
  if (!value || target === path.parse(target).root || target.includes("\u0000"))
    throw new Error("A safe workspace copy path is required.");
  return target;
}
function sanitizeBranch(value) {
  const branch = String(value || "").trim();
  if (!branch || branch.length > 255 || /[\s~^:?*[\\]|\.\.|@\{|^\.|\.$|\/$|\/\.|\.lock$]/.test(branch))
    throw new Error("Invalid Git branch name.");
  return branch;
}
function safeRevision(value) {
  const revision = String(value || "").trim();
  if (!revision || revision.includes("\u0000") || revision.startsWith("-") || /[\r\n]/.test(revision))
    throw new Error("Invalid Git revision.");
  return revision;
}
function positiveInt(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
function statusName(code) {
  return (
    { A: "added", M: "modified", D: "deleted", R: "renamed", C: "copied", T: "type-changed", U: "conflict" }[code] ||
    "modified"
  );
}
function stripDiffPath(value) {
  const text = String(value || "").split("\t")[0];
  if (text === "/dev/null") return "";
  return text.replace(/^[ab]\//, "");
}
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function toSentenceCase(value) {
  const text = String(value || "")
    .replace(/[-_]+/g, " ")
    .trim();
  return text ? `${text[0].toLowerCase()}${text.slice(1)}` : "changes";
}
async function atomicWrite(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(temp, content, "utf8");
  await fsp.rename(temp, file);
}

async function runGit(root, args, options = {}) {
  try {
    const result = await execFileAsync(process.env.LAYANG_GIT_PATH || "git", ["-C", root, ...args], {
      cwd: root,
      env: options.env || SAFE_ENV,
      encoding: "utf8",
      windowsHide: true,
      timeout: options.timeout || DEFAULT_TIMEOUT,
      maxBuffer: MAX_OUTPUT,
    });
    return { code: 0, stdout: result.stdout || "", stderr: result.stderr || "" };
  } catch (error) {
    const code = Number.isInteger(error?.code) ? error.code : 1;
    if ((options.allowExitCodes || []).includes(code))
      return { code, stdout: error.stdout || "", stderr: error.stderr || "" };
    throw new Error(
      String(error?.stderr || error?.message || error)
        .replace(/^fatal:\s*/i, "")
        .trim(),
    );
  }
}

async function runGitWithInput(root, args, input) {
  const temp = path.join(os.tmpdir(), `layang-git-patch-${process.pid}-${Date.now()}-${crypto.randomUUID()}.patch`);
  await fsp.writeFile(temp, input, "utf8");
  try {
    const fileArgs = args.map((item) => (item === "-" ? temp : item));
    return await runGit(root, fileArgs, { timeout: DEFAULT_TIMEOUT });
  } finally {
    await fsp.rm(temp, { force: true }).catch(() => undefined);
  }
}

module.exports = {
  getGitUxState,
  saveGitUxState,
  listChangeSets,
  upsertChangeSet,
  deleteChangeSet,
  assignChangeSetPaths,
  markReview,
  clearCompletedChangeSets,
  getEnhancedDiff,
  stageHunks,
  unstageHunks,
  discardHunks,
  stageStructuredFields,
  unstageStructuredFields,
  getIncomingPreview,
  getOutgoingPreview,
  getCommitDetails,
  getHistoryGraph,
  getEntityHistory,
  getBranchHealth,
  predictConflicts,
  getConflictDetails,
  resolveConflict,
  listWorktrees,
  addWorktree,
  removeWorktree,
  pruneWorktrees,
  suggestCommit,
  getReviewSummary,
  parseUnifiedDiff,
  selectHunks,
  buildStructuredDiff,
  suggestChangeSets,
};
