# gRPC Mock Scenario Guide

This guide explains how Layang mock scenarios work for gRPC methods, including request matching, unary output, server-streaming output, loop behavior, and common examples.

## Scope

Layang mock server currently supports:

- Unary RPC
- Server-streaming RPC

It does not currently support:

- Client-streaming RPC
- Bidirectional-streaming RPC

## Where Mock Scenarios Live

Mock scenarios are typically stored under:

```text
mocks/
  mock-server.json
  scenarios/
    demo.v1.GreeterService.SayHello.json
    demo.v1.GreeterService.WatchHello.json
    manifest.json
```

Each method can have its own scenario file. The content can be `json` or `yaml`.

## Basic Scenario Shape

A scenario file contains a list of scenarios:

```json
{
  "version": 1,
  "scenarios": [
    {
      "id": "hello-alice",
      "service": "demo.v1.GreeterService",
      "method": "SayHello",
      "priority": 10,
      "active": true,
      "description": "Return a friendly unary response for Alice.",
      "input": {
        "equals": {
          "name": "Alice",
          "age": 21
        }
      },
      "output": {
        "data": {
          "message": "Hello Alice",
          "sequence": 1
        },
        "code": 0,
        "delayMs": 0
      }
    }
  ]
}
```

## Required Fields Per Scenario

- `id`: unique scenario id inside the method file
- `service`: full gRPC service name
- `method`: RPC method name

Recommended fields:

- `priority`: used when multiple active scenarios exist and no explicit selected scenario is set
- `active`: if `false`, the scenario is ignored
- `description`: free text note
- `input`: request matcher
- `output` or `response`: unary output block
- `stream`: server-streaming block

## Input Matching

Layang supports three matcher styles:

- `equals`
- `contains`
- `or`

### `equals`

The incoming request must match exactly as JSON content. Object key order does not matter.

```json
{
  "input": {
    "equals": {
      "name": "Alice",
      "age": 21
    }
  }
}
```

### `contains`

The incoming request only needs to contain the specified partial values.

```json
{
  "input": {
    "contains": {
      "name": "Ali"
    }
  }
}
```

For strings, `contains` behaves like substring matching. For objects and arrays, it behaves like partial deep matching.

Important:

- `contains: {}` is treated as invalid and will not match anything
- a scenario without a valid matcher will be rejected at runtime for selection/matching

### `or`

Use `or` when one scenario should match multiple request shapes.

```json
{
  "input": {
    "or": [
      { "equals": { "name": "Alice", "age": 21 } },
      { "contains": { "name": "Ali" } }
    ]
  }
}
```

## Unary Output

Unary methods use `output` or `response`. Both are accepted.

```json
{
  "output": {
    "data": {
      "message": "Hello Alice",
      "sequence": 1
    },
    "code": 0,
    "message": "OK",
    "delayMs": 200
  }
}
```

Field meaning:

- `data`: protobuf response payload
- `code`: gRPC status code, where `0` means OK
- `message`: error/status text when `code` is not OK
- `delayMs`: wait time before the unary response is returned

Behavior:

- if `code` is `0`, the server returns `data`
- if `code` is not `0`, the server returns a gRPC error instead of `data`
- if `data` is omitted and `code` is `0`, Layang returns `{}` as the response body

### gRPC Status Code Reference

The `code` field can be written as:

- a number, for example `5`
- a status name string, for example `"NOT_FOUND"`

Common values:

- `0` = `OK`
- `1` = `CANCELLED`
- `2` = `UNKNOWN`
- `3` = `INVALID_ARGUMENT`
- `4` = `DEADLINE_EXCEEDED`
- `5` = `NOT_FOUND`
- `6` = `ALREADY_EXISTS`
- `7` = `PERMISSION_DENIED`
- `8` = `RESOURCE_EXHAUSTED`
- `9` = `FAILED_PRECONDITION`
- `10` = `ABORTED`
- `11` = `OUT_OF_RANGE`
- `12` = `UNIMPLEMENTED`
- `13` = `INTERNAL`
- `14` = `UNAVAILABLE`
- `15` = `DATA_LOSS`
- `16` = `UNAUTHENTICATED`

Example using a numeric code:

```json
{
  "output": {
    "code": 5,
    "message": "User not found"
  }
}
```

Example using a status name:

```json
{
  "output": {
    "code": "NOT_FOUND",
    "message": "User not found"
  }
}
```

## Server-Streaming Output

Server-streaming methods use the `stream` block.

```json
{
  "id": "watch-hello-stream",
  "service": "demo.v1.GreeterService",
  "method": "WatchHello",
  "input": {
    "contains": {
      "name": "Alice"
    }
  },
  "stream": {
    "intervalMs": 500,
    "loop": true,
    "maxLoops": 2,
    "responses": [
      {
        "data": {
          "message": "Hello Alice #1",
          "sequence": 1
        }
      },
      {
        "data": {
          "message": "Hello Alice #2",
          "sequence": 2
        }
      }
    ]
  }
}
```

