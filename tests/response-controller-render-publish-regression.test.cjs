"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("response controller never publishes external-store updates from inside React state updater callbacks", () => {
  const controller = read("app/playground/features/response-viewer/use-response-controller.ts");
  assert.doesNotMatch(
    controller,
    /setLastResultState\(\(current\) => \{[\s\S]{0,500}?runtime\.setResultSummary/,
  );
  assert.doesNotMatch(
    controller,
    /setAssertionResultsState\(\(current\) => \{[\s\S]{0,500}?runtime\.setAssertionResults/,
  );
  assert.match(controller, /lastResultRef\.current/);
  assert.match(controller, /assertionResultsRef\.current/);
});
