"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("request workspace delegates mock editing to the global Mocking workspace", () => {
  const source = fs.readFileSync(
    path.join(root, "app/playground/features/shell/workbench-main-panel.tsx"),
    "utf8",
  );
  const services = fs.readFileSync(
    path.join(root, "app/playground/features/services/services-workspace.tsx"),
    "utf8",
  );

  assert.match(source, /Global Mocking/);
  assert.match(source, /Mock scenarios now live in one workspace/);
  assert.match(source, /Open Global Mocking/);
  assert.match(source, /Open this gRPC method/);
  assert.doesNotMatch(source, /requestMockEditorDraft/);
  assert.match(services, /onManageScenario=\{openMockScenarioManager\}/);
  assert.match(services, /onAddScenario=\{addMockScenarioForMethod\}/);
  assert.match(services, /<MockExecutionControls/);
});

test("Web Access gateway uses the same request matcher as native gRPC mock", () => {
  const gateway = fs.readFileSync(path.join(root, "electron/services/grpc-gateway-server.cjs"), "utf8");
  const nativeMock = fs.readFileSync(path.join(root, "electron/services/grpc-mock-server.cjs"), "utf8");
  assert.match(gateway, /const \{ mockMatcherMatches \} = require\("\.\/grpc-mock-server\.cjs"\)/);
  assert.match(gateway, /mockMatcherMatches\(scenario\.input \|\| scenario\.match, requestContext\)/);
  assert.match(nativeMock, /mockMatcherMatches,/);
  assert.doesNotMatch(gateway, /\{ \.\.\.request, headers:/);
});

test("gRPC server-stream mock exposes persistent standby/manual send through IPC and focused workspace", () => {
  const runtime = fs.readFileSync(path.join(root, "electron/services/grpc-mock-server.cjs"), "utf8");
  const ipc = fs.readFileSync(path.join(root, "electron/ipc/grpc-mock-ipc.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");
  const services = fs.readFileSync(
    path.join(root, "app/playground/features/services/services-workspace.tsx"),
    "utf8",
  );

  assert.match(runtime, /sendMockServerStreamMessage/);
  assert.match(runtime, /live-push/);
  assert.match(ipc, /mock-server:stream-send/);
  assert.match(preload, /sendStream:.*mock-server:stream-send/s);
  assert.match(services, /<MockExecutionControls/);
  assert.match(services, /aria-label="Manual Send"/);
  assert.doesNotMatch(services, /Manual scenario for/);
  assert.match(services, /Manual response for/);
  assert.match(services, /selectedScenarioId/);
  assert.match(services, /Send Now/);
  assert.match(runtime, /scenariosByMethod/);
  assert.match(runtime, /responseIndex/);
  assert.match(runtime, /sendAll/);
});
