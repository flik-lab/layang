"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT = 60_000;
const SAFE_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  LC_ALL: "C",
  LANG: "C",
};

async function gitVersion() {
  const result = await runGitRaw(["--version"], { cwd: process.cwd() });
  return result.stdout.trim();
}

async function detectRepository(directoryPath) {
  const directory = resolveDirectory(directoryPath);
  try {
    const root = (await runGit(directory, ["rev-parse", "--show-toplevel"])).stdout.trim();
    const gitDirRaw = (await runGit(directory, ["rev-parse", "--git-dir"])).stdout.trim();
    const bare = (await runGit(directory, ["rev-parse", "--is-bare-repository"])).stdout.trim() === "true";
    return {
      available: true,
      initialized: true,
      root: path.resolve(root),
      gitDir: path.resolve(root, gitDirRaw),
      bare,
      version: await gitVersion(),
    };
  } catch (error) {
    return {
      available: await isGitAvailable(),
      initialized: false,
      root: directory,
      bare: false,
      version: await gitVersion().catch(() => ""),
      error: cleanGitError(error),
    };
  }
}

async function initRepository(directoryPath, options = {}) {
  const directory = resolveDirectory(directoryPath);
  await fsp.mkdir(directory, { recursive: true });
  const args = ["init"];
  const initialBranch = sanitizeBranchName(options.initialBranch || "main");
  if (initialBranch) args.push("--initial-branch", initialBranch);
  await runGit(directory, args);
  return statusRepository(directory);
}

async function cloneRepository(input) {
  const url = validateRemoteUrl(input?.url);
  const directory = path.resolve(String(input?.directoryPath || ""));
  if (!directory || directory === path.parse(directory).root)
    throw new Error("A safe clone target directory is required.");
  if (fs.existsSync(directory) && (await fsp.readdir(directory)).length > 0)
    throw new Error("Clone target directory must be empty.");
  await fsp.mkdir(path.dirname(directory), { recursive: true });
  const args = ["clone", "--", url, directory];
  if (input?.branch) args.splice(1, 0, "--branch", sanitizeBranchName(input.branch));
  if (input?.depth) args.splice(1, 0, "--depth", String(normalizePositiveInteger(input.depth, 1)));
  await runGitRaw(args, { cwd: path.dirname(directory), timeout: 5 * 60_000 });
  return statusRepository(directory);
}

async function statusRepository(directoryPath) {
  const info = await requireRepository(directoryPath);
  const result = await runGit(info.root, ["status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all"]);
  const parsed = parsePorcelainV2(result.stdout);
  const merge = await readMergeState(info.root, parsed.changes);
  const remotes = await listRemotes(info.root);
  return {
    ...info,
    branch: parsed.branch,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    detached: parsed.detached,
    clean: parsed.changes.length === 0,
    changes: parsed.changes,
    stagedCount: parsed.changes.filter((item) => item.staged).length,
    unstagedCount: parsed.changes.filter((item) => item.unstaged).length,
    conflictCount: parsed.changes.filter((item) => item.conflict).length,
    untrackedCount: parsed.changes.filter((item) => item.untracked).length,
    merge,
    remotes,
  };
}

async function getDiff(directoryPath, options = {}) {
  const info = await requireRepository(directoryPath);
  const relativePath = options.file ? safeRelativeGitPath(info.root, options.file) : "";
  const args = ["diff", "--no-ext-diff", "--no-color", `--unified=${normalizeNonNegativeInteger(options.context, 3)}`];
  if (options.staged) args.push("--cached");
  if (options.wordDiff) args.push("--word-diff=plain");
  if (relativePath) args.push("--", relativePath);
  const result = await runGit(info.root, args, { allowExitCodes: [0, 1] });
  let text = result.stdout;
  if (!text && relativePath && !options.staged) {
    const current = (await statusRepository(info.root)).changes.find(
      (item) => item.path === relativePath && item.untracked,
    );
    if (current) {
      const content = await fsp.readFile(path.join(info.root, relativePath), "utf8").catch(() => "");
      text = createUntrackedDiff(relativePath, content);
    }
  }
  return { root: info.root, file: relativePath, staged: Boolean(options.staged), text, truncated: false };
}

