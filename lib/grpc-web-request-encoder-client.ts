import type * as protobuf from "protobufjs";

/**
 * Runs gRPC-Web request encoding in the file-based worker built by
 * scripts/build-proto-catalog-worker.cjs. protobufjs generates its
 * verify/fromObject/encode functions with `new Function`; the packaged page
 * CSP has no 'unsafe-eval', but a worker loaded from its own script file does
 * not inherit the page policy. The worker caches parsed roots by key, so the
 * schema JSON crosses the thread boundary once per protobuf Root.
 */

type EncoderRequest = {
  id: number;
  key: string;
  rootJson?: protobuf.INamespace;
  requestType: string;
  requestJson: unknown;
};

type EncoderResponse =
  | { id: number; payload: Uint8Array<ArrayBuffer> }
  | { id: number; error: string }
  | { id: number; missingSchema: true };

type PendingRequest = {
  request: EncoderRequest;
  root: protobuf.Root;
  resolve: (payload: Uint8Array) => void;
  reject: (error: Error) => void;
};

const WORKER_FILE = "workers/grpc-web-request-encoder.worker.js";
const rootKeys = new WeakMap<protobuf.Root, string>();
const pending = new Map<number, PendingRequest>();
// Root keys already sent to the current worker instance.
const sentRootKeys = new Set<string>();
let worker: Worker | null = null;
let nextRootKey = 0;
let nextRequestId = 0;

/** True in a browser renderer; Node tests have no Worker and encode inline. */
export function canEncodeGrpcWebRequestInWorker(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

/** Encodes `requestJson` as `requestType` from `root` in the request encoder worker. */
export function encodeGrpcWebRequestInWorker(input: {
  root: protobuf.Root;
  requestType: string;
  requestJson: unknown;
}): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const key = rootKeyFor(input.root);
    const request: EncoderRequest = {
      id: ++nextRequestId,
      key,
      rootJson: sentRootKeys.has(key) ? undefined : input.root.toJSON(),
      requestType: input.requestType,
      requestJson: input.requestJson,
    };
    sentRootKeys.add(key);
    pending.set(request.id, { request, root: input.root, resolve, reject });
    post(request);
  });
}

function rootKeyFor(root: protobuf.Root): string {
  let key = rootKeys.get(root);
  if (!key) {
    key = `root-${++nextRootKey}`;
    rootKeys.set(root, key);
  }
  return key;
}

function post(request: EncoderRequest) {
  try {
    ensureWorker().postMessage(request);
  } catch (error) {
    settle(request.id, (entry) => entry.reject(error instanceof Error ? error : new Error(String(error))));
  }
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const workerPath = window.location.protocol === "file:" ? `./${WORKER_FILE}` : `/${WORKER_FILE}`;
  const created = new Worker(new URL(workerPath, window.location.href), { name: "layang-grpc-web-request-encoder" });
  created.onmessage = (event: MessageEvent<EncoderResponse>) => handleResponse(event.data);
  created.onerror = (event) => {
    event.preventDefault();
    failAll(new Error(`gRPC-Web request encoder worker failed: ${event.message || "worker could not be loaded"}`));
  };
  worker = created;
  return created;
}

function handleResponse(response: EncoderResponse) {
  const entry = pending.get(response.id);
  if (!entry) return;
  if ("missingSchema" in response) {
    // The worker evicted or never saw this root: resend once with the schema.
    if (entry.request.rootJson) {
      settle(response.id, (item) => item.reject(new Error("gRPC-Web request encoder worker rejected the schema.")));
      return;
    }
    entry.request = { ...entry.request, rootJson: entry.root.toJSON() };
    post(entry.request);
    return;
  }
  if ("error" in response) {
    settle(response.id, (item) => item.reject(new Error(response.error)));
    return;
  }
  settle(response.id, (item) => item.resolve(response.payload));
}

function settle(id: number, finish: (entry: PendingRequest) => void) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  finish(entry);
}

function failAll(error: Error) {
  worker?.terminate();
  worker = null;
  sentRootKeys.clear();
  const entries = [...pending.values()];
  pending.clear();
  for (const entry of entries) entry.reject(error);
}
