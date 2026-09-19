"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("live message reader follows newest only while follow-latest is enabled", () => {
  const source = fs.readFileSync(
    "app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx",
    "utf8",
  );

  assert.match(source, /if \(readingLocked \|\| !followingLatest\) return;/);
  assert.match(source, /const newestId = orderedIds\.at\(-1\)/);
  assert.match(source, /setSelectedMessageId\(newestId\)/);
  assert.match(source, /setFollowingLatest\(id === latestId\)/);
});

test("Show Latest exits paused snapshot and re-enables follow-latest", () => {
  const source = fs.readFileSync(
    "app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx",
    "utf8",
  );

  assert.match(source, /const showLatest = useCallback/);
  assert.match(source, />Show Latest<\/Button>/);
  assert.match(source, /setFollowingLatest\(true\)/);
  assert.match(source, /releaseFrozenSnapshot\(\)/);
  assert.match(source, /setReadingLocked\(false\)/);
});

test("message list preserves the visible message anchor while live rows rotate through retention", () => {
  const source = fs.readFileSync(
    "app/playground/features/response-viewer/message-list/MessageList.tsx",
    "utf8",
  );

  assert.match(source, /previousNewestFirstIdsRef/);
  assert.match(source, /findRetainedAnchor/);
  assert.match(source, /node\.scrollTop = anchor\.nextIndex \* ROW_HEIGHT \+ rowOffset/);
  assert.doesNotMatch(source, /selectedMessageId === newestFirstIds\[0\]/);
});

test("latest JSON keeps following live updates while user scrolls and preserves the viewer instance", () => {
  const latest = fs.readFileSync(
    "app/playground/features/response-viewer/latest/LatestResponseViewer.tsx",
    "utf8",
  );
  const viewer = fs.readFileSync(
    "app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx",
    "utf8",
  );

  assert.doesNotMatch(latest, /onUserNavigate=\{holdCommitted\}/);
  assert.doesNotMatch(latest, /const holdCommitted = useCallback/);
  assert.doesNotMatch(viewer, /<JsonDocumentViewport key=\{props\.document\.target\.documentId\}/);
  assert.match(viewer, /<JsonDocumentViewport \{\.\.\.props\} \/>/);
});

test("message list does not force scroll-to-top just because the newest message stays selected", () => {
  const source = fs.readFileSync(
    "app/playground/features/response-viewer/message-list/MessageList.tsx",
    "utf8",
  );

  assert.doesNotMatch(source, /if \(!node \|\| selectedMessageId !== newestFirstIds\[0\]\) return;\s*node\.scrollTop = 0;/);
});

test("websocket live updates preserve the response tab selected by the user", () => {
  const source = fs.readFileSync(
    "app/playground/features/request-runner/use-request-runner-actions.ts",
    "utf8",
  );
  const start = source.indexOf("function updateWebSocketLiveResult");
  const end = source.indexOf("function prepareWebSocketClientSession", start);
  const implementation = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(implementation, /setResponseTab\("messages"\)/);
  assert.doesNotMatch(implementation, /responseTab:\s*"messages"/);
});
