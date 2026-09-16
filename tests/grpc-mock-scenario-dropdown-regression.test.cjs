"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("gRPC Mock renders the worker-backed flat catalog instead of nested Proto scenario groups", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const catalog = read("app/playground/features/mock-server/workspace/MockCatalogList.tsx");

  assert.match(services, /<MockCatalogPanel/);
  assert.match(catalog, /useFixedVirtualWindow\(/);
  assert.doesNotMatch(catalog, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
  assert.doesNotMatch(services, /const allScenarioProtoGroups = useMemo/);
  assert.doesNotMatch(services, /scenarioProtoGroups\.map/);
});

test("choosing an active scenario delegates to the existing scenario selection controller", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const row = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");

  assert.match(services, /onScenarioChange=\{handleMockScenarioSelectChange\}/);
  assert.match(row, /onChange=\{\(scenarioId\) => onScenarioChange\(method, scenarioId\)\}/);
});

test("each virtualized method row has an independent active switch", () => {
  const row = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");

  assert.match(row, /checked=\{row\.enabled\}/);
  assert.match(row, /`Enable mock for \$\{row\.methodName\}`/);
  assert.match(row, /onEnabledChange\(method, event\.target\.checked\)/);
});

test("scenario options are concise, lazy, and isolated from row selection", () => {
  const picker = read("app/playground/features/mock-server/workspace/MockScenarioPicker.tsx");
  const row = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");

  assert.match(picker, /onOpen=\{\(\) => void load\(\)\}/);
  assert.match(picker, /mockCatalogStore\.getScenarios\(methodId\)/);
  assert.match(row, /onPointerDown=\{\(event: \{ stopPropagation\(\): void \}\) => event\.stopPropagation\(\)\}/);
  assert.match(row, /onClick=\{\(event: \{ stopPropagation\(\): void \}\) => event\.stopPropagation\(\)\}/);
});

test("scenario settings still use the shared scenario-manager controller", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const row = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");
  const shared = read("app/playground/features/mock-server/grpc-mock-scenario-controls.tsx");

  assert.match(services, /onManageScenario=\{openMockScenarioManager\}/);
  assert.match(row, /onManageScenario\(method, row\.activeScenarioId\)/);
  assert.match(shared, /Edit source/);
  assert.match(shared, /Manage scenarios/);
  assert.match(shared, /Add scenario/);
  assert.match(shared, /Duplicate active/);
  assert.match(shared, /Delete active/);
});
