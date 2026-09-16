"use client";

import { useSyncExternalStore } from "react";

export const MAX_DURATION_SAMPLES = 160;
export const MAX_FRAME_SAMPLES = 240;
const MAX_HISTORY_SAMPLES = 60;
const LONG_TASK_WINDOW_MS = 10_000;
export const DURATION_WINDOW_MS = 10_000;
export const DEFAULT_PERFORMANCE_DIAGNOSTICS_ENABLED = false;

type DurationKey =
  | "interaction"
  | "payload:register-value"
  | "payload:register-utf8"
  | "payload:get-meta"
  | "payload:get-lines"
  | "payload:search"
  | "payload:get-text"
  | "payload:attach-producer-port"
  | "mock:source-sync"
  | "mock:runtime-update"
  | "mock:query"
  | "mock:get-scenarios"
  | "mock:server-start"
  | "mock:server-update"
  | "react:Workbench"
  | "react:Mocking"
  | "react:Response";

type CounterKey =
  | "streamIncoming"
  | "streamProcessed"
  | "uiCommitted"
  | "coalesced"
  | "payloadChars";

type DurationSample = { value: number; timestamp: number };

export type PerformanceRecommendation = {
  area: "Main thread" | "Stream" | "Payload worker" | "Mock catalog" | "React";
  severity: "ok" | "warn" | "bad";
  message: string;
};

export type PerformanceSnapshot = {
  sampledAt: number;
  enabled: boolean;
  runtime: {
    section: string;
    streamActive: boolean;
    mockActive: boolean;
    heapMb?: number;
    usedHeapMb?: number;
    totalHeapMb?: number;
    heapLimitMb?: number;
  };
  mainThread: {
    fps: number;
    frameP50Ms: number;
    frameP95Ms: number;
    frameMaxMs: number;
    longTasks10s: number;
    sidebarLastMs: number;
    sidebarP95Ms: number;
  };
  stream: {
    incomingPerSec: number;
    processedPerSec: number;
    uiCommittedPerSec: number;
    payloadCharsPerSec: number;
    deferredBacklog: number;
    ingestionQueue: number;
    coalescedPerSec: number;
    retainedMessages: number;
  };
  payloadWorker: {
    inFlight: number;
    retainedDocuments: number;
    actualDocumentCount: number;
    decodedDocuments: number;
    indexedDocuments: number;
    pinnedDocuments: number;
    residentMb: number;
    rawMb: number;
    indexMb: number;
    registerP95Ms: number;
    getMetaP95Ms: number;
    getLinesP95Ms: number;
    searchP95Ms: number;
    getTextP95Ms: number;
  };
  mockCatalog: {
    inFlight: number;
    methods: number;
    scenarios: number;
    visibleRows: number;
    sourceSyncP95Ms: number;
    queryP95Ms: number;
    runtimeUpdateP95Ms: number;
    serverStartP95Ms: number;
    serverUpdateP95Ms: number;
  };
  responseRuntime: {
    responseSessionCount: number;
    responseRegistryRecords: number;
    responseRegistryDocumentRefs: number;
  };
  mockRuntime: {
    mockPollsPerSec: number;
    runtimeStatusPollsPerSec: number;
    mockPublishedChangesPerSec: number;
  };
  transportLifecycle: {
    activeDecodeWorkers: number;
    pendingDecodeAcks: number;
    payloadProducerChannels: number;
    activeStreamSubscriptions: number;
    activeTransportProcesses: number;
    deferredEventCount: number;
    ingestionQueueDepth: number;
  };
  react: {
    containerRendersPerSec: number;
    collectionsRendersPerSec: number;
    workbenchCommitsPerSec: number;
    workbenchP95Ms: number;
    mockingCommitsPerSec: number;
    mockingP95Ms: number;
    responseCommitsPerSec: number;
    responseP95Ms: number;
    responsePanelRendersPerSec: number;
    latestViewerRendersPerSec: number;
    messageWorkspaceRendersPerSec: number;
    statusBarRendersPerSec: number;
  };
  sessionMax: {
    sidebarMs: number;
    payloadGetLinesMs: number;
    mockRuntimeUpdateMs: number;
    workbenchCommitMs: number;
    mockingCommitMs: number;
    responseCommitMs: number;
  };
  recommendations: PerformanceRecommendation[];
};

