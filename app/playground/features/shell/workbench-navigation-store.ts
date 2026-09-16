"use client";

import { useSyncExternalStore } from "react";
import type { SideSection } from "../../shared/workbench-types";

type Listener = () => void;

let currentSideSection: SideSection = "collections";
const listeners = new Set<Listener>();

export function getWorkbenchSideSection(): SideSection {
  return currentSideSection;
}

export function setWorkbenchSideSection(section: SideSection): void {
  if (currentSideSection === section) return;
  currentSideSection = section;
  for (const listener of listeners) listener();
}

export function subscribeWorkbenchSideSection(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWorkbenchSideSection(): SideSection {
  return useSyncExternalStore(
    subscribeWorkbenchSideSection,
    getWorkbenchSideSection,
    () => "collections",
  );
}
