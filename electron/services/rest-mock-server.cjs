"use strict";

const http = require("node:http");
const { URL } = require("node:url");
const {
  executionAllows,
  getNextScheduleAt,
  normalizeMockExecution,
} = require("../../lib/mock-execution-engine.cjs");

let runtime = null;
const MAX_PENDING_REQUESTS = 1000;
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isFinite(port)) return 3007;
  return Math.min(65535, Math.max(1, Math.trunc(port)));
}

function normalizeBindHost(value) {
  const host = typeof value === "string" ? value.trim() : "";
  // Wildcard binds (IPv4 or IPv6) are narrowed to loopback: the mock is a local dev tool.
  if (!host || host === "0.0.0.0" || host === "::" || host === "[::]") return "127.0.0.1";
  return host;
}

function normalizeMaxBodyBytes(value) {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_MAX_BODY_BYTES;
}

function parseHostHeaderHostname(value) {
  const host = String(value || "").trim().toLowerCase();
  if (!host) return "";
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(0, end + 1);
  }
  const colon = host.indexOf(":");
  return colon === -1 ? host : host.slice(0, colon);
}

function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTNAMES.has(String(hostname || "").toLowerCase());
}

/**
 * DNS-rebinding guard: when the mock is bound to loopback, a request sent by a web
 * browser (it carries `Origin` or `Sec-Fetch-Site`) must name loopback (or the bind
 * host) in its Host header. Non-browser clients and gateways that rewrite Host are
 * not affected, and requests without a Host header (HTTP/1.0) are allowed.
 */
function isAllowedHostHeader(hostHeader, bindHost, headers) {
  if (!isLoopbackHostname(bindHost)) return true;
  if (headers && !headers.origin && !headers["sec-fetch-site"]) return true;
  const hostname = parseHostHeaderHostname(hostHeader);
  if (!hostname) return true;
  return isLoopbackHostname(hostname) || hostname === String(bindHost || "").toLowerCase();
}

function safeDecodeURIComponent(value) {
  try {
    return { ok: true, value: decodeURIComponent(value) };
  } catch {
    return { ok: false, value };
  }
}

function normalizePairList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({ key: String(item?.key ?? "").trim(), value: String(item?.value ?? "") }))
    .filter((item) => item.key);
}

function normalizeScenario(input) {
  const scenario = input && typeof input === "object" ? input : {};
  return {
    id: String(scenario.id || `scenario-${Date.now()}`),
    sourceRequestId: scenario.sourceRequestId ? String(scenario.sourceRequestId) : scenario.requestId ? String(scenario.requestId) : undefined,
    name: String(scenario.name || "REST scenario"),
    enabled: scenario.enabled !== false,
    execution: normalizeMockExecution(scenario.execution),
    method: String(scenario.method || "GET").toUpperCase(),
    path: String(scenario.path || "/"),
    priority: Math.trunc(Number(scenario.priority) || 0),
    status: Math.min(599, Math.max(100, Math.trunc(Number(scenario.status) || 200))),
    headers: normalizePairList(scenario.headers).length
      ? normalizePairList(scenario.headers)
      : [{ key: "content-type", value: "application/json" }],
    body: typeof scenario.body === "string" ? scenario.body : JSON.stringify(scenario.body ?? {}, null, 2),
    delayMs: Math.max(0, Math.trunc(Number(scenario.delayMs) || 0)),
    matchQuery: normalizePairList(scenario.matchQuery),
    matchHeaders: normalizePairList(scenario.matchHeaders),
    matchBodyContains: typeof scenario.matchBodyContains === "string" ? scenario.matchBodyContains : "",
    matchJsonPath: typeof scenario.matchJsonPath === "string" ? scenario.matchJsonPath : "",
    matchJsonEquals: typeof scenario.matchJsonEquals === "string" ? scenario.matchJsonEquals : "",
  };
}

