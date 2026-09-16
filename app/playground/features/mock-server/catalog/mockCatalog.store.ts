"use client";

import { createMockCatalogClient } from "./mockCatalog.client";
import { performanceStats } from "../../../shared/performance/performance-stats.store";
import type {
  MockCatalogClient,
  MockCatalogMethodInput,
  MockCatalogQuery,
  MockCatalogRuntimeInput,
  MockCatalogScenarioFileInput,
  MockCatalogStoreSnapshot,
  MockScenarioSummary,
} from "./mockCatalog.types";

const emptySummary = {
  totalMethods: 0,
  totalScenarios: 0,
  visibleMethods: 0,
  live: 0,
  ready: 0,
  setup: 0,
  error: 0,
};

const initialSnapshot: MockCatalogStoreSnapshot = {
  generation: 0,
  rows: [],
  summary: emptySummary,
  loading: false,
  syncing: false,
  error: "",
};

type Listener = () => void;

export type MockCatalogStore = {
  getSnapshot(): MockCatalogStoreSnapshot;
  subscribe(listener: Listener): () => void;
  syncSource(inputs: {
    methods: MockCatalogMethodInput[];
    scenarioFiles: MockCatalogScenarioFileInput[];
  }): Promise<void>;
  updateRuntime(input: MockCatalogRuntimeInput): Promise<void>;
  query(input: MockCatalogQuery): Promise<void>;
  getScenarios(methodId: string): Promise<MockScenarioSummary[]>;
  dispose(): void;
};

export function createMockCatalogStore(): MockCatalogStore {
  let snapshot = initialSnapshot;
  let client: MockCatalogClient | null = null;
  let sourceFingerprint = "";
  let runtimeFingerprint = "";
  let queryFingerprint = "";
  let querySequence = 0;
  let lastQueryInput: MockCatalogQuery | null = null;
  let scenarioCacheGeneration = -1;
  const scenarioCache = new Map<string, MockScenarioSummary[]>();
  const listeners = new Set<Listener>();

  const now = (): number => typeof performance !== "undefined" ? performance.now() : Date.now();

  const publish = (patch: Partial<MockCatalogStoreSnapshot>): void => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };

  const getClient = (): MockCatalogClient => {
    if (!client) client = createMockCatalogClient();
    return client;
  };

  const syncSource = async (inputs: {
    methods: MockCatalogMethodInput[];
    scenarioFiles: MockCatalogScenarioFileInput[];
  }): Promise<void> => {
    const fingerprint = [
      inputs.methods.map((item) => item.methodId).join("|"),
      inputs.scenarioFiles.map((item) => `${item.methodId}@${item.revision}`).join("|"),
    ].join("::");
    if (fingerprint === sourceFingerprint) return;
    sourceFingerprint = fingerprint;
    publish({ syncing: true, error: "" });
    const startedAt = now();
    try {
      const worker = getClient();
      await worker.syncMethods(inputs.methods);
      await worker.syncScenarioFiles(inputs.scenarioFiles);
      scenarioCache.clear();
      scenarioCacheGeneration = -1;
      queryFingerprint = "";
      publish({ syncing: false });
      performanceStats.recordMockDuration("source-sync", now() - startedAt);
      if (lastQueryInput) await query(lastQueryInput);
    } catch (error) {
      sourceFingerprint = "";
      publish({ syncing: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  const updateRuntime = async (input: MockCatalogRuntimeInput): Promise<void> => {
    const fingerprint = [
      JSON.stringify(input.selectedScenarioIds),
      JSON.stringify(input.enabledMethods),
      input.running ? "1" : "0",
    ].join("::");
    if (fingerprint === runtimeFingerprint) return;
    runtimeFingerprint = fingerprint;
    const startedAt = now();
    try {
      await getClient().updateRuntime(input);
      performanceStats.recordMockDuration("runtime-update", now() - startedAt);
      queryFingerprint = "";
      if (lastQueryInput) await query(lastQueryInput);
    } catch (error) {
      runtimeFingerprint = "";
      publish({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  const query = async (input: MockCatalogQuery): Promise<void> => {
    lastQueryInput = input;
    const fingerprint = JSON.stringify(input);
    if (fingerprint === queryFingerprint && !snapshot.syncing) return;
    queryFingerprint = fingerprint;
    const sequence = ++querySequence;
    publish({ loading: snapshot.rows.length === 0, error: "" });
    const startedAt = now();
    try {
      const result = await getClient().query(input);
      if (sequence !== querySequence) return;
      if (scenarioCacheGeneration !== result.generation) {
        scenarioCache.clear();
        scenarioCacheGeneration = result.generation;
      }
      publish({ ...result, loading: false });
      performanceStats.recordMockDuration("query", now() - startedAt);
      performanceStats.setMockCounts(result.summary.totalMethods, result.summary.totalScenarios, result.rows.length);
    } catch (error) {
      if (sequence !== querySequence) return;
      queryFingerprint = "";
      publish({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    syncSource,
    updateRuntime,
    query,
    getScenarios: async (methodId) => {
      const cached = scenarioCache.get(methodId);
      if (cached) return cached;
      const startedAt = now();
      try {
        const scenarios = await getClient().getScenarios(methodId);
        performanceStats.recordMockDuration("get-scenarios", now() - startedAt);
        scenarioCache.set(methodId, scenarios);
        return scenarios;
      } catch (error) {
        publish({ error: error instanceof Error ? error.message : String(error) });
        return [];
      }
    },
    dispose: () => {
      client?.dispose();
      client = null;
      sourceFingerprint = "";
      runtimeFingerprint = "";
      queryFingerprint = "";
      lastQueryInput = null;
      scenarioCache.clear();
      snapshot = initialSnapshot;
    },
  };
}

export const mockCatalogStore = createMockCatalogStore();
