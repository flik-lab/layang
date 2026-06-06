"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Add WS and Run WS action scopes receive request-session domain actions", () => {
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  const actionScopeBlock = model.slice(
    model.indexOf("const actionScope ="),
    model.indexOf("const collectionActions = useCollectionActions"),
  );
  assert.match(actionScopeBlock, /activateRequestSession,/, "collection actions must receive activateRequestSession");
  assert.match(
    actionScopeBlock,
    /upsertRequestSessionPreservingOrder,/,
    "collection actions must receive upsertRequestSessionPreservingOrder",
  );

  const requestRunnerScopeBlock = model.slice(
    model.indexOf("const actionScopeWithCollection ="),
    model.indexOf("const requestRunnerActions = useRequestRunnerActions"),
  );
  assert.match(requestRunnerScopeBlock, /\.\.\.actionScope/, "request runner must inherit the base action scope");
  assert.match(requestRunnerScopeBlock, /\.\.\.collectionActions/, "request runner must inherit collection actions");
});

test("mock scenario hydration runs on initial workspace load", () => {
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  assert.match(model, /initialMockWorkspaceRefreshPathRef/, "initial mock workspace refresh guard should exist");
  assert.match(model, /refreshGrpcMockServerFromWorkspace\(\{\s*silent:\s*true,\s*respectLocalDirty:\s*false\s*\}\)/s);
});

test("deleted collection request and proto sources are handled through request-session domain cleanup", () => {
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  assert.match(model, /cleanupRequestSessionsForDeletedSources/);
  assert.match(model, /buildRequestSessionSourceIndex\(collections, loaded\?\.methods \?\? \[\]\)/);
  assert.match(model, /Source deleted/);
});

test("Windows workspace save does not replace the whole mocks/scenarios folder", () => {
  const main = read("electron/main.cjs");
  assert.match(main, /writeScenarioFilesIncrementally/);
  assert.doesNotMatch(main, /replaceDirectoryAtomically\(scenariosDir/);
  assert.match(main, /manifest\.json/);
});
