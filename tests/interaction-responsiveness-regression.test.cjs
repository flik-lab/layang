"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("request tab persistence is coalesced and moved off the interaction path", () => {
  const actions = read("app/playground/features/request-editor/use-request-session-actions.ts");

  assert.match(actions, /runWhenIdle/);
  assert.match(actions, /pendingRequestTabPersistenceRef/);
  assert.match(actions, /requestTabPersistenceScheduledRef/);
  assert.match(actions, /runWhenIdle\(\(\) => \{/);
  assert.match(actions, /pendingRequestTabPersistenceRef\.current = \{ nextSessions, nextActiveRequestId \}/);
});

test("closing an active tab updates the selected tab before deferred view hydration", () => {
  const actions = read("app/playground/features/request-editor/use-request-session-actions.ts");

  assert.match(actions, /activeRequestIdRef\.current = nextActiveRequestId/);
  assert.match(actions, /setActiveRequestId\(nextActiveRequestId\)/);
  assert.match(actions, /setTimeout\(\(\) => \{/);
  assert.match(actions, /activeRequestIdRef\.current !== replacement\.id/);
});

test("activity rail switches through the isolated navigation store without loading transitions", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  const navigationStore = read("app/playground/features/shell/workbench-navigation-store.ts");

  assert.doesNotMatch(sidebar, /useTransition/);
  assert.doesNotMatch(sidebar, /navigationPending/);
  assert.doesNotMatch(sidebar, /pendingSection/);
  assert.match(sidebar, /const sideSection = useWorkbenchSideSection\(\)/);
  assert.match(sidebar, /setWorkbenchSideSection\(section\)/);
  assert.match(navigationStore, /useSyncExternalStore/);
  assert.match(sidebar, /aria-current=\{visualSideSection === item\.section \? "page" : undefined\}/);
});

test("response section tabs commit directly instead of deferring content behind a visual-only tab", () => {
  const responseToolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");

  assert.doesNotMatch(responseToolbar, /useTransition/);
  assert.doesNotMatch(responseToolbar, /visualValue/);
  assert.doesNotMatch(responseToolbar, /startTabTransition/);
  assert.match(responseToolbar, /value=\{normalizedValue\}/);
  assert.match(responseToolbar, /onValueChange=\{onChange\}/);
});


test("request tab selection hydrates the cached Proto context in the same interaction", () => {
  const tabs = read("app/playground/features/shell/shell-components.tsx");
  const actions = read("app/playground/features/request-editor/use-request-session-actions.ts");

  assert.match(tabs, /visualActiveRequestId/);
  assert.match(tabs, /setVisualActiveRequestId\(session\.id\);\s*onActivate\(session\);/);
  assert.doesNotMatch(tabs, /startTabTransition/);
  assert.match(tabs, /const active = session\.id === visualActiveRequestId/);
  assert.match(actions, /stageRequestSessionSnapshot/);
  assert.match(actions, /function syncProtoContext\(binding\?: GrpcRequestBinding\)/);
  assert.doesNotMatch(actions, /scheduleProtoContextSync/);
  const syncStart = actions.indexOf("function syncProtoContext(");
  const syncEnd = actions.indexOf("\n  }", syncStart) + 4;
  assert.doesNotMatch(actions.slice(syncStart, syncEnd), /requestAnimationFrame/);
});
