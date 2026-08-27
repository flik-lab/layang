# Workspace Format v6

Layang workspace v6 is a human-readable, Git-friendly filesystem. YAML, Markdown, and raw `.proto` files are the canonical source of truth. Desktop and CLI use the same loader in `lib/git-workspace.cjs`.

## Design rules

- One saved request is one protocol-suffixed YAML file.
- Collection and folder hierarchy matches the filesystem.
- Request bodies, assertions, examples, and mock payloads are native YAML values instead of JSON strings inside YAML.
- Global proto libraries live once under `protos/` and can be shared by every collection.
- Every proto revision is an immutable, self-contained snapshot of raw `.proto` files.
- A request stores only the stable proto library ID, revision ID, method, and version policy. Request/response types and checksums are derived on load.
- Shared defaults are tracked. Last-used environments, local paths, secrets, tabs, layout, and runtime state live under `.layang/` and are ignored by Git.
- Examples use stable request references and are stored beside their request.
- Writes are per-file and atomic; Layang does not replace the entire workspace directory.
- Unknown entity fields are preserved under `extensions`. Existing YAML comments are retained as a preserved comment block when a managed file is rewritten.

## Layout

```text
workspace/
├── layang.yml
├── README.md
├── collections/
│   └── track-api--<stable-id>/
│       ├── collection.yml
│       ├── README.md
│       └── track-query--<stable-id>/
│           ├── folder.yml
│           ├── README.md
│           ├── get-track--<stable-id>.grpc.yml
│           ├── get-track--<stable-id>.grpc.md
│           └── get-track--<stable-id>.examples/
│               └── friendly-track--<stable-id>.example.yml
├── protos/
│   ├── .layang-managed
│   └── track-api--<stable-id>/
│       ├── library.yml
│       └── revisions/
│           ├── revision-1--<stable-id>/
│           │   ├── revision.yml
│           │   └── files/**/*.proto
│           └── revision-2--<stable-id>/
│               ├── revision.yml
│               └── files/**/*.proto
├── environments/*.environment.yml
├── mocks/
│   ├── grpc/
│   ├── rest/
│   └── websocket/
├── gateways/*.gateway.yml
├── docs/
├── workspace-schemas/*.schema.json
└── .layang/
    ├── local.yml
    ├── layout.yml
    ├── settings.yml
    ├── tabs/*.tab.yml
    ├── history.yml
    ├── doc-results.yml
    └── backups/
```

## Root manifest

`layang.yml` contains only stable workspace metadata and format identifiers.

```yaml
version: 6
kind: workspace
workspace:
  id: workspace-a1b2c3
  name: Naval Development
  description: Tactical API integration workspace
format:
  collections: yaml-entity-v2
  protos: revision-snapshot-v1
  mocks: native-yaml-v2
  examples: request-ref-v2
  localState: .layang/
```

Opening a tab, running a request, or changing the last-used environment does not modify this tracked file.

## Collections and requests

Each collection owns a directory with `collection.yml`. Each UI folder owns a directory with `folder.yml`. Each request is a separate protocol-suffixed YAML file:

```text
login.rest.yml
track-events.websocket.yml
get-track.grpc.yml
```

Ordering uses `order` with stable numeric gaps. Moving or editing one request normally changes only that request file.

A gRPC request stores a compact schema reference:

```yaml
version: 2
kind: request
info:
  id: request-get-track
  name: Get Track
  protocol: grpc
  order: 1000
request:
  url: localhost:50051
  grpc:
    schema:
      libraryId: proto-track
      revisionId: proto-track-r2
    method: tactical.track.v1.TrackService/GetTrack
    versionPolicy: pinned
  body:
    tacticalTrackNumber: 342
  assertions:
    grpcStatus: OK
    bodyContains:
      identity: IDENTITY_FRIEND
  defaults:
    environment: development
```

`requestType`, `responseType`, method signature, schema checksum, and validity are derived from the referenced snapshot when the workspace loads.

## Proto libraries and revisions

Each revision directory is self-contained and stores the complete raw source tree under `files/`:

```text
revision-2--93a821ef/
├── revision.yml
└── files/
    ├── tactical/track.proto
    └── common/types.proto
```

`revision.yml`:

