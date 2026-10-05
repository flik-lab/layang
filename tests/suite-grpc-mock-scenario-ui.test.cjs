"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-add-scenario-proto-root-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-add-scenario-proto-root-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const source = fs.readFileSync(
      path.join(root, "app/playground/features/mock-server/use-grpc-mock-editor-actions.ts"),
      "utf8",
    );
    const requestActions = fs.readFileSync(
      path.join(root, "app/playground/features/request-editor/use-request-session-actions.ts"),
      "utf8",
    );
    
    test("Add scenario resolves the Proto runtime that owns the mock method", () => {
      assert.match(source, /function resolveMockMethodRuntime\(method: RpcMethodInfo\)/);
      assert.match(source, /currentMockServer\.methodBindings\?\.\[key\]/);
      assert.match(source, /const bound = resolveCompiled\(binding\.libraryId, binding\.versionId, false\)/);
      assert.match(source, /const runtime = resolveMockMethodRuntime\(method\)/);
      assert.match(source, /buildDefaultMockScenario\([\s\S]{0,120}runtime\.method,[\s\S]{0,80}runtime\.loaded\.root/);
      assert.match(source, /selectMethod\([\s\S]{0,80}runtime\.loaded\.root,[\s\S]{0,80}runtime\.method,[\s\S]{0,140}createPinnedGrpcBinding/);
      assert.doesNotMatch(source, /selectMethod\(loaded\.root, method\)/);
      assert.match(
        requestActions,
        /function selectMethod\(root: protobuf\.Root, method: RpcMethodInfo, grpcOverride\?: GrpcRequestBinding\)/,
      );
      assert.match(requestActions, /const grpc =\s*grpcOverride \?\?/);
    });
    
    const shell = fs.readFileSync(
      path.join(root, "app/playground/features/shell/use-workbench-container-model.tsx"),
      "utf8",
    );
    
    test("Mocking resolves the selected Proto revision before the global loaded schema", () => {
      const start = shell.indexOf("const mockSelectedMethod = useMemo(() => {");
      const end = shell.indexOf("\n  useEffect(() => {", start);
      const block = shell.slice(start, end);
      const activeResolveIndex = block.indexOf("protoRuntimeRegistry.resolveVersion(activeProtoLibraryId, activeProtoVersionId)");
      const loadedLookupIndex = block.indexOf("loaded?.methods.find");
    
      assert.ok(activeResolveIndex >= 0, "selected Proto revision should be resolved explicitly");
      assert.ok(loadedLookupIndex >= 0, "global loaded fallback should remain available");
      assert.ok(activeResolveIndex < loadedLookupIndex, "selected Proto revision must win over the global loaded fallback");
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-format-editor-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-format-editor-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("gRPC mock method source editor supports YAML and JSON with format-specific validation", () => {
      const core = read("app/playground/features/mock-server/mock-scenario-core.ts");
      const services = read("app/playground/features/services/services-workspace.tsx");
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
      const yaml = read("app/playground/features/mock-server/mock-scenario-yaml.ts");
    
      assert.match(core, /export function parseMockScenarioText/);
      assert.match(core, /format === "json" \? JSON\.parse/);
      assert.match(core, /Invalid \$\{format\.toUpperCase\(\)\} scenario file/);
      assert.match(core, /const format: MockFormat = rawFormat === "json" \? "json" : "yaml"/);
      assert.match(core, /const nextFormat: MockFormat = patch\.format \?\? existing\.format/);
    
      assert.match(
        services,
        /items=\{\[\s*\{ value: "yaml", label: "YAML" \},\s*\{ value: "json", label: "JSON" \},?\s*\]\}/,
      );
      assert.match(services, /function changeEditorFormat\(nextFormat: MockFormat\)/);
      assert.match(services, /\[canonicalFormat, canonicalSource, row\.scenario\.id\]/);
      assert.doesNotMatch(services, /\[canonicalFormat, canonicalSource, row\.scenario\]/);
      assert.match(services, /parseSingleMockScenarioText\(source, editorFormat, mockServer\.port, row\.method\)/);
      assert.match(services, /formatSingleMockScenarioForEditor\(scenario, nextFormat\)/);
      assert.match(services, /onSaveScenario\(parsed\.scenario, editorFormat\)/);
      assert.match(actions, /const extension = file\.format === "yaml" \? "yaml" : "json"/);
    
      assert.match(yaml, /Array\.isArray\(value\).*value\.length === 0/s);
      assert.match(yaml, /isPlainRecord\(value\).*Object\.keys\(value\)\.length === 0/s);
      assert.match(yaml, /return "\{\}"/);
      assert.match(yaml, /return "\[\]"/);
    });
    
    test("manual Sync file loads disk content into the editor draft without applying app state", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
      const controller = read("app/playground/features/mock-server/use-grpc-mock-controller.ts");
    
      assert.match(services, /async function syncFile\(\)/);
      assert.match(services, /Replace unsaved editor changes with the latest scenario file from disk/);
      assert.match(services, /const refreshed = await onFetchFile\(\)/);
      assert.match(services, /getMockMethodScenarioFile\(refreshed, row\.method\)/);
      assert.match(services, /syncingFile \? "Syncing…" : uiCopy\.actions\.syncFile/);
      assert.doesNotMatch(services, /setBaselineSource\(latestSource\)/);
      assert.doesNotMatch(services, /setBaselineFormat\(latestFile\.format\)/);
      assert.match(actions, /applyToState: false/);
      assert.match(actions, /Save to apply it/);
      assert.match(controller, /options\.applyToState !== false/);
      assert.match(actions, /return refreshed/);
    });
    
    test("Open folder flushes the latest workspace and opens canonical gRPC method files", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
    
      assert.match(services, /onOpenFolder\(\)/);
      assert.match(actions, /async function openMockScenarioFolder\(\)/);
      assert.match(actions, /let nextPath = workspaceFolderPath/);
      assert.match(actions, /if \(!nextPath\) \{/);
      assert.match(actions, /await persistProjectSnapshotNow\?\.\(project\)/);
      assert.match(actions, /const diskMockServer = mockServerRef\?\.current \?\? mockServer/);
      assert.match(actions, /openPath\(nextPath, "mocks\/grpc\/methods"/);
    });
    
    test("legacy workspace persistence preserves each method source format", () => {
      const main = read("electron/main.cjs");
    
      assert.match(main, /format: mockServerProject\.format === "json" \? "json" : "yaml"/);
      assert.match(main, /const extension = sourceFormat === "json" \? "json" : "yaml"/);
      assert.match(main, /manifest\.methods\[key\] = \{ format: sourceFormat, scenarios: \{\} \}/);
      assert.match(main, /if \(sourceFormat === "json"\) await writeJson/);
      assert.match(main, /else await writeTextInside\(scenariosDir, relativeFile, stringifyWorkspaceYaml\(scenario\)\)/);
      assert.match(main, /methodScenarioGroups\[key\] = \{ format: methodFormat, scenarios: \[\] \}/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-scenario-dropdown-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-scenario-dropdown-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("gRPC Mock renders the worker-backed flat catalog instead of nested Proto scenario groups", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const catalog = read("app/playground/features/mock-server/workspace/MockCatalogList.tsx");
    
      assert.match(services, /<MockCatalogPanel/);
      assert.match(catalog, /useFixedVirtualWindow\(/);
      assert.doesNotMatch(catalog, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
      assert.doesNotMatch(services, /const allScenarioProtoGroups = useMemo/);
      assert.doesNotMatch(services, /scenarioProtoGroups\.map/);
    });
    
    test("choosing an active scenario delegates to the existing scenario selection controller", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const row = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");
    
      assert.match(services, /onScenarioChange=\{handleMockScenarioSelectChange\}/);
      assert.match(row, /onChange=\{\(scenarioId\) => onScenarioChange\(method, scenarioId\)\}/);
    });
    
    test("each virtualized method row has an independent active switch", () => {
      const row = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");
    
      assert.match(row, /checked=\{row\.enabled\}/);
      assert.match(row, /`Enable mock for \$\{row\.methodName\}`/);
      assert.match(row, /onEnabledChange\(method, event\.target\.checked\)/);
    });
    
    test("scenario options are concise, lazy, and isolated from row selection", () => {
      const picker = read("app/playground/features/mock-server/workspace/MockScenarioPicker.tsx");
      const row = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");
    
      assert.match(picker, /onOpen=\{\(\) => void load\(\)\}/);
      assert.match(picker, /mockCatalogStore\.getScenarios\(methodId\)/);
      assert.match(row, /onPointerDown=\{\(event: \{ stopPropagation\(\): void \}\) => event\.stopPropagation\(\)\}/);
      assert.match(row, /onClick=\{\(event: \{ stopPropagation\(\): void \}\) => event\.stopPropagation\(\)\}/);
    });
    
    test("scenario settings still use the shared scenario-manager controller", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const row = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");
      const shared = read("app/playground/features/mock-server/grpc-mock-scenario-controls.tsx");
    
      assert.match(services, /onManageScenario=\{openMockScenarioManager\}/);
      assert.match(row, /onManageScenario\(method, row\.activeScenarioId\)/);
      assert.match(shared, /Edit source/);
      assert.match(shared, /Manage scenarios/);
      assert.match(shared, /Add scenario/);
      assert.match(shared, /Duplicate active/);
      assert.match(shared, /Delete active/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-start-consistency-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-start-consistency-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("gRPC mock starts only from the workspace and verifies runtime readiness", () => {
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
      const requestPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
    
      assert.doesNotMatch(requestPanel, /function startActiveRequestMock\(/);
      assert.doesNotMatch(requestPanel, /prepareActiveRequestMockProject/);
      assert.doesNotMatch(requestPanel, /setNativeTarget\(localTarget\)/);
      assert.doesNotMatch(requestPanel, /setTargetDraft\(localTarget\)/);
      assert.match(requestPanel, /Global Mocking/);
      assert.match(requestPanel, /Mock scenarios now live in one workspace/);
      assert.match(requestPanel, /Open Global Mocking/);
      assert.match(requestPanel, /Open this gRPC method/);
      assert.doesNotMatch(requestPanel, /function startActiveRequestMock\(/);
      assert.doesNotMatch(requestPanel, /requestMockEditorDraft/);
      assert.match(actions, /async function startMockRuntime\(projectOverride\?: MockServerProject\)/);
      assert.match(actions, /const effectiveMockServer: MockServerProject = projectOverride \?\?/);
      assert.match(actions, /uiRuntimeRevision/);
      assert.match(actions, /await window\.electronMock\.status\(\)/);
      assert.match(actions, /const persistence = persistProjectSnapshotNow\?\.\(projectSnapshot\)/);
      assert.ok(
        actions.indexOf("await window.electronMock.start") <
          actions.indexOf("const persistence = persistProjectSnapshotNow?.(projectSnapshot)"),
        "the runtime should start before background workspace persistence",
      );
      assert.match(actions, /gRPC Mock did not become ready with the latest scenario configuration/);
      assert.match(actions, /message: "Starting gRPC Mock\.\.\."/);
      assert.ok(
        actions.indexOf('message: "Starting gRPC Mock..."') < actions.indexOf("const schema = resolveRuntimeSchema(effectiveMockServer)"),
        "the renderer should expose pending state before synchronous schema/scenario work",
      );
      assert.match(actions, /await yieldForRuntimeUiPaint\(\)/);
    });
    
    test("running gRPC mock receives live editor revisions and Web Access waits for that snapshot", () => {
      const container = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
      const runtimeSync = read("app/playground/features/mock-server/use-mock-runtime-sync.ts");
    
      assert.match(container, /useMockRuntimeSync\(\{/);
      assert.match(container, /const MOCK_RUNTIME_SYNC_DELAY_MS = 280/);
      assert.match(runtimeSync, /syncInFlightRef/);
      assert.match(runtimeSync, /syncPendingRef/);
      const runtimePolling = read("app/playground/features/mock-server/runtime/useMockRuntimePolling.ts");
      assert.match(runtimePolling, /mockRuntimeStore\.patchGrpc/);
      assert.match(runtimePolling, /electronMock\.status\(\)/);
      const signatureBlock = runtimeSync.slice(
        runtimeSync.indexOf("const syncSignature"),
        runtimeSync.indexOf("if (syncSignature ===", runtimeSync.indexOf("const syncSignature")),
      );
      assert.doesNotMatch(signatureBlock, /mockServerUpdatedAt|methodBindings|protoSources/);
      assert.match(actions, /syncRunningMockServerFromEditor\(\{/);
      assert.match(actions, /const runtime = await ensureMockRuntimeSnapshot\(effectiveMockServer\)/);
      assert.match(actions, /await window\.electronGateway\.status\(\{ profileId: profile\.id \}\)/);
      assert.match(actions, /Web Access did not become ready/);
      assert.match(actions, /message: "Starting Web Access\.\.\."/);
      const webStart = actions.slice(actions.indexOf("async function startWebAccess"), actions.indexOf("/** Stops only the browser bridge."));
      assert.doesNotMatch(webStart, /await persistProjectSnapshotNow\?\.\(projectSnapshot\)/);
      assert.match(webStart, /const persistence = persistProjectSnapshotNow\?\.\(projectSnapshot\)/);
      assert.ok(
        webStart.indexOf("await window.electronGateway.start") < webStart.indexOf("const persistence = persistProjectSnapshotNow?.(projectSnapshot)"),
        "Web Access readiness should not be serialized behind workspace disk persistence",
      );
    });
    
    test("workspace scenario editor owns scenario content and folder opening flushes first", () => {
      const core = read("app/playground/features/mock-server/mock-scenario-core.ts");
      const services = read("app/playground/features/services/services-workspace.tsx");
      const requestPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
    
      assert.match(core, /export function saveMockScenarioForMethod/);
      assert.match(core, /!methodScenarioIds\.has\(selectedScenarioIds\[key\]\)/);
      assert.match(core, /selectedScenarioIds\[key\] = uniqueId/);
      assert.match(actions, /saveMockScenarioForMethod\(/);
      assert.match(services, /onAddScenario=\{addMockScenarioForMethod\}/);
      assert.match(services, /onManageScenario=\{openMockScenarioManager\}/);
      assert.match(requestPanel, /Global Mocking/);
      assert.match(requestPanel, /Open Global Mocking/);
      assert.match(requestPanel, /Open this gRPC method/);
      assert.doesNotMatch(requestPanel, /startActiveRequestMock/);
      assert.match(actions, /await persistProjectSnapshotNow\?\.\(project\)/);
      assert.match(actions, /openPath\(nextPath, "mocks\/grpc\/methods"/);
    });
    
    
    test("running gRPC mock is flushed before a request so a newly added scenario works immediately", () => {
      const container = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const start = container.indexOf("const flushRunningMockServersBeforeRequest");
      const end = container.indexOf("useEffect(() =>", start);
      const block = container.slice(start, end);
      assert.match(block, /syncRunningMockServerFromEditor\(\{/);
      assert.match(block, /mockRuntimeStore\.getGrpc\(\)/);
      assert.match(block, /mockServerRef\.current/);
    });
    
    
    test("failed gRPC live reload does not mark the new scenario snapshot as already synchronized", () => {
      const runtimeSync = read("app/playground/features/mock-server/use-mock-runtime-sync.ts");
      const updateCall = runtimeSync.indexOf("const result = await mockUpdate({");
      const failureGuard = runtimeSync.indexOf("if (!result.ok)", updateCall);
      const signatureCommit = runtimeSync.indexOf("lastSyncSignatureRef.current = syncSignature", updateCall);
      assert.ok(updateCall >= 0 && failureGuard > updateCall && signatureCommit > failureGuard);
    });
    
  });
}
