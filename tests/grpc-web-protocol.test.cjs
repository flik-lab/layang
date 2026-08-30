"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  decodeGrpcWebRequestBody,
  decodeGrpcWebTextBody,
  encodeDataFrame,
  parseFrames,
} = require("../lib/grpc-web-protocol.cjs");

function independentlyEncodedChunks(bytes, sizes) {
  const chunks = [];
  let offset = 0;
  for (const size of sizes) {
    if (offset >= bytes.length) break;
    const end = Math.min(bytes.length, offset + size);
    chunks.push(bytes.subarray(offset, end).toString("base64"));
    offset = end;
  }
  if (offset < bytes.length) chunks.push(bytes.subarray(offset).toString("base64"));
  return chunks;
}

test("grpc-web-text request decoder accepts one conventional base64 entity", () => {
  const payload = Buffer.from("external-unary-request");
  const frame = encodeDataFrame(payload);
  const body = Buffer.from(frame.toString("base64"), "ascii");
  assert.deepEqual(decodeGrpcWebRequestBody(body, true), payload);
});

test("grpc-web-text request decoder accepts whitespace and unpadded final base64", () => {
  const payload = Buffer.from("hello");
  const frame = encodeDataFrame(payload);
  const encoded = frame.toString("base64").replace(/=+$/, "");
  const body = Buffer.from(`  ${encoded.slice(0, 4)}\r\n${encoded.slice(4)}\t`, "ascii");
  assert.deepEqual(decodeGrpcWebRequestBody(body, true), payload);
});

test("grpc-web-text request decoder accepts concatenated independently padded chunks", () => {
  const payload = Buffer.from("request from an external grpc-web-text client");
  const frame = encodeDataFrame(payload);
  const chunks = independentlyEncodedChunks(frame, [2, 5, 1, 7, 4]);

  // This is the interoperability case that Buffer.from(fullBody, "base64")
  // cannot handle: '=' padding appears before later base64 entities.
  assert.ok(chunks.slice(0, -1).some((chunk) => chunk.includes("=")));
  const body = Buffer.from(chunks.join("\r\n"), "ascii");
  assert.deepEqual(decodeGrpcWebRequestBody(body, true), payload);
});

test("grpc-web-text low-level decoder preserves bytes across padded entities", () => {
  const bytes = Buffer.from([0, 0, 0, 0, 11, ...Buffer.from("hello world")]);
  const encoded = [bytes.subarray(0, 2), bytes.subarray(2, 7), bytes.subarray(7)]
    .map((chunk) => chunk.toString("base64"))
    .join("");
  assert.deepEqual(decodeGrpcWebTextBody(Buffer.from(encoded, "ascii")), bytes);
});

test("grpc-web-text request decoder reports invalid base64 instead of a misleading incomplete frame", () => {
  assert.throws(
    () => decodeGrpcWebRequestBody(Buffer.from("AAAA!!==", "ascii"), true),
    /Invalid grpc-web-text base64 body/,
  );
});

test("frame parser reports declared and available payload sizes for truncated requests", () => {
  const truncated = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x05, 0x01, 0x02]);
  assert.throws(() => parseFrames(truncated), /declares 5 payload byte\(s\), but only 2 are available/);
});
