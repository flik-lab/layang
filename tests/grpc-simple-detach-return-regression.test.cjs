"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("gRPC server-streaming defaults to periodic and hides incoming/scheduled controls", () => {
  const core = read("app/playground/features/mock-server/mock-scenario-core.ts");
  const controls = read("app/playground/features/mock-server/workspace/MockExecutionControls.tsx");
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(core, /fallback\.mode \?\? \(isPlainRecord\(value\) \? "scheduled" : undefined\)/);
  assert.match(services, /variant="grpc-stream"/);
  assert.match(controls, /grpcStream && \(normalized\.mode === "incoming" \|\| normalized\.mode === "scheduled"\)/);
  assert.match(controls, /grpcStream \? null : <MenuItem value="incoming">Incoming<\/MenuItem>/);
  assert.match(controls, /grpcStream \? null : <MenuItem value="scheduled">Scheduled<\/MenuItem>/);
  assert.match(controls, /title=\{executionSummary\}/);
  assert.doesNotMatch(controls, /Hybrid keeps the periodic stream running and also allows Send Now/);
});

test("main window can request a graceful reattach instead of force-closing detached resources", () => {
  const manager = read("electron/window/window-manager.cjs");
  const preload = read("electron/preload.cjs");
  const titlebar = read("app/playground/features/windows/detached-window-titlebar.tsx");
  const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");

  assert.match(manager, /layang:request-reattach/);
  assert.match(preload, /onRequestReattach/);
  assert.match(titlebar, /onRequestReattach/);
  assert.match(mainPanel, /reattachResource\?\.\("response", activeRequestId\)/);
  assert.match(mainPanel, /reattachResource\("mocking"\)/);
});
