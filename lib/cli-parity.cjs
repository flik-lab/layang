"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { discoverRunItems, listProtoSchemas, validateWorkspace, validateMockScenarios } = require("./cli-workspace.cjs");

const FEATURE_DEFINITIONS = [
  [
    "request-execution",
    "REST, native gRPC, gRPC-Web, and WebSocket execution",
    ["cli-transports.cjs", "cli-runtime-core.cjs"],
  ],
  ["grpc-streaming", "Unary, server-stream, client-stream, and bidirectional native gRPC", ["cli-transports.cjs"]],
  [
    "variables-auth",
    "Environment variables, strict templates, auth, params, and body builders",
    ["cli-runtime-core.cjs"],
  ],
  [
    "assertions",
    "Status, latency, message count, body, header, trailer, and path assertions",
    ["cli-runtime-core.cjs"],
  ],
  [
    "examples",
    "Create, duplicate, list, edit, run, hide, and delete documentation-aware executable examples",
    ["cli-examples.cjs"],
  ],
  ["mock-lifecycle", "Start, status, reload, logs, send, and stop mock services", ["cli-mock.cjs"]],
  ["schema-lifecycle", "Import, update, line diff, revision, delete, and repair proto schemas", ["cli-schema.cjs"]],
  [
    "documentation",
    "Initialize, edit, check, build, static site, and wiki export",
    ["cli-docs-authoring.cjs", "docs-workspace.cjs"],
  ],
  ["benchmark", "Warm-up, iterations, percentile statistics, throughput, and thresholds", ["cli-runner.cjs"]],
  [
    "reporters",
    "Spec, JSON, JUnit, normalized headers/trailers/close details, and result persistence",
    ["cli-runner.cjs"],
  ],
  ["strict-mock", "Strict mock scenario preflight before request execution", ["cli-runner.cjs"]],
  ["gateway", "Gateway list, start, status, stop, foreground, and daemon workflows", ["cli-gateway.cjs"]],
];

function buildParityReport(workspace) {
  const root = path.resolve(__dirname);
  const capabilities = FEATURE_DEFINITIONS.map(([id, description, files]) => {
    const missingFiles = files.filter((file) => !fs.existsSync(path.join(root, file)));
    return {
      id,
      description,
      status: missingFiles.length ? "missing" : "implemented",
      missingFiles,
    };
  });

  const items = discoverRunItems(workspace, { transportExplicit: false });
  const schemas = listProtoSchemas(workspace.project || {});
  const methods = schemas.flatMap((schema) => schema.revisions.flatMap((revision) => revision.methods));
  const protocols = {
    rest: items.filter((item) => item.requestKind === "rest").length,
    websocket: items.filter((item) => item.requestKind === "websocket").length,
    grpc: items.filter((item) => item.requestKind === "grpc").length,
  };
  const grpcKinds = {
    unary: methods.filter((method) => !method.requestStream && !method.responseStream).length,
    serverStream: methods.filter((method) => !method.requestStream && method.responseStream).length,
    clientStream: methods.filter((method) => method.requestStream && !method.responseStream).length,
    bidirectional: methods.filter((method) => method.requestStream && method.responseStream).length,
  };

  const dependencies = {
    grpc: dependencyStatus(["@grpc/grpc-js", "@grpc/proto-loader"]),
    websocketMock: { ready: true, missing: [], implementation: "built-in node:http upgrade server" },
    builtInRestAndWebSocketClient: { ready: true, missing: [] },
  };
  const validation = validateWorkspace(workspace);
  const mockValidation = validateMockScenarios(workspace);
  const implemented = capabilities.filter((item) => item.status === "implemented").length;
  const implementationScore = Math.round((implemented / capabilities.length) * 100);
  const runtimeWarnings = [];
  if (protocols.grpc > 0 && !dependencies.grpc.ready) {
    runtimeWarnings.push("Install workspace dependencies before live native gRPC or gRPC-Web execution.");
  }
  for (const warning of validation.warnings || []) runtimeWarnings.push(warning);
  for (const warning of mockValidation.warnings || []) runtimeWarnings.push(warning);

  return {
    generatedAt: new Date().toISOString(),
    workspace: workspace.root,
    implementation: {
      ready: implemented === capabilities.length,
      score: implementationScore,
      implemented,
      total: capabilities.length,
      scope:
        "Headless workflow parity. Visual editing remains a UI concern, while the same persisted data can be managed through CLI commands.",
    },
    capabilities,
    workspaceCoverage: {
      source: workspace.source,
      requests: items.length,
      protocols,
      examples: Array.isArray(workspace.project?.examples) ? workspace.project.examples.length : 0,
      schemas: schemas.length,
      grpcMethods: methods.length,
      grpcKinds,
      documentationSources: Array.isArray(workspace.project?.documentation?.sources)
        ? workspace.project.documentation.sources.length
        : 0,
      mockScenarios:
        (Array.isArray(workspace.scenarios) ? workspace.scenarios.length : 0) +
        (Array.isArray(workspace.project?.restMockServer?.scenarios)
          ? workspace.project.restMockServer.scenarios.length
          : 0) +
        (Array.isArray(workspace.project?.wsMockServer?.scenarios)
          ? workspace.project.wsMockServer.scenarios.length
          : 0),
    },
    dependencies,
    validation: {
      workspace: validation,
      mocks: mockValidation,
    },
    runtimeReady: runtimeWarnings.length === 0 && validation.ok,
    runtimeWarnings: [...new Set(runtimeWarnings)],
  };
}

function dependencyStatus(names) {
  const missing = [];
  for (const name of names) {
    try {
      require.resolve(name);
    } catch {
      missing.push(name);
    }
  }
  return { ready: missing.length === 0, missing };
}

function formatParityReport(report) {
  const lines = [
    `Layang CLI/UI parity: ${report.implementation.score}% (${report.implementation.implemented}/${report.implementation.total} workflow capabilities implemented)`,
    `Workspace: ${report.workspace}`,
    "",
  ];
  for (const capability of report.capabilities) {
    lines.push(`${capability.status === "implemented" ? "✓" : "✕"} ${capability.description}`);
  }
  lines.push("", "Workspace coverage:");
  lines.push(
    `- Requests: ${report.workspaceCoverage.requests} (REST ${report.workspaceCoverage.protocols.rest}, gRPC ${report.workspaceCoverage.protocols.grpc}, WebSocket ${report.workspaceCoverage.protocols.websocket})`,
  );
  lines.push(
    `- gRPC methods: ${report.workspaceCoverage.grpcMethods} (unary ${report.workspaceCoverage.grpcKinds.unary}, server stream ${report.workspaceCoverage.grpcKinds.serverStream}, client stream ${report.workspaceCoverage.grpcKinds.clientStream}, bidi ${report.workspaceCoverage.grpcKinds.bidirectional})`,
  );
  lines.push(`- Examples: ${report.workspaceCoverage.examples}`);
  lines.push(`- Mock scenarios: ${report.workspaceCoverage.mockScenarios}`);
  lines.push(`- Documentation sources: ${report.workspaceCoverage.documentationSources}`);
  if (report.runtimeWarnings.length) {
    lines.push("", "Runtime readiness notes:");
    for (const warning of report.runtimeWarnings) lines.push(`- ${warning}`);
  }
  lines.push("", report.implementation.scope, "");
  return `${lines.join("\n")}\n`;
}

module.exports = {
  FEATURE_DEFINITIONS,
  buildParityReport,
  dependencyStatus,
  formatParityReport,
};
