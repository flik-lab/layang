"use strict";

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
