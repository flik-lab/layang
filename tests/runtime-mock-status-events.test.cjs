"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createCommandEnvelope } = require("../lib/runtime/runtime-protocol.cjs");
const { createRuntimeCore } = require("../lib/runtime/runtime-core.cjs");
const { createMockRuntime } = require("../lib/runtime/mock/mock-runtime.cjs");

function servicesWithStableGrpcStatus() {
  let status = { running: false };
  return {
    grpc: {
      start: async () => {
        status = { running: true, port: 50055 };
        return status;
      },
      update: async () => status,
      stop: async () => {
        status = { running: false };
        return status;
      },
      status: () => status,
    },
    rest: {
      start: async () => ({ running: false }),
      update: async () => ({ running: false }),
      stop: async () => ({ running: false }),
      status: () => ({ running: false }),
    },
    websocket: {
      start: async () => ({ running: false }),
      update: async () => ({ running: false }),
      send: () => ({ running: false, sent: 0 }),
      stop: async () => ({ running: false }),
      status: () => ({ running: false }),
    },
  };
}

async function command(core, id, type, payload = null) {
  const response = await core.handle(createCommandEnvelope(id, type, payload));
  assert.equal(response.ok, true, response.error);
  return response.payload;
}

test("runtime core publishes mock.statusChanged only for semantic status changes", async () => {
  const mockRuntime = createMockRuntime({ services: servicesWithStableGrpcStatus() });
  const core = createRuntimeCore({ mockRuntime });
  const events = [];
  core.subscribe((event) => events.push(event));

  await command(core, "1", "mock.grpc.start", {});
  await command(core, "2", "mock.grpc.status");
  await command(core, "3", "mock.grpc.update", {});
  await command(core, "4", "mock.grpc.stop");

  const statusEvents = events.filter((event) => event.event === "mock.statusChanged");
  assert.equal(statusEvents.length, 2);
  assert.deepEqual(statusEvents[0].payload, {
    protocol: "grpc",
    status: { running: true, port: 50055 },
  });
  assert.deepEqual(statusEvents[1].payload, {
    protocol: "grpc",
    status: { running: false },
  });
});
