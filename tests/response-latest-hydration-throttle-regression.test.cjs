"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("large live latest payloads use a bounded hydration cadence instead of indexing every response", () => {
  const viewer = fs.readFileSync("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx", "utf8");
  const scheduler = fs.readFileSync("app/playground/features/response-viewer/document-session/documentHydrationScheduler.ts", "utf8");
  const runtime = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocumentRuntime.ts", "utf8");
  assert.match(runtime, /PAYLOAD_DOCUMENT_LARGE_LIVE_THRESHOLD_CHARS/);
  assert.match(runtime, /PAYLOAD_DOCUMENT_LARGE_LIVE_MIN_HYDRATION_INTERVAL_MS/);
  assert.match(viewer, /minTargetIntervalMs/);
  assert.match(viewer, /latestRecord\?\.originalChars/);
  assert.match(viewer, /useLatestFollow\(latestMessageId, \{ minTargetIntervalMs \}\)/);
  assert.match(viewer, /minStartIntervalMs/);
  assert.match(scheduler, /minStartIntervalMs/);
  assert.match(scheduler, /lastStartedAtBySession/);
  assert.match(scheduler, /wakeTimer/);
});
