"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "native-grpc-payload-suite.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("native-grpc-payload-suite.test.cjs", () => {
    const __bundleCreateRequire = require("node:module").createRequire;
    const __bundlePath = require("node:path");
    const __bundleBaseDir = __dirname;
    
    
    
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "native-grpc-no-renderer-payload-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("native-grpc-no-renderer-payload-regression.test.cjs", () => {
        const test = require("node:test");
        const assert = require("node:assert/strict");
        
        const { createNativeGrpcRuntime } = require("../lib/runtime/grpc/native-grpc-runtime.cjs");
        const { createPayloadDocumentStore } = require("../lib/runtime/payload/payload-document-store.cjs");
        
        test("native utility runtime emits document metadata without raw payload bytes", async () => {
          const payloadStore = createPayloadDocumentStore();
          const raw = JSON.stringify({ tracks: Array.from({ length: 1000 }, (_, id) => ({ id, label: `T-${id}` })) });
          const bytes = Uint8Array.from(Buffer.from(raw));
          const runtime = createNativeGrpcRuntime({
            payloadStore,
            invokeNativeGrpc: async (_payload, emit) => {
              emit({ type: "message", index: 0, serializedValueUtf8: bytes, preview: raw.slice(0, 64), originalChars: raw.length });
              return {
                headers: {}, trailers: { "grpc-status": "0" }, messages: [raw.slice(0, 64)], totalMessages: 1, droppedMessages: 0,
              };
            },
          });
          const events = [];
          runtime.subscribe((event) => events.push(event));
          const result = await runtime.handle("grpc.invoke", { runId: "run-1" });
        
          const message = events.find((event) => event.event === "grpc.messageMeta");
          assert.ok(message);
          assert.equal(message.payload.documentRef.id, "grpc:run-1:0");
          assert.equal("serializedValueUtf8" in message.payload, false);
          assert.equal("value" in message.payload, false);
          assert.equal("buffer" in message.payload, false);
          assert.deepEqual(result.messageDocumentRefs, [message.payload.documentRef]);
          assert.equal(payloadStore.getText(message.payload.documentRef.id, "raw"), raw);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "native-grpc-payload-channel-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("native-grpc-payload-channel-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        const read = (path) => fs.readFileSync(path, "utf8");
        
        test("native gRPC payload bytes bypass renderer callbacks and connect main directly to payload worker", () => {
          const preload = read("electron/preload.cjs");
          const ipc = read("electron/ipc/native-grpc-ipc.cjs");
          const client = read("lib/native-grpc-client.ts");
          const service = read("app/playground/features/response-viewer/payload-document/payloadDocument.service.ts");
        
          assert.match(preload, /new MessageChannel\(\)/);
          assert.match(preload, /ipcRenderer\.postMessage\("native-grpc:payload-port"/);
          assert.match(preload, /window\.postMessage\([\s\S]*layang-native-grpc-payload-port/);
          assert.match(preload, /requestPayloadPort/);
        
          assert.match(ipc, /ipcMain\.on\("native-grpc:payload-port"/);
          assert.match(ipc, /type: "register-utf8"/);
          assert.match(ipc, /payloadPort\.postMessage/);
          assert.match(ipc, /pendingPayloadRegistrations/);
          assert.match(ipc, /documentRef/);
        
          assert.match(service, /layang-native-grpc-payload-port/);
          assert.match(service, /ensureNativeGrpcProducerPort/);
          assert.match(service, /attachProducerPort/);
          assert.doesNotMatch(client, /serializedValueUtf8|nativeGrpcPayloadPort|toOwnedArrayBuffer/);
        });
        
        test("renderer contextBridge receives only compact native gRPC message metadata", () => {
          const ipc = read("electron/ipc/native-grpc-ipc.cjs");
          assert.match(ipc, /if \(grpcEvent\?\.type === "message" && grpcEvent\.serializedValueUtf8\)/);
          assert.match(ipc, /type: "message",[\s\S]*documentRef/);
          assert.doesNotMatch(ipc, /event\.sender\.send\([^\n]*serializedValueUtf8/);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "native-grpc-renderer-bypass-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("native-grpc-renderer-bypass-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        
        const read = (file) => fs.readFileSync(file, "utf8");
        
        test("native gRPC serializes payloads in Electron main and never emits decoded object graphs", () => {
          const runner = read("electron/services/native-grpc-runner.cjs");
          assert.match(runner, /serializeNativeGrpcMessage/);
          assert.match(runner, /serializedValueUtf8/);
          assert.doesNotMatch(runner, /messages\.push\(message\)/);
          assert.doesNotMatch(runner, /type:\s*["']message["'],\s*index:[^}]*value:\s*message/);
        });
        
        test("native gRPC main registers UTF-8 payloads directly in document worker before renderer metadata", () => {
          const client = read("lib/native-grpc-client.ts");
          const ipc = read("electron/ipc/native-grpc-ipc.cjs");
          const runner = read("app/playground/hooks/use-request-runner.ts");
          assert.match(ipc, /type: "register-utf8"/);
          assert.match(ipc, /documentRefsByIndex/);
          assert.match(ipc, /messageDocumentRefs/);
          assert.match(runner, /ensureNativeGrpcProducerPort/);
          assert.doesNotMatch(runner, /registerSerializedDocument/);
          assert.doesNotMatch(client, /serializedValueUtf8|registerSerializedDocument/);
        });
        
        test("native gRPC main result retains only compact previews instead of decoded payload objects", () => {
          const runner = read("electron/services/native-grpc-runner.cjs");
          assert.match(runner, /messages\.push\(serialized\.preview\)/);
          assert.match(runner, /originalChars/);
        });
        
        test("native gRPC serializer preserves full 1000-track payload while bounding renderer preview", () => {
          const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");
          const { MAX_NATIVE_PREVIEW_CHARS, serializeNativeGrpcMessage } = require("../electron/services/native-grpc-serialization.cjs");
          const result = serializeNativeGrpcMessage(createTrackPayload(1000));
          assert.ok(Buffer.isBuffer(result.serializedValueUtf8));
          assert.ok(result.originalChars > MAX_NATIVE_PREVIEW_CHARS);
          assert.ok(result.preview.length <= MAX_NATIVE_PREVIEW_CHARS + 1);
          const decoded = JSON.parse(result.serializedValueUtf8.toString("utf8"));
          assert.equal(decoded.tracks.length, 1000);
          assert.equal(decoded.tracks[999].id, "TRACK-0999");
        });
        
      });
    }
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "native-grpc-runtime-cancel-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("native-grpc-runtime-cancel-regression.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "native-grpc-utility-routing-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("native-grpc-utility-routing-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    
    const read = (file) => fs.readFileSync(file, "utf8");
    
    test("native grpc IPC routes invoke and cancel through utility host in utility mode", () => {
      const ipc = read("electron/ipc/native-grpc-ipc.cjs");
      const main = read("electron/main.cjs");
      const core = read("lib/runtime/runtime-core.cjs");
    
      assert.match(ipc, /LAYANG_RUNTIME_MODE/);
      assert.match(ipc, /runtimeMode === "utility"/);
      assert.match(ipc, /invoke\("grpc\.invoke"/);
      assert.match(ipc, /invoke\("grpc\.cancel"/);
      assert.match(ipc, /grpc\.messageMeta/);
      assert.match(main, /registerNativeGrpcIpc\(\{ runtimeMode, getRuntimeHost:/);
      assert.match(main, /LAYANG_RUNTIME_MODE \|\| "utility"/);
      assert.match(core, /command\.type\.startsWith\("grpc\."\)/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "utility-native-grpc-runtime.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("utility-native-grpc-runtime.test.cjs", () => {
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
    
  });
}
