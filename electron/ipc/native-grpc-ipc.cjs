"use strict";

const { ipcMain } = require("electron");
const { invokeNativeGrpc } = require("../services/native-grpc-runner.cjs");

const activeNativeCalls = new Map();

function registerNativeGrpcIpc() {
  ipcMain.handle("native-grpc:invoke", async (event, payload) => {
    const runId = payload?.runId ? String(payload.runId) : "";
    const registerCall = (call, client) => {
      if (!runId) return;
      activeNativeCalls.set(runId, { call, client });
    };
    const emit = (grpcEvent) => {
      if (!runId || event.sender.isDestroyed()) return;
      event.sender.send(`native-grpc:event:${runId}`, grpcEvent);
    };
    try {
      return await invokeNativeGrpc(payload, emit, registerCall);
    } finally {
      if (runId) activeNativeCalls.delete(runId);
    }
  });

  ipcMain.handle("native-grpc:cancel", async (_event, payload) => {
    const runId = payload?.runId ? String(payload.runId) : "";
    const active = activeNativeCalls.get(runId);
    if (!active) return { cancelled: false };

    try {
      if (active.call && typeof active.call.cancel === "function") active.call.cancel();
      if (active.client && typeof active.client.close === "function") active.client.close();
    } finally {
      activeNativeCalls.delete(runId);
    }
    return { cancelled: true };
  });
}

module.exports = { registerNativeGrpcIpc };
