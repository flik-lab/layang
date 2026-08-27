"use client";

import type { MutableRefObject } from "react";
import type { GrpcEvent } from "@/lib/types";
import type { RequestSession, UiEvent } from "../../shared/workbench-types";
import { appendLimitedUiEvent, compactUiEvent } from "../workspace/workspace-model";
import { eventToUiEvent, writeConsoleLog } from "./request-result-utils";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type LiveSessionEventsScope = {
  activeRequestIdRef: MutableRefObject<string>;
  setEvents: StateSetter<UiEvent[]>;
  setRequestSessions: StateSetter<RequestSession[]>;
};

export function useLiveSessionEvents(scope: LiveSessionEventsScope) {
  const { activeRequestIdRef, setEvents, setRequestSessions } = scope;

  function appendLiveEventToSession(sessionId: string, event: GrpcEvent) {
    writeConsoleLog(event);

    if (event.type === "log" || event.type === "end") {
      return;
    }

    const uiEvent = compactUiEvent(eventToUiEvent(event));
    const isActiveSession = !sessionId || activeRequestIdRef.current === sessionId;

    if (sessionId && !isActiveSession) {
      setRequestSessions((sessions) =>
        sessions.map((session) => {
          if (session.id !== sessionId) return session;
          return {
            ...session,
            events: appendStreamingUiEvent(session.events ?? [], uiEvent),
            updatedAt: new Date().toISOString(),
          };
        }),
      );
    }

    if (isActiveSession) {
      setEvents((current) => appendStreamingUiEvent(current, uiEvent));
    }
  }

  return { appendLiveEventToSession };
}

/** Keeps the full value only for the newest stream message; older rows retain previews. */
function appendStreamingUiEvent(events: UiEvent[], event: UiEvent): UiEvent[] {
  const compactedEvents =
    event.kind === "message"
      ? events.map((item) => {
          if (item.kind !== "message" || item.fullPayload === undefined) return item;
          const { fullPayload: _fullPayload, ...previewOnly } = item;
          return previewOnly;
        })
      : events;
  return appendLimitedUiEvent(compactedEvents, event);
}
