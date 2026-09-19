"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("message retention selector offers bounded 5/10/20/50/100 limits and applies them to storage", () => {
  const source = fs.readFileSync(
    "app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx",
    "utf8",
  );

  assert.match(source, /type MessageRetentionLimit = 5 \| 10 \| 20 \| 50 \| 100/);
  for (const value of [5, 10, 20, 50, 100]) assert.match(source, new RegExp(`value=\\{${value}\\}`));
  assert.doesNotMatch(source, /value="all"/);
  assert.match(source, /store\.setRetentionLimit\(nextLimit\)/);
  assert.match(source, /payloadDocumentService\.setRetentionLimit\(nextLimit\)/);
});

test("manual old-message selection disables follow-latest without pausing the live list", () => {
  const source = fs.readFileSync(
    "app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx",
    "utf8",
  );

  assert.match(source, /const \[followingLatest, setFollowingLatest\] = useState\(true\)/);
  assert.match(source, /if \(readingLocked \|\| !followingLatest\) return;/);
  assert.match(source, /setFollowingLatest\(id === latestId\)/);
  assert.match(source, />Pause live</);
  assert.match(source, />Resume live</);
  assert.match(source, /const showLatest = useCallback/);
  assert.match(source, /setFollowingLatest\(true\)/);

  const selectStart = source.indexOf("const selectMessage");
  const selectEnd = source.indexOf("const clearFrozenPins");
  assert.ok(selectStart >= 0 && selectEnd > selectStart);
  const selectBlock = source.slice(selectStart, selectEnd);
  assert.doesNotMatch(selectBlock, /setReadingLocked\(true\)/);
  assert.doesNotMatch(selectBlock, /setFrozenMessageIds/);
});

test("response store exposes runtime retention control instead of adaptive large-message limits", () => {
  const source = fs.readFileSync("app/playground/features/response-viewer/model/response.store.ts", "utf8");
  assert.match(source, /setRetentionLimit\(limit: number\): void/);
  assert.match(source, /const DEFAULT_MAX_MESSAGES = 10/);
  assert.doesNotMatch(source, /LARGE_MAX_MESSAGES/);
  assert.doesNotMatch(source, /LARGE_MESSAGE_THRESHOLD_CHARS/);
  assert.match(source, /releaseDocuments\(released\)/);
});

test("payload document clients can reconfigure retention across all backends", () => {
  const types = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocument.types.ts", "utf8");
  const service = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocument.service.ts", "utf8");
  const workerClient = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocument.client.ts", "utf8");
  const utilityClient = fs.readFileSync("app/playground/features/response-viewer/payload-document/utilityPayloadDocument.client.ts", "utf8");
  const transportClient = fs.readFileSync("app/playground/features/response-viewer/payload-document/transportPayloadDocument.client.ts", "utf8");

  assert.match(types, /setRetentionLimit\(limit: number\): void/);
  assert.match(service, /setRetentionLimit\(limit: number\): void/);
  assert.match(workerClient, /type: "configure", maxDocuments: limit/);
  assert.match(utilityClient, /payload\.setRetentionLimit/);
  assert.match(transportClient, /payload\.setRetentionLimit/);
});
