"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("performance telemetry reports actual payload worker memory tiers", () => {
  const client = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocument.client.ts", "utf8");
  const perf = fs.readFileSync("app/playground/shared/performance/performance-stats.store.ts", "utf8");
  const panel = fs.readFileSync("app/playground/shared/performance/PerformanceStatsPanel.tsx", "utf8");
  assert.match(client, /debug-stats/);
  assert.match(client, /setPayloadWorkerStats/);
  assert.match(perf, /actualDocumentCount/);
  assert.match(perf, /decodedDocuments/);
  assert.match(perf, /indexedDocuments/);
  assert.match(perf, /pinnedDocuments/);
  assert.match(perf, /residentMb/);
  assert.match(panel, /Resident memory/);
});
