"use strict";

const { executionAllows } = require("./mock-execution-engine.cjs");

/** Routing to a mock is not permission to execute it on an incoming RPC. */
function isGatewayIncomingScenario(scenario) {
  if (!scenario || scenario.active === false) return false;
  // Unary scenarios historically have no stream execution configuration.
  if (!scenario.stream) return true;
  return executionAllows(scenario.stream.execution, "incoming");
}

/**
 * A deliberately selected Standby (or any non-incoming) server-stream scenario
 * must not silently fall back to a real upstream. Gateway does not implement
 * manual live-push sessions; fail closed rather than proxying unexpected data.
 */
function findBlockedSelectedGatewayStreamScenario(runtime, method, requestContext, matcherMatches) {
  const methodKey = `${method.serviceName}/${method.methodName}`;
  const alternateKey = `${method.serviceName}.${method.methodName}`;
  if (runtime.enabledMethods?.[methodKey] === false || runtime.enabledMethods?.[alternateKey] === false) return null;
  const selectedId = runtime.activeScenarioIds?.[methodKey] || runtime.activeScenarioIds?.[alternateKey];
  if (!selectedId) return null;
  return (runtime.scenarios || []).find((scenario) =>
    scenario.id === selectedId &&
    scenario.service === method.serviceName &&
    scenario.method === method.methodName &&
    scenario.active !== false &&
    Boolean(scenario.stream) &&
    !isGatewayIncomingScenario(scenario) &&
    matcherMatches(scenario.input || scenario.match, requestContext)
  ) || null;
}

module.exports = { isGatewayIncomingScenario, findBlockedSelectedGatewayStreamScenario };
