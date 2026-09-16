"use client";

import { performanceStats } from "../../../shared/performance/performance-stats.store";
import type {
  PayloadDocumentClient,
  PayloadDocumentDebugStats,
  PayloadDocumentMeta,
  PayloadPreparedWindow,
  PayloadSearchMatch,
} from "./payloadDocument.types";

type TransportBridge = {
  payload<T = unknown>(type: string, payload?: unknown): Promise<T>;
};

function getTransportBridge(): TransportBridge {
  const bridge = typeof window !== "undefined" ? window.electronGrpcWebTransport : undefined;
  if (!bridge?.isAvailable || typeof bridge.payload !== "function") {
    throw new Error("Electron gRPC-Web transport payload runtime is unavailable.");
  }
  return bridge;
}

function isPayloadDocumentDebugStats(value: unknown): value is PayloadDocumentDebugStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Record<string, unknown>;
  return [
    "documentCount",
    "decodedDocumentCount",
    "indexedDocumentCount",
    "pinnedDocumentCount",
    "rawBytes",
    "decodedChars",
    "indexBytes",
    "residentBytes",
  ].every((key) => typeof stats[key] === "number");
}

export function createTransportPayloadDocumentClient(): PayloadDocumentClient {
  const bridge = getTransportBridge();
  let disposed = false;
  let inFlight = 0;
  let lastStatsAt = 0;
  let statsSampling = false;

  const operationName = (type: string): string => {
    const names: Record<string, string> = {
      "payload.getMeta": "get-meta",
      "payload.getLines": "get-lines",
      "payload.prepareWindow": "get-meta",
      "payload.search": "search",
      "payload.getText": "get-text",
      "payload.debugStats": "debug-stats",
    };
    return names[type] ?? type.replace(/^payload\./, "").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  };

  const invoke = async <T>(type: string, payload?: unknown): Promise<T> => {
    if (disposed) throw new Error("Transport payload client was disposed.");
    const startedAt = performance.now();
    inFlight += 1;
    performanceStats.setPayloadInFlight(inFlight);
    try {
      const result = await bridge.payload<T>(type, payload);
      if (type === "payload.debugStats" && isPayloadDocumentDebugStats(result)) {
        performanceStats.setPayloadWorkerStats(result);
      } else {
        sampleStatsIfNeeded();
      }
      return result;
    } finally {
      inFlight = Math.max(0, inFlight - 1);
      performanceStats.setPayloadInFlight(inFlight);
      performanceStats.recordPayloadRequest(operationName(type), Math.max(0, performance.now() - startedAt));
    }
  };

  const sampleStatsIfNeeded = (): void => {
    if (!performanceStats.isEnabled() || statsSampling) return;
    const currentAt = performance.now();
    if (currentAt - lastStatsAt < 1_000) return;
    lastStatsAt = currentAt;
    statsSampling = true;
    void bridge.payload<PayloadDocumentDebugStats>("payload.debugStats")
      .then((stats) => performanceStats.setPayloadWorkerStats(stats))
      .catch(() => undefined)
      .finally(() => { statsSampling = false; });
  };

  return {
    registerValue() {
      return Promise.reject(new Error("Transport payload documents are registered inside the transport utility process."));
    },
    registerUtf8() {
      return Promise.reject(new Error("Transport payload documents are registered inside the transport utility process."));
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
      return Promise.reject(new Error("Transport payload runtime does not accept renderer producer ports."));
    },
    dispose() {
      disposed = true;
    },
  };
}
