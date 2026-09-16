"use client";

import { performanceStats } from "../../../shared/performance/performance-stats.store";
import {
  PAYLOAD_DOCUMENT_MAX_CHARS,
  PAYLOAD_DOCUMENT_MAX_DECODED_DOCUMENTS,
  PAYLOAD_DOCUMENT_MAX_DOCUMENTS,
} from "./payloadDocumentRuntime";
import { PAYLOAD_DOCUMENT_WORKER_SOURCE } from "./payloadDocumentWorkerSource";
import type {
  PayloadDocumentClient,
  PayloadDocumentDebugStats,
  PayloadDocumentMeta,
  PayloadDocumentRef,
  PayloadPreparedWindow,
  PayloadSearchMatch,
} from "./payloadDocument.types";

type WorkerResponse =
  | { type: "ready" | "ok"; requestId: string }
  | { type: "registered"; requestId: string; documentRef: PayloadDocumentRef }
  | { type: "meta"; requestId: string; meta: PayloadDocumentMeta | null }
  | { type: "lines"; requestId: string; lines: string[] }
  | { type: "prepared-window"; requestId: string; window: PayloadPreparedWindow | null }
  | { type: "search-result"; requestId: string; matches: PayloadSearchMatch[] }
  | { type: "text"; requestId: string; text?: string }
  | { type: "debug-stats"; requestId: string; stats: PayloadDocumentDebugStats }
  | { type: "error"; requestId: string; error: string };

type WorkerResult =
  | undefined
  | PayloadDocumentRef
  | PayloadDocumentMeta
  | PayloadPreparedWindow
  | null
  | string[]
  | PayloadSearchMatch[]
  | PayloadDocumentDebugStats
  | string;

type PendingRequest = {
  resolve: (value: WorkerResult) => void;
  reject: (error: Error) => void;
  operation: string;
  startedAt: number;
};

