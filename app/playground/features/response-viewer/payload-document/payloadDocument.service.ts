"use client";

import { transportLifecycleStore } from "../model/transportLifecycle.store";
import { createPayloadDocumentClient } from "./payloadDocument.client";
import type {
  PayloadDocumentClient,
  PayloadDocumentDebugStats,
  PayloadDocumentRef,
  PayloadHydrationPriority,
  PayloadSearchMatch,
} from "./payloadDocument.types";
import { createUtilityPayloadDocumentClient } from "./utilityPayloadDocument.client";
import { createTransportPayloadDocumentClient } from "./transportPayloadDocument.client";

export type PayloadDocumentProducerChannel = {
  producerPort: MessagePort;
  ready: Promise<void>;
  release(): void;
};

const NATIVE_PRODUCER_PORT_TIMEOUT_MS = 2_000;

class PayloadDocumentService {
  private workerClient: PayloadDocumentClient | null = null;
  private utilityClient: PayloadDocumentClient | null = null;
  private transportClient: PayloadDocumentClient | null = null;
  private nativeProducerReady: Promise<void> | null = null;
  private pinCounts = new Map<string, number>();
  private deferredReleaseIds = new Set<string>();
  private utilityDocumentIds = new Set<string>();

  private isUtilityMode(): boolean {
    return typeof window !== "undefined" && window.electronRuntime?.mode === "utility";
  }

  private getWorkerClient(): PayloadDocumentClient {
    if (!this.workerClient) this.workerClient = createPayloadDocumentClient();
    return this.workerClient;
  }

  private getUtilityClient(): PayloadDocumentClient {
    if (!this.utilityClient) this.utilityClient = createUtilityPayloadDocumentClient();
    return this.utilityClient;
  }

  private getTransportClient(): PayloadDocumentClient {
    if (!this.transportClient) this.transportClient = createTransportPayloadDocumentClient();
    return this.transportClient;
  }

  private getDefaultClient(): PayloadDocumentClient {
    return this.isUtilityMode() ? this.getUtilityClient() : this.getWorkerClient();
  }

  private isTransportDocument(id: string): boolean {
    return id.startsWith("transport:");
  }

  private isUtilityDocument(id: string): boolean {
    return this.isUtilityMode() && (id.startsWith("runtime:") || id.startsWith("grpc:") || this.utilityDocumentIds.has(id));
  }

  private getReadClient(id: string): PayloadDocumentClient {
    if (this.isTransportDocument(id)) return this.getTransportClient();
    return this.isUtilityDocument(id) ? this.getUtilityClient() : this.getWorkerClient();
  }

  async registerValue(id: string, value: unknown): Promise<PayloadDocumentRef> {
    const client = this.getDefaultClient();
    const ref = await client.registerValue(id, value);
    if (client === this.utilityClient) this.utilityDocumentIds.add(ref.id);
    return ref;
  }

  async registerUtf8(id: string, bytes: ArrayBuffer, preview: string, originalChars: number): Promise<PayloadDocumentRef> {
    const client = this.getDefaultClient();
    const ref = await client.registerUtf8(id, bytes, preview, originalChars);
    if (client === this.utilityClient) this.utilityDocumentIds.add(ref.id);
    return ref;
  }

