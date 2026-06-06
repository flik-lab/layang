# Electron IPC

This document defines IPC boundaries between the renderer and Electron main process in Layang.

The renderer is the UI. The Electron main process owns local filesystem access, desktop window behavior, and native/runtime services.

## Boundary rule

Renderer code should not directly access Node filesystem APIs or Electron services.

Allowed flow:

```txt
React renderer
  -> window.layang/electron preload API
  -> ipcRenderer.invoke/send
  -> electron/main.cjs IPC handler
  -> filesystem/runtime service
```

Disallowed flow:

```txt
React renderer imports fs/path/electron main service directly
```

## IPC categories

Recommended categories:

```txt
workspace:*
mock-grpc:*
mock-rest:*
mock-websocket:*
window:*
docs:*
files:*
```

Examples:

```txt
workspace:read-folder
workspace:save-folder
workspace:read-mock-server
workspace:open-folder

mock-grpc:start
mock-grpc:update
mock-grpc:stop

mock-websocket:start
mock-websocket:update
mock-websocket:stop

window:minimize
window:maximize
window:close
```

## Preload contract

The preload file is the public bridge contract for the renderer.

If the renderer calls:

```ts
window.layang.workspace.saveFolder(payload)
```

then the preload should map that to the underlying IPC channel.

Renderer components should not know the string channel name unless there is no wrapper yet.

## Type contract

Every IPC payload should have a type in `types/electron.d.ts` or a feature-specific type file.

Avoid `any` for persistent workspace and mock server payloads.

Recommended shape:

```ts
export interface WorkspaceSavePayload {
  workspacePath: string;
  project: WorkspaceProjectSnapshot;
}
```

## Error handling

Main process errors should be returned as actionable renderer errors.

Bad:

```txt
Error invoking remote method
```

Better:

```txt
Workspace autosave failed because Windows locked mocks/scenarios. The save will retry.
```

IPC handlers should catch known filesystem errors such as:

```txt
EPERM
EBUSY
EACCES
ENOENT
```

## Filesystem safety

For workspace writes:

- Prefer per-file writes for frequently changed folders.
- Write index/manifest files last.
- Avoid folder-level rename for watched folders on Windows.
- Use fallback behavior when atomic replace fails.
- Do not leave temporary files behind after failure.

## Mock runtime IPC

Mock server update IPC must support live updates.

```txt
mock-grpc:start   -> create server if not running
mock-grpc:update  -> replace active config while keeping server alive
mock-grpc:stop    -> stop server and timers
```

Runtime services should not read stale disk files after the renderer has pushed a newer UI config.

## Workspace IPC

Workspace IPC should be deterministic:

```txt
read workspace
  -> normalize data
  -> return UI-friendly snapshot

save workspace
  -> validate payload
  -> write content files
  -> write index files last
  -> return success/warnings
```

If save partially fails, return a structured error with enough detail for the UI to show a helpful message.

## IPC naming convention

Use verb-based names:

```txt
workspace:read-folder
workspace:save-folder
mock-grpc:start
mock-grpc:update
mock-grpc:stop
```

Avoid ambiguous names:

```txt
workspace:data
mock:do
run
```

## Security notes

Layang is a desktop developer tool, but the renderer should still use a narrow preload API.

- Keep `contextIsolation` enabled when possible.
- Avoid exposing generic `ipcRenderer` to the renderer.
- Expose specific functions instead of raw channel access.
- Treat workspace file content as untrusted input.

## Testing requirements

IPC tests should cover:

- workspace save and read roundtrip
- workspace save failure with simulated `EPERM`
- mock server start/update/stop
- read mock server after external file edit
- payload validation for malformed workspace data


## Logger IPC

Logger settings and renderer log forwarding use dedicated IPC channels:

- `logger:log` forwards renderer logs to the Electron logger.
- `logger:get-info` returns the current log folder, active settings, and disk usage.
- `logger:set-settings` applies runtime logger settings immediately and persists them under Electron `userData`.
- `logger:open-folder` opens the current log folder.
- `logger:clear` removes existing log files and keeps the logger usable.

Renderer code should use `app/playground/shared/logger.ts` instead of calling these channels directly.
