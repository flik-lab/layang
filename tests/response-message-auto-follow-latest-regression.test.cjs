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

test("Show Latest explicitly re-enables follow-latest without changing pause state", () => {
  const source = fs.readFileSync(
    "app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx",
    "utf8",
  );

  assert.match(source, /const showLatest = useCallback/);
  assert.match(source, />Show Latest<\/Button>/);
  assert.match(source, /setFollowingLatest\(true\)/);
  assert.match(source, /setFrozenMessageIds\(\[\.\.\.snapshot\.orderedMessageIds\]\)/);
});

test("message list scrolls back to newest row when latest becomes selected", () => {
  const source = fs.readFileSync(
    "app/playground/features/response-viewer/message-list/MessageList.tsx",
    "utf8",
  );

  assert.match(source, /selectedMessageId === newestFirstIds\[0\]/);
  assert.match(source, /node\.scrollTop = 0/);
});
