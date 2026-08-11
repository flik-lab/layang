"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relative) {
  return fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8");
}

test("documentation authoring uses one Markdown editor with granular automatic markers", () => {
  const panel = read("app/playground/features/documentation/documentation-panels.tsx");
  const core = read("lib/docs-core.mjs");
  assert.match(panel, />\s*Markdown\s*<\/Typography>/);
  assert.match(panel, /documentation-markdown-editor/);
  assert.match(panel, /Automatic content to insert/);
  assert.match(panel, /uiCopy\.actions\.insertBlock/);
  assert.doesNotMatch(panel, /Move section up/);
  assert.doesNotMatch(panel, /Convert to editable/);
  assert.match(core, /LAYANG_PROTO_REFERENCE/);
  assert.match(core, /LAYANG_REQUEST_EXAMPLE/);
  assert.match(core, /LAYANG_RESPONSE_EXAMPLE/);
  assert.match(core, /renderDocumentationEditorMarkdown/);
});

test("selected and running states use separate non-bold visual treatments", () => {
  const workbench = read("components/ui/workbench.tsx");
  const tabs = read("components/ui/tabs.tsx");
  const shell = read("app/playground/features/shell/shell-components.tsx");
  const css = read("app/globals.css");
  assert.match(workbench, /min-w-fit font-medium/);
  assert.match(tabs, /font-medium/);
  assert.match(shell, /: "open"/);
  assert.match(css, /request-tab__dot[\s\S]*background: transparent/);
  assert.match(css, /data-status="running"[\s\S]*#26d39a/);
  assert.match(css, /\.request-tab \{[\s\S]*font-weight: var\(--font-weight-medium\)/);
});

test("mock controls use larger consistent checkbox and switch hit targets", () => {
  const checkbox = read("components/ui/checkbox.tsx");
  const toggle = read("components/ui/switch.tsx");
  const services = read("app/playground/features/services/services-workspace.tsx");
  assert.match(checkbox, /size-\[18px\]/);
  assert.match(toggle, /h-6 w-11/);
  assert.match(toggle, /bg-white/);
  assert.match(services, /<Select[\s\S]{0,220}sx=\{\{ minHeight: 38 \}\}/);
  assert.match(services, /sx=\{\{ width: 38, height: 38/);
});

test("source-control setup uses balanced desktop cards", () => {
  const git = read("app/playground/features/git/git-source-control-v2.tsx");
  assert.match(git, /Set up source control/);
  assert.match(git, /max-w-5xl/);
  assert.match(git, /lg:grid-cols-2/);
  assert.match(git, /Initialize current workspace/);
  assert.doesNotMatch(git, /compact && "border-0 p-0 shadow-none"/);
});

test("response viewer exposes full screen and no longer exposes stack or side buttons", () => {
  const toolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.match(toolbar, /Open response full screen/);
  assert.match(toolbar, /Exit full screen response/);
  assert.doesNotMatch(toolbar, />Stack</);
  assert.doesNotMatch(toolbar, />Side</);
  assert.match(main, /responseFullscreen/);
  assert.match(main, /position: "fixed"/);
  assert.match(main, /event\.key !== "Escape"/);
});

test("response fullscreen is portaled above collection stacking contexts", () => {
  const source = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.match(source, /createPortal\(/);
  assert.match(source, /position: "fixed"/);
  assert.match(source, /inset: 0/);
  assert.match(source, /zIndex: 2147483100/);
  assert.match(source, /document\.body/);
});
