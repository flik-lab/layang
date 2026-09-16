"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "app/playground/features/mock-server/use-grpc-mock-editor-actions.ts"),
  "utf8",
);
const requestActions = fs.readFileSync(
  path.join(root, "app/playground/features/request-editor/use-request-session-actions.ts"),
  "utf8",
);

test("Add scenario resolves the Proto runtime that owns the mock method", () => {
  assert.match(source, /function resolveMockMethodRuntime\(method: RpcMethodInfo\)/);
  assert.match(source, /currentMockServer\.methodBindings\?\.\[key\]/);
  assert.match(source, /const bound = resolveCompiled\(binding\.libraryId, binding\.versionId, false\)/);
  assert.match(source, /const runtime = resolveMockMethodRuntime\(method\)/);
  assert.match(source, /buildDefaultMockScenario\([\s\S]{0,120}runtime\.method,[\s\S]{0,80}runtime\.loaded\.root/);
  assert.match(source, /selectMethod\([\s\S]{0,80}runtime\.loaded\.root,[\s\S]{0,80}runtime\.method,[\s\S]{0,140}createPinnedGrpcBinding/);
  assert.doesNotMatch(source, /selectMethod\(loaded\.root, method\)/);
  assert.match(
    requestActions,
    /function selectMethod\(root: protobuf\.Root, method: RpcMethodInfo, grpcOverride\?: GrpcRequestBinding\)/,
  );
  assert.match(requestActions, /const grpc =\s*grpcOverride \?\?/);
});

const shell = fs.readFileSync(
  path.join(root, "app/playground/features/shell/use-workbench-container-model.tsx"),
  "utf8",
);

test("Mocking resolves the selected Proto revision before the global loaded schema", () => {
  const start = shell.indexOf("const mockSelectedMethod = useMemo(() => {");
  const end = shell.indexOf("\n  useEffect(() => {", start);
  const block = shell.slice(start, end);
  const activeResolveIndex = block.indexOf("protoRuntimeRegistry.resolveVersion(activeProtoLibraryId, activeProtoVersionId)");
  const loadedLookupIndex = block.indexOf("loaded?.methods.find");

  assert.ok(activeResolveIndex >= 0, "selected Proto revision should be resolved explicitly");
  assert.ok(loadedLookupIndex >= 0, "global loaded fallback should remain available");
  assert.ok(activeResolveIndex < loadedLookupIndex, "selected Proto revision must win over the global loaded fallback");
});
