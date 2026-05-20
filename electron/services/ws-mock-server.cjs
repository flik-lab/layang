"use strict";

const crypto = require("node:crypto");
const http = require("node:http");

let activeWsMockServer = null;

/**
 * Starts a lightweight WebSocket mock server with per-request scenarios.
 * One path can host many scenarios; incoming messages can select a scenario by matcher.
 */
async function startWebSocketMockServer(payload) {
  await stopWebSocketMockServer();
  const config = normalizeWebSocketMockConfig(payload || {});
  const server = http.createServer((_request, response) => {
    response.writeHead(426, { "content-type": "text/plain" });
    response.end("Upgrade to WebSocket is required for this mock endpoint.");
  });
  const clients = new Set();
  const state = {
    server,
    clients,
    config,
    port: config.port,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    logs: [],
  };
  appendWebSocketMockLog(state, "server", `Server starting with ${config.scenarios.length} scenario(s).`);

  server.on("upgrade", (request, socket) => {
    const requestPath = normalizeWebSocketMockPath(request.url || "/");
    const scenario = findWebSocketMockScenario(config, requestPath, { preferPeriodic: true });
    if (!scenario) {
      appendWebSocketMockLog(state, "error", `Rejected connection for unknown path ${requestPath}.`, {
        path: requestPath,
      });
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const key = String(request.headers["sec-websocket-key"] || "");
    if (!key) {
      appendWebSocketMockLog(state, "error", `Rejected connection for ${requestPath}: missing sec-websocket-key.`, {
        path: requestPath,
      });
      socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    const protocols = String(request.headers["sec-websocket-protocol"] || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const responseHeaders = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
    ];
    if (protocols[0]) responseHeaders.push(`Sec-WebSocket-Protocol: ${protocols[0]}`);
    socket.write(`${responseHeaders.join("\r\n")}\r\n\r\n`);

    const client = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      socket,
      buffer: Buffer.alloc(0),
      timer: null,
      sentCount: 0,
      sentByScenario: new Map(),
      manualSentByScenario: new Map(),
      lastIncoming: "",
      closed: false,
      path: requestPath,
      scenarioId: scenario.id,
    };
    clients.add(client);
    appendWebSocketMockLog(state, "connect", `Client connected to ${requestPath}.`, {
      path: requestPath,
      scenarioId: scenario.id,
      requestId: scenario.requestId,
    });
    socket.on("data", (chunk) => handleWebSocketMockData(state, client, chunk));
    socket.on("close", () => cleanupWebSocketMockClient(state, client));
    socket.on("error", () => cleanupWebSocketMockClient(state, client));

    if (scenario.streamOnConnect) startWebSocketMockPeriodicStream(state, client, scenario);
  });

  const boundPort = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address()?.port || config.port);
    });
  });
  state.port = boundPort;
  state.config.port = boundPort;
  appendWebSocketMockLog(state, "server", `Server running at ws://127.0.0.1:${boundPort}.`);
  activeWsMockServer = state;
  return getWebSocketMockStatus();
}

