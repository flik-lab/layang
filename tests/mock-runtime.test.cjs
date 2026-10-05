"use strict";

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
