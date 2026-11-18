"use strict";

const { createHash } = require("node:crypto");

/** Canonical SHA-256 of file identities, formats and content hashes. */
function computeMockScenarioContentHash(methodFiles) {
  const descriptions = Object.entries(methodFiles || {})
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, file]) => [
      key,
      file?.format || "json",
      createHash("sha256").update(String(file?.scenarioText ?? ""), "utf8").digest("hex"),
    ]);
  return createHash("sha256").update(JSON.stringify(descriptions), "utf8").digest("hex");
}

/** The check and actual send must execute synchronously against the same runtime snapshot. */
function assertManualSendRevision(active, payload) {
  const hasRevision = payload?.expectedUiRuntimeRevision !== undefined;
  const hasHash = payload?.expectedScenarioContentHash !== undefined;
  const hasConfig = payload?.expectedConfigVersion !== undefined;
  if (!hasRevision && !hasHash && !hasConfig) return; // Existing CLI callers remain compatible.
  const expected = Number(payload?.expectedUiRuntimeRevision);
  const actual = Number(active?.lastUiRuntimeRevision || 0);
  if (!Number.isSafeInteger(expected) || expected <= 0 || expected !== actual) {
    throw new Error(`Mock scenario revision mismatch: requested ${String(payload?.expectedUiRuntimeRevision)}, active ${actual}. Apply the latest scenario before sending.`);
  }
  if (!hasHash || typeof payload.expectedScenarioContentHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(payload.expectedScenarioContentHash) ||
      payload.expectedScenarioContentHash !== active?.scenarioContentHash) {
    throw new Error("Mock scenario content hash mismatch. Apply the latest scenario before sending.");
  }
  const version = Number(payload?.expectedConfigVersion);
  if (!Number.isSafeInteger(version) || version <= 0 || version !== active?.runtime?.configVersion) {
    throw new Error("Mock runtime configuration changed before Manual Send. Reapply and retry.");
  }
}

module.exports = { computeMockScenarioContentHash, assertManualSendRevision };
