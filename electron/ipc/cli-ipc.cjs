"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeIntegratedCliCommand } = require("../../lib/cli-command-line.cjs");
const { readMockStatus, stopMockRuntime, normalizeProtocol } = require("../../lib/cli-mock.cjs");
const { SPAWN_DAEMON_REQUEST, SPAWN_DAEMON_RESULT } = require("../../lib/cli-daemon-launcher.cjs");
const { getWorkspaceAccess: defaultGetWorkspaceAccess, canonicalizePath } = require("../utils/workspace-access.cjs");

/**
 * The integrated CLI terminal runs the Layang CLI in an Electron utility process
 * (`utilityProcess.fork`), not by re-running the app binary with ELECTRON_RUN_AS_NODE,
 * so packaged builds can turn the `RunAsNode` fuse off.
 *
 * Background daemons the CLI starts (`mock:start --daemon`, `gateway:start --daemon`) are
 * requested over the utility process's parentPort (lib/cli-daemon-launcher.cjs); the main
 * process validates the request and forks them as utility processes too. They are kept in
 * a registry and stopped by stopActiveCliRuns() when the app quits.
 */

const DAEMON_KINDS = {
  "mock:serve": { flag: "--protocol", serviceName: "Layang mock daemon" },
  "gateway:serve": { flag: "--profile", serviceName: "Layang gateway daemon" },
};
const STREAM_DRAIN_TIMEOUT_MS = 2_000;

const activeRuns = new Map();
const daemons = new Map();

function integratedCliEnv() {
  const env = { ...process.env, LAYANG_INTEGRATED_CLI: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function createCliIpcContext(options = {}) {
  let electron = null;
  const getElectron = () => (electron ||= require("electron"));
  const getUtilityProcess = () => options.utilityProcess || getElectron().utilityProcess;
  const getAppPath = options.getAppPath || (() => getElectron().app.getAppPath());
  const getWorkspaceAccess = options.getWorkspaceAccess || defaultGetWorkspaceAccess;
  const cliEntryPath = () => options.cliEntryPath || path.join(getAppPath(), "lib", "cli-utility-entry.cjs");

  /** The CLI runs with the workspace as its working directory, so it must be a granted folder. */
  function normalizeWorkspacePath(value) {
    const text = typeof value === "string" ? value.trim() : "";
    return text ? getWorkspaceAccess().assertAllowed(text) : "";
  }

  /**
   * Validates a daemon request from the integrated CLI. Only the two daemon commands are
   * allowed, the workspace must be granted, and the log file must live in <workspace>/.layang.
   */
  function validateDaemonRequest(message) {
    const args = Array.isArray(message?.args) ? message.args : [];
    if (args.length !== 4 || !args.every((item) => typeof item === "string")) {
      throw new Error("Invalid background process request.");
    }
    const [command, workspaceArg, flag, value] = args;
    const kind = Object.hasOwn(DAEMON_KINDS, command) ? DAEMON_KINDS[command] : null;
    if (!kind) throw new Error(`Background process command is not allowed: ${command}`);
    if (flag !== kind.flag) throw new Error("Invalid background process arguments.");
    if (command === "mock:serve") normalizeProtocol(value);
    if (!value || value.length > 200 || value.startsWith("-") || value.includes("\u0000")) {
      throw new Error("Invalid background process arguments.");
    }
    const workspace = getWorkspaceAccess().assertAllowed(workspaceArg);
    const logFileText = typeof message?.logFile === "string" ? message.logFile.trim() : "";
    if (!logFileText || logFileText.includes("\u0000")) throw new Error("Background process log file is required.");
    const layangDir = canonicalizePath(path.join(workspace, ".layang"));
    const logFile = canonicalizePath(path.resolve(workspace, logFileText));
    const relative = path.relative(layangDir, logFile);
    // A symlinked .layang folder pointing elsewhere is refused too.
    const layangInWorkspace = path.relative(canonicalizePath(workspace), layangDir) === ".layang";
    if (!layangDir || !logFile || !layangInWorkspace || !relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Background process log file must be inside the workspace .layang folder.");
    }
    return { args: [command, workspace, flag, value], workspace, logFile, serviceName: kind.serviceName };
  }

  function spawnDaemon(message) {
    const request = validateDaemonRequest(message);
    fs.mkdirSync(path.dirname(request.logFile), { recursive: true });
    const log = fs.createWriteStream(request.logFile, { flags: "a" });
    log.on("error", () => undefined);
    const child = getUtilityProcess().fork(cliEntryPath(), request.args, {
      cwd: request.workspace,
      stdio: "pipe",
      serviceName: request.serviceName,
      env: integratedCliEnv(),
    });
    child.stdout?.on("data", (chunk) => log.write(chunk));
    child.stderr?.on("data", (chunk) => log.write(chunk));
    return new Promise((resolve, reject) => {
      let started = false;
      const register = () => {
        if (started) return;
        started = true;
        const pid = child.pid;
        daemons.set(child, { pid, args: request.args });
        resolve({ pid });
      };
      child.once?.("spawn", register);
      child.once?.("exit", () => {
        daemons.delete(child);
        log.end();
        if (!started) reject(new Error("Background process exited before it started."));
      });
      if (child.pid) register();
    });
  }

  async function handleChildMessage(child, message) {
    if (!message || message.type !== SPAWN_DAEMON_REQUEST) return;
    const id = typeof message.id === "string" ? message.id : String(message.id ?? "");
    try {
      const { pid } = await spawnDaemon(message);
      child.postMessage({ type: SPAWN_DAEMON_RESULT, id, pid });
    } catch (error) {
      try {
        child.postMessage({ type: SPAWN_DAEMON_RESULT, id, error: error?.message || String(error) });
      } catch {}
    }
  }

  async function runCli(event, payload) {
    const runId = String(payload?.runId || "").trim();
    if (!runId) return { ok: false, code: 1, error: "Missing CLI run id." };
    if (activeRuns.has(runId)) return { ok: false, code: 1, error: "CLI run id is already active." };

    let args;
    try {
      args = normalizeIntegratedCliCommand(payload?.command);
    } catch (error) {
      return { ok: false, code: 1, error: error?.message || String(error) };
    }
    if (!args.length) return { ok: false, code: 1, error: "Enter a Layang CLI command." };

    let workspacePath;
    try {
      workspacePath = normalizeWorkspacePath(payload?.workspacePath);
    } catch (error) {
      return { ok: false, code: 1, error: error?.message || String(error) };
    }

    const send = (type, data) => {
      if (!event.sender || event.sender.isDestroyed()) return;
      event.sender.send(`cli:event:${runId}`, { runId, type, data: String(data ?? "") });
    };

    let child;
    try {
      child = getUtilityProcess().fork(cliEntryPath(), args, {
        cwd: workspacePath || getAppPath(),
        stdio: "pipe",
        serviceName: "Layang CLI",
        env: integratedCliEnv(),
      });
    } catch (error) {
      send("stderr", `${error?.message || String(error)}\n`);
      return { ok: false, code: 1, error: error?.message || String(error), runId };
    }

    activeRuns.set(runId, child);
    const streamsDone = [child.stdout, child.stderr].filter(Boolean).map(
      (stream) => new Promise((resolve) => {
        stream.once("end", resolve);
        stream.once("close", resolve);
        stream.once("error", resolve);
      }),
    );
    child.stdout?.on("data", (chunk) => send("stdout", chunk));
    child.stderr?.on("data", (chunk) => send("stderr", chunk));
    child.on("message", (message) => void handleChildMessage(child, message));

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        activeRuns.delete(runId);
        resolve(result);
      };
      child.once("error", (type, location) => {
        // utilityProcess emits "error" for fatal V8 errors; the process then exits.
        send("stderr", `Layang CLI process error: ${String(type || "unknown")}${location ? ` (${location})` : ""}\n`);
      });
      child.once("exit", (code) => {
        // Output can arrive after "exit"; wait briefly for the pipes to drain.
        const drained = Promise.all(streamsDone);
        const timeout = new Promise((resolveTimeout) => setTimeout(resolveTimeout, STREAM_DRAIN_TIMEOUT_MS).unref?.());
        void Promise.race([drained, timeout]).then(() => {
          const exitCode = Number.isInteger(code) ? code : 1;
          send("exit", JSON.stringify({ code: exitCode, signal: "" }));
          finish({ ok: exitCode === 0, code: exitCode, signal: "", runId });
        });
      });
    });
  }

  return { runCli, normalizeWorkspacePath, validateDaemonRequest, handleChildMessage };
}

