"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("response search navigates highlighted matches with next and previous controls", () => {
  const toolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
  const panel = read("app/playground/features/shell/workbench-main-panel.tsx");
  const styles = read("app/globals.css");

  assert.match(toolbar, /querySelectorAll<HTMLElement>\("mark\.search-highlight"\)/);
  assert.match(toolbar, /new MutationObserver/);
  assert.match(toolbar, /document\.getElementById\(searchRootId\)/);
  assert.match(toolbar, /activeMatchIndexRef\.current/);
  assert.match(toolbar, /const retainedIndex = Math\.min/);
  assert.match(toolbar, /scrollIntoView\(\{ behavior: "smooth", block: "center"/);
  assert.match(toolbar, /Previous response search match/);
  assert.match(toolbar, /Next response search match/);
  assert.match(toolbar, /event\.shiftKey \? -1 : 1/);
  assert.match(panel, /highlightQuery=\{deferredResponseFilter\}/);
  assert.match(panel, /searchScopeKey=\{responseTab\}/);
  assert.match(styles, /\.search-highlight\.search-highlight--active/);
});
