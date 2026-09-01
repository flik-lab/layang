"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const { parseYaml, stringifyYaml } = require("./workspace-yaml.cjs");

const FILE_VERSION = 2;

function parseStructuredText(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return undefined;
  try {
    if (text.startsWith("{") || text.startsWith("[")) return JSON.parse(text);
    if (/^[A-Za-z_][\w.-]*\s*:/m.test(text)) return parseYaml(text);
  } catch {
    // Preserve invalid or intentionally plain text values verbatim.
  }
  return value;
}

function stringifyStructuredValue(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function normalizeMetadata(value) {
  if (Array.isArray(value)) return value;
  if (!isObject(value)) return [];
  return Object.entries(value).map(([key, item]) => ({ key, value: String(item ?? ""), enabled: true }));
}

function metadataToObject(value) {
  const rows = normalizeMetadata(value).filter((row) => row && row.enabled !== false && row.key);
  return Object.fromEntries(rows.map((row) => [String(row.key), String(row.value ?? "")]));
}

function encodeGrpcBinding(binding, fallbackMethod) {
  if (!isObject(binding) && !fallbackMethod) return undefined;
  const method = stringOr(binding?.methodFullName, fallbackMethod || "");
  if (!method && !binding?.libraryId && !binding?.versionId) return undefined;
  return compact({
    schema: compact({
      libraryId: optionalString(binding?.libraryId),
      revisionId: optionalString(binding?.versionId),
    }),
    method: optionalString(method),
    versionPolicy: binding?.versionPolicy === "latest-compatible" ? "latest-compatible" : "pinned",
  });
}

function decodeGrpcBinding(value, fallbackMethod) {
  if (!isObject(value)) return undefined;
  const schema = isObject(value.schema) ? value.schema : value;
  const methodFullName = stringOr(value.method, stringOr(value.methodFullName, fallbackMethod || ""));
  const libraryId = stringOr(schema.libraryId, value.libraryId || "");
  const versionId = stringOr(schema.revisionId, stringOr(schema.versionId, value.versionId || ""));
  if (!methodFullName && !libraryId && !versionId) return undefined;
  return {
    libraryId,
    versionId,
    methodFullName,
    requestType: stringOr(value.requestType, ""),
    responseType: stringOr(value.responseType, ""),
    methodSignatureHash: stringOr(value.methodSignatureHash, ""),
    schemaChecksum: stringOr(value.schemaChecksum, ""),
    versionPolicy: value.versionPolicy === "latest-compatible" ? "latest-compatible" : "pinned",
    status: optionalString(value.status),
  };
}

function encodeRequestDocument(request, context = {}) {
  const kind = normalizeKind(request.kind);
  const bodyValue = parseStructuredText(request.body);
  const assertions = parseStructuredText(request.assertionJson);
  const mockResponse = parseStructuredText(request.mockResponse);
  const knownRequestKeys = new Set([
    "id",
    "collectionId",
    "parentId",
    "order",
    "name",
    "kind",
    "method",
    "url",
    "grpcMethodKey",
    "grpc",
    "body",
    "headers",
    "restParams",
    "restPathParams",
    "restAuth",
    "restBodyType",
    "formFields",
    "assertionJson",
    "environmentKey",
    "defaultEnvironmentKey",
    "transportMode",
    "nativeTarget",
    "timeoutMs",
    "streamIdleTimeoutMs",
    "mockResponse",
    "createdAt",
    "updatedAt",
    "extensions",
  ]);
  const unknown = collectUnknown(request, knownRequestKeys);
  const extensions = mergeObjects(request.extensions, unknown);
  const defaults = compact({ environment: optionalString(request.defaultEnvironmentKey) });
  const transport = compact({
    mode: optionalString(request.transportMode),
    nativeTargetRef: optionalString(context.nativeTargetRef),
  });
  const requestPayload = compact({
    method: optionalString(request.method),
    url: optionalString(request.url),
    grpc: encodeGrpcBinding(request.grpc, request.grpcMethodKey),
    timeoutMs: finiteOrUndefined(request.timeoutMs),
    streamIdleTimeoutMs: finiteOrUndefined(request.streamIdleTimeoutMs),
    body: bodyValue,
    headers: normalizeMetadata(request.headers),
    params: compact({ query: normalizeMetadata(request.restParams), path: normalizeMetadata(request.restPathParams) }),
    auth: isObject(request.restAuth) ? request.restAuth : undefined,
    bodyType: optionalString(request.restBodyType),
    formFields: Array.isArray(request.formFields) && request.formFields.length ? request.formFields : undefined,
    assertions,
    defaults: Object.keys(defaults).length ? defaults : undefined,
    transport: Object.keys(transport).length ? transport : undefined,
    mockResponse,
    extensions: Object.keys(extensions).length ? extensions : undefined,
  });
  return {
    version: FILE_VERSION,
    kind: "request",
    info: compact({
      id: request.id,
      name: stringOr(request.name, "Request"),
      protocol: kind,
      order: normalizeOrder(request.order),
    }),
    request: requestPayload,
  };
}

function decodeRequestDocument(doc, kindFromName, localEnvironment) {
  const info = isObject(doc?.info) ? doc.info : {};
  const value = isObject(doc?.request) ? doc.request : {};
  const legacy = Number(doc?.version || 1) < 2 || !doc?.kind;
  const params = isObject(value.params) ? value.params : {};
  const defaults = isObject(value.defaults) ? value.defaults : {};
  const transport = isObject(value.transport) ? value.transport : {};
  const kind = normalizeKind(info.protocol || info.type || kindFromName);
  const bodyRaw = value.bodyText !== undefined ? value.bodyText : value.body;
  const assertionsRaw = value.assertions !== undefined ? value.assertions : value.assertionJson;
  const environmentKey =
    optionalString(localEnvironment) || optionalString(defaults.environment) || optionalString(value.environmentKey);
  return {
    info,
    request: {
      method: optionalString(value.method),
      url: stringOr(value.url, ""),
      grpcMethodKey: optionalString(value.grpcMethodKey || value.grpc?.method || value.grpc?.methodFullName),
      grpc: decodeGrpcBinding(value.grpc, value.grpcMethodKey),
      timeoutMs: finiteOrUndefined(value.timeoutMs),
      streamIdleTimeoutMs: finiteOrUndefined(value.streamIdleTimeoutMs),
      body: stringifyStructuredValue(bodyRaw, "{}"),
      headers: normalizeMetadata(value.headers),
      restParams: normalizeMetadata(legacy ? value.restParams : params.query),
      restPathParams: normalizeMetadata(legacy ? value.restPathParams : params.path),
      restAuth: isObject(legacy ? value.restAuth : value.auth) ? (legacy ? value.restAuth : value.auth) : undefined,
      restBodyType: optionalString(legacy ? value.restBodyType : value.bodyType),
      formFields: Array.isArray(value.formFields) ? value.formFields : [],
      assertionJson: stringifyStructuredValue(assertionsRaw, ""),
      environmentKey,
      defaultEnvironmentKey: optionalString(defaults.environment),
      transportMode: optionalString(legacy ? value.transportMode : transport.mode),
      nativeTarget: optionalString(legacy ? value.nativeTarget : transport.nativeTarget),
      nativeTargetRef: optionalString(transport.nativeTargetRef),
      mockResponse: stringifyStructuredValue(value.mockResponse, ""),
      extensions: mergeObjects(
        isObject(value.extensions) ? value.extensions : {},
        collectUnknown(
          value,
          new Set([
            "method",
            "url",
            "grpcMethodKey",
            "grpc",
            "timeoutMs",
            "streamIdleTimeoutMs",
            "body",
            "bodyText",
            "headers",
            "params",
            "restParams",
            "restPathParams",
            "auth",
            "restAuth",
            "bodyType",
            "restBodyType",
            "formFields",
            "assertions",
            "assertionJson",
            "environmentKey",
            "defaults",
            "transport",
            "transportMode",
            "nativeTarget",
            "mockResponse",
            "extensions",
          ]),
        ),
      ),
    },
    order: Number.isFinite(Number(info.order)) ? Number(info.order) : undefined,
    legacy,
    kind,
  };
}

function encodeExampleDocument(example) {
  const requestRef = isObject(example.requestRef)
    ? example.requestRef
    : compact({ id: optionalString(example.requestId), method: optionalString(example.methodKey) });
  const known = new Set([
    "id",
    "name",
    "requestId",
    "requestRef",
    "methodKey",
    "serviceName",
    "methodName",
    "requestJson",
    "metadata",
    "expectedJson",
    "expectedStatus",
    "expectedTrailers",
    "assertions",
    "tags",
    "enabled",
    "documentation",
    "createdAt",
    "updatedAt",
    "extensions",
  ]);
  const extensions = mergeObjects(example.extensions, collectUnknown(example, known));
  return {
    version: FILE_VERSION,
    kind: "example",
    example: compact({
      id: example.id,
      name: stringOr(example.name, "Example"),
      enabled: example.enabled !== false,
      requestRef: Object.keys(requestRef).length ? requestRef : undefined,
      display: !requestRef.id
        ? compact({ service: optionalString(example.serviceName), method: optionalString(example.methodName) })
        : undefined,
      input: compact({
        metadata: normalizeMetadata(example.metadata),
        body: parseStructuredText(example.requestJson),
      }),
      expected: compact({
        status: optionalString(example.expectedStatus),
        headers: undefined,
        trailers: normalizeMetadata(example.expectedTrailers),
        body: parseStructuredText(example.expectedJson),
      }),
      assertions: parseStructuredText(example.assertions),
      tags: Array.isArray(example.tags) && example.tags.length ? example.tags : undefined,
      documentation: isObject(example.documentation) ? example.documentation : undefined,
      extensions: Object.keys(extensions).length ? extensions : undefined,
    }),
  };
}

function decodeExampleDocument(doc) {
  const value = isObject(doc?.example) ? doc.example : {};
  const legacy = Number(doc?.version || 1) < 2 || !doc?.kind;
  if (legacy) return value;
  const requestRef = isObject(value.requestRef) ? value.requestRef : {};
  const display = isObject(value.display) ? value.display : {};
  const input = isObject(value.input) ? value.input : {};
  const expected = isObject(value.expected) ? value.expected : {};
  return {
    id: value.id,
    name: value.name,
    requestId: optionalString(requestRef.id),
    requestRef,
    methodKey: optionalString(requestRef.method),
    serviceName: stringOr(display.service, ""),
    methodName: stringOr(display.method, ""),
    requestJson: stringifyStructuredValue(input.body, "{}"),
    metadata: normalizeMetadata(input.metadata),
    expectedJson: stringifyStructuredValue(expected.body, "{}"),
    expectedStatus: optionalString(expected.status),
    expectedTrailers: normalizeMetadata(expected.trailers),
    assertions: stringifyStructuredValue(value.assertions, ""),
    tags: Array.isArray(value.tags) ? value.tags : [],
    enabled: value.enabled !== false,
    documentation: isObject(value.documentation) ? value.documentation : undefined,
    extensions: mergeObjects(
      isObject(value.extensions) ? value.extensions : {},
      collectUnknown(
        value,
        new Set([
          "id",
          "name",
          "enabled",
          "requestRef",
          "display",
          "input",
          "expected",
          "assertions",
          "tags",
          "documentation",
          "extensions",
        ]),
      ),
    ),
  };
}

function encodeScenarioDocument(scenario, protocol) {
  const match = compact({
    method: protocol === "rest" ? optionalString(scenario.method) : undefined,
    path: optionalString(scenario.path),
    query: normalizeMetadata(scenario.matchQuery),
    headers: normalizeMetadata(scenario.matchHeaders),
    body: compact({
      contains: parseStructuredText(scenario.matchBodyContains),
      jsonPath: optionalString(scenario.matchJsonPath),
      equals: parseStructuredText(scenario.matchJsonEquals),
    }),
  });
  const stream =
    protocol === "websocket"
      ? compact({
          intervalMs: finiteOrUndefined(scenario.intervalMs),
          loop: scenario.loop === true,
          onConnect: scenario.streamOnConnect !== false,
          onMessage: scenario.streamOnMessage !== false,
        })
      : undefined;
  const responseBody = parseStructuredText(
    protocol === "websocket" ? (scenario.responseText ?? scenario.body) : scenario.body,
  );
  return {
    version: FILE_VERSION,
    kind: "mock-scenario",
    scenario: compact({
      id: scenario.id,
      name: stringOr(scenario.name, "Scenario"),
      protocol,
      enabled: scenario.enabled !== false,
      priority: finiteOrUndefined(scenario.priority),
      requestRef: optionalString(scenario.requestId) ? { id: scenario.requestId } : undefined,
      match,
      response: compact({
        status: protocol === "rest" ? finiteOrUndefined(scenario.status) : optionalString(scenario.status),
        headers: normalizeMetadata(scenario.headers),
        body: responseBody,
        delayMs: finiteOrUndefined(scenario.delayMs),
      }),
      stream,
      extensions: isObject(scenario.extensions) ? scenario.extensions : undefined,
    }),
  };
}

function decodeScenarioDocument(doc, protocol) {
  const value = isObject(doc?.scenario) ? doc.scenario : {};
  const legacy = Number(doc?.version || 1) < 2 || !doc?.kind;
  if (legacy) return value;
  const match = isObject(value.match) ? value.match : {};
  const response = isObject(value.response) ? value.response : {};
  const bodyMatch = isObject(match.body) ? match.body : {};
  const stream = isObject(value.stream) ? value.stream : {};
  return compact({
    id: value.id,
    requestId: value.requestRef?.id,
    name: value.name,
    enabled: value.enabled !== false,
    priority: value.priority,
    method: match.method,
    path: match.path,
    status: response.status,
    headers: normalizeMetadata(response.headers),
    body: stringifyStructuredValue(response.body, ""),
    responseText: protocol === "websocket" ? stringifyStructuredValue(response.body, "") : undefined,
    delayMs: response.delayMs,
    matchQuery: normalizeMetadata(match.query),
    matchHeaders: normalizeMetadata(match.headers),
    matchBodyContains: stringifyStructuredValue(bodyMatch.contains, ""),
    matchJsonPath: bodyMatch.jsonPath,
    matchJsonEquals: stringifyStructuredValue(bodyMatch.equals, ""),
    intervalMs: stream.intervalMs,
    loop: stream.loop === true,
    streamOnConnect: stream.onConnect !== false,
    streamOnMessage: stream.onMessage !== false,
    extensions: mergeObjects(
      isObject(value.extensions) ? value.extensions : {},
      collectUnknown(
        value,
        new Set([
          "id",
          "requestRef",
          "name",
          "protocol",
          "enabled",
          "priority",
          "match",
          "response",
          "stream",
          "extensions",
        ]),
      ),
    ),
  });
}

function encodeGrpcMockDocument(methodKey, methodFile, parser) {
  const parsed = parser(methodFile);
  if (parsed?.invalidSource) {
    throw new Error(`Invalid gRPC mock scenario source for ${methodKey}; refusing to replace it with an empty file.`);
  }
  const [service, method] = splitMethodKey(methodKey);
  return {
    version: FILE_VERSION,
    kind: "grpc-mock",
    method: { service, name: method },
    scenarios: parsed.scenarios,
    settings: compact({ format: methodFile?.format === "yaml" ? "yaml" : "json" }),
  };
}

function decodeGrpcMockDocument(doc) {
  const method = isObject(doc?.method) ? doc.method : {};
  const methodKey =
    typeof doc?.method === "string"
      ? doc.method
      : `${stringOr(method.service, "")}/${stringOr(method.name, "")}`.replace(/^\//, "");
  const scenarios = Array.isArray(doc?.scenarios)
    ? doc.scenarios
    : Array.isArray(doc?.mock?.scenarios)
      ? doc.mock.scenarios
      : [];
  const format = doc?.settings?.format === "yaml" || doc?.mock?.format === "yaml" ? "yaml" : "json";
  const scenarioText =
    format === "yaml" ? stringifyYaml({ version: 1, scenarios }) : JSON.stringify({ version: 1, scenarios }, null, 2);
  if (isObject(doc?.mock) && typeof doc.mock.scenarioText === "string") {
    return { methodKey, methodFile: doc.mock, scenarios: parseScenarioBundle(doc.mock).scenarios };
  }
  return { methodKey, methodFile: { format, scenarioText }, scenarios };
}

function parseScenarioBundle(methodFile) {
  const raw = typeof methodFile?.scenarioText === "string" ? methodFile.scenarioText : "";
  if (!raw.trim()) return { scenarios: [] };
  try {
    const parsed = methodFile?.format === "yaml" ? parseYaml(raw) : JSON.parse(raw);
    return {
      scenarios: Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.scenarios)
          ? parsed.scenarios
          : Array.isArray(parsed?.stubs)
            ? parsed.stubs
            : [],
    };
  } catch {
    return { scenarios: [], invalidSource: raw };
  }
}

function sanitizeProtoSource(source, revisionId) {
  if (!isObject(source)) return { tracked: { type: "local-files" }, localPath: undefined };
  if (source.type !== "directory" || !source.path) return { tracked: source, localPath: undefined };
  const sourcePath = String(source.path);
  if (!path.isAbsolute(sourcePath)) return { tracked: source, localPath: undefined };
  return {
    tracked: { type: "directory", name: path.basename(sourcePath), localRef: `proto-source:${revisionId}` },
    localPath: sourcePath,
  };
}

function restoreProtoSource(source, localPaths) {
  if (!isObject(source)) return { type: "local-files" };
  if (source.type === "directory" && source.localRef && localPaths?.[source.localRef]) {
    return { type: "directory", path: localPaths[source.localRef] };
  }
  return source;
}

function sanitizeSecurityPaths(security, prefix) {
  if (!isObject(security)) return { tracked: security, paths: {} };
  const tracked = { ...security };
  const paths = {};
  const mappings = [
    ["certificatePath", "certificateRef", "certificate"],
    ["privateKeyPath", "privateKeyRef", "private-key"],
    ["clientCaPath", "clientCaRef", "client-ca"],
    ["caPath", "caRef", "ca"],
    ["pfxPath", "pfxRef", "pfx"],
  ];
  for (const [pathKey, refKey, suffix] of mappings) {
    const value = tracked[pathKey];
    if (!value || !path.isAbsolute(String(value))) continue;
    const ref = `${prefix}:${suffix}`;
    paths[ref] = String(value);
    delete tracked[pathKey];
    tracked[refKey] = ref;
  }
  return { tracked, paths };
}

function restoreSecurityPaths(security, localPaths) {
  if (!isObject(security)) return security;
  const value = { ...security };
  const mappings = [
    ["certificatePath", "certificateRef"],
    ["privateKeyPath", "privateKeyRef"],
    ["clientCaPath", "clientCaRef"],
    ["caPath", "caRef"],
    ["pfxPath", "pfxRef"],
  ];
  for (const [pathKey, refKey] of mappings) {
    const ref = value[refKey];
    if (ref && localPaths?.[ref]) value[pathKey] = localPaths[ref];
  }
  return value;
}

function collectStandaloneComments(text) {
  const comments = [];
  for (const raw of String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("#") && trimmed !== "# Preserved workspace comments") comments.push(trimmed);
    else {
      const index = raw.indexOf(" #");
      if (index >= 0) comments.push(`# Preserved inline comment: ${raw.slice(index + 2).trim()}`);
    }
  }
  return [...new Set(comments)];
}

