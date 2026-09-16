import { performanceStats } from "./performance-stats.store";

export type IdleTaskCallback = () => void;

type IdleTaskHandle =
  | { kind: "idle"; id: number }
  | { kind: "timeout"; id: ReturnType<typeof globalThis.setTimeout> };

export const pendingIdleTasks = new Map<string, IdleTaskHandle>();

/** Cancels pending non-urgent work for one logical task key. */
export function cancelIdleTask(key: string): void {
  const pending = pendingIdleTasks.get(key);
  if (!pending) return;

  if (pending.kind === "idle") {
    const cancelIdleCallback = (
      globalThis as typeof globalThis & { cancelIdleCallback?: (id: number) => void }
    ).cancelIdleCallback;
    cancelIdleCallback?.(pending.id);
  } else {
    globalThis.clearTimeout(pending.id);
  }
  pendingIdleTasks.delete(key);
}

/**
 * Schedules non-urgent work and coalesces older work that uses the same key.
 * This keeps serialization and persistence out of click/paint critical paths.
 */
export function scheduleIdleTask(key: string, callback: IdleTaskCallback, timeoutMs = 1200): void {
  cancelIdleTask(key);

  const run = () => {
    pendingIdleTasks.delete(key);
    callback();
  };
  const requestIdleCallback = (
    globalThis as typeof globalThis & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    }
  ).requestIdleCallback;

  if (requestIdleCallback) {
    const id = requestIdleCallback(run, { timeout: timeoutMs });
    pendingIdleTasks.set(key, { kind: "idle", id });
    return;
  }

  const id = globalThis.setTimeout(run, Math.min(32, timeoutMs));
  pendingIdleTasks.set(key, { kind: "timeout", id });
}

/** Returns a monotonic timestamp for measuring click-to-paint latency. */
export function interactionStartedAt(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Records one interaction duration. Slow interactions dispatch a local event so
 * the developer console/benchmark UI can observe them without blocking input.
 */
export function measureInteraction(name: string, startedAt: number, slowThresholdMs = 50): number {
  const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const durationMs = Math.max(0, endedAt - startedAt);
  performanceStats.recordInteraction(name, durationMs);

  if (durationMs >= slowThresholdMs && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("layang:slow-interaction", {
        detail: { name, durationMs },
      }),
    );
  }

  return durationMs;
}
