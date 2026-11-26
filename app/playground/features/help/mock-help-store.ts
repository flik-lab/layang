import { useSyncExternalStore } from "react";

export type MockHelpTopic =
  | "quick-start"
  | "templates"
  | "scenario-file"
  | "matching"
  | "streaming"
  | "web-access"
  | "troubleshooting";

type HelpState = { open: boolean; topic: MockHelpTopic };

let state: HelpState = { open: false, topic: "quick-start" };
const listeners = new Set<() => void>();

const emit = (next: HelpState) => {
  state = next;
  for (const listener of listeners) listener();
};

/** Opens the Mocking help drawer at a topic. Any component can call this. */
export const openMockHelp = (topic: MockHelpTopic = state.topic) => emit({ open: true, topic });
export const closeMockHelp = () => emit({ ...state, open: false });
export const selectMockHelpTopic = (topic: MockHelpTopic) => emit({ ...state, topic });

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useMockHelp = () => useSyncExternalStore(subscribe, () => state, () => state);