function normalizeConfig(payload) {
  return {
    port: normalizePort(payload?.port),
    bindHost: normalizeBindHost(payload?.bindHost),
    maxBodyBytes: normalizeMaxBodyBytes(payload?.maxBodyBytes),
    scenarios: Array.isArray(payload?.scenarios)
      ? payload.scenarios.map(normalizeScenario).sort((left, right) => right.priority - left.priority)
      : [],
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathPatternToRegex(pattern) {
  const names = [];
  const normalized = pattern.startsWith("/") ? pattern : `/${pattern}`;
  const segments = normalized.split("/").map((segment) => {
    if (!segment) return "";
    if (segment.startsWith(":")) {
      names.push(segment.slice(1));
      return "([^/]+)";
    }
    if (segment.startsWith("{") && segment.endsWith("}")) {
      names.push(segment.slice(1, -1));
      return "([^/]+)";
    }
    return escapeRegExp(segment);
  });
  return { regex: new RegExp(`^${segments.join("/")}$`), names };
}

function matchPath(patternInput, pathname) {
  const pattern = patternInput.startsWith("/") ? patternInput : `/${patternInput}`;
  if (pattern === pathname) return { ok: true, params: {} };
  const { regex, names } = pathPatternToRegex(pattern);
  const match = regex.exec(pathname);
  if (!match) return { ok: false, params: {} };
  const params = {};
  for (let index = 0; index < names.length; index += 1) {
    // Never throw on malformed escapes; the handler rejects malformed paths with 400 up front.
    params[names[index]] = safeDecodeURIComponent(match[index + 1] ?? "").value;
  }
  return { ok: true, params };
}

function getHeader(headers, key) {
  const lowerKey = key.toLowerCase();
  const found = Object.keys(headers).find((item) => item.toLowerCase() === lowerKey);
  return found ? String(headers[found] ?? "") : "";
}

function parseJsonSafe(text) {
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function getJsonPathValue(value, path) {
  const normalized = String(path || "").trim().replace(/^\$\.?/, "");
  if (!normalized) return value;
  return normalized.split(".").reduce((current, segment) => {
    if (current == null || segment === "") return undefined;
    const arrayMatch = /^(.*)\[(\d+)\]$/.exec(segment);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const index = Number(arrayMatch[2]);
      const target = key ? current?.[key] : current;
      return Array.isArray(target) ? target[index] : undefined;
    }
    return current?.[segment];
  }, value);
}

function pairListMatches(list, reader) {
  for (const item of list) {
    if (String(reader(item.key)) !== String(item.value)) return false;
  }
  return true;
}

function scenarioMatches(scenario, request) {
  if (!scenario.enabled || scenario.method !== request.method) return { ok: false, params: {} };
  const pathMatch = matchPath(scenario.path, request.pathname);
  if (!pathMatch.ok) return { ok: false, params: {} };
  if (!pairListMatches(scenario.matchQuery, (key) => request.url.searchParams.get(key) ?? "")) return { ok: false, params: {} };
  if (!pairListMatches(scenario.matchHeaders, (key) => getHeader(request.headers, key))) return { ok: false, params: {} };
  if (scenario.matchBodyContains && !request.body.includes(scenario.matchBodyContains)) return { ok: false, params: {} };
  if (scenario.matchJsonPath) {
    const actual = getJsonPathValue(request.bodyJson, scenario.matchJsonPath);
    if (scenario.matchJsonEquals) {
      const expected = parseJsonSafe(scenario.matchJsonEquals) ?? scenario.matchJsonEquals;
      if (JSON.stringify(actual) !== JSON.stringify(expected)) return { ok: false, params: {} };
    } else if (actual === undefined) return { ok: false, params: {} };
  }
  return { ok: true, params: pathMatch.params };
}

function responseHeaders(headers) {
  const output = {};
  for (const item of headers || []) {
    const key = String(item?.key || "").trim();
    if (key) output[key] = String(item?.value ?? "");
  }
  if (!Object.keys(output).some((key) => key.toLowerCase() === "content-type")) output["content-type"] = "application/json";
  return output;
}

class RestMockHttpError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Reads the request body up to maxBytes. On overflow it stops buffering, pauses the stream and
 * rejects with a 413 RestMockHttpError (the connection is closed after the response).
 */
function readBody(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers?.["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.pause();
      reject(new RestMockHttpError(413, "Request body too large", { maxBodyBytes: maxBytes }));
      return;
    }
    const chunks = [];
    let total = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        chunks.length = 0;
        req.pause();
        finish(new RestMockHttpError(413, "Request body too large", { maxBodyBytes: maxBytes }));
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => finish(null, Buffer.concat(chunks, total).toString("utf8"));
    const onError = (error) => finish(error);
    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
  });
}

