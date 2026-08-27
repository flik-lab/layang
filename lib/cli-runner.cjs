"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const {
  readWorkspace,
  discoverRunItems,
  validateWorkspace,
  validateMockScenarios,
  resolveProtoFilesForRunItem,
  listProtoSchemas,
} = require("./cli-workspace.cjs");
const { executeRunItem, invokeNativeGrpc, invokeWebSocket } = require("./cli-transports.cjs");
const {
  evaluateAssertions,
  assertionsPassed,
  calculateBenchmarkStats,
  parseJsonLoose,
  buildRestRequest,
  buildGrpcInput,
  buildWebSocketInput,
} = require("./cli-runtime-core.cjs");
const { findMatchingMockScenario } = require("./mock-runtime.cjs");

async function handleCli(parsed, options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;

  if (parsed.command === "version") {
    stdout.write(`${readPackageVersion()}\n`);
    return 0;
  }

  if (parsed.command === "list") return handleList(parsed, stdout);
  if (parsed.command === "parity") return handleParity(parsed, stdout);
  if (parsed.command === "workspace:migrate" || parsed.command === "workspace:format")
    return handleWorkspaceFormat(parsed, stdout);
  if (parsed.command === "schemas") return handleSchemas(parsed, stdout);
  if (parsed.command === "examples:list") return handleExamplesList(parsed, stdout);
  if (["example:create", "example:duplicate", "example:edit", "example:delete"].includes(parsed.command))
    return handleExampleMutation(parsed, stdout);
  if (
    parsed.command === "schema:import" ||
    parsed.command === "schema:update" ||
    parsed.command === "schema:diff" ||
    parsed.command === "schema:delete" ||
    parsed.command === "schema:repair"
  ) {
    return handleSchemaCommand(parsed, stdout);
  }
  if (parsed.command === "docs:init" || parsed.command === "docs:set") return handleDocsAuthoring(parsed, stdout);
  if (parsed.command.startsWith("gateway:")) return handleGateway(parsed, stdout);
  if (parsed.command.startsWith("git:")) return require("./cli-git.cjs").handleGitCommand(parsed, stdout);
  if (parsed.command === "validate") {
    const workspace = await readWorkspace(parsed.workspace || ".");
    const validation = validateWorkspace(workspace);
    await writeValidation(validation, parsed.flags, stdout);
    return validation.ok ? 0 : 1;
  }
  if (parsed.command === "mock:check") {
    const workspace = await readWorkspace(parsed.workspace || ".");
    const validation = validateMockScenarios(workspace);
    await writeValidation(validation, parsed.flags, stdout);
    return validation.ok ? 0 : 1;
  }
  if (
    ["mock:start", "mock:serve", "mock:status", "mock:stop", "mock:reload", "mock:logs", "mock:send"].includes(
      parsed.command,
    )
  ) {
    return handleMockCommand(parsed, stdout);
  }
  if (parsed.command === "docs:build" || parsed.command === "docs:check") return handleDocumentation(parsed, stdout);
  if (parsed.command === "benchmark") return handleBenchmark(parsed, stdout);
  if (parsed.command === "example:run") return handleExampleRun(parsed, stdout);
  if (parsed.command === "run") return handleRun(parsed, stdout, stderr);
  throw new Error(`Unsupported command: ${parsed.command}`);
}

