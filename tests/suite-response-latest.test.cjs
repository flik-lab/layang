"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "latest-pull-window-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("latest-pull-window-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const viewport = fs.readFileSync("app/playground/features/response-viewer/json-document/useJsonViewport.ts", "utf8");
    const latest = fs.readFileSync("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx", "utf8");
    
    test("latest viewport pulls bounded line windows rather than full text during follow", () => {
      assert.match(viewport, /payloadDocumentService\.getLines/);
      assert.doesNotMatch(viewport, /payloadDocumentService\.getText/);
      const getTextUses = [...latest.matchAll(/payloadDocumentService\.getText/g)];
      assert.equal(getTextUses.length, 1, "getText is reserved for explicit Copy JSON");
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "latest-response-follow-runtime.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("latest-response-follow-runtime.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    
    test("Latest response state machine implements coalesced follow, hold, jump, freeze and unfreeze without polling", () => {
      const source = fs.readFileSync("app/playground/features/response-viewer/latest/useLatestFollow.ts", "utf8");
      assert.match(source, /mode: "follow"/);
      assert.match(source, /mode: "hold"/);
      assert.match(source, /mode: "frozen"/);
      assert.match(source, /newerCount: current\.newerCount \+ 1/);
      assert.match(source, /const jumpLatest/);
      assert.match(source, /const freeze/);
      assert.match(source, /const unfreeze/);
      assert.match(source, /LATEST_FOLLOW_QUIET_MS/);
      assert.match(source, /LATEST_FOLLOW_MAX_STALENESS_MS/);
      assert.match(source, /pendingLatestIdRef/);
      assert.match(source, /window\.setTimeout/);
      assert.doesNotMatch(source, /setInterval/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-large-live-follow-cadence-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-large-live-follow-cadence-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const read = (path) => fs.readFileSync(path, "utf8");
    
    test("large Latest follow coalesces target publication before document session hydration", () => {
      const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
      const follow = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
      assert.match(latest, /latestRecord/);
      assert.match(latest, /minTargetIntervalMs/);
      assert.match(follow, /minTargetIntervalMs/);
      assert.match(follow, /lastTargetPublishedAtRef/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-latest-hydration-throttle-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-latest-hydration-throttle-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    
    test("large live latest payloads use a bounded hydration cadence instead of indexing every response", () => {
      const viewer = fs.readFileSync("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx", "utf8");
      const scheduler = fs.readFileSync("app/playground/features/response-viewer/document-session/documentHydrationScheduler.ts", "utf8");
      const runtime = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocumentRuntime.ts", "utf8");
      assert.match(runtime, /PAYLOAD_DOCUMENT_LARGE_LIVE_THRESHOLD_CHARS/);
      assert.match(runtime, /PAYLOAD_DOCUMENT_LARGE_LIVE_MIN_HYDRATION_INTERVAL_MS/);
      assert.match(viewer, /minTargetIntervalMs/);
      assert.match(viewer, /latestRecord\?\.originalChars/);
      assert.match(viewer, /useLatestFollow\(latestMessageId, \{ minTargetIntervalMs \}\)/);
      assert.match(viewer, /minStartIntervalMs/);
      assert.match(scheduler, /minStartIntervalMs/);
      assert.match(scheduler, /lastStartedAtBySession/);
      assert.match(scheduler, /wakeTimer/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-live-latest-pinned-message-reading-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-live-latest-pinned-message-reading-regression.test.cjs", () => {
    const test = require('node:test');
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    
    const read = (path) => fs.readFileSync(path, 'utf8');
    
    test('message reader pins the selected record and freezes the message id list while reading', () => {
      const workspace = read('app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx');
      const detail = read('app/playground/features/response-viewer/message-list/MessageDetailPane.tsx');
      const list = read('app/playground/features/response-viewer/message-list/MessageList.tsx');
    
      assert.match(workspace, /selectedRecord/);
      assert.match(workspace, /useDocumentSession/);
      assert.match(workspace, /frozenMessageIds/);
      assert.match(workspace, /pendingCount/);
      assert.match(workspace, /Resume live/);
      assert.match(workspace, /store\.getSnapshot\(\)\.orderedMessageIds/);
      assert.match(detail, /memo\(/);
      assert.match(detail, /selectedRecord: ResponseMessageRecord \| undefined/);
      assert.match(detail, /document: CommittedDocument \| undefined/);
      assert.doesNotMatch(detail, /store: ResponseStore/);
      assert.match(list, /orderedIds: readonly string\[\]/);
      assert.doesNotMatch(list, /useResponseSelector/);
    });
    
    test('pinned message pending status subscribes only to the latest-message slice without polling the full reader', () => {
      const workspace = read('app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx');
      assert.match(workspace, /const PinnedMessageStatus = memo/);
      assert.match(workspace, /useResponseSelector\(store, \(snapshot\) => snapshot\.latestMessageId\)/);
      assert.match(workspace, /baselineSequence/);
      assert.match(workspace, /pendingCount/);
      assert.doesNotMatch(workspace, /MESSAGE_PENDING_POLL_MS/);
      assert.doesNotMatch(workspace, /window\.setInterval/);
    });
    
    test('latest automatically hydrates the newest coalesced response and no longer requires an inspect button', () => {
      const latest = read('app/playground/features/response-viewer/latest/LatestResponseViewer.tsx');
      const follow = read('app/playground/features/response-viewer/latest/useLatestFollow.ts');
    
      assert.doesNotMatch(latest, /Inspect latest JSON/);
      assert.match(latest, /state\.targetMessageId/);
      assert.match(latest, /session\.committed/);
      assert.match(latest, /JsonDocumentViewer/);
      assert.match(latest, /priority=\{state\.mode === "follow" \? "background" : "interactive"\}/);
      assert.match(follow, /LATEST_FOLLOW_QUIET_MS/);
      assert.match(follow, /LATEST_FOLLOW_MAX_STALENESS_MS/);
      assert.match(follow, /quietTimerRef/);
      assert.match(follow, /maxStalenessTimerRef/);
    });
    
    test('response workbench delegates message streaming updates to isolated message reading workspace', () => {
      const panel = read('app/playground/features/response-viewer/response-workbench-panel.tsx');
      assert.match(panel, /MessageReadingWorkspace/);
      assert.doesNotMatch(panel, /<MessageList /);
      assert.doesNotMatch(panel, /<MessageDetailPane /);
    });
    
    
    test('interactive hydration drops queued work for stale documents and pinned docs defer release', () => {
      const service = read('app/playground/features/response-viewer/payload-document/payloadDocument.service.ts');
      const scheduler = read('app/playground/features/response-viewer/document-session/documentHydrationScheduler.ts');
      assert.match(scheduler, /strategy === "latest-wins"/);
      assert.match(scheduler, /task\.sessionId === request\.sessionId/);
      assert.match(service, /pinCounts/);
      assert.match(service, /deferredReleaseIds/);
      assert.match(service, /pin\(id: string\)/);
      assert.match(service, /unpin\(id: string\)/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-message-auto-follow-latest-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-message-auto-follow-latest-regression.test.cjs", () => {
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
    
  });
}