function sendJsonError(res, statusCode, payload, extraHeaders = {}) {
  if (res.headersSent || res.writableEnded || res.destroyed) return false;
  try {
    res.writeHead(statusCode, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      ...extraHeaders,
    });
    res.end(JSON.stringify(payload, null, 2));
    return true;
  } catch {
    return false;
  }
}

function pushRequestLog(entry) {
  if (!runtime) return;
  runtime.requestCount = (runtime.requestCount || 0) + 1;
  runtime.requestLog = [entry, ...(runtime.requestLog || [])].slice(0, 80);
}

function findLiveScenario(id, fallback) {
  return runtime?.config?.scenarios?.find((item) => item.id === id) || fallback;
}

function writeRestResponse(pending, source = "incoming") {
  if (!pending || pending.done) return false;
  const scenario = findLiveScenario(pending.scenario.id, pending.scenario);
  if (!scenario?.enabled) return false;
  pending.done = true;
  if (pending.timeout) clearTimeout(pending.timeout);
  runtime?.pending?.delete(pending.id);
  const durationMs = Date.now() - pending.started;
  try {
    const headers = responseHeaders(scenario.headers);
    const isJson = Object.entries(headers).some(
      ([key, value]) => key.toLowerCase() === "content-type" && /json/i.test(value),
    );
    pending.res.writeHead(scenario.status, {
      ...headers,
      "access-control-allow-origin": "*",
      "x-layang-rest-mock": scenario.id,
      "x-layang-rest-mock-trigger": source,
      "x-layang-rest-mock-duration-ms": String(durationMs),
    });
    if (pending.method === "HEAD") pending.res.end();
    else pending.res.end(renderTemplate(scenario.body, { request: pending.request, pathParams: pending.pathParams, json: isJson }));
  } catch {
    return false;
  }
  pushRequestLog({
    id: randomId(), method: pending.method, path: pending.request.pathname, status: scenario.status,
    scenarioId: scenario.id, matched: true, durationMs, timestamp: new Date().toISOString(), source,
  });
  return true;
}

function enqueuePendingRestResponse({ req, res, request, scenario, pathParams, started }) {
  if (!runtime) return false;
  if (runtime.pending.size >= MAX_PENDING_REQUESTS) {
    const durationMs = Date.now() - started;
    pushRequestLog({
      id: randomId(), method: request.method, path: request.pathname, status: 503, scenarioId: scenario.id,
      matched: true, durationMs, timestamp: new Date().toISOString(), source: "pending-capacity",
    });
    try {
      res.writeHead(503, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "retry-after": "1",
        "x-layang-rest-mock": scenario.id,
        "x-layang-rest-mock-trigger": "pending-capacity",
      });
      res.end(JSON.stringify({
        error: "Mock pending request capacity reached",
        scenarioId: scenario.id,
        maxPendingRequests: MAX_PENDING_REQUESTS,
      }, null, 2));
    } catch { /* client disconnected */ }
    return false;
  }
  const id = randomId();
  const pending = { id, req, res, request, scenario, pathParams, method: request.method, started, done: false, timeout: null };
  runtime.pending.set(id, pending);
  const timeoutMs = Math.max(1, scenario.execution.timeoutMs || 30000);
  pending.timeout = setTimeout(() => {
    if (pending.done) return;
    pending.done = true;
    runtime?.pending?.delete(id);
    const durationMs = Date.now() - started;
    pushRequestLog({ id: randomId(), method: request.method, path: request.pathname, status: 504, scenarioId: scenario.id, matched: true, durationMs, timestamp: new Date().toISOString(), source: "timeout" });
    try {
      res.writeHead(504, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "x-layang-rest-mock": scenario.id,
        "x-layang-rest-mock-trigger": "timeout",
      });
      res.end(JSON.stringify({ error: "Mock standby timeout", scenarioId: scenario.id, timeoutMs }, null, 2));
    } catch { /* client disconnected */ }
  }, timeoutMs);
  pending.timeout.unref?.();
  const cleanup = () => {
    if (pending.done) return;
    pending.done = true;
    if (pending.timeout) clearTimeout(pending.timeout);
    runtime?.pending?.delete(id);
  };
  req.once("aborted", cleanup);
  res.once("close", () => { if (!res.writableEnded) cleanup(); });
  return true;
}

