"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (file) => fs.readFileSync(file, "utf8");

test("request runner binds Electron gRPC-Web transport lifecycle to request session id", () => {
  const runner = read("app/playground/hooks/use-request-runner.ts");
  assert.match(runner, /runId: targetSessionId/);
  assert.match(runner, /electronGrpcWebTransport\?\.cancel\(sessionId\)/);
  assert.match(runner, /responseSessionRegistry\.get\(sessionId\)\?\.store\.reset\(\)/);
});
