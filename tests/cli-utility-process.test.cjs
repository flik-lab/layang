"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");

const { createCliIpcContext, registerCliIpc, stopActiveCliRuns } = require("../electron/ipc/cli-ipc.cjs");
const { createWorkspaceAccess } = require("../electron/utils/workspace-access.cjs");
const { launchCliDaemon, SPAWN_DAEMON_REQUEST, SPAWN_DAEMON_RESULT } = require("../lib/cli-daemon-launcher.cjs");

function createFakeUtilityProcess() {
  const forks = [];
  let nextPid = 4000;
  return {
    forks,
    fork(modulePath, args, options) {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.pid = ++nextPid;
      child.posted = [];
      child.killed = false;
      child.postMessage = (message) => child.posted.push(message);
      child.kill = () => {
        child.killed = true;
        child.stdout.end();
        child.stderr.end();
        setImmediate(() => child.emit("exit", 143));
        return true;
      };
      forks.push({ modulePath, args, options, child });
      setImmediate(() => child.emit("spawn"));
      return child;
    },
  };
}

function tempWorkspace(t) {
  // realpathSync.native expands Windows 8.3 short names (RUNNER~1), as the main process does.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "layang-cli-up-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".layang", "runtime"), { recursive: true });
  return root;
}

function createContext(t, extra = {}) {
  const workspace = tempWorkspace(t);
  const access = createWorkspaceAccess();
  access.addRoot(workspace, { persist: false });
  const utilityProcess = createFakeUtilityProcess();
  const context = createCliIpcContext({
    utilityProcess,
    getAppPath: () => "/app",
    getWorkspaceAccess: () => access,
    ...extra,
  });
  t.after(() => stopActiveCliRuns());
  return { workspace, utilityProcess, context };
}

function fakeSender() {
  const events = [];
  return { events, isDestroyed: () => false, send: (channel, payload) => events.push({ channel, ...payload }) };
}

test("cli:run forks the CLI in a utility process with LAYANG_INTEGRATED_CLI and streams events", async (t) => {
  const { workspace, utilityProcess, context } = createContext(t);
  const sender = fakeSender();
  const running = context.runCli({ sender }, { runId: "run-1", command: "layang validate .", workspacePath: workspace });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(utilityProcess.forks.length, 1);
  const { modulePath, args, options, child } = utilityProcess.forks[0];
  assert.equal(modulePath, path.join("/app", "lib", "cli-utility-entry.cjs"));
  assert.deepEqual(args, ["validate", "."]);
  assert.equal(options.cwd, workspace);
  assert.equal(options.stdio, "pipe");
  assert.equal(options.serviceName, "Layang CLI");
  assert.equal(options.env.LAYANG_INTEGRATED_CLI, "1");
  assert.equal(options.env.ELECTRON_RUN_AS_NODE, undefined);

  child.stdout.write("hello\n");
  child.stderr.write("warn\n");
  child.stdout.end();
  child.stderr.end();
  child.emit("exit", 0);
  const result = await running;

  assert.deepEqual(result, { ok: true, code: 0, signal: "", runId: "run-1" });
  assert.ok(sender.events.every((event) => event.channel === "cli:event:run-1"));
  assert.deepEqual(
    sender.events.map((event) => [event.type, event.data]),
    [["stdout", "hello\n"], ["stderr", "warn\n"], ["exit", JSON.stringify({ code: 0, signal: "" })]],
  );
});

test("cli:run refuses a workspace that was not granted", async (t) => {
  const { utilityProcess, context } = createContext(t);
  const result = await context.runCli({ sender: fakeSender() }, { runId: "run-2", command: "validate .", workspacePath: os.tmpdir() });
  assert.equal(result.ok, false);
  assert.match(result.error, /not been given access/);
  assert.equal(utilityProcess.forks.length, 0);
});

test("cli:cancel kills the utility process of an active run", async (t) => {
  const workspace = tempWorkspace(t);
  const access = createWorkspaceAccess();
  access.addRoot(workspace, { persist: false });
  const utilityProcess = createFakeUtilityProcess();
  const handlers = new Map();
  registerCliIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    utilityProcess,
    getAppPath: () => "/app",
    getWorkspaceAccess: () => access,
  });
  const sender = fakeSender();
  const running = handlers.get("cli:run")({ sender }, { runId: "run-c", command: "mock:start . --protocol grpc", workspacePath: workspace });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await handlers.get("cli:cancel")({}, { runId: "run-c" }), { ok: true, cancelled: true });
  const result = await running;
  assert.equal(result.ok, false);
  assert.equal(utilityProcess.forks[0].child.killed, true);
});

