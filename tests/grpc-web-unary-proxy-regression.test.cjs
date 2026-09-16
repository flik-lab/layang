"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "lib", "grpc-web-client.ts"), "utf8");

test("browser unary and server-streaming gRPC-Web both use text framing", () => {
  assert.match(source, /const requestBody: string = base64Encode\(requestFrame\)/);
  assert.match(source, /const contentType = "application\/grpc-web-text\+proto"/);
  assert.doesNotMatch(source, /responseStream\s*\? base64Encode\(requestFrame\)/);
});

test("browser client defaults to text decoding while still accepting explicit binary responses", () => {
  assert.match(source, /resolveGrpcWebResponseEncoding\(contentType\)/);
  assert.match(source, /normalized === "application\/grpc-web-text\+proto"/);
  assert.match(source, /normalized === "application\/grpc-web\+proto"/);
  assert.match(source, /return "text";/);
  assert.doesNotMatch(source, /processBytesFallback/);
  assert.match(source, /await processWorkerChunk\(chunk\.value, false\)/);
});

const proxySource = fs.readFileSync(path.join(__dirname, "..", "electron", "services", "grpc-web-proxy-server.cjs"), "utf8");

test("unary grpc-web response metadata cannot overwrite the negotiated grpc-web content type", () => {
  const startResponse = proxySource.match(/function startGrpcWebResponse[\s\S]*?\n}\n\nfunction requestHeadersToMetadata/)?.[0] || "";
  assert.match(startResponse, /protocolHeaders\.has\(lower\)/);
});
