"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const { launchCliDaemon } = require("./cli-daemon-launcher.cjs");
const { discoverProtoMethods } = require("./cli-workspace.cjs");
const { createRuntimeCore } = require("./runtime/runtime-core.cjs");
const { createCommandEnvelope } = require("./runtime/runtime-protocol.cjs");

function runtimePaths(root) {
  const directory = path.join(path.resolve(root), ".layang", "runtime");
  return {
    directory,
    state: path.join(directory, "mock-runtime.json"),
    log: path.join(directory, "mock-runtime.log"),
    command: path.join(directory, "mock-command.json"),
  };
}

function normalizeProtocol(value) {
  const protocol = String(value || "all").toLowerCase();
  if (!["all", "grpc", "rest", "websocket"].includes(protocol))
    throw new Error("Mock protocol must be all, grpc, rest, or websocket.");
  return protocol;
}

async function startMockDaemon(workspace, protocol, cliPath) {
  const paths = runtimePaths(workspace.root);
  await fsp.mkdir(paths.directory, { recursive: true });
  const current = await readMockStatus(workspace.root);
  if (current.running) throw new Error(`Mock runtime is already running with PID ${current.pid}.`);
  const child = await launchCliDaemon({
    args: ["mock:serve", workspace.root, "--protocol", normalizeProtocol(protocol)],
    logFile: paths.log,
    cliPath,
  });
  const record = {
    running: true,
    starting: true,
    pid: child.pid,
    protocol: normalizeProtocol(protocol),
    startedAt: new Date().toISOString(),
    workspace: workspace.root,
  };
  await writeState(paths.state, record);
  return record;
}

/**
 * Resolves everything a mock (re)start needs (workspace config, proto methods, canonical gRPC
 * scenarios) without touching running servers. Any error here means the config is unusable.
 */
async function buildMockStartPlan(workspace, selected) {
  const plan = [];
  if (selected === "all" || selected === "grpc") {
    const protoFiles = workspace.project.protoFiles || [];
    const methods = discoverProtoMethods(protoFiles).map((method) => ({
      serviceName: method.service,
      methodName: method.method,
      requestType: method.requestType,
      responseType: method.responseType,
      requestStream: Boolean(method.requestStream),
      responseStream: Boolean(method.responseStream),
    }));
    const config = workspace.project.mockServer || {};
    const { loadCanonicalGrpcScenarios } = require("./cli-workspace.cjs");
    const canonicalScenarios = await loadCanonicalGrpcScenarios(workspace.root);
    plan.push({
      type: "mock.grpc.start",
      payload: {
        port: config.port,
        bindHost: config.bindHost,
        protoFiles,
        methods,
        scenarios: canonicalScenarios,
        streamDefaults: config.streamDefaults,
        selectedScenarioIds: config.selectedScenarioIds,
        enabledMethods: config.enabledMethods,
        workspaceDirectory: workspace.root,
        security: config.security,
        limits: config.limits,
      },
    });
  }
  if (selected === "all" || selected === "rest") {
    plan.push({ type: "mock.rest.start", payload: workspace.project.restMockServer || {} });
  }
  if (selected === "all" || selected === "websocket") {
    plan.push({ type: "mock.websocket.start", payload: workspace.project.wsMockServer || {} });
  }
  return plan;
}

/**
 * Owns the CLI runtime core. Reload loads and validates the new workspace first and only then
 * swaps servers; if loading fails the old servers keep running, and if the new servers fail to
 * start the previous configuration is restored.
 */
