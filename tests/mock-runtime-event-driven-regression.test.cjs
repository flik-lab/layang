"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("utility-mode mock runtime is event-driven and creates no grpc/rest/websocket status interval", () => {
  const polling = read("app/playground/features/mock-server/runtime/useMockRuntimePolling.ts");
  const events = read("app/playground/features/mock-server/runtime/useMockRuntimeEvents.ts");
  const shell = read("app/playground/features/shell/use-workbench-container-model.tsx");

  assert.match(events, /electronRuntime\?\.onEvent/);
  assert.match(events, /mock\.statusChanged/);
  assert.match(events, /patchGrpc/);
  assert.match(events, /patchRest/);
  assert.match(events, /patchWebSocket/);
  assert.match(shell, /useMockRuntimeEvents\(\)/);
  assert.match(polling, /runtimeModeRef\.current === "utility"/);

  const utilityGuard = polling.indexOf('runtimeModeRef.current === "utility"');
  const grpcInterval = polling.indexOf("1500");
  assert.ok(utilityGuard >= 0 && utilityGuard < grpcInterval, "utility guard must precede mock polling intervals");
});

test("mock runtime telemetry exposes dedicated runtime status poll rate", () => {
  const types = read("app/playground/features/mock-server/runtime/mockRuntime.types.ts");
  const store = read("app/playground/features/mock-server/runtime/mockRuntime.store.ts");
  const perf = read("app/playground/shared/performance/performance-stats.store.ts");

  assert.match(types, /runtimeStatusPolls: number/);
  assert.match(store, /recordRuntimeStatusPoll/);
  assert.match(perf, /runtimeStatusPollsPerSec/);
});


test("utility runtime crash clears grpc/rest/websocket running status until explicitly restarted", () => {
  const events = read("app/playground/features/mock-server/runtime/useMockRuntimeEvents.ts");
  assert.match(events, /runtime\.unavailable/);
  assert.match(events, /patchGrpc\(\{ running: false/);
  assert.match(events, /patchRest\(\{ running: false/);
  assert.match(events, /patchWebSocket\(\{ running: false/);
});