function preserveYamlComments(existingText, generatedText) {
  const comments = collectStandaloneComments(existingText);
  if (!comments.length) return generatedText;
  const body = String(generatedText || "").replace(/^# Preserved workspace comments[\s\S]*?\n\n/, "");
  return `# Preserved workspace comments\n${comments.join("\n")}\n\n${body}`;
}

function splitMethodKey(value) {
  const text = String(value || "");
  const index = text.lastIndexOf("/");
  return index >= 0 ? [text.slice(0, index), text.slice(index + 1)] : [text, ""];
}

function normalizeKind(value) {
  return value === "grpc" ? "grpc" : value === "websocket" ? "websocket" : "rest";
}

function normalizeOrder(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function collectUnknown(value, known) {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => !known.has(key) && item !== undefined));
}

function mergeObjects(...values) {
  return Object.assign({}, ...values.filter(isObject));
}

function finiteOrUndefined(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function stringOr(value, fallback) {
  return typeof value === "string" && value.length ? value : fallback;
}
function optionalString(value) {
  return typeof value === "string" && value.length ? value : undefined;
}
function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) =>
        item !== undefined && !(isObject(item) && !Object.keys(item).length) && !(Array.isArray(item) && !item.length),
    ),
  );
}
function stableId(prefix, value) {
  return `${prefix}-${crypto
    .createHash("sha1")
    .update(String(value || prefix))
    .digest("hex")
    .slice(0, 12)}`;
}

module.exports = {
  FILE_VERSION,
  parseStructuredText,
  stringifyStructuredValue,
  normalizeMetadata,
  metadataToObject,
  encodeRequestDocument,
  decodeRequestDocument,
  encodeExampleDocument,
  decodeExampleDocument,
  encodeScenarioDocument,
  decodeScenarioDocument,
  encodeGrpcMockDocument,
  decodeGrpcMockDocument,
  parseScenarioBundle,
  sanitizeProtoSource,
  restoreProtoSource,
  sanitizeSecurityPaths,
  restoreSecurityPaths,
  preserveYamlComments,
  collectStandaloneComments,
  splitMethodKey,
  stableId,
};
