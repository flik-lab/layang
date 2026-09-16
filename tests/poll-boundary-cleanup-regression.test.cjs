"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("response message count is store-driven rather than sampled by an interval", () => {
  const panel = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
  assert.doesNotMatch(panel, /useSampledMessageCount/);
  assert.doesNotMatch(panel, /MESSAGE_COUNT_SAMPLE_MS/);
  assert.match(panel, /orderedMessageIds\.length/);
});

test("mock runtime polling owns grpc rest websocket and gateway status timers outside Workbench", () => {
  const polling = read("app/playground/features/mock-server/runtime/useMockRuntimePolling.ts");
  assert.match(polling, /electronMock\?\.status/);
  assert.match(polling, /electronRestMock\?\.status/);
  assert.match(polling, /electronWsMock\?\.status/);
  assert.match(polling, /electronGateway\?\.status/);
  assert.match(polling, /mockRuntimeStore\.subscribe/);
  assert.match(polling, /clearInterval/);
});

test("Workbench root no longer owns mock status polling intervals", () => {
  const root = read("app/playground/features/shell/use-workbench-container-model.tsx");
  assert.doesNotMatch(root, /electronMock\?\.status[\s\S]{0,500}?setInterval/);
  assert.doesNotMatch(root, /electronRestMock\?\.status[\s\S]{0,500}?setInterval/);
  assert.doesNotMatch(root, /electronWsMock\?\.status[\s\S]{0,500}?setInterval/);
});

test("gRPC live reload reads current runtime state from external store", () => {
  const sync = read("app/playground/features/mock-server/use-mock-runtime-sync.ts");
  assert.match(sync, /mockRuntimeStore\.getGrpc\(\)/);
  assert.doesNotMatch(sync, /mockServerStatus\.running[\s\S]{0,160}?useEffect/);
});
