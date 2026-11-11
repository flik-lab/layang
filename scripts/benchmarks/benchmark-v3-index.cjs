#!/usr/bin/env node
"use strict";
/**
 * Deterministic v3 file-based catalog benchmark. No Electron/UI claims.
 * Usage: node scripts/benchmarks/benchmark-v3-index.cjs [scenarioCount] [outputJson]
 */
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { GrpcScenarioRepository, relativeRef } = require("../../lib/grpc-scenario-repository.cjs");
const { stringifyYaml } = require("../../lib/workspace-yaml.cjs");
async function main() {
const count = Number(process.argv[2] || 10000);
if (!Number.isSafeInteger(count) || count < 100 || count > 100000) throw Error("Count out of range 100-100000");
const output = process.argv[3];
const methods = Math.ceil(count / 100);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "layang-v3-benchmark-"));
const time = async fn => { const t = performance.now(); const result = await fn(); return { ms: Math.round((performance.now() - t) * 100) / 100, result }; };
const memory = () => Math.round(process.memoryUsage().heapUsed / 1024);
try {
  await fs.writeFile(path.join(root, "layang.yml"), "version: 6\nname: Benchmark\n");
  const documents = [];
  for (let i = 0; i < count; i++) {
    const ref = { methodKey: `bench.Service/Method${Math.floor(i / 100)}`, scenarioId: `scenario-${i}` };
    documents.push({ ref, file: path.join(root, relativeRef(ref)), text: stringifyYaml({
      version: 3, kind: "grpc-scenario", methodKey: ref.methodKey, id: ref.scenarioId, revision: 1,
      scenario: { id: ref.scenarioId, name: `Entry ${i}`, response: { data: { value: "x".repeat(512) } } },
    }) });
  }
  for (let i = 0; i < documents.length; i += 32) {
    await Promise.all(documents.slice(i, i + 32).map(async ({ file, text }) => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, text);
    }));
  }
  const repo = new GrpcScenarioRepository(root);
  const cold = await time(() => repo.listMetadata());
  const warm = await time(() => new GrpcScenarioRepository(root).listMetadata());
  const selected = documents[0];
  await fs.writeFile(selected.file, selected.text.replace("Entry 0", "Entry changed 0"));
  const changed = await time(() => repo.listMetadata());
  const scoped = await time(() => repo.buildRuntimeSnapshot({ methodKey: selected.ref.methodKey }));
  const result = {
    schema: "layang-v3-index-benchmark-v1", scope: "Node synthetic filesystem benchmark (not Electron UI)",
    scenarioCount: count, methodCount: methods, node: process.version, platform: process.platform,
    coldIndexMs: cold.ms, warmIndexMs: warm.ms, oneFileChangedReconcileMs: changed.ms,
    methodScopedSnapshotMs: scoped.ms, snapshotCount: scoped.result.count,
    cachedWarm: warm.result.cached, indexBodyFree: !JSON.stringify(changed.result.items).includes("x".repeat(512)),
    heapUsedKiB: memory(), status: "MEASUREMENT_ONLY",
  };
  if (output) { await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(result, null, 2) + "\n"); }
  console.log(JSON.stringify(result, null, 2));
} finally { await fs.rm(root, { recursive: true, force: true }); }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
