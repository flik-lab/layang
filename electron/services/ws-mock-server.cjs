"use strict";

const crypto = require("node:crypto");
const http = require("node:http");

let activeWsMockServer = null;

/**
 * Starts a lightweight WebSocket mock server with one-shot and periodic stream behavior.
 * The mock behaves as a listener: client messages are captured but are not echoed.
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
  };

  server.on("upgrade", (request, socket) => {
    if (normalizeWebSocketMockPath(request.url || "/") !== config.path) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const key = String(request.headers["sec-websocket-key"] || "");
    if (!key) {
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
      lastIncoming: "",
      closed: false,
    };
    clients.add(client);
    socket.on("data", (chunk) => handleWebSocketMockData(state, client, chunk));
    socket.on("close", () => cleanupWebSocketMockClient(state, client));
    socket.on("error", () => cleanupWebSocketMockClient(state, client));

    if (state.config.streamOnConnect) startWebSocketMockPeriodicStream(state, client);
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
  activeWsMockServer = state;
  return getWebSocketMockStatus();
}

async function stopWebSocketMockServer() {
  const active = activeWsMockServer;
  if (!active) return;
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
  for (const client of activeWsMockServer.clients) {
    if (activeWsMockServer.config.streamOnConnect && !client.timer)
      startWebSocketMockPeriodicStream(activeWsMockServer, client);
    if (!activeWsMockServer.config.streamOnConnect && client.timer) {
      clearTimeout(client.timer);
      client.timer = null;
    }
  }
  return getWebSocketMockStatus();
}

function sendWebSocketMockMessage(payload) {
  if (!activeWsMockServer) throw new Error("Start the WebSocket mock server before sending a message.");
  if (payload && Object.hasOwn(payload, "responseText")) {
    activeWsMockServer.config = normalizeWebSocketMockConfig(payload, activeWsMockServer.config);
  }
  let sent = 0;
  for (const client of activeWsMockServer.clients) {
    if (sendWebSocketMockResponse(activeWsMockServer, client, "manual")) sent += 1;
  }
  activeWsMockServer.updatedAt = new Date().toISOString();
  return { ...getWebSocketMockStatus(), sent };
}

function getWebSocketMockStatus() {
  if (!activeWsMockServer) return { running: false };
  return {
    running: true,
    port: activeWsMockServer.port,
    path: activeWsMockServer.config.path,
    url: `ws://127.0.0.1:${activeWsMockServer.port}${activeWsMockServer.config.path}`,
    clientCount: activeWsMockServer.clients.size,
    messageCount: activeWsMockServer.messageCount,
    intervalMs: activeWsMockServer.config.intervalMs,
    loop: activeWsMockServer.config.loop,
    maxLoops: activeWsMockServer.config.maxLoops,
    streamOnConnect: activeWsMockServer.config.streamOnConnect,
    sendOnMessage: activeWsMockServer.config.sendOnMessage,
    startedAt: activeWsMockServer.startedAt,
    updatedAt: activeWsMockServer.updatedAt,
  };
}

function normalizeWebSocketMockConfig(payload, fallback) {
  const base = fallback || {};
  const rawPort = payload.port !== undefined ? payload.port : base.port;
  const rawPath = payload.path !== undefined ? payload.path : base.path;
  const rawInterval = payload.intervalMs !== undefined ? payload.intervalMs : base.intervalMs;
  const rawMaxLoops = payload.maxLoops !== undefined ? payload.maxLoops : base.maxLoops;
  const responseText =
    payload.responseText !== undefined
      ? String(payload.responseText || "")
      : typeof base.responseText === "string"
        ? base.responseText
        : '[\n  {\n    "type": "message",\n    "message": "Hello from mock WebSocket",\n    "count": "{{count}}",\n    "timestamp": "{{now}}"\n  }\n]';
  return {
    port: normalizeWebSocketMockPort(rawPort || 8090),
    path: normalizeWebSocketMockPath(rawPath || "/mock/ws"),
    responseText,
    intervalMs: normalizeDelayMs(rawInterval !== undefined ? rawInterval : 1000),
    loop: Object.hasOwn(payload, "loop") ? Boolean(payload.loop) : Boolean(base.loop),
    maxLoops: Math.max(0, Math.floor(Number(rawMaxLoops ?? 0) || 0)),
    streamOnConnect: Object.hasOwn(payload, "streamOnConnect")
      ? Boolean(payload.streamOnConnect)
      : Boolean(base.streamOnConnect),
    sendOnMessage: Object.hasOwn(payload, "sendOnMessage")
      ? Boolean(payload.sendOnMessage)
      : Boolean(base.sendOnMessage),
  };
}

function normalizeWebSocketMockPort(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return 8090;
  return Math.max(1, Math.min(65535, numeric));
}

function normalizeWebSocketMockPath(value) {
  const clean =
    String(value || "/mock/ws")
      .split(/[?#]/)[0]
      .trim() || "/mock/ws";
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function cleanupWebSocketMockClient(state, client) {
  if (client.closed) return;
  client.closed = true;
  if (client.timer) clearTimeout(client.timer);
  client.timer = null;
  state.clients.delete(client);
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

function startWebSocketMockPeriodicStream(state, client) {
  if (client.closed || client.timer) return;
  const tick = () => {
    if (client.closed) return;
    const maxLoops = state.config.maxLoops;
    const sequenceLength = getWebSocketMockMessageSequence(state.config.responseText).length;
    if (maxLoops > 0 && client.sentCount >= maxLoops) {
      client.timer = null;
      return;
    }
    if (!state.config.loop && client.sentCount >= sequenceLength) {
      client.timer = null;
      return;
    }
    const sent = sendWebSocketMockResponse(state, client, "stream");
    if (
      sent &&
      state.config.streamOnConnect &&
      (state.config.loop || (maxLoops > 0 ? client.sentCount < maxLoops : client.sentCount < sequenceLength))
    ) {
      client.timer = setTimeout(tick, Math.max(1, state.config.intervalMs || 1000));
    } else {
      client.timer = null;
    }
  };
  client.timer = setTimeout(tick, Math.max(1, state.config.intervalMs || 1000));
}

function sendWebSocketMockResponse(state, client, source) {
  if (client.closed || client.socket.destroyed) return false;
  const payload = resolveWebSocketMockPayload(state, client, source);
  if (payload === null) return false;
  client.sentCount += 1;
  state.messageCount += 1;
  try {
    sendWebSocketFrame(client.socket, payload, 0x1);
    return true;
  } catch {
    cleanupWebSocketMockClient(state, client);
    return false;
  }
}

function resolveWebSocketMockPayload(state, client, source) {
  const messages = getWebSocketMockMessageSequence(state.config.responseText);
  if (!messages.length) return null;
  if (state.config.maxLoops > 0 && client.sentCount >= state.config.maxLoops) return null;
  if (!state.config.loop && client.sentCount >= messages.length) return null;
  const index = state.config.loop ? client.sentCount % messages.length : client.sentCount;
  return renderWebSocketMockTemplate(messages[index] ?? messages[messages.length - 1], {
    count: client.sentCount + 1,
    index: index + 1,
    source,
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
  return text
    .replaceAll('"{{count}}"', JSON.stringify(context.count))
    .replaceAll("{{count}}", String(context.count))
    .replaceAll('"{{index}}"', JSON.stringify(context.index))
    .replaceAll("{{index}}", String(context.index))
    .replaceAll("{{source}}", context.source || "mock")
    .replaceAll('"{{message}}"', JSON.stringify(""))
    .replaceAll("{{message}}", "")
    .replaceAll("{{now}}", now);
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
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(120_000, numeric);
}

module.exports = {
  startWebSocketMockServer,
  stopWebSocketMockServer,
  updateWebSocketMockServer,
  sendWebSocketMockMessage,
  getWebSocketMockStatus,
  normalizeWebSocketMockConfig,
  getWebSocketMockMessageSequence,
  renderWebSocketMockTemplate,
};
