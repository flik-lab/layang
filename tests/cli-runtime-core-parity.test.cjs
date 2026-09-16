"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createRuntimeCore } = require("../lib/runtime/runtime-core.cjs");
const { createMockRuntime } = require("../lib/runtime/mock/mock-runtime.cjs");
const { createCommandEnvelope } = require("../lib/runtime/runtime-protocol.cjs");

function fakeServices() {
  const state = { grpc: { running: false }, rest: { running: false }, websocket: { running: false } };
  const create = (protocol) => ({
    start: async () => (state[protocol] = { running: true, protocol }),
    update: async () => state[protocol],
    stop: async () => (state[protocol] = { running: false, protocol }),
    status: () => state[protocol],
    ...(protocol === "websocket" ? { send: async () => ({ sent: true }) } : {}),
  });
  return { grpc: create("grpc"), rest: create("rest"), websocket: create("websocket") };
}

async function invoke(core, type, payload) {
  const response = await core.handle(createCommandEnvelope(`test:${type}`, type, payload));
  assert.equal(response.ok, true, response.error);
  return response.payload;
}

test("CLI and utility host can share identical mock runtime semantics", async () => {
  const core = createRuntimeCore({ mockRuntime: createMockRuntime({ services: fakeServices() }), statusMetadata: { host: "cli" } });
  assert.equal((await invoke(core, "mock.grpc.start", {})).running, true);
  assert.equal((await invoke(core, "mock.grpc.status")).running, true);
  assert.equal((await invoke(core, "mock.rest.start", {})).running, true);
  assert.equal((await invoke(core, "mock.websocket.start", {})).running, true);
  assert.equal((await invoke(core, "runtime.getStatus")).host, "cli");
  await core.dispose();
});

test("CLI mock daemon delegates server behavior to runtime core", () => {
  const source = fs.readFileSync("lib/cli-mock.cjs", "utf8");
  assert.match(source, /createRuntimeCore/);
  assert.match(source, /createCommandEnvelope/);
  assert.doesNotMatch(source, /electron\/services\/grpc-mock-server/);
  assert.doesNotMatch(source, /electron\/services\/rest-mock-server/);
  assert.doesNotMatch(source, /electron\/services\/ws-mock-server/);
});