async function stopWebSocketMockServer() {
  const active = activeWsMockServer;
  if (!active) return;
  appendWebSocketMockLog(active, "server", "Server stopping.");
  activeWsMockServer = null;
  for (const client of active.clients || []) {
    cleanupWebSocketMockClient(active, client);
    try {
      sendWebSocketFrame(client.socket, "", 0x8);
      client.socket.end();
    } catch {
      try {
        client.socket.destroy();
      } catch {
        // Ignore close errors.
      }
    }
  }
  await new Promise((resolve) => {
    try {
      active.server.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

function updateWebSocketMockServer(payload) {
  if (!activeWsMockServer) return { running: false };
  activeWsMockServer.config = normalizeWebSocketMockConfig(payload || {}, activeWsMockServer.config);
  activeWsMockServer.updatedAt = new Date().toISOString();
  appendWebSocketMockLog(
    activeWsMockServer,
    "server",
    `Server config updated (${activeWsMockServer.config.scenarios.length} scenario(s)).`,
  );
  for (const client of activeWsMockServer.clients) {
    const scenario = getClientWebSocketMockScenario(activeWsMockServer, client);
    if (!scenario) {
      cleanupWebSocketMockClient(activeWsMockServer, client);
      try {
        sendWebSocketFrame(client.socket, "", 0x8);
        client.socket.end();
      } catch {
        // Ignore close errors.
      }
      continue;
    }
    if (scenario.streamOnConnect && !client.timer)
      startWebSocketMockPeriodicStream(activeWsMockServer, client, scenario);
    if (!scenario.streamOnConnect && client.timer) {
      clearTimeout(client.timer);
      client.timer = null;
      appendWebSocketMockLog(activeWsMockServer, "skip", `Periodic stopped for ${scenario.name}.`, {
        path: scenario.path,
        scenarioId: scenario.id,
        requestId: scenario.requestId,
      });
    }
  }
  return getWebSocketMockStatus();
}

function sendWebSocketMockMessage(payload) {
  if (!activeWsMockServer) throw new Error("Start the WebSocket mock server before sending a message.");
  if (payload && (Object.hasOwn(payload, "responseText") || Array.isArray(payload.scenarios))) {
    activeWsMockServer.config = normalizeWebSocketMockConfig(payload, activeWsMockServer.config);
  }
  const scenarioId = payload?.scenarioId ? String(payload.scenarioId) : "";
  const path = payload?.path ? normalizeWebSocketMockPath(payload.path) : "";
  let sent = 0;
  for (const client of activeWsMockServer.clients) {
    const scenario = scenarioId
      ? findScenarioById(activeWsMockServer.config, scenarioId)
      : getClientWebSocketMockScenario(activeWsMockServer, client);
    if (!scenario) continue;
    if (scenarioId && scenario.id !== scenarioId) continue;
    if (path && scenario.path !== path) continue;
    if (scenario.path !== client.path) continue;
    if (sendWebSocketMockResponse(activeWsMockServer, client, "manual", scenario)) sent += 1;
  }
  activeWsMockServer.updatedAt = new Date().toISOString();
  appendWebSocketMockLog(
    activeWsMockServer,
    sent ? "send" : "skip",
    sent ? `Manual send delivered to ${sent} client(s).` : "Manual send skipped: no connected client matched.",
    { scenarioId, path },
  );
  return { ...getWebSocketMockStatus(), sent };
}

function getWebSocketMockStatus() {
  if (!activeWsMockServer) return { running: false };
  const config = activeWsMockServer.config;
  const primaryScenario = config.scenarios[0];
  return {
    running: true,
    port: activeWsMockServer.port,
    path: primaryScenario?.path || config.path,
    url: `ws://127.0.0.1:${activeWsMockServer.port}${primaryScenario?.path || config.path}`,
    clientCount: activeWsMockServer.clients.size,
    messageCount: activeWsMockServer.messageCount,
    intervalMs: primaryScenario?.intervalMs ?? config.intervalMs,
    loop: primaryScenario?.loop ?? config.loop,
    maxLoops: primaryScenario?.maxLoops ?? config.maxLoops,
    streamOnConnect: primaryScenario?.streamOnConnect ?? config.streamOnConnect,
    sendOnMessage: primaryScenario?.sendOnMessage ?? config.sendOnMessage,
    scenarioCount: config.scenarios.length,
    requestPaths: config.scenarios.map((scenario) => ({
      id: scenario.id,
      requestId: scenario.requestId,
      name: scenario.name,
      path: scenario.path,
      enabled: scenario.enabled,
      url: `ws://127.0.0.1:${activeWsMockServer.port}${scenario.path}`,
    })),
    logs: activeWsMockServer.logs.slice(-80),
    startedAt: activeWsMockServer.startedAt,
    updatedAt: activeWsMockServer.updatedAt,
  };
}

function normalizeWebSocketMockConfig(payload, fallback) {
  const base = fallback || {};
  const rawPort = payload.port !== undefined ? payload.port : base.port;
  const fallbackScenario = buildFallbackWebSocketMockScenario(payload, base);
  const rawScenarios = Array.isArray(payload.scenarios)
    ? payload.scenarios
    : Array.isArray(base.scenarios)
      ? base.scenarios
      : [fallbackScenario];
  const scenarios = normalizeWebSocketMockScenarios(rawScenarios, fallbackScenario);
  const primaryScenario = scenarios[0] || fallbackScenario;
  return {
    port: normalizeWebSocketMockPort(rawPort || 8090),
    path: primaryScenario.path,
    responseText: primaryScenario.responseText,
    intervalMs: primaryScenario.intervalMs,
    loop: primaryScenario.loop,
    maxLoops: primaryScenario.maxLoops,
    streamOnConnect: primaryScenario.streamOnConnect,
    sendOnMessage: primaryScenario.sendOnMessage,
    scenarios,
  };
}

function normalizeWebSocketMockScenarios(input, fallbackScenario) {
  const fallback = fallbackScenario || buildFallbackWebSocketMockScenario({}, {});
  const scenarios = (Array.isArray(input) ? input : [])
    .filter((scenario) => Boolean(scenario && typeof scenario === "object"))
    .map((scenario, index) => normalizeWebSocketMockScenario(scenario, fallback, index))
    .filter((scenario) => scenario.path);
  return scenarios.length ? scenarios : [normalizeWebSocketMockScenario(fallback, fallback, 0)];
}

function normalizeWebSocketMockScenario(scenario, fallback, index) {
  const rawInterval = scenario.intervalMs !== undefined ? scenario.intervalMs : fallback.intervalMs;
  const rawMaxLoops = scenario.maxLoops !== undefined ? scenario.maxLoops : fallback.maxLoops;
  const responseText =
    scenario.responseText !== undefined
      ? String(scenario.responseText || "")
      : typeof fallback.responseText === "string"
        ? fallback.responseText
        : defaultWebSocketMockResponseText();
  return {
    id: typeof scenario.id === "string" && scenario.id ? scenario.id : fallback.id || `ws-scenario-${index + 1}`,
    requestId: typeof scenario.requestId === "string" && scenario.requestId ? scenario.requestId : fallback.requestId,
    name:
      typeof scenario.name === "string" && scenario.name.trim()
        ? scenario.name.trim()
        : fallback.name || `WebSocket scenario ${index + 1}`,
    enabled: scenario.enabled !== false,
    path: normalizeWebSocketMockPath(scenario.path !== undefined ? scenario.path : fallback.path || "/mock/ws"),
    responseText,
    intervalMs: normalizeDelayMs(rawInterval !== undefined ? rawInterval : 1000),
    loop: Object.hasOwn(scenario, "loop") ? Boolean(scenario.loop) : Boolean(fallback.loop),
    maxLoops: Math.max(0, Math.floor(Number(rawMaxLoops ?? 0) || 0)),
    streamOnConnect: Object.hasOwn(scenario, "streamOnConnect")
      ? Boolean(scenario.streamOnConnect)
      : Boolean(fallback.streamOnConnect),
    sendOnMessage: Object.hasOwn(scenario, "sendOnMessage")
      ? Boolean(scenario.sendOnMessage)
      : Boolean(fallback.sendOnMessage),
    matchMode: normalizeMatchMode(scenario.matchMode || fallback.matchMode),
    matchValue:
      typeof scenario.matchValue === "string"
        ? scenario.matchValue
        : typeof fallback.matchValue === "string"
          ? fallback.matchValue
          : "",
    matchJsonPath:
      typeof scenario.matchJsonPath === "string"
        ? scenario.matchJsonPath
        : typeof fallback.matchJsonPath === "string"
          ? fallback.matchJsonPath
          : "",
  };
}

function buildFallbackWebSocketMockScenario(payload, base) {
  const rawPath = payload.path !== undefined ? payload.path : base.path;
  const rawInterval = payload.intervalMs !== undefined ? payload.intervalMs : base.intervalMs;
  const rawMaxLoops = payload.maxLoops !== undefined ? payload.maxLoops : base.maxLoops;
  return {
    id: typeof payload.id === "string" && payload.id ? payload.id : typeof base.id === "string" ? base.id : "default",
    requestId: typeof payload.requestId === "string" && payload.requestId ? payload.requestId : base.requestId,
    name: typeof payload.name === "string" && payload.name ? payload.name : base.name || "Default WebSocket mock",
    enabled: payload.enabled !== false,
    path: normalizeWebSocketMockPath(rawPath || "/mock/ws"),
    responseText:
      payload.responseText !== undefined
        ? String(payload.responseText || "")
        : typeof base.responseText === "string"
          ? base.responseText
          : defaultWebSocketMockResponseText(),
    intervalMs: normalizeDelayMs(rawInterval !== undefined ? rawInterval : 1000),
    loop: Object.hasOwn(payload, "loop") ? Boolean(payload.loop) : Boolean(base.loop),
    maxLoops: Math.max(0, Math.floor(Number(rawMaxLoops ?? 0) || 0)),
    streamOnConnect: Object.hasOwn(payload, "streamOnConnect")
      ? Boolean(payload.streamOnConnect)
      : Boolean(base.streamOnConnect),
    sendOnMessage: Object.hasOwn(payload, "sendOnMessage")
      ? Boolean(payload.sendOnMessage)
      : Boolean(base.sendOnMessage),
    matchMode: normalizeMatchMode(payload.matchMode || base.matchMode),
    matchValue:
      typeof payload.matchValue === "string"
        ? payload.matchValue
        : typeof base.matchValue === "string"
          ? base.matchValue
          : "",
    matchJsonPath:
      typeof payload.matchJsonPath === "string"
        ? payload.matchJsonPath
        : typeof base.matchJsonPath === "string"
          ? base.matchJsonPath
          : "",
  };
}

function defaultWebSocketMockResponseText() {
  return '[\n  {\n    "type": "message",\n    "message": "Hello from mock WebSocket",\n    "count": "{{count}}",\n    "incomingMethod": "{{incoming.method}}",\n    "requestId": "{{uuid}}",\n    "timestamp": "{{now}}"\n  }\n]';
}

function normalizeWebSocketMockPort(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return 8090;
  return Math.max(1, Math.min(65535, numeric));
}

function normalizeWebSocketMockPath(value) {
  const clean =
    String(value || "/")
      .split(/[?#]/)[0]
      .trim() || "/";
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function normalizeMatchMode(value) {
  return value === "contains" || value === "regex" || value === "jsonPath" ? value : "always";
}

function findWebSocketMockScenario(config, requestPath, options = {}) {
  const path = normalizeWebSocketMockPath(requestPath || "/");
  const candidates = (config.scenarios || []).filter(
    (scenario) => scenario.enabled !== false && scenario.path === path,
  );
  if (!candidates.length) return null;
  if (options.preferPeriodic) return candidates.find((scenario) => scenario.streamOnConnect) || candidates[0];
  return candidates[0];
}

function findScenarioById(config, scenarioId) {
  return (config.scenarios || []).find((scenario) => scenario.enabled !== false && scenario.id === scenarioId) || null;
}

function findMatchingWebSocketMockScenario(config, requestPath, incoming) {
  const path = normalizeWebSocketMockPath(requestPath || "/");
  const candidates = (config.scenarios || []).filter(
    (scenario) => scenario.enabled !== false && scenario.path === path && scenario.sendOnMessage,
  );
  return candidates.find((scenario) => matchesWebSocketIncomingMessage(scenario, incoming)) || null;
}

function getClientWebSocketMockScenario(state, client) {
  return (
    (state.config.scenarios || []).find(
      (scenario) => scenario.enabled !== false && scenario.id === client.scenarioId,
    ) || findWebSocketMockScenario(state.config, client.path)
  );
}

function cleanupWebSocketMockClient(state, client) {
  if (client.closed) return;
  client.closed = true;
  if (client.timer) clearTimeout(client.timer);
  client.timer = null;
  state.clients.delete(client);
  appendWebSocketMockLog(state, "disconnect", `Client disconnected from ${client.path}.`, {
    path: client.path,
    scenarioId: client.scenarioId,
  });
}

function handleWebSocketMockData(state, client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);
  while (client.buffer.length >= 2) {
    const frame = readWebSocketFrame(client.buffer);
    if (!frame) break;
    client.buffer = client.buffer.subarray(frame.frameLength);
    if (frame.opcode === 0x8) {
      cleanupWebSocketMockClient(state, client);
      try {
        sendWebSocketFrame(client.socket, "", 0x8);
        client.socket.end();
      } catch {
        // Ignore close errors.
      }
      return;
    }
    if (frame.opcode === 0x9) {
      sendWebSocketFrame(client.socket, frame.payload, 0xa);
      continue;
    }
    if (frame.opcode !== 0x1) continue;
    client.lastIncoming = frame.payload.toString("utf8");
    appendWebSocketMockLog(state, "incoming", truncateLogMessage(client.lastIncoming), {
      path: client.path,
      scenarioId: client.scenarioId,
    });
    const scenario = findMatchingWebSocketMockScenario(state.config, client.path, client.lastIncoming);
    if (scenario) {
      client.scenarioId = scenario.id;
      appendWebSocketMockLog(state, "match", `Matched scenario ${scenario.name}.`, {
        path: client.path,
        scenarioId: scenario.id,
        requestId: scenario.requestId,
      });
      sendWebSocketMockResponse(state, client, "message", scenario);
    } else {
      appendWebSocketMockLog(state, "skip", `No incoming matcher matched ${client.path}.`, {
        path: client.path,
        scenarioId: client.scenarioId,
      });
    }
  }
}

function readWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;
  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = Boolean(second & 0x80);
  let length = second & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < offset + 2) return null;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null;
    const high = buffer.readUInt32BE(offset);
    const low = buffer.readUInt32BE(offset + 4);
    length = high * 2 ** 32 + low;
    offset += 8;
  }
  const maskOffset = offset;
  if (masked) offset += 4;
  if (buffer.length < offset + length) return null;
  let payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4);
    payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
  }
  return { opcode, payload, frameLength: offset + length };
}

function startWebSocketMockPeriodicStream(state, client, scenarioOverride) {
  if (client.closed || client.timer) return;
  const initialScenario = scenarioOverride || getClientWebSocketMockScenario(state, client);
  if (initialScenario) client.scenarioId = initialScenario.id;
  const tick = () => {
    if (client.closed) return;
    const scenario = getClientWebSocketMockScenario(state, client);
    if (!scenario) {
      client.timer = null;
      return;
    }
    const scenarioSentCount = getScenarioSentCount(client, scenario.id);
    const maxLoops = scenario.maxLoops;
    const sequenceLength = getWebSocketMockMessageSequence(scenario.responseText).length;
    if (maxLoops > 0 && scenarioSentCount >= maxLoops) {
      client.timer = null;
      appendWebSocketMockLog(state, "skip", `Periodic completed max loop for ${scenario.name}.`, {
        path: scenario.path,
        scenarioId: scenario.id,
        requestId: scenario.requestId,
      });
      return;
    }
    if (!scenario.loop && scenarioSentCount >= sequenceLength) {
      client.timer = null;
      appendWebSocketMockLog(state, "skip", `Periodic completed sequence for ${scenario.name}.`, {
        path: scenario.path,
        scenarioId: scenario.id,
        requestId: scenario.requestId,
      });
      return;
    }
    const sent = sendWebSocketMockResponse(state, client, "stream", scenario);
    const latestCount = getScenarioSentCount(client, scenario.id);
    if (
      sent &&
      scenario.streamOnConnect &&
      (scenario.loop || (maxLoops > 0 ? latestCount < maxLoops : latestCount < sequenceLength))
    ) {
      client.timer = setTimeout(tick, Math.max(1, scenario.intervalMs || 1000));
    } else {
      client.timer = null;
    }
  };
  const scenario = initialScenario || getClientWebSocketMockScenario(state, client);
  client.timer = setTimeout(tick, Math.max(1, scenario?.intervalMs || 1000));
}

function sendWebSocketMockResponse(state, client, source, scenarioOverride) {
  if (client.closed || client.socket.destroyed) return false;
  const scenario = scenarioOverride || getClientWebSocketMockScenario(state, client);
  const payload = resolveWebSocketMockPayload(state, client, source, scenario);
  if (payload === null) return false;
  if (source === "manual") incrementManualScenarioSentCount(client, scenario.id);
  else incrementScenarioSentCount(client, scenario.id);
  client.sentCount += 1;
  state.messageCount += 1;
  try {
    sendWebSocketFrame(client.socket, payload, 0x1);
    appendWebSocketMockLog(state, "send", `Sent ${source} message from ${scenario.name}.`, {
      path: client.path || scenario.path,
      scenarioId: scenario.id,
      requestId: scenario.requestId,
    });
    return true;
  } catch {
    appendWebSocketMockLog(state, "error", `Failed sending message from ${scenario.name}.`, {
      path: client.path || scenario.path,
      scenarioId: scenario.id,
      requestId: scenario.requestId,
    });
    cleanupWebSocketMockClient(state, client);
    return false;
  }
}

function resolveWebSocketMockPayload(state, client, source, scenarioOverride) {
  const scenario = scenarioOverride || getClientWebSocketMockScenario(state, client);
  if (!scenario) return null;
  const messages = getWebSocketMockMessageSequence(scenario.responseText);
  if (!messages.length) return null;
  const isManualSend = source === "manual";
  const sentCount = isManualSend
    ? getManualScenarioSentCount(client, scenario.id)
    : getScenarioSentCount(client, scenario.id);
  if (!isManualSend && scenario.maxLoops > 0 && sentCount >= scenario.maxLoops) return null;
  if (!isManualSend && !scenario.loop && sentCount >= messages.length) return null;
  const index = scenario.loop || isManualSend ? sentCount % messages.length : sentCount;
  return renderWebSocketMockTemplate(messages[index] ?? messages[messages.length - 1], {
    count: sentCount + 1,
    loopIndex: sentCount + 1,
    index: index + 1,
    source,
    message: client.lastIncoming || "",
    incoming: client.lastIncoming || "",
    path: client.path || scenario.path,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    requestId: scenario.requestId || "",
  });
}

function getWebSocketMockMessageSequence(responseText) {
  const raw = String(responseText || "").trim();
  if (!raw) return [""];
  const toPayload = (value) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length ? parsed.map(toPayload) : [""];
    return [toPayload(parsed)];
  } catch {
    const separated = raw
      .split(/\n\s*---\s*\n/g)
      .map((item) => item.trim())
      .filter(Boolean);
    return separated.length > 1 ? separated : [raw];
  }
}

