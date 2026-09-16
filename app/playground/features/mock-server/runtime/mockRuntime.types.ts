import type {
  MockServerStatus,
  RestMockStatus,
  WebSocketMockStatus,
} from "../../../shared/workbench-types";

export type MockRuntimeSnapshot = {
  grpc: MockServerStatus;
  rest: RestMockStatus;
  websocket: WebSocketMockStatus;
  webAccess: MockServerStatus;
  version: number;
};

export type StateUpdater<T> = T | ((current: T) => T);

export type MockRuntimeDebugStats = {
  polls: number;
  runtimeStatusPolls: number;
  publishedChanges: number;
};

export type MockRuntimeStore = {
  getSnapshot(): MockRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  getGrpc(): MockServerStatus;
  getRest(): RestMockStatus;
  getWebSocket(): WebSocketMockStatus;
  getWebAccess(): MockServerStatus;
  patchGrpc(update: StateUpdater<MockServerStatus>): void;
  patchRest(update: StateUpdater<RestMockStatus>): void;
  patchWebSocket(update: StateUpdater<WebSocketMockStatus>): void;
  patchWebAccess(update: StateUpdater<MockServerStatus>): void;
  recordPoll(): void;
  recordRuntimeStatusPoll(): void;
  getDebugStats(): MockRuntimeDebugStats;
  reset(): void;
};
