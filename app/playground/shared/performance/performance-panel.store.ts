"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PERFORMANCE_DIAGNOSTICS_ENABLED } from "./performance-stats.store";

let open = DEFAULT_PERFORMANCE_DIAGNOSTICS_ENABLED;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setPerformancePanelOpen(next: boolean) {
  if (open === next) return;
  open = next;
  emit();
}

export function togglePerformancePanel() {
  setPerformancePanelOpen(!open);
}

export function usePerformancePanelOpen() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
    () => DEFAULT_PERFORMANCE_DIAGNOSTICS_ENABLED,
  );
}
