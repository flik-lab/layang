"use client";

import { MOCK_CATALOG_WORKER_SOURCE } from "./mockCatalogWorkerSource";
import { performanceStats } from "../../../shared/performance/performance-stats.store";
import type {
  MockCatalogClient,
  MockCatalogMethodInput,
  MockCatalogQuery,
  MockCatalogQueryResult,
  MockCatalogRuntimeInput,
  MockCatalogScenarioFileInput,
  MockScenarioSummary,
} from "./mockCatalog.types";

type WorkerResponse =
  | { type: "ready" | "ok"; requestId: string }
  | { type: "query-result"; requestId: string; result: MockCatalogQueryResult }
  | { type: "scenarios"; requestId: string; scenarios: MockScenarioSummary[] }
  | { type: "error"; requestId: string; error: string };

type PendingRequest = {
  resolve(value: WorkerResponse): void;
  reject(error: Error): void;
};

export function createMockCatalogClient(): MockCatalogClient {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new Error("Mock catalog worker is unavailable.");
  }

  let workerUrl: string | null = null;
  let worker: Worker | null = null;
  let disposed = false;
  let sequence = 0;
  const pending = new Map<string, PendingRequest>();

  try {
    workerUrl = URL.createObjectURL(new Blob([MOCK_CATALOG_WORKER_SOURCE], { type: "text/javascript" }));
    worker = new Worker(workerUrl, { name: "layang-mock-catalog" });
  } catch (error) {
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    throw new Error(`Mock catalog worker is unavailable. ${error instanceof Error ? error.message : String(error)}`);
  }

  const rejectAll = (message: string): void => {
    const error = new Error(message);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    performanceStats.setMockInFlight(0);
  };

  worker.onmessage = (event: MessageEvent<WorkerResponse>): void => {
    const response = event.data;
    const request = pending.get(response.requestId);
    if (!request) return;
    pending.delete(response.requestId);
    performanceStats.setMockInFlight(pending.size);
    if (response.type === "error") request.reject(new Error(response.error));
    else request.resolve(response);
  };
  worker.onerror = (event): void => rejectAll(event.message || "Mock catalog worker failed.");

  const post = (message: Record<string, unknown>): Promise<WorkerResponse> => {
    if (disposed || !worker) return Promise.reject(new Error("Mock catalog worker is unavailable."));
    sequence += 1;
    const requestId = `mock-catalog:${sequence}`;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      performanceStats.setMockInFlight(pending.size);
      try {
        worker?.postMessage({ ...message, requestId });
      } catch (error) {
        pending.delete(requestId);
        performanceStats.setMockInFlight(pending.size);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  const ready = post({ type: "init" });
  const afterReady = async (message: Record<string, unknown>): Promise<WorkerResponse> => {
    await ready;
    return post(message);
  };

  return {
    syncMethods: async (inputs: MockCatalogMethodInput[]) => {
      await afterReady({ type: "sync-methods", inputs });
    },
    syncScenarioFiles: async (inputs: MockCatalogScenarioFileInput[]) => {
      await afterReady({ type: "sync-scenario-files", inputs });
    },
    updateRuntime: async (input: MockCatalogRuntimeInput) => {
      await afterReady({ type: "update-runtime", input });
    },
    query: async (input: MockCatalogQuery) => {
      const response = await afterReady({ type: "query", input });
      if (response.type !== "query-result") throw new Error("Mock catalog worker returned an invalid query result.");
      return response.result;
    },
    getScenarios: async (methodId: string) => {
      const response = await afterReady({ type: "get-scenarios", methodId });
      if (response.type !== "scenarios") throw new Error("Mock catalog worker returned invalid scenarios.");
      return response.scenarios;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try { worker?.postMessage({ type: "dispose" }); } catch { /* termination below is authoritative */ }
      worker?.terminate();
      worker = null;
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      workerUrl = null;
      rejectAll("Mock catalog worker disposed.");
    },
  };
}
