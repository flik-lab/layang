"use strict";

const { ipcMain } = require("electron");
const {
  getMockServerStatus,
  startMockServer,
  stopMockServer,
  updateActiveMockServer,
} = require("../services/grpc-mock-server.cjs");
const { errorResponse, okResponse } = require("../utils/ipc-utils.cjs");

function registerGrpcMockIpc() {
  ipcMain.handle("mock-server:start", async (_event, payload) => {
    try {
      return okResponse(await startMockServer(payload || {}));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("mock-server:stop", async () => {
    await stopMockServer();
    return { ok: true, message: "Mock server stopped." };
  });

  ipcMain.handle("mock-server:update", async (_event, payload) => {
    try {
      return okResponse(updateActiveMockServer(payload || {}, "ui"));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("mock-server:status", async () => getMockServerStatus());
}

module.exports = { registerGrpcMockIpc };
