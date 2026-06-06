import { isWebSocketUrl } from "../websocket/websocket-model";
import type { ApiCollection, TransportMode } from "../../shared/workbench-types";
import type { RpcMethodInfo } from "@/lib/types";

export function grpcBaseUrlFallback(candidate: string | undefined, fallback: string | undefined) {
  if (candidate && !isWebSocketUrl(candidate)) return candidate;
  if (fallback && !isWebSocketUrl(fallback)) return fallback;
  return "http://localhost:9080/grpc/web";
}

export function stripGrpcMethodPathFromUrl(
  candidate: string | undefined,
  method: RpcMethodInfo,
  fallback: string | undefined,
) {
  const base = grpcBaseUrlFallback(candidate, fallback).replace(/\/+$/, "");
  const suffixes = [`/${method.serviceName}/${method.methodName}`];
  const shortServiceName = method.serviceName.split(".").pop();
  if (shortServiceName && shortServiceName !== method.serviceName) {
    suffixes.push(`/${shortServiceName}/${method.methodName}`);
  }

  for (const suffix of suffixes) {
    if (base.endsWith(suffix)) {
      return base.slice(0, -suffix.length) || grpcBaseUrlFallback(undefined, fallback);
    }
  }

  return base;
}

export function findCollectionRequestById(collections: ApiCollection[], requestId: string) {
  for (const collection of collections) {
    const request = collection.requests.find((item) => item.id === requestId);
    if (request) return { ...request, collectionName: collection.name };
  }
  return null;
}

export function transportTargetLabel(transport: TransportMode): string {
  switch (transport) {
    case "native-grpc":
      return "Native gRPC target";
    case "websocket":
      return "WebSocket URL";
    case "rest":
      return "REST base URL";
    case "grpc-web":
      return "gRPC-Web base URL";
  }
}

export function transportTargetPlaceholder(transport: TransportMode): string {
  switch (transport) {
    case "native-grpc":
      return "127.0.0.1:50051";
    case "websocket":
      return "ws://localhost:8080";
    case "rest":
      return "https://api.example.com";
    case "grpc-web":
      return "https://gateway.example.com/grpc/web";
  }
}
