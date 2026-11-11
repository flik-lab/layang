# PR-00 Performance baseline

This repository's performance tests are **Node-only workload probes** and source assertions unless an Electron session is explicitly started. Do not interpret synthetic `p95` as UI navigation or real gRPC latency.

## Reproducible Node baseline

```bash
node --expose-gc scripts/benchmarks/mock-baseline.cjs --scenario-count 100 --payload-kb 1 --samples 12 --warmup 3 --output benchmarks/baseline/mock-100-1kb.json
node --expose-gc scripts/benchmarks/mock-baseline.cjs --scenario-count 1000 --payload-kb 10 --samples 12 --warmup 3 --output benchmarks/baseline/mock-1000-10kb.json
node --expose-gc scripts/benchmarks/mock-baseline.cjs --scenario-count 5000 --payload-kb 1 --samples 12 --warmup 3 --output benchmarks/baseline/mock-5000-1kb.json
```

For larger payloads, use several separate runs: the generator intentionally rejects a single workload above 128 MiB. The synthetic payloads contain no user data. The benchmark records environment, configuration, CPU consumption, heap/RSS and p50/p95/p99 of parse/hash/serialization/metadata-filter work. It does not record response bodies.

## Electron UI baseline (must be measured on the target desktop machine)

- Install dependencies and launch `pnpm desktop` / release build. Open DevTools Performance and Memory panels for the renderer.
- Use the exact same generated project workload (100, 1000, 5000, 10000 scenarios; 1, 10, 100 KB distribution). Record machine CPU, RAM, OS, Node/Electron, scenario count, RPC/stream count.
- Warm up the workspace, then navigate Mocking ↔ Collection ↔ Requests **100 cycles**. Record navigation p50/p95/p99, long tasks, paint, and memory of renderer separately from main/utility processes.
- Edit the same-length content of a Standby scenario while a real server-streaming client is connected; verify the new payload arrives, or an explicit version error prevents sending.
- Repeatedly open/close editors and switch projects; compare *retained* heap snapshots after GC. Soak with slow clients for 30 min, observe process RSS/heap and timer/listener/stream/queue counts. A high RSS on its own is not evidence of a leak.
- Save raw traces and summaries under `benchmarks/baseline/<machine>/` (not giant generated fixtures), and compare after PR-02/PR-03 before making responsiveness claims.

## Existing suite wrappers

The uploaded repository bundles tests into `tests/suite-*.test.cjs`. Use the existing suites rather than referencing missing standalone files:

```bash
node --test tests/suite-mock-catalog.test.cjs tests/suite-performance-runtime.test.cjs
node --test tests/suite-grpc-mock-runtime.test.cjs tests/suite-grpc-mock-scenario-ui.test.cjs tests/suite-pr00-pr01.test.cjs
```
