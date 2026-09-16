"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

// Phase 1 guard. Response legacy paths are intentionally migrated in the next phase.
test("Mocking data-plane no longer relies on hidden heavy DOM or render-time scenario parsing", () => {
  const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.doesNotMatch(mainPanel, /mountedSections/);
  assert.doesNotMatch(mainPanel, /keepSectionMounted/);
  assert.doesNotMatch(sidebar, /mountedSidebarSections/);
  assert.doesNotMatch(sidebar, /keepSidebarSectionMounted/);
  assert.match(services, /MockCatalogPanel/);
  assert.doesNotMatch(services, /const allScenarioRows = useMemo/);
  assert.doesNotMatch(services, /const allScenarioProtoGroups = useMemo/);
});

test("Mocking shell imports the worker-backed catalog modules", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  assert.match(services, /mock-server\/workspace\/MockCatalogList/);
  assert.match(sidebar, /mock-server\/sidebar\/MockingSidebar/);
  assert.ok(fs.existsSync(path.join(root, "app/playground/features/mock-server/catalog/mockCatalogWorkerSource.ts")));
  assert.ok(fs.existsSync(path.join(root, "app/playground/features/mock-server/catalog/mockCatalog.store.ts")));
});

test("Response phase removes pinned snapshots, Latest polling, and main-thread gRPC-Web fallback", () => {
  const panel = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
  const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
  const grpcWeb = read("lib/grpc-web-client.ts");
  assert.doesNotMatch(panel, /pinnedEvents/);
  assert.doesNotMatch(latest, /setInterval/);
  assert.doesNotMatch(grpcWeb, /GrpcWebFrameParser|processBytesFallback/);
  assert.ok(fs.existsSync(path.join(root, "app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts")));
});

test("Mock catalog source snapshot reads split method files directly without legacy parse fallback", () => {
  const runtime = read("app/playground/features/mock-server/catalog/mockCatalogRuntime.ts");
  assert.doesNotMatch(runtime, /getMockMethodScenarioFile/);
  assert.doesNotMatch(runtime, /parseMockScenarioText/);
  assert.match(runtime, /mockServer\.methodFiles\?\.\[key\]/);
});

test("Mock catalog source sync is separate from lightweight runtime updates", () => {
  const hook = read("app/playground/features/mock-server/catalog/useMockCatalog.ts");
  const store = read("app/playground/features/mock-server/catalog/mockCatalog.store.ts");
  assert.match(store, /syncSource\(inputs:/);
  assert.match(store, /updateRuntime\(input:/);
  assert.match(hook, /mockCatalogStore\.syncSource/);
  assert.match(hook, /mockCatalogStore\.updateRuntime/);
  assert.match(hook, /mockServer\.protoSources/);
  assert.match(hook, /mockServer\.methodFiles/);
});
