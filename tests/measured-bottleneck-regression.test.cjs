"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const { TextDecoder, TextEncoder } = require("node:util");
const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");

const read = (file) => fs.readFileSync(file, "utf8");

function bootPayloadWorker() {
  const source = read("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts");
  const match = source.match(/String\.raw`([\s\S]*)`;\s*$/);
  assert.ok(match);
  const responses = [];
  const self = { postMessage(value) { responses.push(value); } };
  vm.runInContext(match[1], vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date, Uint32Array, TextDecoder, TextEncoder }));
  let sequence = 0;
  const post = (message) => {
    const requestId = `measured-${++sequence}`;
    self.onmessage({ data: { ...message, requestId } });
    const result = responses.findLast((item) => item.requestId === requestId);
    assert.ok(result, `missing worker response for ${message.type}`);
    if (result.type === "error") throw new Error(result.error);
    return result;
  };
  post({ type: "init", maxDocuments: 64, maxChars: 96_000_000, maxPreparedDocuments: 4 });
  return post;
}

test("payload worker keeps compact indexes without retaining full prepared JSON documents", () => {
  const post = bootPayloadWorker();
  for (let index = 0; index < 10; index += 1) {
    const id = `doc-${index}`;
    post({ type: "register-value", id, value: createTrackPayload(120) });
    post({ type: "get-meta", id });
  }
  const stats = post({ type: "debug-stats" }).stats;
  assert.ok(stats.preparedDocumentCount <= 4, `decoded working set leaked: ${stats.preparedDocumentCount}`);
  assert.equal(stats.indexedDocumentCount, 10);
  assert.equal(stats.documentCount, 10);
});

test("multi-message search matches compact raw payloads without preparing every document", () => {
  const post = bootPayloadWorker();
  for (let index = 0; index < 8; index += 1) {
    post({ type: "register-value", id: `doc-${index}`, value: createTrackPayload(150) });
  }
  const ids = Array.from({ length: 8 }, (_, index) => `doc-${index}`);
  const matches = post({ type: "search", ids, query: "TRACK-0149", limit: 20 }).matches;
  assert.equal(matches.length, 8);
  const stats = post({ type: "debug-stats" }).stats;
  assert.ok(stats.preparedDocumentCount <= 4, "list search should keep decoded payloads bounded");
});

test("message detail is pinned and memoized without an artificial selection delay", () => {
  const source = read("app/playground/features/response-viewer/message-list/MessageDetailPane.tsx");
  const workspace = read("app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx");
  assert.match(source, /memo\(/);
  assert.doesNotMatch(source, /SELECTION_SETTLE_MS|setTimeout|settledMessageId/);
  assert.match(workspace, /selectedRecord/);
  assert.match(workspace, /useDocumentSession/);
  assert.match(workspace, /frozenMessageIds/);
});

test("mock runtime update avoids renderer-side giant scenario parsing and stringify signatures", () => {
  const runtimeSync = read("app/playground/features/mock-server/use-mock-runtime-sync.ts");
  const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
  assert.doesNotMatch(runtimeSync, /parseAllMockScenarioFiles/);
  assert.doesNotMatch(runtimeSync, /scenarios:\s*parsed\.bundle\.scenarios/);
  assert.match(runtimeSync, /methodFiles/);
  assert.doesNotMatch(actions, /const parsed = parseAllMockScenarioFiles\(effectiveMockServer/);
  assert.match(actions, /methodFiles:/);
});

test("performance p95 uses a rolling time window instead of sticky session samples", () => {
  const source = read("app/playground/shared/performance/performance-stats.store.ts");
  assert.match(source, /DURATION_WINDOW_MS/);
  assert.match(source, /timestamp/);
  assert.match(source, /recentDurationValues/);
  assert.match(source, /sessionMax/);
});

test("response store batches hot append notifications instead of notifying React per event", () => {
  const source = read("app/playground/features/response-viewer/model/response.store.ts");
  assert.match(source, /RESPONSE_NOTIFY_INTERVAL_MS/);
  assert.match(source, /deferNotification/);
  assert.match(source, /setTimeout\(notifyListeners, RESPONSE_NOTIFY_INTERVAL_MS\)/);
  assert.match(source, /publish\(\{ orderedMessageIds: ordered, latestMessageId, controlEvents: nextControls \}, true\)/);
});

test("Electron mock runtime owns scenario parsing for methodFiles payloads", () => {
  const service = read("electron/services/grpc-mock-server.cjs");
  assert.match(service, /parseScenarioBundle/);
  assert.match(service, /resolveRuntimeScenarios/);
  assert.match(service, /payload\?\.methodFiles/);
});
