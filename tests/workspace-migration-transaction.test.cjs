"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  LEGACY_WORKSPACE_PATHS,
  hasRecognizedLegacyWorkspaceFiles,
  migrateLegacyWorkspaceTransaction,
} = require("../electron/services/workspace-migration.cjs");
const { readGitWorkspace, writeGitWorkspace } = require("../lib/git-workspace.cjs");

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "layang-migration-test-"));
}

function minimalBundle() {
  return {
    type: "layang-workspace",
    version: 5,
    exportedAt: "2026-08-27T00:00:00.000Z",
    app: "Layang",
    project: {
      version: 3,
      updatedAt: "2026-08-27T00:00:00.000Z",
      collections: [],
      protoLibraries: [],
      environments: [],
      examples: [],
      methodDocs: [],
      docResults: [],
      requestTabs: [],
      history: [],
      mockServer: { gatewayProfiles: [] },
      restMockServer: {},
      wsMockServer: {},
    },
    layout: {},
    settings: {},
  };
}

test("legacy detection does not mistake a generic settings.json folder for Layang", async (t) => {
  const root = await tempDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "settings.json"), '{"editor":"vim"}\n');
  assert.equal(await hasRecognizedLegacyWorkspaceFiles(root), false);
});

test("legacy detection accepts a Layang workspace envelope", async (t) => {
  const root = await tempDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "layang.workspace.json"), JSON.stringify(minimalBundle()));
  assert.equal(await hasRecognizedLegacyWorkspaceFiles(root), true);
});

test("transactional legacy migration backs up every removed nested legacy path", async (t) => {
  const root = await tempDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.mkdir(path.join(root, "requests", "items"), { recursive: true });
  await fs.mkdir(path.join(root, "mocks", "scenarios"), { recursive: true });
  await fs.writeFile(path.join(root, "layang.workspace.json"), JSON.stringify(minimalBundle()));
  await fs.writeFile(path.join(root, "requests", "items", "legacy-request.json"), '{"id":"old"}\n');
  await fs.writeFile(path.join(root, "mocks", "scenarios", "legacy-scenario.json"), '{"id":"old"}\n');

  const result = await migrateLegacyWorkspaceTransaction(root, minimalBundle());
  assert.ok(result.workspace);
  assert.ok(result.backupPath);
  assert.equal(fsSync.existsSync(path.join(root, "layang.yml")), true);
  assert.equal(fsSync.existsSync(path.join(root, "layang.workspace.json")), false);
  assert.equal(fsSync.existsSync(path.join(root, "requests", "items")), false);
  assert.equal(fsSync.existsSync(path.join(root, "mocks", "scenarios")), false);
  assert.equal(fsSync.existsSync(path.join(result.backupPath, "layang.workspace.json")), true);
  assert.equal(fsSync.existsSync(path.join(result.backupPath, "requests", "items", "legacy-request.json")), true);
  assert.equal(fsSync.existsSync(path.join(result.backupPath, "mocks", "scenarios", "legacy-scenario.json")), true);
  assert.ok(LEGACY_WORKSPACE_PATHS.includes(path.join("requests", "items")));
  assert.ok(LEGACY_WORKSPACE_PATHS.includes(path.join("mocks", "scenarios")));
});

test("future workspace versions are rejected for reads and writes", async (t) => {
  const root = await tempDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "layang.yml"), "version: 999\nkind: workspace\n");

  await assert.rejects(() => readGitWorkspace(root), /requires a newer version of Layang/);
  await assert.rejects(() => writeGitWorkspace(root, minimalBundle()), /requires a newer version of Layang/);
});

test("failed staged commit rolls back generated files and leaves legacy source intact", async (t) => {
  const root = await tempDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.writeFile(path.join(root, "layang.workspace.json"), JSON.stringify(minimalBundle()));
  // This path is a generated file in v6. Making it a directory forces a late commit failure
  // after earlier staged files have already been copied, exercising rollback.
  await fs.mkdir(path.join(root, "workspace-schemas", "request-v2.schema.json"), { recursive: true });

  await assert.rejects(() => migrateLegacyWorkspaceTransaction(root, minimalBundle()));
  assert.equal(fsSync.existsSync(path.join(root, "layang.yml")), false, "commit marker must not survive failure");
  assert.equal(fsSync.existsSync(path.join(root, "layang.workspace.json")), true, "legacy source must remain");
  assert.equal(fsSync.existsSync(path.join(root, ".gitignore")), false, "created generated files must be rolled back");
  assert.equal(fsSync.statSync(path.join(root, "workspace-schemas", "request-v2.schema.json")).isDirectory(), true);
});

