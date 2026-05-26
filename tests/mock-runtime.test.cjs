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

test("missing input behaves as a match-any fallback stub", () => {
  assert.equal(runtime.mockMatcherMatches(undefined, { name: "anyone" }), true);
});

test("equals_unordered matcher ignores array order recursively", () => {
  assert.equal(
    runtime.mockMatcherMatches(
      { equals_unordered: { tags: ["beta", "alpha"], nested: [{ id: 2 }, { id: 1 }] } },
      { tags: ["alpha", "beta"], nested: [{ id: 1 }, { id: 2 }] },
    ),
    true,
  );
});

test("matches matcher supports regex field matching", () => {
  assert.equal(runtime.mockMatcherMatches({ matches: { name: "^ali.*", code: "^[0-9]{3}$" } }, { name: "alice", code: 200 }), true);
  assert.equal(runtime.mockMatcherMatches({ matches: { name: "^bob" } }, { name: "alice" }), false);
});

test("glob matcher supports wildcard matching", () => {
  assert.equal(runtime.mockMatcherMatches({ glob: { route: "/api/*/tracks/?" } }, { route: "/api/v1/tracks/a" }), true);
  assert.equal(runtime.mockMatcherMatches({ glob: { route: "/api/*/tracks/?" } }, { route: "/api/v1/tracks/abc" }), false);
});

test("headers matcher can be combined with request data matcher", () => {
  assert.equal(
    runtime.mockMatcherMatches(
      { contains: { id: "A1" }, headers: { contains: { authorization: "Bearer" } } },
      { data: { id: "A1" }, headers: { authorization: "Bearer token" } },
    ),
    true,
  );
  assert.equal(
    runtime.mockMatcherMatches(
      { contains: { id: "A1" }, headers: { contains: { authorization: "Bearer" } } },
      { data: { id: "A1" }, headers: { authorization: "Basic token" } },
    ),
    false,
  );
});
