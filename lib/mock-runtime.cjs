"use strict";

/**
 * Shared mock-runtime helpers used by the CLI and unit tests.
 * Electron main keeps its own grpc-js integration, but these pure functions
 * define the matching/selection behavior that must remain stable across UI,
 * CLI validation, and CI tests.
 */

function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((record, key) => {
      record[key] = sortJson(value[key]);
      return record;
    }, {});
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUsableContainsMatcherValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function normalizeRuntimeMatcher(value) {
  if (!isPlainObject(value)) return undefined;
  return {
    equals: Object.hasOwn(value, "equals") ? value.equals : undefined,
    contains: Object.hasOwn(value, "contains") ? value.contains : undefined,
    or: Array.isArray(value.or) ? value.or.map(normalizeRuntimeMatcher).filter(Boolean) : undefined,
  };
}

function hasValidRuntimeMatcher(matcher) {
  if (!isPlainObject(matcher)) return false;
  if (Object.hasOwn(matcher, "equals") && matcher.equals !== undefined) return true;
  if (Object.hasOwn(matcher, "contains") && isUsableContainsMatcherValue(matcher.contains)) return true;
  return Array.isArray(matcher.or) && matcher.or.some(hasValidRuntimeMatcher);
}

function jsonContains(actual, expected) {
  if (!isUsableContainsMatcherValue(expected)) return false;
  if (expected === null || typeof expected !== "object") {
    if (typeof actual === "string" && typeof expected === "string") return actual.includes(expected);
    return stableJson(actual).includes(String(expected));
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedItem) => actual.some((actualItem) => jsonContains(actualItem, expectedItem)));
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) => jsonContains(actual[key], value));
}

function mockMatcherMatches(rawMatcher, request) {
  const matcher = normalizeRuntimeMatcher(rawMatcher);
  if (!hasValidRuntimeMatcher(matcher)) return false;
  if (Array.isArray(matcher.or) && matcher.or.length) {
    return matcher.or.some((item) => mockMatcherMatches(item, request));
  }
  let matched = true;
  if (Object.hasOwn(matcher, "equals") && matcher.equals !== undefined) {
    matched = matched && stableJson(request) === stableJson(matcher.equals);
  }
  if (Object.hasOwn(matcher, "contains") && matcher.contains !== undefined) {
    matched = matched && jsonContains(request, matcher.contains);
  }
  return matched;
}

function methodKey(method) {
  return `${method.serviceName}/${method.methodName}`;
}

function dotMethodKey(method) {
  return `${method.serviceName}.${method.methodName}`;
}

function normalizeRuntimeScenario(value, index) {
  if (!isPlainObject(value)) return null;
  const service = String(value.service || "").trim();
  const method = String(value.method || "").trim();
  if (!service || !method) return null;
  return {
    ...value,
    id: String(value.id || `${service}.${method}.${index + 1}`),
    service,
    method,
    priority: Number(value.priority || 0),
    active: Object.hasOwn(value, "active") ? Boolean(value.active) : true,
    input: normalizeRuntimeMatcher(value.input || value.match),
  };
}

function normalizeScenarioList(scenarios) {
  return (Array.isArray(scenarios) ? scenarios : [])
    .map((scenario, index) => normalizeRuntimeScenario(scenario, index))
    .filter(Boolean);
}

function normalizeSelectedScenarioIds(value) {
  if (!isPlainObject(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.trim()) output[key] = item.trim();
  }
  return output;
}

function normalizeEnabledMethods(value) {
  if (!isPlainObject(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof key === "string" && key.trim()) output[key] = Boolean(item);
  }
  return output;
}

function isRuntimeScenarioActive(scenario) {
  return !scenario || scenario.active !== false;
}

