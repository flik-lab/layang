"use strict";

const crypto = require("node:crypto");

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function activePairs(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && item.enabled !== false)
    .map((item) => ({ ...item, key: String(item.key || "").trim(), value: String(item.value ?? "") }))
    .filter((item) => item.key);
}

function parseKeyValueFlags(input) {
  const list = Array.isArray(input) ? input : input === undefined || input === null ? [] : [input];
  const output = {};
  for (const raw of list) {
    const text = String(raw || "");
    const separator = text.indexOf("=");
    if (separator <= 0) continue;
    output[text.slice(0, separator).trim()] = text.slice(separator + 1);
  }
  return output;
}

function valueAtPath(root, dottedPath) {
  const normalized = String(dottedPath || "")
    .trim()
    .replace(/^\$\.?/, "");
  if (!normalized) return root;
  const tokens = normalized
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current = root;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    current = current[token];
  }
  return current;
}

function environmentRecord(workspace, envKey) {
  const project = workspace?.project || {};
  const key = String(envKey || project.environmentKey || "default");
  return (
    (Array.isArray(project.environments) ? project.environments : []).find((item) => String(item?.key || "") === key) ||
    null
  );
}

function collectVariables(workspace, envKey, overrides) {
  const project = workspace?.project || {};
  const environment = environmentRecord(workspace, envKey) || {};
  const variables = {
    ...(isObject(project.variables) ? project.variables : {}),
    ...(isObject(environment.variables) ? environment.variables : {}),
    ...(isObject(environment.values) ? environment.values : {}),
    ...(isObject(overrides) ? overrides : {}),
  };
  variables.environment = String(environment.key || envKey || project.environmentKey || "default");
  variables.environmentLabel = String(environment.label || variables.environment);
  variables.restBaseUrl = String(environment.restBaseUrl || environment.baseUrl || project.restBaseUrl || "");
  variables.websocketUrl = String(environment.websocketUrl || project.websocketUrl || "");
  variables.grpcWebBaseUrl = String(environment.grpcWebBaseUrl || project.baseUrl || "");
  variables.nativeTarget = String(environment.nativeTarget || project.nativeTarget || "");
  return variables;
}

function resolveTemplateString(input, variables, options = {}) {
  const strict = Boolean(options.strict);
  return String(input ?? "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawKey) => {
    const key = String(rawKey || "").trim();
    if (key === "timestamp" || key === "$timestamp") return String(Date.now());
    if (key === "uuid" || key === "$uuid") return crypto.randomUUID();
    if (key.startsWith("$process.")) {
      const name = key.slice("$process.".length);
      const value = process.env[name];
      if (value !== undefined) return value;
    }
    const value = valueAtPath(variables, key);
    if (value === undefined || value === null) {
      if (strict) throw new Error(`Variable ${key} is not defined.`);
      return match;
    }
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

function resolveTemplateValue(value, variables, options = {}) {
  if (typeof value === "string") return resolveTemplateString(value, variables, options);
  if (Array.isArray(value)) return value.map((item) => resolveTemplateValue(item, variables, options));
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveTemplateValue(item, variables, options)]),
    );
  }
  return value;
}

function parseJsonLoose(text, fallback = {}) {
  if (isObject(text) || Array.isArray(text)) return text;
  const normalized = String(text ?? "").trim();
  if (!normalized) return fallback;
  try {
    return JSON.parse(normalized);
  } catch {
    return fallback;
  }
}

function mergeHeaderPairs(basePairs, overrides) {
  const output = activePairs(basePairs);
  const overrideRecord = isObject(overrides) ? overrides : {};
  for (const [key, value] of Object.entries(overrideRecord)) {
    const existing = output.findIndex((item) => item.key.toLowerCase() === String(key).toLowerCase());
    const pair = { key: String(key), value: String(value ?? ""), enabled: true };
    if (existing >= 0) output[existing] = pair;
    else output.push(pair);
  }
  return output;
}

function normalizeAuth(auth, variables, strictVariables) {
  const record = isObject(auth) ? resolveTemplateValue(auth, variables, { strict: strictVariables }) : {};
  const type = String(record.type || record.kind || "none").toLowerCase();
  return { ...record, type };
}

function replacePathParameters(urlText, pairs, variables, strictVariables) {
  let output = resolveTemplateString(urlText, variables, { strict: strictVariables });
  for (const pair of activePairs(pairs)) {
    const value = encodeURIComponent(resolveTemplateString(pair.value, variables, { strict: strictVariables }));
    output = output
      .replace(new RegExp(`\\{${escapeRegex(pair.key)}\\}`, "g"), value)
      .replace(new RegExp(`:${escapeRegex(pair.key)}(?=/|$|\\?)`, "g"), value);
  }
  return output;
}

