"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const designSystem = fs.readFileSync("lib/design-system.ts", "utf8");
const globals = fs.readFileSync("app/globals.css", "utf8");
const compat = fs.readFileSync("components/shadcn/compat.tsx", "utf8");

test("dark workbench uses the cooler Layang reference tone", () => {
  assert.match(designSystem, /bg: "#0f1117"/);
  assert.match(designSystem, /surface: "#151922"/);
  assert.match(designSystem, /railBg: "#0c1018"/);
  assert.match(designSystem, /text: "#e8ecf7"/);
  assert.match(designSystem, /tabActiveBg: "#202944"/);
  assert.match(designSystem, /primaryStrong: "#3f85f4"/);
});

test("fallback CSS and portal theme bridge use the same dark tone", () => {
  assert.match(globals, /--background: #0f1117/);
  assert.match(globals, /--card: #151922/);
  assert.match(globals, /--ring: #3f85f4/);
  assert.match(globals, /--success: #0d9c72/);
  assert.match(compat, /"--ring": tokens\.primaryStrong/);
});
