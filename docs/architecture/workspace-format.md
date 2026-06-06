# Workspace Format

This document defines the durable workspace structure used by Layang.

Layang workspaces are local-first and Git-friendly. The folder should be readable, reviewable, and mergeable in Git without relying on a binary database.

## Goals

- Keep requests, protos, examples, docs, mocks, and settings in plain files.
- Allow users to edit scenario files manually.
- Keep workspace diffs readable in Git.
- Avoid global state that cannot be reconstructed from files.
- Make load/save deterministic.

## Folder layout

A typical workspace should look like this:

```txt
workspace/
  layang.workspace.json
  project.json
  layout.json
  settings.json
  environments.json

  protos/
    notification.proto
    tactical-display.proto

  collections/
    collection-a.json
    collection-b.json

  requests/
    <optional request files>

  mocks/
    mock-server.json
    scenarios/
      notification_management.NotificationManagementService.NotificationListStream/
        success.json
        empty.json
        error.json

  docs/
    method-docs.json
    examples/
      <example files>

  history/
    <response history files>
```

Not every folder must exist. Missing optional folders should be treated as empty.

## Root files

### `layang.workspace.json`

Workspace identity and version marker.

```json
{
  "version": 1,
  "name": "My API Workspace",
  "createdAt": "2026-06-06T10:00:00.000Z",
  "updatedAt": "2026-06-06T10:00:00.000Z"
}
```

### `project.json`

Project-level data that does not belong to a specific feature file.

Recommended content:

```json
{
  "version": 1,
  "name": "My API Workspace",
  "description": "Local-first API workspace"
}
```

### `layout.json`

UI layout persistence only. It must never contain request content or mock runtime state.

```json
{
  "version": 1,
  "sidebarWidth": 320,
  "responsePanelWidth": 480,
  "activePanel": "request"
}
```

### `settings.json`

Workspace settings such as default target, default transport mode, or mock defaults.

### `environments.json`

Named environment targets.

```json
{
  "version": 1,
  "activeEnvironmentId": "local",
  "environments": [
    {
      "id": "local",
      "name": "Local",
      "variables": {
        "host": "localhost",
        "port": "50051"
      }
    }
  ]
}
```

## Collections

Collections are groups of saved requests.

A collection file should contain:

```json
{
  "version": 1,
  "id": "collection-main",
  "name": "Main API",
  "requests": [
    {
      "id": "request-1",
      "name": "Notification stream",
      "kind": "grpc",
      "service": "notification_management.NotificationManagementService",
      "method": "NotificationListStream",
      "protoPath": "protos/notification.proto"
    }
  ]
}
```

Request ids should be stable. UI labels may change, but ids should not be regenerated unless the user duplicates a request.

## Proto files

Proto files are source artifacts. They should be stored under `protos/` exactly as imported, unless the user explicitly edits them.

Derived method metadata should not be considered more authoritative than the proto source. If a proto is removed, any tab/session that depends on it should close or become invalid with a clear message.

## Mock files

Mock files live under `mocks/`.

```txt
mocks/
  mock-server.json
  scenarios/
    <service>.<method>/
      <scenario-id>.json
```

`mock-server.json` stores selected scenario ids and method enablement.

Scenario files store individual scenario definitions.

See [Mock State Sync](./mock-state-sync.md) and [Mock Server Runtime](./mock-server-runtime.md) for runtime rules.

## Docs and examples

Generated docs and saved examples should be stored separately.

```txt
docs/
  method-docs.json
  examples/
    get-user-success.json
    notification-stream.json
```

Docs should not be required for requests to work. They are metadata that can be rebuilt or edited independently.

## History

Response history can be large. Keep it optional and pruneable.

Recommended policy:

- Save history only when the user enables it or explicitly saves a result.
- Avoid storing huge binary response bodies.
- Store enough metadata to reopen useful results.

## Load behavior

When opening a workspace:

1. Read root workspace files.
2. Load protos.
3. Load collections and requests.
4. Load environments.
5. Load mock server config and scenario files.
6. Load docs/examples.
7. Restore layout.
8. Validate references.

Invalid references should not crash the workspace. They should produce warnings and safe fallback state.

## Delete behavior

When deleting a workspace entity, dependent UI state must be cleaned up.

| Deleted entity | Required cleanup |
| --- | --- |
| Collection | close tabs for all requests in the collection |
| Request | close tabs for that request |
| Proto | close gRPC tabs that depend on methods from that proto |
| Scenario | clear selected scenario if it points to the deleted scenario |
| Environment | switch active environment to a valid fallback |

## Save behavior

Workspace writes should be deterministic.

Recommended order:

1. Write content files such as scenarios, collections, docs.
2. Write index/manifest files last.
3. Update root `updatedAt` only after successful content writes.

For Windows compatibility, prefer per-file writes over folder-level atomic replace for folders that are actively watched, especially `mocks/scenarios`.

## Compatibility rule

Workspace format changes must be versioned.

If the shape changes, add a migration function:

```txt
load old format
  -> normalize to current in-memory format
  -> save current format only when user saves
```

Do not silently drop unknown fields unless they are known to be obsolete.
