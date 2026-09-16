"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("payload serialization and line indexing live in one Blob document worker", () => {
  const client = read("app/playground/features/response-viewer/payload-document/payloadDocument.client.ts");
  const worker = read("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts");
  assert.match(client, /new Blob/);
  assert.match(client, /new Worker\(workerUrl/);
  assert.doesNotMatch(client, /new Worker\(\s*new URL/);
  assert.match(worker, /stringifyCompact/);
  assert.match(worker, /buildLineIndex/);
  assert.match(worker, /formatIndexedLine/);
  assert.doesNotMatch(worker, /ensurePretty/);
  assert.match(worker, /Uint32Array/);
  assert.match(worker, /Uint16Array/);
});

test("live stream hot path registers native payloads once and no longer uses a preview compactor", () => {
  const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
  assert.match(liveEvents, /payloadDocumentService\.registerValue/);
  assert.match(liveEvents, /ingestionQueuesRef/);
  assert.match(liveEvents, /drainSessionQueue/);
  assert.doesNotMatch(liveEvents, /createResponseEventCompactor|compactUiEvent\(eventToUiEvent/);
  assert.equal(fs.existsSync("app/playground/features/request-runner/response-event-compactor.ts"), false);
});

test("per-session queue preserves control ordering while coalescing excess messages", () => {
  const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
  assert.match(liveEvents, /sequence: pending\.nextSequence/);
  assert.match(liveEvents, /takeNextQueuedEvent\(pending\)/);
  assert.match(liveEvents, /pending\.messages\[pending\.messages\.length - 1\] = event/);
});

test("final reconciliation registers bounded retained values sequentially", () => {
  const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
  assert.match(liveEvents, /slice\(-MAX_FINAL_MESSAGE_EVENTS/);
  assert.match(liveEvents, /for \(const event of boundedEvents\) prepared\.push\(await prepareUiEventForDocumentStore\(event\)\)/);
  assert.doesNotMatch(liveEvents, /Promise\.all\(boundedEvents/);
});

test("legacy preview worker and live payload cache are removed", () => {
  assert.equal(fs.existsSync("app/playground/features/request-runner/response-payload-worker-runtime.ts"), false);
  assert.equal(fs.existsSync("app/playground/shared/live-payload-cache.ts"), false);
});
