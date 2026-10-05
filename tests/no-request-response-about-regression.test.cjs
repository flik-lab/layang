"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("response panel is hidden while no request session is open", () => {
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.match(main, /const showResponsePanel = Boolean\(activeRequestId && activeSession && !showEmptyWorkbench\)/);
  assert.match(main, /\{showResponsePanel \? \(/);
  assert.match(main, /<Profiler id="Response"/);
});

test("status bar exposes only the package-driven version at the far right", () => {
  const status = read("app/playground/features/shell/workbench-status-bar.tsx");
  assert.match(status, /import appPackage from "@\/package\.json"/);
  assert.match(status, /v\{appPackage\.version\}/);
  assert.doesNotMatch(status, />\s*About\s*</);
  assert.doesNotMatch(status, /<DialogTitle>About Layang<\/DialogTitle>/);
  assert.doesNotMatch(status, />\s*Local\s*</);
});
