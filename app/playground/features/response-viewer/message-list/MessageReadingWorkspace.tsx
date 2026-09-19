"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Box, Button, MenuItem, Select, Stack, Typography } from "@/components/shadcn/compat";
import type { DocumentSessionTarget } from "../document-session/documentSession.types";
import { useDocumentSession } from "../document-session/useDocumentSession";
import type { ResponseStore } from "../model/response.store";
import type { ResponseMessageRecord } from "../model/response.types";
import { useResponseSelector } from "../model/useResponseSelector";
import { MessageDetailPane } from "./MessageDetailPane";
import { MessageList } from "./MessageList";
import { performanceStats } from "../../../shared/performance/performance-stats.store";
import { payloadDocumentService } from "../payload-document/payloadDocument.service";

const EMPTY_SUBSCRIBE = (_listener: () => void) => () => undefined;

type MessageRetentionLimit = 5 | 10 | 20 | 50 | 100;
type MessageRetentionLimitChangeEvent = { target: { value: string } };

export const MessageReadingWorkspace = memo(function MessageReadingWorkspace({
  store,
  query,
}: {
  store: ResponseStore;
  query: string;
}) {
  performanceStats.recordRenderInvocation("messageWorkspace");
  const [readingLocked, setReadingLocked] = useState(false);
  const [followingLatest, setFollowingLatest] = useState(true);
  const [messageRetentionLimit, setMessageRetentionLimit] = useState<MessageRetentionLimit>(() => normalizeMessageRetentionLimit(store.getSnapshot().retentionLimit));
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>();
  const [selectedRecord, setSelectedRecord] = useState<ResponseMessageRecord | undefined>();
  const [frozenMessageIds, setFrozenMessageIds] = useState<readonly string[]>([]);
  const latestSequenceRef = useRef(-1);
  const committedRecordRef = useRef<ResponseMessageRecord | undefined>(undefined);
  const frozenDocumentIdsRef = useRef<readonly string[]>([]);

  const subscribe = useCallback(
    (listener: () => void) => readingLocked ? EMPTY_SUBSCRIBE(listener) : store.subscribe(listener),
    [readingLocked, store],
  );
  const getMessageIds = useCallback(
    () => readingLocked ? frozenMessageIds : store.getSnapshot().orderedMessageIds,
    [frozenMessageIds, readingLocked, store],
  );
  const orderedIds = useSyncExternalStore(subscribe, getMessageIds, getMessageIds);
  const selectedOutsideRetention = Boolean(
    !followingLatest && selectedMessageId && selectedRecord && !orderedIds.includes(selectedMessageId),
  );

  useEffect(() => {
    if (readingLocked || !followingLatest) return;
    const newestId = orderedIds.at(-1);
    if (!newestId) {
      setSelectedMessageId(undefined);
      setSelectedRecord(undefined);
      return;
    }
    const newestRecord = store.getRecord(newestId);
    if (!newestRecord) return;
    setSelectedMessageId(newestId);
    setSelectedRecord(newestRecord);
  }, [followingLatest, orderedIds, readingLocked, store]);

  const target = useMemo<DocumentSessionTarget | undefined>(() => {
    if (!selectedRecord?.documentId) return undefined;
    return {
      messageId: selectedRecord.id,
      documentId: selectedRecord.documentId,
      sequence: selectedRecord.sequence,
    };
  }, [selectedRecord?.documentId, selectedRecord?.id, selectedRecord?.sequence]);

  const session = useDocumentSession({
    sessionId: "message-reader",
    target,
    strategy: "strict",
    priority: "user-visible",
  });

  let committedRecord: ResponseMessageRecord | undefined;
  if (session.committed) {
    const committedMessageId = session.committed.target.messageId;
    committedRecord = store.getRecord(committedMessageId)
      ?? (selectedRecord?.id === committedMessageId ? selectedRecord : undefined)
      ?? (committedRecordRef.current?.id === committedMessageId ? committedRecordRef.current : undefined);
    if (committedRecord) committedRecordRef.current = committedRecord;
  }

  const selectMessage = useCallback((id: string) => {
    const record = store.getRecord(id);
    if (!record) return;
    const snapshot = store.getSnapshot();
    const latestId = snapshot.latestMessageId ?? snapshot.orderedMessageIds.at(-1);
    setFollowingLatest(id === latestId);
    setSelectedRecord(record);
    setSelectedMessageId(id);
  }, [store]);

  const clearFrozenPins = useCallback(() => {
    store.setPinnedMessageIds([]);
    for (const documentId of frozenDocumentIdsRef.current) payloadDocumentService.unpin(documentId);
    frozenDocumentIdsRef.current = [];
  }, [store]);

  const releaseFrozenSnapshot = useCallback(() => {
    clearFrozenPins();
    setFrozenMessageIds([]);
  }, [clearFrozenPins]);

  useEffect(() => () => clearFrozenPins(), [clearFrozenPins]);

  const pauseLive = useCallback(() => {
    const snapshot = store.getSnapshot();
    const currentIds = [...snapshot.orderedMessageIds];
    const documentIds = [...new Set(
      currentIds.flatMap((id) => {
        const documentId = store.getRecord(id)?.documentId;
        return documentId ? [documentId] : [];
      }),
    )];
    for (const documentId of documentIds) payloadDocumentService.pin(documentId);
    frozenDocumentIdsRef.current = documentIds;
    store.setPinnedMessageIds(currentIds);

    const currentLatest = snapshot.latestMessageId ? store.getRecord(snapshot.latestMessageId) : undefined;
    latestSequenceRef.current = currentLatest?.sequence ?? selectedRecord?.sequence ?? -1;
    setFrozenMessageIds(currentIds);
    setReadingLocked(true);
  }, [selectedRecord?.sequence, store]);

  const resumeLive = useCallback(() => {
    releaseFrozenSnapshot();
    setFollowingLatest(true);
    setReadingLocked(false);
  }, [releaseFrozenSnapshot]);

  const showLatest = useCallback(() => {
    const snapshot = store.getSnapshot();
    const latestId = snapshot.latestMessageId ?? snapshot.orderedMessageIds.at(-1);
    if (!latestId) return;
    const latestRecord = store.getRecord(latestId);
    if (!latestRecord) return;
    if (readingLocked) {
      releaseFrozenSnapshot();
      setReadingLocked(false);
    }
    setFollowingLatest(true);
    setSelectedMessageId(latestId);
    setSelectedRecord(latestRecord);
  }, [readingLocked, releaseFrozenSnapshot, store]);

  useEffect(() => {
    store.setRetentionLimit(messageRetentionLimit);
    payloadDocumentService.setRetentionLimit(messageRetentionLimit);
  }, [messageRetentionLimit, store]);

  const handleMessageRetentionLimitChange = useCallback((event: MessageRetentionLimitChangeEvent) => {
    const nextLimit = normalizeMessageRetentionLimit(Number.parseInt(event.target.value, 10));
    store.setRetentionLimit(nextLimit);
    payloadDocumentService.setRetentionLimit(nextLimit);
    setMessageRetentionLimit(nextLimit);
  }, [store]);

  if (!orderedIds.length && !selectedRecord && !session.committed) {
    return <Typography variant="body2" color="text.secondary">Run a request to see the response.</Typography>;
  }

  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minHeight: 32, px: 0.7 }}>
        {readingLocked ? (
          <PinnedMessageStatus
            store={store}
            baselineSequence={latestSequenceRef.current}
            onResume={resumeLive}
          />
        ) : (
          <Button size="small" variant="outlined" onClick={pauseLive}>Pause live</Button>
        )}
        <Button size="small" variant="outlined" onClick={showLatest}>Show Latest</Button>
        {selectedOutsideRetention ? (
          <Typography variant="caption" color="text.secondary" noWrap>
            Pinned outside recent {messageRetentionLimit}
          </Typography>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">Show</Typography>
        <Select
          size="small"
          value={messageRetentionLimit}
          onChange={handleMessageRetentionLimitChange}
          inputProps={{ "aria-label": "Retained message count" }}
          sx={{ width: 88 }}
        >
          <MenuItem value={5}>5</MenuItem>
          <MenuItem value={10}>10</MenuItem>
          <MenuItem value={20}>20</MenuItem>
          <MenuItem value={50}>50</MenuItem>
          <MenuItem value={100}>100</MenuItem>
        </Select>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(240px, 34%) minmax(0, 1fr)", border: "1px solid", borderColor: "divider" }}>
        <MessageList store={store} orderedIds={orderedIds} query={query} selectedMessageId={selectedMessageId} onSelect={selectMessage} />
        <MessageDetailPane
          selectedRecord={selectedRecord}
          committedRecord={committedRecord}
          document={session.committed}
          preparing={session.isPreparing}
          query={query}
        />
      </Box>
    </Box>
  );
});


function normalizeMessageRetentionLimit(value: number): MessageRetentionLimit {
  if (value === 5 || value === 20 || value === 50 || value === 100) return value;
  return 10;
}


const PinnedMessageStatus = memo(function PinnedMessageStatus({
  store,
  baselineSequence,
  onResume,
}: {
  store: ResponseStore;
  baselineSequence: number;
  onResume: () => void;
}) {
  const latestMessageId = useResponseSelector(store, (snapshot) => snapshot.latestMessageId);
  const latestRecord = latestMessageId ? store.getRecord(latestMessageId) : undefined;
  const currentSequence = latestRecord?.sequence ?? baselineSequence;
  const pendingCount = Math.max(0, currentSequence - baselineSequence);

  return (
    <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minHeight: 30, px: 0.7 }}>
      <Typography variant="caption" color="text.secondary">
        Reading pinned message{pendingCount > 0 ? ` · ${pendingCount} newer pending` : ""}
      </Typography>
      <Button size="small" variant="outlined" onClick={onResume}>Resume live</Button>
    </Stack>
  );
});
