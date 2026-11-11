"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-compact-split-layout-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-compact-split-layout-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    
    
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-large-catalog-ui-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-large-catalog-ui-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("Mocking catalog is flat, virtualized, and no longer parses scenario files during render", () => {
      const catalogList = read("app/playground/features/mock-server/workspace/MockCatalogList.tsx");
      const catalogRow = read("app/playground/features/mock-server/workspace/MockCatalogRow.tsx");
      const services = read("app/playground/features/services/services-workspace.tsx");
      assert.match(catalogList, /useFixedVirtualWindow\(/);
      assert.doesNotMatch(catalogList, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
      assert.match(catalogRow, /MockScenarioPicker/);
      assert.doesNotMatch(catalogList, /parseMockScenarioText\(/);
      assert.doesNotMatch(catalogRow, /parseMockScenarioText\(/);
      assert.doesNotMatch(services, /const allScenarioRows = useMemo/);
      assert.doesNotMatch(services, /const allScenarioProtoGroups = useMemo/);
    });
    
    test("scenario options are loaded only when one picker opens", () => {
      const picker = read("app/playground/features/mock-server/workspace/MockScenarioPicker.tsx");
      assert.match(picker, /onOpen/);
      assert.match(picker, /getScenarios\(methodId\)/);
      assert.doesNotMatch(picker, /allScenarioRows/);
    });
    
    test("legacy Mocking sidebar implementation is retired", () => {
      assert.equal(fs.existsSync(path.join(root, "app/playground/features/services/mocking-sidebar-tree.tsx")), false);
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
      assert.match(sidebar, /MockingSidebar/);
      assert.doesNotMatch(sidebar, /MockingSidebarTree/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-selection-request-tabs-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-selection-request-tabs-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("gRPC mock method selection is not overwritten while the active proto revision changes", () => {
      const model = read("app/playground/features/mock-server/use-mock-method-selection.ts");
      const services = read("app/playground/features/services/services-workspace.tsx");
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
    
      assert.match(model, /const explicitKey = mockSelectedMethodKey\.trim\(\)/);
      assert.match(model, /protoRuntimeRegistry\.resolveVersion\(source\.libraryId, source\.versionId\)/);
      assert.match(model, /if \(mockSelectedMethodKey \|\| !mockSelectedMethod\) return/);
      assert.doesNotMatch(model, /if \(key !== mockSelectedMethodKey\) setMockSelectedMethodKey\(key\)/);
    
      assert.match(sidebar, /setMockSelectedMethodKey\(row\.methodKey\)/);
      assert.match(sidebar, /selectProtoLibraryVersion\(row\.libraryId, row\.versionId, \{ persistDefault: false \}\)/);
      assert.match(services, /readProtoCatalog\(selectedVersion, controller\.signal\)/);
      assert.doesNotMatch(services, /protoRuntimeRegistry\.resolveVersion\(/);
      assert.doesNotMatch(services, /currentStillExists/);
    });
    
    
    test("saved request tabs reuse source identity and adopt legacy gRPC tabs instead of opening duplicates", () => {
      const domain = read("app/playground/features/request-editor/request-session-domain.ts");
      const collection = read("app/playground/features/collection/use-collection-actions.ts");
      const workspace = read("app/playground/features/workspace/workspace-model.ts");
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
    
      assert.match(domain, /export function findReusableCollectionRequestSession/);
      assert.match(domain, /session\.sourceRequestId === request\.id \|\| session\.methodKey === request\.id/);
      assert.match(
        domain,
        /!session\.sourceRequestId[\s\S]*grpcBindingIdentity\(session\.grpc, session\.methodKey\) === requestIdentity/,
      );
      assert.match(domain, /else if \(!matchesIdentity\(item\)\) next\.push\(item\)/);
    
      assert.match(collection, /const existing = findReusableCollectionRequestSession\(requestSessions, request\)/);
      assert.match(collection, /methodKey: request\.id/);
      assert.match(collection, /sourceRequestId: request\.id/);
      assert.match(collection, /upsertRequestSessionPreservingOrder\(session\)/);
    
      assert.match(workspace, /const explicitGrpcIdentities = new Set/);
      assert.match(workspace, /if \(grpcIdentity && explicitGrpcIdentities\.has\(grpcIdentity\)\) continue/);
      assert.match(model, /methodKey: sourceRequestId/);
      assert.match(model, /sourceRequestId,/);
      assert.match(model, /requestKind: "grpc"/);
      assert.doesNotMatch(model, /requestKind: undefined/);
    });
    
    
    test("gRPC mock method selection does not add an artificial animation-frame delay", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const hookStart = services.indexOf("function useImmediateMockMethodSelection(");
      const hookEnd = services.indexOf("\n}", hookStart) + 2;
      const hook = services.slice(hookStart, hookEnd);
    
      assert.match(hook, /setMockSelectedMethodKey\(key\)/);
      assert.match(hook, /selectProtoLibraryVersion\(source\.libraryId, source\.versionId, \{ persistDefault: false \}\)/);
      assert.match(hook, /setMockSelectedMethodKey\(key\);\s*selectProtoLibraryVersion\(source\.libraryId, source\.versionId, \{ persistDefault: false \}\);/);
      assert.doesNotMatch(hook, /requestAnimationFrame\(\(\) => \{[\s\S]*selectProtoLibraryVersion/);
    });
    
    
  });
}
