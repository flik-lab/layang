"use strict";

const path = require("node:path");
const { readGitWorkspace, writeGitWorkspace } = require("./git-workspace.cjs");
const { parseKeyValueFlags } = require("./cli-runtime-core.cjs");

const sectionMap = {
  overview: "Overview",
  when: "When to use",
  whenToUse: "When to use",
  prerequisites: "Prerequisites",
  businessRules: "Business rules",
  errors: "Error behaviour",
  errorBehaviour: "Error behaviour",
  operationalNotes: "Operational notes",
  notes: "Operational notes",
};

async function initializeDocumentation(root, filters = {}) {
  const git = await requireGit(root);
  const project = structuredClone(git.project);
  const documentation = normalizeDocumentation(project.documentation);
  const selected = findRequests(project, filters.request, filters.collection);
  if (!selected.length) throw new Error("No requests matched the documentation filter.");
  const existingByKey = new Map(documentation.sources.map((source) => [String(source.key), source]));
  const created = [];
  const skipped = [];
  for (const entry of selected) {
    const key = `request:${entry.request.id}`;
    if (existingByKey.has(key) && !filters.force) {
      skipped.push({ id: entry.request.id, name: entry.request.name });
      continue;
    }
    const previous = existingByKey.get(key);
    const markdown = migrateLegacyDocumentation(previous, entry.request.kind);
    const source = {
      key,
      kind: "request",
      entityId: entry.request.id,
      summary: previous?.summary || entry.request.description || describeRequest(entry.request),
      markdown,
      manualPlacement: "inline",
      sections: [],
      tags: previous?.tags || [entry.request.kind],
      audience: previous?.audience || [],
      related: previous?.related || [],
      deprecated: previous?.deprecated === true,
      updatedAt: new Date().toISOString(),
    };
    existingByKey.set(key, source);
    created.push({ id: entry.request.id, name: entry.request.name, key });
  }
  documentation.sources = [...existingByKey.values()];
  project.documentation = documentation;
  await persist(git, project);
  return { created, skipped };
}

async function setDocumentation(root, selector, setFlags) {
  const git = await requireGit(root);
  const project = structuredClone(git.project);
  const documentation = normalizeDocumentation(project.documentation);
  const matches = findRequests(project, selector, "");
  if (matches.length !== 1) {
    if (!matches.length) throw new Error(`Request ${selector} was not found.`);
    throw new Error(`Request selector ${selector} matched more than one request. Use the request ID.`);
  }
  const request = matches[0].request;
  const key = `request:${request.id}`;
  let source = documentation.sources.find((item) => item.key === key);
  if (!source) {
    source = {
      key,
      kind: "request",
      entityId: request.id,
      summary: describeRequest(request),
      markdown: documentationTemplate(request.kind),
      manualPlacement: "inline",
      sections: [],
      tags: [request.kind],
      audience: [],
      related: [],
      deprecated: false,
      updatedAt: new Date().toISOString(),
    };
    documentation.sources.push(source);
  }
  source.markdown = migrateLegacyDocumentation(source, request.kind);
  source.sections = [];
  source.manualPlacement = "inline";
  const updates = parseKeyValueFlags(setFlags);
  for (const [field, raw] of Object.entries(updates)) {
    const value = String(raw ?? "");
    if (field === "summary") source.summary = value;
    else if (field === "tags" || field === "audience" || field === "related") source[field] = csv(value);
    else if (field === "deprecated") source.deprecated = value === "true";
    else if (field === "manualPlacement" || field === "placement")
      source.manualPlacement = normalizeManualPlacement(value);
    else if (sectionMap[field]) {
      source.markdown = replaceMarkdownSection(source.markdown, sectionMap[field], value);
    } else if (field === "markdown") {
      source.markdown = value;
    } else throw new Error(`Unsupported documentation field ${field}.`);
  }
  source.updatedAt = new Date().toISOString();
  project.documentation = documentation;
  await persist(git, project);
  return source;
}

function findRequests(project, selector, collectionSelector) {
  const query = String(selector || "")
    .trim()
    .toLowerCase();
  const collectionQuery = String(collectionSelector || "")
    .trim()
    .toLowerCase();
  const output = [];
  for (const collection of project.collections || []) {
    const collectionMatches =
      !collectionQuery ||
      String(collection.id || "").toLowerCase() === collectionQuery ||
      String(collection.name || "").toLowerCase() === collectionQuery;
    if (!collectionMatches) continue;
    for (const request of collection.requests || []) {
      const matches =
        !query ||
        String(request.id || "").toLowerCase() === query ||
        String(request.name || "").toLowerCase() === query;
      if (matches) output.push({ collection, request });
    }
  }
  return output;
}

