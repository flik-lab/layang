"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createMockRuntime } = require("../lib/runtime/mock/mock-runtime.cjs");

function createFakeServices() {
  const calls = [];
  const state = {
    grpc: { running: false },
    rest: { running: false },
    websocket: { running: false },
  };

  return {
    calls,
    state,
    grpc: {
      start: async (payload) => {
        calls.push(["grpc.start", payload]);
        state.grpc = { running: true, port: payload.port || 50055 };
        return state.grpc;
      },
      update: async (payload) => {
        calls.push(["grpc.update", payload]);
        state.grpc = { ...state.grpc, ...payload, running: true };
        return state.grpc;
      },
      stop: async () => {
        calls.push(["grpc.stop"]);
        state.grpc = { running: false };
        return state.grpc;
      },
      status: () => state.grpc,
    },
    rest: {
      start: async (payload) => {
        calls.push(["rest.start", payload]);
        state.rest = { running: true, port: payload.port || 8080 };
        return state.rest;
      },
      update: async (payload) => {
        calls.push(["rest.update", payload]);
        state.rest = { ...state.rest, ...payload, running: true };
        return state.rest;
      },
      stop: async () => {
        calls.push(["rest.stop"]);
        state.rest = { running: false };
        return state.rest;
      },
      status: () => state.rest,
    },
    websocket: {
      start: async (payload) => {
        calls.push(["websocket.start", payload]);
        state.websocket = { running: true, port: payload.port || 8090 };
        return state.websocket;
      },
      update: async (payload) => {
        calls.push(["websocket.update", payload]);
        state.websocket = { ...state.websocket, ...payload, running: true };
        return state.websocket;
      },
      send: (payload) => {
        calls.push(["websocket.send", payload]);
        return { ...state.websocket, sent: 1 };
      },
      stop: async () => {
        calls.push(["websocket.stop"]);
        state.websocket = { running: false };
        return state.websocket;
      },
      status: () => state.websocket,
    },
  };
}

test("mock runtime owns grpc, rest, and websocket server lifecycle", async () => {
  const services = createFakeServices();
  const runtime = createMockRuntime({ services });

  assert.equal((await runtime.handle("mock.grpc.start", { port: 50055 })).running, true);
  assert.equal((await runtime.handle("mock.rest.start", { port: 8088 })).running, true);
  assert.equal((await runtime.handle("mock.websocket.start", { port: 8099 })).running, true);
  assert.equal((await runtime.handle("mock.websocket.send", { responseText: "hello" })).sent, 1);

  assert.equal((await runtime.handle("mock.grpc.status")).port, 50055);
  assert.equal((await runtime.handle("mock.rest.status")).port, 8088);
  assert.equal((await runtime.handle("mock.websocket.status")).port, 8099);

  await runtime.dispose();

  assert.equal(services.state.grpc.running, false);
  assert.equal(services.state.rest.running, false);
  assert.equal(services.state.websocket.running, false);
  assert.deepEqual(
    services.calls.filter(([name]) => name.endsWith(".stop")).map(([name]) => name).sort(),
    ["grpc.stop", "rest.stop", "websocket.stop"],
  );
});
