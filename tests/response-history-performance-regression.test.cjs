"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const source = fs.readFileSync("app/playground/features/response-viewer/model/response.store.ts", "utf8");

test("response store bounds retained message and compatibility windows", () => {
  assert.match(source, /DEFAULT_MAX_MESSAGES = 10/);
  assert.match(source, /setRetentionLimit\(limit: number\): void/);
  assert.match(source, /\.slice\(-100\)/);
  assert.match(source, /compatibilityEvents = \[\.\.\.compatibilityEvents, \.\.\.events\]\.slice\(-retentionLimit\)/);
  assert.doesNotMatch(source, /\.sort\(/);
});