type PayloadWorkerMemoryStats = {
  documentCount: number;
  decodedDocumentCount: number;
  indexedDocumentCount: number;
  pinnedDocumentCount: number;
  rawBytes: number;
  indexBytes: number;
  residentBytes: number;
};

export type RuntimeDiagnosticsInput = {
  responseRuntime: {
    responseSessionCount: number;
    responseRegistryRecords: number;
    responseRegistryDocumentRefs: number;
  };
  mockRuntime: { polls: number; runtimeStatusPolls: number; publishedChanges: number };
  transportLifecycle: {
    activeDecodeWorkers: number;
    pendingDecodeAcks: number;
    payloadProducerChannels: number;
    activeStreamSubscriptions: number;
    activeTransportProcesses: number;
    deferredEventCount: number;
    ingestionQueueDepth: number;
  };
};

type RenderArea = "container" | "collections" | "responsePanel" | "latestViewer" | "messageWorkspace" | "statusBar";

type RateState = Record<
  CounterKey
  | "reactWorkbench"
  | "reactMocking"
  | "reactResponse"
  | "renderContainer"
  | "renderCollections"
  | "renderResponsePanel"
  | "renderLatestViewer"
  | "renderMessageWorkspace"
  | "renderStatusBar",
  number
>;

type RuntimeState = {
  section: string;
  streamActive: boolean;
  mockActive: boolean;
};

const emptyRates = (): RateState => ({
  streamIncoming: 0,
  streamProcessed: 0,
  uiCommitted: 0,
  coalesced: 0,
  payloadChars: 0,
  reactWorkbench: 0,
  reactMocking: 0,
  reactResponse: 0,
  renderContainer: 0,
  renderCollections: 0,
  renderResponsePanel: 0,
  renderLatestViewer: 0,
  renderMessageWorkspace: 0,
  renderStatusBar: 0,
});

function boundedPush(target: number[], value: number, limit: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  target.push(value);
  if (target.length > limit) target.splice(0, target.length - limit);
}

function boundedDurationPush(target: DurationSample[], sample: DurationSample, limit: number): void {
  target.push(sample);
  if (target.length > limit) target.splice(0, target.length - limit);
}

