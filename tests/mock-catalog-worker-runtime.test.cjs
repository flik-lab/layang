"use strict";

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
