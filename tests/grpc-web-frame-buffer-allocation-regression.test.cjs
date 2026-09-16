"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = () => fs.readFileSync("lib/grpc-web-decode-worker-source.ts", "utf8");

test("gRPC-Web frame parser queues chunks instead of repeatedly concatenating an incomplete large frame", () => {
  const text = source();
  assert.match(text, /frameChunks/);
  assert.match(text, /frameBufferedBytes/);
  assert.match(text, /consumeFrameBytes/);
  assert.doesNotMatch(text, /frameBuffer\s*=\s*concatBytes\(frameBuffer, chunk\)/);
});
