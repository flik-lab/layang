"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (file) => fs.readFileSync(file, "utf8");

test("desktop defaults to utility runtime while explicit main rollback remains supported", () => {
  const main = read("electron/main.cjs");
  const preload = read("electron/preload.cjs");
  assert.match(main, /LAYANG_RUNTIME_MODE \|\| "utility"/);
  assert.match(main, /registerNativeGrpcIpc\(\{ runtimeMode,/);
  assert.match(preload, /mode: process\.env\.LAYANG_RUNTIME_MODE === "main" \? "main" : "utility"/);
});

test("utility native gRPC boundary never re-registers raw payload in renderer", () => {
  const ipc = read("electron/ipc/native-grpc-ipc.cjs");
  const utilityStart = ipc.indexOf("async function invokeUtilityNativeGrpc");
  const nextFunction = ipc.indexOf("\nfunction forwardGrpcEventWithPayloadRegistration", utilityStart);
  const utilityBlock = ipc.slice(utilityStart, nextFunction);
  assert.match(utilityBlock, /documentRef: runtimePayload\.documentRef/);
  assert.doesNotMatch(utilityBlock, /serializedValueUtf8/);
  assert.doesNotMatch(utilityBlock, /registerPayloadDocument/);
});

test("runtime generation invalidates stale response sessions", () => {
  const live = read("app/playground/features/request-runner/use-live-session-events.ts");
  assert.match(live, /runtime\.generationChanged/);
  assert.match(live, /runtime\.unavailable/);
  assert.match(live, /responseSessionRegistry\.clear\(\)/);
  assert.match(live, /transportLifecycleStore\.reset\(\)/);
});