function createCliMockController(options = {}) {
  const selected = normalizeProtocol(options.selected);
  const appendLog = options.appendLog || (async () => undefined);
  const createCore = options.createCore || (() => createRuntimeCore({ statusMetadata: { host: "cli" } }));
  const buildPlan = options.buildPlan || buildMockStartPlan;
  let runtimeCore = null;
  let activePlan = null;
  let runtimeRequestSequence = 0;

  const invoke = async (type, payload) => {
    if (!runtimeCore) throw new Error("CLI mock runtime core is unavailable.");
    const requestId = `cli-runtime:${++runtimeRequestSequence}`;
    const response = await runtimeCore.handle(createCommandEnvelope(requestId, type, payload ?? null));
    if (!response.ok) throw new Error(response.error || `Runtime command failed: ${type}`);
    return response.payload;
  };

  const stop = async () => {
    const current = runtimeCore;
    runtimeCore = null;
    await current?.dispose?.();
  };

  const applyPlan = async (plan) => {
    await stop();
    runtimeCore = createCore();
    for (const step of plan) await invoke(step.type, step.payload);
  };

  const start = async (workspace) => {
    const plan = await buildPlan(workspace, selected);
    await applyPlan(plan);
    activePlan = plan;
    await appendLog("Mock runtime started", { protocol: selected, host: "runtime-core" });
  };

  const reload = async (loadWorkspace) => {
    let workspace;
    let plan;
    try {
      workspace = await loadWorkspace();
      plan = await buildPlan(workspace, selected);
    } catch (error) {
      await appendLog("Mock reload failed; previous mock servers keep running", {
        error: error?.message || String(error),
      });
      return { ok: false, restored: true, error };
    }
    try {
      await applyPlan(plan);
      activePlan = plan;
      await appendLog("Mock runtime started", { protocol: selected, host: "runtime-core" });
      return { ok: true, workspace };
    } catch (error) {
      await appendLog("Mock reload failed while starting new servers", { error: error?.message || String(error) });
      if (!activePlan) return { ok: false, restored: false, error };
      try {
        await applyPlan(activePlan);
        await appendLog("Previous mock configuration restored after failed reload");
        return { ok: false, restored: true, error };
      } catch (restoreError) {
        await appendLog("Restoring previous mock configuration failed", {
          error: restoreError?.message || String(restoreError),
        });
        return { ok: false, restored: false, error };
      }
    }
  };

  return { start, reload, stop, invoke, hasCore: () => Boolean(runtimeCore) };
}

async function serveMocks(workspace, protocol, options = {}) {
  const selected = normalizeProtocol(protocol);
  const paths = runtimePaths(workspace.root);
  await fsp.mkdir(paths.directory, { recursive: true });
  let stopping = false;
  let lastCommandId = "";
  const startedAt = options.startedAt || new Date().toISOString();

  const appendLog = async (message, details) => {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), message, details: details || undefined });
    await fsp.appendFile(paths.log, `${line}\n`, "utf8").catch(() => undefined);
  };

  const controller = createCliMockController({ selected, appendLog });
  const invokeRuntime = controller.invoke;

  const snapshot = async (message) => {
    const statuses = {};
    if (controller.hasCore() && (selected === "all" || selected === "grpc")) statuses.grpc = await invokeRuntime("mock.grpc.status");
    if (controller.hasCore() && (selected === "all" || selected === "rest")) statuses.rest = await invokeRuntime("mock.rest.status");
    if (controller.hasCore() && (selected === "all" || selected === "websocket")) statuses.websocket = await invokeRuntime("mock.websocket.status");
    const state = {
      running: !stopping,
      pid: process.pid,
      protocol: selected,
      workspace: workspace.root,
      startedAt,
      updatedAt: new Date().toISOString(),
      message,
      statuses,
    };
    await writeState(paths.state, state);
    return state;
  };

  const reload = async () => {
    const { readWorkspace } = require("./cli-workspace.cjs");
    const result = await controller.reload(() => readWorkspace(workspace.root));
    if (result.ok) workspace = result.workspace;
    await snapshot(result.ok ? "reloaded" : `reload failed: ${result.error?.message || String(result.error)}`).catch(
      () => undefined,
    );
  };

  const handleCommand = async () => {
    const command = await readJson(paths.command);
    if (!command || command.id === lastCommandId) return;
    lastCommandId = command.id;
    try {
      if (command.type === "send-websocket") {
        if (!(selected === "all" || selected === "websocket")) throw new Error("WebSocket mock runtime is not active.");
        const result = await invokeRuntime("mock.websocket.send", command.payload || {});
        await appendLog("WebSocket mock message sent", result);
      } else if (command.type === "reload") {
        await reload();
        await appendLog("Mock runtime reloaded from command channel");
      }
    } catch (error) {
      await appendLog("Mock command failed", { error: error?.message || String(error), command });
    }
  };

  await controller.start(workspace);
  // The mocks are already serving; a failed status write must not take them down.
  // The status timer below writes the state again.
  await snapshot("running").catch((error) =>
    appendLog("Writing mock runtime state failed", { error: error?.message || String(error) }),
  );
  const statusTimer = setInterval(() => void snapshot("running").catch(() => undefined), 750);
  const commandTimer = setInterval(() => void handleCommand(), 250);
  process.on("SIGHUP", () => void reload());

  await new Promise((resolve) => {
    const shutdown = async (signal) => {
      if (stopping) return;
      stopping = true;
      clearInterval(statusTimer);
      clearInterval(commandTimer);
      await appendLog("Mock runtime stopping", { signal });
      await controller.stop();
      await writeState(paths.state, {
        running: false,
        pid: process.pid,
        protocol: selected,
        stoppedAt: new Date().toISOString(),
      }).catch((error) => appendLog("Writing mock runtime state failed", { error: error?.message || String(error) }));
      resolve();
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  });
}