function releasePendingRestResponses(payload = {}, source = "manual") {
  if (!runtime) return { running: false, sent: 0, pendingCount: 0 };
  let sent = 0;
  for (const pending of Array.from(runtime.pending.values())) {
    if (payload.pendingId && pending.id !== payload.pendingId) continue;
    if (payload.scenarioId && pending.scenario.id !== payload.scenarioId) continue;
    const execution = findLiveScenario(pending.scenario.id, pending.scenario)?.execution;
    if (!executionAllows(execution, source === "schedule" ? "scheduled" : source)) continue;
    if (writeRestResponse(pending, source)) sent += 1;
    if (payload.all === false) break;
  }
  return { ...status(), sent, pendingCount: runtime.pending.size };
}

function clearScenarioTimers(state) {
  if (!state?.scenarioTimers) return;
  for (const timer of state.scenarioTimers.values()) clearTimeout(timer);
  state.scenarioTimers.clear();
}

function reconcileScenarioTimers(state) {
  clearScenarioTimers(state);
  if (!state) return;
  const now = Date.now();
  for (const scenario of state.config.scenarios) {
    const execution = scenario.execution;
    if (!scenario.enabled) continue;
    if (execution.periodic.enabled) {
      let count = 0;
      const tick = () => {
        if (runtime !== state) return;
        releasePendingRestResponses({ scenarioId: scenario.id }, "periodic");
        count += 1;
        const max = execution.periodic.maxExecutions;
        if (max > 0 && count >= max) return;
        const timer = setTimeout(tick, Math.max(1, execution.periodic.intervalMs));
        timer.unref?.();
        state.scenarioTimers.set(`periodic:${scenario.id}`, timer);
      };
      const timer = setTimeout(tick, Math.max(1, execution.periodic.intervalMs));
      timer.unref?.();
      state.scenarioTimers.set(`periodic:${scenario.id}`, timer);
    }
    if (execution.schedule.enabled) scheduleScenario(state, scenario, now);
  }
}

function scheduleScenario(state, scenario, now = Date.now()) {
  const nextAt = getNextScheduleAt(scenario.execution.schedule, now);
  if (!nextAt) return;
  const key = `schedule:${scenario.id}`;
  state.nextScheduleAt.set(scenario.id, nextAt);
  const timer = setTimeout(() => {
    if (runtime !== state) return;
    releasePendingRestResponses({ scenarioId: scenario.id }, "scheduled");
    state.nextScheduleAt.delete(scenario.id);
    if ((scenario.execution.schedule.repeatMs || 0) > 0) scheduleScenario(state, scenario, Date.now() + 1);
  }, Math.max(0, nextAt - Date.now()));
  timer.unref?.();
  state.scenarioTimers.set(key, timer);
}

function createHandler(config) {
  const handle = createRequestHandler(config);
  return (req, res) => {
    Promise.resolve()
      .then(() => handle(req, res))
      .catch((error) => {
        if (error instanceof RestMockHttpError) {
          const sent = sendJsonError(res, error.status, { error: error.message, ...error.details }, error.status === 413 ? { connection: "close" } : {});
          pushRequestLog({
            id: randomId(), method: String(req.method || "GET").toUpperCase(), path: String(req.url || "/").split("?")[0],
            status: error.status, matched: false, durationMs: 0, timestamp: new Date().toISOString(), source: "rejected",
          });
          if (error.status === 413) {
            if (sent) res.once("finish", () => req.socket?.destroy());
            else req.socket?.destroy();
          }
          return;
        }
        console.error("[rest-mock] request handler failed:", error);
        if (!sendJsonError(res, 500, { error: "REST mock internal error", message: String(error?.message || error) })) {
          try { res.destroy(); } catch { /* ignore */ }
        }
      });
  };
}

