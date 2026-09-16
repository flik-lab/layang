"use strict";

const fs = require("node:fs");
const test = require("node:test");
const assert = require("node:assert/strict");
const read = (path) => fs.readFileSync(path, "utf8");

test("request-session documentation describes control-plane ownership only", () => {
  const doc = read("docs/architecture/request-session-tabs.md");
  assert.match(doc, /control plane/i);
  assert.match(doc, /responseSessionId/);
  assert.match(doc, /ResponseSessionRegistry/);
  assert.doesNotMatch(doc, /events:\s*RuntimeEvent\[\]/);
  assert.doesNotMatch(doc, /lastResult:\s*RequestResult/);
});

test("response runtime architecture documents bounded history, selectors, persistence and lifecycle telemetry", () => {
  const doc = read("docs/architecture/response-runtime.md");
  assert.match(doc, /ResponseSessionRegistry/);
  assert.match(doc, /50/);
  assert.match(doc, /selector/i);
  assert.match(doc, /document/i);
  assert.match(doc, /persistence/i);
  assert.match(doc, /transport lifecycle/i);
});

test("mock runtime documentation keeps hot status outside Workbench React state", () => {
  const doc = read("docs/architecture/mock-server-runtime.md");
  assert.match(doc, /mockRuntimeStore/);
  assert.match(doc, /publish only when/i);
  assert.match(doc, /WorkbenchContainer/);
});

test("shell and docs no longer read legacy response payloads from RequestSession", () => {
  const shell = read("app/playground/features/shell/use-workbench-container-model.tsx");
  const docs = read("app/playground/features/docs/use-docs-actions.ts");
  const publisher = read("app/playground/features/docs-publisher/docs-renderer.ts");
  assert.doesNotMatch(shell, /session\?\.lastResult/);
  assert.doesNotMatch(docs, /session\?\.lastResult/);
  assert.doesNotMatch(publisher, /session\.lastResult/);
});
