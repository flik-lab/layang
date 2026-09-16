"use strict";

const { ipcMain } = require("electron");
const {
  getWebSocketMockStatus,
  sendWebSocketMockMessage,
  startWebSocketMockServer,
  stopWebSocketMockServer,
  updateWebSocketMockServer,
} = require("../services/ws-mock-server.cjs");
const { errorResponse, okResponse } = require("../utils/ipc-utils.cjs");

function registerWebSocketMockIpc(options = {}) {
  const getRuntimeHost = typeof options.getRuntimeHost === "function" ? options.getRuntimeHost : () => null;
  const runtimeMode = options.runtimeMode || process.env.LAYANG_RUNTIME_MODE || "main";
  const invokeUtility = (type, payload) => {
    const host = getRuntimeHost();
    if (!host) throw new Error("Utility runtime is unavailable.");
    return host.invoke(type, payload);
  };

  ipcMain.handle("ws-mock:start", async (_event, payload) => {
    try {
      const result = runtimeMode === "utility"
        ? await invokeUtility("mock.websocket.start", payload || {})
        : await startWebSocketMockServer(payload || {});
      return okResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("ws-mock:stop", async () => {
    try {
      if (runtimeMode === "utility") {
        return okResponse(await invokeUtility("mock.websocket.stop"));
      }
      await stopWebSocketMockServer();
      return { ok: true, running: false, message: "WebSocket mock server stopped." };
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("ws-mock:update", async (_event, payload) => {
    try {
      const result = runtimeMode === "utility"
        ? await invokeUtility("mock.websocket.update", payload || {})
        : updateWebSocketMockServer(payload || {});
      return okResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("ws-mock:send", async (_event, payload) => {
    try {
      const result = runtimeMode === "utility"
        ? await invokeUtility("mock.websocket.send", payload || {})
        : sendWebSocketMockMessage(payload || {});
      return okResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("ws-mock:status", async () => {
    if (runtimeMode === "utility") {
      try {
        return await invokeUtility("mock.websocket.status");
      } catch (error) {
        return { running: false, error: error?.message ? String(error.message) : String(error) };
      }
    }
    return getWebSocketMockStatus();
  });
}

module.exports = { registerWebSocketMockIpc };
