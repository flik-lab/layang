"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("full response payloads are owned by the payload document worker, not React state", () => {
  const types = read("app/playground/shared/workbench-types.ts");
  const store = read("app/playground/features/response-viewer/model/response.store.ts");
  assert.match(types, /documentId\?: string/);
  assert.doesNotMatch(types, /fullPayload/);
  assert.doesNotMatch(types, /payloadToken/);
  assert.match(store, /documentId: event\.documentId/);
  assert.equal(fs.existsSync(path.join(root, "app/playground/shared/live-payload-cache.ts")), false);
});

test("message detail pages the selected worker document instead of expanding a giant table row", () => {
  const detail = read("app/playground/features/response-viewer/message-list/MessageDetailPane.tsx");
  const list = read("app/playground/features/response-viewer/message-list/MessageList.tsx");
  assert.match(detail, /<JsonDocumentViewer document=\{document\}/);
  assert.match(list, /const ROW_HEIGHT = 44/);
  assert.doesNotMatch(list, /expanded/);
});

test("Latest JSON is paged by document id and only materializes full text for copy", () => {
  const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
  assert.match(latest, /<JsonDocumentViewer[\s\S]*document=\{session\.committed\}/);
  assert.match(latest, /payloadDocumentService\.getText\(documentId, "pretty"\)/);
  assert.doesNotMatch(latest, /setInterval/);
});
