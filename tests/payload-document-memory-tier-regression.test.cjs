"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const { TextDecoder, TextEncoder } = require("node:util");
const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");

function loadRuntime() {
  const sourceFile = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts", "utf8");
  const match = sourceFile.match(/String\.raw`([\s\S]*)`;\s*$/);
  assert.ok(match);
  const responses = [];
  const self = { postMessage(value) { responses.push(value); } };
  const context = vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date, Uint32Array, Uint16Array, TextDecoder, TextEncoder, ArrayBuffer, Uint8Array });
  vm.runInContext(match[1], context, { filename: "payload-document-worker-runtime.js" });
  const post = (data) => {
    const requestId = data.requestId || `request-${responses.length + 1}`;
    self.onmessage({ data: { ...data, requestId } });
    const response = responses.findLast((item) => item.requestId === requestId);
    assert.ok(response, `worker response for ${requestId}`);
    if (response.type === "error") throw new Error(response.error);
    return response;
  };
  post({ type: "init", requestId: "init", maxDocuments: 64, maxChars: 96_000_000, maxPreparedDocuments: 1 });
  return { post };
}

test("prepare-window returns metadata and first rendered lines in one worker operation", () => {
  const { post } = loadRuntime();
  post({ type: "register-value", id: "tracks", value: createTrackPayload(1000) });
  const response = post({ type: "prepare-window", id: "tracks", start: 0, count: 64 });
  assert.equal(response.type, "prepared-window");
  assert.equal(response.window.documentId, "tracks");
  assert.ok(response.window.lineCount > 1000);
  assert.ok(response.window.lines.length > 0);
  assert.ok(response.window.lines.length <= 64);
});

test("decoded eviction keeps line indexes and pinned documents survive budget trimming", () => {
  const { post } = loadRuntime();
  const encoder = new TextEncoder();
  const serialized = JSON.stringify(createTrackPayload(200));
  const register = (id) => {
    const bytes = encoder.encode(serialized);
    post({ type: "register-utf8", id, buffer: bytes.buffer, preview: serialized.slice(0, 128), originalChars: serialized.length });
  };

  post({ type: "configure", maxDocuments: 2, maxChars: 20_000_000, maxPreparedDocuments: 1 });
  register("a");
  post({ type: "prepare-window", id: "a", start: 0, count: 20 });
  register("b");
  post({ type: "prepare-window", id: "b", start: 0, count: 20 });

  const afterDecodedEviction = post({ type: "debug-stats" }).stats;
  assert.equal(afterDecodedEviction.decodedDocumentCount, 1, "decoded working set must stay bounded");
  assert.equal(afterDecodedEviction.indexedDocumentCount, 2, "line index for evicted decoded text must survive");

  post({ type: "pin", id: "a" });
  register("c");
  assert.notEqual(post({ type: "get-meta", id: "a" }).meta, null, "pinned document must not be evicted");
  assert.equal(post({ type: "debug-stats" }).stats.pinnedDocumentCount, 1);
  post({ type: "unpin", id: "a" });
});
