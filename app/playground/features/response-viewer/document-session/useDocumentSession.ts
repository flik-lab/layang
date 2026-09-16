"use client";

import { useEffect, useReducer, useRef } from "react";
import { payloadDocumentService } from "../payload-document/payloadDocument.service";
import { PAYLOAD_DOCUMENT_INITIAL_VIEWPORT_LINES } from "../payload-document/payloadDocumentRuntime";
import { documentHydrationScheduler } from "./documentHydrationScheduler";
import { createDocumentSessionState, documentSessionReducer } from "./documentSession.reducer";
import type {
  CommittedDocument,
  DocumentHydrationPriority,
  DocumentSessionState,
  DocumentSessionTarget,
  DocumentSwitchStrategy,
} from "./documentSession.types";

type UseDocumentSessionOptions = {
  sessionId: string;
  target?: DocumentSessionTarget;
  strategy: DocumentSwitchStrategy;
  priority: DocumentHydrationPriority;
  minStartIntervalMs?: number;
};

type UseDocumentSessionReturn = {
  state: DocumentSessionState;
  committed?: CommittedDocument;
  isPreparing: boolean;
};

export function useDocumentSession({
  sessionId,
  target,
  strategy,
  priority,
  minStartIntervalMs = 0,
}: UseDocumentSessionOptions): UseDocumentSessionReturn {
  const [state, dispatch] = useReducer(documentSessionReducer, undefined, createDocumentSessionState);
  const generationRef = useRef(0);
  const committedDocumentIdRef = useRef<string | undefined>(undefined);
  const committedMessageIdRef = useRef<string | undefined>(undefined);
  const pendingDocumentIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!target?.documentId) {
      generationRef.current += 1;
      if (pendingDocumentIdRef.current) payloadDocumentService.unpin(pendingDocumentIdRef.current);
      if (committedDocumentIdRef.current) payloadDocumentService.unpin(committedDocumentIdRef.current);
      pendingDocumentIdRef.current = undefined;
      committedDocumentIdRef.current = undefined;
      committedMessageIdRef.current = undefined;
      dispatch({ type: "clear" });
      return;
    }

    if (
      committedDocumentIdRef.current === target.documentId
      && committedMessageIdRef.current === target.messageId
    ) return;

    generationRef.current += 1;
    const generation = generationRef.current;
    const requestedTarget: DocumentSessionTarget = {
      messageId: target.messageId,
      documentId: target.documentId,
      sequence: target.sequence,
    };

    if (pendingDocumentIdRef.current && pendingDocumentIdRef.current !== committedDocumentIdRef.current) {
      payloadDocumentService.unpin(pendingDocumentIdRef.current);
    }
    payloadDocumentService.pin(requestedTarget.documentId);
    pendingDocumentIdRef.current = requestedTarget.documentId;
    dispatch({ type: "request", target: requestedTarget, generation });

    void documentHydrationScheduler.schedule({
      sessionId,
      generation,
      documentId: requestedTarget.documentId,
      priority,
      strategy,
      minStartIntervalMs,
      run: () => payloadDocumentService.prepareWindow(
        requestedTarget.documentId,
        0,
        PAYLOAD_DOCUMENT_INITIAL_VIEWPORT_LINES,
      ),
    }).then((preparedWindow) => {
      if (generationRef.current !== generation) return;
      if (!preparedWindow) {
        if (pendingDocumentIdRef.current === requestedTarget.documentId) {
          payloadDocumentService.unpin(requestedTarget.documentId);
          pendingDocumentIdRef.current = undefined;
        }
        dispatch({ type: "failed", target: requestedTarget, generation, error: "Payload document is unavailable." });
        return;
      }

      const previousCommittedId = committedDocumentIdRef.current;
      committedDocumentIdRef.current = requestedTarget.documentId;
      committedMessageIdRef.current = requestedTarget.messageId;
      pendingDocumentIdRef.current = undefined;
      dispatch({ type: "prepared", target: requestedTarget, generation, preparedWindow });
      if (previousCommittedId) payloadDocumentService.unpin(previousCommittedId);
    }).catch((error: unknown) => {
      if (generationRef.current !== generation) return;
      if (pendingDocumentIdRef.current === requestedTarget.documentId) {
        payloadDocumentService.unpin(requestedTarget.documentId);
        pendingDocumentIdRef.current = undefined;
      }
      dispatch({
        type: "failed",
        target: requestedTarget,
        generation,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, [minStartIntervalMs, priority, sessionId, strategy, target?.documentId, target?.messageId, target?.sequence]);

  useEffect(() => () => {
    generationRef.current += 1;
    const pendingId = pendingDocumentIdRef.current;
    const committedId = committedDocumentIdRef.current;
    if (pendingId) payloadDocumentService.unpin(pendingId);
    if (committedId) payloadDocumentService.unpin(committedId);
    pendingDocumentIdRef.current = undefined;
    committedDocumentIdRef.current = undefined;
    committedMessageIdRef.current = undefined;
  }, []);

  return { state, committed: state.committed, isPreparing: state.status === "preparing" };
}
