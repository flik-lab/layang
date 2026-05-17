import type { RpcMethodInfo } from "@/lib/types";

/** Builds the stable key for a service/method pair. */
export function methodKey(method: RpcMethodInfo): string {
  return `${method.serviceName}/${method.methodName}`;
}

/** Returns the display label for unary or streaming methods. */
export function methodTypeLabel(method: RpcMethodInfo): string {
  if (method.requestStream && method.responseStream) return "Bidi streaming";
  if (method.requestStream) return "Client streaming";
  if (method.responseStream) return "Server streaming";
  return "Unary";
}