function renderWebSocketMockTemplate(template, context) {
  const text = String(template || "");
  const now = new Date().toISOString();
  const timestamp = String(Date.now());
  const uuid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const incomingJson = parseJsonSafe(context.incoming || context.message || "");
  return text
    .replaceAll('"{{count}}"', JSON.stringify(context.count))
    .replaceAll("{{count}}", String(context.count))
    .replaceAll('"{{loopIndex}}"', JSON.stringify(context.loopIndex || context.count))
    .replaceAll("{{loopIndex}}", String(context.loopIndex || context.count))
    .replaceAll('"{{index}}"', JSON.stringify(context.index))
    .replaceAll("{{index}}", String(context.index))
    .replaceAll("{{source}}", context.source || "mock")
    .replaceAll('"{{message}}"', JSON.stringify(context.message || ""))
    .replaceAll("{{message}}", context.message || "")
    .replaceAll('"{{incoming}}"', JSON.stringify(context.incoming || ""))
    .replaceAll("{{incoming}}", context.incoming || "")
    .replace(/"\{\{incoming\.([^}]+)\}\}"/g, (_match, path) => JSON.stringify(readPath(incomingJson, path) ?? ""))
    .replace(/\{\{incoming\.([^}]+)\}\}/g, (_match, path) => stringifyTemplateValue(readPath(incomingJson, path) ?? ""))
    .replaceAll("{{path}}", context.path || "")
    .replaceAll("{{scenarioId}}", context.scenarioId || "")
    .replaceAll("{{scenarioName}}", context.scenarioName || "")
    .replaceAll("{{requestId}}", context.requestId || "")
    .replaceAll("{{uuid}}", uuid)
    .replaceAll("{{timestamp}}", timestamp)
    .replaceAll("{{now}}", now);
}

