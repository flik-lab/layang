"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommittedDocument } from "../document-session/documentSession.types";
import { documentHydrationScheduler } from "../document-session/documentHydrationScheduler";
import { payloadDocumentService } from "../payload-document/payloadDocument.service";
import {
  PAYLOAD_DOCUMENT_MAX_CACHED_VIEWPORT_LINES,
  PAYLOAD_DOCUMENT_MAX_PAGES_PER_REQUEST,
  PAYLOAD_DOCUMENT_PAGE_SIZE,
  PAYLOAD_DOCUMENT_PREFETCH_AFTER_LINES,
  PAYLOAD_DOCUMENT_PREFETCH_BEFORE_LINES,
} from "../payload-document/payloadDocumentRuntime";
import type { PayloadHydrationPriority } from "../payload-document/payloadDocument.types";

type CachedDocumentWindow = {
  documentId: string;
  lines: Map<number, string>;
};

type LineRange = {
  start: number;
  end: number;
};

export function useJsonViewport(
  document: CommittedDocument,
  priority: PayloadHydrationPriority = "interactive",
) {
  const [, setRevision] = useState(0);
  const documentId = document.target.documentId;
  const { preparedWindow } = document;
  const lineCount = preparedWindow.lineCount;
  const initialEnd = preparedWindow.startLine + preparedWindow.lines.length - 1;
  const cacheRef = useRef<CachedDocumentWindow | null>(null);
  const fallbackLinesRef = useRef<Map<number, string> | null>(null);
  const generationRef = useRef(1);
  const pendingPagesRef = useRef(new Set<number>());
  const desiredRangeRef = useRef<LineRange>({ start: preparedWindow.startLine, end: initialEnd });
  const visibleRangeRef = useRef<LineRange>({ start: preparedWindow.startLine, end: initialEnd });
  const activeDocumentIdRef = useRef(documentId);

  if (!cacheRef.current || activeDocumentIdRef.current !== documentId) {
    const previousCache = cacheRef.current;
    const lines = new Map<number, string>();
    for (let offset = 0; offset < preparedWindow.lines.length; offset += 1) {
      lines.set(preparedWindow.startLine + offset, preparedWindow.lines[offset]);
    }
    fallbackLinesRef.current = previousCache?.lines ?? null;
    cacheRef.current = { documentId, lines };
    activeDocumentIdRef.current = documentId;
    generationRef.current += 1;
    pendingPagesRef.current.clear();
    desiredRangeRef.current = { start: preparedWindow.startLine, end: initialEnd };
    visibleRangeRef.current = { start: preparedWindow.startLine, end: initialEnd };
  }

  useEffect(() => () => {
    generationRef.current += 1;
  }, []);

  const loadWindow = useCallback(async (start: number, count: number) => {
    if (count <= 0 || lineCount <= 0) return;
    const generation = generationRef.current;
    const visibleStart = Math.max(0, Math.min(lineCount - 1, Math.floor(start)));
    const visibleEnd = Math.max(visibleStart, Math.min(lineCount - 1, visibleStart + Math.max(1, Math.floor(count)) - 1));
    const visibleRange: LineRange = { start: visibleStart, end: visibleEnd };
    const desiredRange: LineRange = {
      start: Math.max(0, visibleStart - PAYLOAD_DOCUMENT_PREFETCH_BEFORE_LINES),
      end: Math.min(lineCount - 1, visibleEnd + PAYLOAD_DOCUMENT_PREFETCH_AFTER_LINES),
    };
    visibleRangeRef.current = visibleRange;
    desiredRangeRef.current = desiredRange;

    const firstPage = Math.floor(desiredRange.start / PAYLOAD_DOCUMENT_PAGE_SIZE);
    const lastPage = Math.floor(desiredRange.end / PAYLOAD_DOCUMENT_PAGE_SIZE);
    const visibleFirstPage = Math.floor(visibleStart / PAYLOAD_DOCUMENT_PAGE_SIZE);
    const visibleLastPage = Math.floor(visibleEnd / PAYLOAD_DOCUMENT_PAGE_SIZE);
    const cache = cacheRef.current;
    if (!cache || cache.documentId !== documentId) return;
    const visiblePages: number[] = [];
    const prefetchPages: number[] = [];
    for (let page = firstPage; page <= lastPage; page += 1) {
      if (pendingPagesRef.current.has(page)) continue;
      const pageStart = page * PAYLOAD_DOCUMENT_PAGE_SIZE;
      const pageEnd = Math.min(lineCount - 1, pageStart + PAYLOAD_DOCUMENT_PAGE_SIZE - 1);
      if (hasCachedRange(cache.lines, pageStart, pageEnd)) continue;
      if (page >= visibleFirstPage && page <= visibleLastPage) visiblePages.push(page);
      else prefetchPages.push(page);
    }
    if (!visiblePages.length && !prefetchPages.length) {
      if (fallbackLinesRef.current && hasCachedRange(cache.lines, visibleStart, visibleEnd)) {
        fallbackLinesRef.current = null;
        setRevision((current: number) => current + 1);
      }
      return;
    }

    const groups = [
      ...groupContiguousPages(visiblePages, PAYLOAD_DOCUMENT_MAX_PAGES_PER_REQUEST),
      ...groupContiguousPages(prefetchPages, PAYLOAD_DOCUMENT_MAX_PAGES_PER_REQUEST),
    ];
    for (const group of groups) {
      for (let page = group.startPage; page <= group.endPage; page += 1) pendingPagesRef.current.add(page);
      const requestStart = group.startPage * PAYLOAD_DOCUMENT_PAGE_SIZE;
      const requestEnd = Math.min(lineCount - 1, (group.endPage + 1) * PAYLOAD_DOCUMENT_PAGE_SIZE - 1);
      const hydrationPriority = group.startPage <= visibleLastPage && group.endPage >= visibleFirstPage
        ? (priority === "interactive" ? "user-visible" : "latest-visible")
        : "prefetch";
      try {
        const lines = await documentHydrationScheduler.schedule({
          sessionId: `json-viewport:${documentId}:${requestStart}`,
          generation,
          documentId,
          priority: hydrationPriority,
          strategy: "strict",
          run: () => payloadDocumentService.getLines(documentId, requestStart, requestEnd - requestStart + 1, priority),
        });
        if (!lines || generationRef.current !== generation || cacheRef.current?.documentId !== documentId) continue;
        const cache = cacheRef.current.lines;
        for (let offset = 0; offset < lines.length; offset += 1) cache.set(requestStart + offset, lines[offset]);
        trimLineCache(cache, desiredRangeRef.current.start, desiredRangeRef.current.end);
        const loadedRange = { start: requestStart, end: requestStart + Math.max(0, lines.length - 1) };
        if (rangesOverlap(loadedRange, visibleRangeRef.current)) {
          if (hasCachedRange(cache, visibleRangeRef.current.start, visibleRangeRef.current.end)) {
            fallbackLinesRef.current = null;
          }
          setRevision((current: number) => current + 1);
        }
      } finally {
        for (let page = group.startPage; page <= group.endPage; page += 1) pendingPagesRef.current.delete(page);
      }
    }
  }, [documentId, lineCount, priority]);

  const lineAt = useCallback((index: number) => {
    if (cacheRef.current?.documentId !== documentId) return "";
    return cacheRef.current.lines.get(index) ?? fallbackLinesRef.current?.get(index) ?? "";
  }, [documentId]);

  return { lineCount, loadWindow, lineAt };
}