```yaml
version: 2
kind: proto-revision
revision:
  id: proto-track-r2
  label: Revision 2
  lifecycle: active
  checksum: fnv1a64:a8fd38d120adb813
  previousRevisionId: proto-track-r1
  storage: snapshot
  immutable: true
  source:
    type: directory
    name: tactical-protos
    localRef: proto-source:proto-track-r2
```

The actual absolute import directory is stored only in `.layang/local.yml`. On load, Layang recomputes the checksum from all normalized `.proto` files. If a stored immutable revision was edited externally, it is marked `externally-modified` and cannot be silently overwritten; create a new revision from the changed files instead.

Workspace v5 delta revisions remain readable for migration. Migration reconstructs each revision and writes a complete v6 snapshot.

## Environments

Shared, non-secret environment definitions are tracked:

```yaml
version: 2
kind: environment
environment:
  key: development
  label: Development
  targets:
    rest: http://localhost:3000
    grpcNative: localhost:50051
    grpcWeb: http://localhost:8080
    websocket: ws://localhost:8090
  variables:
    trackId: "342"
```

A request may track a shared default in `request.defaults.environment`. The last environment selected by each user is stored per request in `.layang/local.yml`:

```yaml
requestEnvironments:
  request-get-track: staging
  request-watch-track: development
```

This keeps personal switching behavior out of Git.

## Examples

Examples use stable request IDs and native YAML values:

```yaml
version: 2
kind: example
example:
  id: example-friendly
  name: Friendly track
  enabled: true
  requestRef:
    id: request-get-track
  input:
    body:
      tacticalTrackNumber: 342
  expected:
    status: OK
    body:
      identity: IDENTITY_FRIEND
  assertions:
    bodyContains:
      identity: IDENTITY_FRIEND
```

Examples are stored beside their request in `<request-file>.examples/`. Unresolved legacy examples are retained under `examples/orphaned/` rather than discarded.

## Mocks

REST and WebSocket scenarios are one native YAML file per scenario. gRPC method mocks store native `scenarios` arrays and never persist nested `scenarioText` JSON.

```yaml
version: 2
kind: grpc-mock
method:
  service: tactical.track.v1.TrackService
  name: GetTrack
scenarios:
  - id: friendly
    input:
      equals:
        tacticalTrackNumber: 342
    response:
      data:
        identity: IDENTITY_FRIEND
```

The existing runtime model is reconstructed on load so the desktop mock editor and CLI remain compatible.

## Local paths and secrets

Tracked YAML may contain a portable reference such as `certificateRef` or `localRef`, but never an absolute certificate, private-key, PFX, or imported-proto path. Actual local mappings live in `.layang/local.yml`, which is ignored by Git.

The writer maintains this ignore block:

```gitignore
# BEGIN Layang local state
.layang/
environments/*.local.yml
*.secret.yml
*.local.yml
# END Layang local state
```

## Documentation and external editing

Layang creates readable Markdown templates for the workspace, collections, folders, and requests. Once edited, they become normal documentation sources. Generated API output follows `docs/settings.yml` and defaults to `generatedOutput: ignore`.

`workspace-schemas/` contains JSON Schema files for common v2 entities, enabling validation and editor assistance outside Layang.

Managed YAML uses a deterministic JSON-compatible YAML subset. Ambiguous values such as `{{token}}`, URLs, and YAML indicator-prefixed strings are quoted, so files remain valid for standard YAML parsers. Unknown fields are retained under `extensions`.

## Loading and migration

Load order:

1. Read v6 split files when `layang.yml` exists.
2. Continue reading v5 split files, including delta proto revisions, for backward compatibility.
3. Otherwise read legacy v4 `layang.workspace.json` or `project.json` inputs.
4. Normalize to the current in-memory `ProjectData`.
5. On migration/save, back up the previous tracked workspace under `.layang/backups/`, then write v6 files.

CLI commands:

```bash
layang workspace:migrate . --check
layang workspace:migrate .
layang workspace:format . --check
layang workspace:format .
```

## Shared loader

Electron and CLI both call `readGitWorkspace()`. Requests, local overlays, mock scenarios, and pinned proto snapshots therefore resolve identically in the UI and command line.
