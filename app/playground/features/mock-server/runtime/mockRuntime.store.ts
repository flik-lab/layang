import type { MockServerStatus, RestMockStatus, WebSocketMockStatus } from "../../../shared/workbench-types";
import type { MockRuntimeSnapshot, MockRuntimeStore, StateUpdater } from "./mockRuntime.types";

const INITIAL_GRPC: MockServerStatus = { running: false };
const INITIAL_REST: RestMockStatus = { running: false };
const INITIAL_WEBSOCKET: WebSocketMockStatus = { running: false };
const INITIAL_WEB_ACCESS: MockServerStatus = { running: false, runtimeKind: "gateway" };

function resolveUpdate<T>(current: T, update: StateUpdater<T>): T {
  return typeof update === "function" ? (update as (value: T) => T)(current) : update;
}

export function semanticEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) if (!semanticEqual(left[index], right[index])) return false;
    return true;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.hasOwn(rightRecord, key) || !semanticEqual(leftRecord[key], rightRecord[key])) return false;
  }
  return true;
}

function createMockRuntimeStore(): MockRuntimeStore {
  let snapshot: MockRuntimeSnapshot = {
    grpc: INITIAL_GRPC,
    rest: INITIAL_REST,
    websocket: INITIAL_WEBSOCKET,
    webAccess: INITIAL_WEB_ACCESS,
    version: 0,
  };
  const listeners = new Set<() => void>();
  let polls = 0;
  let runtimeStatusPolls = 0;
  let publishedChanges = 0;

  const publishField = <K extends "grpc" | "rest" | "websocket" | "webAccess">(
    key: K,
    update: StateUpdater<MockRuntimeSnapshot[K]>,
  ): void => {
    const current = snapshot[key];
    const next = resolveUpdate(current, update);
    if (semanticEqual(current, next)) return;
    snapshot = { ...snapshot, [key]: next, version: snapshot.version + 1 };
    publishedChanges += 1;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getGrpc: () => snapshot.grpc,
    getRest: () => snapshot.rest,
    getWebSocket: () => snapshot.websocket,
    getWebAccess: () => snapshot.webAccess,
    patchGrpc: (update) => publishField("grpc", update),
    patchRest: (update) => publishField("rest", update),
    patchWebSocket: (update) => publishField("websocket", update),
    patchWebAccess: (update) => publishField("webAccess", update),
    recordPoll() { polls += 1; },
    recordRuntimeStatusPoll() { runtimeStatusPolls += 1; },
    getDebugStats: () => ({ polls, runtimeStatusPolls, publishedChanges }),
    reset() {
      snapshot = {
        grpc: INITIAL_GRPC,
        rest: INITIAL_REST,
        websocket: INITIAL_WEBSOCKET,
        webAccess: INITIAL_WEB_ACCESS,
        version: snapshot.version + 1,
      };
      polls = 0;
      runtimeStatusPolls = 0;
      publishedChanges = 0;
      for (const listener of listeners) listener();
    },
  };
}

export const mockRuntimeStore = createMockRuntimeStore();
