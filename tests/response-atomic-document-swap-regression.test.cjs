"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");

test("JSON viewer renders committed prepared documents and seeds viewport cache without clearing on target changes", () => {
  const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
  const viewport = read("app/playground/features/response-viewer/json-document/useJsonViewport.ts");
  assert.match(viewer, /document: CommittedDocument/);
  assert.match(viewer, /useJsonViewport\(document/);
  assert.doesNotMatch(viewer, /useJsonDocumentWindow/);
  assert.match(viewport, /preparedWindow\.lines/);
  assert.match(viewport, /preparedWindow\.startLine/);
  assert.doesNotMatch(viewport, /setLineCount\(0\)/);
  assert.equal(fs.existsSync("app/playground/features/response-viewer/json-document/useJsonDocumentWindow.ts"), false);
});
