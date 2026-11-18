"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { stringifyYaml } = require("../lib/workspace-yaml.cjs");
const { writeGitWorkspace, readGitWorkspace } = require("../lib/git-workspace.cjs");
const { readWorkspace, loadCanonicalGrpcScenarios } = require("../lib/cli-workspace.cjs");
const { GrpcScenarioRepository } = require("../lib/grpc-scenario-repository.cjs");
const { prepareCanonicalGrpcPayload } = require("../lib/grpc-canonical-runtime.cjs");

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "layang-v3-only-"));
  t.after(() => fs.rm(root, { force: true, recursive: true }));
  await writeGitWorkspace(root, { project: { collections: [], protoLibraries: [], environments: [], mockServer: {} }, layout: {}, settings: {} });
  return { root, repo: new GrpcScenarioRepository(root) };
}
async function legacyMethod(root, name, scenarios, method = "Live") {
  const file = path.join(root, "mocks", "grpc", "methods", name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const raw = stringifyYaml({ version: 2, kind: "grpc-mock", method: { service: "demo.Service", name: method }, scenarios });
  await fs.writeFile(file, raw);
  return { file, raw };
}

test("canonical migration backs up source and removes legacy method files from active workspace", async t => {
  const { root, repo } = await workspace(t);
  const { file, raw } = await legacyMethod(root, "old.mock.yml", [
    { id: "s1", name: "A", stream: { execution: { mode: "standby" }, responses: [{ data: { nested: { count: 3 } } }] } },
  ]);
  const dry = await repo.migrateLegacy();
  assert.equal(dry.dryRun, true); assert.equal(dry.scenarios, 1);
  assert.equal((await repo.scanFiles()).length, 0);
  const result = await repo.migrateLegacy({ dryRun: false });
  assert.equal(result.migrated, 1);
  await assert.rejects(fs.stat(file), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(result.backupPath, "methods", "old.mock.yml"), "utf8"), raw);
  const loaded = await repo.read({ methodKey: "demo.Service/Live", scenarioId: "s1" });
  assert.equal(loaded.scenario.stream.responses[0].data.nested.count, 3);
  assert.equal((await repo.migrateLegacy({ dryRun: false })).alreadyMigrated, true);
});

test("opening existing workspace auto-migrates and never copies scenario bodies into React project", async t => {
  const { root } = await workspace(t);
  const { file } = await legacyMethod(root, "old.mock.yml", [{ id: "s1", response: { data: { secretPayload: "not-in-project" } } }]);
  const opened = await readGitWorkspace(root);
  assert.deepEqual(opened.project.mockServer.methodFiles, {});
  assert.deepEqual(opened.scenarios, []);
  assert.equal(JSON.stringify(opened.project).includes("secretPayload"), false);
  await assert.rejects(fs.stat(file), { code: "ENOENT" });
  const cli = await readWorkspace(root);
  assert.deepEqual(cli.scenarios, []);
  const bodies = await loadCanonicalGrpcScenarios(root);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].response.data.secretPayload, "not-in-project");
});

test("global legacy scenario bundle is converted and archived safely", async t => {
  const { root, repo } = await workspace(t);
  const source = path.join(root, "mocks", "grpc", "scenarios.yml");
  const data = stringifyYaml({ version: 1, scenarios: [{ service: "demo.Service", method: "Get", id: "hello", response: { data: { msg: "hi" } } }] });
  await fs.writeFile(source, data);
  const result = await repo.migrateLegacy({ dryRun: false });
  assert.equal(result.migrated, 1);
  assert.equal((await repo.read({ methodKey: "demo.Service/Get", scenarioId: "hello" })).scenario.response.data.msg, "hi");
  assert.equal(await fs.readFile(path.join(result.backupPath, "scenarios.yml"), "utf8"), data);
  await assert.rejects(fs.stat(source), { code: "ENOENT" });
});

test("conflicting v3 scenario aborts before cleanup and never overwrites either version", async t => {
  const { root, repo } = await workspace(t);
  const ref = { methodKey: "demo.Service/Live", scenarioId: "s1" };
  await repo.save(ref, "id: s1\nname: modern\nresponse:\n  data:\n    status: current\n", { expectedRevision: 0, expectedHash: "" });
  const original = await repo.read(ref);
  const { file, raw } = await legacyMethod(root, "old.mock.yml", [{ id: "s1", name: "old" }]);
  await assert.rejects(repo.migrateLegacy({ dryRun: false }), error => error.code === "MIGRATION_CONFLICT");
  assert.equal(await fs.readFile(file, "utf8"), raw);
  const current = await repo.read(ref);
  assert.equal(current.contentHash, original.contentHash);
  assert.equal(current.revision, original.revision);
});

test("privileged runtime discards untrusted renderer mock payload and compiles the disk snapshot", async t => {
  const { root, repo } = await workspace(t);
  await repo.save({ methodKey: "demo.Service/Live", scenarioId: "safe" },
    "id: safe\nresponse:\n  data:\n    version: disk\n", { expectedRevision: 0, expectedHash: "" });
  const payload = await prepareCanonicalGrpcPayload({ workspaceDirectory: root,
    port: 50055, methodFiles: { hacked: { scenarioText: "malicious" } },
    scenarios: [{ id: "evil", response: { data: { version: "renderer" } } }],
    scenarioContentHash: "bad-hash" });
  assert.equal(payload.port, 50055);
  assert.equal("methodFiles" in payload, false);
  assert.equal("scenarioContentHash" in payload, false);
  assert.equal(payload.scenarios.length, 1);
  assert.equal(payload.scenarios[0].id, "safe");
  assert.equal(payload.scenarios[0].response.data.version, "disk");
  await assert.rejects(prepareCanonicalGrpcPayload({ scenarios: [] }), /saved Layang workspace/);
});

test("routine workspace autosave preserves canonical v3 bodies, never regenerating old method bundles", async t => {
  const { root, repo } = await workspace(t);
  const ref = { methodKey: "demo.Service/Live", scenarioId: "safe" };
  await repo.save(ref, "id: safe\nname: original\n", { expectedRevision: 0, expectedHash: "" });
  const before = await repo.read(ref);
  await writeGitWorkspace(root, { project: { mockServer: {}, collections: [], environments: [] }, layout: {}, settings: {} });
  const after = await repo.read(ref);
  assert.equal(after.contentHash, before.contentHash);
  assert.deepEqual(await fs.readdir(path.join(root, "mocks", "grpc", "methods")).catch(e => e.code === "ENOENT" ? [] : Promise.reject(e)), []);
});
