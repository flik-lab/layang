"use client";

import { useCallback, useEffect, useRef } from "react";
import type { WorkbenchViewContext } from "../shell/use-workbench-container-model";
import type { AssertionResult, UiEvent } from "../../shared/workbench-types";
import type { RequestResultSummary } from "../response-viewer/model/responseResult.types";
import { responseSessionRegistry } from "../response-viewer/model/responseSessionRegistry";
import { payloadDocumentService } from "../response-viewer/payload-document/payloadDocument.service";

const RESPONSE_SNAPSHOT_TOPIC = "response:snapshot";
const RESPONSE_SNAPSHOT_REQUEST_TOPIC = "response:request-snapshot";

type MirroredResponseDocument = {
  id: string;
  text: string;
  preview: string;
  originalChars: number;
};

type ResponseSnapshotPayload = {
  requestId: string;
  responseSessionId: string;
  sourceWindowId: number;
  sequence: number;
  events: UiEvent[];
  documents?: MirroredResponseDocument[];
  resultSummary: RequestResultSummary | null;
  assertionResults: readonly AssertionResult[];
};

const MAX_MIRRORED_DOCUMENT_CHARS = 4_000_000;

function responseSessionIdFor(session: { id: string; responseSessionId?: string }) {
  return session.responseSessionId || session.id;
}

function responsePreview(payload: unknown) {
  if (typeof payload === "string") return payload.slice(0, 4_000);
  try { return JSON.stringify(payload).slice(0, 4_000); } catch { return String(payload).slice(0, 4_000); }
}

async function createMirroredSnapshot(
  requestId: string,
  responseSessionId: string,
  sourceWindowId: number,
  sequence: number,
  knownDocuments?: Set<string>,
): Promise<ResponseSnapshotPayload> {
  const runtime = responseSessionRegistry.getOrCreate(responseSessionId);
  const snapshot = runtime.getSnapshot();
  const events = runtime.store.getEvents();
  const activeDocumentIds = new Set(events.map((event) => event.documentId).filter((id): id is string => Boolean(id)));
  if (knownDocuments) {
    for (const documentId of knownDocuments) {
      if (!activeDocumentIds.has(documentId)) knownDocuments.delete(documentId);
    }
  }
  const documents: MirroredResponseDocument[] = [];
  const mirroredEvents = await Promise.all(events.map(async (event) => {
    if (!event.documentId) return event;
    const originalDocumentId = event.documentId;
    const mirroredId = `window-mirror:${sourceWindowId}:${requestId}:${event.id}`;
    const originalChars = event.payloadOriginalChars ?? 0;
    if (originalChars > MAX_MIRRORED_DOCUMENT_CHARS) return { ...event, documentId: undefined };
    if (knownDocuments?.has(originalDocumentId)) return { ...event, documentId: mirroredId };
    try {
      const text = await payloadDocumentService.getText(originalDocumentId, "pretty");
      if (typeof text !== "string" || text.length > MAX_MIRRORED_DOCUMENT_CHARS) {
        return { ...event, documentId: undefined };
      }
      documents.push({
        id: mirroredId,
        text,
        preview: responsePreview(event.payload),
        originalChars: event.payloadOriginalChars ?? text.length,
      });
      knownDocuments?.add(originalDocumentId);
      return { ...event, documentId: mirroredId };
    } catch {
      return { ...event, documentId: undefined };
    }
  }));
  return {
    requestId,
    responseSessionId,
    sourceWindowId,
    sequence,
    events: mirroredEvents,
    documents,
    resultSummary: snapshot.resultSummary,
    assertionResults: [...snapshot.assertionResults],
  };
}

async function applyMirroredSnapshot(payload: ResponseSnapshotPayload, isCurrent: () => boolean) {
  for (const document of payload.documents ?? []) {
    const bytes = new TextEncoder().encode(document.text);
    await payloadDocumentService.registerUtf8(
      document.id,
      bytes.buffer,
      document.preview,
      document.originalChars,
    ).catch(() => undefined);
  }
  if (!isCurrent()) return;
  const runtime = responseSessionRegistry.getOrCreate(payload.responseSessionId);
  runtime.store.setEvents(Array.isArray(payload.events) ? payload.events : []);
  runtime.setResultSummary(payload.resultSummary ?? null);
  runtime.setAssertionResults(Array.isArray(payload.assertionResults) ? payload.assertionResults : []);
}

