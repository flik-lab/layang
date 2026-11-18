# Mock State Synchronization — Canonical v3

## Source of truth

The gRPC scenario repository (`lib/grpc-scenario-repository.cjs`) is the only active source of scenario bodies. `mocks/grpc/server.yml` carries listener and routing metadata. Individual YAML documents under `mocks/grpc/scenarios/<method-hash>/<scenario-hash>.scenario.yml` carry response bodies and CAS revisions. The index is rebuildable and contains metadata only.

Old `mocks/grpc/methods/*.mock.yml` and `mocks/grpc/scenarios.yml` are **import-only**, automatically backed up, verified and archived on workspace opening. The old React editor and inline request selector no longer read/write this source. Legacy workspace/proto formats remain supported as migration **inputs**, not a live second gRPC store.

## UI and persistence

The Services > gRPC > Scenarios editor uses Electron IPC `mock-scenario:list/read/save/delete`. A list loads metadata, and `read` loads a single document. Save/delete require expected revision and content hash. The shell and request screen do not parse global gRPC scenario bodies. Request tabs navigate to Scenarios for edits. A metadata-only worker still supports the Mocking sidebar's Proto method index and can request v3 metadata counts without loading bodies.

## Runtime boundaries

The renderer cannot select a runtime scenario body or override a content hash. Native Mock startup/update calls `prepareCanonicalGrpcPayload`, which builds a disk snapshot inside the privileged boundary. CLI operations requiring mock bodies hydrate through the same repository; opening a CLI workspace remains metadata-only. A runtime Apply is explicit; Save never means Active.

Gateway Apply and atomic Apply + Manual Send are version-checked, per-profile serialized operations; method-scoped compilation avoids reading unrelated scenario bodies. Stale or externally edited revisions must be rejected. Runtime events/status come from the actual service, not inferred from the editor state.

## Reliability and security

- Electron renderer has `webSecurity: true` and sandbox/context isolation. Privileged IPC requires authorized managed-window sender checks.
- Repository save/delete use per-scenario locks and compare-and-swap.
- Migration verifies backups before deleting active old files; a collision fails closed.
- The full-source metadata fingerprint and Native compilation remain O(N) in scenario count. Future incremental indexing and 10k-scenario Electron traces are required before declaring sustained scalability.

REST and WebSocket mock models are separate and are not converted by the gRPC v3 migration.
