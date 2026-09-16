const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const workspace = fs.readFileSync('app/playground/features/proto-registry/proto-schema-workspace.tsx', 'utf8');
const sidebar = fs.readFileSync('app/playground/features/proto-registry/schema-sidebar-tree.tsx', 'utf8');

test('schema workspace defaults to the active Proto source instead of service/method cards', () => {
  assert.match(workspace, /data-layout="schema-proto-workspace"/);
  assert.match(workspace, /data-section="schema-proto-source"/);
  assert.match(workspace, /data-section="schema-proto-outline"/);
  assert.match(workspace, /Save as revision/);
  assert.doesNotMatch(workspace, /data-section="schema-services"/);
  assert.doesNotMatch(workspace, /data-section="schema-method-detail"/);
});

test('schema revision selector derives its visible label from the active revision', () => {
  assert.match(workspace, /function formatRevisionLabel/);
  assert.match(workspace, /formatRevisionLabel\(version\.version, version\.id === library\.defaultVersionId\)/);
  assert.match(workspace, /formatRevisionLabel\(item\.version, item\.id === library\.defaultVersionId\)/);
});
test('schema sidebar is a flat text list without per-schema icons', () => {
  assert.match(sidebar, /data-layout="schema-list"/);
  assert.doesNotMatch(sidebar, /aria-level=\{2\}/);
  assert.doesNotMatch(sidebar, /aria-level=\{3\}/);
  assert.doesNotMatch(sidebar, /ProtoIcon/);
  assert.match(sidebar, /formatMethodCount\(methodNames\.length\)/);
  assert.match(sidebar, /Revision/);
});