async function stagePaths(directoryPath, paths) {
  const info = await requireRepository(directoryPath);
  const normalized = normalizePathList(info.root, paths);
  await runGit(info.root, normalized.length ? ["add", "--", ...normalized] : ["add", "--all"]);
  return statusRepository(info.root);
}

async function unstagePaths(directoryPath, paths) {
  const info = await requireRepository(directoryPath);
  const normalized = normalizePathList(info.root, paths);
  const hasHead = await runGit(info.root, ["rev-parse", "--verify", "HEAD"], { allowExitCodes: [0, 1] });
  if (hasHead.code === 0) {
    await runGit(
      info.root,
      normalized.length ? ["restore", "--staged", "--", ...normalized] : ["restore", "--staged", ":/"],
    );
  } else {
    await runGit(
      info.root,
      normalized.length
        ? ["rm", "--cached", "--ignore-unmatch", "--", ...normalized]
        : ["rm", "-r", "--cached", "--ignore-unmatch", "."],
    );
  }
  return statusRepository(info.root);
}

async function discardPaths(directoryPath, paths) {
  const info = await requireRepository(directoryPath);
  const normalized = normalizePathList(info.root, paths);
  if (!normalized.length) throw new Error("Discard requires one or more explicit paths.");
  const status = await statusRepository(info.root);
  const byPath = new Map(status.changes.map((item) => [item.path, item]));
  const tracked = normalized.filter((item) => !byPath.get(item)?.untracked);
  const untracked = normalized.filter((item) => byPath.get(item)?.untracked);
  if (tracked.length) await runGit(info.root, ["restore", "--worktree", "--", ...tracked]);
  if (untracked.length) await runGit(info.root, ["clean", "-f", "--", ...untracked]);
  return statusRepository(info.root);
}

async function commitChanges(directoryPath, input = {}) {
  const info = await requireRepository(directoryPath);
  const message = String(input.message || "").trim();
  if (!message) throw new Error("Commit message is required.");
  if (message.length > 10_000) throw new Error("Commit message is too long.");
  if (input.runChecks !== false) {
    const check = await preCommitCheck(info.root, { documentation: input.documentation !== false });
    if (!check.ok && !input.force) {
      const details = check.blockers.map((item) => item.message).join("\n");
      const error = new Error(`Pre-commit checks failed.\n${details}`);
      error.check = check;
      throw error;
    }
  }
  const status = await statusRepository(info.root);
  if (!status.stagedCount) throw new Error("No staged changes to commit.");
  const args = ["commit", "-m", message];
  if (input.body) args.push("-m", String(input.body));
  const result = await runGit(info.root, args, { timeout: 120_000 });
  const oid = (await runGit(info.root, ["rev-parse", "HEAD"])).stdout.trim();
  const summary = (await runGit(info.root, ["show", "-s", "--format=%h%x1f%s%x1f%aI", "HEAD"])).stdout
    .trim()
    .split("\x1f");
  return {
    ok: true,
    root: info.root,
    oid,
    shortOid: summary[0],
    subject: summary[1],
    authoredAt: summary[2],
    output: result.stdout.trim(),
  };
}

async function listLog(directoryPath, options = {}) {
  const info = await requireRepository(directoryPath);
  const maxCount = Math.min(200, normalizePositiveInteger(options.maxCount, 50));
  const format = "%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e";
  const args = ["log", `--max-count=${maxCount}`, `--format=${format}`];
  if (options.file) args.push("--", safeRelativeGitPath(info.root, options.file));
  const result = await runGit(info.root, args, { allowExitCodes: [0, 128] });
  if (result.code !== 0) return [];
  return result.stdout
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [oid, shortOid, authorName, authorEmail, authoredAt, subject] = record.split("\x1f");
      return { oid, shortOid, authorName, authorEmail, authoredAt, subject };
    });
}

