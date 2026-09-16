"use strict";

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