### Stream Fields

- `responses`: ordered list of emitted messages
- `intervalMs`: default delay between messages
- `loop`: whether the response list restarts after the last item
- `maxLoops`: restart limit

### Per-Response Fields

Each entry in `stream.responses` supports:

- `data`
- `code`
- `message`
- `delayMs`

Example:

```json
{
  "stream": {
    "intervalMs": 1000,
    "loop": false,
    "responses": [
      {
        "data": {
          "message": "tick 1",
          "sequence": 1
        },
        "delayMs": 0
      },
      {
        "data": {
          "message": "tick 2",
          "sequence": 2
        },
        "delayMs": 1500
      }
    ]
  }
}
```

Behavior:

- the first stream message starts immediately unless the first response has `delayMs`
- after each message, Layang waits `response.delayMs` if present
- if `response.delayMs` is not present, Layang uses `stream.intervalMs`
- if a response has `code != 0`, the stream ends with that gRPC error

## Loop Semantics

`maxLoops` is the number of restarts after the first full pass.

Examples with 2 responses:

- `loop: false` -> sends response 1, response 2, then ends
- `loop: true, maxLoops: 0` -> loops forever
- `loop: true, maxLoops: 1` -> plays the full list 2 times total
- `loop: true, maxLoops: 2` -> plays the full list 3 times total

When the last response is reached and the stream is about to end:

- Layang waits `lastResponse.delayMs` if set
- otherwise it waits `intervalMs`
- then it closes the stream

## Fallback Behavior

For a server-streaming scenario:

- if `stream.responses` exists and has valid items, Layang uses it
- otherwise Layang falls back to top-level `output` or `response` as a single streamed message
- if neither exists, the stream fails with `FAILED_PRECONDITION`

Example fallback:

```json
{
  "id": "watch-hello-fallback",
  "service": "demo.v1.GreeterService",
  "method": "WatchHello",
  "input": {
    "equals": {
      "name": "Bob",
      "count": 1
    }
  },
  "output": {
    "data": {
      "message": "Hello Bob",
      "sequence": 1
    },
    "code": 0
  }
}
```

That scenario will stream one message, then end.

## Active Scenario Selection

For each method, Layang effectively runs one active scenario at a time.

Selection order is:

1. the explicitly selected scenario for that method
2. otherwise the highest-priority active scenario
3. otherwise the first scenario in the method file

If a method is disabled in `enabledMethods`, no scenario for that method will be used.

## No-Match Behavior

If the request does not match the active scenario input:

- unary RPC returns `NOT_FOUND`
- server-streaming RPC ends with `NOT_FOUND`

The runtime error message includes:

- method name
- active scenario id
- available scenario ids
- checked scenario ids
- clipped request payload

## JSON Example for Unary

```json
{
  "version": 1,
  "scenarios": [
    {
      "id": "say-hello-alice",
      "service": "demo.v1.GreeterService",
      "method": "SayHello",
      "priority": 10,
      "input": {
        "or": [
          {
            "equals": {
              "name": "Alice",
              "age": 21
            }
          },
          {
            "contains": {
              "name": "Ali"
            }
          }
        ]
      },
      "output": {
        "data": {
          "message": "Hello Alice",
          "sequence": 1
        },
        "code": 0,
        "delayMs": 250
      }
    }
  ]
}
```

## JSON Example for Server Streaming

```json
{
  "version": 1,
  "scenarios": [
    {
      "id": "watch-hello-alice",
      "service": "demo.v1.GreeterService",
      "method": "WatchHello",
      "priority": 10,
      "input": {
        "contains": {
          "name": "Alice"
        }
      },
      "stream": {
        "intervalMs": 500,
        "loop": true,
        "maxLoops": 1,
        "responses": [
          {
            "data": {
              "message": "Hello Alice #1",
              "sequence": 1
            }
          },
          {
            "data": {
              "message": "Hello Alice #2",
              "sequence": 2
            }
          }
        ]
      }
    }
  ]
}
```

This example sends:

1. `Hello Alice #1`
2. `Hello Alice #2`
3. `Hello Alice #1`
4. `Hello Alice #2`

Then the stream ends.

## YAML Example

```yaml
version: 1
scenarios:
  - id: watch-hello-yaml
    service: demo.v1.GreeterService
    method: WatchHello
    priority: 10
    input:
      contains:
        name: Alice
    stream:
      intervalMs: 500
      loop: false
      maxLoops: 0
      responses:
        - data:
            message: Hello Alice #1
            sequence: 1
        - data:
            message: Hello Alice #2
            sequence: 2
```

## Practical Rules

- Use `input.equals` for strict request matching
- Use `input.contains` for partial matching
- Use `input.or` when one scenario must cover multiple request shapes
- Use `output` for unary RPC
- Use `stream.responses` for server-streaming RPC
- Use `delayMs` on a response item when one message needs a custom pause
- Use `loop: true` and `maxLoops: 0` only for intentionally infinite streams
- Keep one clearly selected scenario per method to avoid confusion
