"use strict";

/** Deterministic, fully synthetic gRPC mock bodies; no user or production data. */
function createMockScenarioWorkload({ scenarioCount = 1000, payloadKb = 1, seed = 42, methodCount = 2000 } = {}) {
  if (!Number.isInteger(scenarioCount) || scenarioCount <= 0 || scenarioCount > 10000) {
    throw new RangeError("scenarioCount must be an integer in [1, 10000]");
  }
  if (!Number.isInteger(payloadKb) || payloadKb < 1 || payloadKb > 100) {
    throw new RangeError("payloadKb must be an integer in [1, 100]");
  }
  if (!Number.isInteger(methodCount) || methodCount < 1) {
    throw new RangeError("methodCount must be a positive integer");
  }
  if (scenarioCount * payloadKb > 128 * 1024) {
    throw new RangeError("Fixture exceeds the 128 MiB safety limit. Run smaller batches to avoid OOM.");
  }
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const files = new Map();
  for (let i = 0; i < scenarioCount; i += 1) {
    const group = i % Math.min(methodCount, scenarioCount);
    const key = `bench.Service/Stream${String(group).padStart(4, "0")}`;
    const scenario = {
      id: `benchmark-scenario-${i}`,
      service: "bench.Service",
      method: `Stream${String(group).padStart(4, "0")}`,
      enabled: true,
      input: { equals: { seed: random(), index: i } },
      stream: {
        execution: { mode: "standby", manual: true },
        responses: [{ data: { index: i, payload: `${random().toString(16)}:${"x".repeat(Math.max(0, payloadKb * 1024 - 300))}` } }],
      },
    };
    if (!files.has(key)) files.set(key, []);
    files.get(key).push(scenario);
  }
  const methodFiles = {};
  for (const [key, scenarios] of files) {
    methodFiles[key] = { format: "json", scenarioText: JSON.stringify({ version: 1, scenarios }) };
  }
  return { methodFiles, scenarioCount, payloadKb, seed, methodCount: files.size };
}

module.exports = { createMockScenarioWorkload };