async function handleWorkspaceFormat(parsed, stdout) {
  const { migrateGitWorkspace } = require("./git-workspace.cjs");
  const result = await migrateGitWorkspace(parsed.workspace || ".", {
    check: Boolean(parsed.flags.check),
    mode: parsed.command === "workspace:format" ? "format" : "migrate",
  });
  if (parsed.flags.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (result.check) {
    if (parsed.command === "workspace:format") {
      stdout.write(
        result.needsFormatting
          ? `Workspace files are not in canonical format v${result.targetVersion}.\n`
          : `Workspace files already use canonical format v${result.targetVersion}.\n`,
      );
    } else {
      stdout.write(
        result.needsMigration
          ? `Workspace v${result.currentVersion} requires migration to v${result.targetVersion}.\n`
          : `Workspace already uses format v${result.targetVersion}.\n`,
      );
    }
  } else {
    const action = parsed.command === "workspace:format" ? "Formatted" : result.migrated ? "Migrated" : "Formatted";
    stdout.write(`${action} workspace at ${result.root} using format v${result.targetVersion}.\n`);
  }
  if (result.check && (result.needsMigration || result.needsFormatting)) return 1;
  return 0;
}

async function handleParity(parsed, stdout) {
  const workspace = await readWorkspace(parsed.workspace || ".");
  const { buildParityReport, formatParityReport } = require("./cli-parity.cjs");
  const report = buildParityReport(workspace);
  if (parsed.flags.json) stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else stdout.write(formatParityReport(report));
  return report.implementation.ready ? 0 : 1;
}

async function handleList(parsed, stdout) {
  const workspace = await readWorkspace(parsed.workspace || ".");
  const items = discoverRunItems(workspace, {
    method: parsed.flags.method || "",
    collection: parsed.flags.collection || "",
    request: parsed.flags.request || "",
  });
  if (parsed.flags.json) {
    stdout.write(`${JSON.stringify({ workspace: workspace.root, count: items.length, requests: items }, null, 2)}\n`);
  } else {
    stdout.write(`Workspace: ${workspace.root}\n`);
    if (!items.length) stdout.write("No saved requests found.\n");
    for (const item of items) {
      const protocol = item.requestKind === "grpc" ? "gRPC" : item.requestKind === "websocket" ? "WS" : "REST";
      const detail =
        item.requestKind === "grpc" ? item.methodKey : `${item.httpMethod || ""} ${item.target || ""}`.trim();
      stdout.write(
        `- [${protocol}] ${item.collectionName || "Workspace"} / ${item.title}${detail ? `  ${detail}` : ""}\n`,
      );
    }
  }
  return 0;
}

async function handleSchemas(parsed, stdout) {
  const workspace = await readWorkspace(parsed.workspace || ".");
  const schemas = listProtoSchemas(workspace.project || {});
  if (parsed.flags.json)
    stdout.write(`${JSON.stringify({ workspace: workspace.root, count: schemas.length, schemas }, null, 2)}\n`);
  else {
    stdout.write(`Workspace: ${workspace.root}\n`);
    if (!schemas.length) stdout.write("No proto schemas uploaded.\n");
    for (const schema of schemas) {
      stdout.write(`${schema.name}\n`);
      for (const revision of schema.revisions) {
        stdout.write(`  - ${revision.label}: ${revision.fileCount} file(s), ${revision.methods.length} method(s)\n`);
        for (const method of revision.methods) {
          const kind =
            method.requestStream && method.responseStream
              ? "BIDI"
              : method.requestStream
                ? "CSTR"
                : method.responseStream
                  ? "SSTR"
                  : "RPC";
          stdout.write(`      ${kind} ${method.service}/${method.method}\n`);
        }
      }
    }
  }
  return 0;
}

async function handleExamplesList(parsed, stdout) {
  const workspace = await readWorkspace(parsed.workspace || ".");
  const { listExamples } = require("./cli-examples.cjs");
  const examples = listExamples(workspace, {
    example: parsed.flags.example,
    request: parsed.flags.request,
    method: parsed.flags.method,
    includeHidden: parsed.flags.includeHidden,
  });
  if (parsed.flags.json)
    stdout.write(`${JSON.stringify({ workspace: workspace.root, count: examples.length, examples }, null, 2)}\n`);
  else {
    stdout.write(`Workspace: ${workspace.root}\n`);
    if (!examples.length) stdout.write("No saved examples matched.\n");
    for (const example of examples) {
      stdout.write(
        `- ${example.name} [${example.expectedStatus || "no expected status"}] ${example.serviceName}/${example.methodName}${example.enabled === false ? " (hidden from docs)" : ""}\n`,
      );
      if (example.documentation?.summary) stdout.write(`  ${example.documentation.summary}\n`);
    }
  }
  return 0;
}

async function handleExampleMutation(parsed, stdout) {
  const examples = require("./cli-examples.cjs");
  const selector =
    parsed.flags.example || parsed.flags.name || (parsed.command === "example:create" ? "" : parsed.flags.request);
  let result;
  if (parsed.command === "example:create") {
    const requestSelector = parsed.flags.request || parsed.flags.method;
    if (!requestSelector && !parsed.flags.collection)
      throw new Error("example:create requires --request, --method, or --collection.");
    result = await examples.createExample(parsed.workspace || ".", parsed.flags.request || "", {
      method: parsed.flags.method,
      collection: parsed.flags.collection,
      name: parsed.flags.name,
      set: parsed.flags.set,
    });
  } else if (parsed.command === "example:duplicate") {
    if (!parsed.flags.example) throw new Error("example:duplicate requires --example <name-or-id>.");
    result = await examples.duplicateExample(parsed.workspace || ".", parsed.flags.example, {
      name: parsed.flags.name,
      set: parsed.flags.set,
    });
  } else if (parsed.command === "example:delete") {
    if (!parsed.flags.example) throw new Error("example:delete requires --example <name-or-id>.");
    if (!parsed.flags.yes)
      throw new Error("example:delete permanently removes executable example data and requires --yes.");
    result = await examples.deleteExample(parsed.workspace || ".", parsed.flags.example);
  } else {
    if (!selector) throw new Error("example:edit requires --example <name-or-id>.");
    if (!parsed.flags.set) throw new Error("example:edit requires at least one --set key=value.");
    result = await examples.editExample(parsed.workspace || ".", selector, parsed.flags.set);
  }
  if (parsed.flags.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (parsed.command === "example:delete")
    stdout.write(`Deleted example ${result.deleted.name}; ${result.remaining} remain.\n`);
  else if (parsed.command === "example:create") stdout.write(`Created example ${result.name}.\n`);
  else if (parsed.command === "example:duplicate") stdout.write(`Duplicated example as ${result.name}.\n`);
  else stdout.write(`Updated example ${result.name}.\n`);
  return 0;
}

async function handleSchemaCommand(parsed, stdout) {
  const schema = require("./cli-schema.cjs");
  const selector = parsed.flags.schema || parsed.flags.name;
  let result;
  if (parsed.command === "schema:import") {
    if (!parsed.flags.file) throw new Error("schema:import requires --file <proto-or-folder>.");
    result = await schema.importSchema(parsed.workspace || ".", parsed.flags.file, {
      name: parsed.flags.name,
      revision: parsed.flags.revision,
      force: parsed.flags.force,
    });
  } else if (parsed.command === "schema:update") {
    if (!selector || !parsed.flags.file) throw new Error("schema:update requires --schema and --file.");
    result = await schema.updateSchema(parsed.workspace || ".", selector, parsed.flags.file, {
      revision: parsed.flags.revision,
      force: parsed.flags.force,
    });
  } else if (parsed.command === "schema:diff") {
    if (!selector || !parsed.flags.file) throw new Error("schema:diff requires --schema and --file.");
    result = await schema.diffSchema(parsed.workspace || ".", selector, parsed.flags.file);
  } else if (parsed.command === "schema:delete") {
    if (!selector) throw new Error("schema:delete requires --schema.");
    if (!parsed.flags.yes)
      throw new Error("Schema deletion preserves broken request references, but still requires --yes.");
    result = await schema.deleteSchema(parsed.workspace || ".", selector);
  } else {
    result = await schema.repairSchemas(parsed.workspace || ".", {
      request: parsed.flags.request,
      schema: selector,
    });
  }
  if (parsed.flags.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(`${formatSchemaResult(parsed.command, result)}\n`);
  return result?.unresolved?.length ? 1 : 0;
}

function formatSchemaResult(command, result) {
  if (command === "schema:diff") {
    const lines = [
      `Schema diff for ${result.schema.name}: ${result.identical ? "no source changes" : "changes detected"}.`,
      `Files +${result.addedFiles.length} ~${result.changedFiles.length} -${result.removedFiles.length}; methods +${result.addedMethods.length} -${result.removedMethods.length}.`,
    ];
    for (const file of result.fileDiffs || []) {
      lines.push(
        "",
        `${file.status === "added" ? "+" : file.status === "removed" ? "-" : "~"} ${file.name} (+${file.additions}/-${file.removals})`,
      );
      for (const entry of file.lines || []) {
        const marker = entry.type === "add" ? "+" : entry.type === "remove" ? "-" : " ";
        const oldLine = entry.oldLine == null ? "" : String(entry.oldLine);
        const newLine = entry.newLine == null ? "" : String(entry.newLine);
        lines.push(`${marker} ${oldLine.padStart(4)} ${newLine.padStart(4)} | ${entry.text}`);
      }
    }
    if (result.addedMethods?.length) lines.push("", ...result.addedMethods.map((method) => `+ method ${method}`));
    if (result.removedMethods?.length) lines.push("", ...result.removedMethods.map((method) => `- method ${method}`));
    return lines.join("\n");
  }
  if (command === "schema:repair")
    return `Schema repair: ${result.repaired.length} repaired, ${result.unresolved.length} unresolved.`;
  if (command === "schema:delete")
    return `Deleted schema ${result.deleted.name}; ${result.unresolvedRequestCount} request reference(s) remain repairable.`;
  return `${result.action}: ${result.library?.name || "schema"} ${result.version?.version || ""}`.trim();
}

async function handleDocsAuthoring(parsed, stdout) {
  const docs = require("./cli-docs-authoring.cjs");
  let result;
  if (parsed.command === "docs:init") {
    result = await docs.initializeDocumentation(parsed.workspace || ".", {
      request: parsed.flags.request,
      collection: parsed.flags.collection,
      force: parsed.flags.force,
    });
  } else {
    if (!parsed.flags.request) throw new Error("docs:set requires --request <name-or-id>.");
    if (!parsed.flags.set) throw new Error("docs:set requires at least one --set key=value.");
    result = await docs.setDocumentation(parsed.workspace || ".", parsed.flags.request, parsed.flags.set);
  }
  if (parsed.flags.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (parsed.command === "docs:init")
    stdout.write(
      `Documentation initialized: ${result.created.length} created, ${result.skipped.length} already existed.\n`,
    );
  else stdout.write(`Documentation updated for ${result.entityId}.\n`);
  return 0;
}

async function handleGateway(parsed, stdout) {
  const workspace = await readWorkspace(parsed.workspace || ".");
  const {
    listGatewayProfiles,
    findGatewayProfile,
    startGatewayDaemon,
    readGatewayProcessStatus,
    stopGatewayProcess,
    serveGateway,
  } = require("./cli-gateway.cjs");
  const profiles = listGatewayProfiles(workspace);
  if (parsed.command === "gateway:list") {
    if (parsed.flags.json) stdout.write(`${JSON.stringify({ workspace: workspace.root, profiles }, null, 2)}\n`);
    else {
      stdout.write(`Workspace: ${workspace.root}\n`);
      if (!profiles.length) stdout.write("No gateway profiles found.\n");
      for (const profile of profiles) {
        const web =
          profile.web?.enabled !== false
            ? `${profile.web?.security?.type === "tls" ? "https" : "http"}://${displayGatewayHost(profile.web?.host || "127.0.0.1")}:${profile.web?.port || (profile.web?.security?.type === "tls" ? 8443 : 8080)}`
            : "disabled";
        stdout.write(
          `- ${profile.name} [${profile.mode}] native ${profile.listenHost}:${profile.listenPort} · web ${web} -> ${profile.upstreams.map((item) => item.target).join(", ") || "mock only"}\n`,
        );
      }
    }
    return 0;
  }
  const profile = findGatewayProfile(workspace, parsed.flags.profile || parsed.flags.name || "");
  if (!profile) throw new Error("Gateway profile was not found. Use layang gateway:list first.");
  if (parsed.command === "gateway:status") {
    const status = await readGatewayProcessStatus(workspace.root, profile.id);
    if (parsed.flags.json) stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    else {
      stdout.write(`${profile.name}: ${status.running ? `running (PID ${status.pid})` : "stopped"}\n`);
      if (status.running && status.webUrl)
        stdout.write(`Browser endpoint: ${status.webUrl} (${status.webHttp2 ? "HTTP/2" : "HTTP/1.1"})\n`);
    }
    return status.running ? 0 : 1;
  }
  if (parsed.command === "gateway:stop") {
    const status = await stopGatewayProcess(workspace.root, profile.id);
    stdout.write(`${status.message}\n`);
    return 0;
  }
  if (parsed.command === "gateway:start" && parsed.flags.daemon) {
    const record = await startGatewayDaemon(workspace, profile, path.resolve(__dirname, "../bin/layang.cjs"));
    stdout.write(`${profile.name} started in background with PID ${record.pid}.\n`);
    return 0;
  }
  const webUrl =
    profile.web?.enabled !== false
      ? `${profile.web?.security?.type === "tls" ? "https" : "http"}://${displayGatewayHost(profile.web?.host || "127.0.0.1")}:${profile.web?.port || (profile.web?.security?.type === "tls" ? 8443 : 8080)}`
      : "disabled";
  stdout.write(
    `${profile.name} starting: native ${profile.listenHost}:${profile.listenPort}, browser ${webUrl}. Press Ctrl+C to stop.\n`,
  );
  await serveGateway(workspace, profile);
  return 0;
}

async function handleMockCommand(parsed, stdout) {
  const mock = require("./cli-mock.cjs");
  const protocol = mock.normalizeProtocol(parsed.flags.protocol || "all");
  if (parsed.command === "mock:serve") {
    const workspace = await readWorkspace(parsed.workspace || ".");
    await mock.serveMocks(workspace, protocol);
    return 0;
  }
  if (parsed.command === "mock:start") {
    const workspace = await readWorkspace(parsed.workspace || ".");
    if (parsed.flags.daemon) {
      const record = await mock.startMockDaemon(workspace, protocol, path.resolve(__dirname, "../bin/layang.cjs"));
      stdout.write(`Mock runtime starting in background with PID ${record.pid} (${protocol}).\n`);
      return 0;
    }
    stdout.write(`Mock runtime starting (${protocol}). Press Ctrl+C to stop.\n`);
    await mock.serveMocks(workspace, protocol);
    return 0;
  }
  if (parsed.command === "mock:status") {
    const status = await mock.readMockStatus(parsed.workspace || ".");
    if (parsed.flags.json) stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    else {
      stdout.write(`Mock runtime: ${status.running ? `running (PID ${status.pid}, ${status.protocol})` : "stopped"}\n`);
      for (const [name, value] of Object.entries(status.statuses || {}))
        stdout.write(`- ${name}: ${value.url || value.localTarget || "running"}\n`);
    }
    return status.running ? 0 : 1;
  }
  if (parsed.command === "mock:stop") {
    const result = await mock.stopMockRuntime(parsed.workspace || ".");
    stdout.write(`${result.message}\n`);
    return 0;
  }
  if (parsed.command === "mock:reload") {
    const result = await mock.reloadMockRuntime(parsed.workspace || ".");
    stdout.write(`${result.message}\n`);
    return 0;
  }
  if (parsed.command === "mock:logs") {
    const lines = await mock.readMockLogs(parsed.workspace || ".", parsed.flags.tail || 100);
    stdout.write(`${lines.join("\n")}${lines.length ? "\n" : ""}`);
    return 0;
  }
  if (parsed.command === "mock:send") {
    if (protocol !== "websocket" && protocol !== "all")
      throw new Error("mock:send currently targets WebSocket mock clients.");
    const command = await mock.sendMockCommand(parsed.workspace || ".", "send-websocket", {
      scenarioId: parsed.flags.scenario,
      path: parsed.flags.path,
      responseText: parsed.flags.message,
    });
    stdout.write(`Queued WebSocket mock send command ${command.id}.\n`);
    return 0;
  }
  return 1;
}

async function handleDocumentation(parsed, stdout) {
  const { buildDocumentation, checkDocumentation } = require("./docs-workspace.cjs");
  const options = {
    collection: parsed.flags.collection ? String(parsed.flags.collection) : "",
    request: parsed.flags.request ? String(parsed.flags.request) : "",
  };
  const checkOnly = parsed.command === "docs:check" || Boolean(parsed.flags.check);
  const report = checkOnly
    ? await checkDocumentation(parsed.workspace || ".", options)
    : await buildDocumentation(parsed.workspace || ".", options);
  if (parsed.flags.json) stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    stdout.write(`Documentation ${checkOnly ? "check" : "build"}: ${report.root}\n`);
    stdout.write(`${report.pageCount} page(s), ${report.warningCount} warning(s), ${report.errorCount} error(s)\n`);
    if (!checkOnly && report.wikiExportPath) stdout.write(`Wiki export: ${report.wikiExportPath}\n`);
    if (!checkOnly && report.staticSitePath) stdout.write(`Static site: ${report.staticSitePath}\n`);
    if (report.staleCount) stdout.write(`${report.staleCount} generated file(s) are stale.\n`);
    for (const page of report.pages) stdout.write(`- [${page.status}] ${page.title}\n`);
  }
  return report.ok ? 0 : 1;
}

async function handleRun(parsed, stdout) {
  const runOptions = normalizeRunOptionsFromParsed(parsed);
  const workspace = await readWorkspace(runOptions.workspace);
  const validation = validateWorkspace(workspace);
  if (!validation.ok) {
    await writeValidation(validation, { json: runOptions.reporter === "json" }, stdout);
    return 1;
  }
  const items = discoverRunItems(workspace, runOptions);
  if (!items.length) throw new Error("No request tabs matched the run filters.");
  const summary = await runItems(workspace, items, runOptions, stdout);
  return summary.failed === 0 ? 0 : 1;
}

async function handleExampleRun(parsed, stdout) {
  const runOptions = normalizeRunOptionsFromParsed(parsed);
  const workspace = await readWorkspace(runOptions.workspace);
  const { listExamples, examplesToRunItems } = require("./cli-examples.cjs");
  const examples = listExamples(workspace, {
    example: parsed.flags.example,
    request: parsed.flags.request,
    method: parsed.flags.method,
    includeHidden: true,
  });
  if (!examples.length) throw new Error("No saved examples matched. Use layang examples:list first.");
  if (!parsed.flags.all && !parsed.flags.example && examples.length > 1)
    throw new Error("More than one example matched. Use --example or --all.");
  const items = examplesToRunItems(workspace, parsed.flags.all ? examples : [examples[0]], runOptions);
  const summary = await runItems(workspace, items, runOptions, stdout, { label: "example" });
  return summary.failed === 0 ? 0 : 1;
}

async function runItems(workspace, items, runOptions, stdout, extra = {}) {
  const startedAt = new Date().toISOString();
  const results = [];
  if (runOptions.reporter === "spec")
    stdout.write(`Layang CLI running ${items.length} ${extra.label || "request"}(s) from ${workspace.root}\n`);
  for (const item of items) {
    const started = Date.now();
    try {
      if (runOptions.strictMock) assertStrictMockMatch(workspace, item, runOptions);
      const result = await executeRunItem(workspace, item, {
        ...runOptions,
        messages: runOptions.messages,
      });
      const assertionResults = evaluateAssertions(result, item.assertionJson, item.expected || {});
      const expectedConfigured = Boolean(
        item.expected && (item.expected.status || item.expected.json || item.expected.trailers?.length),
      );
      const assertedStatus = assertionExpectsStatus(item.assertionJson);
      const passed =
        assertionsPassed(assertionResults) && (expectedConfigured || assertedStatus || result.statusCode === 0);
      const entry = {
        id: item.id,
        title: item.title,
        methodKey: item.methodKey,
        target: item.target,
        transportMode: result.transport || item.transportMode,
        passed,
        statusCode: result.statusCode,
        statusMessage: result.statusMessage,
        httpStatus: result.httpStatus,
        headers: result.headers,
        trailers: result.trailers,
        closeCode: result.closeCode,
        closeReason: result.closeReason,
        durationMs: result.durationMs ?? Date.now() - started,
        messages: result.messages,
        totalMessages: result.totalMessages,
        assertions: assertionResults,
        exampleId: item.example?.id,
        exampleName: item.example?.name,
      };
      results.push(entry);
      if (runOptions.reporter === "spec") writeSpecEntry(stdout, entry);
      if (!passed && runOptions.bail) break;
    } catch (error) {
      const entry = {
        id: item.id,
        title: item.title,
        methodKey: item.methodKey,
        target: item.target,
        passed: false,
        error: error?.message ? error.message : String(error),
        durationMs: Date.now() - started,
        messages: [],
        totalMessages: 0,
        assertions: [],
      };
      results.push(entry);
      if (runOptions.reporter === "spec") stdout.write(`✕ ${item.methodKey} (${entry.durationMs}ms) ${entry.error}\n`);
      if (runOptions.bail) break;
    }
  }
  const summary = {
    workspace: workspace.root,
    startedAt,
    completedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
    results,
  };
  if (runOptions.saveResult) await persistCliResult(workspace.root, summary, runOptions.resultDirectory);
  await writeReport(summary, runOptions, stdout);
  return summary;
}

function writeSpecEntry(stdout, entry) {
  stdout.write(
    `${entry.passed ? "✓" : "✕"} ${entry.methodKey} (${entry.durationMs}ms)${entry.passed ? "" : ` status ${entry.statusCode}: ${entry.statusMessage || "failed"}`}\n`,
  );
  for (const assertion of entry.assertions || []) {
    if (assertion.status === "skipped") continue;
    stdout.write(`  ${assertion.status === "passed" ? "✓" : "✕"} ${assertion.name}: ${assertion.detail}\n`);
  }
}

function assertStrictMockMatch(workspace, item, options = {}) {
  if (item.requestKind === "grpc") {
    const [serviceName, methodName] = splitMethodKey(item.methodKey);
    const input = buildGrpcInput(item, workspace, options);
    const request = parseJsonLoose(input.requestText || "{}", {});
    const match = findMatchingMockScenario(
      { serviceName, methodName },
      { data: request, headers: Object.fromEntries(input.metadata.map((pair) => [pair.key, pair.value])) },
      workspace.scenarios || [],
      workspace.mockServer?.selectedScenarioIds || {},
      workspace.mockServer?.enabledMethods || {},
    );
    if (!match) throw new Error(`--strict-mock: no active gRPC mock scenario matches ${item.methodKey}.`);
    return;
  }
  if (item.requestKind === "rest") {
    const request = buildRestRequest(item, workspace, options);
    const url = new URL(request.url);
    const body = typeof request.body === "string" ? request.body : "";
    const bodyJson = parseJsonLoose(body, undefined);
    const internals = require("../electron/services/rest-mock-server.cjs")._internals;
    const candidate = {
      method: request.method,
      pathname: url.pathname,
      url,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      bodyJson,
    };
    const scenario = (workspace.project.restMockServer?.scenarios || []).find(
      (entry) =>
        entry?.enabled !== false &&
        internals.scenarioMatches(internals.normalizeConfig({ scenarios: [entry] }).scenarios[0], candidate).ok,
    );
    if (!scenario)
      throw new Error(`--strict-mock: no enabled REST mock scenario matches ${request.method} ${url.pathname}.`);
    return;
  }
  const input = buildWebSocketInput(item, workspace, options);
  const url = new URL(input.url);
  const wsMock = require("../electron/services/ws-mock-server.cjs");
  const config = wsMock.normalizeWebSocketMockConfig(workspace.project.wsMockServer || {});
  const firstMessage =
    Array.isArray(options.messages) && options.messages.length ? String(options.messages[0]) : input.requestText;
  const scenario = config.scenarios.find(
    (entry) =>
      entry.enabled !== false &&
      normalizePathPattern(entry.path) === normalizePathPattern(url.pathname) &&
      (entry.streamOnConnect || !entry.sendOnMessage || wsMock.matchesWebSocketIncomingMessage(entry, firstMessage)),
  );
  if (!scenario) throw new Error(`--strict-mock: no enabled WebSocket mock scenario matches ${url.pathname}.`);
}

function normalizePathPattern(value) {
  return (
    String(value || "/")
      .replace(/\{[^}]+\}|:[^/]+/g, ":param")
      .replace(/\/$/, "") || "/"
  );
}

async function handleBenchmark(parsed, stdout) {
  const runOptions = normalizeRunOptionsFromParsed(parsed);
  const workspace = await readWorkspace(runOptions.workspace);
  const items = discoverRunItems(workspace, runOptions);
  if (!items.length) throw new Error("No requests matched the benchmark filters.");
  const iterations = positive(parsed.flags.iterations, 20);
  const warmup = nonNegative(parsed.flags.warmup, 1);
  const periodMs = nonNegative(parsed.flags.period, 0);
  const results = [];
  for (const item of items) {
    for (let index = 0; index < warmup + iterations; index += 1) {
      const started = Date.now();
      try {
        const result = await executeRunItem(workspace, item, runOptions);
        const assertions = evaluateAssertions(result, item.assertionJson, {});
        const entry = {
          requestId: item.id,
          request: item.title,
          iteration: Math.max(0, index - warmup + 1),
          warmup: index < warmup,
          passed: result.statusCode === 0 && assertionsPassed(assertions),
          statusCode: result.statusCode,
          durationMs: result.durationMs ?? Date.now() - started,
          totalMessages: result.totalMessages,
        };
        if (!entry.warmup) results.push(entry);
        if (runOptions.reporter === "spec" && !entry.warmup)
          stdout.write(`${entry.passed ? "✓" : "✕"} ${item.title} #${entry.iteration}: ${entry.durationMs}ms\n`);
      } catch (error) {
        if (index >= warmup)
          results.push({
            requestId: item.id,
            request: item.title,
            iteration: index - warmup + 1,
            passed: false,
            durationMs: Date.now() - started,
            error: error?.message || String(error),
            totalMessages: 0,
          });
      }
      if (periodMs > 0 && index < warmup + iterations - 1) await sleep(periodMs);
    }
  }
  const stats = calculateBenchmarkStats(results);
  const thresholds = {
    p95Ms: parsed.flags.thresholdP95 === undefined ? null : Number(parsed.flags.thresholdP95),
    errorRate: parsed.flags.thresholdErrorRate === undefined ? null : Number(parsed.flags.thresholdErrorRate),
  };
  const thresholdFailures = [];
  if (Number.isFinite(thresholds.p95Ms) && stats.p95Ms > thresholds.p95Ms)
    thresholdFailures.push(`p95 ${stats.p95Ms}ms > ${thresholds.p95Ms}ms`);
  if (Number.isFinite(thresholds.errorRate) && stats.errorRate > thresholds.errorRate)
    thresholdFailures.push(`error rate ${stats.errorRate} > ${thresholds.errorRate}`);
  const report = {
    workspace: workspace.root,
    generatedAt: new Date().toISOString(),
    iterations,
    warmup,
    periodMs,
    stats,
    thresholds,
    thresholdFailures,
    results,
  };
  const content = `${JSON.stringify(report, null, 2)}\n`;
  if (runOptions.output) {
    await fsp.mkdir(path.dirname(path.resolve(runOptions.output)), { recursive: true });
    await fsp.writeFile(path.resolve(runOptions.output), content, "utf8");
  } else if (runOptions.reporter === "json") stdout.write(content);
  else
    stdout.write(
      `Benchmark: ${stats.passed}/${stats.total} passed · avg ${stats.averageMs.toFixed(1)}ms · p95 ${stats.p95Ms}ms · p99 ${stats.p99Ms}ms · error ${(stats.errorRate * 100).toFixed(1)}%\n`,
    );
  for (const failure of thresholdFailures) stdout.write(`threshold failed: ${failure}\n`);
  return thresholdFailures.length || stats.failed ? 1 : 0;
}

function normalizeRunOptionsFromParsed(parsed) {
  const { normalizeRunOptions } = require("./cli-args.cjs");
  return normalizeRunOptions(parsed);
}

async function writeValidation(validation, flags, stdout) {
  if (flags.json) stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
  else {
    stdout.write(`${validation.ok ? "✓" : "✕"} Validation ${validation.ok ? "passed" : "failed"}\n`);
    for (const warning of validation.warnings || []) stdout.write(`warning: ${warning}\n`);
    for (const error of validation.errors || []) stdout.write(`error: ${error}\n`);
  }
}

async function writeReport(summary, options, stdout) {
  const reporter = options.reporter || "spec";
  let content = "";
  if (reporter === "json") content = `${JSON.stringify(summary, null, 2)}\n`;
  if (reporter === "junit") content = buildJUnit(summary);
  if (options.output && content) {
    await fsp.mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
    await fsp.writeFile(path.resolve(options.output), content, "utf8");
  } else if (content) stdout.write(content);
  if (reporter === "spec") stdout.write(`Done: ${summary.passed}/${summary.total} passed, ${summary.failed} failed.\n`);
}

function buildJUnit(summary) {
  const failures = summary.results.filter((item) => !item.passed).length;
  const durationSeconds = summary.results.reduce((sum, item) => sum + Number(item.durationMs || 0), 0) / 1000;
  const cases = summary.results
    .map((item) => {
      const attrs = `classname="Layang.CLI" name="${escapeXml(item.methodKey)}" time="${Number(item.durationMs || 0) / 1000}"`;
      if (item.passed) return `    <testcase ${attrs}/>`;
      const message = escapeXml(
        item.error || item.statusMessage || failedAssertionMessage(item.assertions) || "Request failed",
      );
      return `    <testcase ${attrs}>\n      <failure message="${message}">${message}</failure>\n    </testcase>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${summary.total}" failures="${failures}" time="${durationSeconds}">\n  <testsuite name="Layang CLI" tests="${summary.total}" failures="${failures}" time="${durationSeconds}">\n${cases}\n  </testsuite>\n</testsuites>\n`;
}

function assertionExpectsStatus(assertionText) {
  if (!String(assertionText || "").trim()) return false;
  try {
    const parsed = JSON.parse(String(assertionText));
    return Boolean(
      parsed &&
        !Array.isArray(parsed) &&
        (parsed.httpStatus !== undefined || parsed.grpcStatus !== undefined || parsed.wsCloseCode !== undefined),
    );
  } catch {
    return false;
  }
}

function failedAssertionMessage(assertions) {
  return (assertions || [])
    .filter((item) => item.status === "failed")
    .map((item) => `${item.name}: ${item.detail}`)
    .join("; ");
}

async function persistCliResult(root, summary, configuredDirectory) {
  const directory = configuredDirectory
    ? path.resolve(configuredDirectory)
    : path.join(path.resolve(root), ".layang", "cli-results");
  await fsp.mkdir(directory, { recursive: true });
  const file = path.join(directory, `${summary.startedAt.replace(/[:.]/g, "-")}.json`);
  summary.savedResultPath = file;
  await fsp.writeFile(file, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return file;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function splitMethodKey(methodKey) {
  const slash = String(methodKey || "").lastIndexOf("/");
  return slash < 0 ? [String(methodKey || ""), ""] : [methodKey.slice(0, slash), methodKey.slice(slash + 1)];
}
function positive(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
function nonNegative(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function readPackageVersion() {
  try {
    return require(path.join(__dirname, "..", "package.json")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}
function displayGatewayHost(host) {
  return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

// Compatibility export and pinned-schema guard retained for integrations/tests.
async function invokeNativeGrpcFromWorkspace(workspace, item, options) {
  resolveProtoFilesForRunItem(workspace, item);
  return invokeNativeGrpc(workspace, item, options);
}
async function invokeWebSocketFromWorkspace(item, options, workspace = { project: {} }) {
  return invokeWebSocket(workspace, item, options);
}
function parseRequestJson(text) {
  return JSON.parse(text || "{}");
}
function findServiceDefinitionKey(serviceDefinition, protoMethodName) {
  const keys = Object.keys(serviceDefinition || {});
  return (
    keys.find((key) => key === protoMethodName) ||
    keys.find((key) => key.toLowerCase() === String(protoMethodName).toLowerCase()) ||
    protoMethodName
  );
}
function safeRelativePath(input) {
  return (
    String(input || "schema.proto")
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("/") || "schema.proto"
  );
}
function stripGrpcScheme(target) {
  return String(target || "").replace(/^grpcs?:\/\//, "");
}
function isSecureTarget(target) {
  return /^grpcs:\/\//.test(String(target || ""));
}

module.exports = {
  handleCli,
  runItems,
  writeReport,
  buildJUnit,
  invokeNativeGrpcFromWorkspace,
  invokeWebSocketFromWorkspace,
  parseRequestJson,
  splitMethodKey,
  findServiceDefinitionKey,
  safeRelativePath,
  stripGrpcScheme,
  isSecureTarget,
  assertStrictMockMatch,
  persistCliResult,
  assertionExpectsStatus,
};
