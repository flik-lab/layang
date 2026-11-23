"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const net = require("node:net");

const restMock = require("../electron/services/rest-mock-server.cjs");
const wsMock = require("../electron/services/ws-mock-server.cjs");
const grpcMock = require("../electron/services/grpc-mock-server.cjs");
const mockRuntime = require("../lib/mock-runtime.cjs");
const { createCliMockController } = require("../lib/cli-mock.cjs");
const { createRuntimeCore } = require("../lib/runtime/runtime-core.cjs");
const { createMockRuntime } = require("../lib/runtime/mock/mock-runtime.cjs");

let portSeed = 23400 + Math.floor(Math.random() * 2000);
function nextPort() {
  portSeed += 1;
  return portSeed;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Raw HTTP request so tests can control Host and send malformed paths verbatim. */
function rawHttp(port, { method = "GET", path = "/", headers = {}, body = "" } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let data = Buffer.alloc(0);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Timed out waiting for HTTP response"));
    }, 3000);
    socket.on("connect", () => {
      const allHeaders = { Host: `127.0.0.1:${port}`, Connection: "close", ...headers };
      const keys = Object.keys(allHeaders).map((key) => key.toLowerCase());
      if (body && !keys.includes("content-length") && !keys.includes("transfer-encoding")) {
        allHeaders["Content-Length"] = Buffer.byteLength(body);
      }
      const head = [`${method} ${path} HTTP/1.1`, ...Object.entries(allHeaders).map(([k, v]) => `${k}: ${v}`), "", ""].join("\r\n");
      socket.write(head + body);
    });
    socket.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
    });
    const done = () => {
      clearTimeout(timer);
      const text = data.toString("utf8");
      const headerEnd = text.indexOf("\r\n\r\n");
      if (headerEnd === -1) return reject(new Error(`Incomplete HTTP response: ${JSON.stringify(text)}`));
      const [statusLine, ...headerLines] = text.slice(0, headerEnd).split("\r\n");
      const responseHeaders = {};
      for (const line of headerLines) {
        const index = line.indexOf(":");
        responseHeaders[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
      }
      let responseBody = text.slice(headerEnd + 4);
      if (/chunked/i.test(responseHeaders["transfer-encoding"] || "")) {
        let out = "";
        let rest = responseBody;
        while (rest) {
          const lineEnd = rest.indexOf("\r\n");
          const size = parseInt(rest.slice(0, lineEnd), 16);
          if (!size) break;
          out += rest.slice(lineEnd + 2, lineEnd + 2 + size);
          rest = rest.slice(lineEnd + 2 + size + 2);
        }
        responseBody = out;
      }
      resolve({ status: Number(statusLine.split(" ")[1]), headers: responseHeaders, body: responseBody });
    };
    socket.on("end", done);
    socket.on("error", (error) => {
      if (data.length) done();
      else {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

function wsHandshake(port, path, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let buffer = Buffer.alloc(0);
    let handshake = null;
    const messages = [];
    const waiters = [];
    const closeFrames = [];
    const flush = () => {
      while (messages.length && waiters.length) waiters.shift()(messages.shift());
    };
    const parse = () => {
      while (buffer.length >= 2) {
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        }
        if (buffer.length < offset + length) return;
        const opcode = buffer[0] & 0x0f;
        const payload = buffer.subarray(offset, offset + length);
        buffer = buffer.subarray(offset + length);
        if (opcode === 0x1) messages.push(payload.toString("utf8"));
        if (opcode === 0x8) closeFrames.push(payload.length >= 2 ? payload.readUInt16BE(0) : 0);
      }
      flush();
    };
    socket.on("connect", () => {
      const headers = {
        Host: `127.0.0.1:${port}`,
        Upgrade: "websocket",
        Connection: "Upgrade",
        "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
        "Sec-WebSocket-Version": "13",
        ...extraHeaders,
      };
      socket.write([`GET ${path} HTTP/1.1`, ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), "", ""].join("\r\n"));
    });
    socket.on("error", (error) => {
      if (!handshake) reject(error);
    });
    socket.on("close", () => {
      if (!handshake) reject(new Error("closed before handshake"));
    });
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshake) {
        const end = buffer.indexOf("\r\n\r\n");
        if (end === -1) return;
        const statusLine = buffer.subarray(0, end).toString("utf8").split("\r\n")[0];
        buffer = buffer.subarray(end + 4);
        handshake = { status: Number(statusLine.split(" ")[1]) };
        resolve({
          status: handshake.status,
          socket,
          closeFrames,
          send(text) {
            const payload = Buffer.from(text);
            const mask = crypto.randomBytes(4);
            const header = payload.length < 126 ? Buffer.from([0x81, 0x80 | payload.length]) : null;
            const masked = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
            socket.write(Buffer.concat([header, mask, masked]));
          },
          next(timeoutMs = 500) {
            if (messages.length) return Promise.resolve(messages.shift());
            return new Promise((res, rej) => {
              const timer = setTimeout(() => rej(new Error("Timed out waiting for WebSocket message.")), timeoutMs);
              waiters.push((value) => {
                clearTimeout(timer);
                res(value);
              });
            });
          },
          close() {
            socket.destroy();
          },
        });
      }
      parse();
    });
  });
}

