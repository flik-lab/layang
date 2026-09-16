"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");

test("document session keeps committed content while a replacement prepares and rejects stale generations", () => {
  const reducer = read("app/playground/features/response-viewer/document-session/documentSession.reducer.ts");
  const types = read("app/playground/features/response-viewer/document-session/documentSession.types.ts");

  assert.match(types, /requested\?: DocumentSessionTarget/);
  assert.match(types, /pending\?: PendingDocument/);
  assert.match(types, /committed\?: CommittedDocument/);
  assert.match(reducer, /case "request"/);
  assert.match(reducer, /committed: state\.committed/);
  assert.match(reducer, /case "prepared"/);
  assert.match(reducer, /action\.generation !== state\.generation/);
  assert.match(reducer, /committed:\s*\{/);
});
