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
    any: Object.hasOwn(value, "any") ? Boolean(value.any) : undefined,
    equals: Object.hasOwn(value, "equals") ? value.equals : undefined,
    equalsUnordered: Object.hasOwn(value, "equalsUnordered")
      ? value.equalsUnordered
      : Object.hasOwn(value, "equals_unordered")
        ? value.equals_unordered
        : undefined,
    contains: Object.hasOwn(value, "contains") ? value.contains : undefined,
    matches: Object.hasOwn(value, "matches")
      ? value.matches
      : Object.hasOwn(value, "regex")
        ? value.regex
        : undefined,
    glob: Object.hasOwn(value, "glob") ? value.glob : undefined,
    headers: Object.hasOwn(value, "headers") ? normalizeRuntimeMatcher(value.headers) : undefined,
    or: Array.isArray(value.or) ? value.or.map(normalizeRuntimeMatcher).filter(Boolean) : undefined,
  };
}

function hasValidRuntimeMatcher(matcher) {
  if (!isPlainObject(matcher)) return true;
  if (matcher.any === true) return true;
  if (Object.hasOwn(matcher, "equals") && matcher.equals !== undefined) return true;
  if (Object.hasOwn(matcher, "equalsUnordered") && matcher.equalsUnordered !== undefined) return true;
  if (Object.hasOwn(matcher, "contains") && isUsableContainsMatcherValue(matcher.contains)) return true;
  if (Object.hasOwn(matcher, "matches") && isUsableContainsMatcherValue(matcher.matches)) return true;
  if (Object.hasOwn(matcher, "glob") && isUsableContainsMatcherValue(matcher.glob)) return true;
  if (Object.hasOwn(matcher, "headers") && hasValidRuntimeMatcher(matcher.headers)) return true;
  return Array.isArray(matcher.or) && matcher.or.some(hasValidRuntimeMatcher);
}

function normalizeRequestContext(requestOrContext) {
  if (isPlainObject(requestOrContext) && Object.hasOwn(requestOrContext, "data") && Object.hasOwn(requestOrContext, "headers")) {
    return {
      data: requestOrContext.data === undefined ? {} : requestOrContext.data,
      headers: isPlainObject(requestOrContext.headers) ? requestOrContext.headers : {},
    };
  }
  return { data: requestOrContext === undefined ? {} : requestOrContext, headers: {} };
}

function jsonEqualsUnordered(actual, expected) {
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false;
    const unmatched = actual.map((item) => ({ item, used: false }));
    return expected.every((expectedItem) => {
      const index = unmatched.findIndex((entry) => !entry.used && jsonEqualsUnordered(entry.item, expectedItem));
      if (index < 0) return false;
      unmatched[index].used = true;
      return true;
    });
  }
  if (isPlainObject(actual) || isPlainObject(expected)) {
    if (!isPlainObject(actual) || !isPlainObject(expected)) return false;
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (stableJson(actualKeys) !== stableJson(expectedKeys)) return false;
    return expectedKeys.every((key) => jsonEqualsUnordered(actual[key], expected[key]));
  }
  return Object.is(actual, expected);
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

function jsonMatches(actual, expected) {
  if (!isUsableContainsMatcherValue(expected)) return false;
  if (expected === null || typeof expected !== "object") return matchesPattern(actual, expected);
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedItem, index) => jsonMatches(actual[index], expectedItem));
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) => jsonMatches(actual[key], value));
}

function jsonGlobMatches(actual, expected) {
  if (!isUsableContainsMatcherValue(expected)) return false;
  if (expected === null || typeof expected !== "object") return globMatches(actual, expected);
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedItem, index) => jsonGlobMatches(actual[index], expectedItem));
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) => jsonGlobMatches(actual[key], value));
}

function matchesPattern(actual, pattern) {
  try {
    return new RegExp(String(pattern)).test(String(actual ?? ""));
  } catch {
    return false;
  }
}

function globMatches(actual, pattern) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  try {
    return new RegExp(`^${escaped}$`).test(String(actual ?? ""));
  } catch {
    return false;
  }
}

function mockMatcherMatches(rawMatcher, requestOrContext) {
  const matcher = normalizeRuntimeMatcher(rawMatcher);
  if (!matcher) return true;
  if (!hasValidRuntimeMatcher(matcher)) return false;
  const context = normalizeRequestContext(requestOrContext);
  if (matcher.any === true) return true;
  if (Array.isArray(matcher.or) && matcher.or.length) {
    return matcher.or.some((item) => mockMatcherMatches(item, context));
  }
  let matched = true;
  if (Object.hasOwn(matcher, "equals") && matcher.equals !== undefined) {
    matched = matched && stableJson(context.data) === stableJson(matcher.equals);
  }
  if (Object.hasOwn(matcher, "equalsUnordered") && matcher.equalsUnordered !== undefined) {
    matched = matched && jsonEqualsUnordered(context.data, matcher.equalsUnordered);
  }
  if (Object.hasOwn(matcher, "contains") && matcher.contains !== undefined) {
    matched = matched && jsonContains(context.data, matcher.contains);
  }
  if (Object.hasOwn(matcher, "matches") && matcher.matches !== undefined) {
    matched = matched && jsonMatches(context.data, matcher.matches);
  }
  if (Object.hasOwn(matcher, "glob") && matcher.glob !== undefined) {
    matched = matched && jsonGlobMatches(context.data, matcher.glob);
  }
  if (Object.hasOwn(matcher, "headers") && matcher.headers !== undefined) {
    matched = matched && mockMatcherMatches(matcher.headers, context.headers);
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
  jsonEqualsUnordered,
  jsonMatches,
  jsonGlobMatches,
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
