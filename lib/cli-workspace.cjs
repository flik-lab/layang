"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { readGitWorkspace } = require("./git-workspace.cjs");
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
    grpcWebBaseUrl: "http://127.0.0.1:8080",
    nativeTarget: "127.0.0.1:50051",
  },
  {
    key: "testing",
    label: "Testing Env",
    grpcWebBaseUrl: "http://127.0.0.1:8081",
    nativeTarget: "127.0.0.1:50052",
  },
  {
    key: "prod",
    label: "Prod Env",
    grpcWebBaseUrl: "https://grpc.example.com",
    nativeTarget: "grpc.example.com:443",
  },
];

async function readWorkspace(workspaceDirectory) {
  const root = path.resolve(workspaceDirectory || ".");
  const gitWorkspace = await readGitWorkspace(root);
  if (gitWorkspace) {
    const project = { ...gitWorkspace.project };
    project.environments = mergeEnvironments(project.environments);
    project.collections = Array.isArray(project.collections) ? project.collections : [];
    project.protoFiles = Array.isArray(project.protoFiles) ? project.protoFiles : [];
    return {
      root,
      source: gitWorkspace.source,
      project,
      settings: gitWorkspace.settings || {},
      scenarios: Array.isArray(gitWorkspace.scenarios) ? gitWorkspace.scenarios : [],
      mockServer: gitWorkspace.mockServer || project.mockServer || {},
    };
  }
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
    sourceRequestId: record.sourceRequestId ? String(record.sourceRequestId) : undefined,
    grpc: normalizeGrpcBinding(record.grpc),
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
    restParams: Array.isArray(record.restParams) ? record.restParams : [],
    restPathParams: Array.isArray(record.restPathParams) ? record.restPathParams : [],
    restAuth: record.restAuth && typeof record.restAuth === "object" ? record.restAuth : undefined,
    restBodyType: String(record.restBodyType || "json"),
    formFields: Array.isArray(record.formFields) ? record.formFields : [],
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

  const manifest = await readJsonIfExists(path.join(scenariosDir, "manifest.json"));
  if (manifest && manifest.layout === "scenario-files-v1" && manifest.methods && typeof manifest.methods === "object") {
    for (const [key, entry] of Object.entries(manifest.methods)) {
      const descriptors =
        entry && typeof entry === "object" && entry.scenarios && typeof entry.scenarios === "object"
          ? entry.scenarios
          : {};
      const methodScenarios = [];
      const methodTexts = [];
      let methodFormat = "json";
      for (const descriptor of Object.values(descriptors)) {
        if (!descriptor || typeof descriptor !== "object" || !descriptor.file) continue;
        const relative = String(descriptor.file);
        if (relative.includes("..") || path.isAbsolute(relative)) continue;
        const filePath = path.join(scenariosDir, relative);
        const format = descriptor.format === "yaml" || descriptor.format === "yml" ? "yaml" : "json";
        const text = await fsp.readFile(filePath, "utf8");
        const parsed = parseDataFile(text, format);
        const fileScenarios = normalizeScenarioList(
          Array.isArray(parsed) ? parsed : parsed.scenarios || parsed.stubs || [parsed],
        );
        scenarios.push(...fileScenarios);
        methodScenarios.push(...fileScenarios);
        methodTexts.push(text);
        methodFormat = format;
      }
      if (methodScenarios.length) {
        methodFiles[key] = {
          file: "manifest.json",
          format: methodFormat,
          scenarioText: JSON.stringify({ version: 1, scenarios: methodScenarios }, null, 2),
        };
      }
    }
    return { methodFiles, scenarios };
  }

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
      ...env,
      key: String(env.key),
      label: String(env.label || env.key),
      grpcWebBaseUrl: String(env.grpcWebBaseUrl || env.grpc_web_base_url || ""),
      nativeTarget: String(env.nativeTarget || env.native_target || ""),
      restBaseUrl: String(env.restBaseUrl || env.rest_base_url || env.baseUrl || ""),
      websocketUrl: String(env.websocketUrl || env.websocket_url || ""),
      variables: env.variables && typeof env.variables === "object" ? env.variables : {},
    });
  }
  return Array.from(map.values());
}

