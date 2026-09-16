"use strict";

const { isDeepStrictEqual } = require("node:util");

function createDefaultServices() {
  const grpc = require("../../../electron/services/grpc-mock-server.cjs");
  const rest = require("../../../electron/services/rest-mock-server.cjs");
  const websocket = require("../../../electron/services/ws-mock-server.cjs");

  return {
    grpc: {
      start: (payload) => grpc.startMockServer(payload || {}),
      update: (payload) => grpc.updateActiveMockServer(payload || {}, "utility"),
      stop: async () => {
        await grpc.stopMockServer();
        return { running: false, message: "Mock server stopped." };
      },
      status: () => grpc.getMockServerStatus(),
    },
    rest: {
      start: (payload) => rest.startRestMockServer(payload || {}),
      update: (payload) => rest.updateRestMockServer(payload || {}),
      stop: () => rest.stopRestMockServer(),
      status: () => rest.getRestMockServerStatus(),
    },
    websocket: {
      start: (payload) => websocket.startWebSocketMockServer(payload || {}),
      update: (payload) => websocket.updateWebSocketMockServer(payload || {}),
      send: (payload) => websocket.sendWebSocketMockMessage(payload || {}),
      stop: async () => {
        await websocket.stopWebSocketMockServer();
        return { running: false, message: "WebSocket mock server stopped." };
      },
      status: () => websocket.getWebSocketMockStatus(),
    },
  };
}

function createMockRuntime(options = {}) {
  const services = options.services || createDefaultServices();
  const listeners = new Set();
  const lastStatus = new Map();
  let disposed = false;

  const subscribe = (listener) => {
    if (typeof listener !== "function") return () => undefined;
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const emitStatusChanged = (protocol, status) => {
    const previous = lastStatus.get(protocol);
    if (previous && isDeepStrictEqual(previous, status)) return false;
    lastStatus.set(protocol, status);
    const event = {
      event: "mock.statusChanged",
      payload: { protocol, status },
    };
    for (const listener of listeners) listener(event);
    return true;
  };

  const readStatus = async (protocol) => {
    const service = services[protocol];
    if (!service || typeof service.status !== "function") {
      throw new Error(`Unsupported mock protocol: ${protocol}`);
    }
    return Promise.resolve(service.status());
  };

  const publishCurrentStatus = async (protocol) => {
    const status = await readStatus(protocol);
    emitStatusChanged(protocol, status);
    return status;
  };

  const executeMutation = async (protocol, method, payload) => {
    if (disposed) throw new Error("Mock runtime is disposed.");
    const service = services[protocol];
    const operation = service?.[method];
    if (typeof operation !== "function") {
      throw new Error(`Unsupported mock command: mock.${protocol}.${method}`);
    }
    const result = await Promise.resolve(operation(payload || {}));
    const status = await publishCurrentStatus(protocol);
    return result === undefined ? status : result;
  };

  const handle = async (type, payload = null) => {
    if (disposed) throw new Error("Mock runtime is disposed.");
    const [root, protocol, action] = String(type || "").split(".");
    if (root !== "mock" || !protocol || !action) return undefined;
    if (!services[protocol]) throw new Error(`Unsupported mock protocol: ${protocol}`);

    if (action === "status") return readStatus(protocol);
    if (action === "start" || action === "update" || action === "stop" || action === "send") {
      return executeMutation(protocol, action, payload);
    }
    throw new Error(`Unsupported mock command: ${type}`);
  };

  const dispose = async () => {
    if (disposed) return;
    const protocols = ["grpc", "rest", "websocket"];
    await Promise.allSettled(
      protocols.map(async (protocol) => {
        const service = services[protocol];
        if (typeof service?.stop === "function") await Promise.resolve(service.stop());
      }),
    );
    disposed = true;
    listeners.clear();
    lastStatus.clear();
  };

  return { handle, subscribe, dispose, readStatus };
}

module.exports = { createMockRuntime };
