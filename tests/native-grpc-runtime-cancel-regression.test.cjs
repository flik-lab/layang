"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createNativeGrpcRuntime } = require("../lib/runtime/grpc/native-grpc-runtime.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

test("cancelling utility-owned native grpc call cancels call, closes client, and emits deterministic end", async () => {
  const pending = deferred();
  let callCancelled = 0;
  let clientClosed = 0;
  const invokeNativeGrpc = async (_payload, _emit, registerCall) => {
    registerCall({ cancel: () => { callCancelled += 1; } }, { close: () => { clientClosed += 1; } });
    return pending.promise;
  };
  const runtime = createNativeGrpcRuntime({ invokeNativeGrpc });
  const events = [];
  runtime.subscribe((event) => events.push(event));

  const invocation = runtime.handle("grpc.invoke", { runId: "run-cancel" });
  await new Promise((resolve) => setImmediate(resolve));
  const cancelled = await runtime.handle("grpc.cancel", { runId: "run-cancel" });

  assert.deepEqual(cancelled, { cancelled: true });
  assert.equal(callCancelled, 1);
  assert.equal(clientClosed, 1);
  assert.equal(events.filter((event) => event.event === "grpc.end" && event.payload.cancelled === true).length, 1);

  pending.resolve({ messages: [], totalMessages: 0 });
  await invocation;
  assert.equal(events.filter((event) => event.event === "grpc.end" && event.payload.cancelled === true).length, 1);
});

test("cancelling unknown run is deterministic", async () => {
  const runtime = createNativeGrpcRuntime({ invokeNativeGrpc: async () => ({ messages: [] }) });
  assert.deepEqual(await runtime.handle("grpc.cancel", { runId: "missing" }), { cancelled: false });
});
