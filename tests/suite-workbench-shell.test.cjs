"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "control-data-plane-final-cleanup-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("control-data-plane-final-cleanup-regression.test.cjs", () => {
    const fs = require("node:fs");
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const read = (path) => fs.readFileSync(path, "utf8");
    
    test("request-session documentation describes control-plane ownership only", () => {
      const doc = read("docs/architecture/request-session-tabs.md");
      assert.match(doc, /control plane/i);
      assert.match(doc, /responseSessionId/);
      assert.match(doc, /ResponseSessionRegistry/);
      assert.doesNotMatch(doc, /events:\s*RuntimeEvent\[\]/);
      assert.doesNotMatch(doc, /lastResult:\s*RequestResult/);
    });
    
    test("response runtime architecture documents bounded history, selectors, persistence and lifecycle telemetry", () => {
      const doc = read("docs/architecture/response-runtime.md");
      assert.match(doc, /ResponseSessionRegistry/);
      assert.match(doc, /50/);
      assert.match(doc, /selector/i);
      assert.match(doc, /document/i);
      assert.match(doc, /persistence/i);
      assert.match(doc, /transport lifecycle/i);
    });
    
    test("mock runtime documentation keeps hot status outside Workbench React state", () => {
      const doc = read("docs/architecture/mock-server-runtime.md");
      assert.match(doc, /mockRuntimeStore/);
      assert.match(doc, /publish only when/i);
      assert.match(doc, /WorkbenchContainer/);
    });
    
    test("shell and docs no longer read legacy response payloads from RequestSession", () => {
      const shell = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const docs = read("app/playground/features/docs/use-docs-actions.ts");
      const publisher = read("app/playground/features/docs-publisher/docs-renderer.ts");
      assert.doesNotMatch(shell, /session\?\.lastResult/);
      assert.doesNotMatch(docs, /session\?\.lastResult/);
      assert.doesNotMatch(publisher, /session\.lastResult/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "final-hardening-phase-10-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("final-hardening-phase-10-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
    
    test("phase 1 responsive sidebar collapse does not overwrite the user's wide-window preference", () => {
      const source = read("app/playground/features/shell/use-workbench-container-model.tsx");
      assert.match(source, /sidebarOpenBeforeNarrowRef/);
      assert.match(source, /persistedSidebarOpen/);
      assert.match(source, /sidebarOpen: persistedSidebarOpen/);
      assert.match(source, /if \(shouldRestore && !sidebarOpen\) setSidebarOpen\(true\)/);
    });
    
    test("phase 6 hybrid defaults to deferred triggers rather than an immediate REST response", () => {
      const engine = read("lib/mock-execution-engine.cjs");
      const ui = read("app/playground/features/mock-server/mock-execution-model.ts");
      assert.match(engine, /incoming: mode === "incoming"/);
      assert.match(engine, /manual: mode === "standby" \|\| mode === "hybrid"/);
      assert.match(engine, /periodic: \{ enabled: mode === "periodic" \|\| mode === "hybrid" \}/);
      assert.match(ui, /mode: "hybrid",\s*incoming: false,\s*manual: true/s);
    });
    
    test("phase 8 window layout persistence is crash-resistant and fully clamps restored windows", () => {
      const source = read("electron/window/window-manager.cjs");
      assert.match(source, /temporaryPath = `\$\{statePath\}\.\$\{process\.pid\}\.tmp`/);
      assert.match(source, /fs\.renameSync\(temporaryPath, statePath\)/);
      assert.match(source, /intersectionArea\(candidate, display\.workArea\)/);
      assert.match(source, /clampNumber\(candidate\.x/);
      assert.match(source, /clampNumber\(candidate\.y/);
    });
    
    test("phase 9 detached handoff saves before broadcasting and aborts when save fails", () => {
      const source = read("app/playground/features/windows/detached-window-surfaces.tsx");
      const saveIndex = source.indexOf("window.electronWorkspace.saveFolder(bundle");
      const failureIndex = source.indexOf("if (!result?.ok) return false");
      const broadcastIndex = source.indexOf('broadcast?.("workspace:handoff"');
      assert.ok(saveIndex >= 0 && failureIndex > saveIndex && broadcastIndex > failureIndex);
    });
    
    test("phase 9 response mirror coalesces publishers and rejects stale out-of-order snapshots", () => {
      const source = read("app/playground/features/windows/use-response-window-sync.ts");
      assert.match(source, /publishInFlightRef/);
      assert.match(source, /publishAgainRef/);
      assert.match(source, /sourceWindowId: number/);
      assert.match(source, /sequence: number/);
      assert.match(source, /latestAppliedSequenceRef/);
      assert.match(source, /if \(sequence > 0 && sequence <= previous\) return/);
      assert.match(source, /if \(!isCurrent\(\)\) return/);
      assert.match(source, /activeDocumentIds/);
    });
    
    test("phase 10 serializes workspace writes across renderer windows", () => {
      const source = read("electron/main.cjs");
      assert.match(source, /const workspaceWriteQueues = new Map\(\)/);
      assert.match(source, /workspaceWriteQueues\.get\(resolvedDirectory\) \|\| Promise\.resolve\(\)/);
      assert.match(source, /\.then\(\(\) => writeWorkspaceFolderNow\(resolvedDirectory, bundle\)\)/);
      assert.match(source, /workspaceWriteQueues\.delete\(resolvedDirectory\)/);
    });
    
    test("phase 10 caps pending REST standby requests to protect memory", () => {
      const source = read("electron/services/rest-mock-server.cjs");
      const types = read("app/playground/shared/workbench-types.ts");
      assert.match(source, /const MAX_PENDING_REQUESTS = 1000/);
      assert.match(source, /runtime\.pending\.size >= MAX_PENDING_REQUESTS/);
      assert.match(source, /Mock pending request capacity reached/);
      assert.match(source, /maxPendingRequests: MAX_PENDING_REQUESTS/);
      assert.match(types, /maxPendingRequests\?: number/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "no-request-response-about-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("no-request-response-about-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("response panel is hidden while no request session is open", () => {
      const main = read("app/playground/features/shell/workbench-main-panel.tsx");
      assert.match(main, /const showResponsePanel = Boolean\(activeRequestId && activeSession && !showEmptyWorkbench\)/);
      assert.match(main, /\{showResponsePanel \? \(/);
      assert.match(main, /<Profiler id="Response"/);
    });
    
    test("status bar exposes only the package-driven version at the far right", () => {
      const status = read("app/playground/features/shell/workbench-status-bar.tsx");
      assert.match(status, /import appPackage from "@\/package\.json"/);
      assert.match(status, /v\{appPackage\.version\}/);
      assert.doesNotMatch(status, />\s*About\s*</);
      assert.doesNotMatch(status, /<DialogTitle>About Layang<\/DialogTitle>/);
      assert.doesNotMatch(status, />\s*Local\s*</);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "sidebar-navigation-hot-path-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("sidebar-navigation-hot-path-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("sidebar section navigation is isolated from the giant workbench model", () => {
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const navigationStore = read("app/playground/features/shell/workbench-navigation-store.ts");
    
      assert.doesNotMatch(model, /useState<SideSection>\("collections"\)/);
      assert.match(model, /setWorkbenchSideSection/);
      assert.match(navigationStore, /useSyncExternalStore/);
      assert.match(navigationStore, /export function useWorkbenchSideSection/);
      assert.match(navigationStore, /export function setWorkbenchSideSection/);
    });
    
    test("activity rail switches directly without transition loading state", () => {
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
    
      assert.doesNotMatch(sidebar, /useTransition/);
      assert.doesNotMatch(sidebar, /navigationPending/);
      assert.doesNotMatch(sidebar, /pendingSection/);
      assert.doesNotMatch(sidebar, /Loading \{pendingSection/);
      assert.match(sidebar, /useWorkbenchSideSection\(\)/);
      assert.match(sidebar, /setWorkbenchSideSection\(section\)/);
    });
    
    test("main workspace mounts only the active heavy section", () => {
      const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
    
      assert.match(mainPanel, /useWorkbenchSideSection\(\)/);
      assert.doesNotMatch(mainPanel, /mountedSections/);
      assert.doesNotMatch(mainPanel, /keepSectionMounted/);
      assert.match(mainPanel, /sideSection === "services"/);
      assert.match(mainPanel, /<MemoServicesWorkspace/);
      assert.match(mainPanel, /sideSection === "proto-schemas"/);
      assert.match(mainPanel, /<MemoProtoSchemaWorkspace/);
      assert.match(mainPanel, /sideSection === "settings"/);
      assert.match(mainPanel, /<MemoSettingsWorkspace/);
    });
    
    test("request workspace unmounts while a heavy non-request workspace is active", () => {
      const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
    
      assert.doesNotMatch(mainPanel, /data-slot="request-workspace-surface"/);
      assert.doesNotMatch(mainPanel, /visibility:\s*sideSection === "collections" \? "visible" : "hidden"/);
      assert.match(mainPanel, /if \(sideSection === "collections"\)/);
    });
    
    test("hidden request response viewer does not mount response-store subscriptions", () => {
      const responsePanel = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
      assert.match(responsePanel, /export function WorkbenchResponsePanel/);
      assert.match(responsePanel, /const sideSection = useWorkbenchSideSection\(\)/);
      assert.match(responsePanel, /if \(sideSection !== "collections"\) return null/);
      const gateIndex = responsePanel.indexOf('if (sideSection !== "collections") return null');
      const activeIndex = responsePanel.indexOf('function ActiveWorkbenchResponsePanel');
      const selectorIndex = responsePanel.indexOf('useResponseSelector', activeIndex);
      assert.ok(gateIndex >= 0 && activeIndex > gateIndex && selectorIndex > activeIndex);
    });
    
    test("CLI dock follows source-control navigation without re-rendering the workbench container", () => {
      const container = read("app/playground/workbench-container.tsx");
    
      assert.match(container, /function NavigationAwareCliTerminalPanel/);
      assert.match(container, /const sideSection = useWorkbenchSideSection\(\)/);
      assert.match(container, /sideSection === "source-control" \? railWidth : shellLeft/);
      assert.doesNotMatch(container, /export default function WorkbenchContainer\(\)[\s\S]*const sideSection = useWorkbenchSideSection\(\)/);
    });
    
    test("sidebar mounts only the active tree while worker stores keep heavy data alive", () => {
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
    
      assert.doesNotMatch(sidebar, /mountedSidebarSections/);
      assert.doesNotMatch(sidebar, /keepSidebarSectionMounted/);
      assert.doesNotMatch(sidebar, /display:\s*sideSection === "collections" \? "flex" : "none"/);
      assert.match(sidebar, /sideSection === "services" &&/);
      assert.match(sidebar, /<MockingSidebar/);
    });
    
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "workbench-data-plane-architecture-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("workbench-data-plane-architecture-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    // Phase 1 guard. Response legacy paths are intentionally migrated in the next phase.
    test("Mocking data-plane no longer relies on hidden heavy DOM or render-time scenario parsing", () => {
      const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
      const services = read("app/playground/features/services/services-workspace.tsx");
    
      assert.doesNotMatch(mainPanel, /mountedSections/);
      assert.doesNotMatch(mainPanel, /keepSectionMounted/);
      assert.doesNotMatch(sidebar, /mountedSidebarSections/);
      assert.doesNotMatch(sidebar, /keepSidebarSectionMounted/);
      assert.match(services, /MockCatalogPanel/);
      assert.doesNotMatch(services, /const allScenarioRows = useMemo/);
      assert.doesNotMatch(services, /const allScenarioProtoGroups = useMemo/);
    });
    
    test("Mocking shell imports the worker-backed catalog modules", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
      assert.match(services, /mock-server\/workspace\/MockCatalogList/);
      assert.match(sidebar, /mock-server\/sidebar\/MockingSidebar/);
      assert.ok(fs.existsSync(path.join(root, "app/playground/features/mock-server/catalog/mockCatalogWorkerSource.ts")));
      assert.ok(fs.existsSync(path.join(root, "app/playground/features/mock-server/catalog/mockCatalog.store.ts")));
    });
    
    test("Response phase removes pinned snapshots, Latest polling, and main-thread gRPC-Web fallback", () => {
      const panel = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
      const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
      const grpcWeb = read("lib/grpc-web-client.ts");
      assert.doesNotMatch(panel, /pinnedEvents/);
      assert.doesNotMatch(latest, /setInterval/);
      assert.doesNotMatch(grpcWeb, /GrpcWebFrameParser|processBytesFallback/);
      assert.ok(fs.existsSync(path.join(root, "app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts")));
    });
    
    test("Mock catalog source snapshot reads split method files directly without legacy parse fallback", () => {
      const runtime = read("app/playground/features/mock-server/catalog/mockCatalogRuntime.ts");
      assert.doesNotMatch(runtime, /getMockMethodScenarioFile/);
      assert.doesNotMatch(runtime, /parseMockScenarioText/);
      assert.match(runtime, /mockServer\.methodFiles\?\.\[key\]/);
    });
    
    test("Mock catalog source sync is separate from lightweight runtime updates", () => {
      const hook = read("app/playground/features/mock-server/catalog/useMockCatalog.ts");
      const store = read("app/playground/features/mock-server/catalog/mockCatalog.store.ts");
      assert.match(store, /syncSource\(inputs:/);
      assert.match(store, /updateRuntime\(input:/);
      assert.match(hook, /mockCatalogStore\.syncSource/);
      assert.match(hook, /mockCatalogStore\.updateRuntime/);
      assert.match(hook, /mockServer\.protoSources/);
      assert.match(hook, /mockServer\.methodFiles/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "workbench-refactor-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("workbench-refactor-regression.test.cjs", () => {
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
    
    test("request mock delegates to Global Mocking without changing the request target", () => {
      const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
      const settings = read("app/playground/features/mock-server/mock-server-panels.tsx");
      const services = read("app/playground/features/services/services-workspace.tsx");
    
      assert.match(mainPanel, /Global Mocking/);
      assert.match(mainPanel, /Open Global Mocking/);
      assert.match(mainPanel, /Create Mock From This Request/);
      assert.match(mainPanel, /Open this gRPC method/);
      assert.doesNotMatch(mainPanel, /requestMockEditorDraft/);
      assert.doesNotMatch(mainPanel, /startActiveRequestMock/);
      assert.doesNotMatch(mainPanel, /setTargetDraft\(localTarget\)/);
      assert.doesNotMatch(mainPanel, /setNativeTarget\(localTarget\)/);
      assert.match(settings, /GrpcMockScenarioControls/);
      assert.match(services, /<MockExecutionControls/);
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
      assert.match(docsPanel, /language="markdown"/);
      assert.match(docsPanel, /uiCopy\.actions\.saveDraft/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "workbench-render-boundary-telemetry-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("workbench-render-boundary-telemetry-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const read = (path) => fs.readFileSync(path, "utf8");
    
    test("performance telemetry counts container and collections render invocations separately", () => {
      const stats = read("app/playground/shared/performance/performance-stats.store.ts");
      const container = read("app/playground/workbench-container.tsx");
      const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
      assert.match(stats, /recordRenderInvocation/);
      assert.match(stats, /containerRendersPerSec/);
      assert.match(stats, /collectionsRendersPerSec/);
      assert.match(container, /recordRenderInvocation\("container"\)/);
      assert.match(mainPanel, /recordRenderInvocation\("collections"\)/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "workbench-shell-model-boundary-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("workbench-shell-model-boundary-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const read = (path) => fs.readFileSync(path, "utf8");
    
    test("shell boundaries use named typed models instead of Record<string, any>", () => {
      const files = [
        "app/playground/features/shell/workbench-app-bar.tsx",
        "app/playground/features/shell/workbench-sidebar.tsx",
        "app/playground/features/shell/workbench-dialogs.tsx",
        "app/playground/features/shell/workbench-main-panel.tsx",
        "app/playground/features/shell/workbench-status-bar.tsx",
      ];
      for (const file of files) assert.doesNotMatch(read(file), /Record<string,\s*any>/, file);
      const types = read("app/playground/features/shell/workbenchShell.types.ts");
      assert.match(types, /WorkbenchAppBarModel/);
      assert.match(types, /WorkbenchSidebarModel/);
      assert.match(types, /WorkbenchMainPanelModel/);
      assert.match(types, /WorkbenchDialogsModel/);
      assert.match(types, /WorkbenchStatusBarModel/);
    });
    
    test("container no longer creates one cliContext spread for every shell child", () => {
      const container = read("app/playground/workbench-container.tsx");
      assert.doesNotMatch(container, /const cliContext = \{ \.\.\.viewContext/);
      assert.match(container, /<WorkbenchAppBar ctx=\{viewContext\}/);
      assert.match(container, /cliPanelOpen=\{cliPanelOpen\}/);
    });
    
  });
}
