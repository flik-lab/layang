"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Mocking catalog is flat, virtualized, and no longer parses scenario files during render", () => {
  const catalogList = read("app/playground/features/mock-server/workspace/MockCatalogList.tsx");
  const catalogRow = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");
  const services = read("app/playground/features/services/services-workspace.tsx");
  assert.match(catalogList, /useFixedVirtualWindow\(/);
  assert.doesNotMatch(catalogList, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
  assert.match(catalogRow, /MockScenarioPicker/);
  assert.doesNotMatch(catalogList, /parseMockScenarioText\(/);
  assert.doesNotMatch(catalogRow, /parseMockScenarioText\(/);
  assert.doesNotMatch(services, /const allScenarioRows = useMemo/);
  assert.doesNotMatch(services, /const allScenarioProtoGroups = useMemo/);
});

test("scenario options are loaded only when one picker opens", () => {
  const picker = read("app/playground/features/mock-server/workspace/MockScenarioPicker.tsx");
  assert.match(picker, /onOpen/);
  assert.match(picker, /getScenarios\(methodId\)/);
  assert.doesNotMatch(picker, /allScenarioRows/);
});

test("legacy Mocking sidebar implementation is retired", () => {
  assert.equal(fs.existsSync(path.join(root, "app/playground/features/services/mocking-sidebar-tree.tsx")), false);
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  assert.match(sidebar, /MockingSidebar/);
  assert.doesNotMatch(sidebar, /MockingSidebarTree/);
});
