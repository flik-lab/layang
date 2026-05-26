"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const guard = require("../lib/grpc-mock-runtime-guard.cjs");

function active(overrides = {}) {
  return {
    methods: [{ serviceName: "demo.Greeter", methodName: "SayHello" }],
    hasUiRuntimeOverride: false,
    hasUiStreamDefaultsOverride: false,
    lastUiRuntimeUpdateAt: 0,
    lastUiRuntimeRevision: 0,
    ...overrides,
  };
}

function runtime(scenarioCount = 1) {
  return {
    scenarioIndex: Array.from({ length: scenarioCount }, (_, index) => ({ id: `scenario-${index + 1}` })),
  };
}

test("gRPC mock guard marks UI updates as authoritative with monotonic revision", () => {
  const state = active();
  guard.markUiRuntimeUpdate(state, { uiRuntimeRevision: 7 }, 1000);
  assert.equal(state.hasUiRuntimeOverride, true);
  assert.equal(state.hasUiStreamDefaultsOverride, true);
  assert.equal(state.lastUiRuntimeUpdateAt, 1000);
  assert.equal(state.lastUiRuntimeRevision, 7);
  assert.equal(guard.isStaleUiRuntimeUpdate(state, { uiRuntimeRevision: 6 }), true);
  assert.equal(guard.isStaleUiRuntimeUpdate(state, { uiRuntimeRevision: 7 }), false);
  assert.equal(guard.isStaleUiRuntimeUpdate(state, { uiRuntimeRevision: 8 }), false);
});

test("gRPC mock guard rejects partial workspace reloads that would clear scenarios", () => {
  const state = active();
  const result = guard.shouldIgnoreFileRuntimeUpdate(
    state,
    runtime(2),
    { scenarios: [], workspaceMtimeMs: 9999 },
    "file",
    10_000,
    3000,
  );
  assert.deepEqual(result, { ignore: true, reason: "partial-workspace-write" });
});

test("gRPC mock guard rejects stale file reloads after UI scenario edit", () => {
  const state = active({ hasUiRuntimeOverride: true, lastUiRuntimeUpdateAt: 5000, lastUiRuntimeRevision: 3 });
  const result = guard.shouldIgnoreFileRuntimeUpdate(
    state,
    runtime(1),
    { scenarios: [{ id: "old" }], workspaceMtimeMs: 4000 },
    "file",
    9000,
    3000,
  );
  assert.deepEqual(result, { ignore: true, reason: "stale-file-update" });
});

test("gRPC mock guard rejects file reloads during the UI quiet period even with newer mtime", () => {
  const state = active({ hasUiRuntimeOverride: true, lastUiRuntimeUpdateAt: 5000, lastUiRuntimeRevision: 3 });
  const result = guard.shouldIgnoreFileRuntimeUpdate(
    state,
    runtime(1),
    { scenarios: [{ id: "disk" }], workspaceMtimeMs: 7000 },
    "file",
    6500,
    3000,
  );
  assert.deepEqual(result, { ignore: true, reason: "stale-file-update" });
});

test("gRPC mock guard accepts fresh file reload before UI becomes authoritative", () => {
  const result = guard.shouldIgnoreFileRuntimeUpdate(
    active(),
    runtime(1),
    { scenarios: [{ id: "disk" }], workspaceMtimeMs: 7000 },
    "file",
    8000,
    3000,
  );
  assert.deepEqual(result, { ignore: false, reason: "fresh-file-update" });
});
