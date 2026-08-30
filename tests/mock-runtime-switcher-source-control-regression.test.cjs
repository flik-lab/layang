"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Mocking exposes independent runtime switches and keeps gRPC Mock settings", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  assert.match(services, /function MockRuntimeStrip/);
  assert.match(services, /label: "gRPC Mock"/);
  assert.match(services, /label: "Web Access"/);
  assert.match(services, /label: "REST Mock"/);
  assert.match(services, /label: "WebSocket Mock"/);
  assert.match(services, /onToggle\(item\.kind, event\.target\.checked\)/);
  assert.match(services, />\s*Mock Settings\s*<\/Button>/);
  assert.match(services, /<GrpcMockSettingsDialog/);
  assert.match(services, />\s*Scenario Settings\s*<\/Button>/);
});

test("Source Control does not render a duplicate outer Git changes sidebar", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  const git = read("app/playground/features/git/git-source-control-v2.tsx");

  assert.doesNotMatch(sidebar, /GitSourceControlSidebar/);
  assert.match(model, /sideSection !== "source-control"/);
  assert.match(main, /<GitSourceControlWorkspace/);
  assert.match(git, /<GitPageTabs/);
  assert.match(git, /<ChangesPage/);
});
