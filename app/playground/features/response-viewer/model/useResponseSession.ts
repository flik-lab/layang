"use client";

import { useSyncExternalStore } from "react";
import { responseSessionRegistry, type ResponseSessionRuntime, type ResponseSessionRuntimeSnapshot } from "./responseSessionRegistry";

const EMPTY_SNAPSHOT: ResponseSessionRuntimeSnapshot = { resultSummary: null, assertionResults: [], version: 0 };

export function getResponseSessionRuntime(sessionId: string): ResponseSessionRuntime {
  return responseSessionRegistry.getOrCreate(sessionId);
}

export function useResponseSessionRuntime(sessionId: string): ResponseSessionRuntime {
  return responseSessionRegistry.getOrCreate(sessionId);
}

export function useResponseSessionSnapshot(sessionId: string): ResponseSessionRuntimeSnapshot {
  const runtime = responseSessionRegistry.get(sessionId);
  return useSyncExternalStore(
    runtime?.subscribe ?? (() => () => undefined),
    runtime?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
    runtime?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
  );
}
