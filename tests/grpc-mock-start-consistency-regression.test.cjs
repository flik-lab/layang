"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("all gRPC mock start entry points use an explicit snapshot and verify runtime readiness", () => {
  const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
  const requestPanel = read("app/playground/features/shell/workbench-main-panel.tsx");

  assert.match(requestPanel, /const nextProject = prepareActiveRequestMockProject\(mockServer\)/);
  assert.match(requestPanel, /const localTarget = await startMockServer\(nextProject\)/);
  assert.match(requestPanel, /setTransportMode\("native-grpc"\)/);
  assert.match(requestPanel, /setEnvironmentKey\("manual"\)/);
  assert.match(
    requestPanel,
    /updateActiveSession\(\{[\s\S]*transportMode: "native-grpc",[\s\S]*environmentKey: "manual",[\s\S]*nativeTarget: localTarget/,
  );
  assert.match(requestPanel, /\[activeRequestMockContext\.key\]: activeGrpcBinding/);
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
});

test("scenario editors share the committed scenario identity and folder opening flushes first", () => {
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
  assert.match(requestPanel, /setRequestMockScenarioId\(saved\.scenario\.id\)/);
  assert.match(actions, /await persistProjectSnapshotNow\?\.\(project\)/);
  assert.match(actions, /openPath\(nextPath, "mocks\/grpc\/methods"/);
});
