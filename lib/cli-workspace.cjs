"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const {
  normalizeScenarioList,
  normalizeSelectedScenarioIds,
  normalizeEnabledMethods,
  hasValidRuntimeMatcher,
} = require("./mock-runtime.cjs");

const defaultEnvironments = [
  {
    key: "dev",
    label: "Develop Env",
    grpcWebBaseUrl: "http://127.0.0.1:9080/grpc/web",
    nativeTarget: "127.0.0.1:50051",
  },
  {
    key: "testing",
    label: "Testing Env",
    grpcWebBaseUrl: "http://127.0.0.1:9081/grpc/web",
    nativeTarget: "127.0.0.1:50052",
  },
  {
    key: "prod",
    label: "Prod Env",
    grpcWebBaseUrl: "https://grpc.example.com/grpc/web",
    nativeTarget: "grpc.example.com:443",
  },
];

async function readWorkspace(workspaceDirectory) {
  const root = path.resolve(workspaceDirectory || ".");
  const snapshot = await readJsonIfExists(path.join(root, "layang.workspace.json"));
  const project =
    snapshot?.project && typeof snapshot.project === "object"
      ? { ...snapshot.project }
      : (await readJsonIfExists(path.join(root, "project.json"))) || {};

  const [requestTabs, requestFiles, environments, collections, mockServer, protoFiles, splitMock] = await Promise.all([
    readJsonIfExists(path.join(root, "requests", "tabs.json")),
    readRequestFiles(path.join(root, "requests", "items")),
    readJsonIfExists(path.join(root, "environments", "environments.json")),
    readJsonIfExists(path.join(root, "collections", "collections.json")),
    readJsonIfExists(path.join(root, "mocks", "mock-server.json")),
    readProtoFiles(root, project.protoFiles),
    readSplitMockFiles(path.join(root, "mocks")),
  ]);

  project.requestTabs = requestFiles.length
    ? requestFiles
    : Array.isArray(requestTabs)
      ? requestTabs
      : Array.isArray(project.requestTabs)
        ? project.requestTabs
        : [];
  project.environments = mergeEnvironments(Array.isArray(environments) ? environments : project.environments);
  project.collections = Array.isArray(collections)
    ? collections
    : Array.isArray(project.collections)
      ? project.collections
      : [];
  project.protoFiles = protoFiles;
  project.mockServer = {
    ...(project.mockServer && typeof project.mockServer === "object" ? project.mockServer : {}),
    ...(mockServer && typeof mockServer === "object" ? mockServer : {}),
    methodFiles: splitMock.methodFiles,
  };

  return {
    root,
    source: snapshot ? "snapshot+split-files" : "split-files",
    project,
    settings: snapshot?.settings ? snapshot.settings : (await readJsonIfExists(path.join(root, "settings.json"))) || {},
    scenarios: splitMock.scenarios,
    mockServer: project.mockServer,
  };
}

