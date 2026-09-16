# Request Session Tabs

Request tabs are the **control plane** for runnable requests. A `RequestSession` owns editable request configuration and stable identity; it does not own streamed response payloads.

## Ownership boundary

Each session contains request-side state such as its id, source request, transport, request body, metadata, environment, status, selected response tab, and `responseSessionId`.

```txt
RequestSession (React/control plane)
  ├─ request identity and editor state
  ├─ transport/configuration
  ├─ running/status flags
  └─ responseSessionId ───────────────┐
                                      ▼
                            ResponseSessionRegistry
                            (response data plane)
```

`events`, `lastResult`, and `assertionResults` are accepted only as legacy workspace input types. Normalization strips those fields. New live requests and new workspace saves must not write response payloads back into `RequestSession`.

## Response ownership

`ResponseSessionRegistry` is keyed by `responseSessionId`. It owns the bounded `ResponseStore`, result summary, and assertion results for each open request session. Streaming events for inactive tabs are routed directly to the matching runtime by session id; they do not clone or mutate the `requestSessions[]` array.

Closing a request session must close its response runtime as part of the same lifecycle so referenced payload documents can be released.

## Activation

Activating session B preserves the request/editor state of session A, switches `activeRequestId`, then resolves B's response runtime through `responseSessionId`. Response history is not copied through the parent Workbench model.

## Source cleanup

Collection, request, Proto, and method deletion must still close their related request sessions. Source ownership uses stable ids/bindings rather than display titles.

## Persistence

Workspace persistence stores the request control plane. Runtime response payloads and worker `documentId` values are transient. A response becomes durable only through explicit features such as saved documentation results; it is not implicitly serialized with every request tab.

## Regression requirements

- Opening REST, WebSocket, and gRPC requests creates control-plane sessions with a `responseSessionId`.
- Streaming an inactive request updates its `ResponseSessionRegistry` runtime without cloning `requestSessions[]`.
- Switching tabs does not copy response arrays through Workbench state.
- Closing a tab releases its response runtime/documents.
- Legacy workspaces containing `events` or `lastResult` still load, but normalized/saved sessions omit them.
