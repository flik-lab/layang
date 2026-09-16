"use client";

import type {
  PayloadDocumentClient,
  PayloadDocumentDebugStats,
  PayloadDocumentMeta,
  PayloadDocumentRef,
  PayloadPreparedWindow,
  PayloadSearchMatch,
} from "./payloadDocument.types";

type RuntimeBridge = {
  invoke<T = unknown>(type: string, payload?: unknown): Promise<T>;
};

function getRuntimeBridge(): RuntimeBridge {
  const runtime = typeof window !== "undefined" ? window.electronRuntime : undefined;
  if (!runtime?.isAvailable || runtime.mode !== "utility" || typeof runtime.invoke !== "function") {
    throw new Error("Utility payload runtime is unavailable.");
  }
  return runtime;
}

export function createUtilityPayloadDocumentClient(): PayloadDocumentClient {
  const runtime = getRuntimeBridge();
  let disposed = false;
  const invoke = <T>(type: string, payload?: unknown): Promise<T> => {
    if (disposed) return Promise.reject(new Error("Utility payload client was disposed."));
    return runtime.invoke<T>(type, payload);
  };

  return {
    registerValue(id, value) {
      return invoke<PayloadDocumentRef>("payload.registerValue", { id, value });
    },
    registerUtf8(id, bytes, preview, originalChars) {
      return invoke<PayloadDocumentRef>("payload.registerUtf8", {
        id,
        bytes: new Uint8Array(bytes),
        preview,
        originalChars,
      });
    },
    getMeta(id) {
      return invoke<PayloadDocumentMeta | null>("payload.getMeta", { id });
    },
    getLines(id, start, count) {
      return invoke<string[]>("payload.getLines", { id, start, count });
    },
    prepareWindow(id, start, count) {
      return invoke<PayloadPreparedWindow | null>("payload.prepareWindow", { id, start, count });
    },
    search(ids, query, limit = 2_000) {
      return invoke<PayloadSearchMatch[]>("payload.search", { ids, query, limit });
    },
    getText(id, format) {
      return invoke<string | undefined>("payload.getText", { id, format });
    },
    debugStats() {
      return invoke<PayloadDocumentDebugStats>("payload.debugStats");
    },
    setRetentionLimit(limit) {
      void invoke("payload.setRetentionLimit", { limit }).catch(() => undefined);
    },
    pin(id) {
      if (!id || disposed) return;
      void invoke("payload.pin", { id }).catch(() => undefined);
    },
    unpin(id) {
      if (!id || disposed) return;
      void invoke("payload.unpin", { id }).catch(() => undefined);
    },
    release(ids) {
      if (!ids.length || disposed) return;
      void invoke("payload.release", { ids }).catch(() => undefined);
    },
    attachProducerPort() {
      return Promise.reject(new Error("Utility payload documents do not accept renderer producer ports."));
    },
    dispose() {
      disposed = true;
    },
  };
}