function recentDurationSamples(samples: DurationSample[], currentAt = nowMs()): DurationSample[] {
  return samples.filter((sample) => currentAt - sample.timestamp <= DURATION_WINDOW_MS);
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

class PerformanceStatsStore {
  private enabled = DEFAULT_PERFORMANCE_DIAGNOSTICS_ENABLED;
  private listeners = new Set<() => void>();
  private counters = emptyRates();
  private previousCounters = emptyRates();
  private durations = new Map<string, DurationSample[]>();
  private sessionMax = new Map<string, number>();
  private frameSamples: number[] = [];
  private longTaskTimes: number[] = [];
  private interactionByName = new Map<string, DurationSample[]>();
  private runtime: RuntimeState = { section: "collections", streamActive: false, mockActive: false };
  private deferredBacklog = 0;
  private ingestionQueue = 0;
  private retainedMessages = 0;
  private payloadInFlight = 0;
  private payloadDocuments = 0;
  private payloadWorkerMemory: PayloadWorkerMemoryStats = {
    documentCount: 0, decodedDocumentCount: 0, indexedDocumentCount: 0, pinnedDocumentCount: 0,
    rawBytes: 0, indexBytes: 0, residentBytes: 0,
  };
  private mockInFlight = 0;
  private mockCounts = { methods: 0, scenarios: 0, visibleRows: 0 };
  private runtimeDiagnostics: RuntimeDiagnosticsInput = {
    responseRuntime: { responseSessionCount: 0, responseRegistryRecords: 0, responseRegistryDocumentRefs: 0 },
    mockRuntime: { polls: 0, runtimeStatusPolls: 0, publishedChanges: 0 },
    transportLifecycle: {
      activeDecodeWorkers: 0,
      pendingDecodeAcks: 0,
      payloadProducerChannels: 0,
      activeStreamSubscriptions: 0,
      activeTransportProcesses: 0,
      deferredEventCount: 0,
      ingestionQueueDepth: 0,
    },
  };
  private previousMockRuntime = { polls: 0, runtimeStatusPolls: 0, publishedChanges: 0 };
  private lastSampleAt = nowMs();
  private rafId: number | null = null;
  private lastFrameAt = 0;
  private longTaskObserver: PerformanceObserver | null = null;
  private history: PerformanceSnapshot[] = [];
  private snapshot: PerformanceSnapshot = this.createPerformanceSnapshot();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PerformanceSnapshot => this.snapshot;

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.lastSampleAt = nowMs();
    this.previousCounters = { ...this.counters };
    this.previousMockRuntime = { ...this.runtimeDiagnostics.mockRuntime };
    if (enabled) this.startRuntimeSampling();
    else this.stopRuntimeSampling();
    this.sample();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  recordCounter(key: CounterKey, amount = 1): void {
    if (!this.enabled) return;
    this.counters[key] += amount;
  }

  recordDuration(key: DurationKey | string, durationMs: number): void {
    if (!this.enabled || !Number.isFinite(durationMs) || durationMs < 0) return;
    const values = this.durations.get(key) ?? [];
    boundedDurationPush(values, { value: durationMs, timestamp: nowMs() }, MAX_DURATION_SAMPLES);
    this.durations.set(key, values);
    this.sessionMax.set(key, Math.max(this.sessionMax.get(key) ?? 0, durationMs));
  }

  recordStreamIncoming(payloadChars = 0): void {
    this.recordCounter("streamIncoming");
    if (payloadChars > 0) this.recordCounter("payloadChars", payloadChars);
  }

  recordStreamProcessed(payloadChars = 0): void {
    this.recordCounter("streamProcessed");
    if (payloadChars > 0) this.recordCounter("payloadChars", payloadChars);
  }

  recordUiCommitted(count: number): void {
    this.recordCounter("uiCommitted", count);
  }

  recordCoalesced(count: number): void {
    this.recordCounter("coalesced", count);
  }

  setDeferredBacklog(count: number): void {
    this.deferredBacklog = Math.max(0, count);
  }

  setIngestionQueue(count: number): void {
    this.ingestionQueue = Math.max(0, count);
  }

  setRetainedMessages(count: number): void {
    this.retainedMessages = Math.max(0, count);
  }

  recordPayloadRequest(operation: string, durationMs: number): void {
    this.recordDuration(`payload:${operation}`, durationMs);
  }

  setPayloadInFlight(count: number): void {
    this.payloadInFlight = Math.max(0, count);
  }

  setPayloadDocuments(count: number): void {
    this.payloadDocuments = Math.max(0, count);
  }

  setPayloadWorkerStats(stats: PayloadWorkerMemoryStats): void {
    this.payloadWorkerMemory = {
      documentCount: Math.max(0, Number(stats.documentCount) || 0),
      decodedDocumentCount: Math.max(0, Number(stats.decodedDocumentCount) || 0),
      indexedDocumentCount: Math.max(0, Number(stats.indexedDocumentCount) || 0),
      pinnedDocumentCount: Math.max(0, Number(stats.pinnedDocumentCount) || 0),
      rawBytes: Math.max(0, Number(stats.rawBytes) || 0),
      indexBytes: Math.max(0, Number(stats.indexBytes) || 0),
      residentBytes: Math.max(0, Number(stats.residentBytes) || 0),
    };
  }

  recordMockDuration(operation: "source-sync" | "runtime-update" | "query" | "get-scenarios" | "server-start" | "server-update", durationMs: number): void {
    this.recordDuration(`mock:${operation}`, durationMs);
  }

  setMockInFlight(count: number): void {
    this.mockInFlight = Math.max(0, count);
  }

  setMockCounts(methods: number, scenarios: number, visibleRows: number): void {
    this.mockCounts = { methods, scenarios, visibleRows };
  }

  recordInteraction(name: string, durationMs: number): void {
    if (!this.enabled || !Number.isFinite(durationMs) || durationMs < 0) return;
    const values = this.interactionByName.get(name) ?? [];
    boundedDurationPush(values, { value: durationMs, timestamp: nowMs() }, MAX_DURATION_SAMPLES);
    this.interactionByName.set(name, values);
    this.sessionMax.set(`interaction:${name}`, Math.max(this.sessionMax.get(`interaction:${name}`) ?? 0, durationMs));
    this.recordDuration("interaction", durationMs);
  }

  recordReactCommit(area: "Workbench" | "Mocking" | "Response", durationMs: number): void {
    if (!this.enabled) return;
    const counterKey = area === "Workbench" ? "reactWorkbench" : area === "Mocking" ? "reactMocking" : "reactResponse";
    this.counters[counterKey] += 1;
    this.recordDuration(`react:${area}`, durationMs);
  }

  recordRenderInvocation(area: RenderArea): void {
    if (!this.enabled) return;
    const counterByArea: Record<RenderArea, keyof RateState> = {
      container: "renderContainer",
      collections: "renderCollections",
      responsePanel: "renderResponsePanel",
      latestViewer: "renderLatestViewer",
      messageWorkspace: "renderMessageWorkspace",
      statusBar: "renderStatusBar",
    };
    this.counters[counterByArea[area]] += 1;
  }

  setRuntimeDiagnostics(diagnostics: RuntimeDiagnosticsInput): void {
    this.runtimeDiagnostics = diagnostics;
  }

  setRuntime(runtime: Partial<RuntimeState>): void {
    if (!this.enabled) return;
    this.runtime = { ...this.runtime, ...runtime };
  }

  sample(): PerformanceSnapshot {
    const next = this.createPerformanceSnapshot();
    this.snapshot = next;
    this.history.push(next);
    if (this.history.length > MAX_HISTORY_SAMPLES) this.history.splice(0, this.history.length - MAX_HISTORY_SAMPLES);
    for (const listener of this.listeners) listener();
    return next;
  }

  getHistory(): PerformanceSnapshot[] {
    return [...this.history];
  }

  reset(): void {
    this.counters = emptyRates();
    this.previousCounters = emptyRates();
    this.durations.clear();
    this.sessionMax.clear();
    this.frameSamples = [];
    this.longTaskTimes = [];
    this.interactionByName.clear();
    this.deferredBacklog = 0;
    this.ingestionQueue = 0;
    this.retainedMessages = 0;
    this.payloadInFlight = 0;
    this.payloadDocuments = 0;
    this.payloadWorkerMemory = { documentCount: 0, decodedDocumentCount: 0, indexedDocumentCount: 0, pinnedDocumentCount: 0, rawBytes: 0, indexBytes: 0, residentBytes: 0 };
    this.mockInFlight = 0;
    this.mockCounts = { methods: 0, scenarios: 0, visibleRows: 0 };
    this.runtimeDiagnostics = {
      responseRuntime: { responseSessionCount: 0, responseRegistryRecords: 0, responseRegistryDocumentRefs: 0 },
      mockRuntime: { polls: 0, runtimeStatusPolls: 0, publishedChanges: 0 },
      transportLifecycle: {
        activeDecodeWorkers: 0,
        pendingDecodeAcks: 0,
        payloadProducerChannels: 0,
        activeStreamSubscriptions: 0,
        activeTransportProcesses: 0,
        deferredEventCount: 0,
        ingestionQueueDepth: 0,
      },
    };
    this.previousMockRuntime = { polls: 0, runtimeStatusPolls: 0, publishedChanges: 0 };
    this.history = [];
    this.lastSampleAt = nowMs();
    this.snapshot = this.createPerformanceSnapshot();
    for (const listener of this.listeners) listener();
  }

  private createPerformanceSnapshot(): PerformanceSnapshot {
    const currentAt = nowMs();
    const elapsedSeconds = Math.max(0.001, (currentAt - this.lastSampleAt) / 1000);
    const rate = (key: keyof RateState) => round((this.counters[key] - this.previousCounters[key]) / elapsedSeconds, 1);
    const frames = this.frameSamples;
    const frameAverage = frames.length ? frames.reduce((sum, item) => sum + item, 0) / frames.length : 0;
    const sidebarSamples = [
      ...recentDurationSamples(this.interactionByName.get("sidebar-section-switch") ?? [], currentAt),
      ...recentDurationSamples(this.interactionByName.get("sidebar-section-repeat") ?? [], currentAt),
    ].slice(-MAX_DURATION_SAMPLES).map((sample) => sample.value);
    const memory = typeof performance !== "undefined"
      ? (performance as Performance & {
          memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number };
        }).memory
      : undefined;
    const usedHeapMb = memory?.usedJSHeapSize ? round(memory.usedJSHeapSize / 1024 / 1024, 1) : undefined;
    const totalHeapMb = memory?.totalJSHeapSize ? round(memory.totalJSHeapSize / 1024 / 1024, 1) : undefined;
    const heapLimitMb = memory?.jsHeapSizeLimit ? round(memory.jsHeapSizeLimit / 1024 / 1024, 1) : undefined;
    const recentLongTasks = this.longTaskTimes.filter((timestamp) => currentAt - timestamp <= LONG_TASK_WINDOW_MS);
    this.longTaskTimes = recentLongTasks;
    const mockPollsPerSec = round((this.runtimeDiagnostics.mockRuntime.polls - this.previousMockRuntime.polls) / elapsedSeconds, 1);
    const runtimeStatusPollsPerSec = round(
      (this.runtimeDiagnostics.mockRuntime.runtimeStatusPolls - this.previousMockRuntime.runtimeStatusPolls) / elapsedSeconds,
      1,
    );
    const mockPublishedChangesPerSec = round(
      (this.runtimeDiagnostics.mockRuntime.publishedChanges - this.previousMockRuntime.publishedChanges) / elapsedSeconds,
      1,
    );

    const snapshot: PerformanceSnapshot = {
      sampledAt: Date.now(),
      enabled: this.enabled,
      runtime: {
        ...this.runtime,
        ...(usedHeapMb === undefined ? {} : { heapMb: usedHeapMb, usedHeapMb }),
        ...(totalHeapMb === undefined ? {} : { totalHeapMb }),
        ...(heapLimitMb === undefined ? {} : { heapLimitMb }),
      },
      mainThread: {
        fps: frameAverage > 0 ? round(Math.min(240, 1000 / frameAverage), 1) : 0,
        frameP50Ms: round(percentile(frames, 0.5), 1),
        frameP95Ms: round(percentile(frames, 0.95), 1),
        frameMaxMs: round(frames.length ? Math.max(...frames) : 0, 1),
        longTasks10s: recentLongTasks.length,
        sidebarLastMs: round(sidebarSamples.at(-1) ?? 0, 1),
        sidebarP95Ms: round(percentile(sidebarSamples, 0.95), 1),
      },
      stream: {
        incomingPerSec: rate("streamIncoming"),
        processedPerSec: rate("streamProcessed"),
        uiCommittedPerSec: rate("uiCommitted"),
        payloadCharsPerSec: rate("payloadChars"),
        deferredBacklog: this.deferredBacklog,
        ingestionQueue: this.ingestionQueue,
        coalescedPerSec: rate("coalesced"),
        retainedMessages: this.retainedMessages,
      },
      payloadWorker: {
        inFlight: this.payloadInFlight,
        retainedDocuments: this.payloadDocuments,
        actualDocumentCount: this.payloadWorkerMemory.documentCount,
        decodedDocuments: this.payloadWorkerMemory.decodedDocumentCount,
        indexedDocuments: this.payloadWorkerMemory.indexedDocumentCount,
        pinnedDocuments: this.payloadWorkerMemory.pinnedDocumentCount,
        residentMb: round(this.payloadWorkerMemory.residentBytes / 1024 / 1024, 1),
        rawMb: round(this.payloadWorkerMemory.rawBytes / 1024 / 1024, 1),
        indexMb: round(this.payloadWorkerMemory.indexBytes / 1024 / 1024, 1),
        registerP95Ms: round(Math.max(this.p95("payload:register-value", currentAt), this.p95("payload:register-utf8", currentAt)), 1),
        getMetaP95Ms: round(this.p95("payload:get-meta", currentAt), 1),
        getLinesP95Ms: round(this.p95("payload:get-lines", currentAt), 1),
        searchP95Ms: round(this.p95("payload:search", currentAt), 1),
        getTextP95Ms: round(this.p95("payload:get-text", currentAt), 1),
      },
      mockCatalog: {
        inFlight: this.mockInFlight,
        methods: this.mockCounts.methods,
        scenarios: this.mockCounts.scenarios,
        visibleRows: this.mockCounts.visibleRows,
        sourceSyncP95Ms: round(this.p95("mock:source-sync", currentAt), 1),
        queryP95Ms: round(this.p95("mock:query", currentAt), 1),
        runtimeUpdateP95Ms: round(this.p95("mock:runtime-update", currentAt), 1),
        serverStartP95Ms: round(this.p95("mock:server-start", currentAt), 1),
        serverUpdateP95Ms: round(this.p95("mock:server-update", currentAt), 1),
      },
      responseRuntime: { ...this.runtimeDiagnostics.responseRuntime },
      mockRuntime: { mockPollsPerSec, runtimeStatusPollsPerSec, mockPublishedChangesPerSec },
      transportLifecycle: { ...this.runtimeDiagnostics.transportLifecycle },
      react: {
        containerRendersPerSec: rate("renderContainer"),
        collectionsRendersPerSec: rate("renderCollections"),
        workbenchCommitsPerSec: rate("reactWorkbench"),
        workbenchP95Ms: round(this.p95("react:Workbench", currentAt), 1),
        mockingCommitsPerSec: rate("reactMocking"),
        mockingP95Ms: round(this.p95("react:Mocking", currentAt), 1),
        responseCommitsPerSec: rate("reactResponse"),
        responseP95Ms: round(this.p95("react:Response", currentAt), 1),
        responsePanelRendersPerSec: rate("renderResponsePanel"),
        latestViewerRendersPerSec: rate("renderLatestViewer"),
        messageWorkspaceRendersPerSec: rate("renderMessageWorkspace"),
        statusBarRendersPerSec: rate("renderStatusBar"),
      },
      sessionMax: {
        sidebarMs: round(Math.max(this.sessionMax.get("interaction:sidebar-section-switch") ?? 0, this.sessionMax.get("interaction:sidebar-section-repeat") ?? 0), 1),
        payloadGetLinesMs: round(this.sessionMax.get("payload:get-lines") ?? 0, 1),
        mockRuntimeUpdateMs: round(this.sessionMax.get("mock:runtime-update") ?? 0, 1),
        workbenchCommitMs: round(this.sessionMax.get("react:Workbench") ?? 0, 1),
        mockingCommitMs: round(this.sessionMax.get("react:Mocking") ?? 0, 1),
        responseCommitMs: round(this.sessionMax.get("react:Response") ?? 0, 1),
      },
      recommendations: [],
    };
    snapshot.recommendations = createRecommendations(snapshot);
    this.previousCounters = { ...this.counters };
    this.previousMockRuntime = { ...this.runtimeDiagnostics.mockRuntime };
    this.lastSampleAt = currentAt;
    return snapshot;
  }

  private p95(key: string, currentAt = nowMs()): number {
    return percentile(this.recentDurationValues(key, currentAt), 0.95);
  }

  private recentDurationValues(key: string, currentAt = nowMs()): number[] {
    const samples = recentDurationSamples(this.durations.get(key) ?? [], currentAt);
    this.durations.set(key, samples);
    return samples.map((sample) => sample.value);
  }

  private startRuntimeSampling(): void {
    if (typeof window === "undefined") return;
    if (this.rafId === null) {
      this.lastFrameAt = nowMs();
      const tick = (timestamp: number) => {
        if (!this.enabled) return;
        const delta = timestamp - this.lastFrameAt;
        this.lastFrameAt = timestamp;
        if (delta > 0 && delta < 5_000) boundedPush(this.frameSamples, delta, MAX_FRAME_SAMPLES);
        this.rafId = window.requestAnimationFrame(tick);
      };
      this.rafId = window.requestAnimationFrame(tick);
    }
    if (!this.longTaskObserver && typeof PerformanceObserver !== "undefined") {
      try {
        this.longTaskObserver = new PerformanceObserver((list) => {
          if (!this.enabled) return;
          const timestamp = nowMs();
          for (const entry of list.getEntries()) {
            if (entry.duration >= 50) this.longTaskTimes.push(timestamp);
          }
        });
        this.longTaskObserver.observe({ entryTypes: ["longtask"] });
      } catch {
        this.longTaskObserver = null;
      }
    }
  }

  private stopRuntimeSampling(): void {
    if (this.rafId !== null && typeof window !== "undefined") window.cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
  }
}

