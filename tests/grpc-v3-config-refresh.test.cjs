"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (name) => readFileSync(path.join(root, name), "utf8");

test("gRPC renderer does not hydrate the retired editor or request legacy mock files", () => {
  const controller = read("app/playground/features/mock-server/use-grpc-mock-controller.ts");
  const shell = read("app/playground/features/shell/use-workbench-container-model.tsx");
  const preload = read("electron/preload.cjs");
  assert.doesNotMatch(controller, /readMockServer|mockScenarioEditorDraft/);
  assert.doesNotMatch(shell, /currentMockParse|parseAllMockScenarioFiles/);
  assert.doesNotMatch(preload, /workspace:read-mock-server/);
});

test("Native and Web Access startup do not require the retired in-memory gRPC editor", () => {
  const source = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
  const start = source.slice(source.indexOf("async function startMockRuntime("),source.indexOf("async function startMockServer("));
  const web = source.slice(source.indexOf("async function startWebAccess("),source.indexOf("async function stopWebAccess("));
  assert.doesNotMatch(start, /ensureMockScenarioEditorSaved/);
  assert.doesNotMatch(web, /ensureMockScenarioEditorSaved/);
  assert.match(source, /openPath\(nextPath, "mocks\/grpc\/scenarios"/);
  assert.doesNotMatch(start, /Object\.keys\(effectiveMockServer\.methodFiles/);
});

test("runtime accepts only compiled canonical scenario arrays", () => {
  const service = read("electron/services/grpc-mock-server.cjs");
  assert.match(service, /return Array\.isArray\(payload\?\.scenarios\) \? payload\.scenarios : \[\]/);
  assert.doesNotMatch(service, /parseScenarioBundle|payload\?\.methodFiles/);
});

test("CI keeps real gRPC E2E and Electron window smoke as explicit quality gates", () => {
  // verify-pr.yaml and release.yaml both call the shared gate in verify.yaml.
  assert.match(read(".github/workflows/verify-pr.yaml"), /uses: \.\/\.github\/workflows\/verify\.yaml/);
  const workflow = read(".github/workflows/verify.yaml");
  assert.match(workflow, /LAYANG_REQUIRE_RUNTIME_DEPS: '1'/);
  assert.match(workflow, /xvfb-run -a pnpm test:electron:smoke/);
  const nightly = read(".github/workflows/soak-v3-repository.yaml");
  assert.match(nightly, /soak-v3-repository\.cjs 10000 1800/);
  assert.match(nightly, /upload-artifact@[0-9a-f]{40} # v\d+/);
});