function registerCliIpc(options = {}) {
  const ipcMain = options.ipcMain || require("../utils/trusted-ipc-main.cjs").ipcMain;
  const context = createCliIpcContext(options);
  const { normalizeWorkspacePath } = context;

  ipcMain.handle("cli:run", (event, payload) => context.runCli(event, payload));

  ipcMain.handle("cli:mock-runtime-status", async (_event, payload) => {
    try {
      const workspacePath = normalizeWorkspacePath(payload?.workspacePath);
      if (!workspacePath) return { ok: true, running: false, statuses: {} };
      const status = await readMockStatus(workspacePath);
      return { ok: true, ...status };
    } catch (error) {
      return { ok: false, running: false, statuses: {}, error: error?.message || String(error) };
    }
  });

  ipcMain.handle("cli:mock-runtime-stop", async (_event, payload) => {
    try {
      const workspacePath = normalizeWorkspacePath(payload?.workspacePath);
      if (!workspacePath) {
        return { ok: false, running: false, error: "Open a workspace before stopping CLI mock runtime." };
      }
      const result = await stopMockRuntime(workspacePath);
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, running: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle("cli:cancel", async (_event, payload) => {
    const runId = String(payload?.runId || "").trim();
    const child = activeRuns.get(runId);
    if (!child) return { ok: true, cancelled: false };
    const cancelled = child.kill();
    return { ok: true, cancelled };
  });

  return context;
}

/**
 * Stops running CLI commands and the background mock/gateway daemons the integrated CLI
 * started. Called when the app quits, so in-app background daemons do not outlive it
 * (daemons started by the standalone CLI are separate processes and are not affected).
 */
function stopActiveCliRuns() {
  for (const child of activeRuns.values()) {
    try { child.kill(); } catch {}
  }
  activeRuns.clear();
  for (const child of daemons.keys()) {
    try { child.kill(); } catch {}
  }
  daemons.clear();
}

function listCliDaemons() {
  return [...daemons.values()].map((entry) => ({ ...entry }));
}

module.exports = { registerCliIpc, stopActiveCliRuns, createCliIpcContext, listCliDaemons };
