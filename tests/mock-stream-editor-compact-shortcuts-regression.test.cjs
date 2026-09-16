"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("mocking scenario and source popup share compact interval loop count controls", () => {
  const panels = read("app/playground/features/mock-server/mock-server-panels.tsx");
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(panels, /"aria-label": "Scenario interval \(ms\)"/);
  assert.match(panels, /"aria-label": "Scenario loop"/);
  assert.match(panels, /"aria-label": "Scenario loop count"/);
  assert.match(panels, /0 = unlimited/);
  assert.doesNotMatch(panels, /label="Interval \(ms\)"/);
  assert.doesNotMatch(panels, /label="Count"/);
  assert.match(panels, /<Typography variant="caption">Interval \(ms\)<\/Typography>/);
  assert.match(panels, /<Typography variant="caption">Count<\/Typography>/);

  assert.match(services, /const intervalMs = Math\.max\(/);
  assert.match(services, /"aria-label": `Interval \(ms\) \$\{row\.scenario\.id\}`/);
  assert.match(services, /"aria-label": `Loop \$\{row\.scenario\.id\}`/);
  assert.match(services, /"aria-label": uiCopy\.fields\.loopCount/);
  assert.match(services, /0 = unlimited/);
  assert.doesNotMatch(services, /Overrides global stream defaults/);
  assert.doesNotMatch(services, /label="Interval \(ms\)"/);
  assert.doesNotMatch(services, /label="Count"/);
  assert.match(services, /<Typography variant="caption">Interval \(ms\)<\/Typography>/);
  assert.match(services, /<Typography variant="caption">Count<\/Typography>/);
});

test("both mock scenario editors save with Ctrl or Cmd plus S", () => {
  const panels = read("app/playground/features/mock-server/mock-server-panels.tsx");
  const services = read("app/playground/features/services/services-workspace.tsx");

  for (const source of [panels, services]) {
    assert.match(source, /event\.ctrlKey \|\| event\.metaKey/);
    assert.match(source, /event\.key\.toLowerCase\(\) !== "s"/);
    assert.match(source, /event\.preventDefault\(\)/);
  }
  assert.match(panels, /onSaveScenarioText\(\)/);
  assert.match(services, /save\(\)/);
});

test("mocking sidebar exposes a right aligned gRPC home settings action", () => {
  const sidebar = read("app/playground/features/mock-server/sidebar/MockingSidebar.tsx");
  const shell = read("app/playground/features/shell/workbench-sidebar.tsx");

  assert.match(sidebar, /onOpenGrpcHome\(\): void/);
  assert.match(sidebar, /title="gRPC Home \/ Settings"/);
  assert.match(sidebar, /aria-label="gRPC Home \/ Settings"/);
  assert.match(sidebar, /<Settings/);
  assert.match(shell, /onOpenGrpcHome=\{\(\) => \{/);
  assert.match(shell, /setMockSelectedMethodKey\(grpcMockOverviewMethodKey\)/);
  assert.match(shell, /setServiceProtocol\("grpc-mock"\)/);
});

test("focused mocking editor keeps periodic controls one compact row and supports save shortcut", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.doesNotMatch(services, /helperText=\{focusedLoop \? "0 = unlimited"/);
  assert.match(services, /0 = unlimited/);
  assert.match(services, /function saveLocalEditor\(\)/);
  assert.match(services, /saveLocalEditor\(\);/);
  assert.match(services, /aria-keyshortcuts="Control\+S Meta\+S"/);
});


test("mock catalog status badge keeps breathing room from picker and toggle", () => {
  const row = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");

  assert.match(row, /gridTemplateColumns: "minmax\(150px, 1\.05fr\) minmax\(180px, 1\.4fr\) 82px 64px 34px"/);
  assert.match(row, /<Chip size="small" color=\{color\} variant=\{row\.status === "live" \? undefined : "outlined"\} label=\{label\} sx=\{\{ height: 22, mx: 0\.5 \}\} \/>/);
});
