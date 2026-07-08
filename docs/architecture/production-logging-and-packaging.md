# Production Logging and Packaging

Layang uses a small Electron-side logger for packaged desktop builds. The logger is designed to help diagnose production issues without filling the disk or leaking request payloads by default.

## Goals

- Keep logs available in packaged apps.
- Avoid noisy console output in production.
- Support runtime log-level changes without restarting the app.
- Persist logger settings across app restarts.
- Cap individual log files and the total logs folder size.

## Defaults

| Mode | Level | Console mirror | File logging |
| --- | --- | --- | --- |
| Development | `debug` | on | on |
| Production / packaged | `info` | off | on |

The default file limit is 5 MB. The default total logs folder limit is 50 MB. Logs older than 14 days are removed.

## Runtime settings

The renderer talks to Electron through logger IPC:

- `logger:get-info`
- `logger:set-settings`
- `logger:open-folder`
- `logger:clear`
- `logger:log`

Runtime settings apply immediately and are persisted to `logger-settings.json` under Electron `userData`. This means the renderer can open the logger settings dialog, change the level, toggle console logging, open the log folder, or clear logs without restarting the app.

## Environment variables

Environment variables are startup defaults and developer/debug overrides. They are read when the Electron process starts:

```bash
LAYANG_LOG_LEVEL=debug
LAYANG_LOG_CONSOLE=1
LAYANG_LOG_MAX_BYTES=5242880
LAYANG_LOG_MAX_TOTAL_BYTES=52428800
LAYANG_LOG_RETENTION_DAYS=14
```

If an env variable is set, it overrides the persisted setting for that run. Runtime UI changes still apply while the app is running and are saved for future runs.

## Disk safety

The logger applies three cleanup rules:

1. Rotate the current log when it exceeds `maxBytes`.
2. Remove files older than `retentionDays`.
3. Remove oldest rotated logs until the logs folder is below `maxTotalBytes`.

The current log file is kept when applying the total folder limit whenever possible.

## What is logged

Current production logs include:

- app startup and packaged/dev status
- renderer load/fail events
- certificate policy decisions and TLS bypass warnings
- process uncaught exceptions and unhandled rejections
- gRPC mock scenario watcher and hot-reload warnings
- renderer logs sent through `createLogger(scope)`

Request and response bodies should not be logged by default. Payload logging should only be added behind explicit `debug` behavior when needed.

## Packaging scripts

Packaging entry points:

```bash
pnpm run desktop:pack
pnpm run desktop:dist
pnpm run desktop:win:setup
pnpm run desktop:win:portable
pnpm run desktop:linux:deb
pnpm run desktop:linux:rpm
```

Release workflows read `package.json` and publish artifacts for the current version.
