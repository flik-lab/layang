"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (file) => fs.readFileSync(file, "utf8");

test("performance telemetry records used total and limit JS heap separately", () => {
  const store = read("app/playground/shared/performance/performance-stats.store.ts");
  assert.match(store, /usedHeapMb\?: number/);
  assert.match(store, /totalHeapMb\?: number/);
  assert.match(store, /heapLimitMb\?: number/);
  assert.match(store, /totalJSHeapSize/);
  assert.match(store, /jsHeapSizeLimit/);
  assert.match(store, /activeTransportProcesses: number/);
  const lifecycle = read("app/playground/features/response-viewer/model/transportLifecycle.store.ts");
  assert.match(lifecycle, /activeTransportProcesses/);
});
