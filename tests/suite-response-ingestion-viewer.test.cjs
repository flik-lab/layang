"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "metadata-only-response-flow-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("metadata-only-response-flow-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const source = fs.readFileSync("app/playground/features/request-runner/use-live-session-events.ts", "utf8");
    
    test("utility document-ref messages bypass payload registration and ingestion queue", () => {
      assert.match(source, /function isUtilityMetadataMessage/);
      assert.match(source, /if \(isUtilityMetadataMessage\(event\)\)/);
      assert.match(source, /const uiEvent = eventToUiEvent\(event\)[\s\S]{0,200}appendPendingUiEvent\(targetSessionId, uiEvent\)/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-find-navigation-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-find-navigation-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const read = (path) => fs.readFileSync(path, "utf8");
    
    test("response search navigation delegates virtual JSON matches to the paged document viewer", () => {
      const toolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
      const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
      const styles = read("app/globals.css");
      assert.match(toolbar, /\.virtual-json-viewer/);
      assert.match(toolbar, /layang-virtual-search/);
      assert.match(toolbar, /layang-virtual-search-state/);
      assert.match(viewer, /payloadDocumentService\.search/);
      assert.match(viewer, /scrollToIndex/);
      assert.match(viewer, /useFixedVirtualWindow/);
      assert.doesNotMatch(viewer, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
      assert.match(viewer, /dataset\.virtualSearchCount/);
      assert.match(viewer, /className="virtual-json-viewer"/);
      assert.match(styles, /\.search-highlight\.search-highlight--active/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-ingestion-hydration-flow-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-ingestion-hydration-flow-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    
    const read = (file) => fs.readFileSync(file, "utf8");
    
    test("native gRPC payload port is attached directly to the payload worker instead of consumed in renderer client", () => {
      const nativeClient = read("lib/native-grpc-client.ts");
      const payloadService = read("app/playground/features/response-viewer/payload-document/payloadDocument.service.ts");
      const requestRunner = read("app/playground/hooks/use-request-runner.ts");
    
      assert.doesNotMatch(nativeClient, /nativeGrpcPayloadPort\.onmessage|serializedValueUtf8|toOwnedArrayBuffer/);
      assert.match(nativeClient, /documentRef/);
      assert.match(payloadService, /ensureNativeGrpcProducerPort/);
      assert.match(payloadService, /attachProducerPort/);
      assert.match(requestRunner, /ensureNativeGrpcProducerPort/);
      assert.doesNotMatch(requestRunner, /registerSerializedDocument/);
    });
    
    test("Electron main waits for payload-worker registration ack before publishing compact message metadata", () => {
      const ipc = read("electron/ipc/native-grpc-ipc.cjs");
      assert.match(ipc, /register-utf8/);
      assert.match(ipc, /documentRef/);
      assert.match(ipc, /pendingPayloadRegistrations/);
      assert.match(ipc, /Promise\.all/);
      assert.doesNotMatch(ipc, /serializedValueUtf8:\s*grpcEvent\.serializedValueUtf8/);
    });
    
    test("Latest follow uses quiet coalescing with a bounded maximum staleness", () => {
      const source = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
      assert.match(source, /LATEST_FOLLOW_QUIET_MS/);
      assert.match(source, /LATEST_FOLLOW_MAX_STALENESS_MS/);
      assert.match(source, /pendingLatestIdRef/);
      assert.match(source, /quietTimerRef/);
      assert.match(source, /maxStalenessTimerRef/);
    });
    
    test("JSON hydration is priority-aware and user-opened viewers use the interactive queue", () => {
      const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
      const viewportHook = read("app/playground/features/response-viewer/json-document/useJsonViewport.ts");
      const scheduler = read("app/playground/features/response-viewer/document-session/documentHydrationScheduler.ts");
      const service = read("app/playground/features/response-viewer/payload-document/payloadDocument.service.ts");
      const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
      const message = read("app/playground/features/response-viewer/message-list/MessageDetailPane.tsx");
    
      assert.match(viewer, /priority/);
      assert.match(viewportHook, /priority/);
      assert.match(scheduler, /user-visible/);
      assert.match(scheduler, /latest-visible/);
      assert.match(scheduler, /prefetch/);
      assert.doesNotMatch(service, /interactiveHydrationQueue|backgroundHydrationQueue/);
      assert.match(latest, /priority=\{state\.mode === "follow" \? "background" : "interactive"\}/);
      assert.match(message, /priority="interactive"/);
    });
    
    test("Latest stays live while user scrolls and only explicit freeze stops document updates", () => {
      const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
      const follow = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
      assert.doesNotMatch(latest, /Inspect latest JSON/);
      assert.match(latest, /JsonDocumentViewer/);
      assert.doesNotMatch(latest, /onUserNavigate=\{holdCommitted\}/);
      assert.match(latest, /Following latest/);
      assert.match(latest, /Freeze latest/);
      assert.match(follow, /const freeze/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-message-windowing-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-message-windowing-regression.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-payload-worker-performance-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-payload-worker-performance-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const read = (path) => fs.readFileSync(path, "utf8");
    
    test("payload serialization and line indexing live in one Blob document worker", () => {
      const client = read("app/playground/features/response-viewer/payload-document/payloadDocument.client.ts");
      const worker = read("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts");
      assert.match(client, /new Blob/);
      assert.match(client, /new Worker\(workerUrl/);
      assert.doesNotMatch(client, /new Worker\(\s*new URL/);
      assert.match(worker, /stringifyCompact/);
      assert.match(worker, /buildLineIndex/);
      assert.match(worker, /formatIndexedLine/);
      assert.doesNotMatch(worker, /ensurePretty/);
      assert.match(worker, /Uint32Array/);
      assert.match(worker, /Uint16Array/);
    });
    
    test("live stream hot path registers native payloads once and no longer uses a preview compactor", () => {
      const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
      assert.match(liveEvents, /payloadDocumentService\.registerValue/);
      assert.match(liveEvents, /ingestionQueuesRef/);
      assert.match(liveEvents, /drainSessionQueue/);
      assert.doesNotMatch(liveEvents, /createResponseEventCompactor|compactUiEvent\(eventToUiEvent/);
      assert.equal(fs.existsSync("app/playground/features/request-runner/response-event-compactor.ts"), false);
    });
    
    test("per-session queue preserves control ordering while coalescing excess messages", () => {
      const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
      assert.match(liveEvents, /sequence: pending\.nextSequence/);
      assert.match(liveEvents, /takeNextQueuedEvent\(pending\)/);
      assert.match(liveEvents, /pending\.messages\[pending\.messages\.length - 1\] = event/);
    });
    
    test("final reconciliation registers bounded retained values sequentially", () => {
      const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
      assert.match(liveEvents, /slice\(-MAX_FINAL_MESSAGE_EVENTS/);
      assert.match(liveEvents, /for \(const event of boundedEvents\) prepared\.push\(await prepareUiEventForDocumentStore\(event\)\)/);
      assert.doesNotMatch(liveEvents, /Promise\.all\(boundedEvents/);
    });
    
    test("legacy preview worker and live payload cache are removed", () => {
      assert.equal(fs.existsSync("app/playground/features/request-runner/response-payload-worker-runtime.ts"), false);
      assert.equal(fs.existsSync("app/playground/shared/live-payload-cache.ts"), false);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "response-viewer-runtime-regressions.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("response-viewer-runtime-regressions.test.cjs", () => {
    const __bundleCreateRequire = require("node:module").createRequire;
    const __bundlePath = require("node:path");
    const __bundleBaseDir = __dirname;
    
    
    
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "response-atomic-document-session-runtime.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("response-atomic-document-session-runtime.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        
        const read = (file) => fs.readFileSync(file, "utf8");
        
        test("document session keeps committed content while a replacement prepares and rejects stale generations", () => {
          const reducer = read("app/playground/features/response-viewer/document-session/documentSession.reducer.ts");
          const types = read("app/playground/features/response-viewer/document-session/documentSession.types.ts");
        
          assert.match(types, /requested\?: DocumentSessionTarget/);
          assert.match(types, /pending\?: PendingDocument/);
          assert.match(types, /committed\?: CommittedDocument/);
          assert.match(reducer, /case "request"/);
          assert.match(reducer, /committed: state\.committed/);
          assert.match(reducer, /case "prepared"/);
          assert.match(reducer, /action\.generation !== state\.generation/);
          assert.match(reducer, /committed:\s*\{/);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "response-atomic-document-swap-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("response-atomic-document-swap-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        
        const read = (file) => fs.readFileSync(file, "utf8");
        
        test("JSON viewer renders committed prepared documents and seeds viewport cache without clearing on target changes", () => {
          const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
          const viewport = read("app/playground/features/response-viewer/json-document/useJsonViewport.ts");
          assert.match(viewer, /document: CommittedDocument/);
          assert.match(viewer, /useJsonViewport\(document/);
          assert.doesNotMatch(viewer, /useJsonDocumentWindow/);
          assert.match(viewport, /preparedWindow\.lines/);
          assert.match(viewport, /preparedWindow\.startLine/);
          assert.doesNotMatch(viewport, /setLineCount\(0\)/);
          assert.equal(fs.existsSync("app/playground/features/response-viewer/json-document/useJsonDocumentWindow.ts"), false);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "response-controller-render-publish-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("response-controller-render-publish-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        const read = (path) => fs.readFileSync(path, "utf8");
        
        test("response controller never publishes external-store updates from inside React state updater callbacks", () => {
          const controller = read("app/playground/features/response-viewer/use-response-controller.ts");
          assert.doesNotMatch(
            controller,
            /setLastResultState\(\(current\) => \{[\s\S]{0,500}?runtime\.setResultSummary/,
          );
          assert.doesNotMatch(
            controller,
            /setAssertionResultsState\(\(current\) => \{[\s\S]{0,500}?runtime\.setAssertionResults/,
          );
          assert.match(controller, /lastResultRef\.current/);
          assert.match(controller, /assertionResultsRef\.current/);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "response-document-hydration-scheduler-runtime.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("response-document-hydration-scheduler-runtime.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        
        test("document hydration scheduler supersedes only queued work from the same latest-wins session", () => {
          const source = fs.readFileSync("app/playground/features/response-viewer/document-session/documentHydrationScheduler.ts", "utf8");
          assert.match(source, /sessionId/);
          assert.match(source, /strategy === "latest-wins"/);
          assert.match(source, /task\.sessionId === request\.sessionId/);
          assert.match(source, /task\.resolve\(undefined\)/);
          assert.match(source, /user-visible/);
          assert.match(source, /latest-visible/);
          assert.match(source, /prefetch/);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "response-history-performance-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("response-history-performance-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        const source = fs.readFileSync("app/playground/features/response-viewer/model/response.store.ts", "utf8");
        
        test("response store bounds retained message and compatibility windows", () => {
          assert.match(source, /DEFAULT_MAX_MESSAGES = 10/);
          assert.match(source, /setRetentionLimit\(limit: number\): void/);
          assert.match(source, /\.slice\(-100\)/);
          assert.match(source, /compatibilityEvents = \[\.\.\.compatibilityEvents, \.\.\.events\]\.slice\(-retentionLimit\)/);
          assert.doesNotMatch(source, /\.sort\(/);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "response-latest-wins-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("response-latest-wins-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        
        const read = (file) => fs.readFileSync(file, "utf8");
        
        test("Latest owns only desired target while document session owns committed display", () => {
          const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
          const follow = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
          const types = read("app/playground/features/response-viewer/latest/latestFollow.types.ts");
          assert.match(types, /targetMessageId\?: string/);
          assert.doesNotMatch(types, /displayedMessageId/);
          assert.match(latest, /useDocumentSession/);
          assert.match(latest, /strategy: state\.mode === "follow" \? "latest-wins" : "strict"/);
          assert.match(latest, /session\.committed/);
          assert.match(follow, /targetMessageId/);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "response-message-selection-runtime.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("response-message-selection-runtime.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        
        test("selected message is pinned while new stream rows stay pending until resume", () => {
          const panel = fs.readFileSync("app/playground/features/response-viewer/response-workbench-panel.tsx", "utf8");
          const workspace = fs.readFileSync("app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx", "utf8");
          const list = fs.readFileSync("app/playground/features/response-viewer/message-list/MessageList.tsx", "utf8");
          assert.match(panel, /MessageReadingWorkspace/);
          assert.match(workspace, /selectedMessageId/);
          assert.match(workspace, /selectedRecord/);
          assert.match(workspace, /useDocumentSession/);
          assert.match(workspace, /document=\{session\.committed\}/);
          assert.match(workspace, /readingLocked/);
          assert.match(workspace, /pendingCount/);
          assert.match(list, /selectedMessageId/);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "response-viewer-single-scroll-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("response-viewer-single-scroll-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        const read = (path) => fs.readFileSync(path, "utf8");
        
        test("message list and JSON detail own independent stable scroll hosts", () => {
          const panel = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
          const workspace = read("app/playground/features/response-viewer/message-list/MessageReadingWorkspace.tsx");
          const list = read("app/playground/features/response-viewer/message-list/MessageList.tsx");
          const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
          assert.match(workspace, /gridTemplateColumns: "minmax\(240px, 34%\) minmax\(0, 1fr\)"/);
          assert.match(list, /overflow: "auto"/);
          assert.match(viewer, /overflow: "auto"/);
          assert.match(viewer, /overflowAnchor: "none"/);
          assert.doesNotMatch(panel, /inline expanded|pinnedEvents/);
        });
        
      });
    }
    
  });
}
