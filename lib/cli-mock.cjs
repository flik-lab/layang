"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { discoverProtoMethods } = require("./cli-workspace.cjs");

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
  const logFd = fs.openSync(paths.log, "a");
  const child = spawn(
    process.execPath,
    [cliPath, "mock:serve", workspace.root, "--protocol", normalizeProtocol(protocol)],
    {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    },
  );
  child.unref();
  fs.closeSync(logFd);
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

async function serveMocks(workspace, protocol, options = {}) {
  const selected = normalizeProtocol(protocol);
  const paths = runtimePaths(workspace.root);
  await fsp.mkdir(paths.directory, { recursive: true });
  let runtimes = {};
  let stopping = false;
  let lastCommandId = "";
  const startedAt = options.startedAt || new Date().toISOString();

  const appendLog = async (message, details) => {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), message, details: details || undefined });
    await fsp.appendFile(paths.log, `${line}\n`, "utf8").catch(() => undefined);
  };

  const stopAll = async () => {
    const current = runtimes;
    runtimes = {};
    await Promise.allSettled([current.grpc?.stop?.(), current.rest?.stop?.(), current.websocket?.stop?.()]);
  };

  const startAll = async () => {
    await stopAll();
    const next = {};
    if (selected === "all" || selected === "grpc") {
      const grpcService = require("../electron/services/grpc-mock-server.cjs");
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
      const status = await grpcService.startMockServer({
        port: config.port,
        bindHost: config.bindHost,
        protoFiles,
        methods,
        scenarios: workspace.scenarios || [],
        streamDefaults: config.streamDefaults,
        selectedScenarioIds: config.selectedScenarioIds,
        enabledMethods: config.enabledMethods,
        workspaceDirectory: workspace.root,
        security: config.security,
        limits: config.limits,
      });
      next.grpc = { service: grpcService, status, stop: grpcService.stopMockServer };
    }
    if (selected === "all" || selected === "rest") {
      const service = require("../electron/services/rest-mock-server.cjs");
      const status = await service.startRestMockServer(workspace.project.restMockServer || {});
      next.rest = { service, status, stop: service.stopRestMockServer };
    }
    if (selected === "all" || selected === "websocket") {
      const service = require("../electron/services/ws-mock-server.cjs");
      const status = await service.startWebSocketMockServer(workspace.project.wsMockServer || {});
      next.websocket = { service, status, stop: service.stopWebSocketMockServer };
    }
    runtimes = next;
    await appendLog("Mock runtime started", { protocol: selected });
  };

  const snapshot = async (message) => {
    const statuses = {};
    if (runtimes.grpc) statuses.grpc = runtimes.grpc.service.getMockServerStatus();
    if (runtimes.rest) statuses.rest = runtimes.rest.service.getRestMockServerStatus();
    if (runtimes.websocket) statuses.websocket = runtimes.websocket.service.getWebSocketMockStatus();
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

  const handleCommand = async () => {
    const command = await readJson(paths.command);
    if (!command || command.id === lastCommandId) return;
    lastCommandId = command.id;
    try {
      if (command.type === "send-websocket") {
        if (!runtimes.websocket) throw new Error("WebSocket mock runtime is not active.");
        const result = runtimes.websocket.service.sendWebSocketMockMessage(command.payload || {});
        await appendLog("WebSocket mock message sent", result);
      } else if (command.type === "reload") {
        await reload();
        await appendLog("Mock runtime reloaded from command channel");
      }
    } catch (error) {
      await appendLog("Mock command failed", { error: error?.message || String(error), command });
    }
  };

  await startAll();
  await snapshot("running");
  const statusTimer = setInterval(() => void snapshot("running"), 750);
  const commandTimer = setInterval(() => void handleCommand(), 250);

  const reload = async () => {
    try {
      const { readWorkspace } = require("./cli-workspace.cjs");
      workspace = await readWorkspace(workspace.root);
      await startAll();
      await snapshot("reloaded");
    } catch (error) {
      await appendLog("Mock reload failed", { error: error?.message || String(error) });
    }
  };
  process.on("SIGHUP", () => void reload());

  await new Promise((resolve) => {
    const shutdown = async (signal) => {
      if (stopping) return;
      stopping = true;
      clearInterval(statusTimer);
      clearInterval(commandTimer);
      await appendLog("Mock runtime stopping", { signal });
      await stopAll();
      await writeState(paths.state, {
        running: false,
        pid: process.pid,
        protocol: selected,
        stoppedAt: new Date().toISOString(),
      });
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

async function writeState(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fsp.rename(temp, file);
}

module.exports = {
  runtimePaths,
  normalizeProtocol,
  startMockDaemon,
  serveMocks,
  readMockStatus,
  stopMockRuntime,
  reloadMockRuntime,
  readMockLogs,
  sendMockCommand,
  isPidRunning,
};
