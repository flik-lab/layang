# Canonical gRPC Scenarios — File-Based v3

**Status:** the sole active gRPC mock scenario store. The old per-method editor, request-tab inline editor and beta selector have been removed from the active UI. REST and WebSocket mock formats are unchanged.

## Workspace structure

```text
layang.yml
mocks/
  grpc/
    server.yml                   # listener, security, route/config metadata
    scenarios/
      <method-hash>/
        <scenario-hash>.scenario.yml   # one independently versioned scenario
    .cache/scenario-index-v3.json     # disposable metadata-only index
.layang/
  grpc-v3-backup-<timestamp>/
    methods/*.mock.yml          # verified one-time import backups, if any
    scenarios.yml               # legacy combined backup, if any
```

A scenario document stores its method identity, revision, and response body. The repository validates the document before writing it. Filenames use hashes, and saves and deletes compare the expected revision and content hash with the file on disk.

For files of at least **512 KiB**, selection shows metadata and runtime controls. Use **Show YAML in folder** to find the exact file, or **Load YAML editor** to open it in Layang. For repeated edits to a large file, use an external editor and keep the document's identity fields intact. After saving, click **Refresh index**, select the scenario again, and choose **Apply**. A failed validation leaves the running snapshot active.

Use **New scenario** to pick a gRPC method and enter a display name. Layang assigns the file ID automatically. Canonical scenario files and legacy migrations support up to **32 MiB per file**. The inline editor supports up to **8 MiB**, and the runtime snapshot has a **128 MiB** budget.

Select an RPC in the Mocking sidebar to see its scenarios. The **+** beside a method opens the create dialog for that RPC. Choose **All scenarios** to return to the workspace-wide list.

The method panel puts the scenario picker and delivery controls above the resizable YAML/JSON editor. **Periodic** and **Hybrid** expose interval and loop settings. **Save delivery** creates a disk revision, and **Activate** updates the selected scenario in the running snapshot. In **Standby** or **Hybrid**, choose a response or **All responses**, then select **Send now**. Delivery settings can be saved while the YAML is shown as metadata only.

## Automatic, one-way migration

On opening a Git-friendly workspace, or prior to rewriting an existing workspace, `GrpcScenarioRepository.migrateLegacy()` imports supported `mocks/grpc/methods/*.mock.yml` and `mocks/grpc/scenarios.yml` files. Migration:

1. Checks all source file identities, sizes, duplicate scenario IDs and conflicts with existing v3 scenarios.
2. Writes legacy originals into `.layang/grpc-v3-backup-*` and verifies the backup hashes.
3. Saves v3 documents and verifies reads plus the metadata index.
4. Only then removes migrated legacy documents from the **active** workspace. Failure attempts to roll back newly created documents and restore deleted sources.

The migration is idempotent. A conflicting scenario is never silently overwritten. **Keep `.layang` backups outside a Git-only archive**: these backups are local data, and may not be part of a repository commit. Make an independent copy of the entire workspace before upgrading a production workspace.

Routine saves cannot recreate the legacy per-method format. The old in-memory format is accepted only as an explicitly staged historical import. A one-way migration is not an automatic downgrade mechanism; restore a pre-migration workspace backup if you need to revert.

## Runtime consistency

- **Save**: writes a new persisted CAS revision; it does not imply that a running mock changed.
- **Activate**: privileged main/utility runtime reads a v3 disk snapshot and returns an acknowledged config version/hash.
- **Manual Send**: requires the acknowledged revision/hash/config version, rejecting stale or unsaved changes.
- **Activate for Web Access**: compiles the selected method from v3 and activates it in the requested Gateway profile.
- **Atomic Gateway Apply + Send**: validates before replacing the active snapshot; the apply/send operation is serialized per profile.

Native serves one scenario per method: the selected scenario while it is active, otherwise the highest-priority active scenario. A method with no active scenario answers `NOT_FOUND`; inactive scenarios are never used as a fallback.

Native startup and the CLI compile scenario bodies outside the renderer. Native Apply reads the selected scenario, and Gateway Apply reads scenarios for the selected method. The scenario picker receives metadata only.

## Limitations and verification

The repository and one-time migration have Node regression coverage. Browser/Electron integration, real gRPC transport E2E and sustained heap-soak tests remain separate required quality gates. The metadata index still fingerprints the full file set on a warm read and runtime startup may compile O(N) scenarios; 10k-scenario integration performance is not equivalent to an Electron UI benchmark.
