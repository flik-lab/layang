"use strict";

const { ipcMain } = require("electron");
const { windowFromEvent } = require("../utils/ipc-utils.cjs");

function registerWindowIpc() {
  ipcMain.handle("window:minimize", (event) => {
    windowFromEvent(event)?.minimize();
    return { ok: true };
  });

  ipcMain.handle("window:maximize-toggle", (event) => {
    const win = windowFromEvent(event);
    if (!win) return { maximized: false };
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return { maximized: win.isMaximized() };
  });

  ipcMain.handle("window:close", (event) => {
    windowFromEvent(event)?.close();
    return { ok: true };
  });

  ipcMain.handle("window:toggle-always-on-top", (event) => {
    const win = windowFromEvent(event);
    if (!win) return { alwaysOnTop: false };
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next);
    return { alwaysOnTop: next };
  });
}

module.exports = { registerWindowIpc };
