import type { AssertionResult } from "../../../shared/workbench-types";
import { payloadDocumentService } from "../payload-document/payloadDocument.service";
import { createResponseStore, type ResponseStore } from "./response.store";
import type { RequestResultSummary } from "./responseResult.types";

export type ResponseSessionRuntimeSnapshot = {
  resultSummary: RequestResultSummary | null;
  assertionResults: readonly AssertionResult[];
  version: number;
};

export type ResponseSessionRuntime = {
  store: ResponseStore;
  getSnapshot(): ResponseSessionRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  setResultSummary(summary: RequestResultSummary | null): void;
  setAssertionResults(results: readonly AssertionResult[]): void;
};

export type ResponseSessionRegistryDebugStats = {
  sessionCount: number;
  totalRetainedResponseRecords: number;
  totalReferencedDocumentIds: number;
};

function createRuntime(): ResponseSessionRuntime {
  const store = createResponseStore((ids) => payloadDocumentService.release(ids));
  let snapshot: ResponseSessionRuntimeSnapshot = { resultSummary: null, assertionResults: [], version: 0 };
  const listeners = new Set<() => void>();
  const publish = (next: Omit<ResponseSessionRuntimeSnapshot, "version">): void => {
    if (Object.is(snapshot.resultSummary, next.resultSummary) && Object.is(snapshot.assertionResults, next.assertionResults)) return;
    snapshot = { ...next, version: snapshot.version + 1 };
    for (const listener of listeners) listener();
  };
  return {
    store,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setResultSummary(resultSummary) {
      if (Object.is(snapshot.resultSummary, resultSummary)) return;
      publish({ resultSummary, assertionResults: snapshot.assertionResults });
    },
    setAssertionResults(assertionResults) {
      if (Object.is(snapshot.assertionResults, assertionResults)) return;
      publish({ resultSummary: snapshot.resultSummary, assertionResults: [...assertionResults] });
    },
  };
}

class ResponseSessionRegistryImpl {
  private readonly runtimes = new Map<string, ResponseSessionRuntime>();

  get(sessionId: string): ResponseSessionRuntime | undefined {
    return this.runtimes.get(sessionId);
  }

  getOrCreate(sessionId: string): ResponseSessionRuntime {
    const existing = this.runtimes.get(sessionId);
    if (existing) return existing;
    const runtime = createRuntime();
    this.runtimes.set(sessionId, runtime);
    return runtime;
  }

  close(sessionId: string): void {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;
    runtime.store.reset();
    this.runtimes.delete(sessionId);
  }

  clear(): void {
    for (const [sessionId] of this.runtimes) this.close(sessionId);
  }

  getDebugStats(): ResponseSessionRegistryDebugStats {
    let totalRetainedResponseRecords = 0;
    let totalReferencedDocumentIds = 0;
    for (const runtime of this.runtimes.values()) {
      const stats = runtime.store.getDebugStats();
      totalRetainedResponseRecords += stats.retainedRecords;
      totalReferencedDocumentIds += stats.referencedDocumentIds;
    }
    return { sessionCount: this.runtimes.size, totalRetainedResponseRecords, totalReferencedDocumentIds };
  }
}

export const responseSessionRegistry = new ResponseSessionRegistryImpl();
