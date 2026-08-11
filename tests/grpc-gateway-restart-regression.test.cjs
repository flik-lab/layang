"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("gRPC Mock and Web Access serialize rapid lifecycle operations", () => {
  const mockRuntime = read("electron/services/grpc-mock-server.cjs");
  const gatewayRuntime = read("electron/services/grpc-gateway-server.cjs");

  assert.match(mockRuntime, /queueMockServerLifecycle\(\(\) => startMockServerNow\(payload\)\)/);
  assert.match(mockRuntime, /queueMockServerLifecycle\(stopMockServerNow\)/);
  assert.match(
    gatewayRuntime,
    /queueGatewayLifecycle\(profile\.id, \(\) => startGatewayProfileNow\(payload, profile\)\)/,
  );
  assert.match(gatewayRuntime, /queueGatewayLifecycle\(id, \(\) => stopGatewayProfileNow\(id\)\)/);
});

test("local Web Access tolerates a short mock restart without circuit lockout", () => {
  const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
  const proxy = read("electron/services/grpc-web-proxy-server.cjs");

  assert.match(actions, /retry: \{ \.\.\.stored\.retry, enabled: true, maxRetries: 5, backoffMs: 75 \}/);
  assert.match(actions, /circuitBreaker: \{ \.\.\.stored\.circuitBreaker, enabled: false \}/);
  assert.match(proxy, /socket\.once\("close", \(\) => sockets\.delete\(socket\)\)/);
  assert.match(proxy, /socket\.destroy\?\.\(\)/);
  assert.match(proxy, /server\.closeAllConnections\?\.\(\)/);
});
