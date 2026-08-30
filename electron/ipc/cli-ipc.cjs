"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, ipcMain } = require("electron");
const { normalizeIntegratedCliCommand } = require("../../lib/cli-command-line.cjs");
const { readMockStatus, stopMockRuntime } = require("../../lib/cli-mock.cjs");

const activeRuns = new Map();

function registerCliIpc() {
  ipcMain.handle("cli:run", async (event, payload) => {
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

    const workspacePath = normalizeWorkspacePath(payload?.workspacePath);
    const cliPath = path.join(app.getAppPath(), "bin", "layang.cjs");
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: workspacePath || app.getAppPath(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    activeRuns.set(runId, child);
    const send = (type, data) => {
      if (!event.sender || event.sender.isDestroyed()) return;
      event.sender.send(`cli:event:${runId}`, { runId, type, data: String(data ?? "") });
    };

    child.stdout?.on("data", (chunk) => send("stdout", chunk));
    child.stderr?.on("data", (chunk) => send("stderr", chunk));

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        activeRuns.delete(runId);
        resolve(result);
      };
      child.once("error", (error) => {
        send("stderr", `${error?.message || String(error)}\n`);
        finish({ ok: false, code: 1, error: error?.message || String(error), runId });
      });
      child.once("close", (code, signal) => {
        send("exit", JSON.stringify({ code: code ?? 1, signal: signal || "" }));
        finish({ ok: code === 0, code: code ?? 1, signal: signal || "", runId });
      });
    });
  });


  ipcMain.handle("cli:mock-runtime-status", async (_event, payload) => {
    const workspacePath = normalizeWorkspacePath(payload?.workspacePath);
    if (!workspacePath) return { ok: true, running: false, statuses: {} };
    try {
      const status = await readMockStatus(workspacePath);
      return { ok: true, ...status };
    } catch (error) {
      return { ok: false, running: false, statuses: {}, error: error?.message || String(error) };
    }
  });

  ipcMain.handle("cli:mock-runtime-stop", async (_event, payload) => {
    const workspacePath = normalizeWorkspacePath(payload?.workspacePath);
    if (!workspacePath) return { ok: false, running: false, error: "Open a workspace before stopping CLI mock runtime." };
    try {
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
    const cancelled = child.kill("SIGTERM");
    return { ok: true, cancelled };
  });
}

function normalizeWorkspacePath(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? path.resolve(text) : "";
}

function stopActiveCliRuns() {
  for (const child of activeRuns.values()) {
    try { child.kill("SIGTERM"); } catch {}
  }
  activeRuns.clear();
}

module.exports = { registerCliIpc, stopActiveCliRuns };
