"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "desktop-rpc-signature-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("desktop-rpc-signature-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs/promises");
    const os = require("node:os");
    const path = require("node:path");
    const { readGitWorkspace, writeGitWorkspace } = require("../lib/git-workspace.cjs");
    
    function fnv1a64(input) {
      let hash = 0xcbf29ce484222325n;
      const prime = 0x100000001b3n;
      for (const character of input) {
        hash ^= BigInt(character.codePointAt(0) || 0);
        hash = BigInt.asUintN(64, hash * prime);
      }
      return hash.toString(16).padStart(16, "0");
    }
    
    test("desktop workspace reload preserves the renderer's fully-qualified RPC signature", async (t) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "layang-desktop-signature-"));
      t.after(() => fs.rm(root, { recursive: true, force: true }));
      const signatureInput = [
        "demo.v1.Greeter",
        "SayHello",
        "demo.v1.HelloRequest",
        "demo.v1.HelloReply",
        "single-request",
        "single-response",
      ].join("|");
      const expectedSignature = `fnv1a64:${fnv1a64(signatureInput)}`;
      const proto = `syntax = "proto3";
    package demo.v1;
    service Greeter { rpc SayHello (HelloRequest) returns (HelloReply); }
    message HelloRequest { string name = 1; }
    message HelloReply { string message = 1; }
    `;
    
      await writeGitWorkspace(root, {
        project: {
          version: 3,
          updatedAt: "2026-09-01T00:00:00.000Z",
          collections: [{
            id: "collection-1",
            name: "Demo",
            requests: [{
              id: "request-1",
              collectionId: "collection-1",
              name: "Say hello",
              kind: "grpc",
              grpcMethodKey: "demo.v1.Greeter/SayHello",
              grpc: {
                libraryId: "library-1",
                versionId: "version-1",
                methodFullName: "demo.v1.Greeter/SayHello",
                requestType: "demo.v1.HelloRequest",
                responseType: "demo.v1.HelloReply",
                methodSignatureHash: expectedSignature,
                schemaChecksum: "",
                versionPolicy: "pinned",
                status: "valid",
              },
              headers: [],
              body: "{}",
            }],
          }],
          protoLibraries: [{
            id: "library-1",
            name: "Demo",
            lifecycle: "active",
            defaultVersionId: "version-1",
            versions: [{
              id: "version-1",
              libraryId: "library-1",
              version: "v1",
              lifecycle: "active",
              checksum: "",
              files: [{ name: "demo.proto", text: proto }],
              source: { type: "local-files" },
              importedAt: "2026-09-01T00:00:00.000Z",
              createdAt: "2026-09-01T00:00:00.000Z",
            }],
          }],
          environments: [], examples: [], methodDocs: [], docResults: [], requestTabs: [], history: [],
          mockServer: { gatewayProfiles: [] }, restMockServer: {}, wsMockServer: {},
        },
        layout: {}, settings: {},
      });
    
      const workspace = await readGitWorkspace(root);
      const binding = workspace.project.collections[0].requests[0].grpc;
      assert.equal(binding.requestType, "demo.v1.HelloRequest");
      assert.equal(binding.responseType, "demo.v1.HelloReply");
      assert.equal(binding.methodSignatureHash, expectedSignature);
      assert.equal(binding.status, "valid");
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "electron-dev-runtime-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("electron-dev-runtime-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const runtime = fs.readFileSync(path.join(root, "scripts", "electron-runtime.cjs"), "utf8");
    
    test("desktop dev launches the installed Electron runtime instead of Forge start", () => {
      assert.match(pkg.scripts.desktop, /node scripts\/electron-runtime\.cjs/);
      assert.doesNotMatch(pkg.scripts.desktop, /electron-forge start/);
      assert.match(pkg.scripts["electron:prepare"], /electron-runtime\.cjs --prepare/);
    });
    
    test("Electron runtime bootstrap reuses the OS cache and can restore a missing dist", () => {
      assert.match(runtime, /electron_config_cache/);
      assert.match(runtime, /LOCALAPPDATA/);
      assert.match(runtime, /install\.js/);
      assert.match(runtime, /spawnSync\(process\.execPath/);
      assert.match(runtime, /LAYANG_ELECTRON_MIRROR/);
      assert.match(runtime, /ELECTRON_GET_USE_PROXY/);
      assert.match(runtime, /spawn\(executable, \[projectRoot\]/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "release-script-simplification-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("release-script-simplification-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const workflow = fs.readFileSync(path.join(root, ".github/workflows/release.yaml"), "utf8");
    
    const expectedScripts = [
      "dev",
      "build",
      "start",
      "desktop",
      "desktop:win",
      "desktop:linux",
      "electron:prepare",
      "cli",
      "cli:dist",
      "lint",
      "lint:fix",
      "typecheck",
      "test",
    ];
    
    test("package scripts stay intentionally small for releases", () => {
      assert.deepEqual(Object.keys(pkg.scripts), expectedScripts);
      assert.equal(pkg.scripts["test:ci"], undefined);
      assert.equal(pkg.scripts["docs:build"], undefined);
      assert.equal(pkg.scripts["desktop:win:setup:msi"], undefined);
    });
    
    test("release verify uses the normal test command and packaging keeps CLI", () => {
      assert.match(workflow, /- name: Test\n {8}run: pnpm test/);
      assert.doesNotMatch(workflow, /test:ci|runtime-ci|test:runtime:deps/);
      assert.match(workflow, /pnpm run desktop:win/);
      assert.match(workflow, /pnpm run desktop:linux/);
      assert.match(workflow, /pnpm run cli:dist/);
    });
    
    test("only essential release helper scripts remain", () => {
      const scripts = fs.readdirSync(path.join(root, "scripts")).filter((name) => name.endsWith(".cjs")).sort();
      assert.deepEqual(scripts, ["build-cli-portable.cjs", "electron-runtime.cjs", "package-cli-release.cjs"]);
    });
    
  });
}
