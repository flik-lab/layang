"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("response panel resolves its own session runtime instead of receiving a hot store prop", () => {
  const panel = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
  assert.match(panel, /responseSessionId: string/);
  assert.match(panel, /responseSessionRegistry\.getOrCreate\(responseSessionId\)/);
  assert.doesNotMatch(panel, /responseStreamStore: ResponseStore/);
  assert.doesNotMatch(panel, /lastResult: GrpcResult \| null/);
  assert.doesNotMatch(panel, /assertionResults: AssertionResult\[\]/);
});

test("live session events route active and background messages through the response session registry", () => {
  const live = read("app/playground/features/request-runner/use-live-session-events.ts");
  assert.doesNotMatch(live, /appendResponseEvents:/);
  assert.doesNotMatch(live, /appendResponseEvents\(activeEvents\)/);
  assert.match(live, /responseSessionRegistry\.getOrCreate\(targetSessionId\)\.store\.appendEvents/);
});

test("main panel passes a response session id rather than a response store", () => {
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.match(main, /responseSessionId=\{/);
  assert.doesNotMatch(main, /responseStreamStore=\{/);
});

test("compatibility result state is reset when the active response session changes", () => {
  const controller = read("app/playground/features/response-viewer/use-response-controller.ts");
  assert.match(controller, /useEffect\(\(\) => \{/);
  assert.match(controller, /setLastResultState\(null\)/);
  assert.match(controller, /\[responseSessionId/);
});