async function listBranches(directoryPath) {
  const info = await requireRepository(directoryPath);
  const format =
    "%(refname)%00%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(upstream:trackshort)%00%(objectname:short)%00%(committerdate:iso-strict)%00%(subject)%00";
  const result = await runGit(info.root, ["for-each-ref", `--format=${format}`, "refs/heads", "refs/remotes"]);
  const fields = result.stdout.split("\0");
  const branches = [];
  for (let index = 0; index + 7 < fields.length; index += 8) {
    const [ref, name, head, upstream, track, oid, committedAt, subject] = fields.slice(index, index + 8);
    if (!ref || name.endsWith("/HEAD")) continue;
    branches.push({
      ref,
      name,
      current: head === "*",
      remote: ref.startsWith("refs/remotes/"),
      upstream,
      track,
      oid,
      committedAt,
      subject,
    });
  }
  return branches;
}

async function createBranch(directoryPath, name, options = {}) {
  const info = await requireRepository(directoryPath);
  const branch = sanitizeBranchName(name);
  const args = options.switch === false ? ["branch", branch] : ["switch", "-c", branch];
  if (options.startPoint) args.push(String(options.startPoint));
  await runGit(info.root, args);
  return statusRepository(info.root);
}

async function switchBranch(directoryPath, name, options = {}) {
  const info = await requireRepository(directoryPath);
  const branch = sanitizeBranchName(name);
  const status = await statusRepository(info.root);
  if (!status.clean && !options.force)
    throw new Error("Workspace has local changes. Commit, stage, or discard them before switching branches.");
  const args = ["switch"];
  if (options.force) args.push("--discard-changes");
  args.push(branch);
  await runGit(info.root, args);
  return statusRepository(info.root);
}

async function fetchRepository(directoryPath, options = {}) {
  const info = await requireRepository(directoryPath);
  const args = ["fetch", "--prune"];
  if (options.remote) args.push(validateRemoteName(options.remote));
  await runGit(info.root, args, { timeout: 5 * 60_000 });
  return statusRepository(info.root);
}

async function addRemote(directoryPath, input = {}) {
  const info = await requireRepository(directoryPath);
  const name = validateRemoteName(input.name || "origin");
  const url = validateRemoteUrl(input.url);
  const existing = (await listRemotes(info.root)).find((item) => item.name === name);
  if (existing) await runGit(info.root, ["remote", "set-url", name, url]);
  else await runGit(info.root, ["remote", "add", name, url]);
  return statusRepository(info.root);
}

async function removeRemote(directoryPath, name) {
  const info = await requireRepository(directoryPath);
  await runGit(info.root, ["remote", "remove", validateRemoteName(name)]);
  return statusRepository(info.root);
}

async function pullRepository(directoryPath, options = {}) {
  const info = await requireRepository(directoryPath);
  const before = await statusRepository(info.root);
  if (!before.clean) throw new Error("Pull requires a clean workspace. Commit or discard local changes first.");
  const args = ["pull", options.rebase ? "--rebase" : "--ff-only"];
  let remote = options.remote ? validateRemoteName(options.remote) : "";
  let branch = options.branch ? sanitizeBranchName(options.branch) : "";
  if (!before.upstream && (!remote || !branch)) {
    remote ||= chooseDefaultRemote(before.remotes);
    branch ||= before.branch ? sanitizeBranchName(before.branch) : "";
  }
  if (remote) args.push(remote);
  if (branch) args.push(branch);
  const result = await runGit(info.root, args, { timeout: 5 * 60_000 });
  return { ...(await statusRepository(info.root)), output: result.stdout.trim() };
}

