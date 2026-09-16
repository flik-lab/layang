"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const { TextDecoder, TextEncoder } = require("node:util");
const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");

const read = (file) => fs.readFileSync(file, "utf8");

function bootWorker() {
  const source = read("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts");
  const match = source.match(/String\.raw`([\s\S]*)`;\s*$/);
  assert.ok(match, "worker source must be extractable");
  const responses = [];
  const self = { postMessage(value) { responses.push(value); } };
  const context = vm.createContext({
    self,
    close() {},
    Map,
    Set,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Math,
    Date,
    Uint16Array,
    Uint32Array,
    TextDecoder,
    TextEncoder,
  });
  vm.runInContext(match[1], context, { filename: "payload-document-worker-runtime.js" });
  let sequence = 0;
  const post = (message) => {
    const requestId = `chunk-${++sequence}`;
    self.onmessage({ data: { ...message, requestId } });
    const result = responses.findLast((item) => item.requestId === requestId);
    assert.ok(result, `missing ${message.type} response`);
    if (result.type === "error") throw new Error(result.error);
    return result;
  };
  post({ type: "init", maxDocuments: 64, maxChars: 96_000_000 });
  return post;
}

test("payload reader indexes compact raw JSON without materializing full pretty documents", () => {
  const source = read("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts");
  assert.doesNotMatch(source, /JSON\.stringify\(JSON\.parse\(entry\.rawText\), null, 2\)/);
  assert.doesNotMatch(source, /prettyText:\s*null/);
  assert.match(source, /buildLineIndex/);
  assert.match(source, /formatIndexedLine/);
  assert.match(source, /Uint16Array/);
  assert.match(source, /lineIndents/);
});

test("many indexed 1000-track documents keep compact derived metadata and fast random paging semantics", () => {
  const post = bootWorker();
  for (let index = 0; index < 12; index += 1) {
    const id = `tracks-${index}`;
    post({ type: "register-value", id, value: createTrackPayload(1000) });
    const meta = post({ type: "get-meta", id }).meta;
    assert.ok(meta.lineCount > 1000);
  }

  const oldDoc = post({ type: "get-meta", id: "tracks-0" }).meta;
  const lateLines = post({ type: "get-lines", id: "tracks-0", start: oldDoc.lineCount - 40, count: 40 }).lines;
  assert.ok(lateLines.join("\n").includes("TRACK-0999"));

  const stats = post({ type: "debug-stats" }).stats;
  assert.equal(stats.indexedDocumentCount, 12);
  assert.ok(stats.derivedChars < stats.rawChars * 0.6, `derived ${stats.derivedChars} should stay compact vs raw ${stats.rawChars}`);
});

test("chunk reader preserves valid pretty JSON including structural characters inside strings", () => {
  const post = bootWorker();
  const value = {
    text: "brace } bracket ] comma , colon : quote \\\" and newline\\nkept",
    emptyObject: {},
    emptyArray: [],
    nested: [{ a: 1, b: true }, { c: null }],
  };
  post({ type: "register-value", id: "edge", value });
  const pretty = post({ type: "get-text", id: "edge", format: "pretty" }).text;
  assert.deepEqual(JSON.parse(pretty), value);
  const meta = post({ type: "get-meta", id: "edge" }).meta;
  const lines = post({ type: "get-lines", id: "edge", start: 0, count: meta.lineCount }).lines;
  assert.equal(lines.join("\n"), pretty);
});

test("JSON window uses page prefetch and ignores stale paint notifications", () => {
  const source = read("app/playground/features/response-viewer/json-document/useJsonViewport.ts");
  assert.match(source, /PAYLOAD_DOCUMENT_PAGE_SIZE/);
  assert.match(source, /PAYLOAD_DOCUMENT_PREFETCH_BEFORE_LINES/);
  assert.match(source, /PAYLOAD_DOCUMENT_PREFETCH_AFTER_LINES/);
  assert.match(source, /pendingPagesRef/);
  assert.match(source, /desiredRangeRef/);
  assert.match(source, /visibleRangeRef/);
  assert.match(source, /rangesOverlap/);
  assert.match(source, /visibleFirstPage/);
  assert.match(source, /PAYLOAD_DOCUMENT_MAX_PAGES_PER_REQUEST/);
  assert.doesNotMatch(source, /requestKey = `\$\{safeStart\}:\$\{safeCount\}`/);
});
