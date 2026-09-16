"use client";

import { useSyncExternalStore } from "react";
import type { MockServerStatus, RestMockStatus, WebSocketMockStatus } from "../../../shared/workbench-types";
import { mockRuntimeStore } from "./mockRuntime.store";

function useRuntimeSlice<T>(getSnapshot: () => T): T {
  return useSyncExternalStore(mockRuntimeStore.subscribe, getSnapshot, getSnapshot);
}

export function useGrpcMockRuntimeStatus(): MockServerStatus {
  return useRuntimeSlice(mockRuntimeStore.getGrpc);
}

export function useRestMockRuntimeStatus(): RestMockStatus {
  return useRuntimeSlice(mockRuntimeStore.getRest);
}

export function useWebSocketMockRuntimeStatus(): WebSocketMockStatus {
  return useRuntimeSlice(mockRuntimeStore.getWebSocket);
}

export function useWebAccessRuntimeStatus(): MockServerStatus {
  return useRuntimeSlice(mockRuntimeStore.getWebAccess);
}
