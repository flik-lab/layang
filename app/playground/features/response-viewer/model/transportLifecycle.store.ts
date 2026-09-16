export type TransportLifecycleCounter =
  | "activeDecodeWorkers"
  | "pendingDecodeAcks"
  | "payloadProducerChannels"
  | "activeStreamSubscriptions"
  | "activeTransportProcesses";

export type TransportLifecycleSnapshot = {
  activeDecodeWorkers: number;
  pendingDecodeAcks: number;
  payloadProducerChannels: number;
  activeStreamSubscriptions: number;
  activeTransportProcesses: number;
  deferredEventCount: number;
  ingestionQueueDepth: number;
};

export type TransportLifecycleStore = {
  getSnapshot(): TransportLifecycleSnapshot;
  increment(counter: TransportLifecycleCounter, amount?: number): void;
  decrement(counter: TransportLifecycleCounter, amount?: number): void;
  setDeferredEventCount(count: number): void;
  setIngestionQueueDepth(count: number): void;
  setActiveTransportProcesses(count: number): void;
  reset(): void;
};

const EMPTY_SNAPSHOT: TransportLifecycleSnapshot = {
  activeDecodeWorkers: 0,
  pendingDecodeAcks: 0,
  payloadProducerChannels: 0,
  activeStreamSubscriptions: 0,
  activeTransportProcesses: 0,
  deferredEventCount: 0,
  ingestionQueueDepth: 0,
};

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function createTransportLifecycleStore(): TransportLifecycleStore {
  let snapshot: TransportLifecycleSnapshot = { ...EMPTY_SNAPSHOT };

  const updateCounter = (counter: TransportLifecycleCounter, delta: number): void => {
    const next = normalizeCount(snapshot[counter] + delta);
    if (next === snapshot[counter]) return;
    snapshot = { ...snapshot, [counter]: next };
  };

  return {
    getSnapshot: () => snapshot,
    increment(counter, amount = 1) {
      updateCounter(counter, normalizeCount(amount));
    },
    decrement(counter, amount = 1) {
      updateCounter(counter, -normalizeCount(amount));
    },
    setDeferredEventCount(count) {
      const next = normalizeCount(count);
      if (next !== snapshot.deferredEventCount) snapshot = { ...snapshot, deferredEventCount: next };
    },
    setIngestionQueueDepth(count) {
      const next = normalizeCount(count);
      if (next !== snapshot.ingestionQueueDepth) snapshot = { ...snapshot, ingestionQueueDepth: next };
    },
    setActiveTransportProcesses(count) {
      const next = normalizeCount(count);
      if (next !== snapshot.activeTransportProcesses) snapshot = { ...snapshot, activeTransportProcesses: next };
    },
    reset() {
      snapshot = { ...EMPTY_SNAPSHOT };
    },
  };
}

export const transportLifecycleStore = createTransportLifecycleStore();
