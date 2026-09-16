"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const liveEvents = fs.readFileSync("app/playground/features/request-runner/use-live-session-events.ts", "utf8");
const layout = fs.readFileSync("app/playground/features/layout/use-workbench-layout.ts", "utf8");
const table = fs.readFileSync("app/playground/shared/components/resizable-table.tsx", "utf8");
const jsonViewer = fs.readFileSync("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx", "utf8");
const messageList = fs.readFileSync("app/playground/features/response-viewer/message-list/MessageList.tsx", "utf8");
const schemas = fs.readFileSync("app/playground/features/proto-registry/schema-sidebar-tree.tsx", "utf8");
const layoutPersistence = fs.readFileSync("app/playground/features/workspace/use-workspace-layout-persistence.ts", "utf8");
const performanceHelpers = fs.readFileSync("app/playground/shared/performance/interaction-performance.ts", "utf8");

test("high-frequency live events are buffered before React commits", () => {
  assert.match(liveEvents, /pendingEventsRef/);
  assert.match(liveEvents, /LIVE_EVENT_FLUSH_MS/);
  assert.match(liveEvents, /responseSessionRegistry\.getOrCreate\(targetSessionId\)\.store\.appendEvents/);
});

test("mouse-driven layout and table resizing are coalesced by animation frame", () => {
  assert.match(layout, /requestAnimationFrame/);
  assert.match(layout, /cancelAnimationFrame/);
  assert.match(table, /requestAnimationFrame/);
  assert.match(table, /cancelAnimationFrame/);
});

test("large response search and formatting stay worker-backed while schema filtering remains deferred", () => {
  assert.match(jsonViewer, /payloadDocumentService\.search/);
  assert.match(jsonViewer, /useJsonViewport/);
  assert.doesNotMatch(jsonViewer, /JSON\.stringify|split\("\\n"\)/);
  assert.match(schemas, /useDeferredValue/);
});

test("bounded message lists avoid sync virtualization while large JSON uses fixed-window paging", () => {
  assert.match(messageList, /virtualWindow\.items\.map/);
  assert.doesNotMatch(messageList, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
  assert.match(jsonViewer, /useFixedVirtualWindow/);
  assert.doesNotMatch(jsonViewer, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
});

test("keyed idle scheduling coalesces non-urgent persistence work", () => {
  assert.match(performanceHelpers, /export function scheduleIdleTask/);
  assert.match(performanceHelpers, /pendingIdleTasks/);
  assert.match(layoutPersistence, /scheduleIdleTask\("workspace-layout"/);
});
