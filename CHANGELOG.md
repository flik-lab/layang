# Changelog

## 1.0.0

### Major

- Released Layang `1.0.0` as the first official stable version.
- Added the full REST API workbench with method, URL, params, headers, auth, body editing, request execution, response history, docs, examples, and workspace persistence.
- Added REST local mock scenarios with priority, delay, query/header/body matching, JSON path matching, response templates, request logs, common presets, and live reload.
- Added the WebSocket workbench for saved WebSocket requests, live ws/wss connections, message sending, event review, benchmark exports, generated docs, and desktop-managed mock responses.
- Included the complete gRPC and gRPC-Web workflow with proto import, service/method browsing, unary and server-streaming calls, metadata, response history, docs, tests, benchmarks, and local mock scenarios.

### Minor

- Added guide files for REST, WebSocket, and gRPC mock scenarios.
- Improved APISIX/local network mock workflows with configurable bind IP support.
- Improved workspace-first API collections so REST, WebSocket, gRPC, and gRPC-Web requests can live together in the same project.
- Expanded Electron IPC and service boundaries used by desktop-only mock server features.
- Updated project version to `1.0.0`.

### Notes

- REST, WebSocket, gRPC, and gRPC-Web workflows are now part of the official `1.0.0` release.
- Local mock behavior is intended for local and internal development.
- Bruno import/export is not included in this release.
