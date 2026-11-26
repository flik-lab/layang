"use strict";

/**
 * Starts a background CLI daemon (`mock:serve` / `gateway:serve`).
 *
 * The standalone CLI (real Node, or `node bin/layang.cjs`) spawns `process.execPath`
 * detached with its output appended to the log file, exactly as before.
 *
 * Inside the desktop app the CLI runs in an Electron utility process
 * (LAYANG_INTEGRATED_CLI=1). There `process.execPath` is the Electron app binary, which
 * no longer runs as Node because the `RunAsNode` fuse is off. So the CLI asks the main
 * process to start the daemon as another utility process (see electron/ipc/cli-ipc.cjs)
 * and waits for its PID.
 */

const fs = require("node:fs");
const { spawn: nodeSpawn } = require("node:child_process");

const SPAWN_DAEMON_REQUEST = "layang:spawn-daemon";
const SPAWN_DAEMON_RESULT = "layang:spawn-daemon-result";
const DEFAULT_TIMEOUT_MS = 15_000;

let requestSequence = 0;

function isIntegratedCli(deps = {}) {
  const parentPort = "parentPort" in deps ? deps.parentPort : process.parentPort;
  const env = deps.env || process.env;
  return Boolean(parentPort && typeof parentPort.postMessage === "function" && env.LAYANG_INTEGRATED_CLI === "1");
}

/**
 * @param {{ args: string[], logFile: string, cwd?: string, cliPath?: string }} request
 *   `args` are the CLI arguments (for example ["mock:serve", root, "--protocol", "grpc"]);
 *   `cliPath` is the script the standalone CLI runs with process.execPath.
 * @param {object} [deps] test seams: spawn, parentPort, env, fs, execPath, timeoutMs.
 * @returns {Promise<{ pid: number | undefined }>}
 */
async function launchCliDaemon(request, deps = {}) {
  const args = Array.isArray(request?.args) ? request.args.map(String) : [];
  const logFile = String(request?.logFile || "");
  if (!args.length) throw new Error("Daemon arguments are required.");
  if (!logFile) throw new Error("Daemon log file is required.");
  const parentPort = "parentPort" in deps ? deps.parentPort : process.parentPort;
  if (isIntegratedCli({ parentPort, env: deps.env })) {
    return await requestDaemonFromMain(parentPort, { args, logFile, cwd: request.cwd }, deps.timeoutMs);
  }
  return spawnDetachedDaemon({ ...request, args, logFile }, deps);
}

function spawnDetachedDaemon(request, deps = {}) {
  const spawn = deps.spawn || nodeSpawn;
  const fsApi = deps.fs || fs;
  const execPath = deps.execPath || process.execPath;
  const scriptArgs = request.cliPath ? [request.cliPath, ...request.args] : request.args;
  const logFd = fsApi.openSync(request.logFile, "a");
  try {
    const child = spawn(execPath, scriptArgs, {
      ...(request.cwd ? { cwd: request.cwd } : {}),
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    });
    child.unref();
    return { pid: child.pid };
  } finally {
    fsApi.closeSync(logFd);
  }
}

function requestDaemonFromMain(parentPort, request, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const id = `${process.pid}-${Date.now()}-${++requestSequence}`;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      if (typeof parentPort.off === "function") parentPort.off("message", onMessage);
      else parentPort.removeListener?.("message", onMessage);
    };
    const onMessage = (event) => {
      // Electron delivers { data }; accept a bare message too.
      const message = event && typeof event === "object" && "data" in event ? event.data : event;
      if (!message || message.type !== SPAWN_DAEMON_RESULT || message.id !== id) return;
      cleanup();
      if (message.error) reject(new Error(String(message.error)));
      else resolve({ pid: Number(message.pid) || undefined });
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Layang to start the background process."));
    }, Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    parentPort.on("message", onMessage);
    parentPort.postMessage({
      type: SPAWN_DAEMON_REQUEST,
      id,
      args: request.args,
      logFile: request.logFile,
      cwd: request.cwd || "",
    });
  });
}

module.exports = {
  SPAWN_DAEMON_REQUEST,
  SPAWN_DAEMON_RESULT,
  isIntegratedCli,
  launchCliDaemon,
};
