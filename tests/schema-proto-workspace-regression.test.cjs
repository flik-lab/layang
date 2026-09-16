const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('app/playground/features/proto-registry/proto-schema-workspace.tsx', 'utf8');

test('Schemas default to a Proto source workspace with revision, outline, and edit actions', () => {
  assert.match(source, /data-layout="schema-proto-workspace"/);
  assert.match(source, />\s*Outline\s*</);
  assert.match(source, />\s*Edit\s*</);
  assert.match(source, /Save as revision/);
  assert.match(source, /prepareProtoVersionImport/);
  assert.match(source, /data-section="schema-proto-source"/);
});

test('Schema Proto workspace does not use decorative service or method icons', () => {
  assert.doesNotMatch(source, /<PlayArrow/);
  assert.doesNotMatch(source, /<ProtoIcon/);
  assert.doesNotMatch(source, /<Schema\s/);
});
