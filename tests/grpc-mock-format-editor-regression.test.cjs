"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("gRPC mock method source editor supports YAML and JSON with format-specific validation", () => {
  const core = read("app/playground/features/mock-server/mock-scenario-core.ts");
  const services = read("app/playground/features/services/services-workspace.tsx");
  const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
  const yaml = read("app/playground/features/mock-server/mock-scenario-yaml.ts");

  assert.match(core, /export function parseMockScenarioText/);
  assert.match(core, /format === "json" \? JSON\.parse/);
  assert.match(core, /Invalid \$\{format\.toUpperCase\(\)\} scenario file/);
  assert.match(core, /const format: MockFormat = rawFormat === "json" \? "json" : "yaml"/);
  assert.match(core, /const nextFormat: MockFormat = patch\.format \?\? existing\.format/);

  assert.match(
    services,
    /items=\{\[\s*\{ value: "yaml", label: "YAML" \},\s*\{ value: "json", label: "JSON" \},?\s*\]\}/,
  );
  assert.match(services, /function changeEditorFormat\(nextFormat: MockFormat\)/);
  assert.match(services, /\[canonicalFormat, canonicalSource, row\.scenario\.id\]/);
  assert.doesNotMatch(services, /\[canonicalFormat, canonicalSource, row\.scenario\]/);
  assert.match(services, /parseSingleMockScenarioText\(source, editorFormat, mockServer\.port, row\.method\)/);
  assert.match(services, /formatSingleMockScenarioForEditor\(scenario, nextFormat\)/);
  assert.match(services, /onSaveScenario\(parsed\.scenario, editorFormat\)/);
  assert.match(actions, /const extension = file\.format === "yaml" \? "yaml" : "json"/);

  assert.match(yaml, /Array\.isArray\(value\).*value\.length === 0/s);
  assert.match(yaml, /isPlainRecord\(value\).*Object\.keys\(value\)\.length === 0/s);
  assert.match(yaml, /return "\{\}"/);
  assert.match(yaml, /return "\[\]"/);
});

test("manual Sync file loads disk content into the editor draft without applying app state", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
  const controller = read("app/playground/features/mock-server/use-grpc-mock-controller.ts");

  assert.match(services, /async function syncFile\(\)/);
  assert.match(services, /Replace unsaved editor changes with the latest scenario file from disk/);
  assert.match(services, /const refreshed = await onFetchFile\(\)/);
  assert.match(services, /getMockMethodScenarioFile\(refreshed, row\.method\)/);
  assert.match(services, /syncingFile \? "Syncing…" : uiCopy\.actions\.syncFile/);
  assert.doesNotMatch(services, /setBaselineSource\(latestSource\)/);
  assert.doesNotMatch(services, /setBaselineFormat\(latestFile\.format\)/);
  assert.match(actions, /applyToState: false/);
  assert.match(actions, /Save to apply it/);
  assert.match(controller, /options\.applyToState !== false/);
  assert.match(actions, /return refreshed/);
});

test("Open folder flushes the latest workspace and opens canonical gRPC method files", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");

  assert.match(services, /onOpenFolder\(\)/);
  assert.match(actions, /async function openMockScenarioFolder\(\)/);
  assert.match(actions, /let nextPath = workspaceFolderPath/);
  assert.match(actions, /if \(!nextPath\) \{/);
  assert.match(actions, /await persistProjectSnapshotNow\?\.\(project\)/);
  assert.match(actions, /const diskMockServer = mockServerRef\?\.current \?\? mockServer/);
  assert.match(actions, /openPath\(nextPath, "mocks\/grpc\/methods"/);
});

test("legacy workspace persistence preserves each method source format", () => {
  const main = read("electron/main.cjs");

  assert.match(main, /format: mockServerProject\.format === "json" \? "json" : "yaml"/);
  assert.match(main, /const extension = sourceFormat === "json" \? "json" : "yaml"/);
  assert.match(main, /manifest\.methods\[key\] = \{ format: sourceFormat, scenarios: \{\} \}/);
  assert.match(main, /if \(sourceFormat === "json"\) await writeJson/);
  assert.match(main, /else await writeTextInside\(scenariosDir, relativeFile, stringifyWorkspaceYaml\(scenario\)\)/);
  assert.match(main, /methodScenarioGroups\[key\] = \{ format: methodFormat, scenarios: \[\] \}/);
});
