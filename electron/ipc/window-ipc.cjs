"use strict";

const { ipcMain } = require("electron");
const { windowFromEvent } = require("../utils/ipc-utils.cjs");
const {
  broadcastViewEvent,
  focusManagedWindow,
  getWindowContext,
  listManagedWindows,
  openDetachedWindow,
  reattachManagedWindow,
  reattachWindow,
} = require("../window/window-manager.cjs");

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

  ipcMain.handle("window:get-context", (event) => ({ ok: true, context: getWindowContext(windowFromEvent(event)) }));

  ipcMain.handle("window:list-managed", () => ({ ok: true, windows: listManagedWindows() }));

  ipcMain.handle("window:open-detached", (event, payload) => {
    const sourceWindow = windowFromEvent(event);
    try {
      const result = openDetachedWindow(payload || {}, sourceWindow);
      return {
        ok: true,
        existing: result.existing,
        windowId: result.window.id,
        context: { ...result.context, windowId: result.window.id },
      };
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("window:reattach", (event) => reattachWindow(windowFromEvent(event)));

  ipcMain.handle("window:reattach-resource", (_event, payload) => reattachManagedWindow(payload || {}));

  ipcMain.handle("window:focus-resource", (_event, payload) => focusManagedWindow(payload || {}));

  ipcMain.handle("window:broadcast", (event, payload) => {
    const topic = typeof payload?.topic === "string" ? payload.topic : "";
    if (!topic) return { ok: false, error: "Missing window event topic." };
    broadcastViewEvent(topic, payload?.payload, windowFromEvent(event));
    return { ok: true };
  });
}

module.exports = { registerWindowIpc };