function buildRestRequest(item, workspace, options = {}) {
  const variables = collectVariables(workspace, options.env || item.environmentKey, options.variables);
  const strictVariables = Boolean(options.strictVariables);
  const rawUrl = options.target || item.target || item.requestUrl || item.baseUrl || "";
  const urlText = replacePathParameters(rawUrl, item.restPathParams, variables, strictVariables);
  const url = new URL(urlText);

  for (const pair of activePairs(item.restParams)) {
    const key = resolveTemplateString(pair.key, variables, { strict: strictVariables });
    const value = resolveTemplateString(pair.value, variables, { strict: strictVariables });
    url.searchParams.append(key, value);
  }

  const headers = new Headers();
  for (const pair of mergeHeaderPairs(item.metadata, options.headers)) {
    headers.append(
      resolveTemplateString(pair.key, variables, { strict: strictVariables }),
      resolveTemplateString(pair.value, variables, { strict: strictVariables }),
    );
  }

  const auth = normalizeAuth(item.restAuth, variables, strictVariables);
  if (auth.type === "bearer" && auth.token) headers.set("authorization", `Bearer ${auth.token}`);
  if (auth.type === "basic") {
    const username = String(auth.username || "");
    const password = String(auth.password || "");
    headers.set("authorization", `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`);
  }
  if (auth.type === "api-key" || auth.type === "apikey") {
    const name = String(auth.key || auth.name || "x-api-key");
    const value = String(auth.value || "");
    const target = String(auth.addTo || auth.in || "header").toLowerCase();
    if (target === "query") url.searchParams.set(name, value);
    else headers.set(name, value);
  }

  const method = String(item.httpMethod || "GET").toUpperCase();
  const bodyType = String(item.restBodyType || "json").toLowerCase();
  const resolvedBodyText = resolveTemplateString(item.requestJson || "", variables, { strict: strictVariables });
  let body;
  if (!(method === "GET" || method === "HEAD") && resolvedBodyText && bodyType !== "none") {
    if (bodyType === "form-urlencoded" || bodyType === "urlencoded" || bodyType === "x-www-form-urlencoded") {
      const params = new URLSearchParams();
      const parsed = parseJsonLoose(resolvedBodyText, {});
      if (isObject(parsed)) for (const [key, value] of Object.entries(parsed)) params.append(key, String(value ?? ""));
      else for (const pair of activePairs(item.formFields)) params.append(pair.key, pair.value);
      body = params;
      if (!headers.has("content-type")) headers.set("content-type", "application/x-www-form-urlencoded");
    } else if (bodyType === "multipart" || bodyType === "form-data") {
      const form = new FormData();
      const parsed = parseJsonLoose(resolvedBodyText, {});
      if (isObject(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          form.append(key, typeof value === "string" ? value : JSON.stringify(value));
        }
      }
      body = form;
      headers.delete("content-type");
    } else {
      body = resolvedBodyText;
      if (bodyType === "json" && !headers.has("content-type")) headers.set("content-type", "application/json");
      if (bodyType === "text" && !headers.has("content-type")) headers.set("content-type", "text/plain; charset=utf-8");
    }
  }

  return { url: url.toString(), method, headers, body, variables, bodyType };
}

function buildGrpcInput(item, workspace, options = {}) {
  const variables = collectVariables(workspace, options.env || item.environmentKey, options.variables);
  const strictVariables = Boolean(options.strictVariables);
  const requestText = resolveTemplateString(item.requestJson || "{}", variables, { strict: strictVariables });
  const metadata = mergeHeaderPairs(item.metadata, options.headers).map((pair) => ({
    key: resolveTemplateString(pair.key, variables, { strict: strictVariables }),
    value: resolveTemplateString(pair.value, variables, { strict: strictVariables }),
  }));
  return { requestText, metadata, variables };
}

function buildWebSocketInput(item, workspace, options = {}) {
  const variables = collectVariables(workspace, options.env || item.environmentKey, options.variables);
  const strictVariables = Boolean(options.strictVariables);
  return {
    url: resolveTemplateString(options.target || item.target || item.requestUrl || "", variables, {
      strict: strictVariables,
    }),
    requestText: resolveTemplateString(item.requestJson || "", variables, { strict: strictVariables }),
    headers: mergeHeaderPairs(item.metadata, options.headers).map((pair) => ({
      key: resolveTemplateString(pair.key, variables, { strict: strictVariables }),
      value: resolveTemplateString(pair.value, variables, { strict: strictVariables }),
    })),
    variables,
  };
}