function respondScenarioUnavailable(pending) {
  if (pending.done) return;
  pending.done = true;
  if (pending.timeout) clearTimeout(pending.timeout);
  runtime?.pending?.delete(pending.id);
  const durationMs = Date.now() - pending.started;
  const sent = sendJsonError(pending.res, 503, {
    error: "REST mock scenario was disabled before the response was sent",
    scenarioId: pending.scenario.id,
  }, { "x-layang-rest-mock": pending.scenario.id, "x-layang-rest-mock-trigger": "scenario-disabled" });
  if (sent) {
    pushRequestLog({
      id: randomId(), method: pending.method, path: pending.request.pathname, status: 503, scenarioId: pending.scenario.id,
      matched: true, durationMs, timestamp: new Date().toISOString(), source: "scenario-disabled",
    });
  }
}

function createRequestHandler(config) {
  return async (req, res) => {
    const started = Date.now();
    const method = String(req.method || "GET").toUpperCase();
    if (!isAllowedHostHeader(req.headers.host, config.bindHost, req.headers)) {
      sendJsonError(res, 403, { error: "Host header not allowed for loopback-bound REST mock", host: String(req.headers.host || "") });
      return;
    }
    const parsed = new URL(req.url || "/", "http://localhost");
    if (!safeDecodeURIComponent(parsed.pathname).ok) {
      throw new RestMockHttpError(400, "Malformed URL encoding", { path: parsed.pathname });
    }
    if (method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS", "access-control-allow-headers": "*", "access-control-max-age": "3600" });
      res.end();
      return;
    }

    const body = await readBody(req, config.maxBodyBytes);
    const request = { method, pathname: parsed.pathname, url: parsed, headers: req.headers, body, bodyJson: parseJsonSafe(body) };
    let matchedParams = {};
    const scenario = config.scenarios.find((item) => {
      const result = scenarioMatches(item, request);
      if (result.ok) matchedParams = result.params;
      return result.ok;
    });

    if (!scenario) {
      const responseBody = JSON.stringify({ error: "No REST mock scenario matched", method, path: parsed.pathname, query: Object.fromEntries(parsed.searchParams.entries()), scenarios: config.scenarios.filter((item) => item.enabled).length }, null, 2);
      const durationMs = Date.now() - started;
      pushRequestLog({ id: randomId(), method, path: parsed.pathname, status: 404, matched: false, durationMs, timestamp: new Date().toISOString() });
      res.writeHead(404, { "content-type": "application/json", "access-control-allow-origin": "*", "x-layang-rest-mock": "miss" });
      res.end(responseBody);
      return;
    }

    const pending = { id: randomId(), req, res, request, scenario, pathParams: matchedParams, method, started, done: false, timeout: null };
    if (executionAllows(scenario.execution, "incoming")) {
      // writeRestResponse returns false when the scenario was disabled during the delay: never hang.
      const write = () => {
        if (!writeRestResponse(pending, "incoming")) respondScenarioUnavailable(pending);
      };
      if (scenario.delayMs > 0) {
        const timer = setTimeout(write, scenario.delayMs);
        timer.unref?.();
      } else write();
      return;
    }
    enqueuePendingRestResponse({ req, res, request, scenario, pathParams: matchedParams, started });
  };
}

