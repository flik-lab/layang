"use strict";

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
  assert.match(requestPanel, /Uses the same scenario controls and settings flow as Workspace Mock/);
  assert.match(requestPanel, /setActiveRequestMockEnabled/);
  assert.match(requestPanel, /<GrpcMockScenarioActionsMenu/);
  assert.match(requestPanel, /<GrpcMockScenarioManagerDialog/);
  assert.doesNotMatch(requestPanel, /requestMockEditorDraft/);
  assert.match(requestPanel, /Configure in workspace/);
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
  assert.match(container, /const unchanged =/);
  assert.match(container, /return unchanged \? current : \{ \.\.\.current, \.\.\.result \}/);
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
  assert.match(services, /const effectiveScenarioId = methodScenarios\.some/);
  assert.match(services, /setFocusedScenarioKey\(`\$\{methodKey\(row\.method\)\}:\$\{saved\.scenario\.id\}`\)/);
  assert.match(requestPanel, /<GrpcScenarioSourceDialog/);
  assert.match(requestPanel, /openActiveRequestScenarioEditor/);
  assert.match(requestPanel, /selectActiveRequestScenario/);
  assert.match(requestPanel, /setActiveRequestMockEnabled/);
  assert.match(requestPanel, /saveActiveRequestMockScenario/);
  assert.doesNotMatch(requestPanel, /startActiveRequestMock/);
  assert.match(actions, /await persistProjectSnapshotNow\?\.\(project\)/);
  assert.match(actions, /openPath\(nextPath, "mocks\/grpc\/methods"/);
});
