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
- Fixed bug , can edit mock grpc server interval and edit on running scenario.

### Notes

- REST, WebSocket, gRPC, and gRPC-Web workflows are now part of the official `1.0.0` release.
- Local mock behavior is intended for local and internal development.


## 1.0.0-rc.2

### Major

- Added WebSocket workbench beta for requests, live connections, messages, events, mocks, docs, and benchmark export.
- Fixed gRPC-Web transport for unary and server-streaming calls through APISIX.
- Added trusted local HTTPS self-signed certificate bypass for Electron.
- Added Google protobuf import support.
- Improved gRPC mock server with live scenario reload, health service support, APISIX-friendly targets, and configurable bind IP.

### Minor

- Improved workspace collections so gRPC, gRPC-Web, and WebSocket requests can live together.
- Split environment URLs by transport: gRPC-Web, Native gRPC, and WebSocket.
- Fixed workspace/tab restore so closed tabs stay closed and saved gRPC tabs reopen as runnable method tabs.
- Deleting a workspace or workset now closes related active tabs.
- Added empty-state guidance when no tab is open.
- Improved response search to filter rows and bold matches without changing payloads.
- Removed unnecessary request `kind` labels and test tabs.
- Moved the dark mode control to the bottom of the sidebar.
- Changed environment IDs to 8 characters.
- Refined mock, docs, examples, sidebar, styling, and lint compatibility.

### Accessibility

- Added tab shortcuts: close active/all tabs, middle-click close, arrow navigation, Home/End, Delete/Backspace.
- Added accessible labels for tabs, editor actions, window controls, and buttons.
- Improved all code editors with formatter/fullscreen controls and shortcuts:
  - `Shift+Alt+F` format
  - `F11` fullscreen
  - `Esc` exit fullscreen
  - `Tab` / `Shift+Tab` indent control
  - Quote wrapping for selected text

## 1.0.0-rc.1

### Added

- Initial Layang release.
- Added local-first portable workspaces.
- Added `.proto` import, service/method browsing, desktop gRPC and gRPC-Web clients.
- Added unary and server-streaming calls.
- Added saved tabs, metadata, environments, examples, tests, response history, and docs metadata.
- Added mock scenario editor and local mock server.
- Added latency benchmark export.
- Added Markdown/HTML API docs generation.
- Added CLI workspace validation, request listing, mock checks, and native gRPC runs.
- Added Windows desktop build and installer workflow.