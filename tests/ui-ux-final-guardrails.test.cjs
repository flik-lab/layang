"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("final request-tab UX keeps the active tab visible and keyboard focus synchronized", () => {
  const tabs = read("app/playground/features/shell/shell-components.tsx");
  const css = read("app/globals.css");

  assert.match(tabs, /const tabRefs = useRef\(new Map<string, HTMLDivElement>\(\)\)/);
  assert.match(tabs, /scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
  assert.match(tabs, /function activateTabFromKeyboard/);
  assert.match(tabs, /tabRefs\.current\.get\(session\.id\)\?\.focus\(\)/);
  assert.match(css, /\.request-tab__action:focus-visible/);
});

test("final method and scenario UX supports keyboard selection and explicit source editing", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(services, /tabIndex=\{0\}/);
  assert.match(services, /event\.key === " " \|\| event\.key === "Enter"/);
  assert.match(services, /selectMethod\(\)/);
  assert.match(services, /setScenarioActive\(row, true\)/);
  assert.match(services, /openScenarioEditor\(row\)/);
});

test("final shared UI guardrails keep dialogs and mock copy usable", () => {
  const compat = read("components/shadcn/compat.tsx");
  const mock = read("app/playground/features/mock-server/mock-server-panels.tsx");
  const guidelines = read("docs/ui-copy-guidelines.md");
  const evaluation = read("docs/ui-ux-final-evaluation.md");

  assert.match(compat, /flex shrink-0 flex-wrap items-center justify-end/);
  assert.match(mock, /uiCopy\.actions\.reloadFile/);
  assert.match(mock, /uiCopy\.fields\.intervalMs/);
  assert.match(mock, /uiCopy\.helper\.zeroMeansUnlimited/);
  assert.match(mock, /aria-label=\{`Edit \$\{selectedScenarioId \|\| "scenario"\}`\}/);
  assert.doesNotMatch(mock, />Fetch from file<|label="Interval ms"|helperText="0 = infinite"/);
  assert.match(guidelines, /## Final interaction guardrails/);
  assert.match(evaluation, /# Final UI\/UX evaluation/);
});

test("scenario file workflow keeps manual sync visible and Save as the apply boundary", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
  const runtime = read("electron/services/grpc-mock-server.cjs");
  const workspaceSync = read("app/playground/features/mock-server/use-mock-workspace-sync.ts");
  const guidelines = read("docs/ui-copy-guidelines.md");

  const editorStart = services.indexOf("function ScenarioSourceEditor");
  const editorEnd = services.indexOf("function GrpcMockSettingsDialog", editorStart);
  const editor = services.slice(editorStart, editorEnd);

  assert.match(editor, /uiCopy\.actions\.openFolder/);
  assert.match(editor, /uiCopy\.actions\.syncFile/);
  assert.match(editor, /Format/);
  assert.match(editor, /Save/);
  assert.doesNotMatch(editor, /Scenario file actions/);
  assert.match(actions, /openPath\(nextPath, "mocks\/grpc\/methods"/);
  assert.doesNotMatch(runtime, /startMockScenarioWatcher|fsSync\.watch/);
  assert.doesNotMatch(workspaceSync, /setInterval|addEventListener\("focus"/);
  assert.match(guidelines, /Syncing updates the editor draft only/);
});
