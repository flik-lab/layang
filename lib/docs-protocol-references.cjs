"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { allocateSlugs } = require("./docs-publication-paths.cjs");
const { parseYaml } = require("./workspace-yaml.cjs");

function table(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/[<>&|[\]`]/g, character =>
    `&#${character.charCodeAt(0)};`);
}

function relativeLink(from, to) {
  return path.posix.relative(path.posix.dirname(from), to).split("/").map(segment => encodeURIComponent(segment)).join("/");
}

function repositoryBaseUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash)
      return url.href.replace(/\/+$/, "");
  } catch { /* an absent or invalid base leaves source names unlinked in HTML */ }
  return "";
}

async function protoSources(root) {
  const sources = new Map();
  const entries = async directory => {
    try { return await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  };
  const read = async file => {
    try { return parseYaml(await fs.readFile(path.join(root, file), "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  for (const libraryDir of await entries(path.join(root, "protos"))) {
    if (!libraryDir.isDirectory()) continue;
    const library = path.posix.join("protos", libraryDir.name);
    const libraryId = (await read(path.posix.join(library, "library.yml")))?.library?.id;
    if (!libraryId) continue;
    const revisions = path.posix.join(library, "revisions");
    for (const revisionDir of await entries(path.join(root, revisions))) {
      if (!revisionDir.isDirectory()) continue;
      const revision = path.posix.join(revisions, revisionDir.name);
      const revisionId = (await read(path.posix.join(revision, "revision.yml")))?.revision?.id;
      if (revisionId) sources.set(JSON.stringify([libraryId, revisionId]), path.posix.join(revision, "files"));
    }
  }
  return sources;
}

function scenarioRows(items, link) {
  return [
    "| Scenario | Delivery | Responses | Enabled |",
    "|---|---|---:|---|",
    ...items.map(item => "| " + link(item.name, item.fileRef) + " | " +
      table(item.executionMode) + " | " + item.responseCount + " | " + (item.enabled ? "Yes" : "No") + " |"),
  ].join("\n");
}

function featuredScenarios(items) {
  const active = items.filter(item => item.enabled);
  const modes = new Set();
  const selected = [];
  for (const item of active) {
    if (modes.has(item.executionMode)) continue;
    modes.add(item.executionMode);
    selected.push(item);
    if (selected.length === 3) return selected;
  }
  for (const item of active) {
    if (!selected.includes(item)) selected.push(item);
    if (selected.length === 3) break;
  }
  return selected;
}

function protoExample(fields) {
  const fieldsByName = new Map();
  const oneofs = new Set();
  for (const field of fields || []) {
    if (field.name.includes(".") || (field.oneof && oneofs.has(field.oneof))) continue;
    if (field.oneof) oneofs.add(field.oneof);
    const type = field.type;
    let value = field.enumValues?.[0]?.name ?? "";
    if (field.repeated) value = [];
    else if (field.nestedType || type.startsWith("map<")) value = {};
    else if (type === "bool") value = false;
    else if (/64$/.test(type)) value = "0";
    else if (/^(?:[us]?int32|sint32|s?fixed32|float|double)$/.test(type)) value = 0;
    fieldsByName.set(field.name.replace(/\[\]$/, ""), value);
    if (fieldsByName.size === 5) break;
  }
  return JSON.stringify(Object.fromEntries(fieldsByName), null, 2);
}

async function buildGrpcReference(root, methods, scenarios, renderHtml, sourceBaseUrl) {
  const markdown = new Map();
  const site = {};
  if (!methods.length && !scenarios.length) return { markdown, site };
  const services = new Map();
  const add = (key, method) => {
    const [service, rpc] = key.split("/");
    if (!service || !rpc) return;
    if (!services.has(service)) services.set(service, new Map());
    if (!services.get(service).has(rpc)) services.get(service).set(rpc, { id: rpc, title: rpc, method, scenarios: [] });
  };
  for (const method of methods) add(method.fullName, method);
  for (const item of scenarios) {
    add(item.methodKey);
    const [service, rpc] = item.methodKey.split("/");
    services.get(service)?.get(rpc)?.scenarios.push(item);
  }
  const sources = await protoSources(root);
  const serviceNames = allocateSlugs([...services.keys()].map(id => ({ id, title: id.split(".").at(-1) })), ["index"]);
  const repo = repositoryBaseUrl(sourceBaseUrl);
  const emit = (relative, title, content) => {
    const current = `docs/published/${relative}.md`;
    const source = (name, file, html) => {
      if (!file) return table(name);
      if (!html) return `[${table(name)}](<${relativeLink(current, file)}>)`;
      if (!repo) return table(name);
      return `[${table(name)}](${repo}/${file.split("/").map(encodeURIComponent).join("/")})`;
    };
    const nav = (name, target, html) => "[" + table(name) + "](" +
      relativeLink(relative + (html ? ".html" : ".md"), target + (html ? ".html" : ".md")) + ")";
    markdown.set(current, content(false, (name, file) => source(name, file, false), (name, target) => nav(name, target, false)));
    const html = content(true, (name, file) => source(name, file, true), (name, target) => nav(name, target, true));
    const home = relativeLink(`${relative}.html`, "index.html");
    const css = relativeLink(`${relative}.html`, "assets/docs.css");
    site[`${relative}.html`] = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' +
      table(title) + '</title><link rel="stylesheet" href="' + css + '"><body><main><article><a href="' + home +
      '">Workspace documentation</a>' + renderHtml(html) + '</article></main></body></html>\n';
  };
  const ordered = [...services.keys()].sort();
  emit("grpc/index", "gRPC reference", (_html, _source, nav) =>
    `# gRPC reference\n\n${ordered.map(service => `- ${nav(service, `grpc/${serviceNames.get(service)}/index`)}`).join("\n")}\n`);
  for (const service of ordered) {
    const rpcs = [...services.get(service).values()].sort((a, b) => a.id.localeCompare(b.id, "en"));
    const base = `grpc/${serviceNames.get(service)}`;
    const rpcNames = allocateSlugs(rpcs, ["index"]);
    for (const rpc of rpcs) {
      rpc.scenarios.sort((a, b) => a.name.localeCompare(b.name, "en") || a.scenarioId.localeCompare(b.scenarioId, "en"));
      const sourceRoot = rpc.method && sources.get(JSON.stringify([rpc.method.libraryId, rpc.method.versionId]));
      const file = sourceRoot && path.posix.join(sourceRoot, rpc.method.sourceFile.replaceAll("\\", "/"));
      if (file?.startsWith(`${sourceRoot}/`)) {
        try { if ((await fs.stat(path.join(root, file))).isFile()) rpc.protoFile = file; }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      const pageSize = 100;
      const count = Math.ceil(rpc.scenarios.length / pageSize);
      if (!count) continue;
      const folder = `${base}/${rpcNames.get(rpc.id)}/scenarios`;
      const catalog = index => folder + (index === 0 ? "/index" : `/page-${index + 1}`);
      rpc.catalog = catalog(0);
      for (let index = 0; index < count; index++) {
        const items = rpc.scenarios.slice(index * pageSize, (index + 1) * pageSize);
        emit(catalog(index), `${rpc.title} scenarios`, (_html, source, nav) =>
          "# " + table(rpc.title) + " scenarios\n\n" + nav(service, `${base}/index`) + "\n\n" +
          "Page " + (index + 1) + " of " + count + " (" + rpc.scenarios.length + " scenarios)\n\n" +
          [index > 0 && nav("Previous page", catalog(index - 1)), index + 1 < count && nav("Next page", catalog(index + 1))].filter(Boolean).join(" | ") +
          "\n\n" + scenarioRows(items, source) + "\n");
      }
    }
    emit(`${base}/index`, service, (_html, source, nav) => {
      const lines = [`# ${table(service)}`, "", nav("gRPC reference", "grpc/index"), "",
        "| RPC | Request | Response | Streaming | Scenarios |", "|---|---|---|---|---:|"];
      for (const rpc of rpcs) {
        const method = rpc.method;
        const streaming = !method ? "Unknown" : method.requestStream ? method.responseStream ? "Bidirectional" : "Client" :
          method.responseStream ? "Server" : "Unary";
        lines.push("| " + table(rpc.title) + " | " + table(method?.requestType || "Unknown") + " | " +
          table(method?.responseType || "Unknown") + " | " + streaming + " | " + rpc.scenarios.length + " |");
      }
      for (const rpc of rpcs) {
        lines.push("", `## ${table(rpc.title)}`, "");
        if (rpc.method?.sourceFile) lines.push(`Source file ${source(rpc.method.sourceFile, rpc.protoFile)}`, "");
        const example = (rpc.method?.requestFields || []).slice(0, 5);
        if (example.length) {
          lines.push("Request fields", "", "| Field | Type |", "|---|---|");
          for (const field of example) lines.push(`| ${table(field.name || field.path)} | ${table(field.type)} |`);
          lines.push("");
        }
        if (rpc.method) lines.push("### Request example", "", "\x60\x60\x60json", protoExample(rpc.method.requestFields), "\x60\x60\x60", "",
          "### Response example", "", "\x60\x60\x60json", protoExample(rpc.method.responseFields), "\x60\x60\x60", "");
        const picks = featuredScenarios(rpc.scenarios);
        if (picks.length) lines.push(scenarioRows(picks, source), "");
        if (rpc.catalog) lines.push(nav(`Browse all ${rpc.scenarios.length} scenarios`, rpc.catalog), "");
      }
      return `${lines.join("\n")}\n`;
    });
  }
  return { markdown, site };
}

function buildOpenApi(pages, title) {
  const paths = Object.create(null);
  const methods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
  const operations = pages.filter(page => page.protocol === "rest").map(page => ({ id: page.id, title: page.title }));
  const names = allocateSlugs(operations);
  for (const page of pages) {
    if (page.protocol !== "rest" || !String(page.request?.url || "").trim()) continue;
    const contract = page.contract || {};
    const method = String(contract.method || "").toLowerCase();
    const route = String(contract.url || "").replace(/^https?:\/\/[^/]+/i, "").replace(/^\{\{[^}]+\}\}(?=\/|$)/, "")
      .split(/[?#]/)[0].replace(/\{\{([\w.-]+)\}\}/g, "{$1}").replace(/\/:([\w.-]+)/g, "/{$1}") || "/";
    if (!methods.has(method) || !/^\/(?!\/)/.test(route) || /[\s{}]/.test(route.replace(/\{[\w.-]+\}/g, ""))) continue;
    const shape = route.replace(/\{[^}]+\}/g, "{}");
    const existingRoute = Object.keys(paths).find(candidate => candidate.replace(/\{[^}]+\}/g, "{}") === shape);
    if (existingRoute && existingRoute !== route) continue;
    paths[route] ||= {};
    const operationsAtPath = paths[route];
    const responses = Object.fromEntries((contract.responseStatuses || []).filter(code => Number.isInteger(code) && code >= 100 && code <= 599)
      .map(code => [String(code), { description: `Observed or configured HTTP ${code} response` }]));
    const addResponseSchema = (code, value) => {
      const response = responses[String(code)];
      if (!response || response.content || value == null || Number(code) === 204 || method === "head") return;
      try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        response.content = { "application/json": { schema: jsonSchema(parsed) } };
      } catch { /* response media type is unknown */ }
    };
    for (const mock of page.mocks || []) if (mock.enabled !== false) addResponseSchema(mock.status, mock.body ?? mock.response?.data);
    addResponseSchema(page.latestResponse?.httpStatus || page.latestResponse?.status,
      page.latestResponse?.body ?? page.latestResponse?.messages?.[0]);
    if (operationsAtPath[method]) {
      Object.assign(operationsAtPath[method].responses, responses);
      continue;
    }
    const parameters = [...new Set([...route.matchAll(/\{([^}]+)\}/g)].map(match => match[1]))]
      .map(name => ({ name, in: "path", required: true, schema: { type: "string" } }));
    for (const [location, fields] of [["query", contract.queryParams], ["header", contract.headers]]) {
      const known = new Set();
      for (const field of fields || []) {
        const name = field.name || field.key;
        const key = location === "header" ? String(name).toLowerCase() : name;
        if (!name || known.has(key) || ["authorization", "accept", "content-type", "cookie", "set-cookie"].includes(key)) continue;
        known.add(key);
        parameters.push({ name, in: location, schema: { type: "string" } });
      }
    }
    const operation = { operationId: names.get(page.id), summary: page.title, responses: Object.keys(responses).length ?
      responses : { default: { description: "HTTP response; status and schema have not been captured" } } };
    if (parameters.length) operation.parameters = parameters;
    const raw = page.request?.body;
    if (typeof raw === "string" && raw.trim()) {
      try {
        const body = JSON.parse(raw);
        operation.requestBody = { content: { "application/json": { schema: jsonSchema(body) } } };
      } catch {
        if (contract.bodyType === "text")
          operation.requestBody = { content: { "text/plain": { schema: { type: "string" } } } };
      }
    }
    operationsAtPath[method] = operation;
  }
  if (!Object.keys(paths).length) return null;
  return { openapi: "3.1.0", info: { title, version: "1.0.0",
    description: "Generated from saved REST requests and observed or configured responses in this Layang workspace." }, paths };
}

/**
 * OpenAPI 3.1 view of the workspace's gRPC requests. Each RPC is an operation at
 * POST /<package.Service>/<Method> with proto3-JSON request/response schemas, and every saved example
 * becomes a named example on both sides, paired by name, the way OpenAPI tools pair them.
 * The wire format stays protobuf; JSON is the readable mapping that requests and examples are written in.
 */
function buildGrpcOpenApi(pages, title) {
  const paths = Object.create(null);
  const tags = new Set();
  const operationIds = new Set();
  const grpcPages = pages.filter(page => page.kind === "request" && page.protocol === "grpc" && page.contract?.methodFullName);
  for (const page of grpcPages) {
    const contract = page.contract;
    const [service, method] = contract.methodFullName.split("/");
    if (!service || !method) continue;
    const route = `/${service}/${method}`;
    const streaming = contract.requestStream ? (contract.responseStream ? "bidirectional" : "client") :
      contract.responseStream ? "server" : "unary";
    tags.add(service);
    const existing = paths[route]?.post;
    const operation = existing || {
      operationId: uniqueOperationId(`${service.split(".").at(-1)}_${method}`, operationIds),
      summary: page.title,
      ...(page.summary ? { description: page.summary } : {}),
      tags: [service],
      "x-grpc": compactObject({
        service,
        method,
        streaming,
        requestType: contract.requestType,
        responseType: contract.responseType,
        protoFile: contract.sourceFile,
        schema: contract.libraryName || contract.revisionLabel
          ? compactObject({ library: contract.libraryName, revision: contract.revisionLabel }) : undefined,
      }),
      requestBody: { required: true, content: { "application/json": {
        schema: messageSchema(contract.requestFields, contract.requestType, contract.requestStream) } } },
      responses: {},
    };
    const requestContent = operation.requestBody.content["application/json"];
    const responseSchema = messageSchema(contract.responseFields, contract.responseType, contract.responseStream);
    const examples = (page.examples || []).filter(example => example?.enabled !== false);
    const exampleKeys = new Set(Object.keys(requestContent.examples || {}));
    for (const example of examples) {
      const key = uniqueOperationId(exampleKey(example.name), exampleKeys);
      const summary = String(example.name || key);
      const description = String(example.documentation?.summary || "").trim();
      const extension = example.mockScenario ? { "x-layang-mock-scenario": example.mockScenario } : {};
      requestContent.examples = { ...requestContent.examples,
        [key]: { summary, ...(description ? { description } : {}), value: parseJson(example.requestJson, {}), ...extension } };
      const status = grpcStatusName(example.expectedStatus);
      const code = status === "OK" ? "200" : "default";
      if (!operation.responses[code]) operation.responses[code] = code === "200"
        ? { description: streaming === "server" || streaming === "bidirectional"
          ? "OK. A server stream: each element is one response message." : "OK" }
        : { description: "gRPC error. The example names the expected grpc-status." };
      const response = operation.responses[code];
      const body = parseJson(example.expectedJson, undefined);
      const hasBody = body !== undefined && !(isPlainObject(body) && !Object.keys(body).length);
      if (!response.content) response.content = { "application/json": { schema: code === "200" ? responseSchema : grpcErrorSchema() } };
      const content = response.content;
      const responseExample = code === "200"
        ? (hasBody ? { summary, value: body, ...extension } : null)
        : { summary, value: { code: status, message: hasBody && typeof body === "string" ? body : "" },
          "x-grpc-status": status, ...extension };
      if (responseExample) content["application/json"].examples = { ...content["application/json"].examples, [key]: responseExample };
    }
    if (!examples.length && page.request?.body) {
      const body = parseJson(page.request.body, undefined);
      if (body !== undefined) requestContent.example = body;
    }
    if (!operation.responses["200"]) operation.responses["200"] = { description: "OK",
      content: { "application/json": { schema: responseSchema } } };
    paths[route] = { post: operation };
  }
  if (!Object.keys(paths).length) return null;
  return {
    openapi: "3.1.0",
    info: { title: `${title} gRPC`, version: "1.0.0",
      description: "gRPC methods of this Layang workspace in OpenAPI form. Each path is POST /<package.Service>/<Method>; " +
        "bodies use the proto3 JSON mapping (field names as declared in the .proto). The wire format is protobuf " +
        "(native gRPC or gRPC-Web). x-grpc describes the RPC; x-layang-mock-scenario names the mock scenario that answers an example." },
    tags: [...tags].sort().map(name => ({ name })),
    paths: Object.fromEntries(Object.keys(paths).sort().map(key => [key, paths[key]])),
  };
}

const GRPC_STATUS_NAMES = ["OK", "CANCELLED", "UNKNOWN", "INVALID_ARGUMENT", "DEADLINE_EXCEEDED", "NOT_FOUND",
  "ALREADY_EXISTS", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED", "FAILED_PRECONDITION", "ABORTED", "OUT_OF_RANGE",
  "UNIMPLEMENTED", "INTERNAL", "UNAVAILABLE", "DATA_LOSS", "UNAUTHENTICATED"];

function grpcStatusName(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return "OK";
  if (/^\d+$/.test(text)) return GRPC_STATUS_NAMES[Number(text)] || text;
  return text;
}

function grpcErrorSchema() {
  return { type: "object", properties: { code: { type: "string", enum: GRPC_STATUS_NAMES.slice(1) }, message: { type: "string" } } };
}

/** Rebuilds a nested JSON Schema from docs-core's flattened proto fields ("a", "a.b", "items[].id"). */
function messageSchema(fields, typeName, stream) {
  const root = { type: "object", ...(typeName ? { title: typeName } : {}), properties: {} };
  const objects = new Map([["", root]]);
  for (const field of fields || []) {
    const name = String(field?.name || "");
    const dot = name.lastIndexOf(".");
    const parent = objects.get(dot < 0 ? "" : name.slice(0, dot));
    if (!parent) continue;
    const own = name.slice(dot + 1).replace(/\[\]$/, "");
    let schema = field.nestedType ? { type: "object", title: field.nestedType, properties: {} } : scalarSchema(field);
    if (field.nestedType) objects.set(name, schema);
    if (field.repeated) schema = { type: "array", items: schema };
    const description = String(field.description || "").trim();
    if (description) schema = { ...schema, description };
    if (field.deprecated) schema = { ...schema, deprecated: true };
    // Shallow copies above share the nested object's `properties`, so children still land in it.
    parent.properties[own] = schema;
  }
  return stream ? { type: "array", items: root } : root;
}

function scalarSchema(field) {
  const type = String(field.type || "");
  if (field.enumValues?.length) return { type: "string", enum: field.enumValues.map(value => value.name) };
  const map = type.match(/^map\s*<\s*[\w.]+\s*,\s*([\w.]+)\s*>$/);
  if (map) return { type: "object", additionalProperties: scalarSchema({ type: map[1] }) };
  if (/^(?:u?int64|sint64|s?fixed64)$/.test(type)) return { type: ["integer", "string"], format: "int64" };
  if (/^(?:u?int32|sint32|s?fixed32)$/.test(type)) return { type: "integer", format: type.startsWith("u") || type === "fixed32" ? "uint32" : "int32" };
  if (type === "double" || type === "float") return { type: "number", format: type };
  if (type === "bool") return { type: "boolean" };
  if (type === "bytes") return { type: "string", contentEncoding: "base64" };
  if (type === "string") return { type: "string" };
  if (/(^|\.)Timestamp$/.test(type)) return { type: "string", format: "date-time" };
  if (/(^|\.)Duration$/.test(type)) return { type: "string" };
  return { description: `Message ${type}` };
}

function exampleKey(name) {
  return String(name || "example").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "example";
}

function uniqueOperationId(base, used) {
  let candidate = base;
  for (let index = 2; used.has(candidate); index++) candidate = `${base}-${index}`;
  used.add(candidate);
  return candidate;
}

function parseJson(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return value;
  if (!value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return value; }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}

function jsonSchema(value, depth = 0) {
  if (depth >= 8) return {};
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) return { type: "array", items: value.length ? jsonSchema(value[0], depth + 1) : {} };
  if (typeof value === "object") return { type: "object",
    properties: Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, field]) => [key, jsonSchema(field, depth + 1)])) };
  return { type: typeof value === "number" && Number.isInteger(value) ? "integer" : typeof value };
}

module.exports = { buildGrpcReference, buildOpenApi, buildGrpcOpenApi, messageSchema };
