"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (file) => fs.readFileSync(file, "utf8");

test("Electron gRPC-Web uses disposable transport runtime while browser keeps worker fallback", () => {
  const client = read("lib/grpc-web-client.ts");
  assert.match(client, /window\.electronGrpcWebTransport\?\.isAvailable/);
  assert.match(client, /invokeElectronGrpcWebTransport/);
  assert.match(client, /createPayloadDocumentProducerChannel/);
  assert.match(client, /Browser fallback/);
});

test("transport-backed documents route outside the renderer payload worker", () => {
  const service = read("app/playground/features/response-viewer/payload-document/payloadDocument.service.ts");
  assert.match(service, /id\.startsWith\("transport:"\)/);
  assert.match(service, /createTransportPayloadDocumentClient/);
});

test("preload exposes transport invoke cancel and payload APIs", () => {
  const preload = read("electron/preload.cjs");
  assert.match(preload, /electronGrpcWebTransport/);
  assert.match(preload, /grpc-web-transport:invoke/);
  assert.match(preload, /grpc-web-transport:cancel/);
  assert.match(preload, /grpc-web-transport:payload/);
});

test("main process owns disposable transport manager and disposes it on shutdown", () => {
  const main = read("electron/main.cjs");
  assert.match(main, /createDisposableTransportRuntimeManager/);
  assert.match(main, /registerGrpcWebTransportIpc/);
  assert.match(main, /transportRuntimeManager\.disposeAll/);
});
