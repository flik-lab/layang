"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("Latest JSON pages the worker-owned full document instead of a compact preview string", () => {
  const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
  const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
  const service = read("app/playground/features/response-viewer/payload-document/payloadDocument.service.ts");
  assert.match(latest, /targetRecord\?\.documentId/);
  assert.match(viewer, /useJsonViewport\(document, priority\)/);
  assert.match(service, /getLines/);
  assert.match(service, /getText/);
});

test("large messages use a fixed-height virtual list and independent detail scroll host", () => {
  const list = read("app/playground/features/response-viewer/message-list/MessageList.tsx");
  const detail = read("app/playground/features/response-viewer/message-list/MessageDetailPane.tsx");
  const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
  assert.match(list, /virtualWindow\.items\.map/);
  assert.doesNotMatch(list, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
  assert.match(list, /const ROW_HEIGHT = 44/);
  assert.match(detail, /JsonDocumentViewer/);
  assert.match(viewer, /overflowAnchor: "none"/);
  assert.doesNotMatch(list, /TableRow/);
});

test("message reading pins one document and freezes list publications while the operator reads", () => {
  const panel = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
  const workspace = read("app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx");
  const detail = read("app/playground/features/response-viewer/message-list/MessageDetailPane.tsx");
  assert.match(panel, /MessageReadingWorkspace/);
  assert.match(workspace, /selectedRecord/);
  assert.match(workspace, /useDocumentSession/);
  assert.match(workspace, /frozenMessageIds/);
  assert.match(workspace, /Resume live/);
  assert.match(detail, /memo\(/);
});

test("response search runs against payload documents in the worker", () => {
  const search = read("app/playground/features/response-viewer/message-list/useMessageSearch.ts");
  const documentWorker = read("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts");
  assert.match(search, /payloadDocumentService\.search/);
  assert.match(documentWorker, /searchDocuments/);
  assert.match(documentWorker, /lineIndex/);
  assert.equal(fs.existsSync("app/playground/features/response-viewer/response-search-worker.ts"), false);
});

test("gRPC-Web keeps the configured retained message window and document refs", () => {
  const grpcWeb = read("lib/grpc-web-client.ts");
  assert.match(grpcWeb, /const maxMessages = normalizeMaxMessages/);
  assert.match(grpcWeb, /messageDocumentRefs\.push\(frame\.documentRef\)/);
  assert.doesNotMatch(grpcWeb, /largeFrameMaxMessages/);
});
