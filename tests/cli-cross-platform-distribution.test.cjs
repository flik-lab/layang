"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const {
  guiExecutableCandidates,
  resolveGuiExecutable,
  launchGui,
} = require("../lib/cli-ui.cjs");
const { parseCliArgs, helpText } = require("../lib/cli-args.cjs");

test("ui command accepts an optional workspace", () => {
  const parsed = parseCliArgs(["ui", "./workspace"]);
  assert.equal(parsed.command, "ui");
  assert.equal(parsed.workspace, "./workspace");
  assert.match(helpText(), /layang ui \[workspace\]/);
});

test("GUI locator has Windows and Linux candidates without selecting the CLI runtime", () => {
  const windows = guiExecutableCandidates({
    platform: "win32",
    home: "C:\\Users\\dev",
    execPath: "C:\\LayangCLI\\runtime\\node.exe",
    env: { LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local", ProgramFiles: "C:\\Program Files" },
  });
  assert.ok(windows.some((item) => /Layang[\\/]Layang\.exe$/i.test(item)));

  const linux = guiExecutableCandidates({
    platform: "linux",
    home: "/home/dev",
    execPath: "/opt/layang-cli/runtime/node",
    env: {},
  });
  assert.ok(linux.includes(path.resolve("/usr/bin/layang-gui")));
  assert.ok(linux.includes(path.resolve("/home/dev/.local/bin/layang-gui")));
});

test("LAYANG_GUI_EXECUTABLE takes precedence", () => {
  const custom = path.resolve("/custom/LayangGUI");
  const resolved = resolveGuiExecutable({
    platform: "linux",
    env: { LAYANG_GUI_EXECUTABLE: custom },
    existsSync: (candidate) => candidate === custom,
  });
  assert.equal(resolved, custom);
});

test("launchGui forwards a normalized workspace through --workspace", async () => {
  let call;
  const child = new EventEmitter();
  child.unrefCalled = false;
  child.unref = function unref() { this.unrefCalled = true; };
  const pending = launchGui("./workspace folder", {
    executable: "/opt/Layang/Layang",
    spawnImpl: (command, args, options) => {
      call = { command, args, options };
      process.nextTick(() => child.emit("spawn"));
      return child;
    },
  });
  const result = await pending;
  assert.equal(call.command, "/opt/Layang/Layang");
  assert.deepEqual(call.args, ["--workspace", path.resolve("./workspace folder")]);
  assert.equal(call.options.detached, true);
  assert.equal(child.unrefCalled, true);
  assert.equal(result.workspacePath, path.resolve("./workspace folder"));
});

const { findWorkspaceArgument } = require("../electron/utils/launch-args.cjs");

test("desktop launch arguments accept Windows/Linux workspace paths", () => {
  assert.equal(
    findWorkspaceArgument(["Layang.exe", "--workspace", "C:\\repo\\api"], { resolve: (value) => value }),
    "C:\\repo\\api",
  );
  assert.equal(
    findWorkspaceArgument(["layang-gui", "--workspace=/srv/api"], { resolve: (value) => value }),
    "/srv/api",
  );
});

test("desktop bootstrap prioritizes CLI launch workspace and keeps second-instance handoff", () => {
  const fs = require("node:fs");
  const root = path.resolve(__dirname, "..");
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");
  const controller = fs.readFileSync(
    path.join(root, "app/playground/features/workspace/use-workspace-controller.ts"),
    "utf8",
  );
  assert.match(main, /findWorkspaceArgument\(process\.argv\)/);
  assert.match(main, /writeWorkspacePreference\(\{ workspaceDirectoryPath: pendingWorkspaceOpen \}\)/);
  assert.match(main, /workspace:open-request/);
  assert.match(preload, /pendingWorkspaceOpenRequest/);
  assert.match(preload, /onOpenRequest/);
  assert.match(controller, /const startupWorkspacePath/);
  assert.match(controller, /workspacePreference\.hasCustomPreference/);
  assert.match(controller, /Workspace opened from Layang CLI/);
});

test("Windows CLI launcher compiles through a temporary batch file after vcvars setup", () => {
  const fs = require("node:fs");
  const root = path.resolve(__dirname, "..");
  const packaging = fs.readFileSync(path.join(root, "scripts/build-cli-portable.cjs"), "utf8");

  assert.match(packaging, /path\.join\(output, "compile-launcher\.cmd"\)/);
  assert.match(packaging, /call "\$\{compiler\.vcvars\}" \$\{vcArch\}/);
  assert.match(packaging, /spawnSync\("cmd\.exe", \["\/d", "\/c", compileScript\]/);
  assert.match(packaging, /fs\.rmSync\(compileScript, \{ force: true \}\)/);
  assert.match(packaging, /fs\.rmSync\(objectFile, \{ force: true \}\)/);
  assert.doesNotMatch(packaging, /\["\/d", "\/s", "\/c", command\]/);
});
