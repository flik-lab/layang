"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("response search navigation delegates virtual JSON matches to the paged document viewer", () => {
  const toolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
  const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
  const styles = read("app/globals.css");
  assert.match(toolbar, /\.virtual-json-viewer/);
  assert.match(toolbar, /layang-virtual-search/);
  assert.match(toolbar, /layang-virtual-search-state/);
  assert.match(viewer, /payloadDocumentService\.search/);
  assert.match(viewer, /scrollToIndex/);
  assert.match(viewer, /useFixedVirtualWindow/);
  assert.doesNotMatch(viewer, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
  assert.match(viewer, /dataset\.virtualSearchCount/);
  assert.match(viewer, /className="virtual-json-viewer"/);
  assert.match(styles, /\.search-highlight\.search-highlight--active/);
});
