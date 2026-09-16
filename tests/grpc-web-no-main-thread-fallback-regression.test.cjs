"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (file) => fs.readFileSync(file, "utf8");

test("browser gRPC-Web requires worker decode and has no renderer frame parser fallback", () => {
  const grpcWeb = read("lib/grpc-web-client.ts");
  assert.doesNotMatch(grpcWeb, /new GrpcWebFrameParser\(/);
  assert.doesNotMatch(grpcWeb, /processBytesFallback/);
  assert.doesNotMatch(grpcWeb, /main-thread fallback/);
  assert.match(grpcWeb, /This response schema cannot be decoded by the gRPC-Web worker\./);
});

test("gRPC-Web decode worker registers payload documents through a MessagePort", () => {
  const source = read("lib/grpc-web-decode-worker-source.ts");
  const client = read("lib/grpc-web-decode-worker-client.ts");
  assert.match(source, /payloadDocumentPort/);
  assert.match(source, /prepareDocumentRegistration/);
  assert.match(source, /registerPreparedDocument/);
  assert.match(source, /register-utf8/);
  assert.doesNotMatch(source, /payloadStore/);
  assert.match(client, /producerPort/);
  assert.doesNotMatch(client, /getPayload/);
});
