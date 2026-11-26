"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const git = require("../lib/git-client.cjs");
const gitUx = require("../lib/git-ux-v2.cjs");

function hasGit() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function repoWithHostileConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "layang-git-hostile-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.invalid"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Layang Test"]);
  fs.writeFileSync(path.join(root, "a.txt"), "a\n");
  execFileSync("git", ["-C", root, "add", "a.txt"]);
  execFileSync("git", ["-C", root, "commit", "-q", "-m", "init"]);
  const marker = path.join(root, "pwned");
  const script = path.join(root, process.platform === "win32" ? "evil.cmd" : "evil.sh");
  fs.writeFileSync(
    script,
    process.platform === "win32" ? `@echo off\r\necho x > "${marker}"\r\n` : `#!/bin/sh\necho x > "${marker}"\n`,
  );
  fs.chmodSync(script, 0o755);
  execFileSync("git", ["-C", root, "config", "core.fsmonitor", script]);
  return { root, marker };
}

test("repository config cannot run a program during status, log or branch listing", { skip: !hasGit() }, async () => {
  const { root, marker } = await repoWithHostileConfig();
  await git.statusRepository(root);
  await git.listLog(root, {});
  await git.listBranches(root);
  await gitUx.getGitUxState(root).catch(() => undefined);
  assert.equal(fs.existsSync(marker), false, "core.fsmonitor from .git/config must not run");
});

test("hardened config is passed before every git subcommand", () => {
  assert.deepEqual(git.HARDENED_GIT_CONFIG, [
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.pager=cat",
    "-c",
    "protocol.ext.allow=never",
  ]);
});

test("branch names and start points that look like options are rejected", { skip: !hasGit() }, async () => {
  const { root } = await repoWithHostileConfig();
  await assert.rejects(git.createBranch(root, "-D", {}), /Invalid Git branch name/);
  await assert.rejects(git.createBranch(root, "feature", { startPoint: "--orphan" }), /Invalid Git start point/);
  await assert.rejects(gitUx.addWorktree(root, { path: path.join(root, "..", "wt"), newBranch: "-f" }), /Invalid Git branch name/);
});
