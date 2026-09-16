"use strict";

const { BrowserWindow, ipcMain } = require("electron");

function registerRuntimeIpc({ getRuntimeHost }) {
  if (typeof getRuntimeHost !== "function") throw new TypeError("getRuntimeHost is required.");

  const getHost = () => {
    const host = getRuntimeHost();
    if (!host) throw new Error("Utility runtime is unavailable.");
    return host;
  };

  ipcMain.handle("runtime:ping", async () => getHost().invoke("runtime.ping"));
  ipcMain.handle("runtime:invoke", async (_event, request) => getHost().invoke(String(request?.type || ""), request?.payload ?? null));
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

module.exports = { registerRuntimeIpc };
