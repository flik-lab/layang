import type { RpcMethodInfo } from "@/lib/types";
import { methodKey } from "../../shared/rpc-method-utils";
import { grpcBindingIdentity } from "../proto-library/proto-library-domain";
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
  additionalGrpcMethodKeys: string[] = [],
): RequestSessionSourceIndex {
  const collectionRequests = new Map<string, ApiCollectionRequest>();
  for (const collection of collections) {
    for (const request of collection.requests) collectionRequests.set(request.id, request);
  }
  return {
    collectionRequests,
    validGrpcMethodKeys: new Set([...grpcMethods.map((method) => methodKey(method)), ...additionalGrpcMethodKeys]),
  };
}

export function getRequestSessionSource(session: RequestSession): RequestSessionSource {
  if (session.requestKind === "rest" || session.requestKind === "websocket" || session.requestKind === "grpc") {
    return {
      kind: "collection",
      requestId: session.sourceRequestId ?? session.methodKey,
      requestKind: session.requestKind,
      ...(session.requestKind === "grpc" ? { grpcMethodKey: session.grpc?.methodFullName } : {}),
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
  if (request.kind === "grpc") {
    const methodFullName = request.grpc?.methodFullName ?? request.grpcMethodKey;
    return methodFullName ? sourceIndex.validGrpcMethodKeys.has(methodFullName) : false;
  }
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
  const matchesIdentity = (item: RequestSession) =>
    item.id === session.id ||
    item.methodKey === session.methodKey ||
    Boolean(session.sourceRequestId && item.sourceRequestId === session.sourceRequestId);
  const existingIndex = sessions.findIndex(matchesIdentity);
  if (existingIndex === -1) return [session, ...sessions].slice(0, limit);
  const next: RequestSession[] = [];
  sessions.forEach((item, index) => {
    if (index === existingIndex) next.push(session);
    else if (!matchesIdentity(item)) next.push(item);
  });
  return next.slice(0, limit);
}

export function reorderRequestSessionList(
  sessions: RequestSession[],
  sourceId: string,
  targetId: string,
  position: "before" | "after",
): RequestSession[] {
  if (sourceId === targetId) return sessions;
  const source = sessions.find((session) => session.id === sourceId);
  const targetIndex = sessions.findIndex((session) => session.id === targetId);
  if (!source || targetIndex < 0) return sessions;

  const withoutSource = sessions.filter((session) => session.id !== sourceId);
  const adjustedTargetIndex = withoutSource.findIndex((session) => session.id === targetId);
  const insertionIndex = adjustedTargetIndex + (position === "after" ? 1 : 0);
  const next = [...withoutSource];
  next.splice(insertionIndex, 0, source);
  return next;
}

/**
 * Reuses an existing tab for a saved collection request. Legacy proto-only gRPC tabs
 * are adopted only when they have no collection source id, so two explicit saved
 * requests for the same RPC method can still remain as separate tabs.
 */
export function findReusableCollectionRequestSession(
  sessions: RequestSession[],
  request: ApiCollectionRequest,
): RequestSession | null {
  const direct = sessions.find((session) => session.sourceRequestId === request.id || session.methodKey === request.id);
  if (direct) return direct;
  if (request.kind !== "grpc") return null;
  const requestIdentity = grpcBindingIdentity(
    request.grpc,
    request.grpc?.methodFullName ?? request.grpcMethodKey ?? "",
  );
  if (!requestIdentity) return null;
  return (
    sessions.find(
      (session) =>
        !session.sourceRequestId &&
        session.requestKind !== "rest" &&
        session.requestKind !== "websocket" &&
        grpcBindingIdentity(session.grpc, session.methodKey) === requestIdentity,
    ) ?? null
  );
}

export function findReusableGrpcRequestSession(
  sessions: RequestSession[],
  activeSession: RequestSession | null | undefined,
  grpcMethodKey: string,
  sourceRequestId?: string,
): RequestSession | null {
  const matches = (session: RequestSession | null | undefined): session is RequestSession => {
    if (!session) return false;
    if (sourceRequestId) {
      return (
        session.sourceRequestId === sourceRequestId ||
        (session.requestKind === "grpc" && !session.sourceRequestId && session.methodKey === sourceRequestId) ||
        (!session.sourceRequestId && !session.requestKind && session.methodKey === grpcMethodKey)
      );
    }
    return !session.sourceRequestId && !session.requestKind && session.methodKey === grpcMethodKey;
  };

  return sessions.find(matches) ?? (matches(activeSession) ? activeSession : null);
}
