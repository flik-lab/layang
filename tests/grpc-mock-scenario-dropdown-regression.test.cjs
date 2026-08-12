"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("gRPC Mock groups active-scenario controls by Proto service and method", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(services, /const allScenarioProtoGroups = useMemo<ScenarioProtoGroup\[]>/);
  assert.match(services, /scenarioProtoGroups\.map\(\(proto\)/);
  assert.match(services, /proto\.services\.map\(\(service\)/);
  assert.match(services, /service\.methods\.map\(\(method\)/);
  assert.match(services, /Active scenario/);
  assert.match(services, /Active scenario for \$\{method\.method\.methodName\}/);
});

test("choosing an active scenario only updates the workspace selection", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const selectionStart = services.indexOf(
    "function selectScenarioFromMethod(method: ScenarioMethodGroup, scenarioId: string)",
  );
  const selectionEnd = services.indexOf("\n  function attachSource()", selectionStart);
  const selectionBlock = services.slice(selectionStart, selectionEnd);

  assert.match(selectionBlock, /setMockServer\(\(current: MockServerProject\) => \(\{/);
  assert.match(selectionBlock, /selectedScenarioIds:[\s\S]*?\[key\]: scenarioId/);
  assert.doesNotMatch(selectionBlock, /enabledMethods/);
  assert.doesNotMatch(selectionBlock, /setScenarioActive\(/);
  assert.doesNotMatch(selectionBlock, /handleMockScenarioSelectChange\(/);
  assert.doesNotMatch(services, /if \(attached\) \{[\s\S]{0,160}setNewOpen\(true\)/);
});

test("each workspace method has an independent active switch", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(services, /checked=\{method\.enabled\}/);
  assert.match(services, /`Enable mock for \$\{method\.method\.methodName\}`/);
  assert.match(
    services,
    /handleMockMethodEnabledChange\(method\.method, event\.target\.checked\)/,
  );
});

test("active scenario dropdown uses native text options and isolates row click handling", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(services, /const optionLabel =\s*displayName === row\.scenario\.id/);
  assert.match(
    services,
    /<MenuItem key=\{`\$\{key\}:\$\{row\.scenario\.id\}`\} value=\{row\.scenario\.id\}>\s*\{optionLabel\}\s*<\/MenuItem>/,
  );
  assert.doesNotMatch(services, /renderValue=\{/);
  assert.match(services, /onPointerDown=\{\(event: any\) => event\.stopPropagation\(\)\}/);
});

test("scenario settings keep edit and destructive actions outside the compact method row", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(services, /Scenario settings/);
  assert.match(services, /Edit source/);
  assert.match(services, /Manage scenarios/);
  assert.match(services, /Duplicate active/);
  assert.match(services, /Delete active/);
  assert.match(services, /aria-label="Method scenarios"/);
});
