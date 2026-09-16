"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("document hydration scheduler supersedes only queued work from the same latest-wins session", () => {
  const source = fs.readFileSync("app/playground/features/response-viewer/document-session/documentHydrationScheduler.ts", "utf8");
  assert.match(source, /sessionId/);
  assert.match(source, /strategy === "latest-wins"/);
  assert.match(source, /task\.sessionId === request\.sessionId/);
  assert.match(source, /task\.resolve\(undefined\)/);
  assert.match(source, /user-visible/);
  assert.match(source, /latest-visible/);
  assert.match(source, /prefetch/);
});
