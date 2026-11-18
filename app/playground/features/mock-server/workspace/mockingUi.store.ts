"use client";

import { useSyncExternalStore } from "react";

export type MockingMethodFilter = "all" | "live" | "ready" | "setup";
type ScenarioNavigation = { methodKey: string; create: boolean };

export type MockingUiSnapshot = {
  query: string;
  methodFilter: MockingMethodFilter;
  selectedMethodId: string;
  collapsedProtoIds: ReadonlySet<string>;
  collapsedServiceIds: ReadonlySet<string>;
  scenarioNavigation: ScenarioNavigation | null;
};

export type MockingUiStore = {
  getSnapshot(): MockingUiSnapshot;
  subscribe(listener: () => void): () => void;
  setQuery(query: string): void;
  setMethodFilter(filter: MockingMethodFilter): void;
  selectMethod(id: string): void;
  toggleProto(id: string): void;
  toggleService(id: string): void;
  openScenarios(methodKey: string, create?: boolean): void;
  consumeScenarioNavigation(request: ScenarioNavigation): void;
};

const initialSnapshot: MockingUiSnapshot = {
  query: "",
  methodFilter: "all",
  selectedMethodId: "",
  collapsedProtoIds: new Set<string>(),
  collapsedServiceIds: new Set<string>(),
  scenarioNavigation: null,
};

export function createMockingUiStore(): MockingUiStore {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();

  const publish = (next: MockingUiSnapshot): void => {
    if (next === snapshot) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const toggleSet = (current: ReadonlySet<string>, id: string): ReadonlySet<string> => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setQuery: (query) => {
      if (query === snapshot.query) return;
      publish({ ...snapshot, query });
    },
    setMethodFilter: (methodFilter) => {
      if (methodFilter === snapshot.methodFilter) return;
      publish({ ...snapshot, methodFilter });
    },
    selectMethod: (selectedMethodId) => {
      if (selectedMethodId === snapshot.selectedMethodId) return;
      publish({ ...snapshot, selectedMethodId });
    },
    toggleProto: (id) => publish({ ...snapshot, collapsedProtoIds: toggleSet(snapshot.collapsedProtoIds, id) }),
    toggleService: (id) => publish({ ...snapshot, collapsedServiceIds: toggleSet(snapshot.collapsedServiceIds, id) }),
    openScenarios: (methodKey, create = false) => publish({ ...snapshot, scenarioNavigation: { methodKey, create } }),
    consumeScenarioNavigation: (request) => {
      if (snapshot.scenarioNavigation === request) publish({ ...snapshot, scenarioNavigation: null });
    },
  };
}

export const mockingUiStore = createMockingUiStore();

export function useMockingUiSnapshot(): MockingUiSnapshot {
  return useSyncExternalStore(mockingUiStore.subscribe, mockingUiStore.getSnapshot, mockingUiStore.getSnapshot);
}

const getScenarioNavigation = () => mockingUiStore.getSnapshot().scenarioNavigation;
export function useScenarioNavigation() {
  return useSyncExternalStore(mockingUiStore.subscribe, getScenarioNavigation, () => null);
}
