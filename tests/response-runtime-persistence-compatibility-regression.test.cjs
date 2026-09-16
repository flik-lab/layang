const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const model = fs.readFileSync('app/playground/features/workspace/workspace-model.ts', 'utf8');
const types = fs.readFileSync('app/playground/shared/workbench-types.ts', 'utf8');

function block(name, nextName) {
  const start = model.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName ? model.indexOf(`export function ${nextName}`, start + 1) : model.length;
  return model.slice(start, end === -1 ? model.length : end);
}

test('legacy response fields remain decode-compatible but normalize out of live request sessions', () => {
  assert.match(types, /export type LegacyRequestSessionRuntimeFields/);
  assert.match(types, /events\?: UiEvent\[\]/);
  assert.match(types, /lastResult\?: GrpcResult \| null/);

  const normalize = block('normalizeRequestSession', 'appendLimitedUiEvent');
  assert.match(normalize, /events:\s*_legacyEvents/);
  assert.match(normalize, /lastResult:\s*_legacyLastResult/);
  assert.match(normalize, /assertionResults:\s*_legacyAssertionResults/);
  assert.doesNotMatch(normalize, /events:\s*Array\.isArray/);
  assert.doesNotMatch(normalize, /lastResult:\s*session\.lastResult/);
  assert.doesNotMatch(normalize, /assertionResults:\s*Array\.isArray/);
});

test('workspace persistence strips legacy response payload ownership from request tabs', () => {
  const compact = block('compactRequestSessionForStorage', 'compactGrpcResultForClient');
  assert.match(compact, /events:\s*_legacyEvents/);
  assert.match(compact, /lastResult:\s*_legacyLastResult/);
  assert.match(compact, /assertionResults:\s*_legacyAssertionResults/);
  assert.doesNotMatch(compact, /compactGrpcResultForStorage\(session\.lastResult\)/);
  assert.doesNotMatch(compact, /compactUiEventForStorage/);
});

test('transient payload document ids remain excluded from persisted event compatibility helpers', () => {
  const compactEvent = block('compactUiEventForStorage', 'compactPayload');
  assert.match(compactEvent, /documentId:\s*_documentId/);
  assert.doesNotMatch(compactEvent, /documentId:\s*event\.documentId/);
});
