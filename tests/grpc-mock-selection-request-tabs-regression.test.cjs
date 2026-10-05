"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("gRPC mock method selection is not overwritten while the active proto revision changes", () => {
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
  const services = read("app/playground/features/services/services-workspace.tsx");

  assert.match(model, /const explicitKey = mockSelectedMethodKey\.trim\(\)/);
  assert.match(model, /protoRuntimeRegistry\.resolveVersion\(source\.libraryId, source\.versionId\)/);
  assert.match(model, /if \(mockSelectedMethodKey \|\| !mockSelectedMethod\) return/);
  assert.doesNotMatch(model, /if \(key !== mockSelectedMethodKey\) setMockSelectedMethodKey\(key\)/);

  assert.match(services, /const selectCatalogMethod = useCallback/);
  assert.match(services, /setMockSelectedMethodKey\(row\.methodKey\)/);
  assert.match(services, /selectProtoLibraryVersion\(row\.libraryId, row\.versionId, \{ persistDefault: false \}\)/);
  assert.doesNotMatch(services, /currentStillExists/);
});

test("scenario source editor edits one scenario and opens the canonical gRPC method files", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const actions = read("app/playground/features/mock-server/use-grpc-mock-editor-actions.ts");
  const main = read("electron/main.cjs");

  assert.match(services, /const canonicalSource = formatSingleMockScenarioForEditor\(row\.scenario, canonicalFormat\)/);
  assert.match(services, /parseSingleMockScenarioText\(source, editorFormat, mockServer\.port, row\.method\)/);
  assert.match(services, /onOpenFolder\(\)/);
  assert.match(actions, /await persistProjectSnapshotNow\?\.\(project\)/);
  assert.match(actions, /openPath\(nextPath, "mocks\/grpc\/methods"/);
  assert.match(main, /layout: "scenario-files-v1"/);
  assert.match(
    main,
    /manifest\.methods\[key\]\.scenarios\[scenarioId\] = \{ file: relativeFile, format: sourceFormat \}/,
  );
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

test("focused gRPC mock method exposes the shared Mocking 2.0 execution controls", () => {
  const services = read("app/playground/features/services/services-workspace.tsx");
  const controls = read("app/playground/features/mock-server/workspace/MockExecutionControls.tsx");
  const focusedStart = services.indexOf("function GrpcFocusedMockWorkspace");
  const focusedEnd = services.indexOf("export function GrpcMockWorkspace", focusedStart);
  const focused = services.slice(focusedStart, focusedEnd);

  assert.match(focused, /focusedExecution/);
  assert.match(focused, /<MockExecutionControls/);
  assert.match(focused, /patchFocusedExecution/);
  assert.match(focused, /aria-label="Manual Send"/);
  assert.match(focused, /aria-label="Resize gRPC mock settings and scenario editor"/);
  assert.match(focused, /layang:grpc-mock-settings-height/);
  assert.match(focused, /inline/);
  assert.match(focused, /hideLabel/);
  assert.match(controls, /Interval/);
  assert.match(controls, /Loop/);
  assert.match(controls, /Max/);
  assert.match(focused, /variant="grpc-stream"/);
  assert.match(controls, /grpcStream \? null : <MenuItem value="incoming">Incoming<\/MenuItem>/);
  assert.match(controls, /grpcStream \? null : <MenuItem value="scheduled">Scheduled<\/MenuItem>/);
  assert.match(controls, /Hybrid/);
});
