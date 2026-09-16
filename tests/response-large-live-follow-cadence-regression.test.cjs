"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("large Latest follow coalesces target publication before document session hydration", () => {
  const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
  const follow = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
  assert.match(latest, /latestRecord/);
  assert.match(latest, /minTargetIntervalMs/);
  assert.match(follow, /minTargetIntervalMs/);
  assert.match(follow, /lastTargetPublishedAtRef/);
});
