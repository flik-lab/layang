"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const { TextDecoder, TextEncoder } = require("node:util");
const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");

function bootWorker() {
  const sourceFile = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts", "utf8");
  const match = sourceFile.match(/String\.raw`([\s\S]*)`;\s*$/);
  assert.ok(match);
  const responses = [];
  const self = { postMessage(value) { responses.push(value); } };
  const context = vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date, Uint32Array, TextDecoder, TextEncoder });
  vm.runInContext(match[1], context);
  const post = (data) => {
    const requestId = data.requestId || `request-${responses.length + 1}`;
    self.onmessage({ data: { ...data, requestId } });
    const response = responses.findLast((item) => item.requestId === requestId);
    assert.ok(response);
    if (response.type === "error") throw new Error(response.error);
    return response;
  };
  post({ type: "init", requestId: "init", maxDocuments: 64, maxChars: 96_000_000 });
  return post;
}

test("1,000-track document indexing and late-track search stay within a generous worker budget", () => {
  const post = bootWorker();
  const started = performance.now();
  post({ type: "register-value", id: "tracks", value: createTrackPayload(1000) });
  const meta = post({ type: "get-meta", id: "tracks" }).meta;
  const matches = post({ type: "search", ids: ["tracks"], query: "TRACK-0999", limit: 10 }).matches;
  const elapsed = performance.now() - started;
  assert.ok(meta.lineCount > 1000);
  assert.equal(matches.length, 1);
  assert.ok(elapsed < 500, `payload document worker budget exceeded: ${elapsed.toFixed(1)}ms`);
});
