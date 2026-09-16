"use strict";

const { ipcMain } = require("electron");
const {
  getRestMockServerStatus,
  startRestMockServer,
  stopRestMockServer,
  updateRestMockServer,
} = require("../services/rest-mock-server.cjs");

function registerRestMockIpc(options = {}) {
  const getRuntimeHost = typeof options.getRuntimeHost === "function" ? options.getRuntimeHost : () => null;
  const runtimeMode = options.runtimeMode || process.env.LAYANG_RUNTIME_MODE || "main";
  const invokeUtility = (type, payload) => {
    const host = getRuntimeHost();
    if (!host) throw new Error("Utility runtime is unavailable.");
    return host.invoke(type, payload);
  };

  ipcMain.handle("rest-mock:start", async (_event, payload) => {
    try {
      const result = runtimeMode === "utility"
        ? await invokeUtility("mock.rest.start", payload || {})
        : await startRestMockServer(payload || {});
      return { ok: true, ...(result || {}) };
    } catch (error) {
      return { ok: false, running: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("rest-mock:update", async (_event, payload) => {
    try {
      const result = runtimeMode === "utility"
        ? await invokeUtility("mock.rest.update", payload || {})
        : await updateRestMockServer(payload || {});
      return { ok: true, ...(result || {}) };
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("rest-mock:stop", async () => {
    try {
      const result = runtimeMode === "utility"
        ? await invokeUtility("mock.rest.stop")
        : await stopRestMockServer();
      return { ok: true, ...(result || {}) };
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("rest-mock:status", async () => {
    try {
      const result = runtimeMode === "utility"
        ? await invokeUtility("mock.rest.status")
        : getRestMockServerStatus();
      return { ok: true, ...(result || {}) };
    } catch (error) {
      return { ok: false, running: false, error: error?.message ? String(error.message) : String(error) };
    }
  });
}

module.exports = { registerRestMockIpc };