async function pushRepository(directoryPath, options = {}) {
  const info = await requireRepository(directoryPath);
  const before = await statusRepository(info.root);
  const args = ["push"];
  let remote = options.remote ? validateRemoteName(options.remote) : "";
  let branch = options.branch ? sanitizeBranchName(options.branch) : "";
  const setUpstream = Boolean(options.setUpstream || !before.upstream);
  if (setUpstream) {
    remote ||= chooseDefaultRemote(before.remotes);
    branch ||= before.branch ? sanitizeBranchName(before.branch) : "";
    if (!remote) throw new Error("No Git remote is configured. Add an origin remote before pushing.");
    if (!branch) throw new Error("Cannot push a detached HEAD without an explicit branch.");
    args.push("--set-upstream");
  }
  if (remote) args.push(remote);
  if (branch) args.push(branch);
  const result = await runGit(info.root, args, { timeout: 5 * 60_000 });
  return {
    ...(await statusRepository(info.root)),
    output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}

async function continueMerge(directoryPath) {
  const info = await requireRepository(directoryPath);
  await runGit(info.root, ["merge", "--continue"], { env: { ...SAFE_ENV, GIT_EDITOR: "true" } });
  return statusRepository(info.root);
}

async function abortMerge(directoryPath) {
  const info = await requireRepository(directoryPath);
  await runGit(info.root, ["merge", "--abort"]);
  return statusRepository(info.root);
}

async function preCommitCheck(directoryPath, options = {}) {
  const info = await requireRepository(directoryPath);
  const status = await statusRepository(info.root);
  const checks = [];
  const blockers = [];
  const warnings = [];

  addCheck("repository", true, "Git repository is available.");
  addCheck(
    "merge-conflicts",
    status.conflictCount === 0,
    status.conflictCount ? `${status.conflictCount} unresolved Git conflict(s).` : "No unresolved Git conflicts.",
    true,
  );

  const secretReport = await scanSecrets(info.root, { changedOnly: true });
  addCheck(
    "secret-scan",
    secretReport.findings.length === 0,
    secretReport.findings.length
      ? `${secretReport.findings.length} potential secret(s) detected.`
      : "No obvious secrets detected in changed files.",
    true,
    secretReport.findings,
  );

  try {
    const { readWorkspace, validateWorkspace, validateMockScenarios } = require("./cli-workspace.cjs");
    const workspace = await readWorkspace(info.root);
    const workspaceValidation = validateWorkspace(workspace);
    const workspaceErrors = Array.isArray(workspaceValidation.errors) ? workspaceValidation.errors : [];
    const contentOnlyErrors = workspaceErrors.filter(isEmptyWorkspaceContentError);
    const blockingWorkspaceErrors = workspaceErrors.filter((item) => !isEmptyWorkspaceContentError(item));
    addCheck(
      "workspace",
      blockingWorkspaceErrors.length === 0,
      blockingWorkspaceErrors.length === 0
        ? "Workspace schema and references are valid."
        : `${blockingWorkspaceErrors.length} workspace validation error(s).`,
      true,
      blockingWorkspaceErrors,
    );
    if (contentOnlyErrors.length)
      addCheck("workspace-content", false, "Workspace has no saved requests yet.", false, contentOnlyErrors);
    const mockValidation = validateMockScenarios(workspace);
    addCheck(
      "mocks",
      mockValidation.ok,
      mockValidation.ok ? "Mock scenarios are valid." : `${mockValidation.errors.length} mock validation error(s).`,
      true,
      mockValidation.errors,
    );
  } catch (error) {
    addCheck("workspace", false, `Workspace validation failed: ${cleanGitError(error)}`, true);
  }

  if (options.documentation !== false) {
    try {
      const { checkDocumentation } = require("./docs-workspace.cjs");
      const report = await checkDocumentation(info.root, {});
      const ok = report.errorCount === 0;
      addCheck(
        "documentation",
        ok,
        ok
          ? report.staleCount
            ? `${report.staleCount} documentation page(s) are stale.`
            : "Documentation is valid and current."
          : `${report.errorCount} documentation error(s).`,
        false,
        report.pages?.filter((page) => page.status === "error" || page.status === "outdated"),
      );
    } catch (error) {
      addCheck("documentation", true, `Documentation check skipped: ${cleanGitError(error)}`, false);
    }
  }

  return { ok: blockers.length === 0, root: info.root, checks, blockers, warnings, status, secretReport };

  function addCheck(id, passed, message, blocking = false, details) {
    const item = { id, passed, blocking, message, details };
    checks.push(item);
    if (!passed) (blocking ? blockers : warnings).push(item);
  }
}

async function scanSecrets(directoryPath, options = {}) {
  const info = await requireRepository(directoryPath);
  const status = await statusRepository(info.root);
  const candidates = options.changedOnly
    ? status.changes.map((item) => item.path)
    : await listWorkspaceTextFiles(info.root);
  const findings = [];
  for (const relative of [...new Set(candidates)]) {
    if (shouldIgnoreSecretScan(relative)) continue;
    const absolute = path.join(info.root, relative);
    const stat = await fsp.stat(absolute).catch(() => null);
    if (!stat?.isFile() || stat.size > 2 * 1024 * 1024) continue;
    const content = await fsp.readFile(absolute, "utf8").catch(() => "");
    if (!content || content.includes("\u0000")) continue;
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of SECRET_RULES) {
        const match = line.match(rule.pattern);
        if (!match) continue;
        const value = String(match[1] || match[0] || "").trim();
        if (isSafeSecretPlaceholder(value, line)) continue;
        findings.push({
          file: relative,
          line: index + 1,
          rule: rule.id,
          severity: rule.severity,
          preview: redactLine(line),
        });
      }
    });
  }
  return { root: info.root, scannedFiles: candidates.length, findings };
}

