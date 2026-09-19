"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Box, Typography } from "@/components/shadcn/compat";
import { useFixedVirtualWindow } from "../../../shared/use-fixed-virtual-window";
import type { ResponseStore } from "../model/response.store";
import type { ResponseMessageRecord } from "../model/response.types";
import { useMessageSearch } from "./useMessageSearch";

const ROW_HEIGHT = 44;
const ROW_OVERSCAN = 4;

export const MessageList = memo(function MessageList({
  store,
  orderedIds,
  query,
  selectedMessageId,
  onSelect,
}: {
  store: ResponseStore;
  orderedIds: readonly string[];
  query: string;
  selectedMessageId?: string;
  onSelect(id: string): void;
}) {
  const records = useMemo(
    () => orderedIds.map((id) => store.getRecord(id)).filter((record): record is NonNullable<typeof record> => Boolean(record)),
    [orderedIds, store],
  );
  const matches = useMessageSearch(records, query);
  const visibleIds = useMemo(
    () => matches ? orderedIds.filter((id) => matches.has(id)) : orderedIds,
    [matches, orderedIds],
  );
  const newestFirstIds = useMemo(() => [...visibleIds].reverse(), [visibleIds]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousNewestFirstIdsRef = useRef<readonly string[]>(newestFirstIds);
  const virtualWindow = useFixedVirtualWindow({
    count: newestFirstIds.length,
    itemSize: ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    scrollRef,
  });

  useEffect(() => {
    if (selectedMessageId || visibleIds.length === 0) return;
    const newestId = visibleIds.at(-1);
    if (newestId) onSelect(newestId);
  }, [onSelect, selectedMessageId, visibleIds]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    const previousIds = previousNewestFirstIdsRef.current;
    previousNewestFirstIdsRef.current = newestFirstIds;
    if (!node || node.scrollTop <= 0 || previousIds.length === 0 || newestFirstIds.length === 0) return;

    const previousIndex = Math.min(previousIds.length - 1, Math.floor(node.scrollTop / ROW_HEIGHT));
    const rowOffset = node.scrollTop - previousIndex * ROW_HEIGHT;
    const anchor = findRetainedAnchor(previousIds, newestFirstIds, previousIndex);
    if (!anchor) return;
    node.scrollTop = anchor.nextIndex * ROW_HEIGHT + rowOffset;
  }, [newestFirstIds]);

  return (
    <Box
      ref={scrollRef}
      onScroll={virtualWindow.onScroll}
      sx={{ height: "100%", minHeight: 180, overflow: "auto", borderRight: "1px solid", borderColor: "divider", overflowAnchor: "none", position: "relative" }}
    >
      <Box sx={{ height: virtualWindow.totalSize, position: "relative" }}>
        {virtualWindow.items.map((item) => {
          const id = newestFirstIds[item.index];
          const record = id ? store.getRecord(id) : undefined;
          if (!record) return null;
          return (
            <MessageRow
              key={record.id}
              record={record}
              selected={selectedMessageId === record.id}
              start={item.start}
              onSelect={onSelect}
            />
          );
        })}
      </Box>
    </Box>
  );
});

function findRetainedAnchor(
  previousIds: readonly string[],
  nextIds: readonly string[],
  preferredIndex: number,
): { id: string; nextIndex: number } | undefined {
  for (let distance = 0; distance < previousIds.length; distance += 1) {
    const candidates = distance === 0
      ? [preferredIndex]
      : [preferredIndex - distance, preferredIndex + distance];
    for (const candidateIndex of candidates) {
      if (candidateIndex < 0 || candidateIndex >= previousIds.length) continue;
      const id = previousIds[candidateIndex];
      const nextIndex = nextIds.indexOf(id);
      if (nextIndex >= 0) return { id, nextIndex };
    }
  }
  return undefined;
}

const MessageRow = memo(function MessageRow({
  record,
  selected,
  start,
  onSelect,
}: {
  record: ResponseMessageRecord;
  selected: boolean;
  start: number;
  onSelect(id: string): void;
}) {
  return (
    <Box
      onClick={() => onSelect(record.id)}
      sx={{
        position: "absolute",
        top: start,
        left: 0,
        right: 0,
        height: ROW_HEIGHT,
        px: 1,
        py: 0.5,
        cursor: "pointer",
        bgcolor: selected ? "action.selected" : "transparent",
        borderBottom: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      <Typography variant="caption" sx={{ display: "block", fontWeight: 600 }}>{record.title}</Typography>
      <Typography variant="caption" color="text.secondary" noWrap>{record.preview}</Typography>
    </Box>
  );
});
