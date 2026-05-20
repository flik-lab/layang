# Layang

[![Website](https://img.shields.io/badge/website-open-blue)](https://flik-lab.github.io/layang/)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/flik-lab/layang/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)


Layang is a workspace-based API workbench for testing, mocking, benchmarking, documenting, and automating APIs across gRPC, gRPC-Web, WebSocket, and REST.

Layang `1.0.0` is the first official stable release. It includes the full workspace workflow for REST, WebSocket, and gRPC APIs, with local mocks, scenario matching, response templates, request logs, generated docs, benchmarking, and CLI automation.

![Layang workbench](github-pages/assets/layang-app-screenshot.png)

## Features

- Import `.proto` files and browse services, methods, request types, and response types.
- Run unary and server-streaming calls over gRPC-Web or native gRPC.
- Save request tabs, metadata, environments, examples, tests, response history, and docs metadata in a workspace folder.
- Edit per-method mock scenarios and run a local mock server from the desktop app.
- Tune streaming mock interval, loop mode, max loops, and response sequences.
- Run latency benchmarks and export benchmark JSON reports.
- Generate Markdown or HTML API docs from proto files, saved examples, mocks, and latest responses.
- Use the CLI in CI to validate workspaces, list saved requests, check mock scenarios, and run native gRPC requests.
- Use the WebSocket workbench for live connections, message sending, local mock responses, benchmark exports, and generated docs.
- Use the REST workbench for params, headers, auth, bodies, docs, examples, local mocks, scenario matching, and templates.

## Release 1.0.0

The official `1.0.0` release brings REST, WebSocket, gRPC, and gRPC-Web into one stable workspace experience. REST support includes richer mock scenarios, query/header/body matching, response templates, request logs, and guide files for REST, gRPC, and WebSocket mocking.

## Mocking And Streaming

![Layang mock streaming](github-pages/assets/layang-mock-stream.png)

Mock scenarios live with the workspace and can be edited as JSON/YAML. Server-streaming methods can use repeated responses with interval and loop controls.

## Documentation

![Layang documentation](github-pages/assets/layang-app-documentation.png)

Generated docs can include proto metadata, saved examples, mock scenarios, and the latest saved responses. Export them as Markdown or HTML for static publishing.

## Development

Install dependencies with pnpm:

```powershell
pnpm install
```

Run the web app:

```powershell
pnpm run dev
```

Run the desktop app:

```powershell
pnpm run desktop
```

Build the app:

```powershell
pnpm run build
```

Create the Windows installer:

```powershell
pnpm run desktop:setup
```

Create Linux packages:

```powershell
pnpm run desktop:deb
pnpm run desktop:rpm
```

## Technology Stack

- TypeScript, React 19, Next.js 16, and Tailwind CSS for the workbench UI.
- Electron 42 for the desktop app, native bridges, and local mock server workflows.
- `@grpc/grpc-js`, `@grpc/proto-loader`, and `protobufjs` for protobuf and native gRPC support.
- Browser gRPC-Web plus WebSocket support for transport testing.
- Biome, Node.js test runner, and pnpm for formatting, linting, testing, and package management.

## CLI

```powershell
pnpm run cli -- --help
pnpm run cli -- validate ./workspace --json
pnpm run cli -- list ./workspace
pnpm run cli -- run ./workspace --env dev --reporter junit --output reports/layang-junit.xml
pnpm run cli -- mock:check ./workspace
```

When the package is linked or installed, the command is exposed as `layang`.

## Workspace

The desktop app can create or open a workspace folder. A workspace stores a snapshot plus Git-friendly files under folders such as `protos/`, `requests/`, `examples/`, `docs/`, `environments/`, `history/`, and `mocks/`.

The default desktop workspace is:

```text
Documents/Layang/Workspace
```

## Checks

```powershell
pnpm run typecheck
pnpm run test:ci
pnpm run lint
pnpm run docs:build
```

## License

MIT


## Mock Guides

- [gRPC mock scenarios](guide-scenario-mock-grpc.md)
- [REST mock scenarios](guide-scenario-mock-rest.md)
- [WebSocket mock scenarios](guide-scenario-mock-websocket.md)
