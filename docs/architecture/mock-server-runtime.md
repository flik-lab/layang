# Mock Server Runtime

This document describes how Layang's mock server runtime should work for REST, WebSocket, gRPC, and gRPC server-streaming scenarios.

## Runtime responsibilities

The mock runtime is responsible for:

- Starting and stopping mock servers.
- Matching incoming requests to scenarios.
- Selecting the active scenario for a method or route.
- Sending unary, stream, WebSocket, or REST responses.
- Applying live updates from the UI without requiring a full server restart.

The runtime should not own durable project state. Workspace files are owned by workspace sync.

## Runtime inputs

The runtime receives a normalized mock config from the UI/controller layer.

```txt
UI/controllers
  -> normalized mock config
  -> Electron IPC
  -> mock runtime service
```

The runtime should treat the received config as the latest desired runtime state.

## Method key

gRPC method-level data should use a stable method key:

```txt
<ServiceFullName>/<MethodName>
```

Example:

```txt
notification_management.NotificationManagementService/NotificationListStream
```

This key is used by:

- `selectedScenarioIds`
- `enabledMethods`
- runtime lookup
- tab/session references
- scenario folder mapping

## Scenario selection

Selection is determined in this order:

1. Explicit `selectedScenarioIds[methodKey]` if valid.
2. First scenario matching the method.
3. No scenario response if no scenario exists.

If selected scenario id is invalid, the runtime should warn and fallback safely instead of crashing.

## Matching

A scenario may include input matching rules such as:

- `equals`
- `equals_unordered`
- `contains`
- `matches`
- `glob`
- `or`
- header matchers

Matcher normalization should be shared between UI, CLI, and runtime so a scenario behaves the same everywhere.

## Unary gRPC behavior

For unary methods:

```txt
incoming request
  -> find method scenarios
  -> evaluate matchers
  -> choose selected/matching scenario
  -> send configured response or error
```

If no scenario matches, return a clear mock error response rather than silently returning an empty object.

## Server-streaming behavior

For server-streaming methods:

```txt
incoming stream request
  -> select scenario
  -> send stream.responses in order
  -> if loop true, repeat according to intervalMs/maxLoops
  -> if scenario changes while active, use latest config for next tick
```

Active streams must not keep a stale scenario snapshot forever.

Expected live-edit behavior:

```txt
1. stream starts with scenario A
2. user edits response payload
3. next tick sends edited payload
4. user changes loop true -> false
5. stream finishes after current response sequence
6. next client stream starts with the latest scenario, not the original snapshot
```

## WebSocket mock behavior

WebSocket mock server responsibilities:

- Accept a mock path/route.
- Match client messages when a matcher exists.
- Send configured messages.
- Support manual send from UI.
- Support scenario-based responses.

WebSocket client sessions should go through request/session actions so their tabs are consistent with REST and gRPC requests.

## REST mock behavior

REST mock server responsibilities:

- Match method and path.
- Optionally match query params, headers, and body.
- Return configured status, headers, body, and delay.
- Allow update while running.

## Live runtime updates

When the UI changes a scenario while a mock server is running:

```txt
UI edit
  -> debounce runtime sync around 100–150 ms
  -> send normalized config to Electron
  -> runtime replaces active config
  -> active streams/websockets read latest config on next event/tick
```

The runtime should not wait for disk autosave to update active behavior.

## File reload safety

The runtime may also receive updates from workspace file watcher reloads. These updates must be guarded against stale disk writes.

Use these checks:

- Ignore file reload while UI local dirty state is active.
- Ignore reloads older than the latest UI update timestamp.
- Ignore partial writes where `mock-server.json` and scenario files disagree.
- Warn when selected scenario id is missing.

## Error handling

Mock runtime errors should be actionable.

Good examples:

```txt
No scenario selected for NotificationService/StreamNotifications.
Scenario "success" exists but service/method does not match this request.
mock-server.json selects scenario "error-case", but that id is not present for this method.
```

Avoid generic errors such as:

```txt
Mock failed.
Invalid config.
```

## IPC boundaries

Runtime operations should be exposed through Electron IPC, for example:

```txt
mock-grpc:start
mock-grpc:update
mock-grpc:stop
mock-websocket:start
mock-websocket:update
mock-websocket:stop
mock-rest:start
mock-rest:update
mock-rest:stop
```

Renderer code should not import Electron runtime services directly.

## Testing requirements

Regression tests should cover:

- Start mock server with selected scenario.
- Live edit stream response payload while running.
- Toggle loop true/false while running.
- Restart stream after scenario edit.
- Manual file edit reload.
- Invalid selected scenario fallback.
- Add WebSocket request, run WebSocket, and start WebSocket mock.