export function useResponseWindowSync(ctx: WorkbenchViewContext) {
  const managedWindow = ctx.managedWindow;
  const publishSequenceRef = useRef(new Map<string, number>());
  const publishInFlightRef = useRef(new Set<string>());
  const publishAgainRef = useRef(new Set<string>());
  const knownDocumentsRef = useRef(new Map<string, Set<string>>());
  const latestAppliedSequenceRef = useRef(new Map<string, number>());

  const publishSnapshot = useCallback(async (requestId: string) => {
    if (publishInFlightRef.current.has(requestId)) {
      publishAgainRef.current.add(requestId);
      return;
    }

    const session = ctx.requestSessions.find((item) => item.id === requestId);
    if (!session || !window.electronWindow?.broadcast) return;
    const responseSessionId = responseSessionIdFor(session);
    const sourceWindowId = managedWindow.context.windowId ?? 0;
    const sequence = (publishSequenceRef.current.get(requestId) ?? 0) + 1;
    publishSequenceRef.current.set(requestId, sequence);
    let knownDocuments = knownDocumentsRef.current.get(requestId);
    if (!knownDocuments) {
      knownDocuments = new Set<string>();
      knownDocumentsRef.current.set(requestId, knownDocuments);
    }

    publishInFlightRef.current.add(requestId);
    try {
      const payload = await createMirroredSnapshot(
        requestId,
        responseSessionId,
        sourceWindowId,
        sequence,
        knownDocuments,
      );
      await window.electronWindow.broadcast(RESPONSE_SNAPSHOT_TOPIC, payload);
    } finally {
      publishInFlightRef.current.delete(requestId);
      if (publishAgainRef.current.delete(requestId)) {
        void Promise.resolve().then(() => publishSnapshot(requestId));
      }
    }
  }, [ctx.requestSessions, managedWindow.context.windowId]);

  useEffect(() => {
    if (!window.electronWindow?.onEvent) return;
    return window.electronWindow.onEvent((event) => {
      if (event.topic !== RESPONSE_SNAPSHOT_TOPIC) return;
      const payload = event.payload as ResponseSnapshotPayload | undefined;
      if (!payload?.requestId || !payload.responseSessionId) return;
      const context = managedWindow.context;
      if (context.kind !== "response" || context.resourceId !== payload.requestId) return;

      const sourceWindowId = Number(payload.sourceWindowId || event.sourceWindowId || 0);
      const sequence = Math.max(0, Math.floor(Number(payload.sequence) || 0));
      const key = `${sourceWindowId}:${payload.requestId}:${payload.responseSessionId}`;
      const previous = latestAppliedSequenceRef.current.get(key) ?? 0;
      if (sequence > 0 && sequence <= previous) return;
      if (sequence > 0) latestAppliedSequenceRef.current.set(key, sequence);
      const isCurrent = () => sequence <= 0 || latestAppliedSequenceRef.current.get(key) === sequence;
      void applyMirroredSnapshot(payload, isCurrent);
    });
  }, [managedWindow.context]);

  useEffect(() => {
    const context = managedWindow.context;
    if (context.kind !== "response" || !context.resourceId) return;
    void window.electronWindow?.broadcast?.(RESPONSE_SNAPSHOT_REQUEST_TOPIC, { requestId: context.resourceId });
  }, [managedWindow.context.kind, managedWindow.context.resourceId]);

  useEffect(() => {
    if (!window.electronWindow?.broadcast) return;
    const context = managedWindow.context;
    const subscriptions: Array<() => void> = [];
    let timer: number | null = null;
    const pending = new Set<string>();

    const flush = () => {
      timer = null;
      for (const requestId of pending) void publishSnapshot(requestId);
      pending.clear();
    };

    const schedule = (requestId: string) => {
      pending.add(requestId);
      if (timer !== null) return;
      timer = window.setTimeout(flush, 80);
    };

    const unsubscribeEvents = window.electronWindow.onEvent?.((event) => {
      if (event.topic !== RESPONSE_SNAPSHOT_REQUEST_TOPIC) return;
      const payload = event.payload as { requestId?: string } | undefined;
      const requestId = payload?.requestId || "";
      if (!requestId) return;
      const requestDetached = managedWindow.detachedByKey.has(`request:${requestId}`);
      const ownsRequest = requestDetached
        ? context.kind === "request" && context.resourceId === requestId
        : context.kind === "main";
      if (ownsRequest) void publishSnapshot(requestId);
    });
    if (unsubscribeEvents) subscriptions.push(unsubscribeEvents);

    const activeResponseRequestIds = new Set<string>();
    for (const detached of managedWindow.windows) {
      if (detached.kind !== "response" || !detached.resourceId) continue;
      const requestId = detached.resourceId;
      const requestDetached = managedWindow.detachedByKey.has(`request:${requestId}`);
      const ownsRequest = requestDetached
        ? context.kind === "request" && context.resourceId === requestId
        : context.kind === "main";
      if (!ownsRequest) continue;
      const session = ctx.requestSessions.find((item) => item.id === requestId);
      if (!session) continue;
      activeResponseRequestIds.add(requestId);
      const runtime = responseSessionRegistry.getOrCreate(responseSessionIdFor(session));
      const notify = () => schedule(requestId);
      subscriptions.push(runtime.store.subscribe(notify), runtime.subscribe(notify));
      schedule(requestId);
    }

    for (const requestId of knownDocumentsRef.current.keys()) {
      if (!activeResponseRequestIds.has(requestId)) knownDocumentsRef.current.delete(requestId);
    }

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      subscriptions.forEach((unsubscribe) => {
        unsubscribe();
      });
    };
  }, [ctx.requestSessions, managedWindow.windows, managedWindow.context, managedWindow.detachedByKey, publishSnapshot]);
}
