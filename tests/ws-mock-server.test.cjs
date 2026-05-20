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
