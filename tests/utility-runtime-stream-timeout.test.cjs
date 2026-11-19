"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const { createSuccessResponse } = require("../lib/runtime/runtime-protocol.cjs");
const { createUtilityRuntimeHost } = require("../electron/runtime/utility-runtime-host.cjs");
const { createDisposableTransportRuntimeManager } = require("../electron/runtime/disposable-transport-runtime-manager.cjs");

class FakePort extends EventEmitter {
  constructor() {
    super();
    this.peer = null;
  }

  postMessage(data) {
    if (this.peer) queueMicrotask(() => this.peer.emit("message", { data, ports: [] }));
  }

  start() {}

  close() {}
}

/**
 * A utility process whose runtime answers every command after `replyAfterMs`, like a stream
 * that keeps the command open while it delivers messages.
 */
function createSlowUtilityEnvironment(replyAfterMs) {
  const child = new EventEmitter();
  child.kill = () => {
    child.emit("exit", 0);
    return true;
  };
  child.postMessage = (message, transfer) => {
    if (message?.type !== "runtime.attach") return;
    const childPort = transfer[0];
    childPort.on("message", (event) => {
      const command = event.data;
      setTimeout(() => childPort.postMessage(createSuccessResponse(command.requestId, { type: command.type })), replyAfterMs);
    });
    childPort.postMessage({ protocolVersion: 1, type: "event", event: "runtime.ready", payload: { status: "ready" } });
  };
  class MessageChannelMain {
    constructor() {
      this.port1 = new FakePort();
      this.port2 = new FakePort();
      this.port1.peer = this.port2;
      this.port2.peer = this.port1;
    }
  }
  return { utilityProcess: { fork: () => child }, MessageChannelMain };
}

test("a command can outlive the host command timeout when it opts out", async () => {
  const host = createUtilityRuntimeHost({ ...createSlowUtilityEnvironment(250), commandTimeoutMs: 100, readyTimeoutMs: 500 });
  await host.start();

  await assert.rejects(host.invoke("runtime.ping"), /timed out after 100 ms/);
  assert.deepEqual(await host.invoke("grpcWeb.invoke", {}, { timeoutMs: 0 }), { type: "grpcWeb.invoke" });

  await host.dispose();
});

test("gRPC-Web and native gRPC invokes are not cut off by the host command timeout", async () => {
  const calls = [];
  const host = {
    async start() {},
    async invoke(type, payload, options) {
      calls.push({ type, options });
      return type === "grpcWeb.invoke" ? { trailers: { "grpc-status": "0" }, messageDocumentRefs: [] } : { ok: true };
    },
    subscribe() { return () => undefined; },
    getStatus() { return { running: true }; },
    async dispose() {},
  };
  const manager = createDisposableTransportRuntimeManager({ createHost: () => host, eventFlushMs: 1 });

  await manager.invoke("run-a", { runId: "run-a", url: "http://localhost/stream" }, () => undefined);

  assert.deepEqual(calls.find((call) => call.type === "grpcWeb.invoke").options, { timeoutMs: 0 });
  await manager.disposeAll();

  const nativeIpc = require("node:fs").readFileSync(require.resolve("../electron/ipc/native-grpc-ipc.cjs"), "utf8");
  assert.match(nativeIpc, /host\.invoke\("grpc\.invoke", payload, \{ timeoutMs: 0 \}\)/);
});
