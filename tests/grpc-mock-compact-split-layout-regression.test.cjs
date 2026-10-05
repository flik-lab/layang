"use strict";

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