function documentationTemplate(kind) {
  if (kind === "grpc")
    return "## Overview\n\nWrite the RPC documentation freely here.\n\n## Proto Reference\n\n{{LAYANG_PROTO_REFERENCE}}\n";
  if (kind === "websocket")
    return "## Overview\n\nWrite the WebSocket operation documentation freely here.\n\n## Connection Reference\n\n{{LAYANG_CONNECTION_REFERENCE}}\n";
  return "## Overview\n\nWrite the HTTP operation documentation freely here.\n\n## Endpoint Reference\n\n{{LAYANG_ENDPOINT_REFERENCE}}\n";
}

function replaceMarkdownSection(markdown, heading, value) {
  const input = String(markdown || "").trimEnd();
  const pattern = new RegExp(`(^|\\n)##\\s+${escapeRegex(heading)}\\s*\\n[\\s\\S]*?(?=\\n##\\s+|$)`, "i");
  const block = `\n## ${heading}\n\n${value.trim()}\n`;
  if (pattern.test(input)) return input.replace(pattern, block).replace(/^\n/, "");
  return `${input}${input ? "\n" : ""}${block.replace(/^\n/, "")}`;
}

function migrateLegacyDocumentation(source, kind) {
  const fallback = String(source?.markdown || "").trim() || documentationTemplate(kind);
  const sections = Array.isArray(source?.sections)
    ? source.sections.filter((section) => section && section.enabled !== false)
    : [];
  if (!sections.length) {
    if (/\{\{LAYANG_[A-Z_]+\}\}/.test(fallback)) return fallback;
    const marker = primaryMarker(kind);
    const block = `## ${primaryTitle(kind)}\n\n${marker}`;
    const placement = normalizeManualPlacement(source?.manualPlacement);
    if (placement === "only") return fallback;
    if (placement === "after") return `${block}\n\n${fallback}`;
    if (placement === "inline" && fallback.includes("{{LAYANG_AUTO_REFERENCE}}"))
      return fallback.replace("{{LAYANG_AUTO_REFERENCE}}", block);
    return `${fallback}\n\n${block}`;
  }
  return sections
    .map((section) => {
      if (section.mode !== "auto") return String(section.markdown || "").trim();
      const marker = sectionMarker(section.kind, kind);
      return marker ? `## ${section.title || primaryTitle(kind)}\n\n${marker}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function primaryMarker(kind) {
  if (kind === "grpc") return "{{LAYANG_PROTO_REFERENCE}}";
  if (kind === "websocket") return "{{LAYANG_CONNECTION_REFERENCE}}";
  return "{{LAYANG_ENDPOINT_REFERENCE}}";
}

function primaryTitle(kind) {
  if (kind === "grpc") return "Proto Reference";
  if (kind === "websocket") return "Connection Reference";
  return "Endpoint Reference";
}

function sectionMarker(sectionKind, requestKind) {
  if (sectionKind === "reference") return primaryMarker(requestKind);
  if (sectionKind === "request-example") return "{{LAYANG_REQUEST_EXAMPLE}}";
  if (sectionKind === "response-example") return "{{LAYANG_RESPONSE_EXAMPLE}}";
  if (sectionKind === "errors") return "{{LAYANG_ERRORS}}";
  if (sectionKind === "mocks") return "{{LAYANG_MOCK_SCENARIOS}}";
  if (sectionKind === "code-samples") return "{{LAYANG_CODE_SAMPLES}}";
  if (sectionKind === "related") return "{{LAYANG_RELATED_OPERATIONS}}";
  if (sectionKind === "overview-index") return "{{LAYANG_OVERVIEW_INDEX}}";
  return "";
}

function normalizeDocumentation(value) {
  const record = value && typeof value === "object" ? structuredClone(value) : {};
  return {
    sources: Array.isArray(record.sources) ? record.sources : [],
    publications: Array.isArray(record.publications) ? record.publications : [],
    settings: record.settings && typeof record.settings === "object" ? record.settings : {},
  };
}

function normalizeManualPlacement(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "before";
  if (["before", "after", "inline", "only"].includes(normalized)) return normalized;
  throw new Error(`Unsupported documentation placement ${value}. Use before, after, inline, or only.`);
}

function describeRequest(request) {
  if (request.kind === "grpc") return `Call ${request.grpc?.methodFullName || request.grpcMethodKey || request.name}.`;
  if (request.kind === "websocket") return `Connect to ${request.url || request.name}.`;
  return `${request.method || "GET"} ${request.url || request.name}.`;
}

function csv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function requireGit(root) {
  const git = await readGitWorkspace(path.resolve(root || "."));
  if (!git) throw new Error("Documentation authoring commands require a Git-friendly Layang workspace (layang.yml).");
  return git;
}

async function persist(git, project) {
  await writeGitWorkspace(git.root, {
    project: { ...project, updatedAt: new Date().toISOString() },
    layout: git.layout,
    settings: git.settings,
  });
}

module.exports = {
  initializeDocumentation,
  setDocumentation,
  findRequests,
  documentationTemplate,
  replaceMarkdownSection,
};
