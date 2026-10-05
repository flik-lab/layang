"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");

test("Ctrl+P searches the full collection catalog and can open unopened requests", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  assert.match(sidebar, /Search requests by name/);
  assert.match(sidebar, /for \(const collection of collections as ApiCollection\[\]\)/);
  assert.match(sidebar, /for \(const request of collection\.requests\)/);
  assert.match(sidebar, /selectCollectionRequest\(item\.collection, item\.request\)/);
  assert.match(sidebar, /No matching requests\./);
});

test("request response placement is persisted per request, not just split ratios", () => {
  const types = read("app/playground/shared/workbench-types.ts");
  const layout = read("app/playground/features/layout/use-workbench-layout.ts");
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.match(types, /requestResponseLayout\?: RequestResponseLayoutMode/);
  assert.match(layout, /activeRequestView\.requestResponseLayout \?\? requestResponseLayout/);
  assert.match(layout, /updateActiveRequestView\(\{\s*requestResponseLayout:/);
  assert.match(main, /activeRequestResponseLayout === "horizontal"/);
});

test("request body CodeMirror editor buffers parent commits while scroll/cursor stay inside EditorView", () => {
  const wrapper = read("app/playground/features/request-editor/request-editor-panels.tsx");
  const editor = read("components/editor/layang-code-editor.tsx");
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  const runner = read("app/playground/hooks/use-request-runner.ts");
  assert.match(wrapper, /commitDelayMs\?: number/);
  assert.match(editor, /onDraftChangeRef\.current\?\.\(nextValue\)/);
  assert.match(editor, /pendingCommitRef/);
  assert.match(editor, /scheduleCommit/);
  assert.match(editor, /EditorView\.updateListener/);
  assert.match(editor, /view\.scrollDOM\.scrollTop/);
  assert.doesNotMatch(editor, /setEditorScrollTop/);
  assert.match(main, /commitDelayMs=\{250\}/);
  assert.match(main, /onDraftChange=\{updateRequestJsonDraft\}/);
  assert.match(model, /requestJsonDraftRef/);
  assert.match(runner, /options\.getRequestJson\?\.\(\) \?\? requestJson/);
});

test("read-only detached response windows do not reload the whole workspace on every save", () => {
  const controller = read("app/playground/features/workspace/use-workspace-controller.ts");
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  assert.match(controller, /if \(windowKind === "response"\) return;/);
  assert.match(model, /windowKind: managedWindow\.context\.kind/);
});
