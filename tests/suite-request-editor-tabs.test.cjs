"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "request-body-fill-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("request-body-fill-regression.test.cjs", () => {
    const test = require('node:test');
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    
    const source = fs.readFileSync('app/playground/features/shell/workbench-main-panel.tsx', 'utf8');
    const responsePanel = fs.readFileSync('app/playground/features/response-viewer/response-workbench-panel.tsx', 'utf8');
    
    // The vertical splitter remains; only the request body editor should consume the pane above it.
    test('request body editors fill the request pane while the response splitter remains resizable', () => {
      assert.match(responsePanel, /aria-label="Resize request and response panels"/);
      assert.match(responsePanel, /onMouseDown=\{beginResponseResize\}/);
      assert.match(source, /data-layout=\{requestTab === "body" \? "request-body-fill"/);
      assert.match(source, /fullHeight=\{true\}/);
    });
    
    test('main panel keeps InputAdornment available for request controls', () => {
      assert.match(source, /\bInputAdornment,/);
      assert.match(source, /<InputAdornment position="start">/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "request-tab-middle-click-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("request-tab-middle-click-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    const source = read("app/playground/features/shell/shell-components.tsx");
    
    test("middle mouse down closes the targeted request tab without activating it first", () => {
      assert.match(
        source,
        /onMouseDown=\{\(event: ReactMouseEvent<HTMLElement>\) => \{[\s\S]*?event\.button !== 1[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onClose\(session\.id\)/,
      );
    });
    
    
    test("request tab drag reorder is persisted through the session action", () => {
      const actions = read("app/playground/features/request-editor/use-request-session-actions.ts");
      const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
    
      assert.match(source, /draggable=\{Boolean\(onReorder\)\}/);
      assert.match(source, /onReorder\?\.\(sourceId, session\.id, position\)/);
      assert.match(actions, /reorderRequestSessionList\(requestSessions, sourceId, targetId, position\)/);
      assert.match(actions, /persistRequestTabsNow\(next, activeRequestId\)/);
      assert.match(mainPanel, /onReorder=\{reorderRequestSessions\}/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "request-tabs-cross-protocol-copy-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("request-tabs-cross-protocol-copy-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("request tabs keep visible copy compact and move operation context to the tooltip", () => {
      const tabs = read("app/playground/features/shell/shell-components.tsx");
      const main = read("app/playground/features/shell/workbench-main-panel.tsx");
      const copy = read("app/playground/shared/ui-copy.ts");
    
      assert.match(tabs, /function requestTabContextLabel/);
      assert.match(tabs, /title=\{requestTabContextLabel\(session\)\}/);
      assert.match(tabs, /<span className="request-tab__title">\{session\.title\}<\/span>/);
      assert.doesNotMatch(tabs, /title=\{`\$\{session\.title\} - \$\{session\.serviceName\}/);
      assert.match(copy, /closeTab: "Close tab"/);
      assert.match(copy, /closeOtherTabs: "Close other tabs"/);
      assert.match(main, /const requestHeaderTitle =\s*activeCollectionRequest\?\.name/);
      assert.match(main, /const requestHeaderBadge = activeIsRest/);
      assert.doesNotMatch(main, /activeRunning && !activeIsWebSocket/);
    });
    
    test("REST and WebSocket mock panels share concise section and field copy", () => {
      const rest = read("app/playground/features/rest/rest-panels.tsx");
      const websocket = read("app/playground/features/websocket/websocket-panels.tsx");
      const services = read("app/playground/features/services/services-workspace.tsx");
      assert.match(rest, /uiCopy\.sections\.matchers/);
      assert.match(rest, /uiCopy\.sections\.response/);
      assert.match(rest, /uiCopy\.fields\.delayMs/);
      assert.doesNotMatch(rest, /REST mock server|Delay ms|Response body|Recent mock requests/);
    
      assert.match(websocket, /uiCopy\.sections\.response/);
      assert.match(websocket, /<MockExecutionControls/);
      assert.match(services, /const requestLogs = status\.requestLog \?\? \[\]/);
      assert.doesNotMatch(
        websocket,
        /Configure this request mock here|Scenario code \/ mock message body|label="Max"|label="Interval"/,
      );
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "request-view-proto-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("request-view-proto-regression.test.cjs", () => {
    const test = require('node:test');
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    
    const source = fs.readFileSync('app/playground/features/shell/workbench-main-panel.tsx', 'utf8');
    
    test('gRPC request tools expose View Proto as a request-bound utility', () => {
      assert.match(source, /setRequestUtilityDialog\("proto"\)/);
      assert.match(source, />\s*View Proto\s*<\/MenuItem>/);
      assert.match(source, /!activeIsRest && !activeIsWebSocket/);
      assert.match(source, /activeRequestProtoVersion\?\.files \?\? \[\]/);
      assert.match(source, /selectedMethod\?\.sourceFile/);
    });
    
    test('View Proto renders source text from the request proto revision', () => {
      assert.match(source, /requestUtilityDialog === "proto"/);
      assert.match(source, /activeRequestProtoSourceFile\.name/);
      assert.match(source, /activeRequestProtoSourceFile\.text/);
      assert.match(source, /activeRequestProtoLibrary\?\.name/);
      assert.match(source, /activeRequestProtoVersion\?\.version/);
    });
    
    
    test('View Proto uses the shared readable code viewer instead of an isolated dense pre style', () => {
      assert.match(source, /className="code-viewer code-viewer--proto request-proto-viewer"/);
      assert.match(source, /<code>\{activeRequestProtoSourceFile\.text\}<\/code>/);
    });
    
  });
}
