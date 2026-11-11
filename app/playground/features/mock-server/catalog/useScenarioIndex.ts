"use client";

import { useCallback, useSyncExternalStore } from "react";
import { SCENARIO_CATALOG_CHANGED } from "./scenario-catalog-events";

type Store = NonNullable<Window["electronMockScenarioStore"]>;
type Item = NonNullable<Awaited<ReturnType<Store["list"]>>["items"]>[number];
type Snapshot = {
  items: Item[];
  phase: "idle" | "loading" | "cached" | "partial" | "ready";
  error: string;
};

const empty: Snapshot = { items: [], phase: "idle", error: "" };
const entries = new Map<string, ReturnType<typeof createIndex>>();
const getEmpty = () => empty;

function createIndex(directoryPath: string) {
  let snapshot = empty;
  let inFlight: Promise<void> | undefined;
  let refreshAgain = false;
  let lastCheckedAt = 0;
  const listeners = new Set<() => void>();

  function publish(next: Snapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function refresh() {
    if (inFlight) return inFlight;
    const store = window.electronMockScenarioStore;
    if (!store) return Promise.resolve();
    if (snapshot.phase === "idle" || snapshot.phase === "partial") {
      publish({ ...empty, phase: "loading" });
    }
    const run = async () => {
      const partial: Item[] = [];
      const unsubscribe = store.onIndexProgress((root, items) => {
        if (root !== directoryPath || snapshot.phase !== "loading" && snapshot.phase !== "partial") return;
        partial.push(...items);
        publish({ items: partial.slice(), phase: "partial", error: "" });
      });
      try {
        if (snapshot.phase === "loading") {
          const cached = await store.readCachedIndex(directoryPath);
          if (cached.ok && cached.items) publish({ items: cached.items, phase: "cached", error: "" });
        }
        const result = await store.list(directoryPath);
        if (!result.ok) throw new Error(result.error || "Could not load scenario index.");
        if (!refreshAgain) {
          publish({ items: result.items ?? [], phase: "ready", error: "" });
        }
      } catch (error) {
        publish({ ...snapshot, error: error instanceof Error ? error.message : String(error) });
      } finally {
        unsubscribe();
        lastCheckedAt = Date.now();
      }
    };
    inFlight = run().finally(() => {
      inFlight = undefined;
      if (refreshAgain && listeners.size) {
        refreshAgain = false;
        void refresh();
      }
    });
    return inFlight;
  }

  const changed = (event: Event) => {
    if ((event as CustomEvent<string>).detail !== directoryPath) return;
    if (inFlight) refreshAgain = true;
    else void refresh();
  };
  const focused = () => {
    if (Date.now() - lastCheckedAt > 2000) void refresh();
  };

  return {
    getSnapshot: () => snapshot,
    isUsed: () => listeners.size > 0 || Boolean(inFlight),
    refresh,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        window.addEventListener(SCENARIO_CATALOG_CHANGED, changed);
        window.addEventListener("focus", focused);
        refreshAgain = false;
        void refresh();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          window.removeEventListener(SCENARIO_CATALOG_CHANGED, changed);
          window.removeEventListener("focus", focused);
        }
      };
    },
  };
}

const noSubscription = () => () => {};

function indexFor(directoryPath: string) {
  let index = entries.get(directoryPath);
  if (!index) {
    index = createIndex(directoryPath);
    for (const [key, entry] of entries) {
      if (entries.size < 3) break;
      if (!entry.isUsed()) entries.delete(key);
    }
    entries.set(directoryPath, index);
  }
  return index;
}

export function useScenarioIndex(directoryPath: string) {
  const index = directoryPath && typeof window !== "undefined" ? indexFor(directoryPath) : undefined;
  const snapshot = useSyncExternalStore(index?.subscribe ?? noSubscription, index?.getSnapshot ?? getEmpty, getEmpty);
  const refresh = useCallback(() => index?.refresh(), [index]);
  return { ...snapshot, refresh };
}
