"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isGatewayIncomingScenario } = require("../lib/gateway-execution-policy.cjs");

test("standby and hybrid streams are not triggered by incoming gateway calls", () => {
  for (const mode of ["standby", "hybrid", "periodic", "scheduled"]) {
    assert.equal(isGatewayIncomingScenario({ active: true, stream: { execution: { mode } } }), false, mode);
  }
});
test("incoming execution and explicit incoming opt-in are allowed", () => {
  assert.equal(isGatewayIncomingScenario({ stream: { execution: { mode: "incoming" } } }), true);
  assert.equal(isGatewayIncomingScenario({ stream: { execution: { mode: "hybrid", incoming: true } } }), true);
});
test("inactive scenarios cannot execute; legacy unary and stream scenarios remain compatible", () => {
  assert.equal(isGatewayIncomingScenario({ active: false }), false);
  assert.equal(isGatewayIncomingScenario({}), true);
  assert.equal(isGatewayIncomingScenario({ stream: { responses: [] } }), true);
});

test("explicit Standby selection blocks silent hybrid upstream fallback", () => {
  const { findBlockedSelectedGatewayStreamScenario } = require("../lib/gateway-execution-policy.cjs");
  const runtime = {
    enabledMethods: {},
    activeScenarioIds: { "svc/Watch": "standby-B" },
    scenarios: [
      { id: "incoming-A", service: "svc", method: "Watch", stream: { execution: { mode: "incoming" } } },
      { id: "standby-B", service: "svc", method: "Watch", stream: { execution: { mode: "standby" } } },
    ],
  };
  const method = { serviceName: "svc", methodName: "Watch" };
  assert.equal(findBlockedSelectedGatewayStreamScenario(runtime, method, {}, () => true)?.id, "standby-B");
  runtime.activeScenarioIds["svc/Watch"] = "incoming-A";
  assert.equal(findBlockedSelectedGatewayStreamScenario(runtime, method, {}, () => true), null);
  runtime.activeScenarioIds["svc/Watch"] = "standby-B";
  runtime.enabledMethods["svc/Watch"] = false;
  assert.equal(findBlockedSelectedGatewayStreamScenario(runtime, method, {}, () => true), null);
});