function normalizeExpectedStatus(value) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const grpcNames = {
    OK: "0",
    CANCELLED: "1",
    UNKNOWN: "2",
    INVALID_ARGUMENT: "3",
    DEADLINE_EXCEEDED: "4",
    NOT_FOUND: "5",
    ALREADY_EXISTS: "6",
    PERMISSION_DENIED: "7",
    RESOURCE_EXHAUSTED: "8",
    FAILED_PRECONDITION: "9",
    ABORTED: "10",
    OUT_OF_RANGE: "11",
    UNIMPLEMENTED: "12",
    INTERNAL: "13",
    UNAVAILABLE: "14",
    DATA_LOSS: "15",
    UNAUTHENTICATED: "16",
  };
  return grpcNames[text.toUpperCase()] ?? text;
}

function deepContains(actual, expected) {
  if (expected === null || typeof expected !== "object") {
    if (typeof actual === "string" && typeof expected === "string") return actual.includes(expected);
    return Object.is(actual, expected);
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedItem) => actual.some((actualItem) => deepContains(actualItem, expectedItem)));
  }
  if (!isObject(actual)) return false;
  return Object.entries(expected).every(([key, value]) => deepContains(actual[key], value));
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function compareOperator(actual, operator, expected) {
  switch (String(operator || "equals").toLowerCase()) {
    case "equals":
    case "eq":
      return stableJson(actual) === stableJson(expected);
    case "not-equals":
    case "ne":
      return stableJson(actual) !== stableJson(expected);
    case "contains":
      return deepContains(actual, expected);
    case "exists":
      return actual !== undefined && actual !== null;
    case "not-exists":
      return actual === undefined || actual === null;
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "matches": {
      try {
        return new RegExp(String(expected)).test(String(actual ?? ""));
      } catch {
        return false;
      }
    }
    case "length":
      return Number(actual?.length) === Number(expected);
    default:
      return false;
  }
}

