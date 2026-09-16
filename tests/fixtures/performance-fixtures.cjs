"use strict";

function createTrackPayload(count = 1000) {
  return {
    tracks: Array.from({ length: count }, (_, index) => ({
      id: `TRACK-${String(index).padStart(4, "0")}`,
      latitude: -6.9 + index * 0.00001,
      longitude: 107.6 + index * 0.00001,
      speed: index % 500,
      heading: index % 360,
      status: index % 2 === 0 ? "active" : "idle",
    })),
  };
}

function createMockCatalogFixture(options = {}) {
  const protoCount = options.protoCount ?? 100;
  const methodsPerProto = options.methodsPerProto ?? 20;
  const scenarioCount = options.scenarioCount ?? 5000;
  const methods = [];
  const scenariosByMethod = new Map();

  for (let protoIndex = 0; protoIndex < protoCount; protoIndex += 1) {
    const libraryId = `library-${String(protoIndex).padStart(3, "0")}`;
    const versionId = `version-${String(protoIndex).padStart(3, "0")}`;
    const libraryName = `Proto ${String(protoIndex).padStart(3, "0")}`;
    const versionLabel = `r${protoIndex + 1}`;
    for (let methodIndex = 0; methodIndex < methodsPerProto; methodIndex += 1) {
      const serviceName = `demo.proto${protoIndex}.Service${Math.floor(methodIndex / 5)}`;
      const methodName = `Method${String(methodIndex).padStart(2, "0")}`;
      const methodId = `${libraryId}|${versionId}|${serviceName}|${methodName}`;
      methods.push({
        methodId,
        libraryId,
        versionId,
        libraryName,
        versionLabel,
        serviceName,
        methodName,
        requestType: `demo.proto${protoIndex}.Request`,
        responseType: `demo.proto${protoIndex}.Response`,
        requestStream: false,
        responseStream: methodIndex % 4 === 0,
      });
      scenariosByMethod.set(methodId, []);
    }
  }

  for (let scenarioIndex = 0; scenarioIndex < scenarioCount; scenarioIndex += 1) {
    const method = methods[scenarioIndex % methods.length];
    scenariosByMethod.get(method.methodId).push({
      id: `scenario-${String(scenarioIndex).padStart(4, "0")}`,
      service: method.serviceName,
      method: method.methodName,
      description: `Deterministic scenario ${scenarioIndex}`,
      input: { contains: { index: scenarioIndex } },
      output: { data: { index: scenarioIndex } },
    });
  }

  const scenarioFiles = methods.map((method, index) => {
    const scenarios = scenariosByMethod.get(method.methodId);
    return {
      methodId: method.methodId,
      revision: `fixture-r1-${index}`,
      scenarioCount: scenarios.length,
      scenarios: scenarios.map((scenario) => ({
        id: scenario.id,
        label: scenario.description || scenario.id,
        description: scenario.description || "",
      })),
    };
  });

  return { methods, scenarioFiles };
}

module.exports = { createTrackPayload, createMockCatalogFixture };
