"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "cli-args.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("cli-args.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const { parseCliArgs, normalizeRunOptions, normalizePositiveInteger, helpText } = require("../lib/cli-args.cjs");
    
    test("parses file-based run command flags", () => {
      const parsed = parseCliArgs([
        "run",
        "./workspace",
        "--env",
        "dev",
        "--method",
        "demo.Greeter/SayHello",
        "--reporter",
        "json",
        "--output",
        "reports/result.json",
        "--bail",
      ]);
      assert.equal(parsed.command, "run");
      assert.equal(parsed.workspace, "./workspace");
      const options = normalizeRunOptions(parsed);
      assert.equal(options.env, "dev");
      assert.equal(options.method, "demo.Greeter/SayHello");
      assert.equal(options.reporter, "json");
      assert.equal(options.output, "reports/result.json");
      assert.equal(options.bail, true);
    });
    
    test("normalizes invalid positive integers to fallback", () => {
      assert.equal(normalizePositiveInteger("0", 123), 123);
      assert.equal(normalizePositiveInteger("abc", 123), 123);
      assert.equal(normalizePositiveInteger("42", 123), 42);
    });
    
    test("rejects invalid reporter", () => {
      const parsed = parseCliArgs(["run", ".", "--reporter", "tap"]);
      assert.throws(() => normalizeRunOptions(parsed), /Reporter must be/);
    });
    
    test("help text documents run and validate commands", () => {
      const text = helpText();
      assert.match(text, /layang run/);
      assert.match(text, /validate/);
    });
    
    test("normalizes websocket transport options", () => {
      const parsed = parseCliArgs(["run", "./workspace", "--transport", "websocket", "--ws-wait", "250"]);
      const options = normalizeRunOptions(parsed);
      assert.equal(options.transport, "websocket");
      assert.equal(options.wsWaitMs, 250);
    });
    
    test("parses Git change-set assignment parity command", () => {
      const parsed = parseCliArgs(["git:change-set-assign", ".", "--id", "feature-x", "--path", "requests/a.yml"]);
      assert.equal(parsed.command, "git:change-set-assign");
      assert.equal(parsed.flags.id, "feature-x");
      assert.deepEqual(parsed.flags.path, ["requests/a.yml"]);
      assert.match(helpText(), /git:change-set-assign/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "cli-command-line.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("cli-command-line.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const { splitCliCommandLine, normalizeIntegratedCliCommand } = require("../lib/cli-command-line.cjs");
    
    test("integrated CLI strips an optional layang executable prefix", () => {
      assert.deepEqual(normalizeIntegratedCliCommand('layang run --request "Get User"'), ["run", "--request", "Get User"]);
      assert.deepEqual(normalizeIntegratedCliCommand("schemas --json"), ["schemas", "--json"]);
    });
    
    test("integrated CLI tokenizer preserves quoted arguments and escaped spaces", () => {
      assert.deepEqual(splitCliCommandLine('git:commit --message "feat: hello world"'), [
        "git:commit",
        "--message",
        "feat: hello world",
      ]);
      assert.deepEqual(splitCliCommandLine("schema:import --file proto\\ files/api.proto"), [
        "schema:import",
        "--file",
        "proto files/api.proto",
      ]);
      assert.deepEqual(splitCliCommandLine('schema:import --file "C:\\Users\\me\\api.proto"'), [
        "schema:import",
        "--file",
        "C:\\Users\\me\\api.proto",
      ]);
    });
    
    test("integrated CLI tokenizer rejects unterminated quotes", () => {
      assert.throws(() => splitCliCommandLine('run --request "broken'), /Unterminated double quote/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "cli-cross-platform-distribution.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("cli-cross-platform-distribution.test.cjs", () => {
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
    
  });
}