async function readRequestFiles(requestItemsDir) {
  const output = [];
  if (!fs.existsSync(requestItemsDir)) return output;
  await walkDirectory(requestItemsDir, async (filePath) => {
    if (!/\.json$/i.test(filePath)) return;
    const record = await readJsonIfExists(filePath);
    const session = normalizeRequestFile(record);
    if (session) output.push(session);
  });
  return output.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function normalizeRequestFile(record) {
  if (!record || typeof record !== "object") return null;
  const methodKey = String(record.methodKey || "").trim();
  if (!methodKey) return null;
  const [, methodName] = methodKey.split("/");
  return {
    id: String(record.id || methodKey),
    title: String(record.title || methodName || methodKey),
    methodKey,
    requestJson:
      typeof record.requestJson === "string" ? record.requestJson : JSON.stringify(record.request || {}, null, 2),
    metadata: Array.isArray(record.metadata) ? record.metadata : [],
    transportMode: normalizeTransportMode(record.transportMode),
    requestKind: record.requestKind === "websocket" ? "websocket" : record.requestKind === "grpc" ? "grpc" : undefined,
    requestUrl: String(record.requestUrl || record.url || record.baseUrl || ""),
    httpMethod: String(record.httpMethod || record.method || ""),
    environmentKey: String(record.environmentKey || "default"),
    baseUrl: String(record.baseUrl || record.requestUrl || record.url || ""),
    nativeTarget: String(record.nativeTarget || ""),
    assertionJson: String(record.assertionJson || ""),
    responseTab: String(record.responseTab || "messages"),
    openedAt: String(record.openedAt || new Date().toISOString()),
    updatedAt: String(record.updatedAt || new Date().toISOString()),
  };
}

async function readProtoFiles(root, snapshotProtoFiles) {
  const protosDir = path.join(root, "protos");
  const files = [];
  if (fs.existsSync(protosDir)) {
    await walkDirectory(protosDir, async (filePath) => {
      if (!filePath.endsWith(".proto")) return;
      files.push({
        name: path.relative(protosDir, filePath).split(path.sep).join("/"),
        text: await fsp.readFile(filePath, "utf8"),
        filePath,
      });
    });
  }
  if (files.length) return files.sort((a, b) => a.name.localeCompare(b.name));
  return Array.isArray(snapshotProtoFiles)
    ? snapshotProtoFiles.filter((file) => file?.name && file.text).map((file) => ({ name: file.name, text: file.text }))
    : [];
}

async function readSplitMockFiles(mocksDir) {
  const scenariosDir = path.join(mocksDir, "scenarios");
  const methodFiles = {};
  const scenarios = [];
  if (!fs.existsSync(scenariosDir)) return { methodFiles, scenarios };
  await walkDirectory(scenariosDir, async (filePath) => {
    if (!/\.(json|ya?ml)$/i.test(filePath) || path.basename(filePath) === "manifest.json") return;
    const text = await fsp.readFile(filePath, "utf8");
    const format = /\.ya?ml$/i.test(filePath) ? "yaml" : "json";
    const parsed = parseDataFile(text, format);
    const fileScenarios = normalizeScenarioList(
      Array.isArray(parsed) ? parsed : parsed.scenarios || parsed.stubs || [],
    );
    scenarios.push(...fileScenarios);
    const relative = path.relative(scenariosDir, filePath).split(path.sep).join("/");
    for (const scenario of fileScenarios) {
      methodFiles[`${scenario.service}/${scenario.method}`] = { file: relative, format, scenarioText: text };
    }
  });
  return { methodFiles, scenarios };
}

function parseDataFile(text, format) {
  if (format === "json" || /^[\s\n\r]*[{[]/.test(String(text || ""))) return JSON.parse(text || "{}");
  return parseSimpleYaml(text);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
}

async function walkDirectory(directory, visitor) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walkDirectory(filePath, visitor);
    else await visitor(filePath);
  }
}

function mergeEnvironments(input) {
  const map = new Map(defaultEnvironments.map((env) => [env.key, env]));
  for (const env of input || []) {
    if (!env?.key) continue;
    map.set(env.key, {
      key: String(env.key),
      label: String(env.label || env.key),
      grpcWebBaseUrl: String(env.grpcWebBaseUrl || env.grpc_web_base_url || ""),
      nativeTarget: String(env.nativeTarget || env.native_target || ""),
    });
  }
  return Array.from(map.values());
}

function normalizeTransportMode(value) {
  if (value === "websocket") return "websocket";
  if (value === "grpc-web") return "grpc-web";
  return "native-grpc";
}

function collectionRequestsToRunItems(collections) {
  const output = [];
  for (const collection of Array.isArray(collections) ? collections : []) {
    for (const request of Array.isArray(collection?.requests) ? collection.requests : []) {
      if (!request || typeof request !== "object") continue;
      const kind = request.kind === "websocket" ? "websocket" : request.kind === "grpc" ? "grpc" : "rest";
      if (kind !== "websocket" && kind !== "grpc") continue;
      output.push({
        id: String(request.id || `${collection.id || collection.name}/${request.name || "request"}`),
        title: String(request.name || "Request"),
        serviceName: String(collection.name || "Collection"),
        methodKey: String(request.grpcMethodKey || request.id || `${collection.name}/${request.name}`),
        requestJson: typeof request.body === "string" ? request.body : JSON.stringify(request.body || {}, null, 2),
        metadata: Array.isArray(request.headers) ? request.headers : [],
        transportMode: kind === "websocket" ? "websocket" : "native-grpc",
        requestKind: kind,
        requestUrl: String(request.url || ""),
        baseUrl: String(request.url || ""),
        nativeTarget: "",
        environmentKey: "default",
      });
    }
  }
  return output;
}

function resolveTarget(project, options) {
  if (options.target) return options.target;
  const transport = options.transport || project.transportMode || "native-grpc";
  const envKey = options.env || project.environmentKey || "default";
  const fallbackBaseUrl = project.baseUrl || "http://localhost:9080/grpc/web";
  const fallbackNativeTarget = project.nativeTarget || "localhost:50051";
  if (envKey === "manual" || envKey === "default")
    return transport === "grpc-web" ? fallbackBaseUrl : fallbackNativeTarget;
  const env = mergeEnvironments(project.environments).find((item) => item.key === envKey);
  if (!env) return transport === "grpc-web" ? fallbackBaseUrl : fallbackNativeTarget;
  return transport === "grpc-web" ? env.grpcWebBaseUrl || fallbackBaseUrl : env.nativeTarget || fallbackNativeTarget;
}

function discoverRunItems(workspace, options = {}) {
  const project = workspace.project || {};
  const tabs = Array.isArray(project.requestTabs) ? project.requestTabs : [];
  const collectionItems = collectionRequestsToRunItems(project.collections || []);
  const selectedMethodKey = project.selectedMethodKey || "";
  const fallbackItem = selectedMethodKey
    ? [
        {
          id: "workspace-selected-method",
          title: selectedMethodKey.split("/").pop() || selectedMethodKey,
          methodKey: selectedMethodKey,
          requestJson: project.requestJson || "{}",
          metadata: Array.isArray(project.metadata) ? project.metadata : [],
          transportMode: project.transportMode || "native-grpc",
          environmentKey: project.environmentKey || "default",
          baseUrl: project.baseUrl || "",
          nativeTarget: project.nativeTarget || "",
          requestKind: project.requestKind || "grpc",
          requestUrl: project.requestUrl || project.baseUrl || "",
        },
      ]
    : [];
  const seen = new Set();
  const candidates = [
    ...tabs,
    ...collectionItems,
    ...(tabs.length || collectionItems.length ? [] : fallbackItem),
  ].filter((item) => {
    const id = String(item.id || item.methodKey || item.title || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const methodFilter = String(options.method || "");
  return candidates
    .filter((item) => {
      const key = String(item.methodKey || "");
      const title = String(item.title || "");
      return !methodFilter || key === methodFilter || key.endsWith(`/${methodFilter}`) || title === methodFilter;
    })
    .map((item, index) => {
      const transportMode = options.transport || normalizeTransportMode(item.transportMode || project.transportMode);
      const requestKind = item.requestKind || (transportMode === "websocket" ? "websocket" : "grpc");
      const target =
        requestKind === "websocket" || transportMode === "websocket"
          ? options.target || item.requestUrl || item.baseUrl || project.requestUrl || project.baseUrl || ""
          : options.target ||
            resolveTarget(
              {
                ...project,
                baseUrl: item.baseUrl || project.baseUrl,
                nativeTarget: item.nativeTarget || project.nativeTarget,
                environmentKey: options.env || item.environmentKey || project.environmentKey,
              },
              options,
            );
      return {
        id: item.id || `request-${index + 1}`,
        title: item.title || item.methodKey || `Request ${index + 1}`,
        serviceName: item.serviceName || "",
        methodKey: item.methodKey || selectedMethodKey || item.id || `request-${index + 1}`,
        requestJson: item.requestJson || "{}",
        metadata: Array.isArray(item.metadata) ? item.metadata : [],
        transportMode,
        requestKind,
        target,
      };
    });
}

function validateWorkspace(workspace) {
  const errors = [];
  const warnings = [];
  const project = workspace.project || {};
  const runItems = discoverRunItems(workspace, {});
  const hasWebSocket = runItems.some((item) => item.requestKind === "websocket" || item.transportMode === "websocket");
  const hasGrpc = runItems.some((item) => item.requestKind !== "websocket" && item.transportMode !== "websocket");
  if (!workspace.root) errors.push("Workspace root is missing.");
  if (hasGrpc && (!Array.isArray(project.protoFiles) || project.protoFiles.length === 0)) {
    errors.push("No proto files found for gRPC requests. Add files under protos/ or import proto files in the app.");
  }
  if (!hasGrpc && hasWebSocket && (!Array.isArray(project.protoFiles) || project.protoFiles.length === 0)) {
    warnings.push("No proto files found. WebSocket-only workspaces can still run through the CLI.");
  }
  if (!runItems.length) errors.push("No saved gRPC or WebSocket requests found to run.");
  const mock = validateMockScenarios(workspace);
  return {
    ok: errors.length === 0 && mock.errors.length === 0,
    errors: [...errors, ...mock.errors],
    warnings: [...warnings, ...mock.warnings],
  };
}

function validateMockScenarios(workspace) {
  const errors = [];
  const warnings = [];
  const scenarios = normalizeScenarioList(workspace.scenarios || []);
  const selected = normalizeSelectedScenarioIds(workspace.mockServer?.selectedScenarioIds || {});
  const enabled = normalizeEnabledMethods(workspace.mockServer?.enabledMethods || {});
  const byMethod = new Map();
  for (const scenario of scenarios) {
    const key = `${scenario.service}/${scenario.method}`;
    if (!byMethod.has(key)) byMethod.set(key, []);
    byMethod.get(key).push(scenario);
    if (!hasValidRuntimeMatcher(scenario.input)) {
      errors.push(`Scenario ${scenario.id} for ${key} has missing or invalid input matcher.`);
    }
  }
  for (const [key, scenarioId] of Object.entries(selected)) {
    if (enabled[key] === false) continue;
    const list = byMethod.get(key) || [];
    if (!list.some((scenario) => scenario.id === scenarioId)) {
      errors.push(`Selected scenario ${scenarioId} for ${key} does not exist.`);
    }
  }
  for (const [key, isEnabled] of Object.entries(enabled)) {
    if (isEnabled && !(byMethod.get(key) || []).length) {
      warnings.push(`Mock is enabled for ${key}, but no scenarios were found.`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, scenarioCount: scenarios.length };
}

/**
 * Parses the compact YAML subset generated by Layang scenario files.
 */
function parseSimpleYaml(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((raw) => ({ indent: (raw.match(/^ */) || [""])[0].length, text: raw.trim() }))
    .filter((line) => line.text && !line.text.startsWith("#"));
  if (!lines.length) return {};
  return parseYamlBlock(lines, 0, lines[0].indent)[0];
}

function parseYamlBlock(lines, index, indent) {
  const line = lines[index];
  if (!line || line.indent < indent) return [{}, index];
  if (line.text.startsWith("-")) return parseYamlArray(lines, index, indent);
  return parseYamlObject(lines, index, indent);
}

function parseYamlArray(lines, index, indent) {
  const output = [];
  let cursor = index;
  while (cursor < lines.length && lines[cursor].indent === indent && lines[cursor].text.startsWith("-")) {
    const itemText = lines[cursor].text.replace(/^[-]\s?/, "");
    if (!itemText) {
      const parsed = parseYamlBlock(lines, cursor + 1, indent + 2);
      output.push(parsed[0]);
      cursor = parsed[1];
      continue;
    }
    if (/^[^:]+:\s*/.test(itemText)) {
      const fakeLine = { indent: indent + 2, text: itemText };
      const parsed = parseYamlObject([fakeLine, ...lines.slice(cursor + 1)], 0, indent + 2);
      output.push(parsed[0]);
      cursor = cursor + parsed[1];
      continue;
    }
    output.push(parseYamlScalar(itemText));
    cursor += 1;
  }
  return [output, cursor];
}

function parseYamlObject(lines, index, indent) {
  const output = {};
  let cursor = index;
  while (cursor < lines.length && lines[cursor].indent === indent && !lines[cursor].text.startsWith("-")) {
    const match = lines[cursor].text.match(/^([^:]+):\s*(.*)$/);
    if (!match) {
      cursor += 1;
      continue;
    }
    const key = match[1].trim();
    const rest = match[2].trim();
    if (rest) {
      output[key] = parseYamlScalar(rest);
      cursor += 1;
      continue;
    }
    const next = lines[cursor + 1];
    if (!next || next.indent <= indent) {
      output[key] = {};
      cursor += 1;
      continue;
    }
    const parsed = parseYamlBlock(lines, cursor + 1, next.indent);
    output[key] = parsed[0];
    cursor = parsed[1];
  }
  return [output, cursor];
}

function parseYamlScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value.replace(/^['"]|['"]$/g, "");
}

module.exports = {
  defaultEnvironments,
  readWorkspace,
  readProtoFiles,
  readRequestFiles,
  readSplitMockFiles,
  parseDataFile,
  parseSimpleYaml,
  mergeEnvironments,
  resolveTarget,
  discoverRunItems,
  validateWorkspace,
  validateMockScenarios,
};
