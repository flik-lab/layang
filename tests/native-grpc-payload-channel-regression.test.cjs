"use strict";
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
