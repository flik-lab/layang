"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("stopping gRPC Mock immediately disconnects active streams", () => {
  const runtime = read("electron/services/grpc-mock-server.cjs");
  const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
  const stopStart = runtime.indexOf("async function stopMockServerNow()");
  const stopEnd = runtime.indexOf("function normalizeMockBindHost", stopStart);
  const stopBody = runtime.slice(stopStart, stopEnd);

  assert.match(stopBody, /activeMockServer = null/);
  assert.match(stopBody, /streamReschedulers\?\.clear/);
  assert.match(stopBody, /active\.activeCalls\?\.clear/);
  assert.match(stopBody, /active\.server\.forceShutdown\(\)/);
  assert.doesNotMatch(stopBody, /tryShutdown/);
  assert.doesNotMatch(stopBody, /600/);
  assert.match(actions, /message: "Stopping gRPC Mock\.\.\."/);
});
