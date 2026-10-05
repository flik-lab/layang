"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("phase 8 window manager owns unique main, mocking, request, response and performance windows", () => {
  const source = read("electron/window/window-manager.cjs");
  assert.match(source, /VALID_KINDS = new Set\(\["main", "mocking", "request", "response", "performance"\]\)/);
  assert.match(source, /return `\$\{context\.kind\}:\$\{resource\}`/);
  assert.match(source, /focusWindow\(existing\)/);
});

test("managed windows persist bounds, survive app restart, and normalize missing displays", () => {
  const source = read("electron/window/window-manager.cjs");
  assert.match(source, /STATE_FILE = "window-layout\.json"/);
  assert.match(source, /function restoreDetachedWindows\(\)/);
  assert.match(source, /saved\.open !== true/);
  assert.match(source, /screen\.getAllDisplays\(\)/);
  assert.match(source, /screen\.getPrimaryDisplay\(\)\?\.workArea/);
  assert.match(source, /intersectionArea\(candidate, display\.workArea\)/);
  assert.match(source, /clampNumber\(candidate\.x/);
});

test("phase 8 preload exposes managed-window IPC without exposing Electron directly", () => {
  const source = read("electron/preload.cjs");
  for (const capability of ["getContext", "listManaged", "openDetached", "reattach", "focusResource", "broadcast"]) {
    assert.match(source, new RegExp(`${capability}:`));
  }
  assert.match(source, /layang:window-reattach/);
  assert.match(source, /layang:window-registry-changed/);
  assert.match(source, /layang:window-event/);
});

test("detached renderer routes by explicit window context", () => {
  const source = read("app/playground/workbench-container.tsx");
  assert.match(source, /windowKind === "mocking"/);
  assert.match(source, /<DetachedMockingWindow/);
  assert.match(source, /windowKind === "response"/);
  assert.match(source, /<DetachedResponseWindow/);
  assert.match(source, /<DetachedRequestWindow/);
});

test("Mocking can detach and main window becomes a singleton focus surface", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.match(services, /openDetached\("mocking"/);
  assert.match(mainPanel, /Mocking open in another window/);
  assert.match(mainPanel, /Focus Mocking window/);
  assert.match(mainPanel, /reattachResource\("mocking"\)/);
});

test("request tabs can move to a dedicated window and return to main", () => {
  const tabs = read("app/playground/features/shell/shell-components.tsx");
  const panel = read("app/playground/features/shell/workbench-main-panel.tsx");
  const detached = read("app/playground/features/windows/detached-window-surfaces.tsx");
  assert.match(tabs, /Move to new window/);
  assert.match(panel, /openDetached\?\.\("request"/);
  assert.match(detached, /returnLabel="Back to Main"/);
});

test("response can detach as a live monitor and return to its request", () => {
  const toolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
  const panel = read("app/playground/features/shell/workbench-main-panel.tsx");
  const detached = read("app/playground/features/windows/detached-window-surfaces.tsx");
  assert.match(toolbar, /Open response in a separate window/);
  assert.match(panel, /openDetached\?\.\("response"/);
  assert.match(panel, /Response open in another window/);
  assert.match(panel, /reattachResource\?\.\("response", activeRequestId\)/);
  assert.match(detached, /returnLabel="Back to Request"/);
});

test("detached response mirrors live session events and document payloads", () => {
  const source = read("app/playground/features/windows/use-response-window-sync.ts");
  assert.match(source, /RESPONSE_SNAPSHOT_TOPIC = "response:snapshot"/);
  assert.match(source, /runtime\.store\.subscribe/);
  assert.match(source, /runtime\.subscribe/);
  assert.match(source, /payloadDocumentService\.getText/);
  assert.match(source, /payloadDocumentService\.registerUtf8/);
  assert.match(source, /MAX_MIRRORED_DOCUMENT_CHARS/);
});

test("workspace saves are broadcast so managed windows reload shared project state", () => {
  const main = read("electron/main.cjs");
  const controller = read("app/playground/features/workspace/use-workspace-controller.ts");
  assert.match(main, /broadcastWorkspaceSaved\(targetPath, win\)/);
  assert.match(controller, /event\?\.topic !== "workspace:saved"/);
  assert.match(controller, /openFolder\?\.\(directoryPath\)/);
});


test("detached editable windows hand off the latest workspace before reattach or close", () => {
  const detached = read("app/playground/features/windows/detached-window-surfaces.tsx");
  const controller = read("app/playground/features/workspace/use-workspace-controller.ts");
  assert.match(detached, /broadcast\?\.\("workspace:handoff"/);
  assert.match(detached, /mockScenarioEditorDirty && !ctx\.saveMockScenarioEditorDraft\(\)/);
  assert.match(controller, /event\?\.topic === "workspace:handoff"/);
});

test("detached response stays read-only and does not autosave a stale project bundle", () => {
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  assert.match(model, /enabled: hydrated && managedWindow\.context\.kind !== "response" && managedWindow\.context\.kind !== "performance"/);
});

test("detached shortcuts close the view instead of deleting the underlying request", () => {
  const source = read("app/playground/features/commands/use-workbench-command-shortcuts.ts");
  assert.match(source, /scope\.windowKind && scope\.windowKind !== "main"/);
  assert.match(source, /layang:close-detached-window/);
});

test("remote Back actions use a stable detached listener and response reattach is direct", () => {
  const titlebar = read("app/playground/features/windows/detached-window-titlebar.tsx");
  const manager = read("electron/window/window-manager.cjs");
  const hook = read("app/playground/features/windows/use-managed-window-context.ts");
  assert.match(titlebar, /const onReturnRef = useRef\(onReturn\)/);
  assert.match(titlebar, /const onCloseRef = useRef\(onClose\)/);
  assert.match(titlebar, /onRequestReattach\?\.\(handleRequestedReattach\)/);
  assert.match(titlebar, /\}, \[\]\);/);
  assert.match(manager, /if \(context\.kind === "response"\) \{\s*return reattachWindow\(target\);/);
  assert.match(hook, /window\.addEventListener\("focus", handleWindowFocus\)/);
});
