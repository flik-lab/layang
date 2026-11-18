"use strict";

// Workspace files are reviewed in git and shared by the desktop app and the CLI: paths are built
// from entity names, with an id suffix only where siblings share a name.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { GrpcScenarioRepository, relativeRef, pathSegment } = require("../lib/grpc-scenario-repository.cjs");
const { writeCollections, writeGatewayProfiles, readGatewayProfiles } = require("../lib/git-workspace.cjs");
const { stringifyYaml } = require("../lib/workspace-yaml.cjs");

async function tempWorkspace() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "layang-readable-"));
  await fsp.writeFile(path.join(root, "layang.yml"), "version: 6\nkind: workspace\nworkspace:\n  id: w\n  name: w\n");
  return root;
}
const posix = (value) => value.split(path.sep).join("/");

test("gRPC scenarios live under <package.Service>/<Method>/<scenario-id>.scenario.yml", () => {
  assert.equal(
    posix(relativeRef({ methodKey: "demo.v1.Greeter/SayHello", scenarioId: "hello-alice" })),
    "mocks/grpc/scenarios/demo.v1.Greeter/SayHello/hello-alice.scenario.yml",
  );
});

test("unsafe or case-sensitive names keep a readable prefix plus a hash", () => {
  assert.equal(pathSegment("rp-symbol-cycle"), "rp-symbol-cycle");
  assert.match(pathSegment("Hello Alice!"), /^Hello-Alice--[0-9a-f]{8}$/);
  assert.match(pathSegment("con"), /^con--[0-9a-f]{8}$/);
  assert.match(pathSegment("../escape"), /^escape--[0-9a-f]{8}$/);
  assert.match(pathSegment("x".repeat(200)), /^x{70}--[0-9a-f]{8}$/);
  // Scenario IDs that differ only in case must not share a file on Windows/macOS.
  assert.equal(pathSegment("default", { foldCase: true }), "default");
  assert.notEqual(pathSegment("Default", { foldCase: true }), pathSegment("default", { foldCase: true }));
});

test("hash-named scenario files from early 1.2.0 builds move to their readable path", async () => {
  const root = await tempWorkspace();
  try {
    const methodKey = "demo.v1.Greeter/SayHello";
    const doc = { version: 3, kind: "grpc-scenario", methodKey, id: "hello", revision: 1, scenario: { id: "hello", output: { data: { message: "hi" } } } };
    const sha = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
    const legacy = path.join(root, "mocks", "grpc", "scenarios", sha(methodKey), `${sha("hello")}.scenario.yml`);
    await fsp.mkdir(path.dirname(legacy), { recursive: true });
    await fsp.writeFile(legacy, stringifyYaml(doc));

    const { items } = await new GrpcScenarioRepository(root).listMetadata();
    assert.equal(items.length, 1);
    assert.equal(items[0].fileRef, "mocks/grpc/scenarios/demo.v1.Greeter/SayHello/hello.scenario.yml");
    assert.equal(fs.existsSync(legacy), false);
    assert.equal(fs.existsSync(path.dirname(legacy)), false);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("collections, folders and requests use readable names; only colliding siblings get a suffix", async () => {
  const root = await tempWorkspace();
  try {
    await writeCollections(root, [
      {
        id: "col-1",
        name: "Track API",
        folders: [{ id: "f-1", name: "Streams" }],
        requests: [
          { id: "r-1", name: "Watch Track", kind: "grpc", parentId: "f-1" },
          { id: "r-2", name: "Get Track", kind: "grpc" },
          { id: "r-3", name: "Get Track", kind: "grpc" },
        ],
      },
    ]);
    const files = [];
    const walk = async (dir) => {
      for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else files.push(posix(path.relative(root, full)));
      }
    };
    await walk(path.join(root, "collections"));
    assert.ok(files.includes("collections/track-api/collection.yml"), files.join("\n"));
    assert.ok(files.includes("collections/track-api/streams/folder.yml"), files.join("\n"));
    assert.ok(files.includes("collections/track-api/streams/watch-track.grpc.yml"), files.join("\n"));
    const getTrack = files.filter((file) => /^collections\/track-api\/get-track--[0-9a-f]{8}\.grpc\.yml$/.test(file));
    assert.equal(getTrack.length, 2, files.join("\n"));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("gateway profiles are written by name and read back unchanged", async () => {
  const root = await tempWorkspace();
  try {
    await writeGatewayProfiles(root, [{ id: "gateway-x", name: "FE Main Display", mode: "mock" }]);
    assert.ok(fs.existsSync(path.join(root, "gateways", "fe-main-display.gateway.yml")));
    const [profile] = await readGatewayProfiles(root);
    assert.equal(profile.id, "gateway-x");
    // The same profile listed twice is one entity, not a name collision.
    await writeGatewayProfiles(root, [profile, profile]);
    assert.deepEqual(await fsp.readdir(path.join(root, "gateways")), ["fe-main-display.gateway.yml"]);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
