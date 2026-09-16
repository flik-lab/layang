"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("large response JSON pages worker lines through fixed-window virtualization", () => {
  const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
  const viewportHook = read("app/playground/features/response-viewer/json-document/useJsonViewport.ts");
  assert.match(viewer, /useFixedVirtualWindow/);
  assert.doesNotMatch(viewer, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
  assert.match(viewportHook, /payloadDocumentService\.getLines/);
  assert.doesNotMatch(viewer, /split\("\\n"\)/);
});

test("Latest JSON follows document ids without full-string deferred rendering or polling", () => {
  const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
  const follow = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
  assert.match(latest, /useLatestFollow\(latestMessageId, \{ minTargetIntervalMs \}\)/);
  assert.match(follow, /mode: "follow"/);
  assert.match(follow, /mode: "hold"/);
  assert.match(follow, /mode: "frozen"/);
  assert.doesNotMatch(latest, /useDeferredValue|setInterval/);
});

test("message rows stay fixed while full payloads remain in the document worker", () => {
  const list = read("app/playground/features/response-viewer/message-list/MessageList.tsx");
  const types = read("app/playground/features/response-viewer/model/response.types.ts");
  assert.match(list, /virtualWindow\.items\.map/);
  assert.doesNotMatch(list, /useVirtualizer|flushSync/);
  assert.match(types, /documentId\?: string/);
  assert.doesNotMatch(types, /fullPayload/);
});

test("large stream UI commits remain bounded and active responses append into normalized state", () => {
  const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
  assert.match(liveEvents, /MAX_PENDING_MESSAGE_EVENTS_PER_SESSION/);
  assert.match(liveEvents, /LARGE_PAYLOAD_UI_FLUSH_MS/);
  assert.match(liveEvents, /responseSessionRegistry\.getOrCreate\(targetSessionId\)\.store\.appendEvents/);
  assert.match(liveEvents, /pending\.messages\[pending\.messages\.length - 1\] = event/);
});