// ---------------------------------------------------------------------------
// 1. WebSocket live update must see new paths
// ---------------------------------------------------------------------------
test("websocket upgrade uses the live config so updated paths are reachable", async (t) => {
  await wsMock.stopWebSocketMockServer();
  const port = nextPort();
  await wsMock.startWebSocketMockServer({ port, scenarios: [{ id: "a", path: "/a", responseText: "{}" }] });
  t.after(() => wsMock.stopWebSocketMockServer());
  wsMock.updateWebSocketMockServer({
    port,
    scenarios: [
      { id: "a", path: "/a", responseText: "{}" },
      { id: "b", path: "/b", responseText: "{}" },
    ],
  });
  const client = await wsHandshake(port, "/b");
  t.after(() => client.close());
  assert.equal(client.status, 101);
  const removed = await wsHandshake(port, "/gone").catch(() => ({ status: 404 }));
  assert.equal(removed.status, 404);
  removed.close?.();
});

// ---------------------------------------------------------------------------
// 2. REST malformed percent-encoding and handler errors
// ---------------------------------------------------------------------------
test("REST mock answers 400 for malformed percent-encoding instead of hanging", async (t) => {
  await restMock.stopRestMockServer();
  const port = nextPort();
  await restMock.startRestMockServer({ port, scenarios: [{ id: "item", method: "GET", path: "/items/:id", body: "{}" }] });
  t.after(() => restMock.stopRestMockServer());
  const response = await rawHttp(port, { path: "/items/%E0%A4%A" });
  assert.equal(response.status, 400);
  assert.match(response.body, /Malformed URL encoding/);
  const ok = await rawHttp(port, { path: "/items/a%20b" });
  assert.equal(ok.status, 200);
});

test("REST mock request handler turns unexpected errors into 500 JSON", async (t) => {
  const originalError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalError;
  });
  const server = http.createServer(
    restMock._internals.createHandler({ bindHost: "127.0.0.1", maxBodyBytes: 1024, scenarios: null }),
  );
  const port = nextPort();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await rawHttp(port, { path: "/anything" });
  assert.equal(response.status, 500);
  assert.equal(JSON.parse(response.body).error, "REST mock internal error");
});

// ---------------------------------------------------------------------------
// 3. REST scenario disabled during delay
// ---------------------------------------------------------------------------
test("REST mock responds 503 when the scenario is disabled during its delay", async (t) => {
  await restMock.stopRestMockServer();
  const port = nextPort();
  const scenario = { id: "slow", method: "GET", path: "/slow", body: "{}", delayMs: 150 };
  await restMock.startRestMockServer({ port, scenarios: [scenario] });
  t.after(() => restMock.stopRestMockServer());
  const pending = rawHttp(port, { path: "/slow" });
  await delay(30);
  await restMock.updateRestMockServer({ port, scenarios: [{ ...scenario, enabled: false }] });
  const response = await pending;
  assert.equal(response.status, 503);
  assert.match(JSON.parse(response.body).error, /disabled/);
});

