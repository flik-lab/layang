import type { RpcMethodInfo } from "@/lib/types";
import { methodKey } from "../../shared/rpc-method-utils";
import type { ApiCollection, ApiCollectionRequest, RequestSession } from "../../shared/workbench-types";

export type RequestSessionSource =
  | { kind: "collection"; requestId: string; requestKind: ApiCollectionRequest["kind"]; grpcMethodKey?: string }
  | { kind: "proto-method"; methodKey: string };

export type RequestSessionSourceIndex = {
  collectionRequests: Map<string, ApiCollectionRequest>;
  validGrpcMethodKeys: Set<string>;
};

export type SessionCleanupResult = {
  keptSessions: RequestSession[];
  removedSessions: RequestSession[];
  activeSessionRemoved: boolean;
  replacementSession: RequestSession | null;
};

export function buildRequestSessionSourceIndex(
  collections: ApiCollection[],
  grpcMethods: RpcMethodInfo[] = [],
): RequestSessionSourceIndex {
  const collectionRequests = new Map<string, ApiCollectionRequest>();
  for (const collection of collections) {
    for (const request of collection.requests) collectionRequests.set(request.id, request);
  }
  return {
    collectionRequests,
    validGrpcMethodKeys: new Set(grpcMethods.map((method) => methodKey(method))),
  };
}

export function getRequestSessionSource(session: RequestSession): RequestSessionSource {
  if (session.requestKind === "rest" || session.requestKind === "websocket" || session.requestKind === "grpc") {
    return {
      kind: "collection",
      requestId: session.methodKey,
      requestKind: session.requestKind,
    };
  }
  return { kind: "proto-method", methodKey: session.methodKey };
}

export function isRequestSessionSourceAvailable(
  session: RequestSession,
  sourceIndex: RequestSessionSourceIndex,
): boolean {
  const source = getRequestSessionSource(session);
  if (source.kind === "proto-method")
    return Boolean(source.methodKey && sourceIndex.validGrpcMethodKeys.has(source.methodKey));

  const request = sourceIndex.collectionRequests.get(source.requestId);
  if (!request || request.kind !== source.requestKind) return false;
  if (request.kind === "grpc" && request.grpcMethodKey)
    return sourceIndex.validGrpcMethodKeys.has(request.grpcMethodKey);
  return true;
}

export function cleanupRequestSessionsForDeletedSources(
  sessions: RequestSession[],
  activeRequestId: string,
  sourceIndex: RequestSessionSourceIndex,
): SessionCleanupResult {
  const keptSessions = sessions.filter((session) => isRequestSessionSourceAvailable(session, sourceIndex));
  const keptIds = new Set(keptSessions.map((session) => session.id));
  const removedSessions = sessions.filter((session) => !keptIds.has(session.id));
  const activeSessionRemoved = Boolean(activeRequestId && !keptIds.has(activeRequestId));
  return {
    keptSessions,
    removedSessions,
    activeSessionRemoved,
    replacementSession: activeSessionRemoved ? (keptSessions[0] ?? null) : null,
  };
}

export function upsertRequestSessionPreservingOrderList(
  sessions: RequestSession[],
  session: RequestSession,
  limit = 16,
): RequestSession[] {
  const existingIndex = sessions.findIndex((item) => item.id === session.id || item.methodKey === session.methodKey);
  if (existingIndex === -1) return [session, ...sessions].slice(0, limit);
  const next = [...sessions];
  next[existingIndex] = session;
  return next.slice(0, limit);
}
