"use strict";

const { ipcMain } = require("electron");
const {
  startGatewayProfile,
  stopGatewayProfile,
  getGatewayProfileStatus,
  listGatewayProfilesStatus,
  getGatewayLogs,
  clearGatewayLogs,
  saveGatewayCaptureAsScenario,
} = require("../services/grpc-gateway-server.cjs");
const { errorResponse, okResponse } = require("../utils/ipc-utils.cjs");

function registerGrpcGatewayIpc() {
  ipcMain.handle("grpc-gateway:start", async (_event, payload) => {
    try {
      return okResponse(await startGatewayProfile(payload || {}));
    } catch (error) {
      return errorResponse(error);
    }
  });
  ipcMain.handle("grpc-gateway:stop", async (_event, payload) => {
    try {
      return okResponse(await stopGatewayProfile(payload?.profileId));
    } catch (error) {
      return errorResponse(error);
    }
  });
  ipcMain.handle("grpc-gateway:status", async (_event, payload) => {
    try {
      return okResponse(getGatewayProfileStatus(payload?.profileId));
    } catch (error) {
      return errorResponse(error);
    }
  });
  ipcMain.handle("grpc-gateway:list", async () => okResponse({ profiles: listGatewayProfilesStatus() }));
  ipcMain.handle("grpc-gateway:logs", async (_event, payload) => {
    try {
      return okResponse({ logs: getGatewayLogs(payload?.profileId, payload || {}) });
    } catch (error) {
      return errorResponse(error);
    }
  });
  ipcMain.handle("grpc-gateway:logs-clear", async (_event, payload) =>
    okResponse(clearGatewayLogs(payload?.profileId)),
  );
  ipcMain.handle("grpc-gateway:capture-save", async (_event, payload) => {
    try {
      return okResponse(
        await saveGatewayCaptureAsScenario(payload?.profileId, payload?.captureId, payload?.destination),
      );
    } catch (error) {
      return errorResponse(error);
    }
  });
}

module.exports = { registerGrpcGatewayIpc };
