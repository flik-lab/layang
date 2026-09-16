"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("performance telemetry counts container and collections render invocations separately", () => {
  const stats = read("app/playground/shared/performance/performance-stats.store.ts");
  const container = read("app/playground/workbench-container.tsx");
  const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.match(stats, /recordRenderInvocation/);
  assert.match(stats, /containerRendersPerSec/);
  assert.match(stats, /collectionsRendersPerSec/);
  assert.match(container, /recordRenderInvocation\("container"\)/);
  assert.match(mainPanel, /recordRenderInvocation\("collections"\)/);
});
