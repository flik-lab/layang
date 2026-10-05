"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "mock-catalog-worker-runtime.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("mock-catalog-worker-runtime.test.cjs", () => {
    const __bundleCreateRequire = require("node:module").createRequire;
    const __bundlePath = require("node:path");
    const __bundleBaseDir = __dirname;
    
    
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const vm = require("node:vm");
    const { createMockCatalogFixture } = require("./fixtures/performance-fixtures.cjs");
    
    function loadWorkerRuntime() {
      const sourceFile = fs.readFileSync("app/playground/features/mock-server/catalog/mockCatalogWorkerSource.ts", "utf8");
      const match = sourceFile.match(/MOCK_CATALOG_WORKER_SOURCE = (?:String\.raw)?`([\s\S]*)`;\s*$/);
      assert.ok(match, "mock catalog worker source template must be readable");
      const responses = [];
      const self = { postMessage(value) { responses.push(value); } };
      const context = vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date });
      vm.runInContext(match[1], context, { filename: "mock-catalog-worker-runtime.js" });
      const post = (data) => {
        const requestId = data.requestId || `request-${responses.length + 1}`;
        self.onmessage({ data: { ...data, requestId } });
        const response = responses.findLast((item) => item.requestId === requestId);
        assert.ok(response, `worker response for ${requestId}`);
        if (response.type === "error") throw new Error(response.error);
        return response;
      };
      post({ type: "init", requestId: "init" });
      return { post, responses };
    }
    
    test("mock catalog parses each scenario revision once", () => {
      const { post } = loadWorkerRuntime();
      const fixture = createMockCatalogFixture({ protoCount: 1, methodsPerProto: 2, scenarioCount: 4 });
      post({ type: "sync-methods", inputs: fixture.methods });
      post({ type: "sync-scenario-files", inputs: fixture.scenarioFiles });
      post({ type: "sync-scenario-files", inputs: fixture.scenarioFiles });
      const firstStats = post({ type: "debug-stats" }).stats;
      assert.equal(firstStats.parseCount, fixture.scenarioFiles.length);
    
      const changed = [{ ...fixture.scenarioFiles[0], revision: "fixture-r2" }];
      post({ type: "sync-scenario-files", inputs: changed });
      const secondStats = post({ type: "debug-stats" }).stats;
      assert.equal(secondStats.parseCount, fixture.scenarioFiles.length + 1);
    });
    
    test("mock catalog queries 2,000 methods and 5,000 scenarios without React", () => {
      const { post } = loadWorkerRuntime();
      const fixture = createMockCatalogFixture();
      post({ type: "sync-methods", inputs: fixture.methods });
      post({ type: "sync-scenario-files", inputs: fixture.scenarioFiles });
      post({
        type: "update-runtime",
        input: { selectedScenarioIds: {}, enabledMethods: {}, running: false },
      });
      const response = post({
        type: "query",
        input: { text: "scenario-4999", status: "all", running: false, collapsedProtoIds: [], collapsedServiceIds: [] },
      });
      assert.equal(response.result.summary.totalMethods, 2000);
      assert.equal(response.result.summary.totalScenarios, 5000);
      assert.equal(response.result.summary.visibleMethods, 1);
      assert.ok(response.result.rows.some((row) => row.kind === "method" && row.scenarioCount > 0));
    });
    
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "mock-catalog-metadata-only-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("mock-catalog-metadata-only-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        
        const read = (file) => fs.readFileSync(file, "utf8");
        
        test("mock catalog source sends metadata summaries instead of scenario bodies", () => {
          const runtime = read("app/playground/features/mock-server/catalog/mockCatalogRuntime.ts");
          const types = read("app/playground/features/mock-server/catalog/mockCatalog.types.ts");
          assert.doesNotMatch(runtime, /scenarioText\s*,/);
          assert.match(runtime, /catalogScenarios/);
          assert.doesNotMatch(types, /MockCatalogScenarioFileInput[\s\S]*scenarioText:\s*string/);
          assert.match(types, /scenarioCount:\s*number/);
        });
        
        test("mock catalog worker does not parse JSON or YAML scenario bodies", () => {
          const worker = read("app/playground/features/mock-server/catalog/mockCatalogWorkerSource.ts");
          assert.doesNotMatch(worker, /JSON\.parse\(text\)/);
          assert.doesNotMatch(worker, /parseScenarioFile/);
          assert.doesNotMatch(worker, /scenarioText/);
        });
        
        test("workspace mock reader provides catalog metadata and renderer trusts it without reparsing", () => {
          const main = read("electron/main.cjs");
          const core = read("app/playground/features/mock-server/mock-scenario-core.ts");
          assert.match(main, /catalogScenarios/);
          assert.match(core, /catalogScenarios/);
          assert.match(core, /hasTrustedCatalogMetadata/);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "mock-catalog-performance-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("mock-catalog-performance-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const test = require("node:test");
        const vm = require("node:vm");
        const { performance } = require("node:perf_hooks");
        const { createMockCatalogFixture } = require("./fixtures/performance-fixtures.cjs");
        
        function runtime() {
          const sourceFile = fs.readFileSync("app/playground/features/mock-server/catalog/mockCatalogWorkerSource.ts", "utf8");
          const match = sourceFile.match(/MOCK_CATALOG_WORKER_SOURCE = (?:String\.raw)?`([\s\S]*)`;\s*$/);
          assert.ok(match);
          const responses = [];
          const self = { postMessage(value) { responses.push(value); } };
          vm.runInContext(match[1], vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date }));
          let sequence = 0;
          return (message) => {
            const requestId = `perf-${++sequence}`;
            self.onmessage({ data: { ...message, requestId } });
            const result = responses.findLast((item) => item.requestId === requestId);
            if (result?.type === "error") throw new Error(result.error);
            return result;
          };
        }
        
        test("large catalog search/filter stays within the worker budget after indexing", () => {
          const post = runtime();
          const fixture = createMockCatalogFixture();
          post({ type: "init" });
          post({ type: "sync-methods", inputs: fixture.methods });
          post({ type: "sync-scenario-files", inputs: fixture.scenarioFiles });
          post({ type: "update-runtime", input: { selectedScenarioIds: {}, enabledMethods: {}, running: true } });
        
          const samples = [];
          for (let index = 0; index < 8; index += 1) {
            const started = performance.now();
            const response = post({
              type: "query",
              input: { text: `scenario-${4990 + index}`, status: "all", running: true, collapsedProtoIds: [], collapsedServiceIds: [] },
            });
            samples.push(performance.now() - started);
            assert.ok(response.result.summary.visibleMethods >= 1);
          }
          samples.sort((a, b) => a - b);
          const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
          assert.ok(p95 <= 150, `worker catalog query p95 ${p95.toFixed(1)}ms exceeded 150ms`);
        });
        
      });
    }
    
    {
      const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "mock-catalog-virtualizer-render-loop-regression.test.cjs");
      const require = __bundleCreateRequire(__bundleOrigin);
      const __dirname = __bundlePath.dirname(__bundleOrigin);
      const __filename = __bundleOrigin;
      const { describe: __bundleDescribe } = require("node:test");
      __bundleDescribe("mock-catalog-virtualizer-render-loop-regression.test.cjs", () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const path = require("node:path");
        const test = require("node:test");
        
        const root = path.resolve(__dirname, "..");
        const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
        
        test("Mocking fixed-row windowing avoids TanStack synchronous render loops", () => {
          const sidebar = read("app/playground/features/mock-server/sidebar/MockingSidebar.tsx");
          const workspace = read("app/playground/features/mock-server/workspace/MockCatalogList.tsx");
        
          assert.match(sidebar, /useFixedVirtualWindow\(/);
          assert.match(workspace, /useFixedVirtualWindow\(/);
          assert.doesNotMatch(sidebar, /@tanstack\/react-virtual|useVirtualizer|flushSync|getItemKey\s*:/);
          assert.doesNotMatch(workspace, /@tanstack\/react-virtual|useVirtualizer|flushSync|getItemKey\s*:/);
        });
        
      });
    }
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "mock-schema-auto-discovery-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("mock-schema-auto-discovery-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("Mocking auto-discovers active workspace Proto schemas", () => {
      const helper = read("app/playground/features/mock-server/mock-proto-sources.ts");
      const services = read("app/playground/features/services/services-workspace.tsx");
      const runtimeSync = read("app/playground/features/mock-server/use-mock-runtime-sync.ts");
      const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
    
      assert.match(helper, /library\.lifecycle === "archived"/);
      assert.match(helper, /library\.defaultVersionId/);
      assert.match(services, /resolveEffectiveMockProtoSources\(mockServer\.protoSources, protoLibraries\)/);
      assert.match(services, /Synced automatically from workspace Proto Schemas/);
      assert.match(runtimeSync, /resolveEffectiveMockProtoSources\(mockServer\.protoSources, protoLibraries\)/);
      assert.match(actions, /resolveEffectiveMockProtoSources\(project\.protoSources, protoLibraries\)/);
      assert.match(actions, /Import at least one Proto schema before starting gRPC Mock/);
    });
    
    test("Mock split handles stay visibly gray before hover", () => {
      const split = read("app/playground/features/mock-server/workspace/MockScenarioSplitPane.tsx");
      const services = read("app/playground/features/services/services-workspace.tsx");
    
      for (const source of [split, services]) {
        assert.match(source, /height: 10/);
        assert.match(source, /bgcolor: "var\(--muted\)"/);
        assert.match(source, /borderTop: "1px solid var\(--border-strong\)"/);
        assert.match(source, /bgcolor: "var\(--muted-foreground\)"/);
        assert.match(source, /cursor: "row-resize"/);
      }
    });
    
  });
}
