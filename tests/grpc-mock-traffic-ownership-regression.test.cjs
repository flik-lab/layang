"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("gRPC mock serves traffic without retaining client request payloads", () => {
  const runtime = read("electron/services/grpc-mock-server.cjs");
  const model = read("app/playground/features/mock-server/mock-scenario-core.ts");
  const workspace = read("app/playground/features/services/services-workspace.tsx");

  assert.match(runtime, /requestLogsEnabled:\s*false/);
  assert.match(runtime, /const requestLog = null/);
  assert.match(model, /requestLogs:\s*false/);
  assert.match(workspace, /items=\{\[\{ value: "logs", label: "Logs" \}\]\}/);
  assert.doesNotMatch(workspace, /aria-label="Request logging"/);
  assert.doesNotMatch(workspace, /const gatewayLogs = status\.gateway\?\.logs/);
});
