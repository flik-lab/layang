"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createNativeGrpcRuntime } = require("../lib/runtime/grpc/native-grpc-runtime.cjs");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("native grpc runtime owns active call state and emits normalized utility events", async () => {
  const pending = deferred();
  const call = { cancel() {} };
  const client = { close() {} };
  const invokeNativeGrpc = async (_payload, emit, registerCall) => {
    registerCall(call, client);
    emit({ type: "headers", headers: { a: "b" } });
    emit({ type: "message", index: 0, serializedValueUtf8: Buffer.from("{}"), preview: "{}", originalChars: 2 });
    return pending.promise;
  };
  const runtime = createNativeGrpcRuntime({ invokeNativeGrpc });
  const events = [];
  runtime.subscribe((event) => events.push(event));

  const invocation = runtime.handle("grpc.invoke", { runId: "run-1" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(runtime.getDebugStats().activeRunIds, ["run-1"]);
  assert.equal(events[0].event, "grpc.started");
  assert.equal(events.some((event) => event.event === "grpc.event"), true);
  assert.equal(events.some((event) => event.event === "grpc.messageMeta"), true);

  pending.resolve({ messages: ["{}"], totalMessages: 1 });
  assert.deepEqual(await invocation, { messages: ["{}"], totalMessages: 1 });
  assert.deepEqual(runtime.getDebugStats().activeRunIds, []);
});
