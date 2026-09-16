"use strict";

function createNativeGrpcRuntime(options = {}) {
  const invokeNativeGrpc = options.invokeNativeGrpc || ((payload, emit, registerCall) => {
    const runner = require("../../../electron/services/native-grpc-runner.cjs");
    return runner.invokeNativeGrpc(payload, emit, registerCall);
  });
  const payloadStore = options.payloadStore || null;
  const generation = options.generation ? String(options.generation) : "";
  const listeners = new Set();
  const activeCalls = new Map();
  let disposed = false;

  const emit = (event, payload) => {
    const value = { event, payload };
    for (const listener of listeners) listener(value);
  };

  const subscribe = (listener) => {
    if (typeof listener !== "function") return () => undefined;
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const emitRunnerEvent = (runId, grpcEvent) => {
    const active = activeCalls.get(runId);
    if (!active) return;
    if (grpcEvent?.type === "message") {
      if (payloadStore && grpcEvent.serializedValueUtf8) {
        const documentId = generation
          ? `runtime:${generation}:grpc:${runId}:${grpcEvent.index}`
          : `grpc:${runId}:${grpcEvent.index}`;
        const documentRef = payloadStore.registerUtf8(
          documentId,
          grpcEvent.serializedValueUtf8,
          grpcEvent.preview,
          grpcEvent.originalChars,
        );
        active.documentRefsByIndex.set(grpcEvent.index, documentRef);
        emit("grpc.messageMeta", { runId, type: "message", index: grpcEvent.index, documentRef });
      } else {
        emit("grpc.messageMeta", { runId, ...grpcEvent });
      }
      return;
    }
    if (grpcEvent?.type === "error") {
      emit("grpc.error", { runId, event: grpcEvent });
      return;
    }
    if (grpcEvent?.type === "end") {
      if (active.endEmitted) return;
      active.endEmitted = true;
      emit("grpc.end", { runId, event: grpcEvent, cancelled: active.cancelled });
      return;
    }
    emit("grpc.event", { runId, event: grpcEvent });
  };

  const invoke = async (payload) => {
    if (disposed) throw new Error("Native gRPC runtime is disposed.");
    const runId = payload?.runId ? String(payload.runId) : "";
    if (!runId) throw new Error("Native gRPC runId is required.");
    if (activeCalls.has(runId)) throw new Error(`Native gRPC run is already active: ${runId}`);

    const active = { call: null, client: null, cancelled: false, endEmitted: false, documentRefsByIndex: new Map() };
    activeCalls.set(runId, active);
    emit("grpc.started", { runId });

    const registerCall = (call, client) => {
      const current = activeCalls.get(runId);
      if (!current) return;
      if (call) current.call = call;
      if (client) current.client = client;
    };

    try {
      const result = await invokeNativeGrpc(payload, (grpcEvent) => emitRunnerEvent(runId, grpcEvent), registerCall);
      const normalizedResult = payloadStore ? attachRetainedDocumentRefs(result, active.documentRefsByIndex, payloadStore) : result;
      if (!active.endEmitted) {
        active.endEmitted = true;
        emit("grpc.end", { runId, cancelled: active.cancelled, result: normalizedResult });
      }
      return normalizedResult;
    } catch (error) {
      if (!active.endEmitted) {
        emit("grpc.error", {
          runId,
          event: {
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          },
        });
        active.endEmitted = true;
        emit("grpc.end", { runId, cancelled: active.cancelled, error: error instanceof Error ? error.message : String(error) });
      }
      throw error;
    } finally {
      activeCalls.delete(runId);
    }
  };

  const cancel = async (payload) => {
    const runId = payload?.runId ? String(payload.runId) : "";
    const active = activeCalls.get(runId);
    if (!active) return { cancelled: false };
    active.cancelled = true;
    try {
      active.call?.cancel?.();
      active.client?.close?.();
    } finally {
      if (!active.endEmitted) {
        active.endEmitted = true;
        emit("grpc.end", { runId, cancelled: true });
      }
    }
    return { cancelled: true };
  };

  const handle = async (type, payload = null) => {
    if (type === "grpc.invoke") return invoke(payload || {});
    if (type === "grpc.cancel") return cancel(payload || {});
    return undefined;
  };

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    for (const [runId] of activeCalls) await cancel({ runId });
    activeCalls.clear();
    listeners.clear();
  };

  const getDebugStats = () => ({ activeRunIds: [...activeCalls.keys()] });

  return { handle, subscribe, dispose, getDebugStats };
}

function attachRetainedDocumentRefs(result, refsByIndex, payloadStore) {
  if (!result || !Array.isArray(result.messages) || refsByIndex.size === 0) return result;
  const totalMessages = Number(result.totalMessages) || result.messages.length;
  const firstRetainedIndex = Math.max(0, totalMessages - result.messages.length);
  const pairs = [];
  for (let offset = 0; offset < result.messages.length; offset += 1) {
    const index = firstRetainedIndex + offset;
    const ref = refsByIndex.get(index);
    if (!ref || !payloadStore.has(ref.id)) continue;
    pairs.push({ message: result.messages[offset], ref });
  }
  if (pairs.length === 0) return { ...result, messages: [], messageDocumentRefs: [] };
  return {
    ...result,
    messages: pairs.map((pair) => pair.message),
    messageDocumentRefs: pairs.map((pair) => pair.ref),
  };
}

module.exports = { createNativeGrpcRuntime };