// ---------------------------------------------------------------------------
// 4. gRPC native never serves inactive scenarios
// ---------------------------------------------------------------------------
test("gRPC runtimes do not fall back to an inactive scenario", () => {
  const method = { serviceName: "demo.Svc", methodName: "Get" };
  const scenarios = [
    { id: "off-1", service: "demo.Svc", method: "Get", active: false, priority: 5, input: {}, output: {} },
    { id: "off-2", service: "demo.Svc", method: "Get", active: false, priority: 1, input: {}, output: {} },
  ];
  assert.deepEqual(mockRuntime.getActiveRuntimeScenariosForMethod(method, scenarios, {}, {}), []);
  assert.deepEqual(grpcMock._internals.getActiveRuntimeScenariosForMethod(method, { scenarioIndex: scenarios }), []);
  const runtime = grpcMock._internals.rebuildRuntimeScenarioIndexes({ scenarioIndex: scenarios, activeScenarioIds: {}, enabledMethods: {} });
  assert.deepEqual(runtime.activeScenariosByMethod.get("demo.Svc/Get"), []);
  const withActive = [...scenarios, { id: "on", service: "demo.Svc", method: "Get", priority: 0, input: {}, output: {} }];
  assert.deepEqual(
    mockRuntime.getActiveRuntimeScenariosForMethod(method, withActive, {}, {}).map((item) => item.id),
    ["on"],
  );
});

// ---------------------------------------------------------------------------
// 5. WebSocket maxLoops semantics equal gRPC for every automatic source
// ---------------------------------------------------------------------------
test("websocket loop budget helper matches gRPC semantics", () => {
  const can = wsMock._internals.canSendWebSocketStreamMessage;
  assert.equal(can({ loop: false, maxLoops: 3 }, 1, 2), true);
  assert.equal(can({ loop: false, maxLoops: 3 }, 2, 2), false);
  assert.equal(can({ loop: true, maxLoops: 0 }, 10_000, 2), true);
  assert.equal(can({ loop: true, maxLoops: 1 }, 3, 2), true);
  assert.equal(can({ loop: true, maxLoops: 1 }, 4, 2), false);
  assert.equal(can({ loop: true, maxLoops: 3 }, 7, 2), true);
  assert.equal(can({ loop: true, maxLoops: 3 }, 8, 2), false);
});

test("websocket incoming replies use maxLoops as restarts after the first pass", async (t) => {
  await wsMock.stopWebSocketMockServer();
  const port = nextPort();
  await wsMock.startWebSocketMockServer({
    port,
    scenarios: [
      { id: "reply", path: "/r", responseText: JSON.stringify(["a", "b"]), sendOnMessage: true, loop: true, maxLoops: 1 },
    ],
  });
  t.after(() => wsMock.stopWebSocketMockServer());
  const client = await wsHandshake(port, "/r");
  t.after(() => client.close());
  const received = [];
  for (let index = 0; index < 5; index += 1) {
    client.send("ping");
    received.push(await client.next(150).catch(() => null));
  }
  assert.deepEqual(received, ["a", "b", "a", "b", null]);
});

test("websocket incoming replies with loop=false play the sequence once", async (t) => {
  await wsMock.stopWebSocketMockServer();
  const port = nextPort();
  await wsMock.startWebSocketMockServer({
    port,
    scenarios: [{ id: "once", path: "/o", responseText: JSON.stringify(["a", "b"]), sendOnMessage: true, loop: false, maxLoops: 5 }],
  });
  t.after(() => wsMock.stopWebSocketMockServer());
  const client = await wsHandshake(port, "/o");
  t.after(() => client.close());
  const received = [];
  for (let index = 0; index < 3; index += 1) {
    client.send("ping");
    received.push(await client.next(150).catch(() => null));
  }
  assert.deepEqual(received, ["a", "b", null]);
});

