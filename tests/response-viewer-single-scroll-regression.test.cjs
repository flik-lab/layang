"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("message list and JSON detail own independent stable scroll hosts", () => {
  const panel = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
  const workspace = read("app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx");
  const list = read("app/playground/features/response-viewer/message-list/MessageList.tsx");
  const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
  assert.match(workspace, /gridTemplateColumns: "minmax\(240px, 34%\) minmax\(0, 1fr\)"/);
  assert.match(list, /overflow: "auto"/);
  assert.match(viewer, /overflow: "auto"/);
  assert.match(viewer, /overflowAnchor: "none"/);
  assert.doesNotMatch(panel, /inline expanded|pinnedEvents/);
});
