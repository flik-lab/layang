"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const { TextDecoder, TextEncoder } = require("node:util");
const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");

function bootWorker() {
  const sourceFile = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts", "utf8");
  const match = sourceFile.match(/String\.raw`([\s\S]*)`;\s*$/);
  assert.ok(match);
  const responses = [];
  const self = { postMessage(value) { responses.push(value); } };
  const context = vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date, Uint32Array, Uint16Array, Uint8Array, ArrayBuffer, TextDecoder, TextEncoder });
  vm.runInContext(match[1], context);
  const post = (data) => {
    const requestId = data.requestId || `request-${responses.length + 1}`;
    self.onmessage({ data: { ...data, requestId } });
    const response = responses.findLast((item) => item.requestId === requestId);
    assert.ok(response);
    if (response.type === "error") throw new Error(response.error);
    return response;
  };
  post({ type: "init", requestId: "init", maxDocuments: 64, maxChars: 96_000_000, maxPreparedDocuments: 4 });
  return post;
}

test("50 UTF-8 documents stay byte-backed and only a small decoded working set is retained", () => {
  const post = bootWorker();
  const encoder = new TextEncoder();
  const serialized = JSON.stringify(createTrackPayload(1000));
  for (let index = 0; index < 50; index += 1) {
    const bytes = encoder.encode(serialized);
    post({ type: "register-utf8", id: `doc-${index}`, buffer: bytes.buffer, preview: serialized.slice(0, 128), originalChars: serialized.length });
  }
  let stats = post({ type: "debug-stats" }).stats;
  assert.equal(stats.documentCount, 50);
  assert.equal(stats.decodedDocumentCount, 0);
  assert.ok(stats.rawBytes > 0);

  for (let index = 0; index < 12; index += 1) {
    post({ type: "get-meta", id: `doc-${index}` });
    post({ type: "get-lines", id: `doc-${index}`, start: 0, count: 50 });
  }
  stats = post({ type: "debug-stats" }).stats;
  assert.ok(stats.decodedDocumentCount <= 4, `decoded working set leaked: ${stats.decodedDocumentCount}`);
  assert.equal(stats.indexedDocumentCount, 12, `line indexes should outlive decoded strings: ${stats.indexedDocumentCount}`);
  assert.ok(stats.decodedChars < stats.originalChars, "decoded text should remain a bounded working set");
});