function evaluateAssertions(result, assertionText, expected = {}) {
  const assertions = [];
  const add = (name, passed, detail) => assertions.push({ name, status: passed ? "passed" : "failed", detail });
  let config = {};
  if (String(assertionText || "").trim()) {
    try {
      config = JSON.parse(String(assertionText));
    } catch (error) {
      return [{ name: "assertion-json", status: "failed", detail: `Invalid assertion JSON: ${error.message}` }];
    }
  }
  if (!isObject(config) && !Array.isArray(config)) config = {};

  const rules = Array.isArray(config) ? config : Array.isArray(config.rules) ? config.rules : [];
  if (!Array.isArray(config)) {
    if (config.grpcStatus !== undefined) {
      const wanted = normalizeExpectedStatus(config.grpcStatus);
      const actual = String(result.trailers?.["grpc-status"] ?? result.statusCode ?? "");
      add("grpcStatus", actual === wanted, `expected ${wanted}, received ${actual || "<empty>"}`);
    }
    if (config.httpStatus !== undefined) {
      const actual = Number(result.httpStatus ?? 0);
      add("httpStatus", actual === Number(config.httpStatus), `expected ${config.httpStatus}, received ${actual}`);
    }
    if (config.wsCloseCode !== undefined) {
      const actual = Number(result.closeCode ?? 0);
      add("wsCloseCode", actual === Number(config.wsCloseCode), `expected ${config.wsCloseCode}, received ${actual}`);
    }
    if (config.minMessages !== undefined) {
      const count = Number(result.totalMessages ?? result.messages?.length ?? 0);
      add("minMessages", count >= Number(config.minMessages), `expected >= ${config.minMessages}, received ${count}`);
    }
    if (config.maxMessages !== undefined) {
      const count = Number(result.totalMessages ?? result.messages?.length ?? 0);
      add("maxMessages", count <= Number(config.maxMessages), `expected <= ${config.maxMessages}, received ${count}`);
    }
    if (config.maxLatencyMs !== undefined) {
      add(
        "maxLatencyMs",
        Number(result.durationMs || 0) <= Number(config.maxLatencyMs),
        `expected <= ${config.maxLatencyMs} ms, received ${result.durationMs} ms`,
      );
    }
    if (config.bodyEquals !== undefined) {
      const actual = result.messages?.[0];
      add("bodyEquals", stableJson(actual) === stableJson(config.bodyEquals), "response body equality");
    }
    if (config.bodyContains !== undefined) {
      add("bodyContains", deepContains(result.messages?.[0], config.bodyContains), "response body containment");
    }
    if (isObject(config.headers)) {
      for (const [key, value] of Object.entries(config.headers)) {
        const actual = headerValue(result.headers, key);
        add(
          `header:${key}`,
          String(actual ?? "") === String(value),
          `expected ${value}, received ${actual ?? "<empty>"}`,
        );
      }
    }
    if (isObject(config.trailers)) {
      for (const [key, value] of Object.entries(config.trailers)) {
        const actual = headerValue(result.trailers, key);
        add(
          `trailer:${key}`,
          String(actual ?? "") === String(value),
          `expected ${value}, received ${actual ?? "<empty>"}`,
        );
      }
    }
  }

  const context = {
    result,
    body: result.messages?.[0],
    messages: result.messages || [],
    headers: result.headers || {},
    trailers: result.trailers || {},
    httpStatus: result.httpStatus,
    grpcStatus: result.trailers?.["grpc-status"] ?? result.statusCode,
    closeCode: result.closeCode,
    durationMs: result.durationMs,
    totalMessages: result.totalMessages ?? result.messages?.length ?? 0,
  };
  for (const [index, rule] of rules.entries()) {
    if (!isObject(rule)) continue;
    const actual = valueAtPath(context, rule.path || rule.actual || "body");
    const passed = compareOperator(actual, rule.operator || rule.op, rule.expected);
    add(
      String(rule.name || rule.path || `rule-${index + 1}`),
      passed,
      `${rule.operator || "equals"} ${JSON.stringify(rule.expected)}`,
    );
  }

  if (expected.status !== undefined && expected.status !== "") {
    const wanted = normalizeExpectedStatus(expected.status);
    const actualGrpc = String(result.trailers?.["grpc-status"] ?? "");
    const actualHttp = String(result.httpStatus ?? "");
    const actual = actualGrpc || actualHttp || String(result.statusCode ?? "");
    add(
      "expectedStatus",
      actual === wanted || String(result.statusMessage || "").toUpperCase() === String(expected.status).toUpperCase(),
      `expected ${wanted}, received ${actual}`,
    );
  }
  if (expected.json !== undefined && expected.json !== "") {
    const parsedExpected =
      typeof expected.json === "string" ? parseJsonLoose(expected.json, expected.json) : expected.json;
    add(
      "expectedResponse",
      deepContains(result.messages?.[0], parsedExpected),
      "expected response is contained in the actual response",
    );
  }
  if (Array.isArray(expected.trailers)) {
    for (const pair of activePairs(expected.trailers)) {
      const actual = headerValue(result.trailers, pair.key);
      add(
        `expectedTrailer:${pair.key}`,
        String(actual ?? "") === String(pair.value),
        `expected ${pair.value}, received ${actual ?? "<empty>"}`,
      );
    }
  }

  if (!assertions.length)
    assertions.push({ name: "assertions", status: "skipped", detail: "No assertions configured." });
  return assertions;
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((item) => item.toLowerCase() === String(name).toLowerCase());
  return key ? headers[key] : undefined;
}

function assertionsPassed(assertions) {
  return (assertions || []).every((item) => item.status !== "failed");
}

function percentile(values, value) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((value / 100) * sorted.length) - 1));
  return sorted[index];
}

function calculateBenchmarkStats(results) {
  const list = Array.isArray(results) ? results : [];
  const successful = list.filter((item) => item.passed);
  const durations = successful.map((item) => Number(item.durationMs || 0));
  const totalDuration = list.reduce((sum, item) => sum + Number(item.durationMs || 0), 0);
  const messages = successful.reduce((sum, item) => sum + Number(item.totalMessages || item.messages?.length || 0), 0);
  return {
    total: list.length,
    passed: successful.length,
    failed: list.length - successful.length,
    errorRate: list.length ? (list.length - successful.length) / list.length : 0,
    minMs: durations.length ? Math.min(...durations) : 0,
    maxMs: durations.length ? Math.max(...durations) : 0,
    averageMs: durations.length ? durations.reduce((sum, item) => sum + item, 0) / durations.length : 0,
    p50Ms: percentile(durations, 50),
    p90Ms: percentile(durations, 90),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    totalMessages: messages,
    messagesPerSecond: totalDuration > 0 ? messages / (totalDuration / 1000) : 0,
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  isObject,
  activePairs,
  mergeHeaderPairs,
  parseKeyValueFlags,
  valueAtPath,
  environmentRecord,
  collectVariables,
  resolveTemplateString,
  resolveTemplateValue,
  parseJsonLoose,
  buildRestRequest,
  buildGrpcInput,
  buildWebSocketInput,
  normalizeExpectedStatus,
  deepContains,
  stableJson,
  evaluateAssertions,
  assertionsPassed,
  calculateBenchmarkStats,
  percentile,
};
