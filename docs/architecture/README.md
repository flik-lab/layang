# Architecture Notes

This folder describes the architectural boundaries used by Layang.

Layang is a local-first API workbench. Most behavior is driven by three sources of truth that must stay separate:

1. **UI state**: React state used for immediate feedback while the user edits requests, scenarios, tabs, and environments.
2. **Runtime state**: active mock servers, WebSocket clients, streaming timers, native gRPC calls, and in-memory request sessions.
3. **Workspace files**: Git-friendly project files saved under a workspace folder.

Machine-local preferences such as imported certificates, TLS bypass, logger settings, and app zoom are stored under Electron `userData`; they are not workspace files.

## Documents

- [Workspace Format](./workspace-format.md)
- [Mock State Sync](./mock-state-sync.md)
- [Mock Server Runtime](./mock-server-runtime.md)
- [Request Session Tabs](./request-session-tabs.md)
- [Certificate Settings](./certificate-settings.md)
- [App Zoom Settings](./app-zoom-settings.md)
- [Electron IPC](./electron-ipc.md)
- [Production Logging and Packaging](./production-logging-and-packaging.md)
