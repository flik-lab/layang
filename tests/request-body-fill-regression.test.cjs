const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('app/playground/features/shell/workbench-main-panel.tsx', 'utf8');
const responsePanel = fs.readFileSync('app/playground/features/response-viewer/response-workbench-panel.tsx', 'utf8');

// The vertical splitter remains; only the request body editor should consume the pane above it.
test('request body editors fill the request pane while the response splitter remains resizable', () => {
  assert.match(responsePanel, /aria-label="Resize request and response panels"/);
  assert.match(responsePanel, /onMouseDown=\{beginResponseResize\}/);
  assert.match(source, /data-layout=\{requestTab === "body" \? "request-body-fill"/);
  assert.match(source, /fullHeight=\{true\}/);
});

test('main panel keeps InputAdornment available for request controls', () => {
  assert.match(source, /\bInputAdornment,/);
  assert.match(source, /<InputAdornment position="start">/);
});
