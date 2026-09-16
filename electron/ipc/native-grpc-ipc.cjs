"use strict";

const { ipcMain } = require("electron");
const { cancelNativeGrpcHandle, invokeNativeGrpc } = require("../services/native-grpc-runner.cjs");

const activeNativeCalls = new Map();
const payloadPortsByWebContentsId = new Map();
const pendingPayloadRegistrations = new Map();
let payloadRegistrationSequence = 0;

function registerNativeGrpcIpc(options = {}) {
  const runtimeMode = options.runtimeMode || process.env.LAYANG_RUNTIME_MODE || "main";
  const getRuntimeHost = typeof options.getRuntimeHost === "function" ? options.getRuntimeHost : () => null;

  ipcMain.on("native-grpc:payload-port", (event) => {
    const payloadPort = event.ports?.[0];
    if (!payloadPort) return;
    const senderId = event.sender.id;
    const previous = payloadPortsByWebContentsId.get(senderId);
    if (previous) {
      rejectPendingPayloadRegistrations(senderId, "Native gRPC payload channel was replaced.");
      try { previous.close(); } catch {}
    }
    payloadPortsByWebContentsId.set(senderId, payloadPort);
    payloadPort.on("message", (messageEvent) => {
      const response = messageEvent.data || {};
      const requestId = String(response.requestId || "");
      const pending = pendingPayloadRegistrations.get(requestId);
      if (!pending || pending.senderId !== senderId) return;
      pendingPayloadRegistrations.delete(requestId);
      clearTimeout(pending.timeout);
      if (response.type === "error") {
        pending.reject(new Error(String(response.error || "Payload document registration failed.")));
        return;
      }
      if (response.type !== "registered" || !response.documentRef) {
        pending.reject(new Error("Payload document worker returned an invalid registration response."));
        return;
      }
      pending.resolve(response.documentRef);
    });
    payloadPort.start();
    event.sender.once("destroyed", () => {
      const current = payloadPortsByWebContentsId.get(senderId);
      if (current !== payloadPort) return;
      payloadPortsByWebContentsId.delete(senderId);
      rejectPendingPayloadRegistrations(senderId, "Renderer was destroyed before payload registration completed.");
      try { payloadPort.close(); } catch {}
    });
  });

  ipcMain.handle("native-grpc:invoke", async (event, payload) => {
    if (runtimeMode === "utility") {
      return invokeUtilityNativeGrpc(event, payload, getRuntimeHost);
    }
    return invokeMainNativeGrpc(event, payload);
  });

  ipcMain.handle("native-grpc:cancel", async (_event, payload) => {
    const runId = payload?.runId ? String(payload.runId) : "";
    if (runtimeMode === "utility") {
      const host = getRuntimeHost();
      if (!host) return { cancelled: false };
      return host.invoke("grpc.cancel", { runId });
    }
    const active = activeNativeCalls.get(runId);
    if (!active) return { cancelled: false };
    try {
      cancelNativeGrpcHandle(active.call, active.client);
    } finally {
      activeNativeCalls.delete(runId);
    }
    return { cancelled: true };
  });
}

async function invokeMainNativeGrpc(event, payload) {
  const runId = payload?.runId ? String(payload.runId) : "";
  const documentRefsByIndex = new Map();
  const pendingRunRegistrations = new Set();
  const registerCall = (call, client) => {
    if (!runId) return;
    activeNativeCalls.set(runId, { call, client });
  };
  const emit = (grpcEvent) => forwardGrpcEventWithPayloadRegistration({
    event,
    runId,
    grpcEvent,
    documentRefsByIndex,
    pendingRunRegistrations,
  });
  try {
    const result = await invokeNativeGrpc(payload, emit, registerCall);
    await Promise.all([...pendingRunRegistrations]);
    return attachRetainedDocumentRefs(result, documentRefsByIndex);
  } finally {
    if (runId) activeNativeCalls.delete(runId);
  }
}

