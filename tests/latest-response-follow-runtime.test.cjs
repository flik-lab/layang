"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("Latest response state machine implements coalesced follow, hold, jump, freeze and unfreeze without polling", () => {
  const source = fs.readFileSync("app/playground/features/response-viewer/latest/useLatestFollow.ts", "utf8");
  assert.match(source, /mode: "follow"/);
  assert.match(source, /mode: "hold"/);
  assert.match(source, /mode: "frozen"/);
  assert.match(source, /newerCount: current\.newerCount \+ 1/);
  assert.match(source, /const jumpLatest/);
  assert.match(source, /const freeze/);
  assert.match(source, /const unfreeze/);
  assert.match(source, /LATEST_FOLLOW_QUIET_MS/);
  assert.match(source, /LATEST_FOLLOW_MAX_STALENESS_MS/);
  assert.match(source, /pendingLatestIdRef/);
  assert.match(source, /window\.setTimeout/);
  assert.doesNotMatch(source, /setInterval/);
});
