"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("sidebar section navigation is isolated from the giant workbench model", () => {
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  const navigationStore = read("app/playground/features/shell/workbench-navigation-store.ts");

  assert.doesNotMatch(model, /useState<SideSection>\("collections"\)/);
  assert.match(model, /setWorkbenchSideSection/);
  assert.match(navigationStore, /useSyncExternalStore/);
  assert.match(navigationStore, /export function useWorkbenchSideSection/);
  assert.match(navigationStore, /export function setWorkbenchSideSection/);
});

test("activity rail switches directly without transition loading state", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");

  assert.doesNotMatch(sidebar, /useTransition/);
  assert.doesNotMatch(sidebar, /navigationPending/);
  assert.doesNotMatch(sidebar, /pendingSection/);
  assert.doesNotMatch(sidebar, /Loading \{pendingSection/);
  assert.match(sidebar, /useWorkbenchSideSection\(\)/);
  assert.match(sidebar, /setWorkbenchSideSection\(section\)/);
});

test("main workspace mounts only the active heavy section", () => {
  const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");

  assert.match(mainPanel, /useWorkbenchSideSection\(\)/);
  assert.doesNotMatch(mainPanel, /mountedSections/);
  assert.doesNotMatch(mainPanel, /keepSectionMounted/);
  assert.match(mainPanel, /sideSection === "services"/);
  assert.match(mainPanel, /<MemoServicesWorkspace/);
  assert.match(mainPanel, /sideSection === "proto-schemas"/);
  assert.match(mainPanel, /<MemoProtoSchemaWorkspace/);
  assert.match(mainPanel, /sideSection === "settings"/);
  assert.match(mainPanel, /<MemoSettingsWorkspace/);
});

test("request workspace unmounts while a heavy non-request workspace is active", () => {
  const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");

  assert.doesNotMatch(mainPanel, /data-slot="request-workspace-surface"/);
  assert.doesNotMatch(mainPanel, /visibility:\s*sideSection === "collections" \? "visible" : "hidden"/);
  assert.match(mainPanel, /if \(sideSection === "collections"\)/);
});

test("hidden request response viewer does not mount response-store subscriptions", () => {
  const responsePanel = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
  assert.match(responsePanel, /export function WorkbenchResponsePanel/);
  assert.match(responsePanel, /const sideSection = useWorkbenchSideSection\(\)/);
  assert.match(responsePanel, /if \(sideSection !== "collections"\) return null/);
  const gateIndex = responsePanel.indexOf('if (sideSection !== "collections") return null');
  const activeIndex = responsePanel.indexOf('function ActiveWorkbenchResponsePanel');
  const selectorIndex = responsePanel.indexOf('useResponseSelector', activeIndex);
  assert.ok(gateIndex >= 0 && activeIndex > gateIndex && selectorIndex > activeIndex);
});

test("CLI dock follows source-control navigation without re-rendering the workbench container", () => {
  const container = read("app/playground/workbench-container.tsx");

  assert.match(container, /function NavigationAwareCliTerminalPanel/);
  assert.match(container, /const sideSection = useWorkbenchSideSection\(\)/);
  assert.match(container, /sideSection === "source-control" \? railWidth : shellLeft/);
  assert.doesNotMatch(container, /export default function WorkbenchContainer\(\)[\s\S]*const sideSection = useWorkbenchSideSection\(\)/);
});

test("sidebar mounts only the active tree while worker stores keep heavy data alive", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");

  assert.doesNotMatch(sidebar, /mountedSidebarSections/);
  assert.doesNotMatch(sidebar, /keepSidebarSectionMounted/);
  assert.doesNotMatch(sidebar, /display:\s*sideSection === "collections" \? "flex" : "none"/);
  assert.match(sidebar, /sideSection === "services" &&/);
  assert.match(sidebar, /<MockingSidebar/);
});

