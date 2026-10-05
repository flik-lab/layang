"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Mocking auto-discovers active workspace Proto schemas", () => {
  const helper = read("app/playground/features/mock-server/mock-proto-sources.ts");
  const services = read("app/playground/features/services/services-workspace.tsx");
  const runtimeSync = read("app/playground/features/mock-server/use-mock-runtime-sync.ts");
  const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");

  assert.match(helper, /library\.lifecycle === "archived"/);
  assert.match(helper, /library\.defaultVersionId/);
  assert.match(services, /resolveEffectiveMockProtoSources\(mockServer\.protoSources, protoLibraries\)/);
  assert.match(services, /Synced automatically from workspace Proto Schemas/);
  assert.match(runtimeSync, /resolveEffectiveMockProtoSources\(mockServer\.protoSources, protoLibraries\)/);
  assert.match(actions, /resolveEffectiveMockProtoSources\(project\.protoSources, protoLibraries\)/);
  assert.match(actions, /Import at least one Proto schema before starting gRPC Mock/);
});

test("Mock split handles stay visibly gray before hover", () => {
  const split = read("app/playground/features/mock-server/workspace/MockScenarioSplitPane.tsx");
  const services = read("app/playground/features/services/services-workspace.tsx");

  for (const source of [split, services]) {
    assert.match(source, /height: 10/);
    assert.match(source, /bgcolor: "var\(--muted\)"/);
    assert.match(source, /borderTop: "1px solid var\(--border-strong\)"/);
    assert.match(source, /bgcolor: "var\(--muted-foreground\)"/);
    assert.match(source, /cursor: "row-resize"/);
  }
});
