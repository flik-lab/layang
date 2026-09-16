import { transportLifecycleStore } from "../app/playground/features/response-viewer/model/transportLifecycle.store";
import type { GrpcEvent, GrpcResult, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "./types";

type NativeGrpcPayload = {
  runId?: string;
  targetUrl: string;
  protoFiles: ProtoSourceFile[];
  method: RpcMethodInfo;
  requestJson: unknown;
  metadata: MetadataPair[];
  deadlineMs?: number;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxMessages?: number;
  onEvent?: (event: GrpcEvent) => void;
};

/** Checks whether the Electron native gRPC bridge is available to the renderer. */
export function hasNativeGrpcBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronGrpc?.isAvailable);
}

/**
 * Delegates native gRPC to Electron. Raw response bytes flow main -> payload worker
 * through the dedicated producer MessagePort; this client receives metadata only.
 */
export async function invokeNativeGrpc(payload: NativeGrpcPayload): Promise<GrpcResult> {
  if (!hasNativeGrpcBridge() || !window.electronGrpc) {
    throw new Error("Native gRPC is available only in the Electron desktop app. Use gRPC-Web in the browser build.");
  }

  const runId = payload.runId || createRendererRunId();
  const { onEvent, ...bridgePayload } = payload;
  const handleEvent = (event: GrpcEvent): void => {
    if (event.type === "message" && "documentRef" in event && event.documentRef) {
      onEvent?.(event);
      return;
    }
    onEvent?.(event);
  };
  transportLifecycleStore.increment("activeStreamSubscriptions");
  try {
    return await window.electronGrpc.invoke({ ...bridgePayload, runId, onEvent: handleEvent });
  } finally {
    transportLifecycleStore.decrement("activeStreamSubscriptions");
  }
}

function createRendererRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
