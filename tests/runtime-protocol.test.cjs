"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  RUNTIME_PROTOCOL_VERSION,
  createCommandEnvelope,
  validateCommandEnvelope,
} = require("../lib/runtime/runtime-protocol.cjs");

test("runtime protocol creates and validates a versioned command envelope", () => {
  const envelope = createCommandEnvelope("runtime:1", "runtime.ping", { value: 1 });

  assert.equal(envelope.protocolVersion, RUNTIME_PROTOCOL_VERSION);
  assert.equal(envelope.requestId, "runtime:1");
  assert.equal(envelope.type, "runtime.ping");
  assert.deepEqual(envelope.payload, { value: 1 });
  assert.deepEqual(validateCommandEnvelope(envelope), envelope);
});

test("runtime protocol rejects unsupported versions", () => {
  assert.throws(
    () =>
      validateCommandEnvelope({
        protocolVersion: RUNTIME_PROTOCOL_VERSION + 1,
        requestId: "runtime:2",
        type: "runtime.ping",
        payload: null,
      }),
    /Unsupported runtime protocol version/,
  );
});

test("runtime protocol rejects malformed command envelopes", () => {
  assert.throws(
    () =>
      validateCommandEnvelope({
        protocolVersion: RUNTIME_PROTOCOL_VERSION,
        requestId: "",
        type: "runtime.ping",
      }),
    /requestId/,
  );

  assert.throws(
    () =>
      validateCommandEnvelope({
        protocolVersion: RUNTIME_PROTOCOL_VERSION,
        requestId: "runtime:3",
        type: "",
      }),
    /type/,
  );
});
