"use strict";

const crypto = require("node:crypto");
const { discoverRunItems } = require("./cli-workspace.cjs");
const { readGitWorkspace, writeGitWorkspace } = require("./git-workspace.cjs");
const { parseKeyValueFlags } = require("./cli-runtime-core.cjs");

function listExamples(workspace, filters = {}) {
  const project = workspace?.project || {};
  const examples = Array.isArray(project.examples) ? project.examples : [];
  const query = String(filters.example || "")
    .trim()
    .toLowerCase();
  const request = String(filters.request || "")
    .trim()
    .toLowerCase();
  const method = String(filters.method || "")
    .trim()
    .toLowerCase();
  const includeHidden = Boolean(filters.includeHidden);
  return examples.filter((example) => {
    if (!includeHidden && example?.enabled === false) return false;
    const id = String(example?.id || "").toLowerCase();
    const name = String(example?.name || "").toLowerCase();
    const key = `${example?.serviceName || ""}/${example?.methodName || ""}`.toLowerCase();
    if (query && id !== query && name !== query && !name.includes(query)) return false;
    if (request && !key.includes(request) && String(example?.methodName || "").toLowerCase() !== request) return false;
    if (method && key !== method && !key.endsWith(`/${method}`)) return false;
    return true;
  });
}

function exampleToRunItem(workspace, example, options = {}) {
  const allItems = discoverRunItems(workspace, { ...options, request: "", method: "" });
  const methodKey = `${example.serviceName || ""}/${example.methodName || ""}`;
  const normalized = methodKey.toLowerCase();
  const base =
    allItems.find((item) => String(item.methodKey || "").toLowerCase() === normalized) ||
    allItems.find(
      (item) =>
        String(item.collectionName || "").toLowerCase() === String(example.serviceName || "").toLowerCase() &&
        String(item.requestName || item.title || "").toLowerCase() === String(example.methodName || "").toLowerCase(),
    ) ||
    allItems.find((item) => String(item.title || "").toLowerCase() === String(example.methodName || "").toLowerCase());
  if (!base) throw new Error(`No saved request matches example ${example.name} (${methodKey}).`);
  return {
    ...base,
    id: `example:${example.id || example.name}`,
    title: `${base.title} · ${example.name}`,
    requestJson: String(example.requestJson || "{}"),
    metadata: Array.isArray(example.metadata) ? example.metadata : [],
    assertionJson: String(example.assertions || ""),
    example,
    expected: {
      status: example.expectedStatus,
      json: example.expectedJson,
      trailers: example.expectedTrailers,
    },
  };
}

function examplesToRunItems(workspace, examples, options = {}) {
  return examples.map((example) => exampleToRunItem(workspace, example, options));
}

async function createExample(root, requestSelector, options = {}) {
  const git = await requireGitWorkspace(root, "example:create");
  const items = discoverRunItems(
    { root: git.root, project: git.project },
    {
      request: requestSelector || "",
      method: options.method || "",
      collection: options.collection || "",
    },
  );
  if (!items.length)
    throw new Error("No saved request matched. Use --request, --method, or --collection to select one.");
  if (items.length > 1)
    throw new Error("More than one request matched. Narrow the selection with --request or --method.");
  const item = items[0];
  const now = new Date().toISOString();
  const [grpcService, grpcMethod] = splitMethodKey(item.methodKey);
  const example = {
    id: createExampleId(),
    name: String(options.name || `${item.requestName || item.title || grpcMethod || "Request"} example`),
    serviceName:
      item.requestKind === "grpc" ? grpcService : String(item.collectionName || item.serviceName || "Collection"),
    methodName: item.requestKind === "grpc" ? grpcMethod : String(item.requestName || item.title || "Request"),
    requestJson: normalizeJsonText(String(item.requestJson || "{}"), "requestJson"),
    metadata: clonePairs(item.metadata),
    expectedJson: "",
    expectedStatus: "",
    expectedTrailers: [],
    assertions: String(item.assertionJson || ""),
    tags: [],
    enabled: true,
    documentation: { summary: "", whenThisHappens: "", explanation: "", notes: [] },
    createdAt: now,
    updatedAt: now,
  };
  for (const [key, value] of Object.entries(parseKeyValueFlags(options.set))) applyExampleField(example, key, value);
  await persistExamples(git, [example, ...(Array.isArray(git.project.examples) ? git.project.examples : [])], now);
  return example;
}

async function duplicateExample(root, selector, options = {}) {
  const git = await requireGitWorkspace(root, "example:duplicate");
  const examples = structuredClone(Array.isArray(git.project.examples) ? git.project.examples : []);
  const source = findExample(examples, selector);
  if (!source) throw new Error(`Example ${selector} was not found.`);
  const now = new Date().toISOString();
  const copy = structuredClone(source);
  copy.id = createExampleId();
  copy.name = String(options.name || `${source.name} copy`);
  copy.metadata = clonePairs(copy.metadata);
  copy.expectedTrailers = clonePairs(copy.expectedTrailers);
  copy.tags = Array.isArray(copy.tags) ? [...copy.tags] : [];
  copy.documentation = normalizeDocumentation(copy.documentation);
  copy.createdAt = now;
  copy.updatedAt = now;
  for (const [key, value] of Object.entries(parseKeyValueFlags(options.set))) applyExampleField(copy, key, value);
  await persistExamples(git, [copy, ...examples], now);
  return copy;
}

async function deleteExample(root, selector) {
  const git = await requireGitWorkspace(root, "example:delete");
  const examples = structuredClone(Array.isArray(git.project.examples) ? git.project.examples : []);
  const source = findExample(examples, selector);
  if (!source) throw new Error(`Example ${selector} was not found.`);
  const now = new Date().toISOString();
  await persistExamples(
    git,
    examples.filter((item) => item.id !== source.id),
    now,
  );
  return { deleted: { id: source.id, name: source.name }, remaining: examples.length - 1 };
}

