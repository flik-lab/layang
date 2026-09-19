<p align="center">
  <img src="github-pages/assets/layang-logo.png" alt="Layang logo" width="120" />
</p>

# Layang

[![Website](https://img.shields.io/badge/website-layang.mff.web.id-blue)](https://layang.mff.web.id/)
[![Version](https://img.shields.io/badge/version-1.1.5-blue)](https://github.com/flik-lab/layang/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Layang is a desktop API workbench for REST, WebSocket, gRPC, and gRPC-Web. It uses workspace folders as the source of truth, so the same requests, schemas, mocks, environments, and documentation can be used from both the desktop app and CLI.

![Layang workbench](github-pages/assets/layang-app-screenshot.png)

## Download

* [Website](https://layang.mff.web.id/)
* [GitHub Releases](https://github.com/flik-lab/layang/releases)
* [Source code](https://github.com/flik-lab/layang)

## Features

* REST, WebSocket, gRPC, and gRPC-Web requests in one workspace.
* Unary and server-streaming calls over gRPC-Web and native gRPC.
* Proto import with service, method, request, and response browsing.
* Local gRPC, REST, and WebSocket mock servers.
* Saved requests, environments, examples, tests, documentation, and service profiles.
* gRPC mock response sequences with interval, loop, max-loop, Live Push, and manual send controls.
* HTTPS certificate trust for internal and self-signed development endpoints.
* Markdown and HTML documentation generation.
* Latency benchmarks with exportable reports.
* CLI support for validation, request execution, mocks, schema workflows, docs, benchmarks, Git, and CI.
* Git-friendly workspace files that can be reviewed and versioned normally.

## Desktop Layout

The main navigation contains **Requests**, **Schemas**, **Services**, **Docs**, **Source Control**, and **Settings**.

The gRPC service workspace groups:

* Methods
* Proto
* Native gRPC Mock
* Web Access
* Activity

Request-specific examples and documentation stay with the request instead of being managed from a separate global screen.

## Release 1.1.5

Version `1.1.5` focuses on mock workflows, Web Access, and live response handling.

* Added persistent gRPC Mock Live Push and manual sending from saved scenarios.
* Improved Web Access HTTPS, HTTP/2, certificate trust, and runtime settings.
* Improved live response scrolling and latest-message rendering without blanking the viewer.
* Fixed Proto drag-and-drop state and direct collection imports.
* Changed the local desktop renderer port to `12999`.

See [CHANGELOG.md](./CHANGELOG.md) for the full release history.

## Install

For Windows:

1. Download `LayangSetup.exe` from [GitHub Releases](https://github.com/flik-lab/layang/releases).
2. Run the installer.
3. Open Layang from the Start Menu or Desktop shortcut.
4. Choose a workspace folder on first launch.

Packaging and update details are documented in [WINDOWS_SETUP.md](./WINDOWS_SETUP.md).

## Workspace

A workspace is a normal directory containing Layang project data.

The default location is:

```text
Documents/Layang/Workspace
```

A typical workspace looks like this:

```text
workspace/
├── layang.yml
├── collections/
├── protos/
├── environments/
├── mocks/
├── workspace-schemas/
├── docs/
└── .layang/
```

The main folders are:

* `collections/` — saved requests and examples.
* `protos/` — immutable Proto revision snapshots.
* `environments/` — shared targets and non-secret variables.
* `mocks/` — gRPC, REST, and WebSocket mock scenarios.
* `docs/` — generated and authored documentation.
* `.layang/` — local state such as open tabs, cache, results, and machine-specific paths.

Desktop and CLI use the same files.

Workspace v5 and legacy v4 folders remain readable. To inspect or run a migration:

```bash
layang workspace:migrate . --check
layang workspace:migrate .
```

See [Workspace Format v6](./docs/architecture/workspace-format.md) for the complete format.

## gRPC Mock

![Layang mock streaming](github-pages/assets/layang-mock-stream.png)

gRPC mock scenarios are stored with the workspace and use YAML as the canonical format.

Server-streaming scenarios support:

* response sequences
* configurable interval
* loop mode
* max loops
* Live Push
* manual response sending

Manual Send can publish a saved scenario response to an active Live Push stream without closing the connection.

If a scenario file is changed outside Layang, use **Update from file** to reload it into the editor and running mock server.

## Web Access

Web Access exposes browser-compatible gRPC-Web endpoints backed by the local mock server or another configured gRPC target.

It supports:

* HTTP
* HTTPS
* HTTP/2 over HTTPS
* gRPC-Web unary requests
* gRPC-Web server streaming
* configurable CORS origins
* local or custom upstream targets
* certificate-based TLS configuration

Native gRPC and Web Access are separate runtimes and can be started or stopped independently.

Legacy gateway profiles and CLI commands remain available for compatibility:

```bash
layang gateway:list ./workspace
layang gateway:start ./workspace --profile "Track Gateway" --daemon
layang gateway:status ./workspace --profile "Track Gateway"
```

## Certificates and Trust

Certificate settings are available under **Settings → Network**.

Layang can import `.pem`, `.crt`, and `.cer` files into its own trust configuration. Imported CA certificates are used by new HTTPS and gRPC-Web requests without modifying the Windows certificate store.

For development environments, **Bypass TLS errors** remains available as an explicit opt-in setting.

Use CA import when possible. Bypass mode is intended for local or controlled development environments.

## Response Viewer

The response viewer supports:

* latest response view
* message history
* JSON and table views
* response search
* pause/freeze
* pinned messages
* large streaming payloads

Live updates do not force the JSON viewport back to the top. Scrolling does not freeze the stream; only the explicit pause/freeze controls stop live updates.

When switching to the latest response, the existing payload remains visible until the new document is ready, avoiding an empty intermediate state.

## Documentation

![Layang documentation](github-pages/assets/layang-app-documentation.png)

Documentation can be authored at workspace, collection, folder, and request level.

Layang can generate:

* Markdown API pages
* static HTML documentation
* wiki exports
* request and response examples
* schema references
* mock examples
* CLI and client command samples

Common CLI commands:

```bash
layang docs:build ./workspace
layang docs:check ./workspace
layang docs:build ./workspace --check
```

Generated wiki output is written to `docs/wiki-export/`.

## CLI

The CLI uses the same workspace as the desktop app.

Typical commands:

```bash
layang validate ./workspace --json

layang run ./workspace \
  --request "Get Track" \
  --env dev \
  --reporter junit \
  --output reports/layang-junit.xml

layang mock:start ./workspace \
  --protocol all \
  --daemon

layang benchmark ./workspace \
  --request "Get Track" \
  --iterations 50

layang docs:build ./workspace --check

layang ui ./workspace
```

Other CLI workflows cover:

* examples
* Proto revisions and diffs
* mock validation
* documentation generation
* benchmarks
* Git
* gateway profiles
* workspace migration

Native gRPC supports unary, server-streaming, client-streaming, and bidirectional methods. gRPC-Web supports unary and server-streaming.

Windows and Linux releases also provide standalone CLI packages with their own Node.js runtime. A system Node installation is not required for CLI-only use.

See [CLI_STANDALONE.md](./CLI_STANDALONE.md).

## Source Control

The desktop **Source Control** workspace uses the native Git executable.

Supported operations include:

* repository initialization
* clone
* status and diff
* stage and unstage
* discard
* pre-commit checks
* commit history
* branch create and switch
* remote setup
* fetch
* fast-forward pull
* push
* conflict detection
* merge continue and abort

Equivalent CLI commands are available:

```bash
layang git:init ./workspace --branch main
layang git:status ./workspace --json
layang git:stage ./workspace
layang git:check ./workspace
layang git:commit ./workspace --message "feat(grpc): add Watch Track"
layang git:remote-add ./workspace --url git@gitea.company.id:team/track-api.git
layang git:push ./workspace --set-upstream
```

## Development

Development setup, build commands, tests, and packaging notes are documented in [CONTRIBUTING.md](./CONTRIBUTING.md).

`pnpm desktop` runs the local Next.js renderer on port `12999`.

Before submitting changes, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Mock Guides

* [gRPC mock scenarios](guide-scenario-mock-grpc.md)
* [REST mock scenarios](guide-scenario-mock-rest.md)
* [WebSocket mock scenarios](guide-scenario-mock-websocket.md)

## License

MIT