// ---------------------------------------------------------------------------
// 6. CLI reload keeps old servers when the new config fails
// ---------------------------------------------------------------------------
function fakeCoreFactory(events, { failStartFor } = {}) {
  return () => {
    const state = { grpc: { running: false }, rest: { running: false }, websocket: { running: false } };
    const create = (protocol) => ({
      start: async (payload) => {
        if (failStartFor?.(protocol, payload)) throw new Error(`start failed: ${protocol}`);
        events.push(`start:${protocol}:${payload?.tag ?? ""}`);
        state[protocol] = { running: true, tag: payload?.tag };
        return state[protocol];
      },
      update: async () => state[protocol],
      stop: async () => {
        events.push(`stop:${protocol}`);
        state[protocol] = { running: false };
        return state[protocol];
      },
      status: () => state[protocol],
      ...(protocol === "websocket" ? { send: async () => ({ sent: true }) } : {}),
    });
    const services = { grpc: create("grpc"), rest: create("rest"), websocket: create("websocket") };
    const core = createRuntimeCore({ mockRuntime: createMockRuntime({ services }), statusMetadata: { host: "cli" } });
    const dispose = core.dispose?.bind(core);
    core.dispose = async () => {
      events.push("dispose");
      await dispose?.();
    };
    return core;
  };
}

test("CLI mock reload validates the new config before stopping running servers", async () => {
  const events = [];
  const buildPlan = async (workspace) => {
    if (workspace.broken) throw new Error("bad workspace");
    return [{ type: "mock.rest.start", payload: { tag: workspace.tag } }];
  };
  const controller = createCliMockController({ selected: "rest", createCore: fakeCoreFactory(events), buildPlan });
  await controller.start({ tag: "v1" });
  assert.deepEqual(events, ["start:rest:v1"]);
  const failed = await controller.reload(async () => ({ broken: true }));
  assert.equal(failed.ok, false);
  assert.equal(failed.restored, true);
  assert.deepEqual(events, ["start:rest:v1"], "nothing may be stopped when loading fails");
  assert.equal((await controller.invoke("mock.rest.status")).tag, "v1");
  const loadFailure = await controller.reload(async () => {
    throw new Error("unreadable");
  });
  assert.equal(loadFailure.ok, false);
  assert.equal((await controller.invoke("mock.rest.status")).running, true);
  const ok = await controller.reload(async () => ({ tag: "v2" }));
  assert.equal(ok.ok, true);
  assert.equal((await controller.invoke("mock.rest.status")).tag, "v2");
  await controller.stop();
});

test("CLI mock reload restores the previous config when new servers fail to start", async () => {
  const events = [];
  const buildPlan = async (workspace) => [{ type: "mock.rest.start", payload: { tag: workspace.tag } }];
  const controller = createCliMockController({
    selected: "rest",
    createCore: fakeCoreFactory(events, { failStartFor: (_protocol, payload) => payload?.tag === "bad-port" }),
    buildPlan,
  });
  await controller.start({ tag: "v1" });
  const result = await controller.reload(async () => ({ tag: "bad-port" }));
  assert.equal(result.ok, false);
  assert.equal(result.restored, true);
  assert.equal((await controller.invoke("mock.rest.status")).tag, "v1");
  await controller.stop();
});

