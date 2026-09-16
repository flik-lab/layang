"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("shell boundaries use named typed models instead of Record<string, any>", () => {
  const files = [
    "app/playground/features/shell/workbench-app-bar.tsx",
    "app/playground/features/shell/workbench-sidebar.tsx",
    "app/playground/features/shell/workbench-dialogs.tsx",
    "app/playground/features/shell/workbench-main-panel.tsx",
    "app/playground/features/shell/workbench-status-bar.tsx",
  ];
  for (const file of files) assert.doesNotMatch(read(file), /Record<string,\s*any>/, file);
  const types = read("app/playground/features/shell/workbenchShell.types.ts");
  assert.match(types, /WorkbenchAppBarModel/);
  assert.match(types, /WorkbenchSidebarModel/);
  assert.match(types, /WorkbenchMainPanelModel/);
  assert.match(types, /WorkbenchDialogsModel/);
  assert.match(types, /WorkbenchStatusBarModel/);
});

test("container no longer creates one cliContext spread for every shell child", () => {
  const container = read("app/playground/workbench-container.tsx");
  assert.doesNotMatch(container, /const cliContext = \{ \.\.\.viewContext/);
  assert.match(container, /<WorkbenchAppBar ctx=\{viewContext\}/);
  assert.match(container, /cliPanelOpen=\{cliPanelOpen\}/);
});
