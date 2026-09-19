"use client";

import type { UiEvent } from "../../../shared/workbench-types";
import { performanceStats } from "../../../shared/performance/performance-stats.store";
import type { ResponseMessageRecord, ResponseSearchScope, ResponseSnapshot } from "./response.types";

type StateUpdater<T> = T | ((current: T) => T);
export type ResponseDocumentReleaser = (ids: string[]) => void;

export type ResponseStoreDebugStats = {
  retainedRecords: number;
  referencedDocumentIds: number;
  compatibilityEvents: number;
};

export type ResponseStore = {
  getSnapshot(): ResponseSnapshot;
  subscribe(listener: () => void): () => void;
  getRecord(id: string): ResponseMessageRecord | undefined;
  getEvents(): UiEvent[];
  getDebugStats(): ResponseStoreDebugStats;
  setEvents(value: StateUpdater<UiEvent[]>): void;
  appendEvents(events: UiEvent[]): void;
  appendRecords(records: ResponseMessageRecord[], controlEvents?: UiEvent[]): void;
  setResponseFilter(value: StateUpdater<string>): void;
  setResponseSearchScope(value: StateUpdater<ResponseSearchScope>): void;
  setPendingMessageCount(value: StateUpdater<number>): void;
  setShowMessageTopButton(value: StateUpdater<boolean>): void;
  setRetentionLimit(limit: number): void;
  setPinnedMessageIds(ids: readonly string[]): void;
  reset(): void;
};

const DEFAULT_MAX_MESSAGES = 10;
const RESPONSE_NOTIFY_INTERVAL_MS = 250;

