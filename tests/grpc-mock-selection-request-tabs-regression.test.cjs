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

  assert.match(services, /const currentStillExists = matchingRows\.some/);
  assert.match(services, /if \(currentStillExists\) return currentKey/);
  assert.match(services, /const persistedScenarioId = mockServer\.selectedScenarioIds\[selectedKey\]/);
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
