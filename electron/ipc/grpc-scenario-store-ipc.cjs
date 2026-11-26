"use strict";

const { GrpcScenarioRepository } = require("../../lib/grpc-scenario-repository.cjs");
const { MAX_INLINE_SCENARIO_BYTES } = require("../../lib/grpc-scenario-limits.cjs");
const { stringifyYaml } = require("../../lib/workspace-yaml.cjs");
const path = require("node:path");
const { getWorkspaceAccess } = require("../utils/workspace-access.cjs");
const fs = require("node:fs/promises");

/** Narrow IPC boundary; all paths are repository-generated, never renderer-supplied. */
function registerGrpcScenarioStoreIpc(ipcMain, options = {}) {
  const indexJobs = new Map();
  const assertNativeWorkspace = (repo, status) => {
    if (!status?.running || !status.workspaceDirectory || path.resolve(status.workspaceDirectory) !== repo.root)
      throw new Error("NATIVE_WORKSPACE_MISMATCH: Start the gRPC mock in this workspace before activating or sending.");
  };
  const action = (channel, fn) => ipcMain.handle(channel, async (_event, payload) => {
    try {
      if (typeof payload?.directoryPath !== "string" || !payload.directoryPath.trim())
        return { ok: false, error: "Missing workspace folder." };
      const repo = new GrpcScenarioRepository(getWorkspaceAccess().assertAllowed(payload.directoryPath));
      return await fn(repo, payload, _event);
    } catch (error) {
      return { ok: false, code: String(error?.code || "SCENARIO_STORE_ERROR"), error: String(error?.message || error) };
    }
  });
  action("mock-scenario:cached-index", async repo => ({ ok: true, items: await repo.readCachedMetadata() }));
  action("mock-scenario:list", async (repo, payload, event) => {
    const publish = items => {
      if (event?.sender && !event.sender.isDestroyed()) {
        event.sender.send("mock-scenario:index-progress", payload.directoryPath, items);
      }
    };
    let job = indexJobs.get(repo.root);
    if (!job) {
      const subscribers = new Set();
      const promise = repo.listMetadata(items => {
        for (const subscriber of subscribers) subscriber(items);
      }).finally(() => {
        if (indexJobs.get(repo.root)?.promise === promise) indexJobs.delete(repo.root);
      });
      job = { subscribers, promise };
      indexJobs.set(repo.root, job);
    }
    job.subscribers.add(publish);
    try {
      return { ok: true, ...await job.promise };
    } finally {
      job.subscribers.delete(publish);
    }
  });
  action("mock-scenario:read", async (repo,p) => {
    const { scenario: body, ...document } = await repo.read(p.ref, { maxBytes: MAX_INLINE_SCENARIO_BYTES });
    // Never clone parsed response bodies across Electron IPC when the editor
    // already receives their source text. It would double peak memory.
    return { ok: true, scenario: { ...document, sourceText: stringifyYaml(body) } };
  });
  action("mock-scenario:reveal", async (repo, p) => {
    if (typeof options.revealFile !== "function") return { ok: false, error: "Reveal file is unavailable." };
    await repo.ensureWorkspace();
    const file = await repo.fileFor(p.ref);
    if (!(await fs.lstat(file)).isFile()) return { ok: false, error: "Scenario file is unavailable." };
    options.revealFile(file);
    return { ok: true };
  });
  action("mock-scenario:save", async (repo,p) => {
    if (typeof p.sourceText === "string" && Buffer.byteLength(p.sourceText) > MAX_INLINE_SCENARIO_BYTES)
      return { ok: false, error: "The built-in editor supports up to 8 MiB. Edit larger YAML files externally." };
    return repo.save(p.ref, p.sourceText, { expectedRevision:p.expectedRevision, expectedHash:p.expectedHash });
  });
  action("mock-scenario:save-execution", (repo, p) => repo.updateExecution(p.ref,
    { expectedRevision: p.expectedRevision, expectedHash: p.expectedHash }, p.settings, p.includeSource === true));
  action("mock-scenario:delete", async (repo,p) => repo.remove(p.ref, { expectedRevision:p.expectedRevision, expectedHash:p.expectedHash }));
  action("mock-scenario:migrate", async (repo,p) => repo.migrateLegacy({ dryRun: p.confirm !== true }));
  action("mock-scenario:send-native", async (repo, p) => {
    if (typeof options.sendNative !== "function")
      return { ok: false, error: "Native Manual Send is unavailable." };
    if (!Number.isSafeInteger(p.expectedRuntimeRevision) || p.expectedRuntimeRevision <= 0 ||
        !Number.isSafeInteger(p.expectedConfigVersion) || p.expectedConfigVersion <= 0 ||
        typeof p.expectedRuntimeHash !== "string" || !/^[0-9a-f]{64}$/.test(p.expectedRuntimeHash))
      return { ok: false, error: "Manual Send requires an acknowledged active revision, content hash and config version." };
    const ref = p.ref;
    const selected = await repo.read(ref);
    if (selected.revision !== p.expectedSavedRevision || selected.contentHash !== p.expectedSavedHash)
      return { ok: false, code: "SCENARIO_CHANGED", error: "File changed since Apply. Reapply before Manual Send." };
    assertNativeWorkspace(repo, await options.getNativeStatus?.());
    const separator = ref.methodKey.lastIndexOf("/");
    if (separator < 1 || separator === ref.methodKey.length - 1)
      return { ok: false, error: "Invalid gRPC service/method key." };
    const result = await options.sendNative({
      expectedWorkspaceDirectory: repo.root,
      serviceName: ref.methodKey.slice(0, separator),
      methodName: ref.methodKey.slice(separator + 1),
      scenarioId: ref.scenarioId,
      responseIndex: Number.isSafeInteger(p.responseIndex) ? p.responseIndex : 0,
      sendAll: p.sendAll === true,
      expectedUiRuntimeRevision: p.expectedRuntimeRevision,
      expectedScenarioContentHash: p.expectedRuntimeHash,
      expectedConfigVersion: p.expectedConfigVersion,
    });
    return { ok: true, ...(result || {}) };
  });
  const gatewayRef = (ref) => {
    if (!ref || typeof ref.methodKey !== "string" || typeof ref.scenarioId !== "string")
      throw new Error("Invalid Gateway method/scenario identity.");
    const separator = ref.methodKey.lastIndexOf("/");
    if (separator < 1 || separator === ref.methodKey.length - 1)
      throw new Error("Invalid gRPC service/method key.");
    return { serviceName: ref.methodKey.slice(0, separator),
      methodName: ref.methodKey.slice(separator + 1), scenarioId: ref.scenarioId };
  };
  const verifyGatewayDisk = async (repo, p) => {
    const selected = await repo.read(p.ref);
    if (selected.revision !== p.expectedRevision || selected.contentHash !== p.expectedHash)
      throw new Error("SCENARIO_CHANGED: Saved Gateway scenario has changed; reopen or reapply it.");
    return selected;
  };
  const assertGatewayWorkspace = (repo, status) => {
    if (!status?.running) throw new Error("Start Web Access before activating or sending.");
    if (!status.workspaceDirectory || path.resolve(status.workspaceDirectory) !== repo.root)
      throw new Error("GATEWAY_WORKSPACE_MISMATCH: Gateway belongs to a different or unsaved workspace.");
  };
  const gatewaySnapshot = async (repo, p) => {
    await verifyGatewayDisk(repo, p);
    const snapshot = await repo.buildRuntimeSnapshot({
      ref: p.ref, revision: p.expectedRevision, contentHash: p.expectedHash,
      methodKey: p.ref.methodKey,
    });
    const status = await options.getGatewayStatus?.(p.profileId);
    assertGatewayWorkspace(repo, status);
    return { snapshot, status, config: {
      profileId: p.profileId,
      ...gatewayRef(p.ref),
      scenarios: snapshot.scenarios, patchMethodKey: snapshot.methodKey,
      expectedConfigVersion: status.configVersion,
      uiRuntimeRevision: (status.appliedRevision || 0) + 1,
    } };
  };
  action("mock-scenario:apply-gateway", async (repo, p) => {
    if (typeof options.getGatewayStatus !== "function" || typeof options.applyGateway !== "function")
      return { ok: false, error: "Gateway runtime apply unavailable." };
    const { snapshot, config } = await gatewaySnapshot(repo, p);
    const applied = await options.applyGateway(config);
    if (applied?.appliedRevision !== config.uiRuntimeRevision ||
        applied?.configVersion !== config.expectedConfigVersion + 1 ||
        applied?.methodScenarioCount !== snapshot.count ||
        typeof applied?.scenarioContentHash !== "string")
      throw new Error("Gateway did not acknowledge the requested snapshot.");
    await verifyGatewayDisk(repo, p);
    return { ok: true, applied: {
      appliedRevision: applied.appliedRevision,
      configVersion: applied.configVersion,
      scenarioContentHash: applied.scenarioContentHash,
      scenarioCount: applied.scenarioCount,
      snapshotHash: snapshot.snapshotHash,
    } };
  });
  action("mock-scenario:send-gateway", async (repo, p) => {
    if (typeof options.sendGateway !== "function")
      return { ok: false, error: "Sending through Web Access is unavailable." };
    await verifyGatewayDisk(repo, { ...p, expectedRevision: p.expectedSavedRevision,
      expectedHash: p.expectedSavedHash });
    assertGatewayWorkspace(repo, await options.getGatewayStatus?.(p.profileId));
    const result = await options.sendGateway({
      profileId: p.profileId, ...gatewayRef(p.ref),
      expectedRuntimeRevision: p.expectedRuntimeRevision,
      expectedRuntimeHash: p.expectedRuntimeHash,
      expectedConfigVersion: p.expectedConfigVersion,
      responseIndex: Number.isSafeInteger(p.responseIndex) ? p.responseIndex : 0,
      sendAll: p.sendAll === true,
    });
    return { ok: true, ...(result || {}) };
  });
  action("mock-scenario:apply-send-gateway", async (repo, p) => {
    if (typeof options.getGatewayStatus !== "function" || typeof options.applySendGateway !== "function")
      return { ok: false, error: "Atomic Gateway Apply & Send unavailable." };
    const { config } = await gatewaySnapshot(repo, p);
    await verifyGatewayDisk(repo, p);
    const result = await options.applySendGateway({ ...config, ...gatewayRef(p.ref),
      responseIndex: Number.isSafeInteger(p.responseIndex) ? p.responseIndex : 0,
      sendAll: p.sendAll === true,
    });
    return { ok: true, ...(result || {}) };
  });
  action("mock-scenario:apply-native", async (repo, p) => {
    if (typeof options.getNativeStatus !== "function" || typeof options.updateNative !== "function")
      return { ok: false, error: "Native runtime apply is unavailable." };
    const ref = p.ref;
    const status = await options.getNativeStatus();
    if (!status?.running) return { ok: false, error: "Start Native gRPC before applying file-backed scenarios." };
    assertNativeWorkspace(repo, status);
    const selected = await repo.read(ref);
    if (selected.revision !== p.expectedRevision || selected.contentHash !== p.expectedHash)
      return { ok: false, code: "SCENARIO_CHANGED", error: "Selected scenario revision was not saved or has changed." };
    const separator = ref.methodKey.lastIndexOf("/");
    if (separator <= 0 || separator === ref.methodKey.length - 1)
      return { ok: false, error: "Invalid gRPC service/method key." };
    const service = ref.methodKey.slice(0, separator);
    const method = ref.methodKey.slice(separator + 1);
    const nextUiRevision = Math.max(0, Number(status.appliedRevision) || 0) + 1;
    const applied = await options.updateNative({
      expectedWorkspaceDirectory: repo.root,
      canonicalScenarioPatch: { ...selected.scenario, service, method },
      activeScenarioIds: { ...status.activeScenarioIds, [ref.methodKey]: ref.scenarioId },
      uiRuntimeRevision: nextUiRevision,
      mockServerUpdatedAt: new Date().toISOString(),
    });
    if (applied?.ignoredStaleUpdate || Number(applied?.appliedRevision) !== nextUiRevision ||
        applied?.running !== true || applied?.activeScenarioIds?.[ref.methodKey] !== ref.scenarioId ||
        !Number.isSafeInteger(Number(applied?.configVersion)) || Number(applied?.configVersion) <= 0 ||
        typeof applied?.scenarioContentHash !== "string" || !/^[0-9a-f]{64}$/.test(applied.scenarioContentHash))
      return { ok: false, error: "Native runtime did not acknowledge the requested scenario snapshot." };
    // Catch a file edited externally after snapshot compilation but before
    // runtime ACK. The runtime may have applied an older snapshot; do not
    // present that as the active saved version to the UI.
    const latest = await repo.read(ref);
    if (latest.revision !== p.expectedRevision || latest.contentHash !== p.expectedHash)
      return { ok: false, code: "SCENARIO_CHANGED", error: "Scenario changed during Apply; reapply latest file before sending." };
    return { ok: true, applied: {
      appliedRevision: nextUiRevision,
      scenarioContentHash: applied.scenarioContentHash,
      configVersion: applied.configVersion,
      scenarioCount: applied.scenarioCount,
      snapshotHash: applied.scenarioContentHash,
    } };
  });
}
module.exports = { registerGrpcScenarioStoreIpc };
