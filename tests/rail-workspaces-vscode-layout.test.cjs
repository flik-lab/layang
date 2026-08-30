"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Schemas uses the shared compact tree and keeps bulk actions in the main workspace", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  const tree = read("app/playground/features/proto-registry/schema-sidebar-tree.tsx");
  const workspace = read("app/playground/features/proto-registry/proto-schema-workspace.tsx");

  assert.match(sidebar, /<SchemaSidebarTree/);
  assert.match(tree, /<WorkbenchTree aria-label="Schemas tree">/);
  assert.match(tree, /workbenchTreeGroupSx/);
  assert.match(workspace, /Create all \{methods\.length \|\| ""\} requests/);
  assert.match(workspace, /Create all \{serviceMethods\.length\} requests/);
  assert.doesNotMatch(sidebar, /Create all \{methodCount\} requests/);
});

test("Mocking uses one focused scenario editor instead of a methods-card dashboard", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const tree = read("app/playground/features/services/mocking-sidebar-tree.tsx");

  assert.match(services, /function GrpcFocusedMockWorkspace/);
  assert.match(services, /Scenario/);
  assert.match(services, /<FeatureCodeTextField/);
  assert.match(services, /Save/);
  assert.match(services, /Revert/);
  assert.match(services, /function MockRuntimeStrip/);
  assert.match(services, /gRPC Mock/);
  assert.match(services, /Web Access/);
  assert.match(services, /REST Mock/);
  assert.match(services, /WebSocket Mock/);
  assert.match(services, /Mock Settings/);
  assert.match(tree, /placeholder="Search mocks"/);
  assert.match(tree, /workbenchTreeGroupSx/);
});

test("Docs keeps its tree while Source Control owns one full-width workspace", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  const docs = read("app/playground/features/documentation/documentation-panels.tsx");

  assert.match(model, /const contextSidebarVisible = sidebarOpen && sideSection !== "source-control";/);
  assert.doesNotMatch(sidebar, /<GitSourceControlSidebar/);
  assert.match(sidebar, /sideSection !== "source-control"/);
  assert.match(sidebar, /<UnifiedDocsSidebar/);
  assert.match(docs, /<WorkbenchTree aria-label="Documentation tree">/);
});

test("Settings uses flat technical sections instead of a card dashboard", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  const settings = read("app/playground/features/settings/settings-workspace.tsx");

  assert.match(sidebar, /Appearance & Layout/);
  assert.match(sidebar, /Network & Certificates/);
  assert.match(settings, /borderBottom: "1px solid"/);
  assert.match(settings, /bgcolor: "transparent"/);
  assert.doesNotMatch(settings, /borderRadius: 2,\n {2}p: "var\(--workbench-section-padding\)"/);
});
