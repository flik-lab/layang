"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("request workspace reuses the Workspace Mock settings menu, manager, and source editor", () => {
  const source = fs.readFileSync(
    path.join(root, "app/playground/features/shell/workbench-main-panel.tsx"),
    "utf8",
  );
  const controls = fs.readFileSync(
    path.join(root, "app/playground/features/mock-server/grpc-mock-scenario-controls.tsx"),
    "utf8",
  );
  const services = fs.readFileSync(
    path.join(root, "app/playground/features/services/services-workspace.tsx"),
    "utf8",
  );

  assert.match(source, /<GrpcMockScenarioControls/);
  assert.match(source, /onOpenSettings=\{setRequestMockSettingsAnchor\}/);
  assert.match(source, /<GrpcMockScenarioActionsMenu/);
  assert.match(source, /<GrpcMockScenarioManagerDialog/);
  assert.match(source, /<GrpcScenarioSourceDialog/);
  assert.match(services, /<GrpcMockScenarioActionsMenu/);
  assert.match(services, /<GrpcMockScenarioManagerDialog/);
  assert.match(controls, /Scenario settings/);
  assert.match(controls, /Edit source/);
  assert.match(controls, /Manage scenarios/);
  assert.match(controls, /Add scenario/);
  assert.match(controls, /Duplicate active/);
  assert.match(controls, /Delete active/);
  assert.match(source, /saveMockScenarioForMethod/);
  assert.match(source, /selectedScenarioIds/);
  assert.match(source, /methodBindings/);
  assert.match(source, /attach this request's pinned Proto revision automatically/);
  assert.match(source, /activeRequestMockScenarioIdSignature/);
  assert.match(source, /validIds = new Set/);
  assert.match(source, /else delete selectedScenarioIds\[key\]/);
  assert.match(source, /setRequestMockSettingsAnchor\(null\);[\s\S]*window\.confirm/);
  assert.match(source, /setRequestMockManagerOpen\(false\);[\s\S]{0,220}window\.setTimeout\(\(\) => \{[\s\S]{0,120}deleteActiveRequestMockScenario\(scenarioId\)/);
  assert.match(controls, /const \[scenarioMenuAnchor, setScenarioMenuAnchor\] = useState/);
  assert.match(controls, /aria-label="Active gRPC mock scenario"/);
  assert.match(controls, /<Menu[\s\S]{0,220}anchorEl=\{scenarioMenuAnchor\}/);
  assert.match(controls, /setScenarioMenuAnchor\(null\);[\s\S]{0,120}window\.setTimeout\(\(\) => onScenarioSelect\(scenario\.id\), 0\)/);
  assert.doesNotMatch(controls, /<Select[\s>]/);
  assert.match(controls, /onClose\(\);[\s\S]*window\.setTimeout\(action, 0\)/);
  assert.doesNotMatch(source, /requestMockEditorDraft/);
  assert.doesNotMatch(source, /openMockScenarioManager\(activeRequestMockContext/);
});

test("Web Access gateway uses the same request matcher as native gRPC mock", () => {
  const gateway = fs.readFileSync(path.join(root, "electron/services/grpc-gateway-server.cjs"), "utf8");
  const nativeMock = fs.readFileSync(path.join(root, "electron/services/grpc-mock-server.cjs"), "utf8");
  assert.match(gateway, /const \{ mockMatcherMatches \} = require\("\.\/grpc-mock-server\.cjs"\)/);
  assert.match(gateway, /mockMatcherMatches\(scenario\.input \|\| scenario\.match, requestContext\)/);
  assert.match(nativeMock, /mockMatcherMatches,/);
  assert.doesNotMatch(gateway, /\{ \.\.\.request, headers:/);
});
