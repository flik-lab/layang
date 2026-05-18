# Changelog

## 1.0.0-rc.2

### Major

- Added the WebSocket workbench beta for creating WebSocket requests, opening live connections, sending messages, and reviewing connection events.
- Added desktop WebSocket mock server beta with start, stop, and send-once controls for local testing.
- Added WebSocket documentation beta so saved WebSocket requests can be previewed, published, and exported with the rest of the workspace docs.

### Minor

- Improved workspace-first API collections so gRPC and WebSocket requests can live together in the same project.
- Added WebSocket benchmark export support for early latency checks.
- Refined mock, docs, examples, and sidebar workflows for larger API workspaces.
- Moved the dark mode control to the bottom of the sidebar.
- Updated minor component view styling.
- Expanded Electron IPC and service boundaries used by desktop-only mock server features.

### Beta Notes

- WebSocket support is still beta. Expect API and workspace schema details to change before the stable `1.0.0` release.
- WebSocket mock behavior is intended for local development and early feedback, not production traffic.


## 1.0.0-rc.1

### Added

- Initial release of Layang.
- Added local-first workspace support with portable workspace folders.
- Added `.proto` import with service, method, request type, and response type browsing.
- Added desktop gRPC and gRPC-Web client.
- Added support for unary and server-streaming calls.
- Added saved request tabs, metadata, environments, examples, tests, response history, and docs metadata.
- Added per-method mock scenario editor.
- Added local mock server support from the desktop app.
- Added latency benchmark runner with JSON report export.
- Added Markdown and HTML API documentation generation.
- Added CLI support for validating workspaces, listing saved requests, checking mock scenarios, and running native gRPC requests.
- Added Windows desktop build and installer workflow.
