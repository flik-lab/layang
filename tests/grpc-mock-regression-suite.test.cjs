"use strict";

const __bundleCreateRequire = require("node:module").createRequire;
const __bundlePath = require("node:path");
const __bundleBaseDir = __dirname;




{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-mock-cadence-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-mock-cadence-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const test = require("node:test");
    const { calculateNextCadenceDeadline } = require("../electron/services/grpc-mock-server.cjs");
    
    test("mock stream cadence compensates for a late tick instead of accumulating drift", () => {
      const firstDeadline = calculateNextCadenceDeadline(0, 1000, 100);
      assert.equal(firstDeadline, 1100);
    
      const secondDeadline = calculateNextCadenceDeadline(firstDeadline, 1000, 1125);
      assert.equal(secondDeadline, 2100);
      assert.equal(secondDeadline - 1125, 975);
    });
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-mock-immediate-stop-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-mock-immediate-stop-regression.test.cjs", () => {
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
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-mock-large-stream-performance-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-mock-large-stream-performance-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("large looping gRPC streams reuse snapshots and bound retained messages", () => {
      const runtime = read("electron/services/grpc-mock-server.cjs");
      const constants = read("app/playground/shared/workbench-constants.ts");
      const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
    
      const cacheGuard = runtime.indexOf("if (cachedSnapshotVersion === runtime.configVersion) return cachedSnapshot");
      const responseFingerprints = runtime.indexOf(
        "const fingerprints = createRuntimeStreamResponseFingerprints(responses)",
      );
      const responseSignature = runtime.indexOf('const responseSignature = fingerprints.join("\\n")');
      assert.ok(cacheGuard >= 0 && responseFingerprints > cacheGuard && responseSignature > responseFingerprints);
      assert.match(constants, /maxMessagesPerRequest = 50/);
      assert.match(constants, /maxRetainedMessagesPerRequest = 10/);
      assert.match(liveEvents, /MAX_FINAL_MESSAGE_EVENTS = maxRetainedMessagesPerRequest/);
      assert.match(liveEvents, /large full payloads live in the bounded external cache/);
      assert.doesNotMatch(liveEvents, /events\.map\(stripFullPayloadFromMessage\)/);
    });
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-mock-stream-fingerprint-cache-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-mock-stream-fingerprint-cache-regression.test.cjs", () => {
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
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-mock-traffic-ownership-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-mock-traffic-ownership-regression.test.cjs", () => {
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
      assert.match(workspace, /<RuntimeLogs status=\{mockServerStatus\} \/>/);
      assert.doesNotMatch(workspace, /aria-label="Request logging"/);
      assert.doesNotMatch(workspace, /const gatewayLogs = status\.gateway\?\.logs/);
    });
    
  });
}
