"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../lib/mock-runtime.cjs");

test("equals matcher ignores object key order", () => {
  assert.equal(runtime.mockMatcherMatches({ equals: { b: 2, a: 1 } }, { a: 1, b: 2 }), true);
});

test("contains matcher rejects empty objects so streams cannot match everything accidentally", () => {
  assert.equal(runtime.hasValidRuntimeMatcher({ contains: {} }), false);
  assert.equal(runtime.mockMatcherMatches({ contains: {} }, { name: "Alice" }), false);
});

test("or matcher accepts any valid nested matcher", () => {
  const matcher = {
    or: [{ equals: { name: "Alice" } }, { contains: { name: "Bob" } }],
  };
  assert.equal(runtime.mockMatcherMatches(matcher, { name: "Bobby Tables" }), true);
  assert.equal(runtime.mockMatcherMatches(matcher, { name: "Charlie" }), false);
});

test("selected scenario is the only scenario considered for a method", () => {
  const method = { serviceName: "demo.v1.Greeter", methodName: "SayHello" };
  const scenarios = [
    { id: "success", service: "demo.v1.Greeter", method: "SayHello", input: { equals: { name: "Alice" } } },
    { id: "other", service: "demo.v1.Greeter", method: "SayHello", input: { equals: { name: "Bob" } } },
  ];
  const match = runtime.findMatchingMockScenario(
    method,
    { name: "Bob" },
    scenarios,
    { "demo.v1.Greeter/SayHello": "success" },
    {},
  );
  assert.equal(match, undefined);
});

test("disabled method returns no active scenarios", () => {
  const method = { serviceName: "demo.v1.Greeter", methodName: "SayHello" };
  const scenarios = [
    { id: "success", service: "demo.v1.Greeter", method: "SayHello", input: { equals: { name: "Alice" } } },
  ];
  const active = runtime.getActiveRuntimeScenariosForMethod(
    method,
    scenarios,
    {},
    { "demo.v1.Greeter/SayHello": false },
  );
  assert.deepEqual(active, []);
});

test("stream settings normalize interval loop and infinite max loop", () => {
  assert.deepEqual(
    runtime.normalizeRuntimeStreamSettings(
      { interval_ms: "1250", loop: true, max_loops: 0 },
      { intervalMs: 500, loop: false, maxLoops: 1 },
    ),
    { intervalMs: 1250, loop: true, maxLoops: 0 },
  );
});
