"use strict";

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
