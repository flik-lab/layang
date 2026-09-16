"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LatestFollowState } from "./latestFollow.types";

const LATEST_FOLLOW_QUIET_MS = 200;
const LATEST_FOLLOW_MAX_STALENESS_MS = 750;

type UseLatestFollowOptions = {
  minTargetIntervalMs?: number;
};

export function useLatestFollow(
  latestMessageId: string | undefined,
  { minTargetIntervalMs = 0 }: UseLatestFollowOptions = {},
) {
  const [state, setState] = useState<LatestFollowState>({ mode: "follow", targetMessageId: latestMessageId, newerCount: 0 });
  const stateRef = useRef(state);
  const pendingLatestIdRef = useRef<string | undefined>(latestMessageId);
  const quietTimerRef = useRef<number | null>(null);
  const maxStalenessTimerRef = useRef<number | null>(null);
  const lastTargetPublishedAtRef = useRef(latestMessageId ? Date.now() : 0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearTimers = useCallback(() => {
    if (quietTimerRef.current !== null) {
      window.clearTimeout(quietTimerRef.current);
      quietTimerRef.current = null;
    }
    if (maxStalenessTimerRef.current !== null) {
      window.clearTimeout(maxStalenessTimerRef.current);
      maxStalenessTimerRef.current = null;
    }
  }, []);

  const flushPendingLatest = useCallback(() => {
    clearTimers();
    const pendingLatestId = pendingLatestIdRef.current;
    if (!pendingLatestId) return;

    const current = stateRef.current;
    const now = Date.now();
    const minimumInterval = Math.max(0, Math.floor(minTargetIntervalMs));
    const elapsed = now - lastTargetPublishedAtRef.current;
    if (
      current.mode === "follow"
      && current.targetMessageId
      && minimumInterval > 0
      && elapsed < minimumInterval
    ) {
      maxStalenessTimerRef.current = window.setTimeout(flushPendingLatest, Math.max(1, minimumInterval - elapsed));
      return;
    }

    pendingLatestIdRef.current = undefined;
    if (current.mode !== "follow") return;
    lastTargetPublishedAtRef.current = now;
    setState((latestState: LatestFollowState) =>
      latestState.mode === "follow"
        ? { ...latestState, targetMessageId: pendingLatestId, newerCount: 0 }
        : latestState,
    );
  }, [clearTimers, minTargetIntervalMs]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!latestMessageId) return;
    if (stateRef.current.mode !== "follow") {
      setState((current: LatestFollowState) => {
        if (current.mode === "follow" || current.targetMessageId === latestMessageId) return current;
        return { ...current, newerCount: current.newerCount + 1 };
      });
      return;
    }

    pendingLatestIdRef.current = latestMessageId;
    if (!stateRef.current.targetMessageId) {
      flushPendingLatest();
      return;
    }

    if (quietTimerRef.current !== null) window.clearTimeout(quietTimerRef.current);
    quietTimerRef.current = window.setTimeout(flushPendingLatest, LATEST_FOLLOW_QUIET_MS);
    if (maxStalenessTimerRef.current === null) {
      maxStalenessTimerRef.current = window.setTimeout(flushPendingLatest, LATEST_FOLLOW_MAX_STALENESS_MS);
    }
  }, [flushPendingLatest, latestMessageId]);

  const hold = useCallback((committedMessageId?: string) => {
    clearTimers();
    pendingLatestIdRef.current = undefined;
    setState((current: LatestFollowState) => current.mode === "follow"
      ? { ...current, mode: "hold", targetMessageId: committedMessageId ?? current.targetMessageId }
      : current);
  }, [clearTimers]);

  const jumpLatest = useCallback(() => {
    clearTimers();
    pendingLatestIdRef.current = undefined;
    lastTargetPublishedAtRef.current = Date.now();
    setState({ mode: "follow", targetMessageId: latestMessageId, newerCount: 0 });
  }, [clearTimers, latestMessageId]);

  const freeze = useCallback((committedMessageId?: string) => {
    clearTimers();
    pendingLatestIdRef.current = undefined;
    setState((current: LatestFollowState) => ({
      ...current,
      mode: "frozen",
      targetMessageId: committedMessageId ?? current.targetMessageId,
      newerCount: 0,
    }));
  }, [clearTimers]);

  const unfreeze = useCallback(() => {
    clearTimers();
    pendingLatestIdRef.current = undefined;
    lastTargetPublishedAtRef.current = Date.now();
    setState({ mode: "follow", targetMessageId: latestMessageId, newerCount: 0 });
  }, [clearTimers, latestMessageId]);

  return { state, hold, jumpLatest, freeze, unfreeze };
}
