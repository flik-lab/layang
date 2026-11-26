"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { render, OUTPUT } = require("../lib/help-guides-bundle.cjs");

test("bundled help guides match docs/guides (run node lib/help-guides-bundle.cjs)", () => {
  assert.equal(fs.readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n"), render());
});

test("bundled guides link to GitHub instead of relative repo paths", () => {
  const generated = render();
  assert.doesNotMatch(generated, /\]\(\.\.?\//);
  assert.match(generated, /\]\(https:\/\/github\.com\/flik-lab\/layang\/blob\/main\/guide-scenario-mock-grpc\.md\)/);
});

test("Help opens the quick start in the app instead of a GitHub page", () => {
  const drawer = fs.readFileSync("app/playground/features/help/mock-help-drawer.tsx", "utf8");
  assert.match(drawer, /HELP_GUIDES\.mockQuickstart/);
  assert.match(drawer, /<MarkdownPreview markdown=\{QUICKSTART_BODY\} \/>/);
  assert.doesNotMatch(drawer, /github\.com/);
});
