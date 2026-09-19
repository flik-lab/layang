"use strict";

const path = require("node:path");
const { createUtilityRuntimeHost } = require("./utility-runtime-host.cjs");
const { getNodeTlsRuntimeEnvironment } = require("../utils/certificate-settings.cjs");

const DEFAULT_EVENT_FLUSH_MS = 250;

function createDisposableTransportRuntimeManager(options = {}) {
  const entryPath = options.entryPath || path.join(__dirname, "transport-runtime-entry.cjs");
  const createHost = options.createHost || ((context = {}) => createUtilityRuntimeHost({
    entryPath,
    maxRestarts: 0,
    env: context.env || {},
  }));
  const getTlsEnvironment = options.getTlsEnvironment || getNodeTlsRuntimeEnvironment;
  const eventFlushMs = Math.max(1, Number(options.eventFlushMs) || DEFAULT_EVENT_FLUSH_MS);
  const runs = new Map();
  const documentOwners = new Map();
  let configuredRetentionLimit = 10;
  let disposed = false;

  async function invoke(runIdInput, payload, onBatch = () => undefined) {
    assertAvailable();
    const runId = normalizeRunId(runIdInput);
    await disposeRun(runId, "replaced by a fresh transport generation");

    const env = isHttpsUrl(payload?.url) ? { ...getTlsEnvironment() } : {};
    const host = createHost({ runId, env });
    const state = {
      runId,
      host,
      unsubscribe: null,
      queue: [],
      timer: null,
      onBatch: typeof onBatch === "function" ? onBatch : () => undefined,
      disposed: false,
      documentIds: [],
      pinnedDocumentIds: new Set(),
      retentionLimit: configuredRetentionLimit,
    };
    runs.set(runId, state);
    state.unsubscribe = host.subscribe((runtimeEvent) => handleRuntimeEvent(state, runtimeEvent));

    try {
      await host.start();
      await host.invoke("payload.setRetentionLimit", { limit: configuredRetentionLimit });
      const result = await host.invoke("grpcWeb.invoke", { ...(payload || {}), runId });
      registerResultDocuments(state, result);
      flush(state);
      return result;
    } catch (error) {
      flush(state);
      await disposeRun(runId, "transport invocation failed");
      throw error;
    }
  }

  async function cancel(runIdInput) {
    const runId = normalizeRunId(runIdInput);
    const state = runs.get(runId);
    if (!state) return { cancelled: false };
    let cancelled = false;
    try {
      const result = await state.host.invoke("grpcWeb.cancel", { runId }).catch(() => ({ cancelled: false }));
      cancelled = result?.cancelled !== false;
    } finally {
      await disposeRun(runId, "cancelled");
    }
    return { cancelled };
  }

  async function invokePayload(type, payload = {}) {
    assertAvailable();
    if (type === "payload.debugStats") return aggregateDebugStats();
    if (type === "payload.setRetentionLimit") {
      configuredRetentionLimit = normalizeRetentionLimit(payload?.limit);
      await Promise.all([...runs.values()].map(async (state) => {
        if (state.disposed) return;
        state.retentionLimit = configuredRetentionLimit;
        await state.host.invoke(type, { limit: configuredRetentionLimit });
        trimDocumentOwners(state);
      }));
      return { ok: true, limit: configuredRetentionLimit };
    }
    if (type === "payload.search") return invokeSearch(payload);
    if (type === "payload.release") return invokeGroupedIds(type, payload.ids || [], payload);

    const id = String(payload?.id || "");
    const runId = documentOwners.get(id);
    if (!runId) throw unavailableDocumentError(id);
    const state = runs.get(runId);
    if (!state || state.disposed) throw unavailableDocumentError(id);
    const result = await state.host.invoke(type, payload);
    if (type === "payload.pin") {
      state.pinnedDocumentIds.add(id);
      documentOwners.set(id, runId);
      if (!state.documentIds.includes(id)) state.documentIds.push(id);
    }
    if (type === "payload.unpin") {
      state.pinnedDocumentIds.delete(id);
      trimDocumentOwners(state);
    }
    return result;
  }

  async function disposeRun(runIdInput, _reason = "disposed") {
    const runId = normalizeRunId(runIdInput);
    const state = runs.get(runId);
    if (!state) return;
    runs.delete(runId);
    state.disposed = true;
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    flush(state);
    state.unsubscribe?.();
    state.unsubscribe = null;
    for (const [documentId, owner] of documentOwners.entries()) {
      if (owner === runId) documentOwners.delete(documentId);
    }
    await state.host.dispose().catch(() => undefined);
  }

  async function disposeAll() {
    if (disposed) return;
    disposed = true;
    const ids = [...runs.keys()];
    await Promise.all(ids.map((runId) => disposeRun(runId, "manager disposed")));
    documentOwners.clear();
  }

  function getStatus() {
    return {
      runCount: runs.size,
      documentCount: documentOwners.size,
      runs: [...runs.values()].map((state) => ({ runId: state.runId, ...state.host.getStatus() })),
    };
  }

  function handleRuntimeEvent(state, runtimeEvent) {
    if (!runtimeEvent || runtimeEvent.type !== "event" || state.disposed) return;
    const event = toGrpcEvent(runtimeEvent);
    if (!event) return;
    if (event.type === "message" && event.documentRef?.id) {
      rememberDocument(state, event.documentRef.id, runtimeEvent.payload?.retentionLimit);
    }
    if (event.type === "error" || event.type === "end") {
      flush(state);
      safeDeliver(state, [event]);
      return;
    }
    state.queue.push(event);
    if (state.timer === null) {
      state.timer = setTimeout(() => {
        state.timer = null;
        flush(state);
      }, eventFlushMs);
    }
  }

  function flush(state) {
    if (!state || state.queue.length === 0) return;
    const batch = state.queue.splice(0, state.queue.length);
    safeDeliver(state, batch);
  }

  function safeDeliver(state, events) {
    try { state.onBatch(events); } catch { /* renderer may have closed */ }
  }

  function registerResultDocuments(state, result) {
    for (const [documentId, owner] of documentOwners.entries()) {
      if (owner === state.runId && !state.pinnedDocumentIds.has(documentId)) documentOwners.delete(documentId);
    }
    state.documentIds = state.documentIds.filter((id) => state.pinnedDocumentIds.has(id));
    const refs = Array.isArray(result?.messageDocumentRefs) ? result.messageDocumentRefs : [];
    for (const ref of refs) if (ref?.id) rememberDocument(state, String(ref.id), state.retentionLimit);
    trimDocumentOwners(state);
  }

  function rememberDocument(state, documentIdInput, retentionLimitInput) {
    const documentId = String(documentIdInput || "");
    if (!documentId) return;
    const retentionLimit = Math.max(1, Math.floor(Number(retentionLimitInput) || state.retentionLimit || 10));
    state.retentionLimit = retentionLimit;
    documentOwners.set(documentId, state.runId);
    const existingIndex = state.documentIds.indexOf(documentId);
    if (existingIndex >= 0) state.documentIds.splice(existingIndex, 1);
    state.documentIds.push(documentId);
    trimDocumentOwners(state);
  }

  function trimDocumentOwners(state) {
    let unpinnedCount = state.documentIds.reduce((count, id) => count + (state.pinnedDocumentIds.has(id) ? 0 : 1), 0);
    while (unpinnedCount > state.retentionLimit) {
      const index = state.documentIds.findIndex((id) => !state.pinnedDocumentIds.has(id));
      if (index < 0) break;
      const [removedId] = state.documentIds.splice(index, 1);
      if (documentOwners.get(removedId) === state.runId) documentOwners.delete(removedId);
      unpinnedCount -= 1;
    }
  }

  async function invokeSearch(payload) {
    const ids = Array.isArray(payload?.ids) ? payload.ids.map(String) : [];
    const groups = groupDocumentIds(ids);
    const results = [];
    const limit = Math.max(1, Number(payload?.limit) || 2_000);
    for (const [runId, groupIds] of groups.entries()) {
      const state = runs.get(runId);
      if (!state || state.disposed) continue;
      const matches = await state.host.invoke("payload.search", { ...payload, ids: groupIds, limit: Math.max(1, limit - results.length) });
      if (Array.isArray(matches)) results.push(...matches);
      if (results.length >= limit) break;
    }
    return results.slice(0, limit);
  }

  async function invokeGroupedIds(type, idsInput, payload) {
    const ids = Array.isArray(idsInput) ? idsInput.map(String) : [];
    const groups = groupDocumentIds(ids);
    await Promise.all([...groups.entries()].map(async ([runId, groupIds]) => {
      const state = runs.get(runId);
      if (!state || state.disposed) return;
      await state.host.invoke(type, { ...payload, ids: groupIds });
      if (type === "payload.release") {
        const released = new Set(groupIds);
        for (const id of groupIds) {
          documentOwners.delete(id);
          state.pinnedDocumentIds.delete(id);
        }
        state.documentIds = state.documentIds.filter((id) => !released.has(id));
      }
    }));
    return { ok: true };
  }

  async function aggregateDebugStats() {
    const total = {
      documentCount: 0,
      decodedDocumentCount: 0,
      indexedDocumentCount: 0,
      pinnedDocumentCount: 0,
      rawBytes: 0,
      decodedChars: 0,
      indexBytes: 0,
      residentBytes: 0,
    };
    for (const state of runs.values()) {
      if (state.disposed) continue;
      const stats = await state.host.invoke("payload.debugStats").catch(() => null);
      if (!stats) continue;
      for (const key of Object.keys(total)) total[key] += Math.max(0, Number(stats[key]) || 0);
    }
    return total;
  }

  function groupDocumentIds(ids) {
    const groups = new Map();
    for (const id of ids) {
      const runId = documentOwners.get(id);
      if (!runId) continue;
      const group = groups.get(runId) || [];
      group.push(id);
      groups.set(runId, group);
    }
    return groups;
  }

  function assertAvailable() {
    if (disposed) throw new Error("Disposable transport runtime manager is disposed.");
  }

  return { invoke, cancel, invokePayload, disposeRun, disposeAll, getStatus };
}

function isHttpsUrl(value) {
  try { return new URL(String(value || "")).protocol === "https:"; } catch { return false; }
}

function normalizeRetentionLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 10;
  return Math.max(1, Math.floor(numeric));
}

function toGrpcEvent(runtimeEvent) {
  const payload = runtimeEvent.payload || {};
  switch (runtimeEvent.event) {
    case "grpcWeb.log": return { type: "log", ...payload };
    case "grpcWeb.headers": return { type: "headers", ...payload };
    case "grpcWeb.message": return { type: "message", ...payload };
    case "grpcWeb.trailers": return { type: "trailers", ...payload };
    case "grpcWeb.error": return { type: "error", ...payload };
    case "grpcWeb.end": return { type: "end", ...payload };
    default: return null;
  }
}

function normalizeRunId(value) {
  const runId = String(value || "").trim();
  if (!runId) throw new Error("Transport runId is required.");
  return runId;
}

function unavailableDocumentError(id) {
  return new Error(`Transport document is no longer available: ${id || "<empty>"}. Start a fresh request to load a new document generation.`);
}

module.exports = { createDisposableTransportRuntimeManager };
