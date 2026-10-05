"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "cli-schema-lifecycle.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("cli-schema-lifecycle.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "cli-workspace.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("cli-workspace.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs/promises");
    const os = require("node:os");
    const path = require("node:path");
    const {
      readWorkspace,
      discoverRunItems,
      resolveTarget,
      validateMockScenarios,
      validateWorkspace,
    } = require("../lib/cli-workspace.cjs");
    
    async function withWorkspace(callback) {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "layang-cli-test-"));
      try {
        await fs.mkdir(path.join(dir, "protos"), { recursive: true });
        await fs.mkdir(path.join(dir, "requests"), { recursive: true });
        await fs.mkdir(path.join(dir, "environments"), { recursive: true });
        await fs.mkdir(path.join(dir, "mocks", "scenarios"), { recursive: true });
        await fs.writeFile(
          path.join(dir, "protos", "greeter.proto"),
          'syntax = "proto3"; package demo; service Greeter { rpc SayHello (HelloRequest) returns (HelloReply); } message HelloRequest { string name = 1; } message HelloReply { string message = 1; }',
        );
        await fs.writeFile(
          path.join(dir, "project.json"),
          JSON.stringify(
            {
              selectedMethodKey: "demo.Greeter/SayHello",
              requestJson: '{"name":"Alice"}',
              nativeTarget: "localhost:50051",
            },
            null,
            2,
          ),
        );
        await fs.writeFile(
          path.join(dir, "requests", "tabs.json"),
          JSON.stringify(
            [
              {
                id: "tab-1",
                title: "Hello",
                methodKey: "demo.Greeter/SayHello",
                requestJson: '{"name":"Alice"}',
                metadata: [],
                transportMode: "native-grpc",
                nativeTarget: "localhost:50051",
              },
            ],
            null,
            2,
          ),
        );
        await fs.writeFile(
          path.join(dir, "environments", "environments.json"),
          JSON.stringify(
            [
              {
                key: "local",
                label: "Local",
                nativeTarget: "localhost:50052",
                grpcWebBaseUrl: "http://localhost:9080/grpc/web",
              },
            ],
            null,
            2,
          ),
        );
        await fs.writeFile(
          path.join(dir, "mocks", "mock-server.json"),
          JSON.stringify(
            {
              selectedScenarioIds: { "demo.Greeter/SayHello": "hello" },
              enabledMethods: { "demo.Greeter/SayHello": true },
            },
            null,
            2,
          ),
        );
        await fs.writeFile(
          path.join(dir, "mocks", "scenarios", "demo.Greeter.SayHello.json"),
          JSON.stringify(
            {
              version: 1,
              scenarios: [
                {
                  id: "hello",
                  service: "demo.Greeter",
                  method: "SayHello",
                  input: { equals: { name: "Alice" } },
                  response: { data: { message: "Hello" } },
                },
              ],
            },
            null,
            2,
          ),
        );
        await callback(dir);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
    
    test("reads split workspace files and discovers run items", async () => {
      await withWorkspace(async (dir) => {
        const workspace = await readWorkspace(dir);
        assert.equal(workspace.project.protoFiles.length, 1);
        assert.equal(workspace.scenarios.length, 1);
        const items = discoverRunItems(workspace, { env: "local", transport: "native-grpc" });
        assert.equal(items.length, 1);
        assert.equal(items[0].target, "localhost:50052");
      });
    });
    
    test("resolves explicit target before environment target", async () => {
      await withWorkspace(async (dir) => {
        const workspace = await readWorkspace(dir);
        assert.equal(
          resolveTarget(workspace.project, { target: "localhost:7777", env: "local", transport: "native-grpc" }),
          "localhost:7777",
        );
      });
    });
    
    test("validates mock selected scenario and input matcher", async () => {
      await withWorkspace(async (dir) => {
        const workspace = await readWorkspace(dir);
        const mock = validateMockScenarios(workspace);
        assert.equal(mock.ok, true);
        const validation = validateWorkspace(workspace);
        assert.equal(validation.ok, true);
      });
    });
    
    test("reads manifest-listed mock scenario files and ignores stale unlocked files", async () => {
      await withWorkspace(async (dir) => {
        const scenariosDir = path.join(dir, "mocks", "scenarios");
        await fs.rm(path.join(scenariosDir, "demo.Greeter.SayHello.json"), { force: true });
        await fs.mkdir(path.join(scenariosDir, "demo.Greeter.SayHello"), { recursive: true });
        await fs.writeFile(
          path.join(scenariosDir, "manifest.json"),
          JSON.stringify(
            {
              version: 1,
              layout: "scenario-files-v1",
              methods: {
                "demo.Greeter/SayHello": {
                  format: "json",
                  scenarios: { hello: { file: "demo.Greeter.SayHello/hello.json", format: "json" } },
                },
              },
            },
            null,
            2,
          ),
        );
        await fs.writeFile(
          path.join(scenariosDir, "demo.Greeter.SayHello", "hello.json"),
          JSON.stringify(
            {
              id: "hello",
              service: "demo.Greeter",
              method: "SayHello",
              input: { equals: { name: "Alice" } },
              response: { data: { message: "Hello" } },
            },
            null,
            2,
          ),
        );
        await fs.writeFile(
          path.join(scenariosDir, "stale.json"),
          JSON.stringify(
            {
              id: "stale",
              service: "demo.Greeter",
              method: "SayHello",
              input: { equals: { name: "Stale" } },
              response: { data: { message: "Should not load" } },
            },
            null,
            2,
          ),
        );
    
        const workspace = await readWorkspace(dir);
        assert.equal(workspace.scenarios.length, 1);
        assert.equal(workspace.scenarios[0].id, "hello");
        assert.equal(validateMockScenarios(workspace).ok, true);
      });
    });
    
    test("prefers Git-friendly request item files over aggregate tabs.json", async () => {
      await withWorkspace(async (dir) => {
        await fs.mkdir(path.join(dir, "requests", "items"), { recursive: true });
        await fs.writeFile(
          path.join(dir, "requests", "items", "demo.Greeter.SayHello.item.json"),
          JSON.stringify(
            {
              type: "layang-request",
              version: 1,
              id: "item-1",
              title: "Hello from item file",
              methodKey: "demo.Greeter/SayHello",
              requestJson: '{"name":"Bob"}',
              metadata: [{ key: "x-test", value: "1" }],
              transportMode: "native-grpc",
              nativeTarget: "localhost:50099",
              updatedAt: "2026-05-16T00:00:00.000Z",
            },
            null,
            2,
          ),
        );
        const workspace = await readWorkspace(dir);
        const items = discoverRunItems(workspace, { transport: "native-grpc" });
        assert.equal(items.length, 1);
        assert.equal(items[0].title, "Hello from item file");
        assert.equal(items[0].requestJson, '{"name":"Bob"}');
        assert.equal(items[0].target, "localhost:50099");
      });
    });
    
    test("discovers WebSocket collection requests for CLI", async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "layang-cli-ws-test-"));
      try {
        await fs.mkdir(path.join(dir, "collections"), { recursive: true });
        await fs.writeFile(path.join(dir, "project.json"), JSON.stringify({ collections: [] }, null, 2));
        await fs.writeFile(
          path.join(dir, "collections", "collections.json"),
          JSON.stringify(
            [
              {
                id: "col-1",
                name: "Realtime",
                requests: [
                  {
                    id: "ws-1",
                    collectionId: "col-1",
                    name: "Chat",
                    kind: "websocket",
                    url: "ws://127.0.0.1:8090/mock/ws",
                    body: '{"type":"ping"}',
                    headers: [{ key: "Sec-WebSocket-Protocol", value: "json" }],
                  },
                ],
              },
            ],
            null,
            2,
          ),
        );
        const workspace = await readWorkspace(dir);
        const items = discoverRunItems(workspace, { transport: "websocket", method: "Chat" });
        assert.equal(items.length, 1);
        assert.equal(items[0].requestKind, "websocket");
        assert.equal(items[0].target, "ws://127.0.0.1:8090/mock/ws");
        const validation = validateWorkspace(workspace);
        assert.equal(validation.ok, true);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
    
  });
}