export function createRecommendations(snapshot: PerformanceSnapshot): PerformanceRecommendation[] {
  const items: PerformanceRecommendation[] = [];
  if (snapshot.mainThread.frameP95Ms >= 40 || snapshot.mainThread.longTasks10s >= 3) {
    items.push({ area: "Main thread", severity: "bad", message: `Frame p95 ${snapshot.mainThread.frameP95Ms} ms; ${snapshot.mainThread.longTasks10s} long tasks / 10s.` });
  } else if (snapshot.mainThread.frameP95Ms >= 24) {
    items.push({ area: "Main thread", severity: "warn", message: `Frame p95 ${snapshot.mainThread.frameP95Ms} ms.` });
  }
  if (snapshot.stream.deferredBacklog >= 40 || snapshot.stream.ingestionQueue >= 8) {
    items.push({ area: "Stream", severity: "bad", message: `Backlog ${snapshot.stream.deferredBacklog}, ingestion queue ${snapshot.stream.ingestionQueue}.` });
  } else if (snapshot.stream.deferredBacklog > 0 || snapshot.stream.coalescedPerSec > 0) {
    items.push({ area: "Stream", severity: "warn", message: `Backlog ${snapshot.stream.deferredBacklog}; coalesced ${snapshot.stream.coalescedPerSec}/s.` });
  }
  if (snapshot.payloadWorker.searchP95Ms >= 100 || snapshot.payloadWorker.getLinesP95Ms >= 40 || snapshot.payloadWorker.inFlight >= 8) {
    items.push({ area: "Payload worker", severity: "bad", message: `Search p95 ${snapshot.payloadWorker.searchP95Ms} ms; getLines p95 ${snapshot.payloadWorker.getLinesP95Ms} ms; ${snapshot.payloadWorker.inFlight} in flight.` });
  } else if (snapshot.payloadWorker.searchP95Ms >= 50 || snapshot.payloadWorker.getLinesP95Ms >= 20) {
    items.push({ area: "Payload worker", severity: "warn", message: `Search p95 ${snapshot.payloadWorker.searchP95Ms} ms; getLines p95 ${snapshot.payloadWorker.getLinesP95Ms} ms.` });
  }
  if (snapshot.mockCatalog.sourceSyncP95Ms >= 250 || snapshot.mockCatalog.queryP95Ms >= 100 || snapshot.mockCatalog.inFlight >= 4) {
    items.push({ area: "Mock catalog", severity: "bad", message: `Source sync p95 ${snapshot.mockCatalog.sourceSyncP95Ms} ms; query p95 ${snapshot.mockCatalog.queryP95Ms} ms.` });
  } else if (snapshot.mockCatalog.sourceSyncP95Ms >= 100 || snapshot.mockCatalog.queryP95Ms >= 50) {
    items.push({ area: "Mock catalog", severity: "warn", message: `Source sync p95 ${snapshot.mockCatalog.sourceSyncP95Ms} ms; query p95 ${snapshot.mockCatalog.queryP95Ms} ms.` });
  }
  const reactP95 = Math.max(snapshot.react.workbenchP95Ms, snapshot.react.mockingP95Ms, snapshot.react.responseP95Ms);
  if (reactP95 >= 32) {
    items.push({ area: "React", severity: "bad", message: `Commit p95 peaked at ${reactP95} ms.` });
  } else if (reactP95 >= 16) {
    items.push({ area: "React", severity: "warn", message: `Commit p95 peaked at ${reactP95} ms.` });
  }
  if (!items.length) items.push({ area: "Main thread", severity: "ok", message: "No current bottleneck exceeds the warning thresholds." });
  return items;
}

export const performanceStats = new PerformanceStatsStore();

export function usePerformanceStatsSnapshot(): PerformanceSnapshot {
  return useSyncExternalStore(performanceStats.subscribe, performanceStats.getSnapshot, performanceStats.getSnapshot);
}
