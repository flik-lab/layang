const http = require("node:http");
const { URL } = require("node:url");

let runtime = null;

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isFinite(port)) return 3007;
  return Math.min(65535, Math.max(1, Math.trunc(port)));
}

function normalizeBindHost(value) {
  const host = typeof value === "string" ? value.trim() : "";
  if (!host || host === "0.0.0.0") return "127.0.0.1";
  return host;
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
    requestId: scenario.requestId ? String(scenario.requestId) : undefined,
    name: String(scenario.name || "REST scenario"),
    enabled: scenario.enabled !== false,
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
    params[names[index]] = decodeURIComponent(match[index + 1] ?? "");
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
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function getJsonPathValue(value, path) {
  const normalized = String(path || "")
    .trim()
    .replace(/^\$\.?/, "");
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
    const actual = reader(item.key);
    if (String(actual) !== String(item.value)) return false;
  }
  return true;
}

function scenarioMatches(scenario, request) {
  if (!scenario.enabled || scenario.method !== request.method) return { ok: false, params: {} };
  const pathMatch = matchPath(scenario.path, request.pathname);
  if (!pathMatch.ok) return { ok: false, params: {} };
  if (!pairListMatches(scenario.matchQuery, (key) => request.url.searchParams.get(key) ?? ""))
    return { ok: false, params: {} };
  if (!pairListMatches(scenario.matchHeaders, (key) => getHeader(request.headers, key)))
    return { ok: false, params: {} };
  if (scenario.matchBodyContains && !request.body.includes(scenario.matchBodyContains))
    return { ok: false, params: {} };
  if (scenario.matchJsonPath) {
    const actual = getJsonPathValue(request.bodyJson, scenario.matchJsonPath);
    if (scenario.matchJsonEquals) {
      const expected = parseJsonSafe(scenario.matchJsonEquals) ?? scenario.matchJsonEquals;
      if (JSON.stringify(actual) !== JSON.stringify(expected)) return { ok: false, params: {} };
    } else if (actual === undefined) {
      return { ok: false, params: {} };
    }
  }
  return { ok: true, params: pathMatch.params };
}

function responseHeaders(headers) {
  const output = {};
  for (const item of headers || []) {
    const key = String(item?.key || "").trim();
    if (key) output[key] = String(item?.value ?? "");
  }
  if (!Object.keys(output).some((key) => key.toLowerCase() === "content-type")) {
    output["content-type"] = "application/json";
  }
  return output;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function pushRequestLog(entry) {
  if (!runtime) return;
  runtime.requestLog = [entry, ...(runtime.requestLog || [])].slice(0, 80);
}

function createHandler(config) {
  return async (req, res) => {
    const started = Date.now();
    const method = String(req.method || "GET").toUpperCase();
    const parsed = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
        "access-control-allow-headers": "*",
        "access-control-max-age": "3600",
      });
      res.end();
      return;
    }

    const body = await readBody(req);
    const request = {
      method,
      pathname: parsed.pathname,
      url: parsed,
      headers: req.headers,
      body,
      bodyJson: parseJsonSafe(body),
    };
    let matchedParams = {};
    const scenario = config.scenarios.find((item) => {
      const result = scenarioMatches(item, request);
      if (result.ok) matchedParams = result.params;
      return result.ok;
    });

    if (!scenario) {
      const responseBody = JSON.stringify(
        {
          error: "No REST mock scenario matched",
          method,
          path: parsed.pathname,
          query: Object.fromEntries(parsed.searchParams.entries()),
          scenarios: config.scenarios.filter((item) => item.enabled).length,
        },
        null,
        2,
      );
      const durationMs = Date.now() - started;
      pushRequestLog({
        id: randomId(),
        method,
        path: parsed.pathname,
        status: 404,
        matched: false,
        durationMs,
        timestamp: new Date().toISOString(),
      });
      res.writeHead(404, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "x-layang-rest-mock": "miss",
      });
      res.end(responseBody);
      return;
    }

    const write = () => {
      const durationMs = Date.now() - started;
      pushRequestLog({
        id: randomId(),
        method,
        path: parsed.pathname,
        status: scenario.status,
        scenarioId: scenario.id,
        matched: true,
        durationMs,
        timestamp: new Date().toISOString(),
      });
      res.writeHead(scenario.status, {
        ...responseHeaders(scenario.headers),
        "access-control-allow-origin": "*",
        "x-layang-rest-mock": scenario.id,
        "x-layang-rest-mock-duration-ms": String(durationMs),
      });
      if (method === "HEAD") res.end();
      else res.end(renderTemplate(scenario.body, { request, pathParams: matchedParams }));
    };

    if (scenario.delayMs > 0) setTimeout(write, scenario.delayMs);
    else write();
  };
}

function renderTemplate(text, context = {}) {
  return String(text)
    .replaceAll("{{now}}", new Date().toISOString())
    .replaceAll("{{timestamp}}", String(Date.now()))
    .replaceAll("{{uuid}}", randomId())
    .replace(/{{request\.path\.([\w.-]+)}}/g, (_match, key) => context.pathParams?.[key] ?? "")
    .replace(/{{request\.query\.([\w.-]+)}}/g, (_match, key) => context.request?.url?.searchParams?.get(key) ?? "")
    .replace(/{{request\.header\.([\w.-]+)}}/g, (_match, key) => getHeader(context.request?.headers ?? {}, key))
    .replace(/{{request\.bodyJson\.([\w.[\]-]+)}}/g, (_match, path) => {
      const value = getJsonPathValue(context.request?.bodyJson, path);
      if (value === undefined || value === null) return "";
      return typeof value === "string" ? value : JSON.stringify(value);
    });
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
    server.listen(config.port, config.bindHost, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const startedAt = new Date().toISOString();
  runtime = { server, config, startedAt, requestLog: [] };
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
  return status("REST mock config updated.");
}

async function stopRestMockServer() {
  if (!runtime) return { running: false, message: "REST mock server already stopped." };
  const server = runtime.server;
  runtime = null;
  await new Promise((resolve) => server.close(() => resolve()));
  return { running: false, message: "REST mock server stopped." };
}

function status(message) {
  if (!runtime) return { running: false, message: message || "REST mock server stopped." };
  return {
    running: true,
    port: runtime.config.port,
    bindHost: runtime.config.bindHost,
    url: `http://${runtime.config.bindHost}:${runtime.config.port}`,
    scenarioCount: runtime.config.scenarios.length,
    requestCount: runtime.requestLog?.length ?? 0,
    requestLog: runtime.requestLog ?? [],
    message,
    startedAt: runtime.startedAt,
    updatedAt: new Date().toISOString(),
  };
}

function getRestMockServerStatus() {
  return status();
}

module.exports = {
  startRestMockServer,
  updateRestMockServer,
  stopRestMockServer,
  getRestMockServerStatus,
  // Exported for focused unit tests and local debugging.
  _internals: { normalizeConfig, scenarioMatches, renderTemplate, getJsonPathValue },
};
