"use strict";
const crypto = require("node:crypto");
const { MAX_SCENARIO_BYTES, MAX_SNAPSHOT_BYTES } = require("./grpc-scenario-limits.cjs");
/** Calculate content hash incrementally; never allocate a second full snapshot. */
function fingerprintGatewayScenarios(scenarios) {
  if (!Array.isArray(scenarios)) throw new Error("Invalid Gateway scenarios.");
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for (const item of scenarios) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.id !== "string" || !item.id ||
        typeof item.service !== "string" || !item.service ||
        typeof item.method !== "string" || !item.method)
      throw new Error("Gateway snapshot contains a scenario without a valid identity.");
    const json = JSON.stringify(item);
    if (typeof json !== "string") throw new Error("Gateway scenario is not JSON serializable.");
    const size = Buffer.byteLength(json);
    bytes += size;
    if (size > MAX_SCENARIO_BYTES || bytes > MAX_SNAPSHOT_BYTES)
      throw new Error("Gateway scenario snapshot exceeds memory budget.");
    hash.update(String(size)).update(":").update(json);
  }
  return hash.digest("hex");
}
/** Fail closed before any write when the active snapshot has been superseded. */
function verifyGatewaySendRevision(runtime, request) {
  if (!Number.isSafeInteger(request.expectedRuntimeRevision) || request.expectedRuntimeRevision <= 0 ||
      request.expectedRuntimeRevision !== runtime.appliedRevision ||
      !Number.isSafeInteger(request.expectedConfigVersion) ||
      request.expectedConfigVersion !== runtime.configVersion ||
      typeof request.expectedRuntimeHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(request.expectedRuntimeHash) ||
      request.expectedRuntimeHash !== runtime.scenarioContentHash)
    throw new Error("STALE_GATEWAY_SNAPSHOT: Apply and acknowledge the latest saved scenario before Manual Send.");
}
module.exports = { fingerprintGatewayScenarios, verifyGatewaySendRevision };