// ---------------------------------------------------------------------------
// 7. Small REST/WS hardening items
// ---------------------------------------------------------------------------
test("REST mock rejects oversized bodies with 413", async (t) => {
  await restMock.stopRestMockServer();
  const port = nextPort();
  await restMock.startRestMockServer({ port, maxBodyBytes: 1024, scenarios: [{ id: "p", method: "POST", path: "/p", body: "{}" }] });
  t.after(() => restMock.stopRestMockServer());
  assert.equal(restMock._internals.normalizeConfig({}).maxBodyBytes, 10 * 1024 * 1024);
  // Declared length over the cap is rejected before reading.
  const declared = await rawHttp(port, { method: "POST", path: "/p", headers: { "Content-Length": 5000 }, body: "x".repeat(10) });
  assert.equal(declared.status, 413);
  // Chunked body crossing the cap mid-stream is rejected too.
  const chunk = "x".repeat(800);
  const chunked = await rawHttp(port, {
    method: "POST",
    path: "/p",
    headers: { "Transfer-Encoding": "chunked" },
    body: `${(800).toString(16)}\r\n${chunk}\r\n${(800).toString(16)}\r\n${chunk}\r\n0\r\n\r\n`,
  });
  assert.equal(chunked.status, 413);
  const small = await rawHttp(port, { method: "POST", path: "/p", body: "{}" });
  assert.equal(small.status, 200);
});

test("REST mock requestCount is monotonic beyond the log window", async (t) => {
  await restMock.stopRestMockServer();
  const port = nextPort();
  await restMock.startRestMockServer({ port, scenarios: [{ id: "c", method: "GET", path: "/c", body: "{}" }] });
  t.after(() => restMock.stopRestMockServer());
  for (let index = 0; index < 85; index += 1) await rawHttp(port, { path: "/c" });
  const status = restMock.getRestMockServerStatus();
  assert.equal(status.requestLog.length, 80);
  assert.equal(status.requestCount, 85);
});

test("REST template renders a fresh uuid per occurrence and JSON-escapes values in strings", () => {
  const { renderTemplate } = restMock._internals;
  const ids = JSON.parse(renderTemplate('{"a":"{{uuid}}","b":"{{uuid}}"}', { json: true }));
  assert.notEqual(ids.a, ids.b);
  const request = {
    url: new URL('http://localhost/x?name=a"b\\c%0Ad&n=5'),
    headers: {},
    bodyJson: { nested: { x: 1 } },
  };
  const body = renderTemplate(
    '{"name":"{{request.query.name}}","n":{{request.query.n}},"obj":{{request.bodyJson.nested}},"s":"{{request.bodyJson.nested}}"}',
    { request, json: true },
  );
  const parsed = JSON.parse(body);
  assert.equal(parsed.name, 'a"b\\c\nd');
  assert.equal(parsed.n, 5);
  assert.deepEqual(parsed.obj, { x: 1 });
  assert.equal(parsed.s, '{"x":1}');
  // Non-JSON bodies stay raw.
  assert.equal(renderTemplate("hi {{request.query.name}}", { request }), 'hi a"b\\c\nd');
  assert.equal(renderTemplate("keep {{unknown}}", {}), "keep {{unknown}}");
});

test("REST standby 504 timeout includes CORS headers", async (t) => {
  await restMock.stopRestMockServer();
  const port = nextPort();
  await restMock.startRestMockServer({
    port,
    scenarios: [{ id: "s", method: "GET", path: "/s", body: "{}", execution: { mode: "standby", timeoutMs: 50 } }],
  });
  t.after(() => restMock.stopRestMockServer());
  const response = await rawHttp(port, { path: "/s" });
  assert.equal(response.status, 504);
  assert.equal(response.headers["access-control-allow-origin"], "*");
});

test("websocket mock closes with 1009 when a frame exceeds the payload cap", async (t) => {
  await wsMock.stopWebSocketMockServer();
  const port = nextPort();
  await wsMock.startWebSocketMockServer({ port, scenarios: [{ id: "big", path: "/big", responseText: "{}", sendOnMessage: true }] });
  t.after(() => wsMock.stopWebSocketMockServer());
  const client = await wsHandshake(port, "/big");
  t.after(() => client.close());
  const header = Buffer.alloc(14);
  header[0] = 0x81;
  header[1] = 0x80 | 127;
  header.writeUInt32BE(0, 2);
  header.writeUInt32BE(wsMock._internals.MAX_WS_FRAME_PAYLOAD_BYTES + 1, 6);
  client.socket.write(header);
  await new Promise((resolve) => client.socket.once("close", resolve));
  assert.deepEqual(client.closeFrames, [1009]);
});