function getActiveRuntimeScenariosForMethod(method, scenarios, selectedScenarioIds, enabledMethods) {
  const normalizedScenarios = normalizeScenarioList(scenarios);
  const activeIds = normalizeSelectedScenarioIds(selectedScenarioIds);
  const enabled = normalizeEnabledMethods(enabledMethods);
  const slashKey = methodKey(method);
  const dotKey = dotMethodKey(method);
  if (enabled && (enabled[slashKey] === false || enabled[dotKey] === false)) return [];

  const methodScenarios = normalizedScenarios.filter(
    (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
  );
  const selectedId = activeIds[slashKey] || activeIds[dotKey];
  if (selectedId)
    return methodScenarios.filter((scenario) => scenario.id === selectedId && isRuntimeScenarioActive(scenario));

  const active =
    methodScenarios
      .filter(isRuntimeScenarioActive)
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0] || methodScenarios[0];
  return active ? [active] : [];
}

function findMatchingMockScenario(method, request, scenarios, selectedScenarioIds, enabledMethods) {
  return getActiveRuntimeScenariosForMethod(method, scenarios, selectedScenarioIds, enabledMethods).find((scenario) =>
    mockMatcherMatches(scenario.input, request),
  );
}

function buildMockNoMatchMessage(method, request, scenarios, selectedScenarioIds, enabledMethods) {
  const slashKey = methodKey(method);
  const dotKey = dotMethodKey(method);
  const normalizedScenarios = normalizeScenarioList(scenarios);
  const activeIds = normalizeSelectedScenarioIds(selectedScenarioIds);
  const enabled = normalizeEnabledMethods(enabledMethods);
  const disabled = enabled[slashKey] === false || enabled[dotKey] === false;
  const methodScenarios = normalizedScenarios.filter(
    (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
  );
  const activeCandidates = getActiveRuntimeScenariosForMethod(method, normalizedScenarios, activeIds, enabled);
  const activeId = activeIds[slashKey] || activeIds[dotKey] || "auto";
  const invalidInput =
    activeCandidates.length > 0 && activeCandidates.every((scenario) => !hasValidRuntimeMatcher(scenario.input));
  const requestText = stableJson(request);
  const clippedRequest = requestText.length > 600 ? `${requestText.slice(0, 600)}...` : requestText;
  return [
    disabled
      ? `Mock request rejected: mocking is disabled for ${slashKey}.`
      : invalidInput
        ? `Mock request rejected: selected scenario input is missing or invalid for ${slashKey}.`
        : `Mock request rejected: the selected scenario input did not match equals/contains/or for ${slashKey}.`,
    `Active scenario: ${activeId}.`,
    `Available scenarios for method: ${methodScenarios.map((scenario) => scenario.id).join(", ") || "none"}.`,
    activeCandidates.length
      ? `Checked active scenario(s): ${activeCandidates.map((scenario) => scenario.id).join(", ")}.`
      : "Checked active scenario(s): none.",
    `Request: ${clippedRequest}`,
  ].join(" ");
}

function normalizeDelayMs(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(numeric, 86_400_000);
}

function normalizeRuntimeStreamSettings(value, fallback) {
  const record = isPlainObject(value) ? value : {};
  const intervalRaw = record.intervalMs !== undefined ? record.intervalMs : record.interval_ms;
  const maxLoopsRaw = record.maxLoops !== undefined ? record.maxLoops : record.max_loops;
  return {
    intervalMs: intervalRaw !== undefined ? normalizeDelayMs(intervalRaw) : fallback.intervalMs,
    loop: Object.hasOwn(record, "loop") ? Boolean(record.loop) : fallback.loop,
    maxLoops: maxLoopsRaw !== undefined ? Math.max(0, Math.floor(Number(maxLoopsRaw) || 0)) : fallback.maxLoops,
  };
}

module.exports = {
  stableJson,
  sortJson,
  isUsableContainsMatcherValue,
  normalizeRuntimeMatcher,
  hasValidRuntimeMatcher,
  jsonContains,
  mockMatcherMatches,
  methodKey,
  dotMethodKey,
  normalizeRuntimeScenario,
  normalizeScenarioList,
  normalizeSelectedScenarioIds,
  normalizeEnabledMethods,
  isRuntimeScenarioActive,
  getActiveRuntimeScenariosForMethod,
  findMatchingMockScenario,
  buildMockNoMatchMessage,
  normalizeDelayMs,
  normalizeRuntimeStreamSettings,
};
