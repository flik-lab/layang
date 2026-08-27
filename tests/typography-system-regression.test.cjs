"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function collectSourceFiles(directory, extensions) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collectSourceFiles(relative, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) result.push(relative);
  }
  return result;
}

test("semantic typography tokens are the single shared scale", () => {
  const design = read("lib/design-system.ts");
  const css = read("app/globals.css");
  const compat = read("components/shadcn/compat.tsx");

  for (const token of [
    "caption: 11",
    "body: 12",
    "control: 12",
    "label: 11",
    "section: 13",
    "dialogTitle: 14",
    "pageTitle: 15",
    "metric: 18",
    "mono: 11.5",
  ]) {
    assert.match(design, new RegExp(token.replace(".", "\\.")));
  }
  for (const weight of ["regular: 400", "medium: 500", "semibold: 600", "bold: 700"]) {
    assert.match(design, new RegExp(weight));
  }
  assert.match(css, /--font-size-dialog-title: 14px/);
  assert.match(css, /--font-size-page-title: 15px/);
  assert.match(css, /--font-size-mono: 11\.5px/);
  assert.match(compat, /variant === "subtitle1"[\s\S]*font-semibold/);
  assert.match(compat, /variant === "body2"[\s\S]*font-normal/);
  assert.match(compat, /text-\[length:var\(--font-size-dialog-title\)\][\s\S]*font-semibold/);
});

test("visual source uses only supported numeric font weights", () => {
  const files = [
    ...collectSourceFiles("app", [".ts", ".tsx", ".css"]),
    ...collectSourceFiles("components", [".ts", ".tsx", ".css"]),
    ...collectSourceFiles("lib", [".ts", ".tsx", ".css"]),
  ];
  const unsupported = [];
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(/fontWeight\s*[:=][^\n]*?\b(\d{3})\b|font-weight:\s*(\d{3})/g)) {
      const value = Number(match[1] ?? match[2]);
      if (![400, 500, 600, 700].includes(value)) unsupported.push(`${file}: ${value}`);
    }
  }
  assert.deepEqual(unsupported, []);
});

test("visual text never drops below 11px", () => {
  const files = [
    ...collectSourceFiles("app", [".ts", ".tsx", ".css"]),
    ...collectSourceFiles("components", [".ts", ".tsx", ".css"]),
    ...collectSourceFiles("lib", [".ts", ".tsx", ".css"]),
  ];
  const undersized = [];
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(/(?:fontSize\s*:\s*|font-size:\s*|text-\[)(\d+(?:\.\d+)?)px/g)) {
      const value = Number(match[1]);
      if (value < 11) undersized.push(`${file}: ${value}`);
    }
  }
  assert.deepEqual(undersized, []);
});

test("selected tabs and sidebar rows keep the same medium weight", () => {
  const workbench = read("components/ui/workbench.tsx");
  const tabs = read("components/ui/tabs.tsx");
  const sidebar = read("components/ui/sidebar.tsx");
  const css = read("app/globals.css");

  assert.match(workbench, /min-w-fit font-medium/);
  assert.doesNotMatch(workbench, /active[^\n]*font-(?:normal|semibold|bold)/);
  assert.match(tabs, /font-medium/);
  assert.doesNotMatch(tabs, /data-\[state=active\][^\n]*font-/);
  assert.doesNotMatch(sidebar, /isActive && "[^"]*font-/);
  assert.match(css, /\.request-tab \{[\s\S]*font-weight: var\(--font-weight-medium\)/);
  assert.doesNotMatch(css, /\.request-tab\[data-active="true"\][\s\S]{0,300}font-weight/);
});
