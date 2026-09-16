# Testing

Install dependencies first:

```bash
pnpm install
```

Run the release test suite with one command:

```bash
pnpm test
```

This runs the unit/regression tests, gRPC/Web Access e2e tests, and a CLI entrypoint smoke check.

Useful checks before a release or pull request:

```bash
pnpm run typecheck
pnpm lint
pnpm test
pnpm run build
```

The gRPC e2e tests use `@grpc/grpc-js`, `@grpc/proto-loader`, and `protobufjs` from the normal project install. Keep `pnpm-lock.yaml` in sync so CI receives the same runtime dependencies.

## Workbench data-plane performance fixtures

The deterministic performance regression fixtures live in `tests/fixtures/performance-fixtures.cjs`.
They model a 1,000-track response and a large Mocking catalog with 100 Proto revisions, 2,000 RPC methods, and 5,000 scenarios.

```bash
node --test tests/mock-catalog-worker-runtime.test.cjs tests/mock-catalog-performance-regression.test.cjs
node --test tests/grpc-mock-large-catalog-ui-regression.test.cjs tests/sidebar-navigation-hot-path-regression.test.cjs
```

Phase budgets:

- warm workspace navigation p95 <= 75 ms
- Mocking shell visible <= 75 ms; catalog indexing happens off the renderer thread
- worker-side Mocking search/filter p95 <= 100 ms in product profiling (regression harness allows 150 ms for CI variance)
- response renderer ingestion p95 <= 8 ms (response data-plane phase)
- Latest shell <= 50 ms and first visible JSON page <= 100 ms (response data-plane phase)
- retained 1,000-track search p95 <= 150 ms (response data-plane phase)
