"use client";

import { useEffect } from "react";
import type { MockServerStatus, RestMockStatus, WebSocketMockStatus } from "../../../shared/workbench-types";
import { mockRuntimeStore } from "./mockRuntime.store";

type MockProtocol = "grpc" | "rest" | "websocket";

type MockStatusChangedPayload = {
  protocol: MockProtocol;
  status: MockServerStatus | RestMockStatus | WebSocketMockStatus;
};

function isMockStatusChangedPayload(value: unknown): value is MockStatusChangedPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (record.protocol === "grpc" || record.protocol === "rest" || record.protocol === "websocket") &&
    Boolean(record.status && typeof record.status === "object");
}

export function useMockRuntimeEvents(): void {
  useEffect(() => {
    if (window.electronRuntime?.mode !== "utility" || !window.electronRuntime?.onEvent) return;
    return window.electronRuntime.onEvent((event) => {
      if (event.event === "runtime.unavailable") {
        mockRuntimeStore.patchGrpc({ running: false });
        mockRuntimeStore.patchRest({ running: false });
        mockRuntimeStore.patchWebSocket({ running: false });
        return;
      }
      if (event.event !== "mock.statusChanged" || !isMockStatusChangedPayload(event.payload)) return;
      const { protocol, status } = event.payload;
      if (protocol === "grpc") mockRuntimeStore.patchGrpc(status as MockServerStatus);
      else if (protocol === "rest") mockRuntimeStore.patchRest(status as RestMockStatus);
      else mockRuntimeStore.patchWebSocket(status as WebSocketMockStatus);
    });
  }, []);
}
