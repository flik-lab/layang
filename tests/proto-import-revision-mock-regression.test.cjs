const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const io = fs.readFileSync(path.join(root, 'app/playground/features/workspace/use-workspace-io-actions.ts'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'app/playground/features/shell/use-workbench-container-model.tsx'), 'utf8');
const services = fs.readFileSync(path.join(root, 'app/playground/features/services/services-workspace.tsx'), 'utf8');

test('freshly imported Proto resolves methods against the just-created revision registry', () => {
  assert.match(io, /protoRuntimeRegistryFor\(nextProtoLibraries\)\.resolveVersion\(library\.id, version\.id\)/);
  assert.doesNotMatch(io, /scope\.protoRuntimeRegistryFor/);
  const workspaceIoScope = shell.slice(shell.indexOf("const workspaceIoActions = useWorkspaceIoActions"));
  assert.match(workspaceIoScope, /protoRuntimeRegistryFor,/);
  assert.doesNotMatch(io, /scope\.protoRuntimeRegistry\.resolveVersion\(library\.id, version\.id\)/);
});

test('Mocking Proto panel exposes direct revision switching', () => {
  assert.match(services, /Mock Proto revision for/);
  assert.match(services, /replaceRevision\(selectedSource, String\(event\.target\.value\)\)/);
  assert.match(services, /methodBindings:[\s\S]*versionId: nextVersionId/);
});
