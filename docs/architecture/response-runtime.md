# Response Runtime

The response subsystem is a data-plane island. High-volume gRPC, REST, and WebSocket response traffic must not flow through `WorkbenchContainer` state.

## Data flow

```txt
Transport
  -> decode / adapter worker
  -> PayloadDocumentService
  -> ResponseSessionRegistry[responseSessionId]
  -> ResponseStore
  -> granular selector
  -> Response UI island
```

`ResponseSessionRegistry` is the per-request runtime owner. `RequestSession` only keeps the `responseSessionId` needed to locate it.

## Bounded response history

`ResponseStore` retains at most **50** response message records per runtime. A record stores compact metadata, preview text, optional transient document reference, and original character count. When the 51st record arrives, the oldest record is evicted and its document reference is released.

The payload-document worker keeps raw UTF-8 data separately from React. Derived decoded/indexed data is retained only for pinned/active documents and can be rebuilt on demand.

## Latest and Message readers

Large live payloads use latest-wins/coalesced hydration. The previous committed document remains visible while a newer target is prepared, avoiding blank/blinking JSON. Message history is strict and user-driven: selecting a historical message hydrates that specific document rather than following live traffic.

## Selector isolation

Response components use granular external-store selectors. A broad store publish must not wake a React subscriber when its selected slice is unchanged. In particular, a pinned Message reader must not rerender just because `latestMessageId` advances; the tiny pending-status child owns that subscription.

## Persistence

Response runtime data is **not workspace persistence**. Legacy `events`, `lastResult`, and `assertionResults` may be accepted while importing old workspaces, but normalization removes them from live `RequestSession` objects and storage strips them again. Worker `documentId` values are transient and never trusted after restart.

Saved documentation snapshots are an explicit durable copy and are separately compacted before persistence.

## Transport lifecycle

Transport lifecycle telemetry tracks:

- active decode workers;
- pending decode acknowledgements;
- payload producer channels;
- active stream subscriptions;
- deferred events;
- ingestion queue depth.

Every setup path must have an idempotent teardown path. After a request/stream closes, these counters should return to their baseline rather than grow with message count.

## Performance observability

The Performance panel reports response-session count, retained records/document references, transport lifecycle counters, mock polling vs published changes, and React render rates for ResponsePanel, LatestViewer, MessageWorkspace, StatusBar, WorkbenchContainer, and Collections.

For a large live stream, the key architectural invariant is that `WorkbenchContainer` and Collections do not rerender merely because another response message arrived.

## Endurance invariant

The deterministic 1000-track regression sends more than three times the 50-message retention window. It verifies that retained records stay at 50, evicted document ids are released, unchanged selectors do not notify React, and transport lifecycle counters return to zero.