function matchesWebSocketIncomingMessage(scenario, incoming) {
  const mode = normalizeMatchMode(scenario.matchMode);
  const value = String(scenario.matchValue || "");
  if (mode === "always") return true;
  if (mode === "contains") return !value || String(incoming || "").includes(value);
  if (mode === "regex") {
    if (!value) return true;
    try {
      return new RegExp(value).test(String(incoming || ""));
    } catch {
      return false;
    }
  }
  if (mode === "jsonPath") {
    const parsed = parseJsonSafe(incoming);
    if (parsed === null) return false;
    const actual = readJsonPath(parsed, scenario.matchJsonPath || "$.method");
    if (value === "") return actual !== undefined;
    return compareTemplateValue(actual, value);
  }
  return true;
}

function readJsonPath(input, path) {
  return readPath(input, String(path || "").replace(/^\$\.?/, ""));
}

function readPath(input, path) {
  if (input === null || input === undefined) return undefined;
  const clean = String(path || "")
    .replace(/^\$\.?/, "")
    .trim();
  if (!clean) return input;
  const parts = clean.split(".").filter(Boolean);
  let current = input;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function compareTemplateValue(actual, expectedText) {
  if (actual === undefined) return false;
  const expected = String(expectedText);
  if (typeof actual === "string") return actual === expected;
  try {
    return JSON.stringify(actual) === expected || String(actual) === expected;
  } catch {
    return String(actual) === expected;
  }
}

function stringifyTemplateValue(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function parseJsonSafe(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function getScenarioSentCount(client, scenarioId) {
  return Number(client.sentByScenario?.get(scenarioId) || 0);
}

function incrementScenarioSentCount(client, scenarioId) {
  if (!client.sentByScenario) client.sentByScenario = new Map();
  client.sentByScenario.set(scenarioId, getScenarioSentCount(client, scenarioId) + 1);
}

function getManualScenarioSentCount(client, scenarioId) {
  return Number(client.manualSentByScenario?.get(scenarioId) || 0);
}

function incrementManualScenarioSentCount(client, scenarioId) {
  if (!client.manualSentByScenario) client.manualSentByScenario = new Map();
  client.manualSentByScenario.set(scenarioId, getManualScenarioSentCount(client, scenarioId) + 1);
}

function appendWebSocketMockLog(state, type, message, details = {}) {
  if (!state || !Array.isArray(state.logs)) return;
  state.logs.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    message: String(message || ""),
    scenarioId: details.scenarioId,
    requestId: details.requestId,
    path: details.path,
    timestamp: new Date().toISOString(),
  });
  if (state.logs.length > 200) state.logs.splice(0, state.logs.length - 200);
}

function truncateLogMessage(value, max = 180) {
  const text = String(value || "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function sendWebSocketFrame(socket, data, opcode = 0x1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data || ""));
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeUInt32BE(Math.floor(length / 2 ** 32), 2);
    header.writeUInt32BE(length >>> 0, 6);
  }
  header[0] = 0x80 | opcode;
  socket.write(Buffer.concat([header, payload]));
}

function normalizeDelayMs(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return 1000;
  return Math.min(120_000, numeric);
}

module.exports = {
  startWebSocketMockServer,
  stopWebSocketMockServer,
  updateWebSocketMockServer,
  sendWebSocketMockMessage,
  getWebSocketMockStatus,
  normalizeWebSocketMockConfig,
  normalizeWebSocketMockScenarios,
  getWebSocketMockMessageSequence,
  renderWebSocketMockTemplate,
  matchesWebSocketIncomingMessage,
};
