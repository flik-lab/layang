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
            events: appendLimitedUiEvent(session.events ?? [], uiEvent),
            updatedAt: new Date().toISOString(),
          };
        }),
      );
    }

    if (isActiveSession) {
      setEvents((current) => appendLimitedUiEvent(current, uiEvent));
    }
  }

  return { appendLiveEventToSession };
}
