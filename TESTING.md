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
