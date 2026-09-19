"use strict";

const { ipcMain } = require("electron");
const {
  getMockServerStatus,
  startMockServer,
  stopMockServer,
  updateActiveMockServer,
  sendMockServerStreamMessage,
} = require("../services/grpc-mock-server.cjs");
const { errorResponse, okResponse } = require("../utils/ipc-utils.cjs");

function registerGrpcMockIpc(options = {}) {
  const getRuntimeHost = typeof options.getRuntimeHost === "function" ? options.getRuntimeHost : () => null;
  const runtimeMode = options.runtimeMode || process.env.LAYANG_RUNTIME_MODE || "main";
  const invokeUtility = (type, payload) => {
    const host = getRuntimeHost();
    if (!host) throw new Error("Utility runtime is unavailable.");
    return host.invoke(type, payload);
  };

  ipcMain.handle("mock-server:start", async (_event, payload) => {
    try {
      const result = runtimeMode === "utility"
        ? await invokeUtility("mock.grpc.start", payload || {})
        : await startMockServer(payload || {});
      return okResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("mock-server:stop", async () => {
    try {
      if (runtimeMode === "utility") {
        return okResponse(await invokeUtility("mock.grpc.stop"));
      }
      await stopMockServer();
      return { ok: true, message: "Mock server stopped." };
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("mock-server:update", async (_event, payload) => {
    try {
      const result = runtimeMode === "utility"
        ? await invokeUtility("mock.grpc.update", payload || {})
        : await updateActiveMockServer(payload || {}, "ui");
      return okResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("mock-server:stream-send", async (_event, payload) => {
    try {
      const result = runtimeMode === "utility"
        ? await invokeUtility("mock.grpc.send", payload || {})
        : await sendMockServerStreamMessage(payload || {});
      return okResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("mock-server:status", async () => {
    if (runtimeMode === "utility") {
      try {
        return await invokeUtility("mock.grpc.status");
      } catch (error) {
        return { running: false, error: error?.message ? String(error.message) : String(error) };
      }
    }
    return getMockServerStatus();
  });
}

module.exports = { registerGrpcMockIpc };