test("daemon requests are validated strictly before anything is forked", (t) => {
  const { workspace, context } = createContext(t);
  const log = path.join(workspace, ".layang", "runtime", "mock-runtime.log");
  const ok = context.validateDaemonRequest({ args: ["mock:serve", workspace, "--protocol", "grpc"], logFile: log });
  assert.equal(ok.serviceName, "Layang mock daemon");
  assert.equal(ok.logFile, log);
  const gateway = context.validateDaemonRequest({
    args: ["gateway:serve", workspace, "--profile", "default"],
    logFile: path.join(workspace, ".layang", "gateway-runtime", "default.log"),
  });
  assert.equal(gateway.serviceName, "Layang gateway daemon");

  const reject = (message, pattern) => assert.throws(() => context.validateDaemonRequest(message), pattern);
  reject({ args: ["validate", workspace, "--protocol", "grpc"], logFile: log }, /not allowed/);
  reject({ args: ["mock:serve", workspace, "--protocol", "grpc", "--extra"], logFile: log }, /Invalid/);
  reject({ args: ["mock:serve", workspace, "--profile", "grpc"], logFile: log }, /Invalid/);
  reject({ args: ["mock:serve", workspace, "--protocol", "bogus"], logFile: log }, /Mock protocol/);
  reject({ args: ["gateway:serve", workspace, "--profile", "--inspect"], logFile: log }, /Invalid/);
  reject({ args: ["mock:serve", os.homedir(), "--protocol", "grpc"], logFile: log }, /not been given access/);
  reject({ args: ["mock:serve", workspace, "--protocol", "grpc"], logFile: path.join(workspace, "evil.log") }, /\.layang/);
  reject({ args: ["mock:serve", workspace, "--protocol", "grpc"], logFile: path.join(workspace, ".layang", "..", "x.log") }, /\.layang/);
  reject({ args: ["mock:serve", workspace, "--protocol", "grpc"], logFile: path.join(os.tmpdir(), "x.log") }, /\.layang/);
  reject({ args: ["mock:serve", workspace, "--protocol", "grpc"], logFile: "" }, /log file/);
});

test("a symlinked .layang folder cannot redirect the daemon log", { skip: process.platform === "win32" }, (t) => {
  const other = tempWorkspace(t);
  const workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "layang-cli-link-")));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  fs.symlinkSync(path.join(other, ".layang"), path.join(workspace, ".layang"));
  const access = createWorkspaceAccess();
  access.addRoot(workspace, { persist: false });
  const linked = createCliIpcContext({ utilityProcess: createFakeUtilityProcess(), getAppPath: () => "/app", getWorkspaceAccess: () => access });
  assert.throws(
    () => linked.validateDaemonRequest({
      args: ["mock:serve", workspace, "--protocol", "grpc"],
      logFile: path.join(workspace, ".layang", "runtime", "mock-runtime.log"),
    }),
    /\.layang/,
  );
});

test("the main process forks a validated daemon, logs its output and replies with its pid", async (t) => {
  const { workspace, utilityProcess, context } = createContext(t);
  const cliChild = { posted: [], postMessage(message) { this.posted.push(message); } };
  const logFile = path.join(workspace, ".layang", "runtime", "mock-runtime.log");
  await context.handleChildMessage(cliChild, {
    type: SPAWN_DAEMON_REQUEST,
    id: "req-1",
    args: ["mock:serve", workspace, "--protocol", "all"],
    logFile,
  });
  const daemon = utilityProcess.forks[0];
  assert.equal(daemon.options.serviceName, "Layang mock daemon");
  assert.equal(daemon.options.cwd, workspace);
  assert.equal(daemon.options.env.LAYANG_INTEGRATED_CLI, "1");
  assert.deepEqual(daemon.args, ["mock:serve", workspace, "--protocol", "all"]);
  assert.deepEqual(cliChild.posted, [{ type: SPAWN_DAEMON_RESULT, id: "req-1", pid: daemon.child.pid }]);

  daemon.child.stdout.write("daemon says hi\n");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(fs.readFileSync(logFile, "utf8"), /daemon says hi/);

  await context.handleChildMessage(cliChild, {
    type: SPAWN_DAEMON_REQUEST,
    id: "req-2",
    args: ["validate", workspace, "--protocol", "all"],
    logFile,
  });
  assert.equal(utilityProcess.forks.length, 1);
  assert.equal(cliChild.posted[1].id, "req-2");
  assert.match(cliChild.posted[1].error, /not allowed/);

  stopActiveCliRuns();
  assert.equal(daemon.child.killed, true, "daemons stop with the app");
});

