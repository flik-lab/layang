"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");

test("Latest owns only desired target while document session owns committed display", () => {
  const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
  const follow = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
  const types = read("app/playground/features/response-viewer/latest/latestFollow.types.ts");
  assert.match(types, /targetMessageId\?: string/);
  assert.doesNotMatch(types, /displayedMessageId/);
  assert.match(latest, /useDocumentSession/);
  assert.match(latest, /strategy: state\.mode === "follow" \? "latest-wins" : "strict"/);
  assert.match(latest, /session\.committed/);
  assert.match(follow, /targetMessageId/);
});
