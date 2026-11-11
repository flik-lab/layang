import type { ProtoLibraryVersion } from "../app/playground/features/proto-library/proto-library-types";
import type { RpcMethodInfo } from "./types";

// Version objects are immutable. Weak keys release metadata with the workspace;
// cached entries never own compiled protobuf roots or scenario bodies.
const metadataCache = new WeakMap<ProtoLibraryVersion, RpcMethodInfo[]>();

export function readProtoCatalog(version: ProtoLibraryVersion, signal: AbortSignal): Promise<RpcMethodInfo[]> {
  if (signal.aborted) return Promise.reject(new DOMException("Catalog cancelled", "AbortError"));
  const cached = metadataCache.get(version);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const workerPath = window.location.protocol === "file:"
      ? "./workers/proto-catalog.worker.js" : "/workers/proto-catalog.worker.js";
    const worker = new Worker(new URL(workerPath, window.location.href), { name: "layang-proto-catalog" });
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException("Catalog cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Proto catalog compilation timed out."));
    }, 60_000);
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = event => { cleanup(); reject(new Error(event.message || "Proto catalog worker failed.")); };
    worker.onmessage = (event: MessageEvent<{ methods?: RpcMethodInfo[]; error?: string }>) => {
      cleanup();
      if (!event.data.methods) { reject(new Error(event.data.error || "Invalid proto catalog response.")); return; }
      metadataCache.set(version, event.data.methods);
      resolve(event.data.methods);
    };
    try { worker.postMessage(version.files); }
    catch (error) { cleanup(); reject(error); }
  });
}
