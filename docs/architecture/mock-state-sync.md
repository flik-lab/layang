# Mock State Sync

This document defines how Layang synchronizes mock scenario state between the editor UI, the running mock server, and workspace files.

The goal is simple: **UI edits should update the running mock server quickly, while external file edits should only be pulled when the user explicitly asks for them.**

## Sources of truth

Layang has three related but separate mock states.

| Layer | Purpose | Owner |
| --- | --- | --- |
| UI mock state | What the user is editing and seeing | React controllers |
| Runtime mock state | What the running mock server sends | Electron/runtime mock service |
| Workspace mock files | Durable scenario files on disk | Workspace file adapter |

These layers must not overwrite each other blindly.

## UI edit flow

```txt
User edits scenario in UI
  -> UI state updates immediately
  -> running mock server receives a fresh config
  -> workspace autosave writes changed files
```

This flow keeps the running mock server aligned with what the user sees in the editor.

## External file edit flow

External mock scenario file edits are applied by an explicit UI action instead of hidden periodic polling.

```txt
1. Click Open folder from the mock scenario panel
2. Edit mocks/mock-server.json or mocks/scenarios/** in an external editor
3. Save the file
4. Click Update from file in Layang
5. Layang reads mocks/mock-server.json and mocks/scenarios/** again
6. If the gRPC mock server is running, Layang pushes the refreshed config to the runtime immediately
```

This avoids surprising UI changes while the user is editing files manually.

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

When a workspace opens or **Update from file** is clicked, the UI must read both:

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

Manual file edits are allowed, but the user chooses when to pull them into the UI.

Recommended strategy:

```txt
UI dirty true
  -> keep UI state authoritative
  -> runtime follows UI edits

User clicks Update from file
  -> parse workspace files
  -> validate service/method/id
  -> replace UI mock model with file data
  -> update running mock server if active
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