async function editExample(root, selector, setFlags) {
  const git = await requireGitWorkspace(root, "example:edit");
  const examples = Array.isArray(git.project.examples) ? structuredClone(git.project.examples) : [];
  const index = findExampleIndex(examples, selector);
  if (index < 0) throw new Error(`Example ${selector} was not found.`);
  const updates = parseKeyValueFlags(setFlags);
  const next = examples[index];
  for (const [key, value] of Object.entries(updates)) applyExampleField(next, key, value);
  next.updatedAt = new Date().toISOString();
  examples[index] = next;
  await persistExamples(git, examples, next.updatedAt);
  return next;
}

function applyExampleField(example, key, rawValue) {
  const value = String(rawValue ?? "");
  switch (key) {
    case "name":
      example.name = value;
      return;
    case "enabled":
      example.enabled = parseBoolean(value, "enabled");
      return;
    case "tags":
      example.tags = splitList(value);
      return;
    case "requestJson":
    case "request":
      example.requestJson = normalizeJsonText(value, key);
      return;
    case "metadata":
    case "headers":
      example.metadata = normalizePairs(value, key);
      return;
    case "expectedJson":
    case "response":
      example.expectedJson = normalizeOptionalJsonText(value, key);
      return;
    case "expectedStatus":
    case "status":
      example.expectedStatus = value;
      return;
    case "expectedTrailers":
    case "trailers":
      example.expectedTrailers = normalizePairs(value, key);
      return;
    case "assertions":
      example.assertions = normalizeOptionalJsonText(value, key);
      return;
    case "summary":
      ensureDocumentation(example).summary = value;
      return;
    case "whenThisHappens":
    case "when":
      ensureDocumentation(example).whenThisHappens = value;
      return;
    case "explanation":
      ensureDocumentation(example).explanation = value;
      return;
    case "notes":
      ensureDocumentation(example).notes = splitNotes(value);
      return;
    default:
      if (key.startsWith("documentation.")) {
        const field = key.slice("documentation.".length);
        if (["summary", "whenThisHappens", "explanation"].includes(field)) ensureDocumentation(example)[field] = value;
        else if (field === "notes") ensureDocumentation(example).notes = splitNotes(value);
        else throw new Error(`Unsupported example documentation field ${field}.`);
        return;
      }
      throw new Error(`Unsupported example field ${key}.`);
  }
}

function ensureDocumentation(example) {
  example.documentation = normalizeDocumentation(example.documentation);
  return example.documentation;
}

function normalizeDocumentation(value) {
  return {
    summary: String(value?.summary || ""),
    whenThisHappens: String(value?.whenThisHappens || ""),
    explanation: String(value?.explanation || ""),
    notes: Array.isArray(value?.notes) ? value.notes.map(String) : [],
  };
}

function normalizeJsonText(value, field) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch (error) {
    throw new Error(`${field} must be valid JSON: ${error.message}`);
  }
}

function normalizeOptionalJsonText(value, field) {
  if (!String(value || "").trim()) return "";
  return normalizeJsonText(value, field);
}

function normalizePairs(value, field) {
  if (!String(value || "").trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${field} must be a JSON object or array of {key,value,enabled}: ${error.message}`);
  }
  if (Array.isArray(parsed)) {
    return parsed.map((pair, index) => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair) || !String(pair.key || "").trim()) {
        throw new Error(`${field}[${index}] must contain a non-empty key.`);
      }
      return { key: String(pair.key), value: String(pair.value ?? ""), enabled: pair.enabled !== false };
    });
  }
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed).map(([key, pairValue]) => ({ key, value: String(pairValue ?? ""), enabled: true }));
  }
  throw new Error(`${field} must be a JSON object or array.`);
}

function clonePairs(value) {
  return Array.isArray(value)
    ? value.map((pair) => ({
        ...pair,
        key: String(pair?.key || ""),
        value: String(pair?.value ?? ""),
        enabled: pair?.enabled !== false,
      }))
    : [];
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function splitNotes(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}
function parseBoolean(value, field) {
  if (["true", "1", "yes", "on"].includes(String(value).toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(String(value).toLowerCase())) return false;
  throw new Error(`${field} must be true or false.`);
}
function splitMethodKey(value) {
  const text = String(value || "");
  const slash = text.lastIndexOf("/");
  return slash < 0 ? ["", text] : [text.slice(0, slash), text.slice(slash + 1)];
}
function createExampleId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `example-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}
function findExample(examples, selector) {
  const index = findExampleIndex(examples, selector);
  return index < 0 ? null : examples[index];
}
function findExampleIndex(examples, selector) {
  const query = String(selector || "")
    .trim()
    .toLowerCase();
  return examples.findIndex(
    (example) =>
      String(example?.id || "").toLowerCase() === query || String(example?.name || "").toLowerCase() === query,
  );
}
async function requireGitWorkspace(root, command) {
  const git = await readGitWorkspace(root);
  if (!git) throw new Error(`${command} requires a Git-friendly Layang workspace (layang.yml).`);
  return git;
}
async function persistExamples(git, examples, updatedAt) {
  await writeGitWorkspace(git.root, {
    project: { ...git.project, examples, updatedAt },
    layout: git.layout,
    settings: git.settings,
  });
}

module.exports = {
  listExamples,
  exampleToRunItem,
  examplesToRunItems,
  createExample,
  duplicateExample,
  deleteExample,
  editExample,
  applyExampleField,
  normalizePairs,
};
