"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const { createRuntimeCore } = require("../lib/runtime/runtime-core.cjs");
const { createUtilityRuntimeHost } = require("../electron/runtime/utility-runtime-host.cjs");

class FakePort extends EventEmitter {
  constructor() {
    super();
    this.peer = null;
    this.closed = false;
  }

  postMessage(data) {
    if (this.closed || !this.peer) return;
    queueMicrotask(() => this.peer.emit("message", { data, ports: [] }));
  }

  start() {}

  close() {
    this.closed = true;
  }
}

function createPortPair() {
  const port1 = new FakePort();
  const port2 = new FakePort();
  port1.peer = port2;
  port2.peer = port1;
  return { port1, port2 };
}

function createFakeUtilityEnvironment() {
  const child = new EventEmitter();
  child.killCount = 0;
  child.kill = () => {
    child.killCount += 1;
    child.emit("exit", 0);
    return true;
  };

  const utilityProcess = {
    fork: () => child,
  };

  class FakeMessageChannelMain {
    constructor() {
      Object.assign(this, createPortPair());
    }
  }

  child.postMessage = (message, transfer) => {
    if (message?.type !== "runtime.attach") return;
    const childPort = transfer?.[0];
    assert.ok(childPort, "host must transfer a runtime port");
    const core = createRuntimeCore();
    childPort.on("message", async (event) => {
      const response = await core.handle(event.data);
      childPort.postMessage(response);
    });
    core.subscribe((runtimeEvent) => childPort.postMessage(runtimeEvent));
    childPort.start();
    childPort.postMessage({
      protocolVersion: 1,
      type: "event",
      event: "runtime.ready",
      payload: { status: "ready" },
    });
  };

  return { child, utilityProcess, MessageChannelMain: FakeMessageChannelMain };
}

test("utility runtime host becomes ready once and answers runtime ping", async () => {
  const { child, utilityProcess, MessageChannelMain } = createFakeUtilityEnvironment();
  const events = [];
  const host = createUtilityRuntimeHost({
    utilityProcess,
    MessageChannelMain,
    entryPath: "/fake/utility-runtime-entry.cjs",
    readyTimeoutMs: 500,
  });
  host.subscribe((event) => events.push(event));

  await host.start();
  const result = await host.invoke("runtime.ping", { source: "test" });

  assert.equal(result.status, "ready");
  assert.equal(events.filter((event) => event.event === "runtime.ready").length, 1);
  assert.equal(host.getStatus().running, true);

  await host.dispose();
  assert.equal(child.killCount, 1);
  assert.equal(host.getStatus().running, false);
});
