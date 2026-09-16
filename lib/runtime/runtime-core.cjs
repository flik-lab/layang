"use strict";

const {
  createErrorResponse,
  createEventEnvelope,
  createSuccessResponse,
  validateCommandEnvelope,
} = require("./runtime-protocol.cjs");

function createRuntimeCore(options = {}) {
  const listeners = new Set();
  const startedAt = new Date().toISOString();
  let disposed = false;
  let mockRuntime = options.mockRuntime || null;
  let unsubscribeMockRuntime = null;
  let nativeGrpcRuntime = options.nativeGrpcRuntime || null;
  let unsubscribeNativeGrpcRuntime = null;
  let payloadStore = options.payloadStore || null;

  const emit = (event, payload = null) => {
    if (disposed) return;
    const envelope = createEventEnvelope(event, payload);
    for (const listener of listeners) listener(envelope);
  };

  const getStatus = () => ({
    status: disposed ? "disposed" : "ready",
    startedAt,
    pid: process.pid,
    processType: process.type || "node",
    ...(options.statusMetadata || {}),
  });

  const ensureMockRuntime = () => {
    if (!mockRuntime) {
      const { createMockRuntime } = require("./mock/mock-runtime.cjs");
      mockRuntime = createMockRuntime();
    }
    if (!unsubscribeMockRuntime && typeof mockRuntime.subscribe === "function") {
      unsubscribeMockRuntime = mockRuntime.subscribe((runtimeEvent) => {
        if (!runtimeEvent?.event) return;
        emit(runtimeEvent.event, runtimeEvent.payload);
      });
    }
    return mockRuntime;
  };

  const ensurePayloadStore = () => {
    if (!payloadStore) {
      const { createPayloadDocumentStore } = require("./payload/payload-document-store.cjs");
      payloadStore = createPayloadDocumentStore();
    }
    return payloadStore;
  };

  const ensureNativeGrpcRuntime = () => {
    if (!nativeGrpcRuntime) {
      const { createNativeGrpcRuntime } = require("./grpc/native-grpc-runtime.cjs");
      nativeGrpcRuntime = createNativeGrpcRuntime({
        payloadStore: ensurePayloadStore(),
        generation: options.statusMetadata?.generation,
      });
    }
    if (!unsubscribeNativeGrpcRuntime && typeof nativeGrpcRuntime.subscribe === "function") {
      unsubscribeNativeGrpcRuntime = nativeGrpcRuntime.subscribe((runtimeEvent) => {
        if (!runtimeEvent?.event) return;
        emit(runtimeEvent.event, runtimeEvent.payload);
      });
    }
    return nativeGrpcRuntime;
  };

  if (mockRuntime) ensureMockRuntime();
  if (nativeGrpcRuntime) ensureNativeGrpcRuntime();

  const handle = async (commandEnvelope) => {
    let requestId = "runtime:invalid";
    try {
      const command = validateCommandEnvelope(commandEnvelope);
      requestId = command.requestId;
      if (disposed && command.type !== "runtime.getStatus") {
        throw new Error("Runtime is disposed.");
      }

      switch (command.type) {
        case "runtime.ping":
          return createSuccessResponse(requestId, getStatus());
        case "runtime.getStatus":
          return createSuccessResponse(requestId, getStatus());
        case "runtime.dispose":
          await dispose();
          return createSuccessResponse(requestId, { status: "disposed" });
        default:
          if (command.type.startsWith("mock.")) {
            const result = await ensureMockRuntime().handle(command.type, command.payload);
            if (result !== undefined) return createSuccessResponse(requestId, result);
          }
          if (command.type.startsWith("grpc.")) {
            const result = await ensureNativeGrpcRuntime().handle(command.type, command.payload);
            if (result !== undefined) return createSuccessResponse(requestId, result);
          }
          if (command.type.startsWith("payload.")) {
            const result = await ensurePayloadStore().handle(command.type, command.payload || {});
            if (result !== undefined) return createSuccessResponse(requestId, result);
          }
          if (typeof options.handleCommand === "function") {
            const result = await options.handleCommand(command, { emit, getStatus });
            if (result !== undefined) return createSuccessResponse(requestId, result);
          }
          throw new Error(`Unsupported runtime command: ${command.type}`);
      }
    } catch (error) {
      return createErrorResponse(requestId, error);
    }
  };

  const subscribe = (listener) => {
    if (typeof listener !== "function") return () => undefined;
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  async function dispose() {
    if (disposed) return;
    disposed = true;
    unsubscribeMockRuntime?.();
    unsubscribeMockRuntime = null;
    await mockRuntime?.dispose?.();
    mockRuntime = null;
    unsubscribeNativeGrpcRuntime?.();
    unsubscribeNativeGrpcRuntime = null;
    await nativeGrpcRuntime?.dispose?.();
    nativeGrpcRuntime = null;
    payloadStore?.dispose?.();
    payloadStore = null;
    if (typeof options.dispose === "function") await options.dispose();
    listeners.clear();
  }

  return {
    handle,
    subscribe,
    dispose,
    getStatus,
    emit,
  };
}

module.exports = { createRuntimeCore };
