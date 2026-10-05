"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-gateway-restart-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-gateway-restart-regression.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-regression-suite.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-regression-suite.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-runtime-guard.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-runtime-guard.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const guard = require("../lib/grpc-mock-runtime-guard.cjs");
    
    function active(overrides = {}) {
      return {
        methods: [{ serviceName: "demo.Greeter", methodName: "SayHello" }],
        hasUiRuntimeOverride: false,
        hasUiStreamDefaultsOverride: false,
        lastUiRuntimeUpdateAt: 0,
        lastUiRuntimeRevision: 0,
        ...overrides,
      };
    }
    
    function runtime(scenarioCount = 1) {
      return {
        scenarioIndex: Array.from({ length: scenarioCount }, (_, index) => ({ id: `scenario-${index + 1}` })),
      };
    }
    
    test("gRPC mock guard marks UI updates as authoritative with monotonic revision", () => {
      const state = active();
      guard.markUiRuntimeUpdate(state, { uiRuntimeRevision: 7 }, 1000);
      assert.equal(state.hasUiRuntimeOverride, true);
      assert.equal(state.hasUiStreamDefaultsOverride, true);
      assert.equal(state.lastUiRuntimeUpdateAt, 1000);
      assert.equal(state.lastUiRuntimeRevision, 7);
      assert.equal(guard.isStaleUiRuntimeUpdate(state, { uiRuntimeRevision: 6 }), true);
      assert.equal(guard.isStaleUiRuntimeUpdate(state, { uiRuntimeRevision: 7 }), false);
      assert.equal(guard.isStaleUiRuntimeUpdate(state, { uiRuntimeRevision: 8 }), false);
    });
    
    test("gRPC mock guard rejects partial workspace reloads that would clear scenarios", () => {
      const state = active();
      const result = guard.shouldIgnoreFileRuntimeUpdate(
        state,
        runtime(2),
        { scenarios: [], workspaceMtimeMs: 9999 },
        "file",
        10_000,
        3000,
      );
      assert.deepEqual(result, { ignore: true, reason: "partial-workspace-write" });
    });
    
    test("gRPC mock guard rejects stale file reloads after UI scenario edit", () => {
      const state = active({ hasUiRuntimeOverride: true, lastUiRuntimeUpdateAt: 5000, lastUiRuntimeRevision: 3 });
      const result = guard.shouldIgnoreFileRuntimeUpdate(
        state,
        runtime(1),
        { scenarios: [{ id: "old" }], workspaceMtimeMs: 4000 },
        "file",
        9000,
        3000,
      );
      assert.deepEqual(result, { ignore: true, reason: "stale-file-mtime", retryAfterMs: 0 });
    });
    
    test("gRPC mock guard rejects file reloads during the UI quiet period even with newer mtime", () => {
      const state = active({ hasUiRuntimeOverride: true, lastUiRuntimeUpdateAt: 5000, lastUiRuntimeRevision: 3 });
      const result = guard.shouldIgnoreFileRuntimeUpdate(
        state,
        runtime(1),
        { scenarios: [{ id: "disk" }], workspaceMtimeMs: 7000 },
        "file",
        6500,
        3000,
      );
      assert.equal(result.ignore, true);
      assert.equal(result.reason, "ui-quiet-period");
      assert.ok(result.retryAfterMs > 0);
    });
    
    test("gRPC mock guard accepts fresh file reload before UI becomes authoritative", () => {
      const result = guard.shouldIgnoreFileRuntimeUpdate(
        active(),
        runtime(1),
        { scenarios: [{ id: "disk" }], workspaceMtimeMs: 7000 },
        "file",
        8000,
        3000,
      );
      assert.deepEqual(result, { ignore: false, reason: "fresh-file-update" });
    });
    
    test("gRPC mock guard accepts newer manual file reload after UI quiet period", () => {
      const state = active({ hasUiRuntimeOverride: true, lastUiRuntimeUpdateAt: 5000, lastUiRuntimeRevision: 3 });
      const result = guard.shouldIgnoreFileRuntimeUpdate(
        state,
        runtime(1),
        { scenarios: [{ id: "disk" }], workspaceMtimeMs: 6200 },
        "file",
        9000,
        3000,
      );
      assert.deepEqual(result, { ignore: false, reason: "fresh-file-update" });
    });
    
    test("gRPC mock guard rejects stale autosave snapshots after a newer UI edit", () => {
      const state = active({ hasUiRuntimeOverride: true, lastUiRuntimeUpdateAt: 10_000, lastUiRuntimeRevision: 4 });
      guard.markUiRuntimeUpdate(state, { uiRuntimeRevision: 5, mockServerUpdatedAt: "2026-06-05T10:00:10.000Z" }, 10_000);
      const result = guard.shouldIgnoreFileRuntimeUpdate(
        state,
        runtime(1),
        {
          scenarios: [{ id: "old-autosave" }],
          workspaceMtimeMs: 14_500,
          serverConfigMtimeMs: 14_500,
          scenarioFilesMtimeMs: 14_500,
          editorUpdatedAt: "2026-06-05T10:00:01.000Z",
        },
        "file",
        14_500,
        3000,
      );
      assert.deepEqual(result, { ignore: true, reason: "stale-workspace-snapshot" });
    });
    
    test("gRPC mock guard accepts manual scenario file edits after the UI quiet period", () => {
      const state = active({ hasUiRuntimeOverride: true, lastUiRuntimeUpdateAt: 10_000, lastUiRuntimeRevision: 4 });
      guard.markUiRuntimeUpdate(state, { uiRuntimeRevision: 5, mockServerUpdatedAt: "2026-06-05T10:00:10.000Z" }, 10_000);
      const result = guard.shouldIgnoreFileRuntimeUpdate(
        state,
        runtime(1),
        {
          scenarios: [{ id: "manual-file-edit" }],
          workspaceMtimeMs: 14_500,
          serverConfigMtimeMs: 5_000,
          scenarioFilesMtimeMs: 14_500,
          editorUpdatedAt: "2026-06-05T10:00:01.000Z",
        },
        "file",
        14_500,
        3000,
      );
      assert.deepEqual(result, { ignore: false, reason: "fresh-file-update" });
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-simple-detach-return-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-simple-detach-return-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("gRPC server-streaming defaults to periodic and hides incoming/scheduled controls", () => {
      const core = read("app/playground/features/mock-server/mock-scenario-core.ts");
      const controls = read("app/playground/features/mock-server/workspace/MockExecutionControls.tsx");
      const services = read("app/playground/features/services/services-workspace.tsx");
    
      assert.match(core, /fallback\.mode \?\? \(isPlainRecord\(value\) \? "scheduled" : undefined\)/);
      assert.match(services, /variant="grpc-stream"/);
      assert.match(controls, /grpcStream && \(normalized\.mode === "incoming" \|\| normalized\.mode === "scheduled"\)/);
      assert.match(controls, /grpcStream \? null : <MenuItem value="incoming">Incoming<\/MenuItem>/);
      assert.match(controls, /grpcStream \? null : <MenuItem value="scheduled">Scheduled<\/MenuItem>/);
      assert.match(controls, /title=\{executionSummary\}/);
      assert.doesNotMatch(controls, /Hybrid keeps the periodic stream running and also allows Send Now/);
    });
    
    test("main window can request a graceful reattach instead of force-closing detached resources", () => {
      const manager = read("electron/window/window-manager.cjs");
      const preload = read("electron/preload.cjs");
      const titlebar = read("app/playground/features/windows/detached-window-titlebar.tsx");
      const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
    
      assert.match(manager, /layang:request-reattach/);
      assert.match(preload, /onRequestReattach/);
      assert.match(titlebar, /onRequestReattach/);
      assert.match(mainPanel, /reattachResource\?\.\("response", activeRequestId\)/);
      assert.match(mainPanel, /reattachResource\("mocking"\)/);
    });
    
  });
}
