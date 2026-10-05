"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "mock-execution-engine.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("mock-execution-engine.test.cjs", () => {
    const assert = require('node:assert/strict');
    const test = require('node:test');
    
    const {
      executionAllows,
      executionSummary,
      getNextScheduleAt,
      normalizeMockExecution,
    } = require('../lib/mock-execution-engine.cjs');
    
    test('legacy live-push migrates to standby/manual execution', () => {
      const execution = normalizeMockExecution(undefined, { streamMode: 'live-push' });
      assert.equal(execution.mode, 'standby');
      assert.equal(execution.manual, true);
      assert.equal(execution.incoming, false);
      assert.equal(execution.periodic.enabled, false);
    });
    
    test('legacy scheduled stream migrates to periodic execution without losing cadence', () => {
      const execution = normalizeMockExecution(undefined, {
        streamMode: 'scheduled',
        intervalMs: 250,
        loop: true,
        maxLoops: 4,
      });
      assert.equal(execution.mode, 'periodic');
      assert.equal(execution.periodic.enabled, true);
      assert.equal(execution.periodic.intervalMs, 250);
      assert.equal(execution.periodic.loop, true);
      assert.equal(execution.periodic.maxExecutions, 4);
    });
    
    test('hybrid defaults to standby plus periodic so REST does not immediately bypass deferred triggers', () => {
      const execution = normalizeMockExecution({ mode: 'hybrid' });
      assert.equal(execution.incoming, false);
      assert.equal(execution.manual, true);
      assert.equal(execution.periodic.enabled, true);
      assert.equal(execution.schedule.enabled, false);
    });
    
    test('hybrid execution can combine incoming manual periodic and scheduled triggers', () => {
      const execution = normalizeMockExecution({
        mode: 'hybrid',
        incoming: true,
        manual: true,
        periodic: { enabled: true, intervalMs: 100, loop: true, maxExecutions: 0 },
        schedule: { enabled: true, at: '2026-09-27T12:00:00.000Z', repeatMs: 60000 },
      });
      assert.equal(executionAllows(execution, 'incoming'), true);
      assert.equal(executionAllows(execution, 'manual'), true);
      assert.equal(executionAllows(execution, 'periodic'), true);
      assert.equal(executionAllows(execution, 'scheduled'), true);
      assert.deepEqual(executionSummary(execution), ['incoming', 'manual', 'periodic', 'scheduled']);
    });
    
    test('recurring schedule advances to the next future occurrence', () => {
      const now = Date.parse('2026-09-27T12:05:30.000Z');
      const next = getNextScheduleAt({
        enabled: true,
        at: '2026-09-27T12:00:00.000Z',
        repeatMs: 60000,
      }, now);
      assert.equal(next, Date.parse('2026-09-27T12:06:00.000Z'));
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "mock-global-runtime-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("mock-global-runtime-regression.test.cjs", () => {
    const assert = require('node:assert/strict');
    const http = require('node:http');
    const test = require('node:test');
    
    const {
      getRestMockServerStatus,
      sendRestMockResponse,
      startRestMockServer,
      stopRestMockServer,
      updateRestMockServer,
    } = require('../electron/services/rest-mock-server.cjs');
    const { normalizeWebSocketMockConfig } = require('../electron/services/ws-mock-server.cjs');
    
    async function reservePort() {
      const server = http.createServer();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const port = server.address().port;
      await new Promise((resolve) => server.close(resolve));
      return port;
    }
    
    function request(port, path = '/jobs/42') {
      return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }));
        });
        req.on('error', reject);
      });
    }
    
    function scenario(mode, executionPatch = {}) {
      return {
        id: `rest-${mode}`,
        requestId: 'legacy-request-id',
        name: `REST ${mode}`,
        enabled: true,
        method: 'GET',
        path: '/jobs/:id',
        status: 200,
        headers: [{ key: 'content-type', value: 'application/json' }],
        body: JSON.stringify({ ok: true, id: '{{request.path.id}}' }),
        execution: {
          mode,
          incoming: mode === 'incoming',
          manual: mode === 'standby',
          periodic: { enabled: mode === 'periodic', intervalMs: 35, loop: true, maxExecutions: 0 },
          schedule: { enabled: false },
          timeoutMs: 1000,
          ...executionPatch,
        },
      };
    }
    
    test('REST standby keeps request pending until a global manual release', async (t) => {
      const port = await reservePort();
      await startRestMockServer({ port, bindHost: '127.0.0.1', scenarios: [scenario('standby')] });
      t.after(async () => { await stopRestMockServer(); });
    
      const responsePromise = request(port);
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(getRestMockServerStatus().pendingCount, 1);
    
      const release = sendRestMockResponse({ scenarioId: 'rest-standby' });
      assert.equal(release.sent, 1);
    
      const response = await responsePromise;
      assert.equal(response.status, 200);
      assert.equal(response.headers['x-layang-rest-mock-trigger'], 'manual');
      assert.match(response.body, /"id":"42"/);
      assert.equal(getRestMockServerStatus().pendingCount, 0);
    });
    
    test('REST periodic execution releases pending requests without request-owned runtime state', async (t) => {
      const port = await reservePort();
      await startRestMockServer({ port, bindHost: '127.0.0.1', scenarios: [scenario('periodic')] });
      t.after(async () => { await stopRestMockServer(); });
    
      const response = await request(port);
      assert.equal(response.status, 200);
      assert.equal(response.headers['x-layang-rest-mock-trigger'], 'periodic');
    });
    
    test('REST hot update changes execution mode without restarting the endpoint', async (t) => {
      const port = await reservePort();
      await startRestMockServer({ port, bindHost: '127.0.0.1', scenarios: [scenario('incoming')] });
      t.after(async () => { await stopRestMockServer(); });
      const startedAt = getRestMockServerStatus().startedAt;
    
      await updateRestMockServer({ port, bindHost: '127.0.0.1', scenarios: [scenario('standby')] });
      assert.equal(getRestMockServerStatus().startedAt, startedAt);
    
      const responsePromise = request(port);
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(getRestMockServerStatus().pendingCount, 1);
      sendRestMockResponse({ scenarioId: 'rest-standby' });
      const response = await responsePromise;
      assert.equal(response.headers['x-layang-rest-mock-trigger'], 'manual');
    });
    
    test('WebSocket config migrates requestId to provenance and normalizes hybrid triggers globally', () => {
      const config = normalizeWebSocketMockConfig({
        port: 8090,
        scenarios: [{
          id: 'ws-global',
          requestId: 'legacy-request-id',
          name: 'Hybrid WS',
          path: '/events',
          enabled: true,
          responseText: '[{"event":"tick"}]',
          execution: {
            mode: 'hybrid',
            incoming: true,
            manual: true,
            periodic: { enabled: true, intervalMs: 250, loop: true, maxExecutions: 0 },
            schedule: { enabled: true, at: '2099-01-01T00:00:00.000Z', repeatMs: 0 },
          },
        }],
      });
      const item = config.scenarios[0];
      assert.equal(item.sourceRequestId, 'legacy-request-id');
      assert.equal(Object.hasOwn(item, 'requestId'), false);
      assert.equal(item.execution.incoming, true);
      assert.equal(item.execution.manual, true);
      assert.equal(item.execution.periodic.enabled, true);
      assert.equal(item.execution.schedule.enabled, true);
      assert.equal(item.streamOnConnect, true);
      assert.equal(item.sendOnMessage, true);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "mock-runtime-switcher-source-control-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("mock-runtime-switcher-source-control-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("Mocking exposes independent runtime switches and keeps gRPC Mock settings", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      assert.match(services, /function MockRuntimeStrip/);
      assert.match(services, /label: "gRPC Mock"/);
      assert.match(services, /label: "Web Access"/);
      assert.match(services, /label: "REST Mock"/);
      assert.match(services, /label: "WebSocket Mock"/);
      assert.match(services, /endpoint: grpcEndpoint/);
      assert.match(services, /endpoint: webEndpoint/);
      assert.match(services, /endpoint: restEndpoint/);
      assert.match(services, /endpoint: websocketEndpoint/);
      assert.doesNotMatch(services, /fontFamily: "monospace", fontSize: 10/);
      assert.match(services, /onToggle\(item\.kind, event\.target\.checked\)/);
      assert.match(services, />\s*Mock Settings\s*<\/Button>/);
      assert.match(services, /<GrpcMockSettingsDialog/);
      assert.match(services, /aria-label="Scenario settings"/);
    });
    
    test("Source Control does not render a duplicate outer Git changes sidebar", () => {
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const main = read("app/playground/features/shell/workbench-main-panel.tsx");
      const git = read("app/playground/features/git/git-source-control-v2.tsx");
    
      assert.doesNotMatch(sidebar, /GitSourceControlSidebar/);
      assert.doesNotMatch(model, /useState<SideSection>\("collections"\)/);
      assert.match(sidebar, /sideSection !== "source-control"/);
      assert.match(main, /<GitSourceControlWorkspace/);
      assert.match(git, /<GitPageTabs/);
      assert.match(git, /<ChangesPage/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "mock-runtime.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("mock-runtime.test.cjs", () => {
    const __bundleCreateRequire = require("node:module").createRequire;
    const __bundlePath = require("node:path");
    const __bundleBaseDir = __dirname;
    
    
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const runtime = require("../lib/mock-runtime.cjs");
    
    test("equals matcher ignores object key order", () => {
      assert.equal(runtime.mockMatcherMatches({ equals: { b: 2, a: 1 } }, { a: 1, b: 2 }), true);
    });
    
    test("contains matcher rejects empty objects so streams cannot match everything accidentally", () => {
      assert.equal(runtime.hasValidRuntimeMatcher({ contains: {} }), false);
      assert.equal(runtime.mockMatcherMatches({ contains: {} }, { name: "Alice" }), false);
    });
    
    test("or matcher accepts any valid nested matcher", () => {
      const matcher = {
        or: [{ equals: { name: "Alice" } }, { contains: { name: "Bob" } }],
      };
      assert.equal(runtime.mockMatcherMatches(matcher, { name: "Bobby Tables" }), true);
      assert.equal(runtime.mockMatcherMatches(matcher, { name: "Charlie" }), false);
    });
    
    test("selected scenario is the only scenario considered for a method", () => {
      const method = { serviceName: "demo.v1.Greeter", methodName: "SayHello" };
      const scenarios = [
        { id: "success", service: "demo.v1.Greeter", method: "SayHello", input: { equals: { name: "Alice" } } },
        { id: "other", service: "demo.v1.Greeter", method: "SayHello", input: { equals: { name: "Bob" } } },
      ];
      const match = runtime.findMatchingMockScenario(
        method,
        { name: "Bob" },
        scenarios,
        { "demo.v1.Greeter/SayHello": "success" },
        {},
      );
      assert.equal(match, undefined);
    });
    
    test("disabled method returns no active scenarios", () => {
      const method = { serviceName: "demo.v1.Greeter", methodName: "SayHello" };
      const scenarios = [
        { id: "success", service: "demo.v1.Greeter", method: "SayHello", input: { equals: { name: "Alice" } } },
      ];
      const active = runtime.getActiveRuntimeScenariosForMethod(
        method,
        scenarios,
        {},
        { "demo.v1.Greeter/SayHello": false },
      );
      assert.deepEqual(active, []);
    });
    
    test("stream settings normalize interval loop and infinite max loop", () => {
      assert.deepEqual(
        runtime.normalizeRuntimeStreamSettings(
          { interval_ms: "1250", loop: true, max_loops: 0 },
          { intervalMs: 500, loop: false, maxLoops: 1 },
        ),
        { intervalMs: 1250, loop: true, maxLoops: 0 },
      );
    });
    
    test("missing input behaves as a match-any fallback stub", () => {
      assert.equal(runtime.mockMatcherMatches(undefined, { name: "anyone" }), true);
    });
    
    test("equals_unordered matcher ignores array order recursively", () => {
      assert.equal(
        runtime.mockMatcherMatches(
          { equals_unordered: { tags: ["beta", "alpha"], nested: [{ id: 2 }, { id: 1 }] } },
          { tags: ["alpha", "beta"], nested: [{ id: 1 }, { id: 2 }] },
        ),
        true,
      );
    });
    
    test("matches matcher supports regex field matching", () => {
      assert.equal(
        runtime.mockMatcherMatches({ matches: { name: "^ali.*", code: "^[0-9]{3}$" } }, { name: "alice", code: 200 }),
        true,
      );
      assert.equal(runtime.mockMatcherMatches({ matches: { name: "^bob" } }, { name: "alice" }), false);
    });
    
    test("glob matcher supports wildcard matching", () => {
      assert.equal(runtime.mockMatcherMatches({ glob: { route: "/api/*/tracks/?" } }, { route: "/api/v1/tracks/a" }), true);
      assert.equal(
        runtime.mockMatcherMatches({ glob: { route: "/api/*/tracks/?" } }, { route: "/api/v1/tracks/abc" }),
        false,
      );
    });
    
    test("headers matcher can be combined with request data matcher", () => {
      assert.equal(
        runtime.mockMatcherMatches(
          { contains: { id: "A1" }, headers: { contains: { authorization: "Bearer" } } },
          { data: { id: "A1" }, headers: { authorization: "Bearer token" } },
        ),
        true,
      );
      assert.equal(
        runtime.mockMatcherMatches(
          { contains: { id: "A1" }, headers: { contains: { authorization: "Bearer" } } },
          { data: { id: "A1" }, headers: { authorization: "Basic token" } },
        ),
        false,
      );
    });
    
    test("live push sends multiple on-demand messages through the same open gRPC stream", () => {
      const { createGrpcMockLivePushRegistry } = require("../lib/grpc-mock-live-push.cjs");
      const registry = createGrpcMockLivePushRegistry();
      const writes = [];
      let ended = 0;
      const unregister = registry.register({
        call: {
          write(value) {
            writes.push(value);
            return true;
          },
          end() {
            ended += 1;
          },
        },
        serviceName: "demo.TrackService",
        methodName: "WatchTracks",
        scenarioId: "live-track",
        requestContext: { data: { subscriber: "alpha" } },
      });
    
      registry.send({
        serviceName: "demo.TrackService",
        methodName: "WatchTracks",
        scenarioId: "live-track",
        resolveOutput: () => ({ data: { id: "T1", x: 10 } }),
      });
      registry.send({
        serviceName: "demo.TrackService",
        methodName: "WatchTracks",
        scenarioId: "live-track",
        resolveOutput: () => ({ data: { id: "T1", x: 20 } }),
      });
    
      assert.deepEqual(writes, [{ id: "T1", x: 10 }, { id: "T1", x: 20 }]);
      assert.equal(ended, 0);
      assert.equal(registry.count({ serviceName: "demo.TrackService", methodName: "WatchTracks" }), 1);
      unregister();
      assert.equal(registry.count({ serviceName: "demo.TrackService", methodName: "WatchTracks" }), 0);
    });
    
    
    
    test("manual live push can select one or all responses from any saved scenario", () => {
      const { selectGrpcMockManualResponses } = require("../lib/grpc-mock-live-push.cjs");
      const scenario = {
        id: "warning",
        stream: {
          responses: [
            { data: { id: "A", state: "one" } },
            { data: { id: "A", state: "two" } },
            { data: { id: "A", state: "three" } },
          ],
        },
      };
    
      assert.deepEqual(selectGrpcMockManualResponses(scenario, { responseIndex: 1 }), [
        { data: { id: "A", state: "two" } },
      ]);
      assert.deepEqual(selectGrpcMockManualResponses(scenario, { sendAll: true }), scenario.stream.responses);
    });
    
    test("utility mock runtime routes grpc live push send", async () => {
      const { createMockRuntime } = require("../lib/runtime/mock/mock-runtime.cjs");
      const calls = [];
      const mockRuntime = createMockRuntime({
        services: {
          grpc: {
            start: async () => ({ running: true }),
            update: async () => ({ running: true }),
            stop: async () => ({ running: false }),
            status: async () => ({ running: true, activeLivePushStreamCount: 1 }),
            send: async (payload) => {
              calls.push(payload);
              return { running: true, sent: 1 };
            },
          },
          rest: { start() {}, update() {}, stop() {}, status: () => ({ running: false }) },
          websocket: { start() {}, update() {}, send() {}, stop() {}, status: () => ({ running: false }) },
        },
      });
    
      const result = await mockRuntime.handle("mock.grpc.send", {
        serviceName: "demo.TrackService",
        methodName: "WatchTracks",
        scenarioId: "live-track",
        responseIndex: 2,
      });
    
      assert.equal(result.sent, 1);
      assert.deepEqual(calls, [{ serviceName: "demo.TrackService", methodName: "WatchTracks", scenarioId: "live-track", responseIndex: 2 }]);
      await mockRuntime.dispose();
    });
    
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "mock-runtime-event-driven-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("mock-runtime-event-driven-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const path = require("node:path");
        const test = require("node:test");
        
        const ROOT = path.join(__dirname, "..");
        
        function read(relativePath) {
          return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
        }
        
        test("utility-mode mock runtime is event-driven and creates no grpc/rest/websocket status interval", () => {
          const polling = read("app/playground/features/mock-server/runtime/useMockRuntimePolling.ts");
          const events = read("app/playground/features/mock-server/runtime/useMockRuntimeEvents.ts");
          const shell = read("app/playground/features/shell/use-workbench-container-model.tsx");
        
          assert.match(events, /electronRuntime\?\.onEvent/);
          assert.match(events, /mock\.statusChanged/);
          assert.match(events, /patchGrpc/);
          assert.match(events, /patchRest/);
          assert.match(events, /patchWebSocket/);
          assert.match(shell, /useMockRuntimeEvents\(\)/);
          assert.match(polling, /runtimeModeRef\.current === "utility"/);
        
          const utilityGuard = polling.indexOf('runtimeModeRef.current === "utility"');
          const grpcInterval = polling.indexOf("1500");
          assert.ok(utilityGuard >= 0 && utilityGuard < grpcInterval, "utility guard must precede mock polling intervals");
        });
        
        test("mock runtime telemetry exposes dedicated runtime status poll rate", () => {
          const types = read("app/playground/features/mock-server/runtime/mockRuntime.types.ts");
          const store = read("app/playground/features/mock-server/runtime/mockRuntime.store.ts");
          const perf = read("app/playground/shared/performance/performance-stats.store.ts");
        
          assert.match(types, /runtimeStatusPolls: number/);
          assert.match(store, /recordRuntimeStatusPoll/);
          assert.match(perf, /runtimeStatusPollsPerSec/);
        });
        
        
        test("utility runtime crash clears grpc/rest/websocket running status until explicitly restarted", () => {
          const events = read("app/playground/features/mock-server/runtime/useMockRuntimeEvents.ts");
          assert.match(events, /runtime\.unavailable/);
          assert.match(events, /patchGrpc\(\{ running: false/);
          assert.match(events, /patchRest\(\{ running: false/);
          assert.match(events, /patchWebSocket\(\{ running: false/);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "mock-runtime-external-store-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("mock-runtime-external-store-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        const read = (path) => fs.readFileSync(path, "utf8");
        
        test("mock runtime status is owned by a semantic external store", () => {
          const store = read("app/playground/features/mock-server/runtime/mockRuntime.store.ts");
          assert.match(store, /subscribe/);
          assert.match(store, /patchGrpc/);
          assert.match(store, /patchRest/);
          assert.match(store, /patchWebSocket/);
          assert.match(store, /patchWebAccess/);
          assert.match(store, /semanticEqual/);
          assert.match(store, /publishedChanges/);
        });
        
        test("protocol controllers do not own runtime status with React useState", () => {
          const grpc = read("app/playground/features/mock-server/use-grpc-mock-controller.ts");
          const rest = read("app/playground/features/rest/use-rest-controller.ts");
          const ws = read("app/playground/features/websocket/use-websocket-controller.ts");
          assert.doesNotMatch(grpc, /useState<MockServerStatus>/);
          assert.doesNotMatch(rest, /useState<RestMockStatus>/);
          assert.doesNotMatch(ws, /useState<WebSocketMockStatus>/);
          assert.match(grpc, /mockRuntimeStore/);
          assert.match(rest, /mockRuntimeStore/);
          assert.match(ws, /mockRuntimeStore/);
        });
        
        test("status bar subscribes directly instead of reading four runtime statuses from ctx", () => {
          const statusBar = read("app/playground/features/shell/workbench-status-bar.tsx");
          assert.match(statusBar, /useGrpcMockRuntimeStatus/);
          assert.match(statusBar, /useRestMockRuntimeStatus/);
          assert.match(statusBar, /useWebSocketMockRuntimeStatus/);
          assert.match(statusBar, /useWebAccessRuntimeStatus/);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "mock-runtime-ssr-safety-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("mock-runtime-ssr-safety-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        
        test("mock runtime polling does not read window during server render", () => {
          const source = fs.readFileSync("app/playground/features/mock-server/runtime/useMockRuntimePolling.ts", "utf8");
          assert.match(source, /function getInitialRuntimeMode/);
          assert.match(source, /typeof window === "undefined"/);
          assert.match(source, /useRef<"main" \| "utility">\(getInitialRuntimeMode\(\)\)/);
          assert.doesNotMatch(source, /useRef<"main" \| "utility">\(window\.electronRuntime/);
        });
        
      });
    }
    
  });
}
