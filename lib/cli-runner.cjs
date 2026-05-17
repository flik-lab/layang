"use strict";

const _fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { readWorkspace, discoverRunItems, validateWorkspace, validateMockScenarios } = require("./cli-workspace.cjs");

async function handleCli(parsed, options = {}) {
  const stdout = options.stdout || process.stdout;
  const _stderr = options.stderr || process.stderr;

  if (parsed.command === "version") {
    stdout.write(`${readPackageVersion()}\n`);
    return 0;
  }

  if (parsed.command === "list") {
    const workspace = await readWorkspace(parsed.workspace || ".");
    const items = discoverRunItems(workspace, { method: parsed.flags.method || "" });
    if (parsed.flags.json) {
      stdout.write(`${JSON.stringify({ workspace: workspace.root, count: items.length, requests: items }, null, 2)}\n`);
    } else {
      stdout.write(`Workspace: ${workspace.root}\n`);
      if (!items.length) stdout.write("No saved requests found.\n");
      for (const item of items) stdout.write(`- ${item.methodKey}  ${item.title}\n`);
    }
    return 0;
  }

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

  if (parsed.command !== "run") {
    throw new Error(`Unsupported command: ${parsed.command}`);
  }

  const runOptions = normalizeRunOptionsFromParsed(parsed);
  if (runOptions.transport === "grpc-web") {
    throw new Error(
      "CLI execution currently supports native-grpc only. Use --transport native-grpc or run gRPC-Web from the desktop UI.",
    );
  }

  const workspace = await readWorkspace(runOptions.workspace);
  const validation = validateWorkspace(workspace);
  if (!validation.ok) {
    await writeValidation(validation, { json: runOptions.reporter === "json" }, stdout);
    return 1;
  }

  const items = discoverRunItems(workspace, runOptions);
  if (!items.length) throw new Error("No request tabs matched the run filters.");

  const startedAt = new Date().toISOString();
  const results = [];
  if (runOptions.reporter === "spec") {
    stdout.write(`Layang CLI running ${items.length} request(s) from ${workspace.root}\n`);
  }

  for (const item of items) {
    const started = Date.now();
    try {
      const result = await invokeNativeGrpcFromWorkspace(workspace, item, runOptions);
      const passed = result.statusCode === 0;
      const entry = {
        id: item.id,
        title: item.title,
        methodKey: item.methodKey,
        target: item.target,
        passed,
        statusCode: result.statusCode,
        statusMessage: result.statusMessage,
        durationMs: Date.now() - started,
        messages: result.messages,
        totalMessages: result.totalMessages,
      };
      results.push(entry);
      if (runOptions.reporter === "spec") {
        stdout.write(
          `${passed ? "✓" : "✕"} ${item.methodKey} (${entry.durationMs}ms)${passed ? "" : ` status ${entry.statusCode}: ${entry.statusMessage}`}\n`,
        );
      }
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

  await writeReport(summary, runOptions, stdout);
  return summary.failed === 0 ? 0 : 1;
}

function normalizeRunOptionsFromParsed(parsed) {
  const { normalizeRunOptions } = require("./cli-args.cjs");
  return normalizeRunOptions(parsed);
}

async function writeValidation(validation, flags, stdout) {
  if (flags.json) {
    stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
    return;
  }
  stdout.write(`${validation.ok ? "✓" : "✕"} Validation ${validation.ok ? "passed" : "failed"}\n`);
  for (const warning of validation.warnings || []) stdout.write(`warning: ${warning}\n`);
  for (const error of validation.errors || []) stdout.write(`error: ${error}\n`);
}

async function writeReport(summary, options, stdout) {
  const reporter = options.reporter || "spec";
  let content = "";
  if (reporter === "json") content = `${JSON.stringify(summary, null, 2)}\n`;
  if (reporter === "junit") content = buildJUnit(summary);
  if (options.output && content) {
    await fsp.mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
    await fsp.writeFile(path.resolve(options.output), content, "utf8");
  } else if (content) {
    stdout.write(content);
  }
  if (reporter === "spec") {
    stdout.write(`Done: ${summary.passed}/${summary.total} passed, ${summary.failed} failed.\n`);
  }
}

function buildJUnit(summary) {
  const failures = summary.results.filter((item) => !item.passed).length;
  const durationSeconds = summary.results.reduce((sum, item) => sum + Number(item.durationMs || 0), 0) / 1000;
  const cases = summary.results
    .map((item) => {
      const attrs = `classname="Layang.CLI" name="${escapeXml(item.methodKey)}" time="${Number(item.durationMs || 0) / 1000}"`;
      if (item.passed) return `    <testcase ${attrs}/>`;
      const message = escapeXml(item.error || item.statusMessage || "Request failed");
      return `    <testcase ${attrs}>\n      <failure message="${message}">${message}</failure>\n    </testcase>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${summary.total}" failures="${failures}" time="${durationSeconds}">\n  <testsuite name="Layang CLI" tests="${summary.total}" failures="${failures}" time="${durationSeconds}">\n${cases}\n  </testsuite>\n</testsuites>\n`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function invokeNativeGrpcFromWorkspace(workspace, item, options) {
  const grpc = require("@grpc/grpc-js");
  const protoLoader = require("@grpc/proto-loader");
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "layang-cli-proto-"));
  try {
    const rootFiles = [];
    for (const protoFile of workspace.project.protoFiles || []) {
      const relative = safeRelativePath(protoFile.name || "schema.proto");
      const filePath = path.join(tmpDir, relative);
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, String(protoFile.text || ""), "utf8");
      rootFiles.push(relative);
    }
    if (!rootFiles.length) throw new Error("No proto files found to load.");

    const packageDefinition = protoLoader.loadSync(rootFiles, {
      includeDirs: [tmpDir],
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const loadedPackage = grpc.loadPackageDefinition(packageDefinition);
    const [serviceName, methodName] = splitMethodKey(item.methodKey);
    const ServiceCtor = getByDottedPath(loadedPackage, serviceName);
    if (!ServiceCtor?.service) throw new Error(`Service ${serviceName} was not found in loaded proto files.`);
    const methodDefinitionKey = findServiceDefinitionKey(ServiceCtor.service, methodName);
    const definition = ServiceCtor.service[methodDefinitionKey];
    if (!definition) throw new Error(`Method ${item.methodKey} was not found in loaded proto files.`);
    if (definition.requestStream)
      throw new Error("CLI does not support client-streaming or bidi-streaming requests yet.");

    const target = stripGrpcScheme(item.target || options.target || "localhost:50051");
    const credentials = isSecureTarget(item.target || options.target)
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();
    const client = new ServiceCtor(target, credentials, {
      "grpc.max_receive_message_length": 50 * 1024 * 1024,
      "grpc.max_send_message_length": 50 * 1024 * 1024,
    });
    const request = parseRequestJson(item.requestJson);
    const metadata = createGrpcMetadata(grpc, item.metadata || []);
    const deadline = new Date(Date.now() + options.timeoutMs);
    const callOptions = { deadline };

    if (definition.responseStream) {
      return await invokeServerStream(client, methodDefinitionKey, request, metadata, callOptions, options.maxMessages);
    }
    return await invokeUnary(client, methodDefinitionKey, request, metadata, callOptions);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function invokeUnary(client, methodName, request, metadata, callOptions) {
  return new Promise((resolve) => {
    const started = Date.now();
    client[methodName](request, metadata, callOptions, (error, response) => {
      if (typeof client.close === "function") client.close();
      if (error) {
        resolve({
          statusCode: Number(error.code || 2),
          statusMessage: error.details || error.message || "Unknown gRPC error",
          durationMs: Date.now() - started,
          messages: [],
        });
        return;
      }
      resolve({
        statusCode: 0,
        statusMessage: "OK",
        durationMs: Date.now() - started,
        messages: [response],
        totalMessages: 1,
      });
    });
  });
}

function invokeServerStream(client, methodName, request, metadata, callOptions, maxMessages) {
  return new Promise((resolve) => {
    const started = Date.now();
    const messages = [];
    let totalMessages = 0;
    let settled = false;
    let status = { code: 0, details: "OK" };
    const call = client[methodName](request, metadata, callOptions);
    const finish = (nextStatus) => {
      if (settled) return;
      settled = true;
      if (typeof client.close === "function") client.close();
      resolve({
        statusCode: Number(nextStatus?.code || status.code || 0),
        statusMessage: nextStatus?.details || status.details || "OK",
        durationMs: Date.now() - started,
        messages,
        totalMessages,
      });
    };
    call.on("data", (message) => {
      totalMessages += 1;
      if (messages.length >= maxMessages) messages.shift();
      messages.push(message);
      if (totalMessages >= maxMessages && !call.cancelled) {
        // Capture enough messages for CI without leaving infinite streams open.
        call.cancel();
      }
    });
    call.on("status", (nextStatus) => {
      status = nextStatus || status;
      finish(status);
    });
    call.on("error", (error) => {
      finish({ code: Number(error.code || 2), details: error.details || error.message || "Unknown gRPC stream error" });
    });
    call.on("end", () => finish(status));
  });
}

function createGrpcMetadata(grpc, pairs) {
  const metadata = new grpc.Metadata();
  for (const pair of pairs || []) {
    if (!pair?.key) continue;
    metadata.add(String(pair.key), String(pair.value || ""));
  }
  return metadata;
}

function parseRequestJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (error) {
    throw new Error(`Request body is not valid JSON: ${error.message}`);
  }
}

function splitMethodKey(methodKey) {
  const slash = String(methodKey || "").lastIndexOf("/");
  if (slash < 0) throw new Error(`Invalid method key ${methodKey}. Expected service/method.`);
  return [methodKey.slice(0, slash), methodKey.slice(slash + 1)];
}

function getByDottedPath(root, dottedPath) {
  return String(dottedPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, key) => value?.[key], root);
}

function findServiceDefinitionKey(serviceDefinition, protoMethodName) {
  const keys = Object.keys(serviceDefinition || {});
  const exact = keys.find((key) => key === protoMethodName);
  if (exact) return exact;
  const lowerCamel = protoMethodName.charAt(0).toLowerCase() + protoMethodName.slice(1);
  const lower = keys.find((key) => key === lowerCamel);
  if (lower) return lower;
  const insensitive = keys.find((key) => key.toLowerCase() === String(protoMethodName).toLowerCase());
  return insensitive || lowerCamel;
}

function safeRelativePath(input) {
  const normalized = String(input || "schema.proto")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const parts = normalized.split("/").filter((part) => part && part !== "." && part !== "..");
  return parts.join("/") || "schema.proto";
}

function stripGrpcScheme(target) {
  return String(target || "").replace(/^grpcs?:\/\//, "");
}

function isSecureTarget(target) {
  return /^grpcs:\/\//.test(String(target || ""));
}

function readPackageVersion() {
  try {
    const packageJson = require(path.join(__dirname, "..", "package.json"));
    return packageJson.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

module.exports = {
  handleCli,
  writeReport,
  buildJUnit,
  invokeNativeGrpcFromWorkspace,
  parseRequestJson,
  splitMethodKey,
  findServiceDefinitionKey,
  safeRelativePath,
  stripGrpcScheme,
  isSecureTarget,
};
