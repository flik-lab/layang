# Testing

## Unit tests

```bash
pnpm run test:unit
```

Covers:

- CLI workspace loading and validation.
- Mock runtime matcher behavior (`equals`, `equals_unordered`, `contains`, `matches`, `glob`, headers, fallback stubs).
- gRPC mock runtime guards for stale UI revisions and partial workspace writes.
- Manual mock file refresh through **Update from file**.
- WebSocket mock runtime stream behavior.
- Certificate settings normalization, multiple PEM imports, deduplication, remove, clear-all, and TLS policy decisions.
- App zoom settings persistence, bounds, and IPC behavior.

## gRPC mock e2e tests

```bash
pnpm run test:e2e
```

These tests start a real gRPC mock server when `@grpc/grpc-js` and `@grpc/proto-loader` are installed. They verify that live unary and streaming mocks keep using the latest runtime config.

## CI

```bash
pnpm run test:ci
```

Runs unit tests and the CLI smoke test. Use `pnpm run test:all` when e2e dependencies are installed locally.
