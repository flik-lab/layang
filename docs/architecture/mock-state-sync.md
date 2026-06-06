# Mock State Sync

This document defines how Layang synchronizes mock scenario state between the editor UI, the running mock server, and workspace files.

The goal is simple: **editing a mock scenario must feel instant, the running mock server must receive updates quickly, and workspace files must remain safe and Git-friendly.**

## Sources of truth

Layang has three related but separate mock states.

| Layer | Purpose | Update speed | Owner |
| --- | --- | --- | --- |
| UI mock state | What the user is editing and seeing | Immediate | React controllers |
| Runtime mock state | What the running mock server sends | Fast, usually 100–150 ms | Electron/runtime mock service |
| Workspace mock files | Durable scenario files on disk | Slower autosave, usually 1000–1600 ms | Workspace file adapter |

These layers must not overwrite each other blindly.

## Desired flow

```txt
User edits scenario in UI
  -> UI state updates immediately
  -> runtime mock server is synced quickly
  -> disk autosave runs after a calm delay
  -> file watcher ignores stale disk writes while UI is dirty
```

This behavior prevents the common race where a polling reload reads old files and overwrites the user's new edit.

## Timing rules

Recommended defaults:

```txt
UI edit state        : immediate
Mock runtime update  : 100–150 ms debounce
Disk autosave        : 1000–1600 ms debounce
File polling reload  : skip while UI is dirty
Electron watcher     : ignore stale reloads during write quiet period
```

The runtime sync can be fast because it is in-memory. Disk autosave should stay slower because workspace files are persistent and can be watched by editors, antivirus tools, and Git clients.

## Dirty guard

When the user edits a mock scenario from the UI, the mock controller should mark local state as dirty.

```txt
markMockServerLocalDirty()
  -> skip polling reload from workspace files
  -> allow live runtime sync
  -> wait for autosave to finish
  -> clear dirty state only after the save succeeds
```

File watcher reload must not apply stale content while the dirty flag is active.

## Scenario file model

Each scenario is stored as a separate JSON file.

```txt
mocks/
  mock-server.json
  scenarios/
    <service>.<method>/
      <scenario-id>.json
```

`mock-server.json` stores selection and method-level metadata.

```json
{
  "version": 1,
  "selectedScenarioIds": {
    "notification_management.NotificationManagementService/NotificationListStream": "success"
  },
  "enabledMethods": {
    "notification_management.NotificationManagementService/NotificationListStream": true
  },
  "updatedAt": "2026-06-06T10:00:00.000Z"
}
```

A scenario file stores a single scenario.

```json
{
  "id": "success",
  "service": "notification_management.NotificationManagementService",
  "method": "NotificationListStream",
  "stream": {
    "loop": true,
    "intervalMs": 1000,
    "responses": [
      { "data": { "message": "ok" } }
    ]
  }
}
```

## Rehydration rule

When a workspace opens, the UI must read both:

1. `mocks/mock-server.json`
2. all files under `mocks/scenarios/**`

Then it should rebuild the in-memory mock model.

If `selectedScenarioIds` points to an invalid scenario id, the UI should choose the first valid scenario for that method and surface a non-blocking warning.

## Runtime hot update rule

If a mock server is running and the selected scenario changes, the runtime must receive a fresh config object.

For server-streaming scenarios, active streams must read the latest scenario config on subsequent ticks, not only the snapshot captured when the stream started.

Expected behavior:

```txt
1. Start stream with scenario A, loop true
2. Edit scenario data while stream is running
3. Next stream tick uses edited data
4. Change loop to false
5. Current stream stops after configured responses
6. Start stream again
7. New stream uses latest data and latest loop setting
```

## Disk write rule

Do not replace the entire `mocks/scenarios` folder when only one scenario changes.

Preferred behavior:

```txt
- write changed scenario file
- delete removed scenario files
- write mock-server.json last
```

This is safer on Windows because folder-level rename can fail with `EPERM`, `EBUSY`, or `EACCES` when a file watcher, editor, or antivirus has the folder open.

## Conflict handling

Manual file edits are allowed, but must follow quiet-period rules.

Recommended strategy:

```txt
UI dirty true
  -> ignore external file reload

UI dirty false and file changed
  -> parse file
  -> validate service/method/id
  -> apply reload
  -> warn if selectedScenarioIds points to a missing scenario
```

## Validation expectations

The editor should reject or warn about these cases:

| Case | Message expectation |
| --- | --- |
| `{}` | `scenario.id is required` |
| `[]` in single-scenario editor | `top-level array is not supported in the single-scenario editor` |
| invalid JSON | include line and column when available |
| selected scenario missing | show method and missing id |
| scenario method mismatch | show expected service/method and found service/method |

## Implementation boundaries

Recommended modules:

```txt
features/mock-server/use-grpc-mock-controller.ts
features/mock-server/use-mock-runtime-sync.ts
features/mock-server/use-mock-workspace-sync.ts
features/mock-server/mock-scenario-files.ts
features/mock-server/mock-scenario-validation.ts
```

The UI should not write scenario files directly. It should update the mock controller, and the workspace sync hook should persist the result.
