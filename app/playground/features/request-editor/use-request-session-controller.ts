import { useRef, useState } from "react";
import type { RequestSession, RequestTab, ResponseTab } from "../../shared/workbench-types";

export function useRequestSessionController() {
  const [requestTab, setRequestTab] = useState<RequestTab>("body");
  const [responseTab, setResponseTab] = useState<ResponseTab>("messages");
  const [requestSessions, setRequestSessions] = useState<RequestSession[]>([]);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [targetDraft, setTargetDraft] = useState("");
  const activeRequestIdRef = useRef("");

  return {
    requestTab,
    setRequestTab,
    responseTab,
    setResponseTab,
    requestSessions,
    setRequestSessions,
    activeRequestId,
    setActiveRequestId,
    activeRequestIdRef,
    targetDraft,
    setTargetDraft,
  };
}