function normalizeTransportMode(value) {
  if (value === "websocket") return "websocket";
  if (value === "grpc-web") return "grpc-web";
  return "native-grpc";
}

function normalizeGrpcBinding(binding) {
  if (!binding || typeof binding !== "object") return undefined;
  const libraryId = String(binding.libraryId || "").trim();
  const versionId = String(binding.versionId || "").trim();
  const methodFullName = String(binding.methodFullName || "").trim();
  if (!libraryId || !versionId || !methodFullName) return undefined;
  return {
    libraryId,
    versionId,
    methodFullName,
    requestType: String(binding.requestType || ""),
    responseType: String(binding.responseType || ""),
    methodSignatureHash: String(binding.methodSignatureHash || ""),
    schemaChecksum: String(binding.schemaChecksum || ""),
    versionPolicy: binding.versionPolicy === "latest-compatible" ? "latest-compatible" : "pinned",
    status: binding.status ? String(binding.status) : undefined,
  };
}

function resolveProtoVersion(project, binding) {
  const normalized = normalizeGrpcBinding(binding);
  if (!normalized) return null;
  const libraries = Array.isArray(project?.protoLibraries) ? project.protoLibraries : [];
  const library = libraries.find((item) => item && String(item.id) === normalized.libraryId);
  const version = Array.isArray(library?.versions)
    ? library.versions.find((item) => item && String(item.id) === normalized.versionId)
    : null;
  if (!library || !version) return null;
  const files = Array.isArray(version.files)
    ? version.files
        .filter((file) => file?.name && file.text)
        .map((file) => ({ name: String(file.name), text: String(file.text) }))
    : [];
  return { library, version, binding: normalized, files };
}

function resolveProtoFilesForRunItem(workspace, item) {
  const project = workspace?.project || {};
  if (item?.grpc) {
    const resolved = resolveProtoVersion(project, item.grpc);
    if (!resolved) {
      throw new Error(
        `Pinned proto version ${item.grpc.libraryId}/${item.grpc.versionId} was not found for ${item.methodKey || item.grpc.methodFullName}.`,
      );
    }
    if (!resolved.files.length) {
      throw new Error(
        `Pinned proto version ${resolved.library.name || resolved.library.id} ${resolved.version.version || resolved.version.id} has no proto files.`,
      );
    }
    return resolved.files;
  }
  return Array.isArray(project.protoFiles)
    ? project.protoFiles
        .filter((file) => file?.name && file.text)
        .map((file) => ({ name: String(file.name), text: String(file.text) }))
    : [];
}

function collectionRequestsToRunItems(collections) {
  const output = [];
  for (const collection of Array.isArray(collections) ? collections : []) {
    for (const request of Array.isArray(collection?.requests) ? collection.requests : []) {
      if (!request || typeof request !== "object") continue;
      const kind = request.kind === "websocket" ? "websocket" : request.kind === "grpc" ? "grpc" : "rest";
      output.push({
        id: String(request.id || `${collection.id || collection.name}/${request.name || "request"}`),
        requestId: String(request.id || ""),
        requestName: String(request.name || "Request"),
        collectionId: String(collection.id || ""),
        collectionName: String(collection.name || "Collection"),
        title: String(request.name || "Request"),
        serviceName: String(collection.name || "Collection"),
        sourceRequestId: String(request.id || ""),
        grpc: normalizeGrpcBinding(request.grpc),
        methodKey: String(
          request.grpc?.methodFullName || request.grpcMethodKey || request.id || `${collection.name}/${request.name}`,
        ),
        requestJson: typeof request.body === "string" ? request.body : JSON.stringify(request.body || {}, null, 2),
        metadata: Array.isArray(request.headers) ? request.headers : [],
        transportMode: kind === "websocket" ? "websocket" : kind === "grpc" ? "native-grpc" : "rest",
        requestKind: kind,
        requestUrl: String(request.url || ""),
        baseUrl: String(request.url || ""),
        httpMethod: String(request.method || (kind === "rest" ? "GET" : "")),
        restParams: Array.isArray(request.restParams) ? request.restParams : [],
        restPathParams: Array.isArray(request.restPathParams) ? request.restPathParams : [],
        restAuth: request.restAuth && typeof request.restAuth === "object" ? request.restAuth : undefined,
        restBodyType: String(request.restBodyType || "json"),
        formFields: Array.isArray(request.formFields) ? request.formFields : [],
        assertionJson: String(request.assertionJson || ""),
        nativeTarget: "",
        environmentKey: String(request.environmentKey || "default"),
      });
    }
  }
  return output;
}