export function createResponseStore(releaseDocuments: ResponseDocumentReleaser = () => undefined): ResponseStore {
  let records = new Map<string, ResponseMessageRecord>();
  let compatibilityEvents: UiEvent[] = [];
  let snapshot: ResponseSnapshot = {
    orderedMessageIds: [],
    latestMessageId: undefined,
    version: 0,
    responseFilter: "",
    responseSearchScope: "current",
    pendingMessageCount: 0,
    showMessageTopButton: false,
    retentionLimit: DEFAULT_MAX_MESSAGES,
    controlEvents: [],
  };
  const listeners = new Set<() => void>();
  let nextSequence = 0;
  let retentionLimit = DEFAULT_MAX_MESSAGES;
  let pinnedMessageIds = new Set<string>();
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;

  const notifyListeners = () => {
    if (notifyTimer !== null) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
    for (const listener of listeners) listener();
  };

  const publish = (patch: Partial<ResponseSnapshot>, deferNotification = false) => {
    snapshot = { ...snapshot, ...patch, version: snapshot.version + 1 };
    if (!deferNotification) {
      notifyListeners();
      return;
    }
    if (notifyTimer !== null) return;
    notifyTimer = setTimeout(notifyListeners, RESPONSE_NOTIFY_INTERVAL_MS);
  };

  const appendRecords = (additions: ResponseMessageRecord[], controlEvents: UiEvent[] = []) => {
    if (!additions.length && !controlEvents.length) return;
    const ordered = [...snapshot.orderedMessageIds];
    const nextRecords = new Map(records);
    for (const record of additions) {
      if (!nextRecords.has(record.id)) ordered.push(record.id);
      nextRecords.set(record.id, record);
      nextSequence = Math.max(nextSequence, record.sequence + 1);
    }
    const evicted = ordered.length > retentionLimit ? ordered.splice(0, ordered.length - retentionLimit) : [];
    const released: string[] = [];
    for (const id of evicted) {
      if (pinnedMessageIds.has(id)) continue;
      const record = nextRecords.get(id);
      if (record?.documentId) released.push(record.documentId);
      nextRecords.delete(id);
    }
    if (released.length) releaseDocuments(released);
    records = nextRecords;
    const latestMessageId = findLatestMessageId(ordered, nextRecords);
    const nextControls = controlEvents.length ? [...snapshot.controlEvents, ...controlEvents].slice(-100) : snapshot.controlEvents;
    publish({ orderedMessageIds: ordered, latestMessageId, controlEvents: nextControls }, true);
    performanceStats.setRetainedMessages(nextRecords.size);
    performanceStats.setPayloadDocuments(countDocumentIds(nextRecords));
  };

  const appendEvents = (events: UiEvent[]) => {
    if (!events.length) return;
    compatibilityEvents = [...compatibilityEvents, ...events].slice(-retentionLimit);
    const additions: ResponseMessageRecord[] = [];
    const controls: UiEvent[] = [];
    for (const event of events) {
      if (event.kind === "message" || event.kind === "error" || event.kind === "end") {
        additions.push(eventToRecord(event, nextSequence));
        nextSequence += 1;
      } else {
        controls.push(event);
      }
    }
    appendRecords(additions, controls);
  };


  const rebuildFromEvents = (events: UiEvent[]) => {
    const nextRecords = new Map<string, ResponseMessageRecord>();
    const ordered: string[] = [];
    const controls: UiEvent[] = [];
    let sequence = 0;
    for (const event of events) {
      if (event.kind === "message" || event.kind === "error" || event.kind === "end") {
        nextRecords.set(event.id, eventToRecord(event, sequence));
        sequence += 1;
        ordered.push(event.id);
      } else controls.push(event);
    }
    nextSequence = sequence;
    const trimmed = ordered.slice(-retentionLimit);
    const keep = new Set([...trimmed, ...pinnedMessageIds]);
    const nextRetainedRecords = new Map([...nextRecords].filter(([id]) => keep.has(id)));
    for (const id of pinnedMessageIds) {
      if (!nextRetainedRecords.has(id)) {
        const pinnedRecord = records.get(id);
        if (pinnedRecord) nextRetainedRecords.set(id, pinnedRecord);
      }
    }
    const retainedDocumentIds = new Set(
      [...nextRetainedRecords.values()].flatMap((record) => record.documentId ? [record.documentId] : []),
    );
    const released: string[] = [];
    for (const record of records.values()) {
      if (record.documentId && !retainedDocumentIds.has(record.documentId)) released.push(record.documentId);
    }
    if (released.length) releaseDocuments(released);
    records = nextRetainedRecords;
    compatibilityEvents = events.slice(-retentionLimit);
    publish({ orderedMessageIds: trimmed, latestMessageId: findLatestMessageId(trimmed, records), controlEvents: controls });
    performanceStats.setRetainedMessages(nextRetainedRecords.size);
    performanceStats.setPayloadDocuments(retainedDocumentIds.size);
  };

  const setField = <K extends "responseFilter" | "responseSearchScope" | "pendingMessageCount" | "showMessageTopButton">(
    key: K,
    value: StateUpdater<ResponseSnapshot[K]>,
  ) => {
    const current = snapshot[key];
    const next = typeof value === "function" ? (value as (current: ResponseSnapshot[K]) => ResponseSnapshot[K])(current) : value;
    if (Object.is(current, next)) return;
    publish({ [key]: next } as Pick<ResponseSnapshot, K>);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getRecord: (id) => records.get(id),
    getEvents: () => compatibilityEvents,
    getDebugStats: () => ({
      retainedRecords: records.size,
      referencedDocumentIds: countDocumentIds(records),
      compatibilityEvents: compatibilityEvents.length,
    }),
    setEvents(value) {
      const next = typeof value === "function" ? value(compatibilityEvents) : value;
      rebuildFromEvents(next);
    },
    appendEvents,
    appendRecords,
    setResponseFilter: (value) => setField("responseFilter", value),
    setResponseSearchScope: (value) => setField("responseSearchScope", value),
    setPendingMessageCount: (value) => setField("pendingMessageCount", value),
    setShowMessageTopButton: (value) => setField("showMessageTopButton", value),
    setRetentionLimit(limit) {
      const nextLimit = normalizeRetentionLimit(limit);
      if (nextLimit === retentionLimit) return;
      retentionLimit = nextLimit;
      const ordered = [...snapshot.orderedMessageIds];
      const evicted = ordered.length > retentionLimit ? ordered.splice(0, ordered.length - retentionLimit) : [];
      const released: string[] = [];
      const nextRecords = new Map(records);
      for (const id of evicted) {
        if (pinnedMessageIds.has(id)) continue;
        const record = nextRecords.get(id);
        if (record?.documentId) released.push(record.documentId);
        nextRecords.delete(id);
      }
      if (released.length) releaseDocuments(released);
      records = nextRecords;
      compatibilityEvents = compatibilityEvents.slice(-retentionLimit);
      publish({ orderedMessageIds: ordered, latestMessageId: findLatestMessageId(ordered, records), retentionLimit });
      performanceStats.setRetainedMessages(records.size);
      performanceStats.setPayloadDocuments(countDocumentIds(records));
    },
    setPinnedMessageIds(ids) {
      const nextPinnedIds = new Set(ids.filter((id) => records.has(id)));
      const activeIds = new Set(snapshot.orderedMessageIds);
      const released: string[] = [];
      const nextRecords = new Map(records);
      for (const id of pinnedMessageIds) {
        if (nextPinnedIds.has(id) || activeIds.has(id)) continue;
        const record = nextRecords.get(id);
        if (record?.documentId) released.push(record.documentId);
        nextRecords.delete(id);
      }
      pinnedMessageIds = nextPinnedIds;
      records = nextRecords;
      if (released.length) releaseDocuments(released);
      performanceStats.setRetainedMessages(records.size);
      performanceStats.setPayloadDocuments(countDocumentIds(records));
    },
    reset() {
      const ids = [...records.values()].flatMap((record) => record.documentId ? [record.documentId] : []);
      if (ids.length) releaseDocuments(ids);
      records = new Map(); compatibilityEvents = []; nextSequence = 0; retentionLimit = DEFAULT_MAX_MESSAGES; pinnedMessageIds = new Set();
      snapshot = { orderedMessageIds: [], latestMessageId: undefined, version: snapshot.version + 1, responseFilter: "", responseSearchScope: "current", pendingMessageCount: 0, showMessageTopButton: false, retentionLimit: DEFAULT_MAX_MESSAGES, controlEvents: [] };
      performanceStats.setRetainedMessages(0);
      performanceStats.setPayloadDocuments(0);
      notifyListeners();
    },
  };
}


function normalizeRetentionLimit(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_MAX_MESSAGES;
  return Math.max(1, Math.floor(numeric));
}

function countDocumentIds(source: ReadonlyMap<string, ResponseMessageRecord>): number {
  const ids = new Set<string>();
  for (const record of source.values()) if (record.documentId) ids.add(record.documentId);
  return ids.size;
}

function eventToRecord(event: UiEvent, sequence: number): ResponseMessageRecord {
  return {
    id: event.id,
    sequence,
    kind: event.kind === "message" || event.kind === "error" || event.kind === "end" ? event.kind : "message",
    title: event.title,
    timestamp: event.timestamp,
    preview: typeof event.payload === "string" ? event.payload : safePreview(event.payload),
    documentId: event.documentId,
    originalChars: event.payloadOriginalChars,
  };
}

function findLatestMessageId(
  orderedIds: readonly string[],
  source: ReadonlyMap<string, ResponseMessageRecord>,
): string | undefined {
  for (let index = orderedIds.length - 1; index >= 0; index -= 1) {
    const id = orderedIds[index];
    if (source.get(id)?.kind === "message") return id;
  }
  return undefined;
}

function safePreview(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
