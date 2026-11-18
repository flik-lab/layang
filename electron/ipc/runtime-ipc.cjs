"use strict";

const { BrowserWindow } = require("electron");
const { ipcMain } = require("../utils/trusted-ipc-main.cjs");

// Only expose payload-document operations through the generic renderer facade.
// Server and transport controls have separate, purpose-specific IPC APIs.
const RENDERER_RUNTIME_COMMANDS = new Set([
  "payload.registerValue", "payload.registerUtf8", "payload.getMeta",
  "payload.getLines", "payload.prepareWindow", "payload.search",
  "payload.getText", "payload.debugStats", "payload.setRetentionLimit",
  "payload.pin", "payload.unpin", "payload.release",
]);

function assertRendererRuntimeCommand(type) {
  if (typeof type !== "string" || !RENDERER_RUNTIME_COMMANDS.has(type)) {
    throw new Error("Unsupported renderer runtime command.");
  }
  return type;
}

function registerRuntimeIpc({ getRuntimeHost }) {
  if (typeof getRuntimeHost !== "function") throw new TypeError("getRuntimeHost is required.");

  const getHost = () => {
    const host = getRuntimeHost();
    if (!host) throw new Error("Utility runtime is unavailable.");
    return host;
  };

  ipcMain.handle("runtime:ping", async () => getHost().invoke("runtime.ping"));
  ipcMain.handle("runtime:invoke", async (_event, request) => getHost().invoke(assertRendererRuntimeCommand(request?.type), request?.payload ?? null));
  ipcMain.handle("runtime:status", async () => {
    const host = getRuntimeHost();
    if (!host) return { running: false, ready: false };
    if (!host.getStatus().running) return host.getStatus();
    return host.invoke("runtime.getStatus");
  });

  return getRuntimeHost()?.subscribe?.((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("runtime:event", event);
    }
  });
}

module.exports = { registerRuntimeIpc, assertRendererRuntimeCommand, RENDERER_RUNTIME_COMMANDS };