async function invokeUtilityNativeGrpc(event, payload, getRuntimeHost) {
  const runId = payload?.runId ? String(payload.runId) : "";
  const host = getRuntimeHost();
  if (!host) throw new Error("Utility runtime is unavailable.");
  const unsubscribe = host.subscribe((runtimeEvent) => {
    const runtimePayload = runtimeEvent?.payload;
    if (!runtimePayload || runtimePayload.runId !== runId || event.sender.isDestroyed()) return;
    if (runtimeEvent.event === "grpc.messageMeta") {
      event.sender.send(`native-grpc:event:${runId}`, {
        type: "message",
        index: runtimePayload.index,
        documentRef: runtimePayload.documentRef,
      });
      return;
    }
    if (runtimeEvent.event === "grpc.event" || runtimeEvent.event === "grpc.error" || runtimeEvent.event === "grpc.end") {
      const grpcEvent = runtimePayload.event;
      if (grpcEvent) event.sender.send(`native-grpc:event:${runId}`, grpcEvent);
    }
  });
  try {
    return await host.invoke("grpc.invoke", payload);
  } finally {
    unsubscribe();
  }
}

function forwardGrpcEventWithPayloadRegistration({ event, runId, grpcEvent, documentRefsByIndex, pendingRunRegistrations }) {
  if (!runId || event.sender.isDestroyed()) return;
  if (grpcEvent?.type === "message" && grpcEvent.serializedValueUtf8) {
    const registration = registerPayloadDocument(event.sender, runId, grpcEvent)
      .then((documentRef) => {
        documentRefsByIndex.set(grpcEvent.index, documentRef);
        if (!event.sender.isDestroyed()) {
          event.sender.send(`native-grpc:event:${runId}`, {
            type: "message",
            index: grpcEvent.index,
            documentRef,
          });
        }
      })
      .catch(() => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(`native-grpc:event:${runId}`, {
            type: "message",
            index: grpcEvent.index,
            value: grpcEvent.preview,
          });
        }
      })
      .finally(() => pendingRunRegistrations.delete(registration));
    pendingRunRegistrations.add(registration);
    return;
  }
  event.sender.send(`native-grpc:event:${runId}`, grpcEvent);
}

function registerPayloadDocument(sender, runId, grpcEvent) {
  const senderId = sender.id;
  const payloadPort = payloadPortsByWebContentsId.get(senderId);
  if (!payloadPort) return Promise.reject(new Error("Native gRPC payload document port is unavailable."));

  payloadRegistrationSequence += 1;
  const requestId = `native-grpc-payload:${runId}:${grpcEvent.index}:${payloadRegistrationSequence}`;
  const documentId = `native-grpc:${runId}:${grpcEvent.index}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingPayloadRegistrations.delete(requestId);
      reject(new Error("Timed out registering native gRPC payload document."));
    }, 5_000);
    pendingPayloadRegistrations.set(requestId, { senderId, resolve, reject, timeout });
    try {
      payloadPort.postMessage({
        type: "register-utf8",
        requestId,
        id: documentId,
        buffer: grpcEvent.serializedValueUtf8,
        preview: grpcEvent.preview,
        originalChars: grpcEvent.originalChars,
      });
    } catch (error) {
      clearTimeout(timeout);
      pendingPayloadRegistrations.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function attachRetainedDocumentRefs(result, documentRefsByIndex) {
  if (!result || !Array.isArray(result.messages) || result.messages.length === 0) return result;
  const totalMessages = Math.max(result.messages.length, Number(result.totalMessages) || result.messages.length);
  const firstRetainedIndex = Math.max(0, totalMessages - result.messages.length);
  const refs = result.messages.map((_, offset) => documentRefsByIndex.get(firstRetainedIndex + offset));
  if (refs.some((ref) => !ref)) return result;
  return { ...result, messageDocumentRefs: refs };
}

function rejectPendingPayloadRegistrations(senderId, message) {
  for (const [requestId, pending] of pendingPayloadRegistrations) {
    if (pending.senderId !== senderId) continue;
    pendingPayloadRegistrations.delete(requestId);
    clearTimeout(pending.timeout);
    pending.reject(new Error(message));
  }
}

module.exports = { registerNativeGrpcIpc };
