"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { GrpcScenarioRepository, relativeRef } = require("../lib/grpc-scenario-repository.cjs");
const { stringifyYaml } = require("../lib/workspace-yaml.cjs");
const { registerGrpcScenarioStoreIpc } = require("../electron/ipc/grpc-scenario-store-ipc.cjs");

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "layang-v3-incremental-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "layang.yml"), "version: 6\nname: Incremental Test\n");
  return { root, repo: new GrpcScenarioRepository(root) };
}
function doc(ref, name) {
  return stringifyYaml({ version: 3, kind: "grpc-scenario", methodKey: ref.methodKey,
    id: ref.scenarioId, revision: 1,
    scenario: { id: ref.scenarioId, name, stream: { responses: [{ data: { value: "BODY_SENTINEL" } }] } } });
}
async function write(root, ref, name) {
  const file = path.join(root, relativeRef(ref));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, doc(ref, name));
  return file;
}

test("incremental catalog reconciles one changed document and preserves other metadata", async t => {
  const { root, repo } = await workspace(t);
  const a = { methodKey: "test.Service/Echo", scenarioId: "one" };
  const b = { methodKey: "test.Service/Echo", scenarioId: "two" };
  const c = { methodKey: "test.Service/Other", scenarioId: "three" };
  const aFile = await write(root, a, "One");
  await write(root, b, "Two");
  await write(root, c, "Three");
  const cold = await repo.listMetadata();
  assert.equal(cold.items.length, 3);
  assert.equal((await repo.listMetadata()).cached, true);
  // Change only one scenario; the remaining indexed entries have unchanged
  // stat signatures and must not be read/parsed again.
  const original = fs.readFile;
  const reads = [];
  fs.readFile = async function (file, ...args) {
    if (String(file).endsWith(".scenario.yml")) reads.push(file);
    return original.call(this, file, ...args);
  };
  try {
    await fs.writeFile(aFile, doc(a, "Different name"));
    const updated = await repo.listMetadata();
    assert.equal(updated.cached, false);
    assert.deepEqual(new Set(updated.items.map(item => item.name)), new Set(["Different name", "Two", "Three"]));
    assert.equal(JSON.stringify(updated.items).includes("BODY_SENTINEL"), false);
    assert.deepEqual(reads, [aFile]);
  } finally { fs.readFile = original; }
});

test("method-scoped Apply does not read or validate unrelated method directories", async t => {
  const { root, repo } = await workspace(t);
  const a = { methodKey: "test.Service/Echo", scenarioId: "one" };
  const b = { methodKey: "test.Service/Other", scenarioId: "two" };
  await write(root, a, "One");
  const unrelated = await write(root, b, "Two");
  // The catalog is invalid; a scoped Apply remains isolated to its method.
  await fs.writeFile(unrelated, "broken: [yaml\n");
  const snapshot = await repo.buildRuntimeSnapshot({ methodKey: a.methodKey });
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.scenarios[0].method, "Echo");
  await assert.rejects(repo.listMetadata());
});

test("catalog IPC shares a cold scan and streams only metadata, then serves its cache without scanning", async t => {
  const { root, repo } = await workspace(t);
  const methodKey = "test.Service/Echo";
  await fs.mkdir(path.dirname(path.join(root, relativeRef({ methodKey, scenarioId: "0" }))), { recursive: true });
  await Promise.all(Array.from({ length: 65 }, (_, id) => write(root, { methodKey, scenarioId: String(id) }, `Item ${id}`)));
  const handlers = new Map();
  registerGrpcScenarioStoreIpc({ handle: (channel, handler) => handlers.set(channel, handler) });
  const events = [];
  const subscriber = () => ({ sender: { isDestroyed: () => false, send: (...args) => events.push(args) } });
  const payload = { directoryPath: root };
  const list = handlers.get("mock-scenario:list");
  const original = GrpcScenarioRepository.prototype.listScenarioPaths;
  let scans = 0;
  GrpcScenarioRepository.prototype.listScenarioPaths = function () {
    scans++;
    return original.call(this);
  };
  try {
    const [left, right] = await Promise.all([list(subscriber(), payload), list(subscriber(), payload)]);
    assert.equal(scans, 1);
    assert.equal(left.items.length, 65);
    assert.deepEqual(right.items, left.items);
    assert.equal(events.length, 2);
    assert.equal(events[0][0], "mock-scenario:index-progress");
    assert.equal(events[0][2].length, 64);
    assert.doesNotMatch(JSON.stringify(events), /BODY_SENTINEL/);

    await write(root, { methodKey, scenarioId: "0" }, "Changed on disk");
    const cached = await handlers.get("mock-scenario:cached-index")(null, payload);
    assert.equal(scans, 1);
    assert.equal(cached.items.find(item => item.scenarioId === "0").name, "Item 0");
    assert.equal((await repo.read({ methodKey, scenarioId: "0" })).name, "Changed on disk");
    assert.equal((await list(null, payload)).items.find(item => item.scenarioId === "0").name, "Changed on disk");
  } finally {
    GrpcScenarioRepository.prototype.listScenarioPaths = original;
  }
});

test("after save/delete an earlier index remains available for incremental reconciliation", async t => {
  const { root, repo } = await workspace(t);
  const a = { methodKey: "test.Service/Echo", scenarioId: "one" };
  const b = { methodKey: "test.Service/Echo", scenarioId: "two" };
  await write(root, a, "One");
  await repo.listMetadata();
  const before = await fs.readFile(repo.indexFile, "utf8");
  const saved = await repo.save(b, stringifyYaml({ id: "two", name: "New" }), { expectedRevision: 0 });
  assert.equal(saved.ok, true);
  assert.equal(await fs.readFile(repo.indexFile, "utf8"), before);
  assert.equal((await repo.listMetadata()).items.length, 2);
  const current = await repo.read(b);
  assert.equal((await repo.remove(b, { expectedRevision: current.revision, expectedHash: current.contentHash })).ok, true);
  assert.equal((await repo.listMetadata()).items.length, 1);
});

test("method-scoped index rejects forged identity and symlink entries", async t => {
  const { root, repo } = await workspace(t);
  const a = { methodKey: "test.Service/Echo", scenarioId: "one" };
  const file = await write(root, a, "One");
  const good = await repo.listMethodMetadata(a.methodKey);
  assert.equal(good.items.length, 1);
  await fs.writeFile(file, doc({ ...a, methodKey: "wrong.Service/Method" }, "One"));
  await assert.rejects(repo.listMethodMetadata(a.methodKey), error => error.code === "SCENARIO_IDENTITY_MISMATCH");
  await fs.rm(file);
  const elsewhere = path.join(root, "other.yml");
  await fs.writeFile(elsewhere, "{}\n");
  await t.test("rejects file symlinks when the OS permits creating them", async subtest => {
    try { await fs.symlink(elsewhere, file); }
    catch (error) {
      if (process.platform === "win32" && error.code === "EPERM") {
        subtest.skip("Windows file symlinks require Developer Mode or SeCreateSymbolicLinkPrivilege; Linux CI covers this gate.");
        return;
      }
      throw error;
    }
    await assert.rejects(repo.listMethodMetadata(a.methodKey), error => error.code === "UNSAFE_PATH");
  });
});
