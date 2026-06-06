# Request Session Tabs

This document defines the request/session domain model used by Layang.

The important rule is: **tabs are not just UI widgets; they are domain sessions.** A tab represents an editable or runnable request session with identity, source reference, runtime events, and response state.

## Why this is a domain model

Layang supports multiple request sources:

- REST requests from collections.
- WebSocket requests from collections.
- gRPC methods imported from proto files.
- Temporary/manual requests.
- Saved examples opened as runnable requests.

If each feature directly edits tab arrays, tabs can become stale when a collection, request, or proto is deleted.

Therefore all tab/session mutation must go through request session actions.

## Core concepts

### RequestSession

A `RequestSession` is the runtime/editing representation of an opened request.

Recommended shape:

```ts
export type RequestSessionKind = "rest" | "grpc" | "websocket";

export type RequestSessionSource =
  | {
      type: "collection-request";
      collectionId: string;
      requestId: string;
    }
  | {
      type: "proto-method";
      protoId: string;
      service: string;
      method: string;
    }
  | {
      type: "manual";
    }
  | {
      type: "example";
      exampleId: string;
    };

export interface RequestSession {
  id: string;
  kind: RequestSessionKind;
  title: string;
  source: RequestSessionSource;
  requestJson: string;
  metadata: MetadataPair[];
  events: RuntimeEvent[];
  lastResult: RequestResult | null;
  assertionResults: AssertionResult[];
  dirty: boolean;
}
```

The exact project type names may differ, but the ownership rule should stay the same.

### Active session

Only one session should be active at a time.

```txt
requestSessions[]
activeRequestId
activeRequestIdRef
```

`activeRequestIdRef` is useful for async runtime events because streaming/WebSocket events may arrive after React state has changed.

## Required request session actions

All tab/session updates should go through a single action surface.

```ts
openRequestSession(session)
activateRequestSession(session)
upsertRequestSessionPreservingOrder(session)
updateRequestSession(id, patch)
closeRequestSession(id)
closeAllRequestSessions()
closeOtherRequestSessions(id)
closeSessionsByCollection(collectionId)
closeSessionsByRequest(collectionId, requestId)
closeSessionsByProto(protoId)
closeSessionsByMethod(service, method)
```

Feature modules should not directly mutate `requestSessions` unless they are inside the request-session module.

## Activation rule

Activating a session must persist the current active session first.

```txt
activate session B
  -> if session A is active, store A's current events/result/assertions/body/metadata
  -> set activeRequestId to B
  -> load B's body/metadata/events/result into the editor area
```

This prevents a user from losing edits when switching tabs.

## Add request flow

When adding a request from a collection:

```txt
create collection request
  -> create request session
  -> upsert session
  -> activate session
  -> set request editor tab to Body
```

The collection feature should call request-session actions instead of implementing activation itself.

## WebSocket flow

When sending a WebSocket request:

```txt
prepare WebSocket session
  -> upsert request session
  -> activate request session
  -> clear previous events/result if needed
  -> connect or send message
```

The WebSocket runner must receive a real `activateRequestSession` function from the request-session domain, not a placeholder or ref object.

## Delete cleanup rules

When a source entity is deleted, related sessions must be closed.

| Deleted entity | Action |
| --- | --- |
| Collection | `closeSessionsByCollection(collectionId)` |
| Request | `closeSessionsByRequest(collectionId, requestId)` |
| Proto | `closeSessionsByProto(protoId)` |
| gRPC method | `closeSessionsByMethod(service, method)` |

If the active session is closed, activate the nearest remaining session. If no session remains, clear the editor and response view.

## Source identity rule

Do not infer tab ownership from title text. Use stable ids from `source`.

Bad:

```txt
close tabs where title starts with collection name
```

Good:

```txt
close tabs where session.source.collectionId === deletedCollectionId
```

## Runtime event ownership

Streaming and WebSocket events may arrive for inactive sessions.

The event handler must append events to the correct session by id.

```txt
runtime event arrives
  -> find session id
  -> append to that session
  -> if it is active, also update visible event list
```

Do not assume incoming events always belong to the active tab.

## Domain boundary

Recommended module:

```txt
features/request-editor/use-request-session-controller.ts
features/request-editor/use-request-session-actions.ts
features/request-editor/request-session-model.ts
```

Other features may depend on the request-session action interface, but should not own request session arrays.

## Regression tests

Required tests:

- Add REST request opens a session.
- Add WebSocket request opens a session.
- Run WebSocket uses an active session function.
- Delete request closes its tab.
- Delete collection closes all child request tabs.
- Delete proto closes gRPC method tabs.
- Streaming event for inactive tab updates the correct tab.
- Switching tabs preserves request body and response history.
