"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "proto-drag-drop-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("proto-drag-drop-regression.test.cjs", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    const assert = require("node:assert/strict");
    
    const root = path.resolve(__dirname, "..");
    const sidebar = fs.readFileSync(path.join(root, "app/playground/features/shell/workbench-sidebar.tsx"), "utf8");
    const workspaceIo = fs.readFileSync(
      path.join(root, "app/playground/features/workspace/use-workspace-io-actions.ts"),
      "utf8",
    );
    
    test("Proto files can be dropped onto Requests to import and immediately create a gRPC request", () => {
      assert.match(sidebar, /dropProtoFiles\(event, "requests"\)/);
      assert.match(sidebar, /reviewGlobalProtoFiles\(files, "requests", ""\)/);
      assert.match(sidebar, /Drop Proto to create a gRPC request/);
      assert.match(workspaceIo, /targetCollectionId \|\| pendingCollectionImportRef\.current/);
    });
    
    test("Proto files can be dropped onto Schemas without creating a request", () => {
      assert.match(sidebar, /dropProtoFiles\(event, "schemas"\)/);
      assert.match(sidebar, /await reviewGlobalProtoFiles\(files, "schemas", ""\)/);
      assert.match(sidebar, /Drop Proto to import a schema/);
    });
    
    
    test("dropping Proto onto Requests reuses schema revision validation before creating requests", () => {
      assert.match(sidebar, /reviewGlobalProtoFiles\(files, "requests", ""\)/);
      assert.match(sidebar, /assessProtoLibraryImport\(protoLibraries, sources\)/);
      assert.match(sidebar, /destination: "schemas" \| "requests"/);
      assert.match(sidebar, /createRequestsForImportedProtoReview/);
    });
    
    test("Proto files dropped directly on a collection create requests in that collection", () => {
      const collectionSidebar = fs.readFileSync(
        path.join(root, "app/playground/features/collection/collection-sidebar.tsx"),
        "utf8",
      );
    
      assert.match(collectionSidebar, /onDropProtoFiles: \(collectionId: string, files: FileList\) => void/);
      assert.match(collectionSidebar, /isFileDrag\(event\)/);
      assert.match(collectionSidebar, /onDropProtoFiles\(target\.collectionId, event\.dataTransfer\.files\)/);
      assert.match(sidebar, /reviewGlobalProtoFiles\(files, "requests", collectionId\)/);
      assert.match(sidebar, /onDropProtoFiles=\{\(collectionId, files\)/);
    });
    
    
    test("Proto drop visual state is cleared before opening revision review", () => {
      assert.match(sidebar, /(?:function|const) clearProtoDropState/);
      assert.match(sidebar, /clearProtoDropState\(\);[\s\S]*?reviewGlobalProtoFiles\(files, "requests", collectionId\)/);
      assert.match(sidebar, /window\.addEventListener\("drop", clearProtoDropState/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "proto-import-revision-mock-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("proto-import-revision-mock-regression.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "proto-import-service-revision-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("proto-import-service-revision-regression.test.cjs", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    const assert = require("node:assert/strict");
    
    const source = fs.readFileSync(
      path.join(process.cwd(), "app/playground/features/shell/use-workbench-container-model.tsx"),
      "utf8",
    );
    
    test("importing a default Proto revision advances attached service sources and bindings", () => {
      const start = source.indexOf("function applyProtoVersionImportPlan(");
      const end = source.indexOf("function activateProtoLifecycleSelection(", start);
      const applyImport = source.slice(start, end);
    
      assert.match(applyImport, /binding\.versionId === plan\.baseVersionId/);
      assert.match(applyImport, /protoSources:[\s\S]*versionId: plan\.candidateVersion\.id/);
      assert.match(applyImport, /methodBindings:[\s\S]*schemaChecksum: plan\.candidateVersion\.checksum/);
    });
    
    test("a non-default revision import keeps explicitly pinned service revisions unchanged", () => {
      const start = source.indexOf("function applyProtoVersionImportPlan(");
      const end = source.indexOf("function activateProtoLifecycleSelection(", start);
      const applyImport = source.slice(start, end);
    
      assert.match(applyImport, /if \(setAsDefault\) \{[\s\S]*setMockServer/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "proto-runtime-cache-performance.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("proto-runtime-cache-performance.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    
    const source = fs.readFileSync("lib/proto-runtime-registry.ts", "utf8");
    
    test("Proto runtime compilation is cached across registry recreation by immutable checksum", () => {
      assert.match(source, /const compiledProtoCache/);
      assert.match(source, /version\.checksum/);
      assert.match(source, /compiledProtoCache\.get/);
      assert.match(source, /compiledProtoCache\.set/);
      assert.match(source, /MAX_COMPILED_PROTO_CACHE/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "schema-layout-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("schema-layout-regression.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "schema-proto-workspace-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("schema-proto-workspace-regression.test.cjs", () => {
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
    
  });
}