test("legacy protoFiles are promoted into managed proto revisions", async (t) => {
  const root = await tempDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bundle = minimalBundle();
  delete bundle.project.protoLibraries;
  bundle.project.protoFiles = [
    {
      name: "demo/greeter.proto",
      text: 'syntax = "proto3";\npackage demo;\nmessage HelloRequest { string name = 1; }\n',
    },
  ];

  await writeGitWorkspace(root, bundle);
  const workspace = await readGitWorkspace(root);
  assert.equal(workspace.project.protoLibraries.length, 1);
  const version = workspace.project.protoLibraries[0].versions[0];
  assert.equal(version.files.length, 1);
  assert.equal(version.files[0].name, "demo/greeter.proto");
  assert.match(version.files[0].text, /message HelloRequest/);
});

test("migration backs up legacy proto and combined mock files while preserving converted data", async (t) => {
  const root = await tempDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const bundle = minimalBundle();
  delete bundle.project.protoLibraries;
  bundle.project.protoFiles = [
    {
      name: "greeter.proto",
      text: 'syntax = "proto3";\npackage demo;\nservice Greeter { rpc SayHello (HelloRequest) returns (HelloReply); }\nmessage HelloRequest { string name = 1; }\nmessage HelloReply { string message = 1; }\n',
    },
  ];
  bundle.project.mockServer = {
    port: 50055,
    format: "yaml",
    selectedScenarioIds: { "demo.Greeter/SayHello": "hello" },
    enabledMethods: { "demo.Greeter/SayHello": true },
    scenarioText: [
      "version: 1",
      "scenarios:",
      "  - id: hello",
      "    service: demo.Greeter",
      "    method: SayHello",
      "    input:",
      "      equals:",
      "        name: Ada",
      "    response:",
      "      data:",
      "        message: hello",
      "",
    ].join("\n"),
  };

  await fs.mkdir(path.join(root, "protos"), { recursive: true });
  await fs.mkdir(path.join(root, "mocks"), { recursive: true });
  await fs.writeFile(path.join(root, "protos", "greeter.proto"), bundle.project.protoFiles[0].text);
  await fs.writeFile(path.join(root, "mocks", "scenarios.yml"), bundle.project.mockServer.scenarioText);
  await fs.writeFile(path.join(root, "layang.workspace.json"), JSON.stringify(bundle));

  const result = await migrateLegacyWorkspaceTransaction(root, bundle);
  assert.ok(result.backupPath);
  assert.equal(fsSync.existsSync(path.join(result.backupPath, "protos", "greeter.proto")), true);
  assert.equal(fsSync.existsSync(path.join(result.backupPath, "mocks", "scenarios.yml")), true);
  assert.equal(fsSync.existsSync(path.join(root, "mocks", "scenarios.yml")), false);

  const workspace = await readGitWorkspace(root);
  const version = workspace.project.protoLibraries[0].versions[0];
  assert.equal(version.files[0].name, "greeter.proto");
  assert.equal(workspace.project.mockServer.enabledMethods["demo.Greeter/SayHello"], true);
  assert.equal(workspace.project.mockServer.selectedScenarioIds["demo.Greeter/SayHello"], "hello");
  assert.equal(workspace.project.mockServer.methodFiles["demo.Greeter/SayHello"] !== undefined, true);
});

test("invalid legacy gRPC mock source aborts migration before layang.yml is committed", async (t) => {
  const root = await tempDir();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bundle = minimalBundle();
  bundle.project.mockServer = { port: 50055, format: "json", scenarioText: "{ definitely-not-valid-json" };
  await fs.writeFile(path.join(root, "layang.workspace.json"), JSON.stringify(bundle));

  await assert.rejects(
    () => migrateLegacyWorkspaceTransaction(root, bundle),
    /Invalid legacy gRPC mock scenario source/,
  );
  assert.equal(fsSync.existsSync(path.join(root, "layang.yml")), false);
  assert.equal(fsSync.existsSync(path.join(root, "layang.workspace.json")), true);
});
