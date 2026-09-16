"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("request sessions identify response runtime without owning message arrays", () => {
  const types = read("app/playground/shared/workbench-types.ts");
  const model = read("app/playground/features/request-runner/request-session-model.ts");
  assert.match(types, /responseSessionId: string/);
  assert.doesNotMatch(types, /export type RequestSession = [\s\S]*?events: UiEvent\[\]/);
  assert.doesNotMatch(types, /export type RequestSession = [\s\S]*?lastResult: GrpcResult \| null/);
  assert.match(model, /responseSessionId:/);
  assert.doesNotMatch(model, /events:\s*\[\]/);
});

test("response session registry is the runtime owner and releases stores on close", () => {
  const registry = read("app/playground/features/response-viewer/model/responseSessionRegistry.ts");
  assert.match(registry, /createResponseStore/);
  assert.match(registry, /getOrCreate/);
  assert.match(registry, /close\(sessionId/);
  assert.match(registry, /runtime\.store\.reset\(\)/);
  assert.match(registry, /resultSummary/);
  assert.match(registry, /assertionResults/);
});

test("live session events no longer clone RequestSession arrays per streamed message", () => {
  const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
  assert.match(liveEvents, /responseSessionRegistry/);
  assert.doesNotMatch(liveEvents, /setRequestSessions/);
  assert.match(liveEvents, /getOrCreate\(targetSessionId\)\.store/);
});

test("request runner completion stores response payloads in the session runtime, not RequestSession", () => {
  const runner = read("app/playground/hooks/use-request-runner.ts");
  assert.match(runner, /responseSessionRegistry/);
  assert.doesNotMatch(runner, /updateRequestSession\(targetSessionId,[\s\S]{0,350}?events:\s*resultEvents/);
  assert.doesNotMatch(runner, /updateRequestSession\(targetSessionId,[\s\S]{0,350}?lastResult:\s*clientSafeResult/);
  assert.doesNotMatch(runner, /updateRequestSession\(targetSessionId,[\s\S]{0,350}?assertionResults:\s*evaluatedAssertions/);
});

test("manual WebSocket runtime does not keep a second unbounded message array", () => {
  const controller = read("app/playground/features/websocket/use-websocket-controller.ts");
  const actions = read("app/playground/features/request-runner/use-request-runner-actions.ts");
  assert.doesNotMatch(controller, /messages:\s*unknown\[\]/);
  assert.doesNotMatch(actions, /client\.messages\.push/);
  assert.doesNotMatch(actions, /messages:\s*\[\.\.\.client\.messages\]/);
});

test("workspace persistence accepts legacy response fields but strips them from normalized control-plane sessions", () => {
  const workspace = read("app/playground/features/workspace/workspace-model.ts");
  assert.match(workspace, /events:\s*_legacyEvents/);
  assert.match(workspace, /lastResult:\s*_legacyLastResult/);
  assert.match(workspace, /assertionResults:\s*_legacyAssertionResults/);
  assert.doesNotMatch(workspace, /events:\s*\(session\.events \?\? \[\]\)\.slice/);
  assert.doesNotMatch(workspace, /lastResult:\s*session\.lastResult/);
});
