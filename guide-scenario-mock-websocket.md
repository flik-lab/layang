# WebSocket Mock Scenario Guide

This guide explains the WebSocket mock server in Layang.

The WebSocket mock server is intended for local development. It can accept WebSocket clients, send a configured response, stream messages on connect, and send a message manually from the workbench.

## Basic Settings

The WebSocket mock panel controls:

- port
- path
- response payload
- interval in milliseconds
- loop mode
- max loops
- stream on connect
- send once

Example URL:

```text
ws://127.0.0.1:8090/mock/ws
```

## Response Shape

The response text can be a single message:

```json
{
 "type": "message",
 "message": "Hello from Layang",
 "timestamp": "{{now}}"
}
```

Or an array of messages for streaming:

```json
[
 {
  "type": "message",
  "step": 1,
  "timestamp": "{{now}}"
 },
 {
  "type": "message",
  "step": 2,
  "timestamp": "{{now}}"
 }
]
```

## Templates

WebSocket mock responses support common templates:

```text
{{now}}
{{timestamp}}
{{uuid}}
{{count}}
```

Example:

```json
{
 "event": "heartbeat",
 "count": "{{count}}",
 "id": "{{uuid}}",
 "time": "{{now}}"
}
```

## Common Scenarios

### Send Once

Use **Send once** to push the current response to connected clients.

### Stream on Connect

Enable **Stream on connect** to send the response sequence automatically when a client connects.

### Looping Stream

Set:

```text
Loop: enabled
Max loops: 0
```

`0` means unlimited loops.

### Finite Stream

`Max loops` uses the same semantics as gRPC mock streams: it is the number of **restarts after the first full pass** of the response sequence.

- `Loop: disabled` -> plays the sequence once, then stops (`Max loops` is ignored)
- `Loop: enabled, Max loops: 0` -> loops forever
- `Loop: enabled, Max loops: 1` -> plays the full sequence 2 times total
- `Loop: enabled, Max loops: 3` -> plays the full sequence 4 times total

Example:

```text
Loop: enabled
Max loops: 3
```

With a two-message sequence `["a", "b"]` this sends `a, b, a, b, a, b, a, b` (four passes) and then stops.

The same budget applies to every automatic source: stream on connect, replies to incoming messages, and scheduled sends. It is counted per connected client. Manual **Send once** is never limited by `Max loops`.

### Connection security

The WebSocket mock listens on `127.0.0.1` only. Upgrades are rejected with `403` when the `Host` header is not a loopback name (`localhost`, `127.0.0.1`, `[::1]`) or when the `Origin` header belongs to another website. Allowed origins are: no `Origin` header, `null`, `file://`, and `http(s)://localhost`, `127.0.0.1` or `[::1]` on any port.

Single inbound frames larger than 16 MiB close the connection with code `1009` (message too big).

## Tips

- Keep messages small for high-frequency streams.
- Use the message event log to verify what was sent and received.
- Use WebSocket benchmark export for early latency checks.
