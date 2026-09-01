const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('app/playground/features/shell/workbench-main-panel.tsx', 'utf8');

test('gRPC request tools expose View Proto as a request-bound utility', () => {
  assert.match(source, /setRequestUtilityDialog\("proto"\)/);
  assert.match(source, />\s*View Proto\s*<\/MenuItem>/);
  assert.match(source, /!activeIsRest && !activeIsWebSocket/);
  assert.match(source, /activeRequestProtoVersion\?\.files \?\? \[\]/);
  assert.match(source, /selectedMethod\?\.sourceFile/);
});

test('View Proto renders source text from the request proto revision', () => {
  assert.match(source, /requestUtilityDialog === "proto"/);
  assert.match(source, /activeRequestProtoSourceFile\.name/);
  assert.match(source, /activeRequestProtoSourceFile\.text/);
  assert.match(source, /activeRequestProtoLibrary\?\.name/);
  assert.match(source, /activeRequestProtoVersion\?\.version/);
});
