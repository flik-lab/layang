"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { GrpcEvent } from "@/lib/types";
import { maxRetainedMessagesPerRequest } from "../../shared/workbench-constants";
import type { UiEvent } from "../../shared/workbench-types";
import { payloadDocumentService } from "../response-viewer/payload-document/payloadDocument.service";
import { eventToUiEvent, writeConsoleLog } from "./request-result-utils";
import { getWorkbenchSideSection, subscribeWorkbenchSideSection } from "../shell/workbench-navigation-store";
import { performanceStats } from "../../shared/performance/performance-stats.store";
import { responseSessionRegistry } from "../response-viewer/model/responseSessionRegistry";
import { transportLifecycleStore } from "../response-viewer/model/transportLifecycle.store";

type LiveSessionEventsScope = {
  activeRequestIdRef: MutableRefObject<string>;
};

type QueuedGrpcEvent = {
  sequence: number;
  event: GrpcEvent;
};

type PendingSessionIngestion = {
  messages: QueuedGrpcEvent[];
  controls: QueuedGrpcEvent[];
  nextSequence: number;
  draining: boolean;
  drainPromise: Promise<void> | null;
  coalescedMessageCount: number;
};

const LIVE_EVENT_FLUSH_MS = 48;
const LARGE_PAYLOAD_UI_FLUSH_MS = 160;
const largePayloadUiThresholdChars = 100_000;
const unboundActiveQueueKey = "__active__";

// A producer can emit messages faster than the response preview worker can compact
// them. Keep only a small pending window; the transport result still retains the
// bounded recent message window and reconciles it when the request completes.
const MAX_PENDING_MESSAGE_EVENTS_PER_SESSION = 8;
const MAX_FINAL_MESSAGE_EVENTS = maxRetainedMessagesPerRequest;
const MAX_DEFERRED_MESSAGE_EVENTS_PER_SESSION = maxRetainedMessagesPerRequest;

// large full payloads live in the bounded external cache; React/session state keeps metadata only.

