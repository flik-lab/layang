"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const terminal = fs.readFileSync("app/playground/features/cli/cli-terminal-panel.tsx", "utf8");
const model = fs.readFileSync("app/playground/features/shell/use-workbench-container-model.tsx", "utf8");
const types = fs.readFileSync("app/playground/shared/workbench-types.ts", "utf8");
const preload = fs.readFileSync("electron/preload.cjs", "utf8");
const ipc = fs.readFileSync("electron/ipc/cli-ipc.cjs", "utf8");
const grpc = fs.readFileSync("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts", "utf8");
const requestRunner = fs.readFileSync("app/playground/features/request-runner/use-request-runner-actions.ts", "utf8");
const services = fs.readFileSync("app/playground/features/services/services-workspace.tsx", "utf8");

test("integrated terminal renders CLI output as real rows and normalizes Windows carriage returns", () => {
  assert.match(terminal, /replace\(\/\\r\\n\/g, "\\n"\)/);
  assert.match(terminal, /replace\(\/\\r\/g, "\\n"\)/);
  assert.match(terminal, /outputRemainderRef/);
  assert.match(terminal, /buffered\.split\("\\n"\)/);
  assert.match(terminal, /flushOutputRemainders/);
  assert.match(terminal, /component="div"/);
  assert.doesNotMatch(terminal, /component="pre"/);
});

test("GUI observes CLI mock daemon state for gRPC, REST, and WebSocket", () => {
  assert.match(ipc, /cli:mock-runtime-status/);
  assert.match(ipc, /readMockStatus\(workspacePath\)/);
  assert.match(preload, /mockRuntimeStatus/);
  assert.match(model, /setInterval\(\(\) => void applyCliRuntimeStatus\(\), 900\)/);
  assert.match(model, /statuses\.grpc/);
  assert.match(model, /statuses\.rest/);
  assert.match(model, /statuses\.websocket/);
  assert.match(model, /runtimeSource: "cli"/);
  assert.match(types, /runtimeSource\?: "gui" \| "cli"/);
  assert.match(services, /Running · CLI/);
});

test("GUI stop controls stop an externally started CLI mock daemon", () => {
  assert.match(ipc, /cli:mock-runtime-stop/);
  assert.match(preload, /stopMockRuntime/);
  assert.match(grpc, /mockServerStatus\.runtimeSource === "cli"/);
  assert.match(requestRunner, /restMockStatus\.runtimeSource === "cli"/);
  assert.match(requestRunner, /wsMockStatus\.runtimeSource === "cli"/);
});
