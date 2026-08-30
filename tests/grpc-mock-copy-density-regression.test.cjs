"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("shared mock copy uses the P0 terminology", () => {
  const copy = read("app/playground/shared/ui-copy.ts");
  const guidelines = read("docs/ui-copy-guidelines.md");
  const rest = read("app/playground/features/rest/rest-panels.tsx");
  const mockPanels = read("app/playground/features/mock-server/mock-server-panels.tsx");

  assert.match(copy, /addScenario: "Add scenario"/);
  assert.match(copy, /reloadFile: "Reload file"/);
  assert.match(copy, /syncFile: "Sync file"/);
  assert.match(copy, /openFolder: "Open folder"/);
  assert.match(copy, /showInFolder: "Show in folder"/);
  assert.match(copy, /revert: "Revert"/);
  assert.match(copy, /unmatched: "Unmatched"/);
  assert.match(copy, /intervalMs: "Interval \(ms\)"/);
  assert.match(copy, /loopCount: "Loop count"/);
  assert.match(guidelines, /Use sentence case/);
  assert.doesNotMatch(rest, /label="Bind IP"/);
  assert.doesNotMatch(mockPanels, /label="Max loops"/);
});

test("gRPC mock groups methods by Proto and keeps scenarios in an active dropdown", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const editorStart = services.indexOf("function ScenarioSourceEditor");
  const editorEnd = services.indexOf("function GrpcMockSettingsDialog", editorStart);
  const editor = services.slice(editorStart, editorEnd);
  const panelStart = services.indexOf('{tab === "scenarios" && (');
  const panelEnd = services.indexOf('{tab === "proto" && (', panelStart);
  const panel = services.slice(panelStart, panelEnd);

  assert.match(panel, /scenarioProtoGroups\.map/);
  assert.match(panel, /proto\.services\.map/);
  assert.match(panel, /Scenario\s*<\/Typography>/);
  assert.match(panel, /selectScenarioFromMethod\(method, String\(event\.target\.value\)\)/);
  assert.match(panel, /Scenario settings/);
  const sharedControls = read("app/playground/features/mock-server/grpc-mock-scenario-controls.tsx");
  assert.match(services, /<GrpcMockScenarioActionsMenu/);
  assert.match(sharedControls, /Manage scenarios/);
  assert.doesNotMatch(panel, /aria-label="gRPC Mock scenarios"/);
  assert.doesNotMatch(panel, /Loop responses/);

  assert.match(editor, /uiCopy\.status\.active/);
  assert.match(editor, /uiCopy\.status\.unsaved/);
  assert.match(editor, /uiCopy\.actions\.openFolder/);
  assert.match(editor, /uiCopy\.actions\.syncFile/);
  assert.match(editor, /onOpenFolder\(\)/);
  assert.match(editor, /onClick=\{\(\) => void syncFile\(\)\}/);
  assert.doesNotMatch(editor, /Scenario file actions/);
  assert.match(editor, /compactScenarioEditorError/);
  assert.match(editor, /Repeats until the client disconnects/);
  assert.doesNotMatch(editor, /label="1 scenario"/);
  assert.doesNotMatch(editor, /Only this scenario is shown/);
  assert.doesNotMatch(editor, /Open file location|Fetch file|Discard/);
});