function resolveTemplateToken(token, context) {
  if (token === "now") return new Date().toISOString();
  if (token === "timestamp") return String(Date.now());
  if (token === "uuid") return randomId();
  let match = /^request\.path\.([\w.-]+)$/.exec(token);
  if (match) return String(context.pathParams?.[match[1]] ?? "");
  match = /^request\.query\.([\w.-]+)$/.exec(token);
  if (match) return String(context.request?.url?.searchParams?.get(match[1]) ?? "");
  match = /^request\.header\.([\w.-]+)$/.exec(token);
  if (match) return getHeader(context.request?.headers ?? {}, match[1]);
  match = /^request\.bodyJson\.([\w.[\]-]+)$/.exec(token);
  if (match) {
    const value = getJsonPathValue(context.request?.bodyJson, match[1]);
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  return undefined;
}

/**
 * Renders {{...}} placeholders. Every occurrence is resolved separately (each {{uuid}} is fresh).
 * When context.json is true, values substituted inside a JSON string literal are JSON-escaped so
 * request-controlled text (quotes, backslashes, control chars) cannot break or inject into the body.
 * Placeholders outside string literals are inserted raw (e.g. `"n": {{request.query.n}}`).
 */
function renderTemplate(text, context = {}) {
  const source = String(text);
  const json = Boolean(context.json);
  let output = "";
  let inString = false;
  let escaped = false;
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("{{", index)) {
      const end = source.indexOf("}}", index + 2);
      if (end !== -1) {
        const token = source.slice(index + 2, end);
        const value = resolveTemplateToken(token, context);
        if (value !== undefined) {
          output += json && inString ? JSON.stringify(value).slice(1, -1) : value;
          index = end + 2;
          escaped = false;
          continue;
        }
      }
    }
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    output += char;
    index += 1;
  }
  return output;
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function startRestMockServer(payload = {}) {
  const config = normalizeConfig(payload);
  if (runtime) await stopRestMockServer();
  const server = http.createServer(createHandler(config));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.bindHost, () => { server.off("error", reject); resolve(); });
  });
  runtime = {
    server, config, startedAt: new Date().toISOString(), requestLog: [], requestCount: 0, pending: new Map(),
    scenarioTimers: new Map(), nextScheduleAt: new Map(),
  };
  reconcileScenarioTimers(runtime);
  return status("REST mock server started.");
}

async function updateRestMockServer(payload = {}) {
  if (!runtime) return { running: false, message: "REST mock server is not running." };
  const nextConfig = normalizeConfig(payload);
  const needsRestart = nextConfig.port !== runtime.config.port || nextConfig.bindHost !== runtime.config.bindHost;
  if (needsRestart) return startRestMockServer(nextConfig);
  runtime.config = nextConfig;
  runtime.server.removeAllListeners("request");
  runtime.server.on("request", createHandler(nextConfig));
  reconcileScenarioTimers(runtime);
  return status("REST mock config updated.");
}

async function stopRestMockServer() {
  if (!runtime) return { running: false, message: "REST mock server already stopped." };
  const active = runtime;
  runtime = null;
  clearScenarioTimers(active);
  for (const pending of active.pending.values()) {
    if (pending.timeout) clearTimeout(pending.timeout);
    try { pending.res.destroy(); } catch { /* ignore */ }
  }
  active.pending.clear();
  await new Promise((resolve) => active.server.close(() => resolve()));
  return { running: false, message: "REST mock server stopped." };
}

function sendRestMockResponse(payload = {}) {
  if (!runtime) throw new Error("Start the REST mock server before sending a pending response.");
  return releasePendingRestResponses(payload, "manual");
}

function status(message) {
  if (!runtime) return { running: false, message: message || "REST mock server stopped." };
  const nextSchedule = Array.from(runtime.nextScheduleAt.values()).sort((a, b) => a - b)[0];
  return {
    running: true,
    port: runtime.config.port,
    bindHost: runtime.config.bindHost,
    url: `http://${runtime.config.bindHost}:${runtime.config.port}`,
    scenarioCount: runtime.config.scenarios.length,
    requestCount: runtime.requestCount ?? 0,
    pendingCount: runtime.pending.size,
    maxPendingRequests: MAX_PENDING_REQUESTS,
    nextScheduleAt: nextSchedule ? new Date(nextSchedule).toISOString() : undefined,
    requestLog: runtime.requestLog ?? [],
    message,
    startedAt: runtime.startedAt,
    updatedAt: new Date().toISOString(),
  };
}

function getRestMockServerStatus() { return status(); }

module.exports = {
  startRestMockServer,
  updateRestMockServer,
  stopRestMockServer,
  sendRestMockResponse,
  getRestMockServerStatus,
  _internals: {
    normalizeConfig, scenarioMatches, renderTemplate, getJsonPathValue, releasePendingRestResponses,
    isAllowedHostHeader, normalizeBindHost, createHandler, DEFAULT_MAX_BODY_BYTES,
  },
};
