#!/usr/bin/env node
"use strict";
/**
 * Sustained file-backed v3 catalog and per-method Apply soak.
 *
 * Usage:
 *   node --expose-gc scripts/benchmarks/soak-v3-repository.cjs [count=10000] [seconds=1800] [output.json]
 *
 * This exercises Node repository persistence, NOT an Electron UI memory soak.
 * Exit nonzero on errors or a reproducible heap plateau budget violation.
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { performance } = require("node:perf_hooks");
const { GrpcScenarioRepository, relativeRef } = require("../../lib/grpc-scenario-repository.cjs");
const { stringifyYaml } = require("../../lib/workspace-yaml.cjs");

const count = Number(process.argv[2] ?? 10000);
const durationSeconds = Number(process.argv[3] ?? 1800);
const outputFile = process.argv[4];
const budgetMiB = Number(process.env.LAYANG_HEAP_GROWTH_BUDGET_MIB || 64);
const intervalMs = Number(process.env.LAYANG_SOAK_INTERVAL_MS || 5000);
if (!global.gc) throw new Error("soak requires node --expose-gc for consistent heap sampling");
if (!Number.isInteger(count) || count < 20 || count > 100000 ||
    !Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 7200 ||
    !Number.isFinite(budgetMiB) || budgetMiB <= 0 ||
    !Number.isFinite(intervalMs) || intervalMs < 50) throw new Error("Invalid soak parameters");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const mib = n => Math.round(n / 1024 / 1024 * 100) / 100;
const median = values => {
  const items = [...values].sort((a, b) => a - b);
  return items[Math.floor(items.length / 2)];
};

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "layang-v3-soak-"));
  const metrics = { schema:"layang-v3-repository-soak-v1", scope:"Node repository only (not Electron)",
    scenarioCount:count, durationSeconds, intervalMs, budgetMiB, samples:[], iterations:0,
    node:process.version, platform:process.platform, status:"RUNNING" };
  try {
    await fs.writeFile(path.join(root, "layang.yml"), "version: 6\nname: Soak\n");
    const files = [];
    for (let i=0; i<count; i++) {
      const ref = { methodKey:`soak.Service/Method${Math.floor(i/100)}`, scenarioId:`entry-${i}` };
      files.push({ ref, file:path.join(root, relativeRef(ref)), text:stringifyYaml({
        version:3, kind:"grpc-scenario", methodKey:ref.methodKey, id:ref.scenarioId, revision:1,
        scenario:{ id:ref.scenarioId, name:`Entry ${i}`, response:{data:{value:"x".repeat(128)}} }
      }) });
    }
    for (let i=0; i<count; i+=32) {
      await Promise.all(files.slice(i,i+32).map(async item => {
        await fs.mkdir(path.dirname(item.file), {recursive:true});
        await fs.writeFile(item.file,item.text);
      }));
    }
    const repo = new GrpcScenarioRepository(root);
    await repo.listMetadata();
    await repo.buildRuntimeSnapshot({methodKey:files[0].ref.methodKey});
    global.gc();
    const started = performance.now();
    const initialHeapMiB = mib(process.memoryUsage().heapUsed);
    while ((performance.now() - started) / 1000 < durationSeconds) {
      const entry = files[metrics.iterations % count];
      // Touch a single scenario, forcing external-edits reconciliation while
      // preserving version and identity. The persisted cache is not authoritative.
      await fs.writeFile(entry.file, entry.text.replace(`Entry ${metrics.iterations % count}`,
        `Changed ${metrics.iterations % count}`));
      const index = await repo.listMetadata();
      if (index.items.length !== count) throw new Error(`Metadata count mismatch: ${index.items.length}`);
      const snapshot = await repo.buildRuntimeSnapshot({methodKey:entry.ref.methodKey});
      if (snapshot.count < 1 || snapshot.count > 100) throw new Error("Method Apply leaked across scope");
      global.gc();
      const mem = process.memoryUsage();
      metrics.samples.push({second:Math.round((performance.now()-started)/1000),
        heapMiB:mib(mem.heapUsed), rssMiB:mib(mem.rss), methodCount:snapshot.count});
      metrics.iterations++;
      await sleep(Math.min(intervalMs,Math.max(0,durationSeconds*1000-(performance.now()-started))));
    }
    const values = metrics.samples.map(sample => sample.heapMiB);
    const width = Math.max(1, Math.floor(values.length / 4));
    const baseline = median([initialHeapMiB,...values.slice(0,width)]);
    const end = median(values.slice(-width));
    metrics.initialHeapMiB = initialHeapMiB;
    metrics.earlyMedianHeapMiB = baseline;
    metrics.lateMedianHeapMiB = end;
    metrics.heapGrowthMiB = Math.round((end-baseline)*100)/100;
    metrics.maxRssMiB = Math.max(...metrics.samples.map(sample => sample.rssMiB));
    metrics.status = metrics.heapGrowthMiB > budgetMiB ? "FAIL_HEAP_GROWTH" : "PASS";
    if (metrics.status !== "PASS") process.exitCode = 1;
  } catch (err) {
    metrics.status = "FAIL_ERROR";
    metrics.error = err.stack || String(err);
    process.exitCode = 1;
  } finally {
    await fs.rm(root, {recursive:true,force:true});
    if (outputFile) {
      await fs.mkdir(path.dirname(path.resolve(outputFile)),{recursive:true});
      await fs.writeFile(outputFile,JSON.stringify(metrics,null,2)+"\n");
    }
    console.log(JSON.stringify(metrics,null,2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
