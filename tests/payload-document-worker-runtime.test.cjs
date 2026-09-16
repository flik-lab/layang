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
  assert.ok(match, "payload document worker source template must be readable");
  const responses = [];
  const self = { postMessage(value) { responses.push(value); } };
  const context = vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date, Uint32Array, TextDecoder, TextEncoder });
  vm.runInContext(match[1], context, { filename: "payload-document-worker-runtime.js" });
  const post = (data) => {
    const requestId = data.requestId || `request-${responses.length + 1}`;
    self.onmessage({ data: { ...data, requestId } });
    const response = responses.findLast((item) => item.requestId === requestId);
    assert.ok(response, `worker response for ${requestId}`);
    if (response.type === "error") throw new Error(response.error);
    return response;
  };
  post({ type: "init", requestId: "init", maxDocuments: 64, maxChars: 96_000_000 });
  return { post, responses };
}

test("payload document registers 1,000 tracks and pages pretty lines without returning the full document", () => {
  const { post } = loadRuntime();
  const payload = createTrackPayload(1000);
  const registered = post({ type: "register-value", id: "tracks", value: payload });
  assert.equal(registered.documentRef.id, "tracks");
  assert.ok(registered.documentRef.originalChars > 10_000);

  const meta = post({ type: "get-meta", id: "tracks" }).meta;
  assert.ok(meta.lineCount > 1000);
  const lines = post({ type: "get-lines", id: "tracks", start: meta.lineCount - 30, count: 30 }).lines;
  assert.equal(lines.length, 30);
  assert.ok(lines.join("\n").includes("TRACK-0999"));
  assert.ok(lines.join("\n").length < registered.documentRef.originalChars);
});

test("payload document search finds a late track and pretty text round-trips", () => {
  const { post } = loadRuntime();
  post({ type: "register-value", id: "tracks", value: createTrackPayload(1000) });
  const matches = post({ type: "search", ids: ["tracks"], query: "TRACK-0999", limit: 10 }).matches;
  assert.equal(matches.length, 1);
  assert.equal(matches[0].documentId, "tracks");
  assert.ok(matches[0].lineIndex > 0);
  const pretty = post({ type: "get-text", id: "tracks", format: "pretty" }).text;
  assert.equal(JSON.parse(pretty).tracks.length, 1000);
});

test("payload document releases raw documents and evicts derived caches before raw entries", () => {
  const { post } = loadRuntime();
  post({ type: "configure", maxDocuments: 4, maxChars: 1500 });
  post({ type: "register-value", id: "a", value: { text: "a".repeat(350) } });
  post({ type: "register-value", id: "b", value: { text: "b".repeat(350) } });
  post({ type: "get-lines", id: "a", start: 0, count: 2 });
  post({ type: "register-value", id: "c", value: { text: "c".repeat(350) } });
  const stats = post({ type: "debug-stats" }).stats;
  assert.ok(stats.documentCount >= 2);
  assert.ok(stats.derivedChars <= stats.totalChars);
  post({ type: "release", ids: ["b"] });
  assert.equal(post({ type: "get-meta", id: "b" }).meta, null);
});
