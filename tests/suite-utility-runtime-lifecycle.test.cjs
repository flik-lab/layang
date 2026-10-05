"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "utility-runtime-crash-recovery.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("utility-runtime-crash-recovery.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "utility-runtime-endurance.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("utility-runtime-endurance.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const { createPayloadDocumentStore } = require("../lib/runtime/payload/payload-document-store.cjs");
    const { createNativeGrpcRuntime } = require("../lib/runtime/grpc/native-grpc-runtime.cjs");
    
    test("logical 10-minute 1Hz large stream honors configured five-document retention", async () => {
      const store = createPayloadDocumentStore();
      store.setRetentionLimit(5);
      const raw = JSON.stringify({ tracks: Array.from({ length: 10000 }, (_, id) => ({ id, x: id / 10, y: id / 20, label: `TRACK-${id}` })) });
      assert.ok(raw.length > 500_000);
      const bytes = Uint8Array.from(Buffer.from(raw));
      let metadataEvents = 0;
      const runtime = createNativeGrpcRuntime({
        payloadStore: store,
        generation: "endurance",
        invokeNativeGrpc: async (_payload, emit) => {
          const previews = [];
          for (let index = 0; index < 600; index += 1) {
            previews.push(raw.slice(0, 128));
            emit({ type: "message", index, serializedValueUtf8: bytes, preview: raw.slice(0, 128), originalChars: raw.length });
          }
          return { headers: {}, trailers: { "grpc-status": "0" }, messages: previews, totalMessages: 600, droppedMessages: 0 };
        },
      });
      runtime.subscribe((event) => {
        if (event.event !== "grpc.messageMeta") return;
        metadataEvents += 1;
        assert.equal("serializedValueUtf8" in event.payload, false);
        assert.equal("value" in event.payload, false);
      });
      const result = await runtime.handle("grpc.invoke", { runId: "ten-minute" });
      const stats = store.debugStats();
      assert.equal(metadataEvents, 600);
      assert.equal(stats.documentCount, 5);
      assert.ok(stats.rawBytes <= bytes.byteLength * 5);
      assert.equal(result.messageDocumentRefs.length, 5);
      assert.equal(result.messages.length, 5);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "utility-runtime-final-boundary.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("utility-runtime-final-boundary.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const read = (file) => fs.readFileSync(file, "utf8");
    
    test("desktop defaults to utility runtime while explicit main rollback remains supported", () => {
      const main = read("electron/main.cjs");
      const preload = read("electron/preload.cjs");
      assert.match(main, /LAYANG_RUNTIME_MODE \|\| "utility"/);
      assert.match(main, /registerNativeGrpcIpc\(\{ runtimeMode,/);
      assert.match(preload, /mode: process\.env\.LAYANG_RUNTIME_MODE === "main" \? "main" : "utility"/);
    });
    
    test("utility native gRPC boundary never re-registers raw payload in renderer", () => {
      const ipc = read("electron/ipc/native-grpc-ipc.cjs");
      const utilityStart = ipc.indexOf("async function invokeUtilityNativeGrpc");
      const nextFunction = ipc.indexOf("\nfunction forwardGrpcEventWithPayloadRegistration", utilityStart);
      const utilityBlock = ipc.slice(utilityStart, nextFunction);
      assert.match(utilityBlock, /documentRef: runtimePayload\.documentRef/);
      assert.doesNotMatch(utilityBlock, /serializedValueUtf8/);
      assert.doesNotMatch(utilityBlock, /registerPayloadDocument/);
    });
    
    test("runtime generation invalidates stale response sessions", () => {
      const live = read("app/playground/features/request-runner/use-live-session-events.ts");
      assert.match(live, /runtime\.generationChanged/);
      assert.match(live, /runtime\.unavailable/);
      assert.match(live, /responseSessionRegistry\.clear\(\)/);
      assert.match(live, /transportLifecycleStore\.reset\(\)/);
    });
    
  });
}
