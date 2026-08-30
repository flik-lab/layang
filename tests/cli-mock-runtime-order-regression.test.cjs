"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(
  "app/playground/features/shell/use-workbench-container-model.tsx",
  "utf8",
);

test("CLI mock runtime watcher is declared after the gRPC mock controller setters exist", () => {
  const controllerIndex = source.indexOf("const grpcMock = useGrpcMockController({");
  const setterIndex = source.indexOf("setMockServerStatus,", controllerIndex);
  const watcherIndex = source.indexOf("window.electronCli?.mockRuntimeStatus", controllerIndex);

  assert.ok(controllerIndex >= 0, "gRPC mock controller should exist");
  assert.ok(setterIndex > controllerIndex, "setMockServerStatus should be destructured from the controller");
  assert.ok(watcherIndex > setterIndex, "CLI runtime watcher must run after setMockServerStatus is initialized");
});

test("CLI mock runtime watcher still synchronizes all supported mock protocols", () => {
  const watcherIndex = source.indexOf("window.electronCli?.mockRuntimeStatus");
  const watcherEnd = source.indexOf("useWorkspaceFolderAutosave({", watcherIndex);
  const watcher = source.slice(watcherIndex, watcherEnd);

  assert.match(watcher, /setMockServerStatus/);
  assert.match(watcher, /setRestMockStatus/);
  assert.match(watcher, /setWsMockStatus/);
  assert.match(watcher, /window\.setInterval\(\(\) => void applyCliRuntimeStatus\(\), 900\)/);
});
