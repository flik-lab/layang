import { transportLifecycleStore } from "../app/playground/features/response-viewer/model/transportLifecycle.store";
import { GRPC_WEB_DECODE_WORKER_SOURCE } from "./grpc-web-decode-worker-source";
import type { GrpcWebWorkerSchema } from "./grpc-web-worker-schema";

export type ResponseDocumentRef = {
  id: string;
  preview: string;
  originalChars: number;
};

export type GrpcWebDecodeWorkerFrame =
  | { kind: "message"; documentRef: ResponseDocumentRef; frameBytes: number }
  | { kind: "trailers"; trailers: Record<string, string> };

export type GrpcWebDecodeBatch = {
  frames: GrpcWebDecodeWorkerFrame[];
  decodedBinaryBytes: number;
  dataFrames: number;
  trailerFrames: number;
  bufferedBytes: number;
};

export type GrpcWebDecodeWorkerClient = {
  processChunk(chunk: Uint8Array<ArrayBufferLike>, final?: boolean): Promise<GrpcWebDecodeBatch>;
  dispose(): void;
};

type WorkerResponse =
  | { type: "ready"; requestId: string }
  | { type: "batch"; requestId: string; batch: GrpcWebDecodeBatch }
  | { type: "error"; requestId: string; error: string };

type PendingWorkerRequest = {
  resolve: (value: GrpcWebDecodeBatch | undefined) => void;
  reject: (error: Error) => void;
};

type CreateGrpcWebDecodeWorkerClientOptions = {
  schema: GrpcWebWorkerSchema;
  responseEncoding: "text" | "binary";
  producerPort: MessagePort;
  maxPreviewChars?: number;
  documentPrefix?: string;
};

const emptyBatch: GrpcWebDecodeBatch = {
  frames: [],
  decodedBinaryBytes: 0,
  dataFrames: 0,
  trailerFrames: 0,
  bufferedBytes: 0,
};

/** Creates one stateful decode worker. The worker requires a direct document-worker producer port. */
export function createGrpcWebDecodeWorkerClient(options: CreateGrpcWebDecodeWorkerClientOptions): GrpcWebDecodeWorkerClient {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new Error("gRPC-Web Decode Worker is required but unavailable in this environment.");
  }

  let workerUrl = URL.createObjectURL(new Blob([GRPC_WEB_DECODE_WORKER_SOURCE], { type: "text/javascript" }));
  let worker: Worker | null = new Worker(workerUrl, { name: "layang-grpc-web-decode" });
  let disposed = false;
  let sequence = 0;
  const pending = new Map<string, PendingWorkerRequest>();
  transportLifecycleStore.increment("activeDecodeWorkers");

  const rejectPending = (message: string) => {
    const error = new Error(message);
    const pendingCount = pending.size;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    if (pendingCount > 0) transportLifecycleStore.decrement("pendingDecodeAcks", pendingCount);
  };

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.requestId);
    if (!request) return;
    pending.delete(response.requestId);
    transportLifecycleStore.decrement("pendingDecodeAcks");
    if (response.type === "error") request.reject(new Error(response.error));
    else if (response.type === "batch") request.resolve(response.batch);
    else request.resolve(undefined);
  };
  worker.onerror = (event) => rejectPending(event.message || "gRPC-Web decode worker failed.");

  const post = (message: Record<string, unknown>, transfer: Transferable[] = []) => {
    if (disposed || !worker) return Promise.reject(new Error("gRPC-Web decode worker is not available."));
    sequence += 1;
    const requestId = `grpc-web-decode:${sequence}`;
    return new Promise<GrpcWebDecodeBatch | undefined>((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      transportLifecycleStore.increment("pendingDecodeAcks");
      try {
        worker?.postMessage({ ...message, requestId }, transfer);
      } catch (error) {
        pending.delete(requestId);
        transportLifecycleStore.decrement("pendingDecodeAcks");
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  const ready = post(
    {
      type: "init",
      schema: options.schema,
      responseEncoding: options.responseEncoding,
      maxPreviewChars: options.maxPreviewChars ?? 12_000,
      documentPrefix: options.documentPrefix ?? `grpc-web:${Date.now().toString(36)}`,
      payloadDocumentPort: options.producerPort,
    },
    [options.producerPort],
  );

  return {
    async processChunk(chunk, final = false) {
      await ready;
      if (disposed) return emptyBatch;
      const transferBuffer =
        chunk.buffer instanceof ArrayBuffer && chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength
          ? chunk.buffer
          : chunk.slice().buffer;
      const result = await post({ type: "chunk", buffer: transferBuffer, final }, [transferBuffer]);
      return result ?? emptyBatch;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { worker?.postMessage({ type: "dispose" }); } catch { /* already stopped */ }
      worker?.terminate();
      worker = null;
      URL.revokeObjectURL(workerUrl);
      workerUrl = "";
      rejectPending("gRPC-Web decode worker was disposed.");
      transportLifecycleStore.decrement("activeDecodeWorkers");
    },
  };
}
