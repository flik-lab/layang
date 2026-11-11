"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createGrpcMockLivePushRegistry } = require("../lib/grpc-mock-live-push.cjs");

test("backpressure suppresses repeated pushes until drain without queue growth", () => {
  const registry = createGrpcMockLivePushRegistry();
  const call = new EventEmitter();
  const values = [];
  call.write = (value) => { values.push(value); return values.length !== 1; };
  registry.register({ call, serviceName: "svc", methodName: "Watch" });
  let resolved = 0;
  const push = () => registry.send({ serviceName: "svc", methodName: "Watch", resolveOutput: () => ({ data: { n: ++resolved } }) });
  assert.equal(push().backpressured, 1);
  for (let i = 0; i < 10000; i++) assert.equal(push().skipped, 1);
  assert.equal(values.length, 1);
  assert.equal(resolved, 1);
  call.emit("drain");
  assert.equal(push().sent, 1);
  assert.deepEqual(values, [{ n: 1 }, { n: 2 }]);
  registry.clear();
  assert.equal(call.listenerCount("drain"), 0);
  assert.equal(call.listenerCount("close"), 0);
});

test("close removes registry session and listeners without closing client", () => {
  const registry = createGrpcMockLivePushRegistry();
  const call = new EventEmitter();
  call.write = () => true;
  registry.register({ call, serviceName: "svc", methodName: "Watch" });
  assert.equal(registry.count(), 1);
  call.emit("close");
  assert.equal(registry.count(), 0);
  assert.equal(call.listenerCount("drain"), 0);
});
