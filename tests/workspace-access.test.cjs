"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createWorkspaceAccess, canonicalizePath } = require("../electron/utils/workspace-access.cjs");

function tempDir(prefix = "layang-access-") {
  // realpathSync.native expands Windows 8.3 short names (RUNNER~1), as workspace-access.cjs does.
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

test("an unknown folder is refused, a granted folder and its children are allowed", () => {
  const workspace = tempDir();
  const access = createWorkspaceAccess({ platform: "linux" });
  assert.equal(access.isAllowed(workspace), false);
  assert.throws(() => access.assertAllowed(workspace), { code: "WORKSPACE_NOT_TRUSTED" });

  access.addRoot(workspace);
  assert.equal(access.isAllowed(workspace), true);
  assert.equal(access.isAllowed(path.join(workspace, "docs", "site", "index.html")), true);
  assert.equal(access.assertAllowed(workspace), workspace);
});

test("sibling folders sharing a name prefix and traversal out of a root are refused", () => {
  const parent = tempDir();
  const workspace = path.join(parent, "ws");
  fs.mkdirSync(workspace);
  const access = createWorkspaceAccess({ platform: "linux" });
  access.addRoot(workspace);
  assert.equal(access.isAllowed(path.join(parent, "ws-other")), false);
  assert.equal(access.isAllowed(path.join(workspace, "..", "elsewhere")), false);
  assert.equal(access.isAllowed(parent), false);
});

test("a symlink inside a granted folder cannot reach outside it", () => {
  const workspace = tempDir();
  const outside = tempDir();
  const link = path.join(workspace, "escape");
  try {
    fs.symlinkSync(outside, link, "dir");
  } catch {
    return; // Symlinks need extra privileges on some Windows runners.
  }
  const access = createWorkspaceAccess({ platform: "linux" });
  access.addRoot(workspace);
  assert.equal(access.isAllowed(link), false);
  assert.equal(access.isAllowed(path.join(link, "calc.exe")), false);
});

test("filesystem roots are never trusted", () => {
  const access = createWorkspaceAccess({ platform: process.platform });
  assert.equal(access.addRoot(path.parse(process.cwd()).root), "");
  assert.equal(access.isAllowed(path.join(path.parse(process.cwd()).root, "Windows", "System32", "calc.exe")), false);
});

test("requestAccess asks the user once and remembers the answer", async () => {
  const workspace = tempDir();
  const prompts = [];
  let answer = false;
  const access = createWorkspaceAccess({
    platform: "linux",
    confirm: async (directoryPath) => {
      prompts.push(directoryPath);
      return answer;
    },
  });
  assert.equal(await access.requestAccess(workspace), "");
  assert.equal(access.isAllowed(workspace), false);

  answer = true;
  assert.equal(await access.requestAccess(workspace), workspace);
  assert.equal(await access.requestAccess(path.join(workspace, "sub")), path.join(workspace, "sub"));
  assert.deepEqual(prompts, [workspace, workspace]);
});

test("granted folders persist across restarts", () => {
  const userData = tempDir();
  const workspace = tempDir();
  const storePath = path.join(userData, "trusted-workspaces.json");
  createWorkspaceAccess({ platform: "linux", storePath }).addRoot(workspace);
  const reloaded = createWorkspaceAccess({ platform: "linux", storePath });
  assert.equal(reloaded.isAllowed(workspace), true);
});

test("Windows paths compare case-insensitively", () => {
  const access = createWorkspaceAccess({ platform: "win32", realpath: (value) => value });
  const workspace = path.resolve("/Users/Dev/Layang/Workspace");
  access.addRoot(workspace);
  assert.equal(access.isAllowed(workspace.toUpperCase()), true);
});

test("canonicalizePath keeps missing children of an existing folder", () => {
  const workspace = tempDir();
  assert.equal(canonicalizePath(path.join(workspace, "new", "child")), path.join(workspace, "new", "child"));
  assert.equal(canonicalizePath("bad\u0000path"), "");
});

test("main-process IPC handlers check workspace access before touching the disk", () => {
  const main = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
  for (const channel of [
    "workspace:ensure-folder",
    "workspace:migrate-legacy-local-state",
    "workspace:set-preference",
    "workspace:create-folder",
    "workspace:save-folder",
    "workspace:open-path",
    "workspace:get-revision",
    "workspace:open-folder",
    "docs:build",
    "docs:check",
  ]) {
    const start = main.indexOf(`ipcMain.handle("${channel}"`);
    assert.ok(start >= 0, `${channel} handler exists`);
    const end = main.indexOf("ipcMain.handle(", start + 10);
    const body = main.slice(start, end === -1 ? undefined : end);
    assert.match(body, /getWorkspaceAccess\(\)/, `${channel} checks workspace access`);
  }
  assert.match(main, /checkOpenPathPolicy/);
  assert.doesNotMatch(main, /writeFile\(targetPath, "", \{ flag: "a" \}\)/, "reveal no longer creates files");

  for (const file of ["git-ipc.cjs", "cli-ipc.cjs", "grpc-scenario-store-ipc.cjs"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", file), "utf8");
    assert.match(source, /getWorkspaceAccess\(\)\.assertAllowed/, `${file} checks workspace access`);
  }
});
