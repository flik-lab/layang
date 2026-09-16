"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const viewport = fs.readFileSync("app/playground/features/response-viewer/json-document/useJsonViewport.ts", "utf8");
const latest = fs.readFileSync("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx", "utf8");

test("latest viewport pulls bounded line windows rather than full text during follow", () => {
  assert.match(viewport, /payloadDocumentService\.getLines/);
  assert.doesNotMatch(viewport, /payloadDocumentService\.getText/);
  const getTextUses = [...latest.matchAll(/payloadDocumentService\.getText/g)];
  assert.equal(getTextUses.length, 1, "getText is reserved for explicit Copy JSON");
});
