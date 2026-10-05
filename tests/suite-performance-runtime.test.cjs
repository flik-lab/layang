"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "benchmark-rerun-reset-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("benchmark-rerun-reset-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const source = fs.readFileSync(path.join(process.cwd(), "app/playground/hooks/use-benchmark-runner.ts"), "utf8");
    
    test("each benchmark run clears previous results before choosing unary or streaming execution", () => {
      const runStart = source.indexOf("const runBenchmark = useCallback");
      const streamBranch = source.indexOf("if (selectedMethod.responseStream)", runStart);
      const reset = source.indexOf("setResults([])", runStart);
    
      assert.ok(runStart >= 0 && reset > runStart && reset < streamBranch);
    });
    
    test("late benchmark callbacks cannot append results to a newer run", () => {
      assert.match(source, /const runGenerationRef = useRef\(0\)/);
      assert.match(source, /runGeneration === runGenerationRef\.current/);
      assert.match(source, /runStreamingBenchmark\(parsedJson, runGeneration\)/);
    });
    
    test("streaming benchmark separates first-message time from inter-message cadence", () => {
      assert.match(source, /periodTimeToFirstMessageMs = Math\.max\(0, now - streamStartedAt\)/);
      assert.match(source, /periodLatencies\.push\(Math\.max\(0, now - lastMessageAt\)\)/);
      assert.match(source, /intervalCount: latencies\.length/);
      assert.doesNotMatch(source, /lastMessageAt === null \? now - streamStartedAt : now - lastMessageAt/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "instant-selection-path-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("instant-selection-path-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("request tab activation is synchronous instead of being wrapped in a transition", () => {
      const tabs = read("app/playground/features/shell/shell-components.tsx");
    
      assert.match(tabs, /setVisualActiveRequestId\(session\.id\);\s*onActivate\(session\);/);
      assert.doesNotMatch(tabs, /startTabTransition\(\(\) => onActivate\(session\)\)/);
    });
    
    test("request selection resolves the active method from the pinned session before global proto state", () => {
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
    
      assert.match(model, /const sessionBinding = activeSession\?\.grpc/);
      assert.match(model, /protoRuntimeRegistry\.resolveVersion\(sessionBinding\.libraryId, sessionBinding\.versionId\)/);
      assert.match(model, /boundMethod[\s\S]*return boundMethod/);
    });
    
    test("request session switching stages the previous draft but synchronizes cached proto context immediately", () => {
      const actions = read("app/playground/features/request-editor/use-request-session-actions.ts");
    
      assert.match(actions, /pendingSessionSnapshotRef/);
      assert.match(actions, /stageRequestSessionSnapshot/);
      assert.match(actions, /effectiveRequestSession/);
      assert.match(actions, /function syncProtoContext/);
      assert.doesNotMatch(actions, /scheduleProtoContextSync/);
    });
    
    test("mock method selection commits the method and its cached proto revision in the same interaction", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
    
      assert.match(services, /useImmediateMockMethodSelection/);
      assert.match(services, /setMockSelectedMethodKey\(key\);\s*selectProtoLibraryVersion/);
      assert.doesNotMatch(services, /selectionGenerationRef\.current/);
      assert.match(services, /persistDefault: false/);
    });
    
    test("mock-only proto revision selection does not rewrite the library default revision", () => {
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
    
      assert.match(model, /persistDefault\?: boolean/);
      assert.match(model, /options\?\.persistDefault !== false/);
    });
    
    test("reselecting an unchanged collection request does not upsert the session again", () => {
      const collection = read("app/playground/features/collection/use-collection-actions.ts");
    
      assert.match(collection, /const existingNeedsRefresh = Boolean\(/);
      assert.match(collection, /if \(!existing \|\| existingNeedsRefresh\) upsertRequestSessionPreservingOrder\(session\)/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "interaction-responsiveness-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("interaction-responsiveness-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("request tab persistence is coalesced and moved off the interaction path", () => {
      const actions = read("app/playground/features/request-editor/use-request-session-actions.ts");
    
      assert.match(actions, /runWhenIdle/);
      assert.match(actions, /pendingRequestTabPersistenceRef/);
      assert.match(actions, /requestTabPersistenceScheduledRef/);
      assert.match(actions, /runWhenIdle\(\(\) => \{/);
      assert.match(actions, /pendingRequestTabPersistenceRef\.current = \{ nextSessions, nextActiveRequestId \}/);
    });
    
    test("closing an active tab updates the selected tab before deferred view hydration", () => {
      const actions = read("app/playground/features/request-editor/use-request-session-actions.ts");
    
      assert.match(actions, /activeRequestIdRef\.current = nextActiveRequestId/);
      assert.match(actions, /setActiveRequestId\(nextActiveRequestId\)/);
      assert.match(actions, /setTimeout\(\(\) => \{/);
      assert.match(actions, /activeRequestIdRef\.current !== replacement\.id/);
    });
    
    test("activity rail switches through the isolated navigation store without loading transitions", () => {
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
      const navigationStore = read("app/playground/features/shell/workbench-navigation-store.ts");
    
      assert.doesNotMatch(sidebar, /useTransition/);
      assert.doesNotMatch(sidebar, /navigationPending/);
      assert.doesNotMatch(sidebar, /pendingSection/);
      assert.match(sidebar, /const sideSection = useWorkbenchSideSection\(\)/);
      assert.match(sidebar, /setWorkbenchSideSection\(section\)/);
      assert.match(navigationStore, /useSyncExternalStore/);
      assert.match(sidebar, /aria-current=\{visualSideSection === item\.section \? "page" : undefined\}/);
    });
    
    test("response section tabs commit directly instead of deferring content behind a visual-only tab", () => {
      const responseToolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
    
      assert.doesNotMatch(responseToolbar, /useTransition/);
      assert.doesNotMatch(responseToolbar, /visualValue/);
      assert.doesNotMatch(responseToolbar, /startTabTransition/);
      assert.match(responseToolbar, /value=\{normalizedValue\}/);
      assert.match(responseToolbar, /onValueChange=\{onChange\}/);
    });
    
    
    test("request tab selection hydrates the cached Proto context in the same interaction", () => {
      const tabs = read("app/playground/features/shell/shell-components.tsx");
      const actions = read("app/playground/features/request-editor/use-request-session-actions.ts");
    
      assert.match(tabs, /visualActiveRequestId/);
      assert.match(tabs, /setVisualActiveRequestId\(session\.id\);\s*onActivate\(session\);/);
      assert.doesNotMatch(tabs, /startTabTransition/);
      assert.match(tabs, /const active = session\.id === visualActiveRequestId/);
      assert.match(actions, /stageRequestSessionSnapshot/);
      assert.match(actions, /function syncProtoContext\(binding\?: GrpcRequestBinding\)/);
      assert.doesNotMatch(actions, /scheduleProtoContextSync/);
      const syncStart = actions.indexOf("function syncProtoContext(");
      const syncEnd = actions.indexOf("\n  }", syncStart) + 4;
      assert.doesNotMatch(actions.slice(syncStart, syncEnd), /requestAnimationFrame/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "measured-bottleneck-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("measured-bottleneck-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const vm = require("node:vm");
    const { TextDecoder, TextEncoder } = require("node:util");
    const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");
    
    const read = (file) => fs.readFileSync(file, "utf8");
    
    function bootPayloadWorker() {
      const source = read("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts");
      const match = source.match(/String\.raw`([\s\S]*)`;\s*$/);
      assert.ok(match);
      const responses = [];
      const self = { postMessage(value) { responses.push(value); } };
      vm.runInContext(match[1], vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date, Uint32Array, TextDecoder, TextEncoder }));
      let sequence = 0;
      const post = (message) => {
        const requestId = `measured-${++sequence}`;
        self.onmessage({ data: { ...message, requestId } });
        const result = responses.findLast((item) => item.requestId === requestId);
        assert.ok(result, `missing worker response for ${message.type}`);
        if (result.type === "error") throw new Error(result.error);
        return result;
      };
      post({ type: "init", maxDocuments: 64, maxChars: 96_000_000, maxPreparedDocuments: 4 });
      return post;
    }
    
    test("payload worker keeps compact indexes without retaining full prepared JSON documents", () => {
      const post = bootPayloadWorker();
      for (let index = 0; index < 10; index += 1) {
        const id = `doc-${index}`;
        post({ type: "register-value", id, value: createTrackPayload(120) });
        post({ type: "get-meta", id });
      }
      const stats = post({ type: "debug-stats" }).stats;
      assert.ok(stats.preparedDocumentCount <= 4, `decoded working set leaked: ${stats.preparedDocumentCount}`);
      assert.equal(stats.indexedDocumentCount, 10);
      assert.equal(stats.documentCount, 10);
    });
    
    test("multi-message search matches compact raw payloads without preparing every document", () => {
      const post = bootPayloadWorker();
      for (let index = 0; index < 8; index += 1) {
        post({ type: "register-value", id: `doc-${index}`, value: createTrackPayload(150) });
      }
      const ids = Array.from({ length: 8 }, (_, index) => `doc-${index}`);
      const matches = post({ type: "search", ids, query: "TRACK-0149", limit: 20 }).matches;
      assert.equal(matches.length, 8);
      const stats = post({ type: "debug-stats" }).stats;
      assert.ok(stats.preparedDocumentCount <= 4, "list search should keep decoded payloads bounded");
    });
    
    test("message detail is pinned and memoized without an artificial selection delay", () => {
      const source = read("app/playground/features/response-viewer/message-list/MessageDetailPane.tsx");
      const workspace = read("app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx");
      assert.match(source, /memo\(/);
      assert.doesNotMatch(source, /SELECTION_SETTLE_MS|setTimeout|settledMessageId/);
      assert.match(workspace, /selectedRecord/);
      assert.match(workspace, /useDocumentSession/);
      assert.match(workspace, /frozenMessageIds/);
    });
    
    test("mock runtime update avoids renderer-side giant scenario parsing and stringify signatures", () => {
      const runtimeSync = read("app/playground/features/mock-server/use-mock-runtime-sync.ts");
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
      assert.doesNotMatch(runtimeSync, /parseAllMockScenarioFiles/);
      assert.doesNotMatch(runtimeSync, /scenarios:\s*parsed\.bundle\.scenarios/);
      assert.match(runtimeSync, /methodFiles/);
      assert.doesNotMatch(actions, /const parsed = parseAllMockScenarioFiles\(effectiveMockServer/);
      assert.match(actions, /methodFiles:/);
    });
    
    test("performance p95 uses a rolling time window instead of sticky session samples", () => {
      const source = read("app/playground/shared/performance/performance-stats.store.ts");
      assert.match(source, /DURATION_WINDOW_MS/);
      assert.match(source, /timestamp/);
      assert.match(source, /recentDurationValues/);
      assert.match(source, /sessionMax/);
    });
    
    test("response store batches hot append notifications instead of notifying React per event", () => {
      const source = read("app/playground/features/response-viewer/model/response.store.ts");
      assert.match(source, /RESPONSE_NOTIFY_INTERVAL_MS/);
      assert.match(source, /deferNotification/);
      assert.match(source, /setTimeout\(notifyListeners, RESPONSE_NOTIFY_INTERVAL_MS\)/);
      assert.match(source, /publish\(\{ orderedMessageIds: ordered, latestMessageId, controlEvents: nextControls \}, true\)/);
    });
    
    test("Electron mock runtime owns scenario parsing for methodFiles payloads", () => {
      const service = read("electron/services/grpc-mock-server.cjs");
      assert.match(service, /parseScenarioBundle/);
      assert.match(service, /resolveRuntimeScenarios/);
      assert.match(service, /payload\?\.methodFiles/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "performance-heap-breakdown-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("performance-heap-breakdown-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const read = (file) => fs.readFileSync(file, "utf8");
    
    test("performance telemetry records used total and limit JS heap separately", () => {
      const store = read("app/playground/shared/performance/performance-stats.store.ts");
      assert.match(store, /usedHeapMb\?: number/);
      assert.match(store, /totalHeapMb\?: number/);
      assert.match(store, /heapLimitMb\?: number/);
      assert.match(store, /totalJSHeapSize/);
      assert.match(store, /jsHeapSizeLimit/);
      assert.match(store, /activeTransportProcesses: number/);
      const lifecycle = read("app/playground/features/response-viewer/model/transportLifecycle.store.ts");
      assert.match(lifecycle, /activeTransportProcesses/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "performance-runtime-observability-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("performance-runtime-observability-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("performance snapshot exposes response, mock, transport, and granular render diagnostics", () => {
      const store = read("app/playground/shared/performance/performance-stats.store.ts");
      assert.match(store, /responseRuntime:/);
      assert.match(store, /responseSessionCount/);
      assert.match(store, /responseRegistryRecords/);
      assert.match(store, /responseRegistryDocumentRefs/);
      assert.match(store, /mockRuntime:/);
      assert.match(store, /mockPollsPerSec/);
      assert.match(store, /mockPublishedChangesPerSec/);
      assert.match(store, /transportLifecycle:/);
      assert.match(store, /activeDecodeWorkers/);
      assert.match(store, /pendingDecodeAcks/);
      assert.match(store, /payloadProducerChannels/);
      assert.match(store, /activeStreamSubscriptions/);
      assert.match(store, /responsePanelRendersPerSec/);
      assert.match(store, /latestViewerRendersPerSec/);
      assert.match(store, /messageWorkspaceRendersPerSec/);
      assert.match(store, /statusBarRendersPerSec/);
    });
    
    test("diagnostics panel samples runtime owners only while open and groups lifecycle sections", () => {
      const panel = read("app/playground/shared/performance/PerformanceStatsPanel.tsx");
      assert.match(panel, /responseSessionRegistry\.getDebugStats\(\)/);
      assert.match(panel, /mockRuntimeStore\.getDebugStats\(\)/);
      assert.match(panel, /transportLifecycleStore\.getSnapshot\(\)/);
      assert.match(panel, /setRuntimeDiagnostics/);
      assert.match(panel, /Response runtime/);
      assert.match(panel, /Transport lifecycle/);
      assert.match(panel, /Mock runtime/);
    });
    
    test("render instrumentation covers response panel, latest, message workspace, and status bar", () => {
      assert.match(read("app/playground/features/response-viewer/response-workbench-panel.tsx"), /recordRenderInvocation\("responsePanel"\)/);
      assert.match(read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx"), /recordRenderInvocation\("latestViewer"\)/);
      assert.match(read("app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx"), /recordRenderInvocation\("messageWorkspace"\)/);
      assert.match(read("app/playground/features/shell/workbench-status-bar.tsx"), /recordRenderInvocation\("statusBar"\)/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "performance-stats-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("performance-stats-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
    
    test("performance telemetry uses an external store and bounded samples", () => {
      assert.equal(exists("app/playground/shared/performance/performance-stats.store.ts"), true);
      const source = read("app/playground/shared/performance/performance-stats.store.ts");
      assert.match(source, /useSyncExternalStore/);
      assert.match(source, /MAX_DURATION_SAMPLES/);
      assert.match(source, /MAX_FRAME_SAMPLES/);
      assert.match(source, /recordCounter/);
      assert.match(source, /recordDuration/);
      assert.match(source, /createPerformanceSnapshot/);
      assert.match(source, /recommendations/);
    });
    
    test("performance diagnostics open in a dedicated managed window from the status bar", () => {
      const statusBar = read("app/playground/features/shell/workbench-status-bar.tsx");
      const appBar = read("app/playground/features/shell/workbench-app-bar.tsx");
      const detachedTitlebar = read("app/playground/features/windows/detached-window-titlebar.tsx");
      const host = read("app/playground/shared/performance/PerformanceStatsHost.tsx");
      const panel = read("app/playground/shared/performance/PerformanceStatsPanel.tsx");
      assert.match(statusBar, />Perf</);
      assert.match(statusBar, /openDetached\?\.\(\{ kind: "performance", title: "Performance" \}\)/);
      assert.doesNotMatch(appBar, /Performance diagnostics/);
      assert.doesNotMatch(detachedTitlebar, /Performance diagnostics/);
      assert.match(host, /performance:snapshot/);
      assert.match(panel, /Copy Snapshot JSON/);
      assert.match(panel, /Main thread/);
      assert.match(panel, /Stream/);
      assert.match(panel, /Payload worker/);
      assert.match(panel, /Mock catalog/);
      assert.match(panel, /React/);
      assert.doesNotMatch(panel, /@keyframes|@media/);
    });
    
    test("hot paths feed telemetry without React state updates", () => {
      const live = read("app/playground/features/request-runner/use-live-session-events.ts");
      const payload = read("app/playground/features/response-viewer/payload-document/payloadDocument.client.ts");
      const mock = read("app/playground/features/mock-server/catalog/mockCatalog.store.ts");
      const interaction = read("app/playground/shared/performance/interaction-performance.ts");
      assert.match(live, /performanceStats\.recordStreamIncoming/);
      assert.match(live, /performanceStats\.setDeferredBacklog/);
      assert.match(live, /performanceStats\.recordUiCommitted/);
      assert.match(payload, /performanceStats\.recordPayloadRequest/);
      assert.match(payload, /performanceStats\.setPayloadInFlight/);
      assert.match(mock, /performanceStats\.recordMockDuration/);
      assert.match(interaction, /performanceStats\.recordInteraction/);
    });
    
    test("React commit durations are measured with Profiler boundaries", () => {
      const container = read("app/playground/workbench-container.tsx");
      assert.match(container, /Profiler/);
      assert.match(container, /performanceStats\.recordReactCommit/);
      assert.match(container, /id="Workbench"/);
    });
    
  });
}
