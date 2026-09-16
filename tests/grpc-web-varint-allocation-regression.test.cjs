"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("gRPC-Web decoder uses numeric varints for tags, lengths, and common 32-bit scalars", () => {
  const source = fs.readFileSync("lib/grpc-web-decode-worker-source.ts", "utf8");
  assert.match(source, /function readVarintNumber/);
  assert.match(source, /const tag = readVarintNumber\(bytes, state\)/);
  assert.match(source, /const length = readVarintNumber\(bytes, state\)/);
  assert.match(source, /case 'uint32':[\s\S]{0,180}readVarintNumber\(bytes, state\)/);
  assert.match(source, /case 'bool':[\s\S]{0,180}readVarintNumber\(bytes, state\) !== 0/);
});
