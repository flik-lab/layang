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

Set:

```text
Loop: enabled
Max loops: 3
```

This sends the response sequence three times and then stops.

## Tips

- Keep messages small for high-frequency streams.
- Use the message event log to verify what was sent and received.
- Use WebSocket benchmark export for early latency checks.
