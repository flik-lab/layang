"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("mock server stream precomputes response fingerprints per runtime snapshot instead of stable-json hashing every tick", () => {
  const source = read("electron/services/grpc-mock-server.cjs");
  assert.match(source, /createRuntimeStreamResponseFingerprints/);
  assert.match(source, /fingerprints:\s*initialFingerprints/);
  assert.match(source, /recordRuntimeStreamResponseSent\(sentResponseCounts,\s*fingerprints\[index\]/);
  assert.doesNotMatch(source, /function recordRuntimeStreamResponseSent\(sentCounts, item\)[\s\S]{0,250}?createRuntimeStreamResponseFingerprint\(item\)/);
});