test("websocket frame parser unmasks payloads across split chunks", async (t) => {
  await wsMock.stopWebSocketMockServer();
  const port = nextPort();
  await wsMock.startWebSocketMockServer({ port, scenarios: [{ id: "echo", path: "/e", responseText: '"{{incoming}}"', sendOnMessage: true }] });
  t.after(() => wsMock.stopWebSocketMockServer());
  const client = await wsHandshake(port, "/e");
  t.after(() => client.close());
  const payload = Buffer.from("x".repeat(60_000));
  const mask = crypto.randomBytes(4);
  const header = Buffer.alloc(8);
  header[0] = 0x81;
  header[1] = 0x80 | 126;
  header.writeUInt16BE(payload.length, 2);
  mask.copy(header, 4);
  const masked = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
  const frame = Buffer.concat([header, masked]);
  for (let offset = 0; offset < frame.length; offset += 7000) {
    client.socket.write(frame.subarray(offset, offset + 7000));
    await delay(1);
  }
  const reply = await client.next(1000);
  assert.equal(reply.length, payload.length);
});

// ---------------------------------------------------------------------------
// 8. Cross-site protection
// ---------------------------------------------------------------------------
test("REST mock rejects non-loopback Host headers when bound to loopback", async (t) => {
  await restMock.stopRestMockServer();
  const port = nextPort();
  await restMock.startRestMockServer({ port, scenarios: [{ id: "h", method: "GET", path: "/h", body: "{}" }] });
  t.after(() => restMock.stopRestMockServer());
  // A browser page on a rebound DNS name (Sec-Fetch-Site / Origin present) is refused.
  assert.equal(
    (await rawHttp(port, { path: "/h", headers: { Host: `evil.example:${port}`, "Sec-Fetch-Site": "same-origin" } }))
      .status,
    403,
  );
  assert.equal(
    (await rawHttp(port, { path: "/h", headers: { Host: `evil.example:${port}`, Origin: "http://evil.example" } })).status,
    403,
  );
  // Tools and gateways that forward their own Host header (APISIX pass_host: pass) still work.
  assert.equal((await rawHttp(port, { path: "/h", headers: { Host: `api.internal.example:${port}` } })).status, 200);
  assert.equal((await rawHttp(port, { path: "/h", headers: { Host: `localhost:${port}` } })).status, 200);
  assert.equal((await rawHttp(port, { path: "/h", headers: { Host: `[::1]:${port}` } })).status, 200);
  const ok = await rawHttp(port, { path: "/h" });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers["access-control-allow-origin"], "*");
  assert.equal(restMock._internals.normalizeBindHost("::"), "127.0.0.1");
  assert.equal(restMock._internals.normalizeBindHost("0.0.0.0"), "127.0.0.1");
  assert.equal(restMock._internals.isAllowedHostHeader("evil.example", "192.168.1.10"), true);
});

test("websocket mock rejects cross-site origins and rebinding hosts", async (t) => {
  await wsMock.stopWebSocketMockServer();
  const port = nextPort();
  await wsMock.startWebSocketMockServer({ port, scenarios: [{ id: "o", path: "/o", responseText: "{}" }] });
  t.after(() => wsMock.stopWebSocketMockServer());
  const attempt = async (headers) => {
    const result = await wsHandshake(port, "/o", headers).catch(() => ({ status: 0 }));
    result.close?.();
    return result.status;
  };
  assert.equal(await attempt({ Origin: "https://evil.example" }), 403);
  assert.equal(await attempt({ Host: `evil.example:${port}` }), 403);
  assert.equal(await attempt({}), 101);
  assert.equal(await attempt({ Origin: "null" }), 101);
  assert.equal(await attempt({ Origin: "file://" }), 101);
  assert.equal(await attempt({ Origin: "http://localhost:12999" }), 101);
  assert.equal(await attempt({ Origin: "http://127.0.0.1:3000" }), 101);
  assert.equal(await attempt({ Origin: "http://[::1]:3000" }), 101);
});