export function createPayloadDocumentClient(): PayloadDocumentClient {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new Error("Payload Document Worker is required but unavailable in this environment.");
  }

  let workerUrl = URL.createObjectURL(new Blob([PAYLOAD_DOCUMENT_WORKER_SOURCE], { type: "text/javascript" }));
  let worker: Worker | null = new Worker(workerUrl, { name: "layang-payload-document" });
  let sequence = 0;
  let disposed = false;
  let lastWorkerStatsAt = 0;
  let workerStatsSampling = false;
  const pending = new Map<string, PendingRequest>();

  const rejectPending = (message: string) => {
    const error = new Error(message);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    performanceStats.setPayloadInFlight(0);
  };

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.requestId);
    if (!request) return;
    pending.delete(response.requestId);
    performanceStats.setPayloadInFlight(pending.size);
    performanceStats.recordPayloadRequest(request.operation, Math.max(0, performance.now() - request.startedAt));
    if (response.type === "error") {
      request.reject(new Error(response.error));
      return;
    }
    if (response.type === "registered") request.resolve(response.documentRef);
    else if (response.type === "meta") request.resolve(response.meta);
    else if (response.type === "lines") request.resolve(response.lines);
    else if (response.type === "prepared-window") request.resolve(response.window);
    else if (response.type === "search-result") request.resolve(response.matches);
    else if (response.type === "text") request.resolve(response.text);
    else if (response.type === "debug-stats") {
      performanceStats.setPayloadWorkerStats(response.stats);
      request.resolve(response.stats);
    } else request.resolve(undefined);

    if (request.operation !== "debug-stats") sampleWorkerStatsIfNeeded();
  };
  worker.onerror = (event) => rejectPending(event.message || "Payload Document Worker failed.");

  const post = (
    message: Record<string, unknown>,
    transfer: Transferable[] = [],
    expectReply = true,
  ): Promise<WorkerResult> => {
    if (disposed || !worker) return Promise.reject(new Error("Payload Document Worker is not available."));
    sequence += 1;
    const requestId = `payload-document:${sequence}`;
    const operation = typeof message.type === "string" ? message.type : "unknown";
    if (!expectReply) {
      worker.postMessage({ ...message, requestId }, transfer);
      return Promise.resolve(undefined);
    }
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject, operation, startedAt: performance.now() });
      performanceStats.setPayloadInFlight(pending.size);
      try {
        worker?.postMessage({ ...message, requestId }, transfer);
      } catch (error) {
        pending.delete(requestId);
        performanceStats.setPayloadInFlight(pending.size);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  const sampleWorkerStatsIfNeeded = () => {
    if (!performanceStats.isEnabled() || workerStatsSampling) return;
    const currentAt = performance.now();
    if (currentAt - lastWorkerStatsAt < 1_000) return;
    lastWorkerStatsAt = currentAt;
    workerStatsSampling = true;
    void post({ type: "debug-stats" })
      .then((result) => {
        if (result && typeof result === "object" && "residentBytes" in result) {
          performanceStats.setPayloadWorkerStats(result as PayloadDocumentDebugStats);
        }
      })
      .catch(() => undefined)
      .finally(() => { workerStatsSampling = false; });
  };

  const ready = post({
    type: "init",
    maxDocuments: PAYLOAD_DOCUMENT_MAX_DOCUMENTS,
    maxChars: PAYLOAD_DOCUMENT_MAX_CHARS,
    maxPreparedDocuments: PAYLOAD_DOCUMENT_MAX_DECODED_DOCUMENTS,
  });

  const client: PayloadDocumentClient = {
    async registerValue(id, value) {
      await ready;
      const result = await post({ type: "register-value", id, value });
      if (!result || typeof result !== "object" || !("id" in result)) {
        throw new Error(`Payload document ${id} was not registered.`);
      }
      return result as PayloadDocumentRef;
    },
    async registerUtf8(id, bytes, preview, originalChars) {
      await ready;
      const result = await post(
        { type: "register-utf8", id, buffer: bytes, preview, originalChars },
        [bytes],
      );
      if (!result || typeof result !== "object" || !("id" in result)) {
        throw new Error(`Payload document ${id} was not registered.`);
      }
      return result as PayloadDocumentRef;
    },
    async getMeta(id) {
      await ready;
      const result = await post({ type: "get-meta", id });
      return (result ?? null) as PayloadDocumentMeta | null;
    },
    async getLines(id, start, count) {
      await ready;
      const result = await post({ type: "get-lines", id, start, count });
      return Array.isArray(result) ? result as string[] : [];
    },
    async prepareWindow(id, start, count) {
      await ready;
      const result = await post({ type: "prepare-window", id, start, count });
      if (!result || typeof result !== "object" || !("documentId" in result)) return null;
      return result as PayloadPreparedWindow;
    },
    async search(ids, query, limit = 2_000) {
      await ready;
      const result = await post({ type: "search", ids, query, limit });
      return Array.isArray(result) ? result as PayloadSearchMatch[] : [];
    },
    async getText(id, format) {
      await ready;
      const result = await post({ type: "get-text", id, format });
      return typeof result === "string" ? result : undefined;
    },
    async debugStats() {
      await ready;
      const result = await post({ type: "debug-stats" });
      if (!result || typeof result !== "object" || !("residentBytes" in result)) {
        throw new Error("Payload document worker stats are unavailable.");
      }
      return result as PayloadDocumentDebugStats;
    },
    setRetentionLimit(limit) {
      if (disposed || !worker) return;
      void ready.then(() => post({ type: "configure", maxDocuments: limit })).catch(() => undefined);
    },
    pin(id) {
      if (!id || disposed || !worker) return;
      void ready.then(() => post({ type: "pin", id }, [], false)).catch(() => undefined);
    },
    unpin(id) {
      if (!id || disposed || !worker) return;
      void ready.then(() => post({ type: "unpin", id }, [], false)).catch(() => undefined);
    },
    release(ids) {
      if (!ids.length || disposed || !worker) return;
      void ready.then(() => post({ type: "release", ids })).catch(() => undefined);
    },
    async attachProducerPort(port) {
      await ready;
      await post({ type: "attach-producer-port", port }, [port]);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { worker?.postMessage({ type: "dispose" }); } catch { /* already stopped */ }
      worker?.terminate();
      worker = null;
      URL.revokeObjectURL(workerUrl);
      workerUrl = "";
      rejectPending("Payload Document Worker was disposed.");
    },
  };

  return client;
}
