"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import type { AssertionResult, HistoryItem } from "../../shared/workbench-types";
import type { GrpcResult } from "@/lib/types";
import type { ResponseStore } from "./model/response.store";
import { responseSessionRegistry } from "./model/responseSessionRegistry";
import { summarizeGrpcResult } from "./model/responseResult.types";

function resolveStateUpdate<T>(current: T, value: SetStateAction<T>): T {
  return typeof value === "function" ? (value as (current: T) => T)(current) : value;
}

export function useResponseController(responseSessionId: string) {
  const runtime = responseSessionRegistry.getOrCreate(responseSessionId || "__unbound__");
  const responseStreamStore = runtime.store;

  // These remain low-frequency control-plane compatibility values for docs/export
  // paths. Hot message/runtime state is owned exclusively by the session registry.
  const [lastResultState, setLastResultState] = useState<GrpcResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [assertionResultsState, setAssertionResultsState] = useState<AssertionResult[]>([]);
  const lastResultRef = useRef<GrpcResult | null>(null);
  const assertionResultsRef = useRef<AssertionResult[]>([]);
  const responseBodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nextAssertions = [...runtime.getSnapshot().assertionResults];
    lastResultRef.current = null;
    assertionResultsRef.current = nextAssertions;
    setLastResultState(null);
    setAssertionResultsState(nextAssertions);
  }, [responseSessionId, runtime]);

  const setLastResult = useCallback((value: SetStateAction<GrpcResult | null>) => {
    const next = resolveStateUpdate(lastResultRef.current, value);
    lastResultRef.current = next;
    runtime.setResultSummary(next ? summarizeGrpcResult(next) : null);
    setLastResultState(next);
  }, [runtime]);

  const setAssertionResults = useCallback((value: SetStateAction<AssertionResult[]>) => {
    const next = resolveStateUpdate(assertionResultsRef.current, value);
    assertionResultsRef.current = next;
    runtime.setAssertionResults(next);
    setAssertionResultsState(next);
  }, [runtime]);

  const setEvents = useCallback<ResponseStore["setEvents"]>(
    (value: Parameters<ResponseStore["setEvents"]>[0]) => responseStreamStore.setEvents(value),
    [responseStreamStore],
  );
  const setResponseFilter = useCallback<ResponseStore["setResponseFilter"]>(
    (value: Parameters<ResponseStore["setResponseFilter"]>[0]) => responseStreamStore.setResponseFilter(value),
    [responseStreamStore],
  );
  const setResponseSearchScope = useCallback<ResponseStore["setResponseSearchScope"]>(
    (value: Parameters<ResponseStore["setResponseSearchScope"]>[0]) => responseStreamStore.setResponseSearchScope(value),
    [responseStreamStore],
  );
  const setPendingMessageCount = useCallback<ResponseStore["setPendingMessageCount"]>(
    (value: Parameters<ResponseStore["setPendingMessageCount"]>[0]) => responseStreamStore.setPendingMessageCount(value),
    [responseStreamStore],
  );
  const setShowMessageTopButton = useCallback<ResponseStore["setShowMessageTopButton"]>(
    (value: Parameters<ResponseStore["setShowMessageTopButton"]>[0]) => responseStreamStore.setShowMessageTopButton(value),
    [responseStreamStore],
  );
  const getResponseEvents = useCallback(() => responseStreamStore.getEvents(), [responseStreamStore]);

  return {
    getResponseEvents,
    setEvents,
    lastResult: lastResultState,
    setLastResult,
    history,
    setHistory,
    assertionResults: assertionResultsState,
    setAssertionResults,
    setResponseFilter,
    setResponseSearchScope,
    setPendingMessageCount,
    responseBodyRef,
    setShowMessageTopButton,
  };
}
