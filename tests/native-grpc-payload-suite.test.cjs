"use strict";

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
