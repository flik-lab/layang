"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box } from "@/components/shadcn/compat";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import { SearchHighlightedText } from "../../../shared/components/search-highlight";
import { useFixedVirtualWindow } from "../../../shared/use-fixed-virtual-window";
import type { CommittedDocument } from "../document-session/documentSession.types";
import { payloadDocumentService } from "../payload-document/payloadDocument.service";
import type { PayloadHydrationPriority, PayloadSearchMatch } from "../payload-document/payloadDocument.types";
import { useJsonViewport } from "./useJsonViewport";

const LINE_HEIGHT = 20;
const OVERSCAN = 18;

type DocumentMatch = { lineIndex: number; column: number };

type JsonDocumentViewerProps = {
  document: CommittedDocument;
  query?: string;
  priority?: PayloadHydrationPriority;
};

export const JsonDocumentViewer = memo(function JsonDocumentViewer(props: JsonDocumentViewerProps) {
  return <JsonDocumentViewport {...props} />;
});

const JsonDocumentViewport = memo(function JsonDocumentViewport({
  document,
  query = "",
  priority = "interactive",
}: JsonDocumentViewerProps) {
  const documentId = document.target.documentId;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { lineCount, loadWindow, lineAt } = useJsonViewport(document, priority);
  const [matches, setMatches] = useState<DocumentMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const searchGenerationRef = useRef(0);
  const {
    items: virtualItems,
    totalSize: virtualTotalSize,
    onScroll: onVirtualScroll,
    scrollToIndex,
  } = useFixedVirtualWindow({
    count: lineCount,
    itemSize: LINE_HEIGHT,
    overscan: OVERSCAN,
    scrollRef,
  });
  const first = virtualItems[0]?.index ?? 0;
  const last = virtualItems.at(-1)?.index ?? Math.min(Math.max(0, lineCount - 1), 60);

  useEffect(() => {
    if (lineCount <= 0) return;
    const start = Math.max(0, first - OVERSCAN);
    const count = Math.min(lineCount - start, Math.max(1, last - start + 1 + OVERSCAN));
    void loadWindow(start, count);
  }, [first, last, lineCount, loadWindow]);

  const selectMatch = useCallback((requestedIndex: number) => {
    if (!matches.length) {
      setActiveMatchIndex(-1);
      return;
    }
    const next = ((requestedIndex % matches.length) + matches.length) % matches.length;
    const match = matches[next];
    setActiveMatchIndex(next);
    scrollToIndex(match.lineIndex, "center");
  }, [matches, scrollToIndex]);

  useEffect(() => {
    searchGenerationRef.current += 1;
    const generation = searchGenerationRef.current;
    const normalized = query.trim();
    if (!normalized) {
      setMatches([]);
      setActiveMatchIndex(-1);
      return;
    }
    void payloadDocumentService.search([documentId], normalized, 2000).then((next) => {
      if (searchGenerationRef.current !== generation) return;
      const own = next.filter((match: PayloadSearchMatch) => match.documentId === documentId);
      setMatches(own);
      setActiveMatchIndex(own.length ? 0 : -1);
      if (own.length) scrollToIndex(own[0].lineIndex, "center");
    });
  }, [documentId, query, scrollToIndex]);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    host.dataset.virtualSearchCount = String(matches.length);
    host.dataset.virtualSearchIndex = String(activeMatchIndex);
    host.dispatchEvent(new CustomEvent("layang-virtual-search-state", { detail: { count: matches.length, index: activeMatchIndex } }));
  }, [activeMatchIndex, matches.length]);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const onNavigate = (event: Event) => {
      const index = Number((event as CustomEvent<{ index?: number }>).detail?.index ?? 0);
      selectMatch(index);
    };
    const onCopy = () => {
      void payloadDocumentService.getText(documentId, "pretty").then((text) => {
        if (text !== undefined) return copyTextWithAnnouncement(text, "Response JSON");
        return undefined;
      });
    };
    host.addEventListener("layang-virtual-search", onNavigate);
    host.addEventListener("layang-copy-virtual-json", onCopy);
    return () => {
      host.removeEventListener("layang-virtual-search", onNavigate);
      host.removeEventListener("layang-copy-virtual-json", onCopy);
    };
  }, [documentId, selectMatch]);

  const matchingLines = useMemo(() => new Set(matches.map((match: DocumentMatch) => match.lineIndex)), [matches]);
  const activeLine = activeMatchIndex >= 0 ? matches[activeMatchIndex]?.lineIndex : undefined;

  return (
    <Box
      ref={scrollRef}
      className="virtual-json-viewer"
      data-document-id={documentId}
      onScroll={onVirtualScroll}
      sx={{ height: "100%", minHeight: 180, overflow: "auto", overflowAnchor: "none", bgcolor: "background.default", fontFamily: "monospace", fontSize: 12 }}
    >
      <Box sx={{ height: virtualTotalSize, width: "100%", position: "relative", minWidth: 0 }}>
        {virtualItems.map((item: { index: number; key: string | number; start: number }) => {
          const text = lineAt(item.index);
          return (
            <Box
              key={item.key}
              data-index={item.index}
              sx={{ position: "absolute", top: 0, left: 0, width: "100%", height: LINE_HEIGHT, transform: `translateY(${item.start}px)`, display: "flex", alignItems: "center", whiteSpace: "pre", overflow: "hidden", bgcolor: activeLine === item.index ? "action.selected" : "transparent" }}
            >
              <Box component="span" sx={{ width: 56, pr: 1, textAlign: "right", color: "text.disabled", userSelect: "none", flexShrink: 0 }}>{item.index + 1}</Box>
              <Box component="code" sx={{ minWidth: 0, pr: 2, color: matchingLines.has(item.index) ? "warning.main" : "text.primary" }}>
                {query.trim() ? <SearchHighlightedText text={text || " "} query={query} /> : (text || " ")}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});
