"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const source = read("app/playground/features/shell/shell-components.tsx");

test("middle mouse down closes the targeted request tab without activating it first", () => {
  assert.match(
    source,
    /onMouseDown=\{\(event: ReactMouseEvent<HTMLElement>\) => \{[\s\S]*?event\.button !== 1[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onClose\(session\.id\)/,
  );
});


test("request tab drag reorder is persisted through the session action", () => {
  const actions = read("app/playground/features/request-editor/use-request-session-actions.ts");
  const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");

  assert.match(source, /draggable=\{Boolean\(onReorder\)\}/);
  assert.match(source, /onReorder\?\.\(sourceId, session\.id, position\)/);
  assert.match(actions, /reorderRequestSessionList\(requestSessions, sourceId, targetId, position\)/);
  assert.match(actions, /persistRequestTabsNow\(next, activeRequestId\)/);
  assert.match(mainPanel, /onReorder=\{reorderRequestSessions\}/);
});
