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
    const requestActions = fs.readFileSync(
      path.join(root, "app/playground/features/request-editor/use-request-session-actions.ts"),
      "utf8",
    );

    test("Request method selection respects explicit Proto version bindings", () => {
      assert.match(
        requestActions,
        /function selectMethod\(root: protobuf\.Root, method: RpcMethodInfo, grpcOverride\?: GrpcRequestBinding\)/,
      );
      assert.match(requestActions, /const grpc =\s*grpcOverride \?\?/);
    });

    const shell = fs.readFileSync(
      path.join(root, "app/playground/features/mock-server/use-mock-method-selection.ts"),
      "utf8",
    );

    test("Mocking resolves the selected Proto revision before the global loaded schema", () => {
      const start = shell.indexOf("const mockSelectedMethod = useMemo(() => {");
      const end = shell.indexOf("\n  useEffect(() => {", start);
      const block = shell.slice(start, end);
      const activeResolveIndex = block.indexOf("protoRuntimeRegistry.resolveVersion(activeProtoLibraryId, activeProtoVersionId)");
      const loadedLookupIndex = block.indexOf("findLoadedProtoMethod(loaded, explicitKey)");

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
        actions.indexOf('message: "Starting gRPC Mock..."') < actions.indexOf("const schema = await resolveRuntimeSchema(effectiveMockServer)"),
        "the renderer should expose pending state before worker schema preparation",
      );
      assert.match(actions, /await yieldForRuntimeUiPaint\(\)/);
    });

    test("canonical v3 never auto-applies a legacy editor draft when starting Web Access", () => {
      const container = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
      const store = read("app/playground/features/mock-server/workspace/FileBasedGrpcScenarios.tsx");
      assert.doesNotMatch(container, /useMockRuntimeSync\(\{/);
      assert.doesNotMatch(actions, /syncRunningMockServerFromEditor/);
      assert.match(actions, /const runtime = await ensureMockRuntimeSnapshot\(effectiveMockServer\)/);
      assert.match(actions, /await window\.electronGateway\.status\(\{ profileId: profile\.id \}\)/);
      assert.match(actions, /Web Access did not become ready/);
      assert.match(actions, /message: "Starting Web Access\.\.\."/);
      assert.match(store, /store\.applyNative\(/);
      assert.match(store, /store\.applySendGateway\(/);
      const webStart = actions.slice(actions.indexOf("async function startWebAccess"), actions.indexOf("/** Stops only the browser bridge."));
      assert.doesNotMatch(webStart, /await persistProjectSnapshotNow\?\.\(projectSnapshot\)/);
      assert.match(webStart, /const persistence = persistProjectSnapshotNow\?\.\(projectSnapshot\)/);
      assert.ok(webStart.indexOf("await window.electronGateway.start") < webStart.indexOf("const persistence = persistProjectSnapshotNow?.(projectSnapshot)"));
    });

    test("REST/WS pre-request flush never rehydrates or applies legacy gRPC bodies", () => {
      const container = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const start = container.indexOf("const flushRunningMockServersBeforeRequest");
      const end = container.indexOf("useEffect(() =>", start);
      const block = container.slice(start, end);
      assert.match(block, /electronRestMock\.update/);
      assert.match(block, /electronWsMock\.update/);
      assert.doesNotMatch(block, /electronMock\.update|syncRunningMockServerFromEditor/);
    });

    test("runtime snapshot retrieval does not compare legacy renderer hashes", () => {
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
      const start = actions.indexOf("async function ensureMockRuntimeSnapshot");
      const end = actions.indexOf("/** Stops only the native gRPC mock runtime. */", start);
      const block = actions.slice(start, end);
      assert.match(block, /window\.electronMock\?\.status/);
      assert.doesNotMatch(block, /methodFiles|computeMockScenarioContentHash|syncRunningMockServerFromEditor/);
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
        actions.indexOf('message: "Starting gRPC Mock..."') < actions.indexOf("const schema = await resolveRuntimeSchema(effectiveMockServer)"),
        "the renderer should expose pending state before worker schema preparation",
      );
      assert.match(actions, /await yieldForRuntimeUiPaint\(\)/);
    });

    test("canonical v3 never auto-applies a legacy editor draft when starting Web Access", () => {
      const container = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
      const store = read("app/playground/features/mock-server/workspace/FileBasedGrpcScenarios.tsx");
      assert.doesNotMatch(container, /useMockRuntimeSync\(\{/);
      assert.doesNotMatch(actions, /syncRunningMockServerFromEditor/);
      assert.match(actions, /const runtime = await ensureMockRuntimeSnapshot\(effectiveMockServer\)/);
      assert.match(actions, /await window\.electronGateway\.status\(\{ profileId: profile\.id \}\)/);
      assert.match(actions, /Web Access did not become ready/);
      assert.match(actions, /message: "Starting Web Access\.\.\."/);
      assert.match(store, /store\.applyNative\(/);
      assert.match(store, /store\.applySendGateway\(/);
      const webStart = actions.slice(actions.indexOf("async function startWebAccess"), actions.indexOf("/** Stops only the browser bridge."));
      assert.doesNotMatch(webStart, /await persistProjectSnapshotNow\?\.\(projectSnapshot\)/);
      assert.match(webStart, /const persistence = persistProjectSnapshotNow\?\.\(projectSnapshot\)/);
      assert.ok(webStart.indexOf("await window.electronGateway.start") < webStart.indexOf("const persistence = persistProjectSnapshotNow?.(projectSnapshot)"));
    });

    test("REST/WS pre-request flush never rehydrates or applies legacy gRPC bodies", () => {
      const container = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const start = container.indexOf("const flushRunningMockServersBeforeRequest");
      const end = container.indexOf("useEffect(() =>", start);
      const block = container.slice(start, end);
      assert.match(block, /electronRestMock\.update/);
      assert.match(block, /electronWsMock\.update/);
      assert.doesNotMatch(block, /electronMock\.update|syncRunningMockServerFromEditor/);
    });

    test("canonical editor requires explicit Apply receipts before Manual Send", () => {
      const editor = read("app/playground/features/mock-server/workspace/FileBasedGrpcScenarios.tsx");
      assert.match(editor, /store\.applyNative\(/);
      assert.match(editor, /store\?\.sendNative\(/);
      assert.match(editor, /applied\.scenarioKey/);
      assert.match(editor, /store\.applySendGateway\(/);
    });

  });
}
