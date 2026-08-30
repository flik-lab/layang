"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Add WS and Run WS action scopes receive request-session domain actions", () => {
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  const actionScopeBlock = model.slice(
    model.indexOf("const actionScope ="),
    model.indexOf("const collectionActions = useCollectionActions"),
  );
  assert.match(actionScopeBlock, /activateRequestSession,/, "collection actions must receive activateRequestSession");
  assert.match(
    actionScopeBlock,
    /upsertRequestSessionPreservingOrder,/,
    "collection actions must receive upsertRequestSessionPreservingOrder",
  );

  const requestRunnerScopeBlock = model.slice(
    model.indexOf("const actionScopeWithCollection ="),
    model.indexOf("const requestRunnerActions = useRequestRunnerActions"),
  );
  assert.match(requestRunnerScopeBlock, /\.\.\.actionScope/, "request runner must inherit the base action scope");
  assert.match(requestRunnerScopeBlock, /\.\.\.collectionActions/, "request runner must inherit collection actions");
});

test("mock scenario files use explicit manual refresh instead of overwriting a local draft", () => {
  const controller = read("app/playground/features/mock-server/use-grpc-mock-controller.ts");
  const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
  const services = read("app/playground/features/services/services-workspace.tsx");
  assert.match(controller, /respectLocalDirty\?: boolean/);
  assert.match(actions, /fetchMockScenarioFilesFromWorkspace/);
  assert.match(actions, /respectLocalDirty: false/);
  assert.match(services, /uiCopy\.actions\.syncFile/);
  assert.match(actions, /applyToState: false/);
});

test("deleted collection request and proto sources are handled through request-session domain cleanup", () => {
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  assert.match(model, /cleanupRequestSessionsForDeletedSources/);
  assert.match(model, /buildRequestSessionSourceIndex\(collections, loaded\?\.methods \?\? \[\]\)/);
  assert.match(model, /Source deleted/);
});

test("Windows workspace save does not replace the whole mocks/scenarios folder", () => {
  const main = read("electron/main.cjs");
  assert.match(main, /writeScenarioFilesIncrementally/);
  assert.doesNotMatch(main, /replaceDirectoryAtomically\(scenariosDir/);
  assert.match(main, /manifest\.json/);
});

test("sidebar tooltips honor horizontal placements", () => {
  const compat = read("components/shadcn/compat.tsx");
  assert.match(compat, /side === "right"/);
  assert.match(compat, /side === "left"/);
  assert.match(compat, /window\.innerWidth - width - margin/);
  assert.match(compat, /window\.innerHeight - height - margin/);
  assert.match(compat, /anchorRect\.right \+ gap \+ width > window\.innerWidth - margin/);
  assert.match(compat, /visibility: tooltipPosition \? "visible" : "hidden"/);
  assert.doesNotMatch(compat, /max-w-72 -translate-x-1\/2/);
});

test("search results use a visible yellow mark instead of bold-only matches", () => {
  const highlight = read("app/playground/shared/components/search-highlight.tsx");
  const styles = read("app/globals.css");
  const responseViewer = read("app/playground/features/response-viewer/response-viewer.tsx");

  assert.match(highlight, /<mark className="search-highlight"/);
  assert.match(styles, /\.search-highlight\s*\{[^}]*background:\s*#facc15/s);
  assert.match(responseViewer, /SearchHighlightedText/);
  assert.doesNotMatch(responseViewer, /renderBoldMatches|HighlightedCodeText|HighlightedInlineText/);
});

test("request mock reuses Mock Settings controls without changing the request target", () => {
  const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
  const controls = read("app/playground/features/mock-server/grpc-mock-scenario-controls.tsx");
  const settings = read("app/playground/features/mock-server/mock-server-panels.tsx");

  assert.match(mainPanel, /selectActiveRequestScenario/);
  assert.match(mainPanel, /setActiveRequestMockEnabled/);
  assert.match(mainPanel, /openActiveRequestScenarioEditor/);
  assert.match(mainPanel, /<GrpcMockScenarioActionsMenu/);
  assert.match(mainPanel, /<GrpcMockScenarioManagerDialog/);
  assert.match(mainPanel, /<GrpcScenarioSourceDialog/);
  assert.match(mainPanel, /<GrpcMockScenarioControls/);
  assert.match(settings, /<GrpcMockScenarioControls/);
  assert.match(controls, /MethodMockSwitch/);
  assert.match(controls, /Scenario settings/);
  assert.match(controls, /Manage scenarios/);
  assert.match(controls, /Add scenario/);
  assert.doesNotMatch(mainPanel, /requestMockEditorDraft/);
  assert.doesNotMatch(mainPanel, /startActiveRequestMock/);
  assert.doesNotMatch(mainPanel, /setTargetDraft\(localTarget\)/);
  assert.doesNotMatch(mainPanel, /setNativeTarget\(localTarget\)/);
  assert.match(mainPanel, /Configure in workspace/);
});

test("response-to-docs action explains the outcome and opens request docs", () => {
  const toolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
  const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
  const docsPanel = read("app/playground/features/documentation/documentation-panels.tsx");

  assert.match(toolbar, /Save latest response for Docs/);
  assert.match(toolbar, /canSaveDocs/);
  assert.match(toolbar, /Open response full screen/);
  assert.doesNotMatch(toolbar, />Stack</);
  assert.doesNotMatch(toolbar, />Side</);
  assert.match(mainPanel, /setRequestTab\("docs"\)/);
  assert.match(mainPanel, /defaultTab="content"/);
  assert.match(docsPanel, />\s*Markdown\s*<\/Typography>/);
  assert.match(docsPanel, /Automatic content to insert/);
  assert.match(docsPanel, /documentation-markdown-editor/);
  assert.match(docsPanel, /uiCopy\.actions\.saveDraft/);
});
