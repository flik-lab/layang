"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "compact-request-mock-controls-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("compact-request-mock-controls-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("WebSocket and REST request body controls stay compact and remove redundant helper badges", () => {
      const source = read("app/playground/features/shell/workbench-main-panel.tsx");
      assert.doesNotMatch(source, /Connect from the request header/);
      assert.doesNotMatch(source, /Configure body mode for this REST request/);
      assert.match(source, /aria-label": "REST body type"/);
      assert.match(source, /\n\s+Send\n/);
    });
    
    test("REST and WebSocket mock headers keep endpoint and runtime actions on one compact row", () => {
      const rest = read("app/playground/features/rest/rest-panels.tsx");
      const websocket = read("app/playground/features/websocket/websocket-panels.tsx");
      assert.match(rest, /status\.url \?\? `http:\/\/\$\{project\.bindHost\}:\$\{project\.port\}`/);
      assert.match(websocket, /status\.url \?\? "ws:\/\/127\.0\.0\.1"/);
      assert.match(rest, />Start<\/Button>/);
      assert.match(rest, />Stop<\/Button>/);
      assert.match(websocket, />Start<\/Button>/);
      assert.match(websocket, />Stop<\/Button>/);
      assert.match(rest, /overflowX: "auto"/);
      assert.match(websocket, /overflowX: "auto"/);
      assert.doesNotMatch(websocket, /Variables: count, incoming/);
      assert.doesNotMatch(rest, /Variables: now, uuid, and request/);
    });
    
    test("shared mock execution controls render as a single horizontally scrollable control row", () => {
      const source = read("app/playground/features/mock-server/workspace/MockExecutionControls.tsx");
      assert.match(source, /overflowX: inline \? "visible" : "auto"/);
      assert.match(source, /scrollbarWidth: "thin"/);
      assert.doesNotMatch(source, /helperText="0 = unlimited"/);
      assert.doesNotMatch(source, /Hybrid races the enabled triggers/);
      assert.match(source, /label=\{inline \? undefined : grpcStream \? "Interval" : "Interval \(ms\)"\}/);
      assert.match(source, /label=\{inline \? undefined : grpcStream \? "Max" : "Max executions"\}/);
      assert.match(source, /inline \? \([\s\S]*grpcStream \? "Interval" : "Interval \(ms\)"/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "mock-editor-focus-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("mock-editor-focus-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    
    function read(relativePath) {
      return fs.readFileSync(path.join(root, relativePath), "utf8");
    }
    
    test("mock scenario editor changes context without remounting the editor surface", () => {
      const panel = read("app/playground/features/mock-server/mock-server-panels.tsx");
      assert.doesNotMatch(panel, /<Box key=\{editorInstanceKey\}>/);
      assert.match(panel, /resetKey=\{editorInstanceKey\}/);
    });
    
    test("CodeMirror editor handles context reset internally", () => {
      const wrapper = read("app/playground/features/request-editor/request-editor-panels.tsx");
      const editor = read("components/editor/layang-code-editor.tsx");
      assert.match(wrapper, /resetKey\?: string/);
      assert.match(editor, /editorViewStateByKey/);
      assert.match(editor, /saveViewState\(view, resetKey\)/);
    });
    
    test("dialog focus lifecycle is not recreated when an inline onClose callback changes", () => {
      const compat = read("components/shadcn/compat.tsx");
      assert.match(compat, /const onCloseRef = useRef\(onClose\)/);
      assert.match(compat, /onCloseRef\.current = onClose;\s*\}, \[onClose\]\);/);
      assert.match(compat, /previouslyFocused\?\.focus\(\);\s*\};\s*\}, \[open\]\);/);
      assert.doesNotMatch(compat, /previouslyFocused\?\.focus\(\);\s*\};\s*\}, \[onClose, open\]\);/);
    });
    
    test("fullscreen editor fills the dialog and restores the same CodeMirror view state", () => {
      const wrapper = read("app/playground/features/request-editor/request-editor-panels.tsx");
      const editor = read("components/editor/layang-code-editor.tsx");
      assert.match(editor, /editorViewStateByKey/);
      assert.match(editor, /scrollTop: view\.scrollDOM\.scrollTop/);
      assert.match(editor, /const selection = saved/);
      assert.match(wrapper, /flex: "1 1 auto",\s*width: "100%",\s*minWidth: 0/);
      assert.match(wrapper, /<DialogContent[\s\S]*?width: "100%"[\s\S]*?minWidth: 0[\s\S]*?overflow: "hidden"/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "mock-editor-save-boundary-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("mock-editor-save-boundary-regression.test.cjs", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    const assert = require("node:assert/strict");
    
    const source = fs.readFileSync(
      path.join(process.cwd(), "app/playground/features/mock-server/workspace/FileBasedGrpcScenarios.tsx"),
      "utf8",
    );
    
    test("canonical editor saves against the loaded revision and requires explicit runtime Apply", () => {
      assert.match(source, /store\.save\(directoryPath,current,sourceText,expectedRevision,expectedHash\)/);
      assert.match(source, /File changed externally/);
      assert.match(source, /Press Activate to use it on the running mock/);
      const save = source.slice(source.indexOf("const save ="), source.indexOf("const latestDraft"));
      assert.doesNotMatch(save, /setMockServer\(/);
    });

  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "mock-stream-editor-compact-shortcuts-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("mock-stream-editor-compact-shortcuts-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    
    
    test("mocking sidebar exposes a right aligned gRPC home settings action", () => {
      const sidebar = read("app/playground/features/mock-server/sidebar/MockingSidebar.tsx");
      const shell = read("app/playground/features/shell/workbench-sidebar.tsx");
    
      assert.match(sidebar, /onOpenGrpcHome\(\): void/);
      assert.match(sidebar, /title="gRPC Home \/ Settings"/);
      assert.match(sidebar, /aria-label="gRPC Home \/ Settings"/);
      assert.match(sidebar, /<Settings/);
      assert.match(shell, /onOpenGrpcHome=\{\(\) => \{/);
      assert.match(shell, /setMockSelectedMethodKey\(grpcMockOverviewMethodKey\)/);
      assert.match(shell, /setServiceProtocol\("grpc-mock"\)/);
    });
    
    
    
    test("mock catalog status badge keeps breathing room from picker and toggle", () => {
      const row = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");
    
      assert.match(row, /gridTemplateColumns: "minmax\(150px, 1\.05fr\) minmax\(180px, 1\.4fr\) 82px 64px 34px"/);
      assert.match(row, /<Chip size="small" color=\{color\} variant=\{row\.status === "live" \? undefined : "outlined"\} label=\{label\} sx=\{\{ height: 22, mx: 0\.5 \}\} \/>/);
    });
    
    
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "request-grpc-mock-inline-controls-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("request-grpc-mock-inline-controls-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    
    const root = path.resolve(__dirname, "..");
    
    
    test("Web Access gateway uses the same request matcher as native gRPC mock", () => {
      const gateway = fs.readFileSync(path.join(root, "electron/services/grpc-gateway-server.cjs"), "utf8");
      const nativeMock = fs.readFileSync(path.join(root, "electron/services/grpc-mock-server.cjs"), "utf8");
      assert.match(gateway, /const \{ mockMatcherMatches \} = require\("\.\/grpc-mock-server\.cjs"\)/);
      assert.match(gateway, /mockMatcherMatches\(scenario\.input \|\| scenario\.match, requestContext\)/);
      assert.match(nativeMock, /mockMatcherMatches,/);
      assert.doesNotMatch(gateway, /\{ \.\.\.request, headers:/);
    });
    
    
  });
}
