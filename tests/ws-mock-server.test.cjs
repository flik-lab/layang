"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const wsMock = require("../electron/services/ws-mock-server.cjs");

test("websocket mock normalizes scenario matchers", () => {
  const config = wsMock.normalizeWebSocketMockConfig({
    port: 8099,
    scenarios: [
      {
        id: "login",
        path: "ws",
        responseText: "{}",
        sendOnMessage: true,
        matchMode: "jsonPath",
        matchJsonPath: "$.method",
        matchValue: "login",
      },
    ],
  });
  assert.equal(config.port, 8099);
  assert.equal(config.scenarios[0].path, "/ws");
  assert.equal(config.scenarios[0].matchMode, "jsonPath");
});

test("websocket mock incoming matcher supports json path, contains, and regex", () => {
  assert.equal(
    wsMock.matchesWebSocketIncomingMessage(
      { matchMode: "jsonPath", matchJsonPath: "$.method", matchValue: "login" },
      JSON.stringify({ method: "login" }),
    ),
    true,
  );
  assert.equal(
    wsMock.matchesWebSocketIncomingMessage({ matchMode: "contains", matchValue: "ping" }, "client:ping"),
    true,
  );
  assert.equal(wsMock.matchesWebSocketIncomingMessage({ matchMode: "regex", matchValue: "^sub:" }, "sub:orders"), true);
  assert.equal(wsMock.matchesWebSocketIncomingMessage({ matchMode: "regex", matchValue: "[" }, "sub:orders"), false);
});

test("websocket mock template renders incoming fields and uuid", () => {
  const output = wsMock.renderWebSocketMockTemplate(
    JSON.stringify({ method: "{{incoming.method}}", count: "{{count}}", id: "{{uuid}}" }),
    { count: 2, incoming: JSON.stringify({ method: "login" }) },
  );
  const parsed = JSON.parse(output);
  assert.equal(parsed.method, "login");
  assert.equal(parsed.count, 2);
  assert.equal(typeof parsed.id, "string");
  assert.ok(parsed.id.length > 8);
});

const crypto = require("node:crypto");
const net = require("node:net");

let wsTestPort = 19090;
function nextWebSocketTestPort() {
  wsTestPort += 1;
  return wsTestPort;
}

function createRawWebSocketClient(port, path = "/mock/ws") {
  const socket = net.connect(port, "127.0.0.1");
  let buffer = Buffer.alloc(0);
  let handshakeDone = false;
  const messages = [];
  const waiters = [];

  function flushWaiters() {
    while (messages.length && waiters.length) {
      const waiter = waiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve(messages.shift());
    }
  }

  function parseFrames() {
    while (buffer.length >= 2) {
      const second = buffer[1];
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        const high = buffer.readUInt32BE(2);
        const low = buffer.readUInt32BE(6);
        length = high * 2 ** 32 + low;
        offset = 10;
      }
      if (buffer.length < offset + length) return;
      const opcode = buffer[0] & 0x0f;
      const payload = buffer.subarray(offset, offset + length).toString("utf8");
      buffer = buffer.subarray(offset + length);
      if (opcode === 0x1) messages.push(payload);
    }
    flushWaiters();
  }

  const ready = new Promise((resolve, reject) => {
    socket.once("connect", () => {
      const key = crypto.randomBytes(16).toString("base64");
      socket.write(
        [
          `GET ${path} HTTP/1.1`,
          `Host: 127.0.0.1:${port}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          "",
        ].join("\r\n"),
      );
    });
    socket.once("error", reject);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshakeDone) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        const header = buffer.subarray(0, headerEnd).toString("utf8");
        if (!header.startsWith("HTTP/1.1 101")) {
          reject(new Error(`Unexpected WebSocket handshake: ${header}`));
          return;
        }
        buffer = buffer.subarray(headerEnd + 4);
        handshakeDone = true;
        resolve();
      }
      parseFrames();
    });
  });

  return {
    ready,
    nextMessage(timeoutMs = 500) {
      if (messages.length) return Promise.resolve(messages.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((item) => item.resolve === resolve);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("Timed out waiting for WebSocket message."));
        }, timeoutMs);
        waiters.push({ resolve, reject, timer });
      });
    },
    close() {
      socket.destroy();
    },
  };
}

test("websocket stream follows selected scenario updates without replaying previous items", async (t) => {
  await wsMock.stopWebSocketMockServer();
  const port = nextWebSocketTestPort();
  const oldScenario = {
    id: "old-stream",
    path: "/mock/ws",
    responseText: JSON.stringify(["old-1", "old-2", "old-3"]),
    intervalMs: 250,
    loop: false,
    maxLoops: 0,
    streamOnConnect: true,
    enabled: true,
  };
  const nextScenario = {
    id: "next-stream",
    path: "/mock/ws",
    responseText: JSON.stringify(["new-1", "new-2", "new-3"]),
    intervalMs: 10,
    loop: false,
    maxLoops: 0,
    streamOnConnect: true,
    enabled: true,
  };
  await wsMock.startWebSocketMockServer({ port, scenarios: [oldScenario, nextScenario] });
  const client = createRawWebSocketClient(port);
  t.after(async () => {
    client.close();
    await wsMock.stopWebSocketMockServer();
  });
  await client.ready;
  assert.equal(await client.nextMessage(), "old-1");

  wsMock.updateWebSocketMockServer({ port, scenarios: [nextScenario, oldScenario] });

  assert.equal(await client.nextMessage(), "new-2");
});

test("websocket stream maxLoops counts full sequence replays", async (t) => {
  await wsMock.stopWebSocketMockServer();
  const port = nextWebSocketTestPort();
  await wsMock.startWebSocketMockServer({
    port,
    scenarios: [
      {
        id: "loop-stream",
        path: "/mock/ws",
        responseText: JSON.stringify(["a", "b"]),
        intervalMs: 5,
        loop: true,
        maxLoops: 1,
        streamOnConnect: true,
        enabled: true,
      },
    ],
  });
  const client = createRawWebSocketClient(port);
  t.after(async () => {
    client.close();
    await wsMock.stopWebSocketMockServer();
  });
  await client.ready;

  assert.deepEqual(
    [await client.nextMessage(), await client.nextMessage(), await client.nextMessage(), await client.nextMessage()],
    ["a", "b", "a", "b"],
  );
  await assert.rejects(() => client.nextMessage(40), /Timed out/);
});
