"use strict";

const { ipcMain } = require("electron");

function registerGrpcWebTransportIpc({ getTransportRuntimeManager }) {
  if (typeof getTransportRuntimeManager !== "function") throw new TypeError("getTransportRuntimeManager is required.");
  const getManager = () => {
    const manager = getTransportRuntimeManager();
    if (!manager) throw new Error("gRPC-Web transport runtime manager is unavailable.");
    return manager;
  };

  ipcMain.handle("grpc-web-transport:invoke", async (event, payload) => {
    const runId = String(payload?.runId || "").trim();
    if (!runId) throw new Error("gRPC-Web transport runId is required.");
    return getManager().invoke(runId, payload, (events) => {
      if (event.sender.isDestroyed() || !events.length) return;
      event.sender.send(`grpc-web-transport:event-batch:${runId}`, events);
    });
  });

  ipcMain.handle("grpc-web-transport:cancel", async (_event, payload) => {
    return getManager().cancel(String(payload?.runId || ""));
  });

  ipcMain.handle("grpc-web-transport:payload", async (_event, request) => {
    const type = String(request?.type || "");
    if (!type.startsWith("payload.")) throw new Error(`Unsupported transport payload command: ${type}`);
    return getManager().invokePayload(type, request?.payload || {});
  });

  ipcMain.handle("grpc-web-transport:status", async () => getManager().getStatus());
}

module.exports = { registerGrpcWebTransportIpc };
