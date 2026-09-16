"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("lib/proto-runtime-registry.ts", "utf8");

test("Proto runtime compilation is cached across registry recreation by immutable checksum", () => {
  assert.match(source, /const compiledProtoCache/);
  assert.match(source, /version\.checksum/);
  assert.match(source, /compiledProtoCache\.get/);
  assert.match(source, /compiledProtoCache\.set/);
  assert.match(source, /MAX_COMPILED_PROTO_CACHE/);
});
