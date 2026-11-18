#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { performance, PerformanceObserver } = require("node:perf_hooks");
const { createMockScenarioWorkload } = require("../../tests/fixtures/pr00-mock-workload.cjs");
const { createMockCatalogFixture } = require("../../tests/fixtures/performance-fixtures.cjs");
const { parseScenarioBundle } = require("../../lib/workspace-v6-codec.cjs");
const { computeMockScenarioContentHash } = require("../../lib/grpc-mock-scenario-revision.cjs");

function parseOptions(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) throw new Error(`Unexpected argument ${argv[i]}`);
    const name = argv[i].slice(2);
    if (!["scenario-count", "payload-kb", "samples", "warmup", "output", "seed"].includes(name)) {
      throw new Error(`Unknown option ${argv[i]}`);
    }
    args[name] = argv[++i];
    if (args[name] === undefined) throw new Error(`Missing value for --${name}`);
  }
  const numeric = (key, fallback) => args[key] === undefined ? fallback : Number(args[key]);
  const options = {
    scenarioCount: numeric("scenario-count", 5000),
    payloadKb: numeric("payload-kb", 1),
    seed: numeric("seed", 42),
    samples: numeric("samples", 12),
    warmup: numeric("warmup", 3),
    output: args.output,
  };
  if (![options.samples, options.warmup].every((value) => Number.isInteger(value) && value >= 0) || options.samples < 2 || options.samples > 100) {
    throw new RangeError("samples must be [2,100] and warmup nonnegative");
  }
  return options;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  return Math.round(sorted[Math.ceil(sorted.length * fraction) - 1] * 1000) / 1000;
}

function measure(fn, warmup, samples) {
  for (let i = 0; i < warmup; i += 1) fn();
  const timings = [];
  const cpuBefore = process.cpuUsage();
  for (let i = 0; i < samples; i += 1) {
    const t0 = performance.now();
    fn();
    timings.push(performance.now() - t0);
  }
  const cpu = process.cpuUsage(cpuBefore);
  const sorted = timings.slice().sort((a, b) => a - b);
  return {
    samplesMs: timings.map((x) => Number(x.toFixed(3))),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    cpuUserMs: Number((cpu.user / 1000).toFixed(3)),
    cpuSystemMs: Number((cpu.system / 1000).toFixed(3)),
  };
}

function memory() {
  const result = process.memoryUsage();
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, Math.round(value / 1024)]));
}

async function run(options) {
  let gcEvents = 0;
  const observer = new PerformanceObserver((entries) => { gcEvents += entries.getEntries().length; });
  observer.observe({ entryTypes: ["gc"] });
  const before = memory();
  const creationStart = performance.now();
  const workload = createMockScenarioWorkload(options);
  const catalog = createMockCatalogFixture({ scenarioCount: options.scenarioCount });
  const creationMs = performance.now() - creationStart;
  const files = Object.values(workload.methodFiles);
  const entries = Object.entries(workload.methodFiles);
  let parsedCount = 0;
  const parseBundles = () => {
    let count = 0;
    for (const file of files) {
      const result = parseScenarioBundle(file);
      if (result.invalidSource) throw new Error("Generated fixture is invalid");
      count += result.scenarios.length;
    }
    parsedCount = count;
  };
  const afterGenerate = memory();
  const phases = {
    parseAllBundles: measure(parseBundles, options.warmup, options.samples),
    sha256MethodFiles: measure(() => computeMockScenarioContentHash(workload.methodFiles), options.warmup, options.samples),
    serializeMethodFiles: measure(() => JSON.stringify(workload.methodFiles), options.warmup, options.samples),
    catalogMetadataSearch: measure(() => {
      const match = catalog.scenarioFiles.filter((file) => file.scenarios.some((item) => item.id.endsWith("9")));
      if (!match.length) throw new Error("Catalog search fixture unexpectedly empty");
    }, options.warmup, options.samples),
  };
  if (parsedCount !== options.scenarioCount) throw new Error(`Parsed count ${parsedCount} does not match ${options.scenarioCount}`);
  if (typeof global.gc === "function") global.gc();
  const afterWorkload = memory();
  // PerformanceObserver delivers GC entries asynchronously, even after global.gc().
  await new Promise((resolve) => setImmediate(resolve));
  observer.disconnect();
  const bytes = entries.reduce((total, [, file]) => total + Buffer.byteLength(file.scenarioText), 0);
  return {
    schema: "layang-pr00-benchmark-v1",
    measuredAt: new Date().toISOString(),
    scope: "Node.js synthetic process only; not an Electron renderer, UI frame, real gRPC stream, or memory-leak test",
    environment: {
      node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || "unknown", cpuCount: os.cpus().length,
      totalMemoryMiB: Math.round(os.totalmem() / (1024 ** 2)),
      gcExposed: typeof global.gc === "function",
    },
    config: { ...options, output: undefined, actualMethodFiles: files.length, actualBodyBytes: bytes },
    fixtureBuildMs: Number(creationMs.toFixed(3)),
    memoryKiB: { before, afterGenerate, afterWorkload },
    observedGcEvents: gcEvents,
    phases,
  };
}

if (require.main === module) {
  (async () => {
    const options = parseOptions(process.argv.slice(2));
    const result = await run(options);
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (options.output) {
      const output = path.resolve(options.output);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, json);
      console.log(`Saved benchmark: ${output}`);
    } else process.stdout.write(json);
  })().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = { parseOptions, percentile, measure, run };
