"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("release lint blockers stay removed from UI primitives and request metadata", () => {
  const compat = read("components/shadcn/compat.tsx");
  const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
  const docs = read("app/playground/features/documentation/documentation-panels.tsx");

  assert.doesNotMatch(compat, /aria-required=\{required \|\| undefined\}/);
  assert.doesNotMatch(compat, /key=\{`\$\{String\(option\.value\)\}:\$\{index\}`\}/);
  assert.match(compat, /key=\{String\(option\.value\)\}/);
  assert.match(mainPanel, /metadataRowIdsRef/);
  assert.match(mainPanel, /<Stack key=\{rowId\}/);
  assert.doesNotMatch(mainPanel, /key=\{`\$\{item\.key\}-\$\{index\}`\}/);
  assert.doesNotMatch(docs, /\n {2}DocsIcon,/);
  assert.doesNotMatch(docs, /\n {2}Folder,/);
});