function listProtoSchemas(project) {
  const libraries = Array.isArray(project?.protoLibraries) ? project.protoLibraries : [];
  return libraries.map((library) => ({
    id: String(library?.id || ""),
    name: String(library?.name || "Proto Schema"),
    defaultVersionId: String(library?.defaultVersionId || ""),
    lifecycle: String(library?.lifecycle || "active"),
    archivedAt: String(library?.archivedAt || ""),
    revisions: (Array.isArray(library?.versions) ? library.versions : []).map((version) => {
      const files = Array.isArray(version?.files) ? version.files : [];
      return {
        id: String(version?.id || ""),
        label: String(version?.version || version?.id || "Revision"),
        lifecycle: String(version?.lifecycle || "active"),
        archivedAt: String(version?.archivedAt || ""),
        isDefault: String(version?.id || "") === String(library?.defaultVersionId || ""),
        fileCount: files.length,
        files: files.map((file) => String(file?.name || "")).filter(Boolean),
        methods: discoverProtoMethods(files),
      };
    }),
  }));
}

function discoverProtoMethods(files) {
  const methods = [];
  for (const file of Array.isArray(files) ? files : []) {
    const text = String(file?.text || "");
    const packageName = text.match(/\bpackage\s+([\w.]+)\s*;/)?.[1] || "";
    for (const serviceMatch of text.matchAll(/service\s+([A-Za-z_][\w]*)\s*\{([\s\S]*?)\}/g)) {
      const service = serviceMatch[1];
      const body = serviceMatch[2];
      for (const methodMatch of body.matchAll(
        /rpc\s+([A-Za-z_][\w]*)\s*\((stream\s+)?([^)]*)\)\s*returns\s*\((stream\s+)?([^)]*)\)/g,
      )) {
        methods.push({
          file: String(file?.name || ""),
          service: packageName ? `${packageName}.${service}` : service,
          method: methodMatch[1],
          requestType: methodMatch[3].trim(),
          responseType: methodMatch[5].trim(),
          requestStream: Boolean(methodMatch[2]),
          responseStream: Boolean(methodMatch[4]),
        });
      }
    }
  }
  return methods;
}

