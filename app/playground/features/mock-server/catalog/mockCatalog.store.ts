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
  methods: [],
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
    sourceId?: string;
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
  // Keep the catalog metadata cache bounded even if a workspace has 10k methods.
  // Large per-method result sets are returned to the caller but never retained.
  const maxCachedMethods = 64;
  const maxCachedScenarioSummaries = 5_000;
  let cachedScenarioCount = 0;
  let sourceSequence = 0;
  let runtimeSequence = 0;
  let sourceQueue: Promise<void> = Promise.resolve();
  const scenarioCache = new Map<string, MockScenarioSummary[]>();
  const clearScenarioCache = (): void => {
    scenarioCache.clear();
    cachedScenarioCount = 0;
    scenarioCacheGeneration = -1;
  };
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

  const syncSource = (inputs: {
    methods: MockCatalogMethodInput[];
    scenarioFiles: MockCatalogScenarioFileInput[];
    sourceId?: string;
  }): Promise<void> => {
    const fingerprint = [
      inputs.sourceId || "",
      inputs.methods.map((item) => [item.methodId,item.libraryName,item.versionLabel,
        item.requestType,item.responseType,item.requestStream,item.responseStream].join("#")).join("|"),
      inputs.scenarioFiles.map((item) => `${item.methodId}@${item.revision}`).join("|"),
    ].join("::");
    if (fingerprint === sourceFingerprint) return sourceQueue;
    sourceFingerprint = fingerprint;
    const sequence = ++sourceSequence;
    // Results from an older query must not populate the new workspace.
    querySequence += 1;
    clearScenarioCache();
    publish({ syncing: true, error: "" });
    const performSync = async (): Promise<void> => {
      if (sequence !== sourceSequence) return;
      const startedAt = now();
      try {
        const worker = getClient();
        await worker.syncMethods(inputs.methods);
        // Coalesce rapid workspace updates before transferring all scenario metadata.
        if (sequence !== sourceSequence) return;
        await worker.syncScenarioFiles(inputs.scenarioFiles);
        if (sequence !== sourceSequence) return;
        queryFingerprint = "";
        publish({ syncing: false, methods: inputs.methods });
        performanceStats.recordMockDuration("source-sync", now() - startedAt);
        if (lastQueryInput) await query(lastQueryInput);
      } catch (error) {
        if (sequence !== sourceSequence) return;
        sourceFingerprint = "";
        publish({ syncing: false, error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    };
    // Each worker sync must atomically finish its methods/files pair before
    // the next version starts. Never interleave the two messages.
    const current = sourceQueue.then(performSync, performSync);
    sourceQueue = current.catch(() => undefined);
    return current;
  };

  const updateRuntime = async (input: MockCatalogRuntimeInput): Promise<void> => {
    const fingerprint = [
      JSON.stringify(input.selectedScenarioIds),
      JSON.stringify(input.enabledMethods),
      input.running ? "1" : "0",
    ].join("::");
    if (fingerprint === runtimeFingerprint) return;
    runtimeFingerprint = fingerprint;
    const sequence = ++runtimeSequence;
    const startedAt = now();
    try {
      await getClient().updateRuntime(input);
      if (sequence !== runtimeSequence) return;
      performanceStats.recordMockDuration("runtime-update", now() - startedAt);
      queryFingerprint = "";
      if (lastQueryInput) await query(lastQueryInput);
    } catch (error) {
      if (sequence !== runtimeSequence) return;
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
        clearScenarioCache();
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
      if (cached) {
        scenarioCache.delete(methodId);
        scenarioCache.set(methodId, cached); // LRU promotion
        return cached;
      }
      const requestSourceSequence = sourceSequence;
      const startedAt = now();
      try {
        const scenarios = await getClient().getScenarios(methodId);
        if (requestSourceSequence !== sourceSequence) return [];
        performanceStats.recordMockDuration("get-scenarios", now() - startedAt);
        if (requestSourceSequence === sourceSequence && scenarios.length <= maxCachedScenarioSummaries) {
          scenarioCache.set(methodId, scenarios);
          cachedScenarioCount += scenarios.length;
          while (scenarioCache.size > maxCachedMethods || cachedScenarioCount > maxCachedScenarioSummaries) {
            const oldestKey = scenarioCache.keys().next().value;
            if (oldestKey === undefined) break;
            cachedScenarioCount -= scenarioCache.get(oldestKey)?.length ?? 0;
            scenarioCache.delete(oldestKey);
          }
        }
        return scenarios;
      } catch (error) {
        publish({ error: error instanceof Error ? error.message : String(error) });
        return [];
      }
    },
    dispose: () => {
      sourceSequence += 1;
      runtimeSequence += 1;
      querySequence += 1;
      client?.dispose();
      client = null;
      sourceFingerprint = "";
      runtimeFingerprint = "";
      queryFingerprint = "";
      lastQueryInput = null;
      clearScenarioCache();
      publish(initialSnapshot);
    },
  };
}

export const mockCatalogStore = createMockCatalogStore();
