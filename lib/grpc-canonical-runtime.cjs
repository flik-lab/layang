"use strict";

const { GrpcScenarioRepository } = require("./grpc-scenario-repository.cjs");

/**
 * Hydrate gRPC bodies exclusively inside the privileged runtime boundary.
 * Renderer-supplied legacy methodFiles/scenarios/hash are ignored. Startup is
 * intentionally O(N); normal workspace loading remains metadata-only.
 */
async function prepareCanonicalGrpcPayload(payload) {
  if (!payload || typeof payload.workspaceDirectory !== "string" || !payload.workspaceDirectory.trim()) {
    throw new Error("File-based gRPC requires a saved Layang workspace directory.");
  }
  const repo = new GrpcScenarioRepository(payload.workspaceDirectory);
  await repo.migrateLegacy({ dryRun: false });
  const snapshot = await repo.buildRuntimeSnapshot();
  const { methodFiles: _oldFiles, scenarios: _oldScenarios, scenarioContentHash: _oldHash,
    canonicalScenarioPatch: _untrustedPatch, ...config } = payload;
  return { ...config, scenarios: snapshot.scenarios };
}

module.exports = { prepareCanonicalGrpcPayload };
