# Canonical gRPC v3: runtime, indexing, and verification

Status: incremental architectural hardening. Production release approval remains conditional on CI evidence.

## Ownership and persistence

- `GrpcScenarioRepository` in `lib/grpc-scenario-repository.cjs` is the only active persistent source of gRPC scenario response bodies.
- `mocks/grpc/scenarios/<hash(method)>/<hash(scenario)>.scenario.yml` holds per-scenario YAML, identity, revision and payload. Saves/deletes use expected revision and content hash (CAS).
- Legacy `mocks/grpc/methods/*.mock.yml` and global `mocks/grpc/scenarios.yml` are **one-time import inputs only**. Migration requires a verified backup; never delete source before confirmation. Back up the **whole workspace**, including `.layang`, before migrating.
- `prepareCanonicalGrpcPayload()` in `lib/grpc-canonical-runtime.cjs` discards renderer-supplied `methodFiles`, `scenarios`, and `scenarioContentHash`, loads the committed repository snapshot, then hands compiled scenarios to the privileged runtime.
- `electron/services/grpc-mock-server.cjs` now accepts **only** parsed `scenarios[]` as a scenario source; no legacy method file parser remains in that runtime.
- React keeps the service settings in the workspace controller. The scenario catalog and editor load metadata and document bodies through their dedicated IPC.

## Lazy metadata and Apply contract

- Catalog reads metadata-only file index. Cache uses file path, size, mtime, ctime, revision and source hash to reuse unchanged metadata. Index is discardable and never authoritative.
- The sidebar and scenario editor share one catalog per workspace. The editor can show the persisted index immediately and verify it asynchronously. With no cache, it renders validated metadata in batches while the index is being built. Proto indexing runs independently.
- Scenario edits refresh the catalog directly. Returning focus to the window or selecting **Refresh index** reconciles external edits. The generic workspace revision poll skips the canonical scenario tree and its derived cache, so it does not compete with catalog reads.
- A changed file is reparsed; file deletion is reconciled on the next listing. An invalid scenario cannot silently become a valid index entry.
- `buildRuntimeSnapshot({methodKey})` reads/validates the specified method's directory and payloads, with before/after revision and content-hash checks. Unrelated method corruption does not break a scoped Apply.
- Full native start currently compiles all scenarios; warm metadata listing still performs O(N) directory/stat checking to detect unannounced external edits. The implementation is **incremental parse**, not fully O(changes) filesystem scanning.
- Save does not imply Apply. Manual Send requires matching saved and applied revisions. Gateway Apply+Send is serialized atomically by the runtime queue.

## Verification commands

With frozen project dependencies available:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
LAYANG_REQUIRE_RUNTIME_DEPS=1 pnpm test
pnpm build
pnpm electron:prepare
# Ubuntu desktop runner with Xvfb:
xvfb-run -a pnpm test:electron:smoke
```

For repository performance and sustained heap growth:

```bash
pnpm benchmark:v3 -- 10000 ./artifacts/v3-index.json
node --expose-gc scripts/benchmarks/soak-v3-repository.cjs 10000 1800 artifacts/v3-soak.json
```

The Electron smoke harness tests **actual production window preferences, preload isolation, and Chromium CORS** using a local test page, not the entire Next.js UI. The 30-minute soak workflow tests **Node repository metadata/scoped Apply** under 10k scenarios, not the Electron renderer. These are distinct gates and must not be conflated with full desktop user-journey E2E or renderer heap retention tests.

## Automated checks

- `.github/workflows/verify-pr.yaml`: Windows/Linux unit, real gRPC integration (fail instead of skip when dependencies missing), typecheck, lint, renderer build, plus Linux Electron renderer security smoke.
- `.github/workflows/soak-v3-repository.yaml`: weekly/on-demand 10k scenario, 30-minute Node repository heap plateau budget, raw artifact upload.

## Remaining blockers to production grade

1. `use-workbench-container-model.tsx` remains large; more functional domain extraction is needed, with typechecked component-level regressions.
2. Compatibility helpers in `mock-scenario-core.ts`, state wiring in `use-grpc-mock-editor-actions.ts`, and older generic workspace codecs remain for import/migration and other noncanonical uses. They must be removed **only** after dependency mapping and migration coverage; deleting them blindly risks data loss.
3. Full typecheck, native Electron E2E, integration tests and long-duration soak must execute in an environment with the locked dependencies and desktop runtime. A passing Node syntax check cannot substitute for them.
4. UI navigation p95 on real Electron 10k scenario catalogs, utility-runtime restart fault injection and real 30-minute **Electron** heap plateau are still unverified.