  /**
   * Main-mode native gRPC still uses the historical producer port. Utility mode
   * stores native payloads before they leave the utility process, so no renderer
   * producer channel is requested.
   */
  ensureNativeGrpcProducerPort(): Promise<void> {
    if (this.isUtilityMode()) return Promise.resolve();
    if (this.nativeProducerReady) return this.nativeProducerReady;
    if (typeof window === "undefined" || !window.electronGrpc?.isAvailable || !window.electronGrpc.requestPayloadPort) {
      return Promise.resolve();
    }

    this.nativeProducerReady = new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout: number | null = null;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onMessage);
        if (timeout !== null) window.clearTimeout(timeout);
        if (error) {
          this.nativeProducerReady = null;
          reject(error);
        } else {
          resolve();
        }
      };
      const onMessage = (event: MessageEvent<unknown>) => {
        if (event.source !== window) return;
        const data = event.data as { type?: string } | null;
        if (data?.type !== "layang-native-grpc-payload-port") return;
        const port = event.ports?.[0];
        if (!port) return;
        void this.getWorkerClient().attachProducerPort(port).then(() => finish()).catch((error: unknown) => {
          finish(error instanceof Error ? error : new Error(String(error)));
        });
      };

      window.addEventListener("message", onMessage);
      timeout = window.setTimeout(
        () => finish(new Error("Native gRPC payload channel was not attached to the document worker.")),
        NATIVE_PRODUCER_PORT_TIMEOUT_MS,
      );
      const requested = window.electronGrpc?.requestPayloadPort?.();
      if (requested === false) finish(new Error("Native gRPC payload channel is no longer available."));
    });

    return this.nativeProducerReady;
  }

  getMeta(id: string, _priority: PayloadHydrationPriority = "interactive") {
    return this.getReadClient(id).getMeta(id);
  }

  getLines(
    id: string,
    start: number,
    count: number,
    _priority: PayloadHydrationPriority = "interactive",
  ) {
    return this.getReadClient(id).getLines(id, start, count);
  }

  prepareWindow(id: string, start: number, count: number) {
    return this.getReadClient(id).prepareWindow(id, start, count);
  }

  async search(ids: string[], query: string, limit?: number): Promise<PayloadSearchMatch[]> {
    const transportIds = ids.filter((id) => this.isTransportDocument(id));
    const utilityIds = ids.filter((id) => !this.isTransportDocument(id) && this.isUtilityDocument(id));
    const workerIds = ids.filter((id) => !this.isTransportDocument(id) && !this.isUtilityDocument(id));
    const [transportMatches, utilityMatches, workerMatches] = await Promise.all([
      transportIds.length ? this.getTransportClient().search(transportIds, query, limit) : Promise.resolve([]),
      utilityIds.length ? this.getUtilityClient().search(utilityIds, query, limit) : Promise.resolve([]),
      workerIds.length ? this.getWorkerClient().search(workerIds, query, limit) : Promise.resolve([]),
    ]);
    return [...transportMatches, ...utilityMatches, ...workerMatches].slice(0, limit ?? 2_000);
  }

  getText(id: string, format: "raw" | "pretty") {
    return this.getReadClient(id).getText(id, format);
  }

  async debugStats(): Promise<PayloadDocumentDebugStats> {
    if (!this.isUtilityMode()) return this.getWorkerClient().debugStats();
    const sources: Array<Promise<PayloadDocumentDebugStats>> = [this.getUtilityClient().debugStats()];
    if (typeof window !== "undefined" && window.electronGrpcWebTransport?.isAvailable) {
      sources.push(this.getTransportClient().debugStats().catch(() => emptyPayloadDocumentDebugStats()));
    }
    const stats = await Promise.all(sources);
    return stats.reduce<PayloadDocumentDebugStats>((total, item) => ({
      documentCount: total.documentCount + item.documentCount,
      decodedDocumentCount: total.decodedDocumentCount + item.decodedDocumentCount,
      indexedDocumentCount: total.indexedDocumentCount + item.indexedDocumentCount,
      pinnedDocumentCount: total.pinnedDocumentCount + item.pinnedDocumentCount,
      rawBytes: total.rawBytes + item.rawBytes,
      decodedChars: total.decodedChars + item.decodedChars,
      indexBytes: total.indexBytes + item.indexBytes,
      residentBytes: total.residentBytes + item.residentBytes,
    }), emptyPayloadDocumentDebugStats());
  }

  setRetentionLimit(limit: number): void {
    const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 10));
    if (this.isUtilityMode()) {
      this.getUtilityClient().setRetentionLimit(normalizedLimit);
      if (typeof window !== "undefined" && window.electronGrpcWebTransport?.isAvailable) {
        this.getTransportClient().setRetentionLimit(normalizedLimit);
      }
      return;
    }
    this.getWorkerClient().setRetentionLimit(normalizedLimit);
  }

  pin(id: string): void {
    if (!id) return;
    const nextCount = (this.pinCounts.get(id) ?? 0) + 1;
    this.pinCounts.set(id, nextCount);
    if (nextCount === 1) this.getReadClient(id).pin(id);
  }

  unpin(id: string): void {
    if (!id) return;
    const currentCount = this.pinCounts.get(id) ?? 0;
    if (currentCount <= 1) {
      this.pinCounts.delete(id);
      this.getReadClient(id).unpin(id);
      if (this.deferredReleaseIds.delete(id)) this.release([id]);
      return;
    }
    this.pinCounts.set(id, currentCount - 1);
  }

  release(ids: string[]): void {
    const transportIds: string[] = [];
    const utilityIds: string[] = [];
    const workerIds: string[] = [];
    for (const id of ids) {
      if ((this.pinCounts.get(id) ?? 0) > 0) {
        this.deferredReleaseIds.add(id);
        continue;
      }
      if (this.isTransportDocument(id)) transportIds.push(id);
      else if (this.isUtilityDocument(id)) utilityIds.push(id);
      else workerIds.push(id);
    }
    if (transportIds.length) this.getTransportClient().release(transportIds);
    if (utilityIds.length) {
      this.getUtilityClient().release(utilityIds);
      for (const id of utilityIds) this.utilityDocumentIds.delete(id);
    }
    if (workerIds.length) this.getWorkerClient().release(workerIds);
  }

  createProducerChannel(): PayloadDocumentProducerChannel {
    if (typeof MessageChannel === "undefined") {
      throw new Error("MessageChannel is required for gRPC-Web payload document transfer.");
    }
    const channel = new MessageChannel();
    let released = false;
    transportLifecycleStore.increment("payloadProducerChannels");
    const release = (): void => {
      if (released) return;
      released = true;
      try { channel.port2.close(); } catch { /* ownership may already be transferred */ }
      transportLifecycleStore.decrement("payloadProducerChannels");
    };
    const ready = this.getWorkerClient().attachProducerPort(channel.port1).catch((error: unknown) => {
      release();
      throw error;
    });
    return { producerPort: channel.port2, ready, release };
  }
}

function emptyPayloadDocumentDebugStats(): PayloadDocumentDebugStats {
  return {
    documentCount: 0,
    decodedDocumentCount: 0,
    indexedDocumentCount: 0,
    pinnedDocumentCount: 0,
    rawBytes: 0,
    decodedChars: 0,
    indexBytes: 0,
    residentBytes: 0,
  };
}

export const payloadDocumentService = new PayloadDocumentService();
