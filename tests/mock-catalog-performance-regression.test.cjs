"use strict";

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
