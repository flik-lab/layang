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

## APISIX Notes

If APISIX runs in Docker or another machine, set **Bind IP** to an address APISIX can reach, not `0.0.0.0`.

Examples:

```text
127.0.0.1      local desktop only
192.168.1.20   LAN/container reachable target
```

Use the displayed mock URL as the APISIX upstream target.
