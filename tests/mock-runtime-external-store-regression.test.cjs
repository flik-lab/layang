"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("mock runtime status is owned by a semantic external store", () => {
  const store = read("app/playground/features/mock-server/runtime/mockRuntime.store.ts");
  assert.match(store, /subscribe/);
  assert.match(store, /patchGrpc/);
  assert.match(store, /patchRest/);
  assert.match(store, /patchWebSocket/);
  assert.match(store, /patchWebAccess/);
  assert.match(store, /semanticEqual/);
  assert.match(store, /publishedChanges/);
});

test("protocol controllers do not own runtime status with React useState", () => {
  const grpc = read("app/playground/features/mock-server/use-grpc-mock-controller.ts");
  const rest = read("app/playground/features/rest/use-rest-controller.ts");
  const ws = read("app/playground/features/websocket/use-websocket-controller.ts");
  assert.doesNotMatch(grpc, /useState<MockServerStatus>/);
  assert.doesNotMatch(rest, /useState<RestMockStatus>/);
  assert.doesNotMatch(ws, /useState<WebSocketMockStatus>/);
  assert.match(grpc, /mockRuntimeStore/);
  assert.match(rest, /mockRuntimeStore/);
  assert.match(ws, /mockRuntimeStore/);
});

test("status bar subscribes directly instead of reading four runtime statuses from ctx", () => {
  const statusBar = read("app/playground/features/shell/workbench-status-bar.tsx");
  assert.match(statusBar, /useGrpcMockRuntimeStatus/);
  assert.match(statusBar, /useRestMockRuntimeStatus/);
  assert.match(statusBar, /useWebSocketMockRuntimeStatus/);
  assert.match(statusBar, /useWebAccessRuntimeStatus/);
});