test("launchCliDaemon asks the main process over parentPort inside the integrated CLI", async () => {
  const port = new EventEmitter();
  port.posted = [];
  port.postMessage = (message) => {
    port.posted.push(message);
    setImmediate(() => port.emit("message", { data: { type: SPAWN_DAEMON_RESULT, id: "other", pid: 1 } }));
    setImmediate(() => port.emit("message", { data: { type: SPAWN_DAEMON_RESULT, id: message.id, pid: 777 } }));
  };
  const spawn = () => assert.fail("must not spawn process.execPath inside the integrated CLI");
  const result = await launchCliDaemon(
    { args: ["mock:serve", "/ws", "--protocol", "grpc"], logFile: "/ws/.layang/runtime/mock-runtime.log", cliPath: "/x/layang.cjs" },
    { parentPort: port, env: { LAYANG_INTEGRATED_CLI: "1" }, spawn },
  );
  assert.deepEqual(result, { pid: 777 });
  assert.equal(port.posted[0].type, SPAWN_DAEMON_REQUEST);
  assert.deepEqual(port.posted[0].args, ["mock:serve", "/ws", "--protocol", "grpc"]);
  assert.equal(port.listenerCount("message"), 0);
});

test("launchCliDaemon rejects on an error reply and on timeout", async () => {
  const errorPort = new EventEmitter();
  errorPort.postMessage = (message) =>
    setImmediate(() => errorPort.emit("message", { data: { type: SPAWN_DAEMON_RESULT, id: message.id, error: "nope" } }));
  await assert.rejects(
    launchCliDaemon({ args: ["mock:serve"], logFile: "/l" }, { parentPort: errorPort, env: { LAYANG_INTEGRATED_CLI: "1" } }),
    /nope/,
  );
  const silentPort = new EventEmitter();
  silentPort.postMessage = () => undefined;
  await assert.rejects(
    launchCliDaemon({ args: ["mock:serve"], logFile: "/l" }, { parentPort: silentPort, env: { LAYANG_INTEGRATED_CLI: "1" }, timeoutMs: 20 }),
    /Timed out/,
  );
  assert.equal(silentPort.listenerCount("message"), 0);
});

test("launchCliDaemon spawns process.execPath detached outside the integrated CLI", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layang-launch-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const logFile = path.join(dir, "daemon.log");
  for (const deps of [
    { parentPort: null, env: { LAYANG_INTEGRATED_CLI: "1" } },
    { parentPort: new EventEmitter(), env: {} },
  ]) {
    const calls = [];
    let unrefCalled = false;
    const spawn = (command, args, options) => {
      calls.push({ command, args, options });
      return { pid: 4242, unref: () => { unrefCalled = true; } };
    };
    if (deps.parentPort) deps.parentPort.postMessage = () => assert.fail("must not use parentPort");
    const result = await launchCliDaemon(
      { args: ["gateway:serve", dir, "--profile", "p1"], logFile, cliPath: "/x/bin/layang.cjs" },
      { ...deps, spawn, execPath: "/usr/bin/node" },
    );
    assert.deepEqual(result, { pid: 4242 });
    assert.equal(calls[0].command, "/usr/bin/node");
    assert.deepEqual(calls[0].args, ["/x/bin/layang.cjs", "gateway:serve", dir, "--profile", "p1"]);
    assert.equal(calls[0].options.detached, true);
    assert.equal(calls[0].options.stdio[0], "ignore");
    assert.equal(typeof calls[0].options.stdio[1], "number");
    assert.equal(unrefCalled, true);
  }
  assert.ok(fs.existsSync(logFile));
});

test("outside the app, launchCliDaemon starts a real detached Node process writing to the log", async (t) => {
  const root = tempWorkspace(t);
  const script = path.join(root, "daemon.cjs");
  fs.writeFileSync(script, "console.log('daemon-up', process.argv[2]);\n");
  const logFile = path.join(root, ".layang", "runtime", "d.log");
  await assert.rejects(launchCliDaemon({ args: [], logFile, cliPath: script }), /arguments are required/);
  const result = await launchCliDaemon({ args: ["mock:serve"], logFile, cliPath: script }, { parentPort: null });
  assert.ok(Number.isInteger(result.pid) && result.pid > 0);
  for (let i = 0; i < 100 && !fs.readFileSync(logFile, "utf8").includes("daemon-up"); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.match(fs.readFileSync(logFile, "utf8"), /daemon-up mock:serve/);
});