async function readMockStatus(root) {
  const state = (await readJson(runtimePaths(root).state)) || { running: false };
  if (!state.running || !state.pid) return { ...state, running: false };
  if (!isPidRunning(state.pid)) return { ...state, running: false, stale: true };
  return state;
}

async function stopMockRuntime(root) {
  const status = await readMockStatus(root);
  if (!status.running) return { running: false, message: "Mock runtime is already stopped." };
  try {
    process.kill(status.pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  return { running: false, message: `Stop signal sent to mock runtime PID ${status.pid}.` };
}

async function reloadMockRuntime(root) {
  const status = await readMockStatus(root);
  if (!status.running) throw new Error("Mock runtime is not running.");
  if (process.platform === "win32") {
    const command = await sendMockCommand(root, "reload", {});
    return { running: true, message: `Reload command ${command.id} queued for mock runtime PID ${status.pid}.` };
  }
  process.kill(status.pid, "SIGHUP");
  return { running: true, message: `Reload signal sent to mock runtime PID ${status.pid}.` };
}

async function readMockLogs(root, tail = 100) {
  const file = runtimePaths(root).log;
  const text = await fsp
    .readFile(file, "utf8")
    .catch((error) => (error?.code === "ENOENT" ? "" : Promise.reject(error)));
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-Math.max(1, Number(tail || 100)));
}

async function sendMockCommand(root, type, payload) {
  const status = await readMockStatus(root);
  if (!status.running) throw new Error("Mock runtime is not running.");
  const paths = runtimePaths(root);
  await fsp.mkdir(paths.directory, { recursive: true });
  const command = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
  await writeState(paths.command, command);
  return command;
}

function isPidRunning(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

// On Windows, renaming over a file fails with EPERM/EBUSY/EACCES while another process
// (mock:status, the desktop app, antivirus, an indexer) has it open. The lock is brief.
const TRANSIENT_RENAME_ERRORS = new Set(["EPERM", "EBUSY", "EACCES"]);

async function writeState(file, value, options = {}) {
  const rename = options.rename || fsp.rename;
  const attempts = Math.max(1, options.attempts ?? 8);
  const delayMs = options.delayMs ?? 25;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(temp, file);
      return;
    } catch (error) {
      if (attempt >= attempts || !TRANSIENT_RENAME_ERRORS.has(error?.code)) {
        await fsp.rm(temp, { force: true }).catch(() => undefined);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}

module.exports = {
  runtimePaths,
  normalizeProtocol,
  startMockDaemon,
  serveMocks,
  buildMockStartPlan,
  createCliMockController,
  readMockStatus,
  stopMockRuntime,
  reloadMockRuntime,
  readMockLogs,
  sendMockCommand,
  isPidRunning,
  writeState,
};
