"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

test("performance telemetry uses an external store and bounded samples", () => {
  assert.equal(exists("app/playground/shared/performance/performance-stats.store.ts"), true);
  const source = read("app/playground/shared/performance/performance-stats.store.ts");
  assert.match(source, /useSyncExternalStore/);
  assert.match(source, /MAX_DURATION_SAMPLES/);
  assert.match(source, /MAX_FRAME_SAMPLES/);
  assert.match(source, /recordCounter/);
  assert.match(source, /recordDuration/);
  assert.match(source, /createPerformanceSnapshot/);
  assert.match(source, /recommendations/);
});

test("status bar exposes a lightweight Perf diagnostics panel with copy snapshot", () => {
  const statusBar = read("app/playground/features/shell/workbench-status-bar.tsx");
  const panel = read("app/playground/shared/performance/PerformanceStatsPanel.tsx");
  assert.match(statusBar, /PerformanceStatsPanel/);
  assert.match(statusBar, />Perf</);
  assert.match(panel, /Copy Snapshot JSON/);
  assert.match(panel, /Main thread/);
  assert.match(panel, /Stream/);
  assert.match(panel, /Payload worker/);
  assert.match(panel, /Mock catalog/);
  assert.match(panel, /React/);
  assert.doesNotMatch(panel, /@keyframes|@media/);
});

test("hot paths feed telemetry without React state updates", () => {
  const live = read("app/playground/features/request-runner/use-live-session-events.ts");
  const payload = read("app/playground/features/response-viewer/payload-document/payloadDocument.client.ts");
  const mock = read("app/playground/features/mock-server/catalog/mockCatalog.store.ts");
  const interaction = read("app/playground/shared/performance/interaction-performance.ts");
  assert.match(live, /performanceStats\.recordStreamIncoming/);
  assert.match(live, /performanceStats\.setDeferredBacklog/);
  assert.match(live, /performanceStats\.recordUiCommitted/);
  assert.match(payload, /performanceStats\.recordPayloadRequest/);
  assert.match(payload, /performanceStats\.setPayloadInFlight/);
  assert.match(mock, /performanceStats\.recordMockDuration/);
  assert.match(interaction, /performanceStats\.recordInteraction/);
});

test("React commit durations are measured with Profiler boundaries", () => {
  const container = read("app/playground/workbench-container.tsx");
  assert.match(container, /Profiler/);
  assert.match(container, /performanceStats\.recordReactCommit/);
  assert.match(container, /id="Workbench"/);
});
