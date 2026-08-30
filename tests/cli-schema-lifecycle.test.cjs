"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { writeGitWorkspace, readGitWorkspace } = require("../lib/git-workspace.cjs");
const { parseCliArgs, helpText } = require("../lib/cli-args.cjs");
const { handleCli } = require("../lib/cli-runner.cjs");

function proto(response = "Reply") {
  return `syntax = "proto3"; package demo; service Greeter { rpc SayHello (Req) returns (${response}); } message Req { string name = 1; } message Reply { string message = 1; } message Other { string value = 1; }`;
}

async function createWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "layang-cli-schema-life-"));
  await writeGitWorkspace(root, {
    project: {
      version: 3,
      updatedAt: new Date().toISOString(),
      collections: [
        {
          id: "collection-1",
          name: "Demo",
          requests: [
            {
              id: "request-1",
              name: "Say hello",
              grpcMethodKey: "demo.Greeter/SayHello",
              grpc: {
                libraryId: "lib-demo",
                versionId: "rev-1",
                methodFullName: "demo.Greeter/SayHello",
                status: "valid",
              },
            },
          ],
        },
      ],
      protoLibraries: [
        {
          id: "lib-demo",
          name: "Demo API",
          lifecycle: "active",
          defaultVersionId: "rev-2",
          versions: [
            {
              id: "rev-1",
              libraryId: "lib-demo",
              version: "v1",
              lifecycle: "active",
              files: [{ name: "demo.proto", text: proto() }],
            },
            {
              id: "rev-2",
              libraryId: "lib-demo",
              version: "v2",
              lifecycle: "active",
              files: [{ name: "demo.proto", text: proto() }],
            },
          ],
        },
      ],
      activeProtoLibraryId: "lib-demo",
      activeProtoVersionId: "rev-2",
      requestTabs: [],
      environments: [],
      examples: [],
      methodDocs: [],
      docResults: [],
      history: [],
      mockServer: {},
      restMockServer: {},
      wsMockServer: {},
    },
    layout: {},
    settings: {},
  });
  return root;
}

async function run(argv) {
  let output = "";
  const stdout = { write(value) { output += String(value); } };
  const code = await handleCli(parseCliArgs(argv), { stdout, stderr: stdout });
  return { code, output };
}

test("CLI exposes schema and revision lifecycle commands", () => {
  for (const command of [
    "schema:archive",
    "schema:restore",
    "schema:revision-archive",
    "schema:revision-restore",
    "schema:revision-delete",
  ]) {
    assert.equal(parseCliArgs([command, ".", "--schema", "Demo API", ...(command.includes("revision") ? ["--revision", "v1"] : [])]).command, command);
  }
  const help = helpText();
  assert.match(help, /schema:revision-delete/);
  assert.match(help, /schema:archive/);
});

test("archive and restore revision persist lifecycle state", async (t) => {
  const root = await createWorkspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  assert.equal((await run(["schema:revision-archive", root, "--schema", "Demo API", "--revision", "v1"])).code, 0);
  let workspace = await readGitWorkspace(root);
  assert.equal(workspace.project.protoLibraries[0].versions.find((item) => item.id === "rev-1").lifecycle, "archived");

  assert.equal((await run(["schema:revision-restore", root, "--schema", "Demo API", "--revision", "v1"])).code, 0);
  workspace = await readGitWorkspace(root);
  assert.equal(workspace.project.protoLibraries[0].versions.find((item) => item.id === "rev-1").lifecycle, "active");
});

test("revision delete can move compatible saved request bindings", async (t) => {
  const root = await createWorkspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = await run([
    "schema:revision-delete",
    root,
    "--schema",
    "Demo API",
    "--revision",
    "v1",
    "--replacement",
    "v2",
    "--yes",
  ]);
  assert.equal(result.code, 0);
  assert.match(result.output, /1 moved, 0 unresolved/);
  const workspace = await readGitWorkspace(root);
  const library = workspace.project.protoLibraries[0];
  assert.equal(library.versions.some((item) => item.id === "rev-1"), false);
  assert.equal(workspace.project.collections[0].requests[0].grpc.versionId, "rev-2");
  assert.equal(workspace.project.collections[0].requests[0].grpc.status, "valid");
});

test("revision delete without replacement keeps references explicitly unresolved", async (t) => {
  const root = await createWorkspace();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await run(["schema:revision-delete", root, "--schema", "Demo API", "--revision", "v1", "--yes"]);
  const workspace = await readGitWorkspace(root);
  assert.equal(workspace.project.collections[0].requests[0].grpc.status, "version-missing");
});
