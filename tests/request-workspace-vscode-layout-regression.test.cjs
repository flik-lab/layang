"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("request workspace keeps mock selection and request utilities contextual without an Open Proto header action", () => {
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.doesNotMatch(main, /ariaLabel="Request workspace mode"/);
  assert.doesNotMatch(main, /<WorkbenchTabs<RequestWorkspaceMode>/);
  assert.doesNotMatch(main, />\s*Open Proto\s*</);
  assert.match(main, /aria-label="Select mock scenario"/);
  assert.match(main, /aria-label="Mock settings"/);
  assert.doesNotMatch(main, /aria-label="New mock scenario"/);
  assert.match(main, /aria-label="Request options"/);
  assert.match(main, /setRequestUtilityDialog\("examples"\)/);
  assert.match(main, /setRequestUtilityDialog\("docs"\)/);
  assert.match(main, /setRequestUtilityDialog\("benchmark"\)/);
  assert.match(main, /setRequestUtilityDialog\("settings"\)/);
});

test("request editor exposes only compact protocol-specific primary tabs", () => {
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.match(main, /\{ value: "body", label: "Message" \}/);
  assert.match(main, /\{ value: "metadata", label: "Metadata" \}/);
  assert.match(main, /\{ value: "auth", label: "Auth" \}/);
  assert.match(main, /\{ value: "schema", label: "Params" \}/);
  assert.match(main, /\{ value: "body", label: "Body" \}/);
  assert.match(main, /\{ value: "metadata", label: "Headers" \}/);
  assert.doesNotMatch(main, /\{ value: "more", label: "Settings" \}/);
  assert.match(main, /variant="underline"/);
});

test("request connection row exposes environment and transport as select-like dropdowns and executes at the URL edge", () => {
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  assert.doesNotMatch(main, /const requestMethodPath = selectedMethod/);
  assert.doesNotMatch(main, /\{requestMethodPath\}/);
  assert.match(main, /className="workbench-url-input"/);
  assert.match(main, /const connectionSelectSx/);
  assert.match(main, /aria-expanded=\{Boolean\(envMenuAnchor\)\}/);
  assert.match(main, /aria-expanded=\{Boolean\(transportMenuAnchor\)\}/);
  assert.match(main, /border: "1px solid"/);
  assert.match(main, /renderPrimaryRequestAction\(\)/);
  assert.match(main, /requestIsGrpcStreaming \? "Stream" : "Send"/);
});

test("Response panel has no normal separator line or verbose empty-response copy", () => {
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  const toolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
  assert.match(main, /bgcolor: "transparent"/);
  assert.match(main, /borderTop: 0/);
  assert.doesNotMatch(main, /No response yet/);
  assert.doesNotMatch(main, /responseOwner/);
  assert.match(toolbar, /\{summary \? \(/);
});

test("Response navigation is reduced to payload, metadata, and timeline", () => {
  const toolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
  const types = read("app/playground/shared/workbench-types.ts");
  assert.match(types, /"timeline"/);
  assert.match(toolbar, /\{ value: "timeline", label: "Timeline" \}/);
  assert.match(toolbar, /\{ value: "latest", label: "Latest JSON" \}/);
  assert.match(toolbar, /\{ value: "headers", label: "Metadata" \}/);
  assert.doesNotMatch(toolbar, /label: "Tests"/);
  assert.doesNotMatch(toolbar, /label: "Trailers"/);
});

test("request tab primitive stays compact and underline-only for primary request sections", () => {
  const css = read("app/globals.css");
  assert.match(css, /workbench-stacked-tabs\[data-variant="underline"\][\s\S]*height: 27px/);
  assert.match(css, /font-size: 11\.5px/);
});
