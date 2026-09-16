import type { GrpcResult } from "@/lib/types";

export type RequestResultSummary = {
  httpStatus?: number;
  trailers: Record<string, string>;
  headers: Record<string, string>;
  totalMessages: number;
  droppedMessages?: number;
  durationMs: number;
  requestUrl?: string;
  startedAt?: string;
  completedAt?: string;
  transport?: GrpcResult["transport"];
};

export function summarizeGrpcResult(result: GrpcResult): RequestResultSummary {
  return {
    httpStatus: result.httpStatus,
    trailers: { ...(result.trailers ?? {}) },
    headers: { ...(result.headers ?? {}) },
    totalMessages: result.totalMessages ?? (Array.isArray(result.messages) ? result.messages.length : 0),
    droppedMessages: result.droppedMessages,
    durationMs: result.durationMs ?? 0,
    requestUrl: result.requestUrl,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    transport: result.transport,
  };
}
