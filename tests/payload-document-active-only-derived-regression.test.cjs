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
  post({ type: "init", requestId: "init", maxDocuments: 64, maxChars: 96_000_000, maxPreparedDocuments: 3 });
  return { post };
}

test("unpin demotes inactive payload documents back to raw-only storage", () => {
  const { post } = loadRuntime();
  const payload = createTrackPayload(1000);
  post({ type: "register-value", id: "a", value: payload });
  post({ type: "pin", id: "a" });
  post({ type: "prepare-window", id: "a", start: 0, count: 64 });
  let stats = post({ type: "debug-stats" }).stats;
  assert.equal(stats.decodedDocumentCount, 1);
  assert.equal(stats.indexedDocumentCount, 1);

  post({ type: "unpin", id: "a" });
  stats = post({ type: "debug-stats" }).stats;
  assert.equal(stats.documentCount, 1, "raw document must remain retained");
  assert.equal(stats.decodedDocumentCount, 0, "inactive decoded text must be released immediately");
  assert.equal(stats.indexedDocumentCount, 0, "inactive line index must be released immediately");
  assert.ok(stats.rawBytes > 0, "raw bytes must remain available for reopening");
});