const SECRET_RULES = [
  { id: "private-key", severity: "critical", pattern: /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i },
  { id: "bearer-token", severity: "high", pattern: /authorization\s*[:=]\s*["']?bearer\s+([^\s"']{12,})/i },
  {
    id: "credential",
    severity: "high",
    pattern:
      /(?:password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret|secret)\s*[:=]\s*["']?([^\s"'#,}{]{8,})/i,
  },
  { id: "url-credential", severity: "high", pattern: /https?:\/\/[^\s/:]+:([^@\s]+)@/i },
];

async function readMergeState(root, changes) {
  const gitDir = (await runGit(root, ["rev-parse", "--git-dir"])).stdout.trim();
  const absolute = path.resolve(root, gitDir);
  const type = fs.existsSync(path.join(absolute, "MERGE_HEAD"))
    ? "merge"
    : fs.existsSync(path.join(absolute, "rebase-merge")) || fs.existsSync(path.join(absolute, "rebase-apply"))
      ? "rebase"
      : fs.existsSync(path.join(absolute, "CHERRY_PICK_HEAD"))
        ? "cherry-pick"
        : "none";
  return { active: type !== "none", type, conflicts: changes.filter((item) => item.conflict).map((item) => item.path) };
}

async function listRemotes(root) {
  const result = await runGit(root, ["remote", "-v"]);
  const map = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (!match) continue;
    const current = map.get(match[1]) || { name: match[1], fetchUrl: "", pushUrl: "" };
    current[match[3] === "fetch" ? "fetchUrl" : "pushUrl"] = match[2];
    map.set(match[1], current);
  }
  return [...map.values()];
}

function parsePorcelainV2(output) {
  const records = String(output || "").split("\0");
  const result = { branch: "", upstream: "", ahead: 0, behind: 0, detached: false, changes: [] };
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.startsWith("# ")) {
      const line = record.slice(2);
      if (line.startsWith("branch.head ")) {
        result.branch = line.slice(12);
        result.detached = result.branch === "(detached)";
      } else if (line.startsWith("branch.upstream ")) result.upstream = line.slice(16);
      else if (line.startsWith("branch.ab ")) {
        const match = line.match(/\+(\d+)\s+-(\d+)/);
        if (match) {
          result.ahead = Number(match[1]);
          result.behind = Number(match[2]);
        }
      }
      continue;
    }
    const type = record[0];
    if (type === "?") {
      const file = record.slice(2);
      result.changes.push(changeRecord(file, "??", { untracked: true, unstaged: true }));
      continue;
    }
    if (type === "!") continue;
    if (type === "1") {
      const match = record.match(/^1\s+(\S{2})\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/s);
      if (!match) continue;
      result.changes.push(changeRecord(match[2], match[1]));
      continue;
    }
    if (type === "2") {
      const match = record.match(/^2\s+(\S{2})\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/s);
      if (!match) continue;
      const originalPath = records[index + 1] || "";
      index += 1;
      result.changes.push(changeRecord(match[2], match[1], { originalPath, renamed: true }));
      continue;
    }
    if (type === "u") {
      const match = record.match(/^u\s+(\S{2})\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/s);
      if (!match) continue;
      result.changes.push(changeRecord(match[2], match[1], { conflict: true, staged: true, unstaged: true }));
    }
  }
  return result;
}

