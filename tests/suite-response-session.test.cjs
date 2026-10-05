"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-endurance-1000-track-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-endurance-1000-track-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const { loadTypeScriptModule } = require("./helpers/load-typescript-module.cjs");
    const { createLargeTrackPayload, createResponseRecord } = require("./fixtures/response-endurance-fixture.cjs");
    
    const performancePrelude = `
    const performanceStats = {
      setRetainedMessages() {},
      setPayloadDocuments() {},
    };
    `;
    
    test("1000-track endurance stream honors a configured 5-message retention window", () => {
      const payload = createLargeTrackPayload();
      const serialized = JSON.stringify(payload);
      assert.ok(serialized.length > 500_000, `fixture should be large, got ${serialized.length} chars`);
    
      const { createResponseStore } = loadTypeScriptModule(
        "app/playground/features/response-viewer/model/response.store.ts",
        { prelude: performancePrelude },
      );
      const released = [];
      const store = createResponseStore((ids) => released.push(...ids));
      store.setRetentionLimit(5);
    
      for (let sequence = 0; sequence < 160; sequence += 1) {
        store.appendRecords([createResponseRecord(sequence, serialized.length)]);
      }
    
      const snapshot = store.getSnapshot();
      const debug = store.getDebugStats();
      assert.equal(snapshot.orderedMessageIds.length, 5);
      assert.equal(snapshot.latestMessageId, "message-159");
      assert.equal(debug.retainedRecords, 5);
      assert.equal(debug.referencedDocumentIds, 5);
      assert.equal(released.length, 155);
      assert.equal(released[0], "document-0");
      assert.equal(released.at(-1), "document-154");
      store.reset();
    });
    
    test("small response stream keeps at most 10 response records", () => {
      const { createResponseStore } = loadTypeScriptModule(
        "app/playground/features/response-viewer/model/response.store.ts",
        { prelude: performancePrelude },
      );
      const released = [];
      const store = createResponseStore((ids) => released.push(...ids));
    
      for (let sequence = 0; sequence < 30; sequence += 1) {
        store.appendRecords([createResponseRecord(sequence, 20_000)]);
      }
    
      assert.equal(store.getSnapshot().orderedMessageIds.length, 10);
      assert.equal(store.getDebugStats().referencedDocumentIds, 10);
      assert.equal(released.length, 20);
      store.reset();
    });
    
    test("response selector stays asleep during endurance appends when its selected slice is unchanged", () => {
      const { createResponseStore } = loadTypeScriptModule(
        "app/playground/features/response-viewer/model/response.store.ts",
        { prelude: performancePrelude },
      );
      const { createResponseSelectorBinding } = loadTypeScriptModule(
        "app/playground/features/response-viewer/model/responseSelector.ts",
      );
      const store = createResponseStore();
      const binding = createResponseSelectorBinding(store, (snapshot) => snapshot.responseFilter);
      let notifications = 0;
      binding.getSnapshot();
      const unsubscribe = binding.subscribe(() => { notifications += 1; });
    
      for (let sequence = 0; sequence < 160; sequence += 1) {
        store.appendRecords([createResponseRecord(sequence, 600_000)]);
      }
      store.setResponseFilter("needle");
    
      assert.equal(notifications, 1, "only the selected responseFilter change should wake the subscriber");
      unsubscribe();
      store.reset();
    });
    
    test("transport lifecycle returns to zero after repeated stream setup and teardown", () => {
      const { createTransportLifecycleStore } = loadTypeScriptModule(
        "app/playground/features/response-viewer/model/transportLifecycle.store.ts",
      );
      const lifecycle = createTransportLifecycleStore();
    
      for (let index = 0; index < 160; index += 1) {
        lifecycle.increment("activeDecodeWorkers");
        lifecycle.increment("pendingDecodeAcks", 2);
        lifecycle.increment("payloadProducerChannels");
        lifecycle.increment("activeStreamSubscriptions");
        lifecycle.setDeferredEventCount(2);
        lifecycle.setIngestionQueueDepth(1);
        lifecycle.decrement("pendingDecodeAcks", 2);
        lifecycle.decrement("activeDecodeWorkers");
        lifecycle.decrement("payloadProducerChannels");
        lifecycle.decrement("activeStreamSubscriptions");
        lifecycle.setDeferredEventCount(0);
        lifecycle.setIngestionQueueDepth(0);
      }
    
      assert.deepEqual(lifecycle.getSnapshot(), {
        activeDecodeWorkers: 0,
        pendingDecodeAcks: 0,
        payloadProducerChannels: 0,
        activeStreamSubscriptions: 0,
        activeTransportProcesses: 0,
        deferredEventCount: 0,
        ingestionQueueDepth: 0,
      });
    });
    
    
    test("preview WebSocket request keeps compact response history", () => {
      const fs = require("node:fs");
      const runner = fs.readFileSync("app/playground/hooks/use-request-runner.ts", "utf8");
      assert.match(runner, /compactTransportPreview/);
      assert.match(runner, /messages\.push\(compactTransportPreview\(value\)\)/);
      assert.match(runner, /totalMessages/);
    });
    
    test("paused 5-message snapshot keeps records alive until the snapshot is released", () => {
      const { createResponseStore } = loadTypeScriptModule(
        "app/playground/features/response-viewer/model/response.store.ts",
        { prelude: performancePrelude },
      );
      const released = [];
      const store = createResponseStore((ids) => released.push(...ids));
      store.setRetentionLimit(5);
    
      for (let sequence = 0; sequence < 5; sequence += 1) {
        store.appendRecords([createResponseRecord(sequence, 20_000)]);
      }
      const pausedIds = [...store.getSnapshot().orderedMessageIds];
      store.setPinnedMessageIds(pausedIds);
    
      for (let sequence = 5; sequence < 10; sequence += 1) {
        store.appendRecords([createResponseRecord(sequence, 20_000)]);
      }
    
      assert.deepEqual(store.getSnapshot().orderedMessageIds, [
        "message-5", "message-6", "message-7", "message-8", "message-9",
      ]);
      for (const id of pausedIds) assert.ok(store.getRecord(id), `${id} should stay readable while paused`);
      assert.deepEqual(released, []);
    
      store.setPinnedMessageIds([]);
      for (const id of pausedIds) assert.equal(store.getRecord(id), undefined);
      assert.deepEqual(released, ["document-0", "document-1", "document-2", "document-3", "document-4"]);
      store.reset();
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-large-message-reading-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-large-message-reading-regression.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-retention-follow-mode-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-retention-follow-mode-regression.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-runtime-island-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-runtime-island-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const read = (path) => fs.readFileSync(path, "utf8");
    
    test("response panel resolves its own session runtime instead of receiving a hot store prop", () => {
      const panel = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
      assert.match(panel, /responseSessionId: string/);
      assert.match(panel, /responseSessionRegistry\.getOrCreate\(responseSessionId\)/);
      assert.doesNotMatch(panel, /responseStreamStore: ResponseStore/);
      assert.doesNotMatch(panel, /lastResult: GrpcResult \| null/);
      assert.doesNotMatch(panel, /assertionResults: AssertionResult\[\]/);
    });
    
    test("live session events route active and background messages through the response session registry", () => {
      const live = read("app/playground/features/request-runner/use-live-session-events.ts");
      assert.doesNotMatch(live, /appendResponseEvents:/);
      assert.doesNotMatch(live, /appendResponseEvents\(activeEvents\)/);
      assert.match(live, /responseSessionRegistry\.getOrCreate\(targetSessionId\)\.store\.appendEvents/);
    });
    
    test("main panel passes a response session id rather than a response store", () => {
      const main = read("app/playground/features/shell/workbench-main-panel.tsx");
      assert.match(main, /responseSessionId=\{/);
      assert.doesNotMatch(main, /responseStreamStore=\{/);
    });
    
    test("compatibility result state is reset when the active response session changes", () => {
      const controller = read("app/playground/features/response-viewer/use-response-controller.ts");
      assert.match(controller, /useEffect\(\(\) => \{/);
      assert.match(controller, /setLastResultState\(null\)/);
      assert.match(controller, /\[responseSessionId/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-runtime-persistence-compatibility-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-runtime-persistence-compatibility-regression.test.cjs", () => {
    const fs = require('node:fs');
    const test = require('node:test');
    const assert = require('node:assert/strict');
    
    const model = fs.readFileSync('app/playground/features/workspace/workspace-model.ts', 'utf8');
    const types = fs.readFileSync('app/playground/shared/workbench-types.ts', 'utf8');
    
    function block(name, nextName) {
      const start = model.indexOf(`export function ${name}`);
      assert.notEqual(start, -1, `${name} must exist`);
      const end = nextName ? model.indexOf(`export function ${nextName}`, start + 1) : model.length;
      return model.slice(start, end === -1 ? model.length : end);
    }
    
    test('legacy response fields remain decode-compatible but normalize out of live request sessions', () => {
      assert.match(types, /export type LegacyRequestSessionRuntimeFields/);
      assert.match(types, /events\?: UiEvent\[\]/);
      assert.match(types, /lastResult\?: GrpcResult \| null/);
    
      const normalize = block('normalizeRequestSession', 'appendLimitedUiEvent');
      assert.match(normalize, /events:\s*_legacyEvents/);
      assert.match(normalize, /lastResult:\s*_legacyLastResult/);
      assert.match(normalize, /assertionResults:\s*_legacyAssertionResults/);
      assert.doesNotMatch(normalize, /events:\s*Array\.isArray/);
      assert.doesNotMatch(normalize, /lastResult:\s*session\.lastResult/);
      assert.doesNotMatch(normalize, /assertionResults:\s*Array\.isArray/);
    });
    
    test('workspace persistence strips legacy response payload ownership from request tabs', () => {
      const compact = block('compactRequestSessionForStorage', 'compactGrpcResultForClient');
      assert.match(compact, /events:\s*_legacyEvents/);
      assert.match(compact, /lastResult:\s*_legacyLastResult/);
      assert.match(compact, /assertionResults:\s*_legacyAssertionResults/);
      assert.doesNotMatch(compact, /compactGrpcResultForStorage\(session\.lastResult\)/);
      assert.doesNotMatch(compact, /compactUiEventForStorage/);
    });
    
    test('transient payload document ids remain excluded from persisted event compatibility helpers', () => {
      const compactEvent = block('compactUiEventForStorage', 'compactPayload');
      assert.match(compactEvent, /documentId:\s*_documentId/);
      assert.doesNotMatch(compactEvent, /documentId:\s*event\.documentId/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-session-registry-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-session-registry-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const read = (path) => fs.readFileSync(path, "utf8");
    
    test("request sessions identify response runtime without owning message arrays", () => {
      const types = read("app/playground/shared/workbench-types.ts");
      const model = read("app/playground/features/request-runner/request-session-model.ts");
      assert.match(types, /responseSessionId: string/);
      assert.doesNotMatch(types, /export type RequestSession = [\s\S]*?events: UiEvent\[\]/);
      assert.doesNotMatch(types, /export type RequestSession = [\s\S]*?lastResult: GrpcResult \| null/);
      assert.match(model, /responseSessionId:/);
      assert.doesNotMatch(model, /events:\s*\[\]/);
    });
    
    test("response session registry is the runtime owner and releases stores on close", () => {
      const registry = read("app/playground/features/response-viewer/model/responseSessionRegistry.ts");
      assert.match(registry, /createResponseStore/);
      assert.match(registry, /getOrCreate/);
      assert.match(registry, /close\(sessionId/);
      assert.match(registry, /runtime\.store\.reset\(\)/);
      assert.match(registry, /resultSummary/);
      assert.match(registry, /assertionResults/);
    });
    
    test("live session events no longer clone RequestSession arrays per streamed message", () => {
      const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
      assert.match(liveEvents, /responseSessionRegistry/);
      assert.doesNotMatch(liveEvents, /setRequestSessions/);
      assert.match(liveEvents, /getOrCreate\(targetSessionId\)\.store/);
    });
    
    test("request runner completion stores response payloads in the session runtime, not RequestSession", () => {
      const runner = read("app/playground/hooks/use-request-runner.ts");
      assert.match(runner, /responseSessionRegistry/);
      assert.doesNotMatch(runner, /updateRequestSession\(targetSessionId,[\s\S]{0,350}?events:\s*resultEvents/);
      assert.doesNotMatch(runner, /updateRequestSession\(targetSessionId,[\s\S]{0,350}?lastResult:\s*clientSafeResult/);
      assert.doesNotMatch(runner, /updateRequestSession\(targetSessionId,[\s\S]{0,350}?assertionResults:\s*evaluatedAssertions/);
    });
    
    test("manual WebSocket runtime does not keep a second unbounded message array", () => {
      const controller = read("app/playground/features/websocket/use-websocket-controller.ts");
      const actions = read("app/playground/features/request-runner/use-request-runner-actions.ts");
      assert.doesNotMatch(controller, /messages:\s*unknown\[\]/);
      assert.doesNotMatch(actions, /client\.messages\.push/);
      assert.doesNotMatch(actions, /messages:\s*\[\.\.\.client\.messages\]/);
    });
    
    test("workspace persistence accepts legacy response fields but strips them from normalized control-plane sessions", () => {
      const workspace = read("app/playground/features/workspace/workspace-model.ts");
      assert.match(workspace, /events:\s*_legacyEvents/);
      assert.match(workspace, /lastResult:\s*_legacyLastResult/);
      assert.match(workspace, /assertionResults:\s*_legacyAssertionResults/);
      assert.doesNotMatch(workspace, /events:\s*\(session\.events \?\? \[\]\)\.slice/);
      assert.doesNotMatch(workspace, /lastResult:\s*session\.lastResult/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-stream-isolation-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-stream-isolation-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const read = (path) => fs.readFileSync(path, "utf8");
    
    test("hot response stream state lives in the normalized external store", () => {
      const controller = read("app/playground/features/response-viewer/use-response-controller.ts");
      const store = read("app/playground/features/response-viewer/model/response.store.ts");
      const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
      assert.match(controller, /responseSessionRegistry\.getOrCreate/);
      assert.match(controller, /responseStreamStore\.setEvents/);
      assert.match(store, /useSyncExternalStore|subscribe/);
      assert.doesNotMatch(controller, /const \[events, setEvents\] = useState/);
      assert.match(mainPanel, /<WorkbenchResponsePanel/);
    });
    
    test("sidebar navigation bypasses the giant workbench model", () => {
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
      assert.match(sidebar, /useWorkbenchSideSection\(\)/);
      assert.match(sidebar, /setWorkbenchSideSection\(section\)/);
      assert.doesNotMatch(sidebar, /useTransition|Loading \{pendingSection/);
      assert.doesNotMatch(model, /useState<SideSection>\("collections"\)/);
    });
    
    test("Latest JSON uses explicit follow hold and frozen states without polling", () => {
      const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
      const follow = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
      assert.match(latest, /Freeze latest/);
      assert.match(latest, /Unfreeze latest/);
      assert.match(follow, /mode: "hold"/);
      assert.match(follow, /mode: "frozen"/);
      assert.doesNotMatch(latest + follow, /setInterval/);
    });
    
    test("gRPC mock periodic controls use aligned grid fields", () => {
      const mockPanels = read("app/playground/features/mock-server/mock-server-panels.tsx");
      assert.match(mockPanels, /gridTemplateColumns/);
      assert.match(mockPanels, /Interval \(ms\)/);
      assert.match(mockPanels, /Loop count/);
    });
    
  });
}