export function useLiveSessionEvents(scope: LiveSessionEventsScope) {
  const { activeRequestIdRef } = scope;
  const pendingEventsRef = useRef(new Map<string, UiEvent[]>());
  const ingestionQueuesRef = useRef(new Map<string, PendingSessionIngestion>());
  const deferredEventsRef = useRef(new Map<string, GrpcEvent[]>());
  const flushTimerRef = useRef<number | null>(null);
  const disposedRef = useRef(false);

  const flushPendingEvents = useCallback((_urgent = false) => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (pendingEventsRef.current.size === 0) return;

    const pending = pendingEventsRef.current;
    pendingEventsRef.current = new Map<string, UiEvent[]>();
    const activeRequestId = activeRequestIdRef.current;

    for (const [queuedSessionId, queuedEvents] of pending.entries()) {
      if (!queuedEvents.length) continue;
      const targetSessionId = queuedSessionId === unboundActiveQueueKey ? activeRequestId : queuedSessionId;
      if (!targetSessionId) continue;
      responseSessionRegistry.getOrCreate(targetSessionId).store.appendEvents(queuedEvents);
      performanceStats.recordUiCommitted(queuedEvents.length);
    }
  }, [activeRequestIdRef]);

  const scheduleFlush = useCallback((delayMs = LIVE_EVENT_FLUSH_MS) => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(() => flushPendingEvents(false), delayMs);
  }, [flushPendingEvents]);

  const appendPendingUiEvent = useCallback(
    (targetSessionId: string, uiEvent: UiEvent, urgent = false) => {
      if (disposedRef.current) return;
      const existing = pendingEventsRef.current.get(targetSessionId);
      if (existing) existing.push(uiEvent);
      else pendingEventsRef.current.set(targetSessionId, [uiEvent]);

      if (urgent) {
        flushPendingEvents(true);
        return;
      }

      const originalChars = uiEvent.payloadOriginalChars ?? 0;
      scheduleFlush(originalChars >= largePayloadUiThresholdChars ? LARGE_PAYLOAD_UI_FLUSH_MS : LIVE_EVENT_FLUSH_MS);
    },
    [flushPendingEvents, scheduleFlush],
  );

  const drainSessionQueue = useCallback(
    async (targetSessionId: string, pending: PendingSessionIngestion): Promise<void> => {
      pending.draining = true;
      try {
        while (!disposedRef.current) {
          const queued = takeNextQueuedEvent(pending);
          if (!queued) break;

          const uiEvent = await prepareGrpcEventForResponse(queued.event);
          if (queued.event.type === "message") performanceStats.recordStreamProcessed(uiEvent.payloadOriginalChars ?? 0);
          appendPendingUiEvent(targetSessionId, uiEvent, queued.event.type === "error");
          updateIngestionQueueStats(ingestionQueuesRef.current);
        }

        if (!disposedRef.current && pending.coalescedMessageCount > 0) {
          const skipped = pending.coalescedMessageCount;
          pending.coalescedMessageCount = 0;
          performanceStats.recordCoalesced(skipped);
          appendPendingUiEvent(
            targetSessionId,
            eventToUiEvent({
              type: "log",
              level: "warn",
              message: `Viewer coalesced ${skipped} intermediate message preview${skipped === 1 ? "" : "s"}.`,
              details: {
                skippedPreviews: skipped,
                pendingMessageLimit: MAX_PENDING_MESSAGE_EVENTS_PER_SESSION,
                note: "The completed response still reconciles the retained recent message window.",
              },
            }),
          );
        }
      } finally {
        pending.draining = false;
      }
    },
    [appendPendingUiEvent],
  );

  const startSessionDrain = useCallback(
    (targetSessionId: string, pending: PendingSessionIngestion) => {
      if (pending.draining) return;
      const drainPromise = drainSessionQueue(targetSessionId, pending).finally(() => {
        if (pending.drainPromise === drainPromise) pending.drainPromise = null;
        if (
          !pending.draining &&
          pending.messages.length === 0 &&
          pending.controls.length === 0 &&
          pending.coalescedMessageCount === 0 &&
          ingestionQueuesRef.current.get(targetSessionId) === pending
        ) {
          ingestionQueuesRef.current.delete(targetSessionId);
          updateIngestionQueueStats(ingestionQueuesRef.current);
        }
      });
      pending.drainPromise = drainPromise;
      void drainPromise.catch((error: unknown) => {
        appendPendingUiEvent(
          targetSessionId,
          eventToUiEvent({
            type: "error",
            message: "Failed to prepare a streamed response event for display.",
            details: error instanceof Error ? { name: error.name, message: error.message } : error,
          }),
          true,
        );
      });
    },
    [appendPendingUiEvent, drainSessionQueue],
  );

  const flushDeferredEvents = useCallback(() => {
    if (getWorkbenchSideSection() !== "collections" || deferredEventsRef.current.size === 0) return;
    const deferred = deferredEventsRef.current;
    deferredEventsRef.current = new Map<string, GrpcEvent[]>();
    performanceStats.setDeferredBacklog(0);
    for (const [targetSessionId, events] of deferred.entries()) {
      if (!events.length) continue;
      const pending = getOrCreateSessionIngestion(ingestionQueuesRef.current, targetSessionId);
      for (const event of events) enqueueSessionEvent(pending, event);
      updateIngestionQueueStats(ingestionQueuesRef.current);
      startSessionDrain(targetSessionId, pending);
    }
  }, [startSessionDrain]);

  const appendLiveEventToSession = useCallback(
    (sessionId: string, event: GrpcEvent) => {
      writeConsoleLog(event);

      if (event.type === "log" || event.type === "end") return;
      if (event.type === "message") performanceStats.recordStreamIncoming();

      const targetSessionId = sessionId || activeRequestIdRef.current || unboundActiveQueueKey;
      if (isUtilityMetadataMessage(event)) {
        const uiEvent = eventToUiEvent(event);
        performanceStats.recordStreamProcessed(uiEvent.payloadOriginalChars ?? 0);
        appendPendingUiEvent(targetSessionId, uiEvent);
        return;
      }

      const sideSection = getWorkbenchSideSection();
      if (event.type === "message" && sideSection !== "collections") {
        const current = deferredEventsRef.current.get(targetSessionId) ?? [];
        deferredEventsRef.current.set(targetSessionId, appendDeferredGrpcEvent(current, event));
        updateDeferredBacklogStats(deferredEventsRef.current);
        return;
      }

      const pending = getOrCreateSessionIngestion(ingestionQueuesRef.current, targetSessionId);
      enqueueSessionEvent(pending, event);
      updateIngestionQueueStats(ingestionQueuesRef.current);
      startSessionDrain(targetSessionId, pending);
    },
    [activeRequestIdRef, appendPendingUiEvent, startSessionDrain],
  );

  const compactUiEventsForResponse = useCallback(
    async (sessionId: string, events: UiEvent[]): Promise<UiEvent[]> => {
      const targetSessionId = sessionId || activeRequestIdRef.current || unboundActiveQueueKey;
      const pending = ingestionQueuesRef.current.get(targetSessionId);
      await pending?.drainPromise?.catch(() => undefined);

      // The complete result supersedes any live preview rows that have not yet
      // reached React state. Dropping those queued rows prevents a late timer from
      // appending duplicates after the final response is committed.
      pendingEventsRef.current.delete(targetSessionId);
      deferredEventsRef.current.delete(targetSessionId);
      updateDeferredBacklogStats(deferredEventsRef.current);

      const messageEvents = events.filter((event) => event.kind === "message");
      const retainedMessageIds = new Set(
        messageEvents.slice(-MAX_FINAL_MESSAGE_EVENTS).map((event) => event.id),
      );
      const boundedEvents = events.filter(
        (event) => event.kind !== "message" || retainedMessageIds.has(event.id),
      );
      const prepared: UiEvent[] = [];
      for (const event of boundedEvents) prepared.push(await prepareUiEventForDocumentStore(event));
      return prepared;
    },
    [activeRequestIdRef],
  );

  useEffect(() => {
    disposedRef.current = false;
    const clearTransientQueues = (): void => {
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      pendingEventsRef.current.clear();
      ingestionQueuesRef.current.clear();
      deferredEventsRef.current.clear();
      performanceStats.setDeferredBacklog(0);
      performanceStats.setIngestionQueue(0);
      transportLifecycleStore.reset();
    };
    const unsubscribeNavigation = subscribeWorkbenchSideSection(() => {
      if (getWorkbenchSideSection() !== "collections") return;
      queueMicrotask(flushDeferredEvents);
    });
    const unsubscribeRuntime = window.electronRuntime?.mode === "utility"
      ? window.electronRuntime.onEvent((runtimeEvent) => {
          if (runtimeEvent.event === "runtime.unavailable") {
            transportLifecycleStore.reset();
            return;
          }
          if (runtimeEvent.event !== "runtime.generationChanged") return;
          clearTransientQueues();
          responseSessionRegistry.clear();
        })
      : undefined;
    return () => {
      unsubscribeNavigation();
      unsubscribeRuntime?.();
      disposedRef.current = true;
      clearTransientQueues();
    };
  }, [flushDeferredEvents]);

  return { appendLiveEventToSession, compactUiEventsForResponse };
}



