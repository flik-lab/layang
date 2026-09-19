"use client";
import { useCallback, useMemo } from "react";
import { Box, Button, Stack, Typography } from "@/components/shadcn/compat";
import { ContentCopy } from "@/components/shadcn/icons";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import { useDocumentSession } from "../document-session/useDocumentSession";
import type { DocumentSessionTarget } from "../document-session/documentSession.types";
import { JsonDocumentViewer } from "../json-document/JsonDocumentViewer";
import type { ResponseStore } from "../model/response.store";
import { useResponseSelector } from "../model/useResponseSelector";
import { payloadDocumentService } from "../payload-document/payloadDocument.service";
import { PAYLOAD_DOCUMENT_LARGE_LIVE_MIN_HYDRATION_INTERVAL_MS, PAYLOAD_DOCUMENT_LARGE_LIVE_THRESHOLD_CHARS } from "../payload-document/payloadDocumentRuntime";
import { useLatestFollow } from "./useLatestFollow";
import { performanceStats } from "../../../shared/performance/performance-stats.store";

export function LatestResponseViewer({ store, query }: { store: ResponseStore; query: string }) {
  performanceStats.recordRenderInvocation("latestViewer");
  const latestMessageId = useResponseSelector(store, (snapshot) => snapshot.latestMessageId);
  const latestRecord = latestMessageId ? store.getRecord(latestMessageId) : undefined;
  const minTargetIntervalMs = (latestRecord?.originalChars ?? 0) >= PAYLOAD_DOCUMENT_LARGE_LIVE_THRESHOLD_CHARS
    ? PAYLOAD_DOCUMENT_LARGE_LIVE_MIN_HYDRATION_INTERVAL_MS
    : 0;
  const { state, freeze, unfreeze } = useLatestFollow(latestMessageId, { minTargetIntervalMs });
  const targetRecord = state.targetMessageId ? store.getRecord(state.targetMessageId) : undefined;
  const target = useMemo<DocumentSessionTarget | undefined>(() => {
    if (!targetRecord?.documentId) return undefined;
    return {
      messageId: targetRecord.id,
      documentId: targetRecord.documentId,
      sequence: targetRecord.sequence,
    };
  }, [targetRecord?.documentId, targetRecord?.id, targetRecord?.sequence]);
  const minStartIntervalMs = state.mode === "follow" ? minTargetIntervalMs : 0;
  const session = useDocumentSession({
    sessionId: "latest-response",
    target,
    strategy: state.mode === "follow" ? "latest-wins" : "strict",
    priority: state.mode === "follow" ? "latest-visible" : "user-visible",
    minStartIntervalMs,
  });
  const committedMessageId = session.committed?.target.messageId;
  const catchingUp = state.mode === "follow" && Boolean(latestMessageId && latestMessageId !== committedMessageId);

  const copyJson = useCallback(async () => {
    const documentId = session.committed?.target.documentId;
    if (!documentId) return;
    const text = await payloadDocumentService.getText(documentId, "pretty");
    if (text !== undefined) await copyTextWithAnnouncement(text, "Latest response");
  }, [session.committed?.target.documentId]);

  const toggleFreeze = useCallback(() => {
    if (state.mode === "frozen") unfreeze();
    else freeze(session.committed?.target.messageId);
  }, [freeze, session.committed?.target.messageId, state.mode, unfreeze]);

  if (!targetRecord && !session.committed) {
    return <Typography variant="body2" color="text.secondary">Run a request to view the latest response.</Typography>;
  }

  return (
    <Stack spacing={0.8} sx={{ height: "100%", minHeight: 0 }}>
      <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap">
        <Button size="small" variant={state.mode === "frozen" ? "contained" : "outlined"} onClick={toggleFreeze}>
          {state.mode === "frozen" ? "Unfreeze latest" : "Freeze latest"}
        </Button>
        <Button size="small" variant="outlined" startIcon={<ContentCopy />} disabled={!session.committed} onClick={() => void copyJson()}>Copy JSON</Button>
        <Typography variant="caption" color="text.secondary">
          {state.mode === "follow"
            ? catchingUp || session.isPreparing ? "Following latest · preparing newer response" : "Following latest"
            : "Frozen snapshot"}
        </Typography>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {session.committed ? (
          <JsonDocumentViewer
            document={session.committed}
            query={query}
            priority={state.mode === "follow" ? "background" : "interactive"}
          />
        ) : targetRecord?.documentId ? (
          <Box sx={{ height: "100%", minHeight: 0, p: 1 }}>
            <Typography variant="body2" color="text.secondary">Preparing latest response…</Typography>
          </Box>
        ) : (
          <Box sx={{ height: "100%", minHeight: 0, overflow: "auto", p: 1 }}>
            <Typography component="pre" variant="body2" sx={{ m: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{targetRecord?.preview ?? ""}</Typography>
          </Box>
        )}
      </Box>
    </Stack>
  );
}
