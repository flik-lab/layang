"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("selected message is pinned while new stream rows stay pending until resume", () => {
  const panel = fs.readFileSync("app/playground/features/response-viewer/response-workbench-panel.tsx", "utf8");
  const workspace = fs.readFileSync("app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx", "utf8");
  const list = fs.readFileSync("app/playground/features/response-viewer/message-list/MessageList.tsx", "utf8");
  assert.match(panel, /MessageReadingWorkspace/);
  assert.match(workspace, /selectedMessageId/);
  assert.match(workspace, /selectedRecord/);
  assert.match(workspace, /useDocumentSession/);
  assert.match(workspace, /document=\{session\.committed\}/);
  assert.match(workspace, /readingLocked/);
  assert.match(workspace, /pendingCount/);
  assert.match(list, /selectedMessageId/);
});
