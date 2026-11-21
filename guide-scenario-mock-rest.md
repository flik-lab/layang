# REST Mock Scenario Guide

This guide explains how Layang REST mock scenarios work in `1.0.4`.

REST mocks are designed for local/internal development. Start the mock server from the REST request **Mock** tab, choose a bind IP/port, then point your app, APISIX route, or test client to the displayed URL.

## Scenario Shape

Each REST scenario can match a method/path plus optional query, header, and body rules.

```json
{
  "id": "get-user-success",
  "requestId": "saved-request-id",
  "name": "Get user success",
  "enabled": true,
  "method": "GET",
  "path": "/users/:id",
  "priority": 20,
  "status": 200,
  "headers": [
    { "key": "content-type", "value": "application/json" }
  ],
  "body": "{\n  \"id\": \"{{request.path.id}}\",\n  \"ok\": true,\n  \"timestamp\": \"{{now}}\"\n}",
  "delayMs": 0,
  "matchQuery": [
    { "key": "include", "value": "profile" }
  ],
  "matchHeaders": [
    { "key": "x-test-case", "value": "success" }
  ],
  "matchBodyContains": "",
  "matchJsonPath": "",
  "matchJsonEquals": ""
}
```

## Matching Order

Layang checks enabled scenarios in priority order. Higher `priority` wins.

A scenario matches when all configured rules match:

1. HTTP method
2. path pattern
3. query matcher
4. header matcher
5. raw body contains matcher
6. JSON path matcher

If no scenario matches, the server returns `404` with a JSON diagnostic body.

## Path Parameters

Use either `:id` or `{id}` syntax.

```json
{
  "method": "GET",
  "path": "/users/:id"
}
```

```json
{
  "method": "GET",
  "path": "/users/{id}"
}
```

Both expose the value through templates:

```json
{
  "id": "{{request.path.id}}"
}
```

## Query and Header Matching

Query and header matchers require exact string equality.

```json
{
  "matchQuery": [
    { "key": "status", "value": "active" }
  ],
  "matchHeaders": [
    { "key": "x-tenant-id", "value": "demo" }
  ]
}
```

Header matching is case-insensitive.

## Body Matching

Use `matchBodyContains` for raw text matching:

```json
{
  "matchBodyContains": "premium"
}
```

Use `matchJsonPath` and `matchJsonEquals` for JSON payloads:

```json
{
  "matchJsonPath": "$.user.plan",
  "matchJsonEquals": "premium"
}
```

`matchJsonEquals` can be a JSON literal, for example `true`, `123`, or `{ "role": "admin" }`.

## Response Templates

Response bodies can use these templates:

```text
{{now}}
{{timestamp}}
{{uuid}}
{{request.path.id}}
{{request.query.name}}
{{request.header.authorization}}
{{request.bodyJson.data.id}}
```

Example:

```json
{
  "id": "{{request.path.id}}",
  "traceId": "{{uuid}}",
  "createdAt": "{{now}}"
}
```

Template rules:

- Every `{{uuid}}` occurrence gets its own fresh UUID.
- When the response `content-type` contains `json` (the default), a value substituted **inside a JSON string literal** (`"{{request.query.name}}"`) is JSON-escaped, so quotes, backslashes and control characters in request data cannot break the body. A placeholder outside quotes (`"n": {{request.query.n}}`) is inserted raw, so the request value must itself be valid JSON there.
- For non-JSON content types, values are inserted as-is.
- Unknown placeholders are left unchanged.

## Common Scenarios

### Success

```json
{
  "name": "Success",
  "method": "GET",
  "path": "/users/:id",
  "priority": 10,
  "status": 200,
  "body": "{ \"id\": \"{{request.path.id}}\", \"ok\": true }"
}
```

### Not Found

```json
{
  "name": "Not found",
  "method": "GET",
  "path": "/users/:id",
  "priority": 20,
  "matchQuery": [
    { "key": "case", "value": "not-found" }
  ],
  "status": 404,
  "body": "{ \"error\": \"User not found\" }"
}
```

### Validation Error

```json
{
  "name": "Validation error",
  "method": "POST",
  "path": "/users",
  "priority": 30,
  "matchJsonPath": "$.invalid",
  "matchJsonEquals": "true",
  "status": 422,
  "body": "{ \"error\": \"Validation failed\" }"
}
```

### Delayed Response

```json
{
  "name": "Delayed success",
  "method": "GET",
  "path": "/slow",
  "priority": 5,
  "delayMs": 1000,
  "status": 200,
  "body": "{ \"delayed\": true }"
}
```

If the scenario is disabled while a delayed response is waiting, the client receives `503` with a JSON error instead of the scenario response.

## Error Responses and Limits

| Status | When |
| --- | --- |
| `400` | The request path contains malformed percent-encoding (`Malformed URL encoding`). |
| `403` | The server is bound to loopback, the request comes from a web browser (it has an `Origin` or `Sec-Fetch-Site` header), and its `Host` header is not `localhost`, `127.0.0.1`, `[::1]` or the bind host (DNS-rebinding protection). |
| `404` | No scenario matched. |
| `413` | The request body is larger than 10 MiB. The connection is closed after the response. |
| `500` | Unexpected mock server error (logged; JSON body). |
| `503` | Pending-request capacity reached, or the scenario was disabled during its delay. |
| `504` | A standby (manual/periodic/scheduled) response was not released before its timeout. |

All responses include `access-control-allow-origin: *`. The `Host` check is what prevents other websites from reading the mock through DNS rebinding.

The **status** `requestCount` counts every logged request since the server started; the visible request log keeps only the latest 80 entries.

## APISIX Notes

If APISIX runs in Docker or another machine, set **Bind IP** to an address APISIX can reach. `0.0.0.0` and `::` are narrowed to `127.0.0.1`.

When the mock is bound to loopback, browser requests must carry a loopback `Host` header. Requests from tools, services and CLIs are not checked. If a browser calls the mock through APISIX and APISIX forwards the browser's original `Host` (`pass_host: pass`, the default), the mock answers `403`; set `pass_host: node` on the upstream, or bind the mock to a non-loopback IP (no `Host` check is applied then).

Examples:

```text
127.0.0.1      local desktop only
192.168.1.20   LAN/container reachable target
```

Use the displayed mock URL as the APISIX upstream target.
