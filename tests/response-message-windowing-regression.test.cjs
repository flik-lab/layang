"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");

test("message list renders a fixed visible window instead of all retained rows", () => {
  const list = read("app/playground/features/response-viewer/message-list/MessageList.tsx");
  assert.match(list, /useFixedVirtualWindow/);
  assert.match(list, /virtualWindow\.items/);
  assert.match(list, /virtualWindow\.totalSize/);
  assert.doesNotMatch(list, /newestFirstIds\.map/);
});

test("response hot notifications are capped near four UI publishes per second", () => {
  const store = read("app/playground/features/response-viewer/model/response.store.ts");
  assert.match(store, /RESPONSE_NOTIFY_INTERVAL_MS\s*=\s*250/);
});
