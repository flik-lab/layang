"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("app/playground/features/request-runner/use-live-session-events.ts", "utf8");

test("utility document-ref messages bypass payload registration and ingestion queue", () => {
  assert.match(source, /function isUtilityMetadataMessage/);
  assert.match(source, /if \(isUtilityMetadataMessage\(event\)\)/);
  assert.match(source, /const uiEvent = eventToUiEvent\(event\)[\s\S]{0,200}appendPendingUiEvent\(targetSessionId, uiEvent\)/);
});