function changeRecord(file, xy, extras = {}) {
  const indexStatus = xy[0] || ".";
  const worktreeStatus = xy[1] || ".";
  const status = extras.untracked
    ? "untracked"
    : extras.conflict || isConflictStatus(xy)
      ? "conflict"
      : mapChangeStatus(indexStatus !== "." ? indexStatus : worktreeStatus);
  return {
    path: normalizeSlashes(file),
    originalPath: extras.originalPath ? normalizeSlashes(extras.originalPath) : "",
    xy,
    indexStatus,
    worktreeStatus,
    status,
    staged: extras.staged ?? (indexStatus !== "." && indexStatus !== "?"),
    unstaged: extras.unstaged ?? (worktreeStatus !== "." || extras.untracked === true),
    conflict: extras.conflict ?? isConflictStatus(xy),
    untracked: extras.untracked === true,
    renamed: extras.renamed === true,
    entity: describeWorkspaceEntity(file),
  };
}

function describeWorkspaceEntity(file) {
  const normalized = normalizeSlashes(file);
  const basename = path.posix.basename(normalized);
  const title = basename
    .replace(/--[^.]+(?=\.)/, "")
    .replace(/\.(?:rest|grpc|websocket|tab|example|scenario)?\.?(?:ya?ml|md|proto|json)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  let kind = "file";
  if (/\.grpc\.ya?ml$/i.test(normalized)) kind = "gRPC request";
  else if (/\.rest\.ya?ml$/i.test(normalized)) kind = "REST request";
  else if (/\.websocket\.ya?ml$/i.test(normalized)) kind = "WebSocket request";
  else if (normalized.includes("/examples/") || normalized.startsWith("examples/")) kind = "example";
  else if (normalized.includes("/mocks/") || normalized.startsWith("mocks/")) kind = "mock scenario";
  else if (/\.proto$/i.test(normalized)) kind = "proto source";
  else if (/\.md$/i.test(normalized)) kind = "documentation";
  else if (basename === "collection.yml") kind = "collection";
  else if (basename === "folder.yml") kind = "folder";
  else if (basename === "layang.yml") kind = "workspace manifest";
  return { kind, title: title || basename, path: normalized };
}

function mapChangeStatus(code) {
  return (
    { A: "added", M: "modified", D: "deleted", R: "renamed", C: "copied", T: "type-changed", U: "conflict" }[code] ||
    "modified"
  );
}
function isConflictStatus(xy) {
  return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(xy);
}

async function requireRepository(directoryPath) {
  const info = await detectRepository(directoryPath);
  if (!info.initialized) throw new Error("The selected workspace is not a Git repository. Initialize it first.");
  if (info.bare) throw new Error("Bare Git repositories are not supported as Layang workspaces.");
  return info;
}

async function runGit(cwd, args, options = {}) {
  const directory = resolveDirectory(cwd);
  return runGitRaw(["-C", directory, ...args], { ...options, cwd: directory });
}

async function runGitRaw(args, options = {}) {
  validateGitArgs(args);
  try {
    const result = await execFileAsync(resolveGitExecutable(), args, {
      cwd: options.cwd || process.cwd(),
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
    const wrapped = new Error(cleanGitError(error));
    wrapped.code = code;
    wrapped.stdout = error?.stdout || "";
    wrapped.stderr = error?.stderr || "";
    throw wrapped;
  }
}

function validateGitArgs(args) {
  if (!Array.isArray(args) || !args.length) throw new Error("Git command arguments are required.");
  for (const argument of args) {
    if (typeof argument !== "string" || argument.includes("\u0000")) throw new Error("Invalid Git command argument.");
  }
}
function resolveGitExecutable() {
  return process.env.LAYANG_GIT_PATH || "git";
}
async function isGitAvailable() {
  try {
    await gitVersion();
    return true;
  } catch {
    return false;
  }
}
function resolveDirectory(value) {
  return path.resolve(String(value || "."));
}
function normalizeSlashes(value) {
  return String(value || "").replaceAll("\\", "/");
}
function normalizePathList(root, paths) {
  const list = Array.isArray(paths) ? paths : paths ? [paths] : [];
  return [...new Set(list.map((item) => safeRelativeGitPath(root, item)).filter(Boolean))];
}
function safeRelativeGitPath(root, value) {
  const raw = normalizeSlashes(value).replace(/^\.\//, "");
  const absolute = path.resolve(root, raw);
  const relative = normalizeSlashes(path.relative(root, absolute));
  if (!relative || relative === ".") return "";
  if (relative.startsWith("../") || path.isAbsolute(relative))
    throw new Error(`Path is outside the repository: ${value}`);
  return relative;
}
function sanitizeBranchName(value) {
  const branch = String(value || "").trim();
  if (!branch || branch.length > 255 || /[\s~^:?*[\\]|\.\.|@\{|^\.|\.$|\/$|\/\.|\.lock$]/.test(branch))
    throw new Error("Invalid Git branch name.");
  return branch;
}
function validateRemoteName(value) {
  const name = String(value || "").trim();
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error("Invalid Git remote name.");
  return name;
}
function validateRemoteUrl(value) {
  const url = String(value || "").trim();
  if (!url || url.length > 4096 || /[\r\n]/.test(url) || url.includes("\u0000") || url.startsWith("-"))
    throw new Error("Invalid Git repository URL.");
  if (!/^(?:https?:\/\/|ssh:\/\/|git@|file:\/\/|[A-Za-z]:[\\/]|\/)/.test(url))
    throw new Error("Repository URL must use HTTPS, SSH, file://, or a local path.");
  return url;
}
function chooseDefaultRemote(remotes) {
  const list = Array.isArray(remotes) ? remotes : [];
  return list.find((item) => item.name === "origin")?.name || list[0]?.name || "";
}
function isEmptyWorkspaceContentError(value) {
  return /^No saved (?:REST|WebSocket|gRPC)|no saved requests/i.test(String(value || "").trim());
}
function normalizePositiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
function normalizeNonNegativeInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
function cleanGitError(error) {
  const text = String(error?.stderr || error?.message || error || "Git command failed.").trim();
  return (
    text
      .replace(/^Command failed:[^\n]*\n?/, "")
      .replace(/^fatal:\s*/i, "")
      .trim() || "Git command failed."
  );
}
function createUntrackedDiff(file, content) {
  const lines = String(content || "").split(/\r?\n/);
  return [
    `diff --git a/${file} b/${file}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${file}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
  ].join("\n");
}
function isSafeSecretPlaceholder(value, line) {
  const text = `${value} ${line}`.toLowerCase();
  return (
    text.includes("{{secret") ||
    text.includes("${") ||
    text.includes("<secret") ||
    text.includes("changeme") ||
    text.includes("example") ||
    text.includes("dummy") ||
    text.includes("redacted") ||
    /^\*+$/.test(value)
  );
}
function redactLine(line) {
  return String(line)
    .replace(/(:|=)(\s*["']?)[^\s"'#,}{]{4,}/g, "$1$2***")
    .slice(0, 240);
}
function shouldIgnoreSecretScan(relative) {
  const normalized = normalizeSlashes(relative);
  return (
    normalized.startsWith(".git/") ||
    normalized.startsWith(".layang/") ||
    normalized.startsWith("node_modules/") ||
    /\.(?:png|jpe?g|gif|webp|ico|zip|gz|pfx|p12|der|pdf|woff2?|ttf|exe|dll)$/i.test(normalized)
  );
}
async function listWorkspaceTextFiles(root) {
  const output = [];
  async function visit(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = normalizeSlashes(path.relative(root, absolute));
      if (entry.isDirectory()) {
        if (!shouldIgnoreSecretScan(`${relative}/`)) await visit(absolute);
      } else output.push(relative);
    }
  }
  await visit(root);
  return output;
}

module.exports = {
  gitVersion,
  detectRepository,
  initRepository,
  cloneRepository,
  statusRepository,
  getDiff,
  stagePaths,
  unstagePaths,
  discardPaths,
  commitChanges,
  listLog,
  listBranches,
  createBranch,
  switchBranch,
  fetchRepository,
  addRemote,
  removeRemote,
  pullRepository,
  pushRepository,
  continueMerge,
  abortMerge,
  preCommitCheck,
  scanSecrets,
  parsePorcelainV2,
  describeWorkspaceEntity,
  validateRemoteUrl,
};
