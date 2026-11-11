"use strict";

function createGuardedIpcMain(ipcMain, authorize) {
  if (!ipcMain?.handle || !ipcMain?.on || typeof authorize !== "function") {
    throw new TypeError("IPC registration and authorization are required.");
  }
  return {
    handle(channel, fn) {
      if (typeof fn !== "function") throw new TypeError("IPC handler must be a function.");
      return ipcMain.handle(channel, (event, ...args) => {
        authorize(event, channel);
        return fn(event, ...args);
      });
    },
    on(channel, fn) {
      if (typeof fn !== "function") throw new TypeError("IPC listener must be a function.");
      return ipcMain.on(channel, (event, ...args) => {
        try { authorize(event, channel); } catch { return; }
        return fn(event, ...args);
      });
    },
  };
}
module.exports = { createGuardedIpcMain };