function isUtilityMetadataMessage(event: GrpcEvent): boolean {
  return (
    typeof window !== "undefined"
    && window.electronRuntime?.mode === "utility"
    && event.type === "message"
    && "documentRef" in event
    && Boolean(event.documentRef)
  );
}

function updateDeferredBacklogStats(deferred: Map<string, GrpcEvent[]>): void {
  if (!performanceStats.isEnabled()) return;
  let count = 0;
  for (const events of deferred.values()) count += events.length;
  performanceStats.setDeferredBacklog(count);
  transportLifecycleStore.setDeferredEventCount(count);
}

function updateIngestionQueueStats(queues: Map<string, PendingSessionIngestion>): void {
  if (!performanceStats.isEnabled()) return;
  let count = 0;
  for (const queue of queues.values()) count += queue.messages.length + queue.controls.length;
  performanceStats.setIngestionQueue(count);
  transportLifecycleStore.setIngestionQueueDepth(count);
}

async function prepareGrpcEventForResponse(event: GrpcEvent): Promise<UiEvent> {
  const uiEvent = eventToUiEvent(event);
  if (event.type !== "message" || ("documentRef" in event && event.documentRef)) return uiEvent;
  const documentRef = await payloadDocumentService.registerValue(`response:${uiEvent.id}`, event.value);
  return {
    ...uiEvent,
    payload: documentRef.preview,
    documentId: documentRef.id,
    payloadOriginalChars: documentRef.originalChars,
  };
}

async function prepareUiEventForDocumentStore(event: UiEvent): Promise<UiEvent> {
  if (event.kind !== "message" || event.documentId) return event;
  const documentRef = await payloadDocumentService.registerValue(`response:${event.id}`, event.payload);
  return { ...event, payload: documentRef.preview, documentId: documentRef.id, payloadOriginalChars: documentRef.originalChars };
}


function appendDeferredGrpcEvent(events: GrpcEvent[], event: GrpcEvent): GrpcEvent[] {
  events.push(event);
  if (events.length > MAX_DEFERRED_MESSAGE_EVENTS_PER_SESSION) {
    events.splice(0, events.length - MAX_DEFERRED_MESSAGE_EVENTS_PER_SESSION);
  }
  return events;
}

function getOrCreateSessionIngestion(
  queues: Map<string, PendingSessionIngestion>,
  targetSessionId: string,
): PendingSessionIngestion {
  const existing = queues.get(targetSessionId);
  if (existing) return existing;

  const created: PendingSessionIngestion = {
    messages: [],
    controls: [],
    nextSequence: 0,
    draining: false,
    drainPromise: null,
    coalescedMessageCount: 0,
  };
  queues.set(targetSessionId, created);
  return created;
}

function enqueueSessionEvent(pending: PendingSessionIngestion, grpcEvent: GrpcEvent): void {
  const event: QueuedGrpcEvent = { sequence: pending.nextSequence, event: grpcEvent };
  pending.nextSequence += 1;

  if (grpcEvent.type === "message") {
    if (pending.messages.length >= MAX_PENDING_MESSAGE_EVENTS_PER_SESSION) {
      pending.messages[pending.messages.length - 1] = event;
      pending.coalescedMessageCount += 1;
    } else {
      pending.messages.push(event);
    }
    return;
  }

  pending.controls.push(event);
}

function takeNextQueuedEvent(pending: PendingSessionIngestion): QueuedGrpcEvent | null {
  const nextMessage = pending.messages[0];
  const nextControl = pending.controls[0];
  if (!nextMessage && !nextControl) return null;
  if (!nextControl || (nextMessage && nextMessage.sequence < nextControl.sequence)) {
    return pending.messages.shift() ?? null;
  }
  return pending.controls.shift() ?? null;
}