function resolveTarget(project, options) {
  if (options.target) return options.target;
  const transport = options.transport || project.transportMode || "native-grpc";
  const envKey = options.env || project.environmentKey || "default";
  const fallbackBaseUrl = project.baseUrl || "http://127.0.0.1:8080";
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
          grpc: normalizeGrpcBinding(project.grpc),
          requestJson: project.requestJson || "{}",
          metadata: Array.isArray(project.metadata) ? project.metadata : [],
          transportMode: project.transportMode || "native-grpc",
          environmentKey: project.environmentKey || "default",
          baseUrl: project.baseUrl || "",
          nativeTarget: project.nativeTarget || "",
          requestKind: project.requestKind || "grpc",
          requestUrl: project.requestUrl || project.baseUrl || "",
          restParams: Array.isArray(project.restParams) ? project.restParams : [],
          restPathParams: Array.isArray(project.restPathParams) ? project.restPathParams : [],
          restAuth: project.restAuth,
          restBodyType: project.restBodyType || "json",
          assertionJson: project.assertionJson || "",
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
  const collectionFilter = String(options.collection || "")
    .trim()
    .toLowerCase();
  const requestFilter = String(options.request || "")
    .trim()
    .toLowerCase();
  return candidates
    .filter((item) => {
      const key = String(item.methodKey || "");
      const title = String(item.title || "");
      const collectionId = String(item.collectionId || "").toLowerCase();
      const collectionName = String(item.collectionName || item.serviceName || "").toLowerCase();
      const requestId = String(item.requestId || item.id || "").toLowerCase();
      const requestName = String(item.requestName || title).toLowerCase();
      const methodMatches =
        !methodFilter || key === methodFilter || key.endsWith(`/${methodFilter}`) || title === methodFilter;
      const collectionMatches =
        !collectionFilter || collectionId === collectionFilter || collectionName === collectionFilter;
      const requestMatches = !requestFilter || requestId === requestFilter || requestName === requestFilter;
      return methodMatches && collectionMatches && requestMatches;
    })
    .map((item, index) => {
      const requestedTransport =
        item.requestKind === "rest"
          ? "rest"
          : options.transportExplicit
            ? options.transport
            : item.requestKind === "websocket"
              ? "websocket"
              : normalizeTransportMode(item.transportMode || project.transportMode);
      const transportMode = requestedTransport || normalizeTransportMode(item.transportMode || project.transportMode);
      const requestKind = item.requestKind || (transportMode === "websocket" ? "websocket" : "grpc");
      const target =
        requestKind === "websocket" || transportMode === "websocket"
          ? options.target || item.requestUrl || item.baseUrl || project.requestUrl || project.baseUrl || ""
          : requestKind === "rest"
            ? options.target || item.requestUrl || item.baseUrl || ""
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
        sourceRequestId: item.sourceRequestId || undefined,
        grpc: normalizeGrpcBinding(item.grpc),
        methodKey:
          item.grpc?.methodFullName || item.methodKey || selectedMethodKey || item.id || `request-${index + 1}`,
        requestJson: item.requestJson || "{}",
        metadata: Array.isArray(item.metadata) ? item.metadata : [],
        transportMode,
        requestKind,
        target,
        httpMethod: item.httpMethod || "",
        assertionJson: String(item.assertionJson || ""),
        restParams: Array.isArray(item.restParams) ? item.restParams : [],
        restPathParams: Array.isArray(item.restPathParams) ? item.restPathParams : [],
        restAuth: item.restAuth && typeof item.restAuth === "object" ? item.restAuth : undefined,
        restBodyType: String(item.restBodyType || "json"),
        formFields: Array.isArray(item.formFields) ? item.formFields : [],
        environmentKey: String(options.env || item.environmentKey || project.environmentKey || "default"),
        collectionId: item.collectionId || "",
        collectionName: item.collectionName || item.serviceName || "",
        requestId: item.requestId || item.id || "",
        requestName: item.requestName || item.title || "",
      };
    });
}

function validateWorkspace(workspace) {
  const errors = [];
  const warnings = [];
  const project = workspace.project || {};
  const runItems = discoverRunItems(workspace, {});
  const hasWebSocket = runItems.some((item) => item.requestKind === "websocket" || item.transportMode === "websocket");
  const hasGrpc = runItems.some((item) => item.requestKind === "grpc");
  if (!workspace.root) errors.push("Workspace root is missing.");
  if (hasGrpc) {
    for (const item of runItems.filter((candidate) => candidate.requestKind === "grpc")) {
      try {
        const files = resolveProtoFilesForRunItem(workspace, item);
        if (!files.length) {
          errors.push(`No proto files found for ${item.methodKey}. Add proto files or repair its pinned binding.`);
        }
      } catch (error) {
        errors.push(error?.message ? error.message : String(error));
      }
    }
  }
  if (!hasGrpc && hasWebSocket && (!Array.isArray(project.protoFiles) || project.protoFiles.length === 0)) {
    warnings.push("No proto files found. WebSocket-only workspaces can still run through the CLI.");
  }
  if (!runItems.length) errors.push("No saved REST, WebSocket, or gRPC requests found to run.");
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
  const methodBindings = workspace.mockServer?.methodBindings;
  if (methodBindings && typeof methodBindings === "object") {
    for (const [key, binding] of Object.entries(methodBindings)) {
      if (enabled[key] === false) continue;
      const resolved = resolveProtoVersion(workspace.project || {}, binding);
      if (!resolved) errors.push(`Mock method ${key} references a missing proto library or version.`);
      else if (resolved.binding.methodFullName !== key) {
        errors.push(`Mock method ${key} is bound to ${resolved.binding.methodFullName}; repair the mock binding.`);
      }
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
  normalizeGrpcBinding,
  resolveProtoVersion,
  resolveProtoFilesForRunItem,
  listProtoSchemas,
  discoverProtoMethods,
  discoverRunItems,
  validateWorkspace,
  validateMockScenarios,
};
