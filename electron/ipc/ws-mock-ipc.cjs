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

function registerWebSocketMockIpc() {
  ipcMain.handle("ws-mock:start", async (_event, payload) => {
    try {
      return okResponse(await startWebSocketMockServer(payload || {}));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("ws-mock:stop", async () => {
    await stopWebSocketMockServer();
    return { ok: true, running: false, message: "WebSocket mock server stopped." };
  });

  ipcMain.handle("ws-mock:update", async (_event, payload) => {
    try {
      return okResponse(updateWebSocketMockServer(payload || {}));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("ws-mock:send", async (_event, payload) => {
    try {
      return okResponse(sendWebSocketMockMessage(payload || {}));
    } catch (error) {
      return errorResponse(error);
    }
  });

  ipcMain.handle("ws-mock:status", async () => getWebSocketMockStatus());
}

module.exports = { registerWebSocketMockIpc };
