"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("saved requests are persisted as project data and normalized with gRPC bindings", () => {
  const types = read("app/playground/shared/workbench-types.ts");
  const workspace = read("app/playground/features/workspace/workspace-model.ts");
  const model = read("app/playground/features/shell/use-workbench-container-model.tsx");

  assert.match(types, /export type SavedRequestSnapshot/);
  assert.match(types, /savedRequests: SavedRequest\[\]/);
  assert.match(types, /savedRequestId\?: string/);
  assert.match(workspace, /normalizeSavedRequests/);
  assert.match(workspace, /remapGrpcBindingToGlobalLibrary/);
  assert.match(workspace, /savedRequests: \[\]/);
  assert.match(model, /const \[savedRequests, setSavedRequests\] = useState<SavedRequest\[\]>\(\[\]\)/);
  assert.match(model, /savedRequests,\n\s+selectedMethodKey/);
  assert.match(model, /setSavedRequests\(project\.savedRequests \?\? \[\]\)/);
});

test("saved request actions copy the current draft and load without mutating the saved snapshot", () => {
  const actions = read("app/playground/features/saved-requests/use-saved-request-actions.ts");
  assert.match(actions, /buildCurrentSavedRequestSnapshot/);
  assert.match(actions, /saveCurrentRequestAsSaved/);
  assert.match(actions, /loadSavedRequest/);
  assert.match(actions, /cloneMetadata/);
  assert.match(actions, /saved\.kind !== currentKind/);
  assert.match(actions, /patchActiveCollectionRequest/);
  assert.match(actions, /protoRuntimeRegistry\?\.resolveVersion/);
  assert.match(actions, /updateActiveSession\(sessionPatch\)/);
});

test("request body toolbar exposes compact saved-request dropdown controls for all request protocols", () => {
  const main = read("app/playground/features/shell/workbench-main-panel.tsx");
  const controls = read("app/playground/features/saved-requests/SavedRequestControls.tsx");

  assert.match(main, /<SavedRequestControls/);
  assert.match(main, /activeSavedRequestId=\{activeSession\?\.savedRequestId\}/);
  assert.match(main, /Generate from scenario[\s\S]*\{savedRequestControls\}/);
  assert.match(main, /activeIsWebSocket[\s\S]*\{savedRequestControls\}/);
  assert.match(main, /activeIsRest[\s\S]*\{savedRequestControls\}/);
  assert.match(controls, /Saved requests/);
  assert.match(controls, /Load saved request/);
  assert.match(controls, /savedRequestPayloadPreview/);
  assert.match(controls, /maxWidth: 252/);
  assert.doesNotMatch(controls, /Search saved request/);
  assert.match(controls, /Manage saved requests/);
  assert.match(controls, /Save as\.\.\./);
  assert.match(controls, /Rename/);
  assert.match(controls, /Delete current saved request/);
});

test("Git workspace stores saved requests as individual tracked YAML files", async (t) => {
  const os = require("node:os");
  const fsp = require("node:fs/promises");
  const { writeGitWorkspace, readGitWorkspace } = require("../lib/git-workspace.cjs");
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "layang-saved-request-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  const savedRequest = {
    id: "saved-1",
    name: "Get Track",
    kind: "grpc",
    snapshot: {
      kind: "grpc",
      requestJson: '{"trackId":1}',
      metadata: [{ key: "x-test", value: "1" }],
      transportMode: "grpc-web",
      baseUrl: "http://127.0.0.1:8080",
      nativeTarget: "localhost:50051",
      environmentKey: "default",
      assertionJson: "",
      grpcMethodKey: "demo.TrackService.GetTrack",
    },
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
  };

  await writeGitWorkspace(root, {
    project: {
      version: 3,
      updatedAt: savedRequest.updatedAt,
      collections: [],
      protoLibraries: [],
      environments: [],
      examples: [],
      savedRequests: [savedRequest],
      methodDocs: [],
      docResults: [],
      requestTabs: [],
      history: [],
      documentation: {},
      mockServer: { gatewayProfiles: [] },
      restMockServer: {},
      wsMockServer: {},
    },
    layout: {},
    settings: {},
  });

  const files = await fsp.readdir(path.join(root, "saved-requests"));
  assert.equal(files.length, 1);
  assert.match(files[0], /\.saved-request\.yml$/);
  const yaml = await fsp.readFile(path.join(root, "saved-requests", files[0]), "utf8");
  assert.match(yaml, /kind: saved-request/);
  assert.match(yaml, /name: Get Track/);

  const workspace = await readGitWorkspace(root);
  assert.equal(workspace.project.savedRequests.length, 1);
  assert.equal(workspace.project.savedRequests[0].name, "Get Track");
  assert.equal(workspace.project.savedRequests[0].snapshot.requestJson, '{"trackId":1}');
});
