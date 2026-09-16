"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createRuntimeCore } = require("../lib/runtime/runtime-core.cjs");
const { createUtilityRuntimeHost } = require("../electron/runtime/utility-runtime-host.cjs");

class FakePort extends EventEmitter {
  constructor() { super(); this.peer = null; this.closed = false; }
  postMessage(data) { if (!this.closed && this.peer) queueMicrotask(() => this.peer.emit("message", { data, ports: [] })); }
  start() {}
  close() { this.closed = true; }
}
function pair() { const a = new FakePort(); const b = new FakePort(); a.peer = b; b.peer = a; return { port1: a, port2: b }; }

function createEnvironment(config = {}) {
  const children = [];
  const utilityProcess = {
    fork: (_entry, _args, spawnOptions) => {
      const child = new EventEmitter();
      child.pid = 1000 + children.length;
      child.env = spawnOptions.env;
      child.kill = () => {
        if (config.asyncKill) setTimeout(() => child.emit("exit", 0), 0);
        else child.emit("exit", 0);
        return true;
      };
      child.postMessage = (message, transfer) => {
        if (message?.type !== "runtime.attach") return;
        const childPort = transfer[0];
        const core = createRuntimeCore({ statusMetadata: { generation: child.env.LAYANG_RUNTIME_GENERATION } });
        childPort.on("message", async (event) => {
          if (event.data?.type === "test.never") return;
          childPort.postMessage(await core.handle(event.data));
        });
        core.subscribe((event) => childPort.postMessage(event));
        childPort.start();
        childPort.postMessage({ protocolVersion: 1, type: "event", event: "runtime.ready", payload: core.getStatus() });
      };
      children.push(child);
      return child;
    },
  };
  class Channel { constructor() { Object.assign(this, pair()); } }
  return { children, utilityProcess, MessageChannelMain: Channel };
}

test("utility host rejects pending work on crash and restarts with a new generation", async () => {
  const env = createEnvironment();
  const host = createUtilityRuntimeHost({ ...env, entryPath: "/fake/entry.cjs", readyTimeoutMs: 200, restartDelayMs: 1, maxRestarts: 1 });
  const events = [];
  host.subscribe((event) => events.push(event));
  await host.start();
  const firstGeneration = host.getStatus().generation;
  const pending = host.invoke("test.never");
  env.children[0].emit("exit", 9);
  await assert.rejects(pending, /exited with code 9/);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(host.getStatus().running, true);
  assert.notEqual(host.getStatus().generation, firstGeneration);
  assert.ok(events.some((event) => event.event === "runtime.unavailable"));
  assert.ok(events.filter((event) => event.event === "runtime.generationChanged").length >= 2);
  await host.dispose();
});


test("disposing utility host never resurrects the runtime after asynchronous child exit", async () => {
  const env = createEnvironment({ asyncKill: true });
  const host = createUtilityRuntimeHost({ ...env, entryPath: "/fake/entry.cjs", readyTimeoutMs: 200, restartDelayMs: 1, maxRestarts: 1 });
  await host.start();
  assert.equal(env.children.length, 1);
  await host.dispose();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(env.children.length, 1);
  assert.equal(host.getStatus().running, false);
});