function hasCachedRange(lines: Map<number, string>, start: number, end: number): boolean {
  for (let index = start; index <= end; index += 1) {
    if (!lines.has(index)) return false;
  }
  return true;
}

function groupContiguousPages(pages: number[], maxPagesPerGroup: number): Array<{ startPage: number; endPage: number }> {
  if (!pages.length) return [];
  const groups: Array<{ startPage: number; endPage: number }> = [];
  let startPage = pages[0];
  let endPage = pages[0];
  for (let index = 1; index < pages.length; index += 1) {
    const page = pages[index];
    if (page === endPage + 1 && endPage - startPage + 1 < maxPagesPerGroup) {
      endPage = page;
      continue;
    }
    groups.push({ startPage, endPage });
    startPage = page;
    endPage = page;
  }
  groups.push({ startPage, endPage });
  return groups;
}

function rangesOverlap(left: LineRange, right: LineRange): boolean {
  return left.end >= right.start && right.end >= left.start;
}

function trimLineCache(lines: Map<number, string>, protectedStart: number, protectedEnd: number): void {
  if (lines.size <= PAYLOAD_DOCUMENT_MAX_CACHED_VIEWPORT_LINES) return;
  const center = (protectedStart + protectedEnd) / 2;
  const removable = [...lines.keys()]
    .filter((index) => index < protectedStart || index > protectedEnd)
    .sort((left, right) => Math.abs(right - center) - Math.abs(left - center));
  for (const index of removable) {
    if (lines.size <= PAYLOAD_DOCUMENT_MAX_CACHED_VIEWPORT_LINES) break;
    lines.delete(index);
  }
}
