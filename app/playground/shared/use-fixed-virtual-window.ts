"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type UIEvent as ReactUIEvent } from "react";

export type FixedVirtualItem = {
  index: number;
  key: number;
  start: number;
};

type FixedVirtualWindowOptions = {
  count: number;
  itemSize: number;
  overscan: number;
  scrollRef: RefObject<HTMLDivElement | null>;
};

type FixedVirtualWindow = {
  items: FixedVirtualItem[];
  totalSize: number;
  onScroll(event: ReactUIEvent<HTMLDivElement>): void;
  scrollToIndex(index: number, align?: "start" | "center" | "end"): void;
};

/**
 * Minimal fixed-row windowing without synchronous React flushes.
 * Use this for hot lists whose rows have deterministic heights.
 */
export function useFixedVirtualWindow({
  count,
  itemSize,
  overscan,
  scrollRef,
}: FixedVirtualWindowOptions): FixedVirtualWindow {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const latestScrollTopRef = useRef(0);

  const updateViewport = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    setViewportHeight((current: number) => current === node.clientHeight ? current : node.clientHeight);
    setScrollTop((current: number) => current === node.scrollTop ? current : node.scrollTop);
  }, [scrollRef]);

  useEffect(() => {
    updateViewport();
    const node = scrollRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateViewport);
    observer.observe(node);
    return () => observer.disconnect();
  }, [updateViewport, scrollRef]);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const onScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    latestScrollTopRef.current = event.currentTarget.scrollTop;
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      setScrollTop(latestScrollTopRef.current);
    });
  }, []);

  const items = useMemo(() => {
    if (count <= 0 || itemSize <= 0) return [];
    const safeHeight = Math.max(itemSize, viewportHeight);
    const firstVisible = Math.floor(scrollTop / itemSize);
    const startIndex = Math.max(0, firstVisible - overscan);
    const visibleCount = Math.max(1, Math.ceil(safeHeight / itemSize));
    const endIndex = Math.min(count, firstVisible + visibleCount + overscan);
    const result: FixedVirtualItem[] = [];
    for (let index = startIndex; index < endIndex; index += 1) {
      result.push({ index, key: index, start: index * itemSize });
    }
    return result;
  }, [count, itemSize, overscan, scrollTop, viewportHeight]);

  const scrollToIndex = useCallback((index: number, align: "start" | "center" | "end" = "start") => {
    const node = scrollRef.current;
    if (!node || count <= 0) return;
    const safeIndex = Math.max(0, Math.min(count - 1, Math.floor(index)));
    let top = safeIndex * itemSize;
    if (align === "center") top -= Math.max(0, (node.clientHeight - itemSize) / 2);
    else if (align === "end") top -= Math.max(0, node.clientHeight - itemSize);
    node.scrollTop = Math.max(0, top);
    setScrollTop(node.scrollTop);
  }, [count, itemSize, scrollRef]);

  return {
    items,
    totalSize: Math.max(0, count * itemSize),
    onScroll,
    scrollToIndex,
  };
}
