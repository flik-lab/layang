"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-compact-split-layout-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-compact-split-layout-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("focused gRPC mock keeps scenario and stream execution controls on one compact row", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const controls = read("app/playground/features/mock-server/workspace/MockExecutionControls.tsx");
      const start = services.indexOf("function GrpcFocusedMockWorkspace");
      const end = services.indexOf("export function GrpcMockWorkspace", start);
      const focused = services.slice(start, end);
    
      assert.match(focused, /Scenario for \$\{method\.methodName\}/);
      assert.match(focused, /<MockExecutionControls[\s\S]*variant="grpc-stream"[\s\S]*inline[\s\S]*hideLabel/);
      assert.match(focused, /aria-label="Scenario settings"/);
      assert.doesNotMatch(focused, />\s*Scenario Settings\s*</);
      assert.match(controls, /grpcStream \? 126 : 150/);
      assert.match(controls, /label=\{inline \? undefined : grpcStream \? "Interval" : "Interval \(ms\)"\}/);
      assert.match(controls, /label=\{inline \? undefined : grpcStream \? "Max" : "Max executions"\}/);
      assert.match(controls, /hybrid && !grpcStream/);
    });
    
    test("manual send reuses the selected gRPC scenario instead of adding another scenario selector", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const start = services.indexOf("function GrpcFocusedMockWorkspace");
      const end = services.indexOf("export function GrpcMockWorkspace", start);
      const focused = services.slice(start, end);
    
      assert.match(focused, /aria-label="Manual Send"/);
      assert.match(focused, /Manual response for \$\{method\.methodName\}/);
      assert.match(focused, /handleGrpcMockLivePushSend\([\s\S]*selectedScenarioId/);
      assert.doesNotMatch(focused, /Manual scenario for/);
      assert.doesNotMatch(focused, /manualScenarioId/);
      assert.doesNotMatch(focused, /Sends the saved scenario snapshot/);
    });
    
    test("gRPC scenario editor keeps compact settings above a persisted request-response style splitter", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const start = services.indexOf("function GrpcFocusedMockWorkspace");
      const end = services.indexOf("export function GrpcMockWorkspace", start);
      const focused = services.slice(start, end);
    
      assert.match(focused, /settingsPaneHeightRef = useRef<number \| null>\(null\)/);
      assert.match(focused, /layang:grpc-mock-settings-height:\$\{key\}/);
      assert.match(focused, /aria-label="Resize gRPC mock settings and scenario editor"/);
      assert.match(focused, /cursor: "row-resize"/);
      assert.match(focused, /flex: settingsPaneHeight === null \? "0 0 auto" : `0 0 \$\{settingsPaneHeight\}px`/);
      assert.match(focused, /flex: "1 1 0"/);
      assert.match(focused, /onKeyDown=\{resizeEditorPaneByKeyboard\}/);
      assert.doesNotMatch(focused, /editorPaneRatio/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-large-catalog-ui-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-large-catalog-ui-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("Mocking catalog is flat, virtualized, and no longer parses scenario files during render", () => {
      const catalogList = read("app/playground/features/mock-server/workspace/MockCatalogList.tsx");
      const catalogRow = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");
      const services = read("app/playground/features/services/services-workspace.tsx");
      assert.match(catalogList, /useFixedVirtualWindow\(/);
      assert.doesNotMatch(catalogList, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
      assert.match(catalogRow, /MockScenarioPicker/);
      assert.doesNotMatch(catalogList, /parseMockScenarioText\(/);
      assert.doesNotMatch(catalogRow, /parseMockScenarioText\(/);
      assert.doesNotMatch(services, /const allScenarioRows = useMemo/);
      assert.doesNotMatch(services, /const allScenarioProtoGroups = useMemo/);
    });
    
    test("scenario options are loaded only when one picker opens", () => {
      const picker = read("app/playground/features/mock-server/workspace/MockScenarioPicker.tsx");
      assert.match(picker, /onOpen/);
      assert.match(picker, /getScenarios\(methodId\)/);
      assert.doesNotMatch(picker, /allScenarioRows/);
    });
    
    test("legacy Mocking sidebar implementation is retired", () => {
      assert.equal(fs.existsSync(path.join(root, "app/playground/features/services/mocking-sidebar-tree.tsx")), false);
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
      assert.match(sidebar, /MockingSidebar/);
      assert.doesNotMatch(sidebar, /MockingSidebarTree/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-selection-request-tabs-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-selection-request-tabs-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("gRPC mock method selection is not overwritten while the active proto revision changes", () => {
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const services = read("app/playground/features/services/services-workspace.tsx");
    
      assert.match(model, /const explicitKey = mockSelectedMethodKey\.trim\(\)/);
      assert.match(model, /protoRuntimeRegistry\.resolveVersion\(source\.libraryId, source\.versionId\)/);
      assert.match(model, /if \(mockSelectedMethodKey \|\| !mockSelectedMethod\) return/);
      assert.doesNotMatch(model, /if \(key !== mockSelectedMethodKey\) setMockSelectedMethodKey\(key\)/);
    
      assert.match(services, /const selectCatalogMethod = useCallback/);
      assert.match(services, /setMockSelectedMethodKey\(row\.methodKey\)/);
      assert.match(services, /selectProtoLibraryVersion\(row\.libraryId, row\.versionId, \{ persistDefault: false \}\)/);
      assert.doesNotMatch(services, /currentStillExists/);
    });
    
    test("scenario source editor edits one scenario and opens the canonical gRPC method files", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
      const main = read("electron/main.cjs");
    
      assert.match(services, /const canonicalSource = formatSingleMockScenarioForEditor\(row\.scenario, canonicalFormat\)/);
      assert.match(services, /parseSingleMockScenarioText\(source, editorFormat, mockServer\.port, row\.method\)/);
      assert.match(services, /onOpenFolder\(\)/);
      assert.match(actions, /await persistProjectSnapshotNow\?\.\(project\)/);
      assert.match(actions, /openPath\(nextPath, "mocks\/grpc\/methods"/);
      assert.match(main, /layout: "scenario-files-v1"/);
      assert.match(
        main,
        /manifest\.methods\[key\]\.scenarios\[scenarioId\] = \{ file: relativeFile, format: sourceFormat \}/,
      );
    });
    
    test("saved request tabs reuse source identity and adopt legacy gRPC tabs instead of opening duplicates", () => {
      const domain = read("app/playground/features/request-editor/request-session-domain.ts");
      const collection = read("app/playground/features/collection/use-collection-actions.ts");
      const workspace = read("app/playground/features/workspace/workspace-model.ts");
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
    
      assert.match(domain, /export function findReusableCollectionRequestSession/);
      assert.match(domain, /session\.sourceRequestId === request\.id \|\| session\.methodKey === request\.id/);
      assert.match(
        domain,
        /!session\.sourceRequestId[\s\S]*grpcBindingIdentity\(session\.grpc, session\.methodKey\) === requestIdentity/,
      );
      assert.match(domain, /else if \(!matchesIdentity\(item\)\) next\.push\(item\)/);
    
      assert.match(collection, /const existing = findReusableCollectionRequestSession\(requestSessions, request\)/);
      assert.match(collection, /methodKey: request\.id/);
      assert.match(collection, /sourceRequestId: request\.id/);
      assert.match(collection, /upsertRequestSessionPreservingOrder\(session\)/);
    
      assert.match(workspace, /const explicitGrpcIdentities = new Set/);
      assert.match(workspace, /if \(grpcIdentity && explicitGrpcIdentities\.has\(grpcIdentity\)\) continue/);
      assert.match(model, /methodKey: sourceRequestId/);
      assert.match(model, /sourceRequestId,/);
      assert.match(model, /requestKind: "grpc"/);
      assert.doesNotMatch(model, /requestKind: undefined/);
    });
    
    
    test("gRPC mock method selection does not add an artificial animation-frame delay", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const hookStart = services.indexOf("function useImmediateMockMethodSelection(");
      const hookEnd = services.indexOf("\n}", hookStart) + 2;
      const hook = services.slice(hookStart, hookEnd);
    
      assert.match(hook, /setMockSelectedMethodKey\(key\)/);
      assert.match(hook, /selectProtoLibraryVersion\(source\.libraryId, source\.versionId, \{ persistDefault: false \}\)/);
      assert.match(hook, /setMockSelectedMethodKey\(key\);\s*selectProtoLibraryVersion\(source\.libraryId, source\.versionId, \{ persistDefault: false \}\);/);
      assert.doesNotMatch(hook, /requestAnimationFrame\(\(\) => \{[\s\S]*selectProtoLibraryVersion/);
    });
    
    test("focused gRPC mock method exposes the shared Mocking 2.0 execution controls", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const controls = read("app/playground/features/mock-server/workspace/MockExecutionControls.tsx");
      const focusedStart = services.indexOf("function GrpcFocusedMockWorkspace");
      const focusedEnd = services.indexOf("export function GrpcMockWorkspace", focusedStart);
      const focused = services.slice(focusedStart, focusedEnd);
    
      assert.match(focused, /focusedExecution/);
      assert.match(focused, /<MockExecutionControls/);
      assert.match(focused, /patchFocusedExecution/);
      assert.match(focused, /aria-label="Manual Send"/);
      assert.match(focused, /aria-label="Resize gRPC mock settings and scenario editor"/);
      assert.match(focused, /layang:grpc-mock-settings-height/);
      assert.match(focused, /inline/);
      assert.match(focused, /hideLabel/);
      assert.match(controls, /Interval/);
      assert.match(controls, /Loop/);
      assert.match(controls, /Max/);
      assert.match(focused, /variant="grpc-stream"/);
      assert.match(controls, /grpcStream \? null : <MenuItem value="incoming">Incoming<\/MenuItem>/);
      assert.match(controls, /grpcStream \? null : <MenuItem value="scheduled">Scheduled<\/MenuItem>/);
      assert.match(controls, /Hybrid/);
    });
    
  });
}
