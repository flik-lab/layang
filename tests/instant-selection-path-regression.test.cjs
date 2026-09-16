"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("request tab activation is synchronous instead of being wrapped in a transition", () => {
  const tabs = read("app/playground/features/shell/shell-components.tsx");

  assert.match(tabs, /setVisualActiveRequestId\(session\.id\);\s*onActivate\(session\);/);
  assert.doesNotMatch(tabs, /startTabTransition\(\(\) => onActivate\(session\)\)/);
});

test("request selection resolves the active method from the pinned session before global proto state", () => {
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");

  assert.match(model, /const sessionBinding = activeSession\?\.grpc/);
  assert.match(model, /protoRuntimeRegistry\.resolveVersion\(sessionBinding\.libraryId, sessionBinding\.versionId\)/);
  assert.match(model, /boundMethod[\s\S]*return boundMethod/);
});

test("request session switching stages the previous draft but synchronizes cached proto context immediately", () => {
  const actions = read("app/playground/features/request-editor/use-request-session-actions.ts");

  assert.match(actions, /pendingSessionSnapshotRef/);
  assert.match(actions, /stageRequestSessionSnapshot/);
  assert.match(actions, /effectiveRequestSession/);
  assert.match(actions, /function syncProtoContext/);
  assert.doesNotMatch(actions, /scheduleProtoContextSync/);
});

test("mock method selection commits the method and its cached proto revision in the same interaction", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(services, /useImmediateMockMethodSelection/);
  assert.match(services, /setMockSelectedMethodKey\(key\);\s*selectProtoLibraryVersion/);
  assert.doesNotMatch(services, /selectionGenerationRef\.current/);
  assert.match(services, /persistDefault: false/);
});

test("mock-only proto revision selection does not rewrite the library default revision", () => {
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");

  assert.match(model, /persistDefault\?: boolean/);
  assert.match(model, /options\?\.persistDefault !== false/);
});

test("reselecting an unchanged collection request does not upsert the session again", () => {
  const collection = read("app/playground/features/collection/use-collection-actions.ts");

  assert.match(collection, /const existingNeedsRefresh = Boolean\(/);
  assert.match(collection, /if \(!existing \|\| existingNeedsRefresh\) upsertRequestSessionPreservingOrder\(session\)/);
});
