import type { GrpcEvent, GrpcResult, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "./types";

type NativeGrpcPayload = {
  runId?: string;
  targetUrl: string;
  protoFiles: ProtoSourceFile[];
  method: RpcMethodInfo;
  requestJson: unknown;
  metadata: MetadataPair[];
  deadlineMs?: number;
  maxMessages?: number;
  onEvent?: (event: GrpcEvent) => void;
};

/**
 * Checks whether the Electron native gRPC bridge is available to the renderer.
 */
export function hasNativeGrpcBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronGrpc?.isAvailable);
}

/**
 * Delegates a request to the Electron native gRPC bridge and returns the normalized result.
 */
export async function invokeNativeGrpc(payload: NativeGrpcPayload): Promise<GrpcResult> {
  if (!hasNativeGrpcBridge() || !window.electronGrpc) {
    throw new Error("Native gRPC is available only in the Electron desktop app. Use gRPC-Web in the browser build.");
  }

  return window.electronGrpc.invoke(payload);
}
