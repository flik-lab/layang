# Architecture Notes

This folder describes the architectural boundaries used by Layang.

Layang is a local-first API workbench. Most runtime behavior is driven by three sources of truth that must stay separate:

1. **UI state**: React state used for immediate feedback while the user edits requests, scenarios, tabs, and environments.
2. **Runtime state**: active mock servers, WebSocket clients, streaming timers, and in-memory request sessions.
3. **Workspace files**: Git-friendly project files saved under a workspace folder.

The documents in this folder define how those layers interact and where future features should be added.

## Documents

- [Workspace Format](./workspace-format.md)
- [Mock State Sync](./mock-state-sync.md)
- [Mock Server Runtime](./mock-server-runtime.md)
- [Request Session Tabs](./request-session-tabs.md)
- [Electron IPC](./electron-ipc.md)
- [Production Logging and Packaging](./production-logging-and-packaging.md)
- [Refactor Boundaries](./refactor-boundaries.md)
