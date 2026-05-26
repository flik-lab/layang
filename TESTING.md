# Testing

## Unit tests

```bash
pnpm run test:unit
```

Covers:

- CLI workspace loading and validation.
- Mock runtime matcher behavior (`equals`, `equals_unordered`, `contains`, `matches`, `glob`, headers, fallback stubs).
- gRPC mock hot-reload race guards:
  - stale UI revisions are ignored;
  - partial workspace writes cannot clear scenarios;
  - stale file reloads cannot override editor/runtime state;
  - file reloads during the UI quiet period are ignored;
  - fresh file reloads are still accepted before the UI becomes authoritative.
- WebSocket mock runtime stream behavior.

## gRPC mock e2e tests

```bash
pnpm run test:e2e
```

These tests start a real gRPC mock server when `@grpc/grpc-js` and `@grpc/proto-loader` are installed. They verify:

- a live unary gRPC request keeps returning the latest UI scenario after stale file reloads;
- stale UI revisions cannot roll back the runtime;
- file watcher reloads are delayed while `.layang-mock-write-lock.json` exists;
- after the lock is removed, the runtime still does not roll back to disk/default when the editor state is newer.

## CI

```bash
pnpm run test:ci
```

Runs unit tests, e2e tests, and the CLI smoke test.
