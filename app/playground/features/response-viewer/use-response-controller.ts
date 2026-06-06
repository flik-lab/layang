import { useDeferredValue, useRef, useState } from "react";
import type { AssertionResult, HistoryItem, UiEvent } from "../../shared/workbench-types";
import type { GrpcResult } from "@/lib/types";

export function useResponseController() {
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [lastResult, setLastResult] = useState<GrpcResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [assertionResults, setAssertionResults] = useState<AssertionResult[]>([]);
  const [responseFilter, setResponseFilter] = useState("");
  const deferredResponseFilter = useDeferredValue(responseFilter);
  const responseBodyRef = useRef<HTMLDivElement | null>(null);
  const [showMessageTopButton, setShowMessageTopButton] = useState(false);

  return {
    events,
    setEvents,
    lastResult,
    setLastResult,
    history,
    setHistory,
    assertionResults,
    setAssertionResults,
    responseFilter,
    setResponseFilter,
    deferredResponseFilter,
    responseBodyRef,
    showMessageTopButton,
    setShowMessageTopButton,
  };
}
