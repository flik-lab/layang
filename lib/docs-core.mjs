/**
 * Browser-safe documentation model shared by the Layang desktop UI and CLI.
 * No Node APIs are used so the desktop preview and static site produce the same content.
 */

export const DOCS_GENERATOR_VERSION = 6;

export const DOCUMENTATION_AUTO_MARKERS = Object.freeze({
  overviewIndex: "{{LAYANG_OVERVIEW_INDEX}}",
  protoReference: "{{LAYANG_PROTO_REFERENCE}}",
  endpointReference: "{{LAYANG_ENDPOINT_REFERENCE}}",
  connectionReference: "{{LAYANG_CONNECTION_REFERENCE}}",
  requestExample: "{{LAYANG_REQUEST_EXAMPLE}}",
  responseExample: "{{LAYANG_RESPONSE_EXAMPLE}}",
  errors: "{{LAYANG_ERRORS}}",
  mockScenarios: "{{LAYANG_MOCK_SCENARIOS}}",
  codeSamples: "{{LAYANG_CODE_SAMPLES}}",
  relatedOperations: "{{LAYANG_RELATED_OPERATIONS}}",
});

export function docsSourceKey(kind, entityId = "workspace") {
  return `${kind}:${entityId || "workspace"}`;
}

export function stableDocsHash(value) {
  const text = stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

export function normalizeDocumentationState(input = {}) {
  const sources = arrayOr(input?.sources)
    .filter(isObject)
    .map((source) => ({
      key: stringOr(source.key, docsSourceKey(source.kind || "workspace", source.entityId || "workspace")),
      kind: normalizeDocKind(source.kind),
      entityId: stringOr(source.entityId, "workspace"),
      summary: stringOr(source.summary, ""),
      markdown: stringOr(source.markdown, ""),
      manualPlacement: normalizeManualPlacement(source.manualPlacement),
      sections: normalizeDocumentationSections(source.sections),
      tags: stringArray(source.tags),
      audience: stringArray(source.audience),
      related: stringArray(source.related),
      deprecated: Boolean(source.deprecated),
      updatedAt: stringOr(source.updatedAt, new Date(0).toISOString()),
    }));
  const publications = arrayOr(input?.publications)
    .filter(isObject)
    .map((item) => ({
      pageId: stringOr(item.pageId, ""),
      sourceHash: stringOr(item.sourceHash, ""),
      outputPath: stringOr(item.outputPath, ""),
      publishedAt: stringOr(item.publishedAt, ""),
    }))
    .filter((item) => item.pageId);
  const generatedSectionsMode = input?.settings?.generatedSectionsMode === "custom" ? "custom" : "minimal";
  const customGeneratedSections = generatedSectionsMode === "custom";
  const settings = {
    mode: ["preview-manual-publish", "publish-on-save", "manual"].includes(input?.settings?.mode)
      ? input.settings.mode
      : "preview-manual-publish",
    generatedSectionsMode,
    includeSchemas: generatedSectionsMode === "minimal" ? true : input?.settings?.includeSchemas !== false,
    includeExamples: customGeneratedSections && input?.settings?.includeExamples === true,
    includeMocks: customGeneratedSections && input?.settings?.includeMocks === true,
    includeCodeSamples: customGeneratedSections && input?.settings?.includeCodeSamples === true,
    includeRelatedRequests: customGeneratedSections && input?.settings?.includeRelatedRequests === true,
    includeErrors: customGeneratedSections && input?.settings?.includeErrors === true,
    includeResponseContracts: customGeneratedSections && input?.settings?.includeResponseContracts === true,
    includeOverviewIndexes: input?.settings?.includeOverviewIndexes !== false,
  };
  return { sources: dedupeBy(sources, (item) => item.key), publications, settings };
}

export function upsertDocumentationSource(state, source) {
  const normalized = normalizeDocumentationState(state);
  const next = {
    key: stringOr(source.key, docsSourceKey(source.kind, source.entityId)),
    kind: normalizeDocKind(source.kind),
    entityId: stringOr(source.entityId, "workspace"),
    summary: stringOr(source.summary, ""),
    markdown: stringOr(source.markdown, ""),
    manualPlacement: normalizeManualPlacement(source.manualPlacement),
    sections: normalizeDocumentationSections(source.sections),
    tags: stringArray(source.tags),
    audience: stringArray(source.audience),
    related: stringArray(source.related),
    deprecated: Boolean(source.deprecated),
    updatedAt: stringOr(source.updatedAt, new Date().toISOString()),
  };
  return { ...normalized, sources: [next, ...normalized.sources.filter((item) => item.key !== next.key)] };
}

export function publicationForPage(state, pageId) {
  return normalizeDocumentationState(state).publications.find((item) => item.pageId === pageId) || null;
}

export function documentationTemplate(kind = "request", protocol = "") {
  if (kind === "workspace")
    return `## Overview\n\nWrite the workspace documentation freely here.\n\n## Workspace Index\n\n${DOCUMENTATION_AUTO_MARKERS.overviewIndex}\n`;
  if (kind === "collection")
    return `## Overview\n\nWrite the collection documentation freely here.\n\n## Collection Index\n\n${DOCUMENTATION_AUTO_MARKERS.overviewIndex}\n`;
  if (kind === "folder")
    return `## Overview\n\nWrite the workflow or grouping documentation freely here.\n\n## Folder Index\n\n${DOCUMENTATION_AUTO_MARKERS.overviewIndex}\n`;
  if (protocol === "grpc")
    return `## Overview\n\nExplain what this RPC is for.\n\n## Proto Reference\n\n${DOCUMENTATION_AUTO_MARKERS.protoReference}\n`;
  if (protocol === "websocket")
    return `## Overview\n\nExplain what this WebSocket operation is for.\n\n## Connection Reference\n\n${DOCUMENTATION_AUTO_MARKERS.connectionReference}\n`;
  return `## Overview\n\nExplain what this HTTP operation is for.\n\n## Endpoint Reference\n\n${DOCUMENTATION_AUTO_MARKERS.endpointReference}\n`;
}

export function documentationMarkerDefinitions(kind = "request", protocol = "") {
  if (kind !== "request") {
    return [{ kind: "overview-index", label: "Generated index", marker: DOCUMENTATION_AUTO_MARKERS.overviewIndex }];
  }
  const primary =
    protocol === "grpc"
      ? { kind: "reference", label: "Proto reference", marker: DOCUMENTATION_AUTO_MARKERS.protoReference }
      : protocol === "websocket"
        ? { kind: "reference", label: "Connection reference", marker: DOCUMENTATION_AUTO_MARKERS.connectionReference }
        : { kind: "reference", label: "Endpoint reference", marker: DOCUMENTATION_AUTO_MARKERS.endpointReference };
  return [
    primary,
    { kind: "request-example", label: "Request example", marker: DOCUMENTATION_AUTO_MARKERS.requestExample },
    { kind: "response-example", label: "Response example", marker: DOCUMENTATION_AUTO_MARKERS.responseExample },
    { kind: "errors", label: "Errors", marker: DOCUMENTATION_AUTO_MARKERS.errors },
    { kind: "mocks", label: "Mock scenarios", marker: DOCUMENTATION_AUTO_MARKERS.mockScenarios },
    { kind: "code-samples", label: "Code examples", marker: DOCUMENTATION_AUTO_MARKERS.codeSamples },
    { kind: "related", label: "Related operations", marker: DOCUMENTATION_AUTO_MARKERS.relatedOperations },
  ];
}

export function documentationEditorMarkdown(page, source = null) {
  const kind = source?.kind || page?.kind || "request";
  const protocol = page?.protocol || page?.request?.kind || "";
  const explicitSections = normalizeDocumentationSections(source?.sections ?? page?.sections);
  if (explicitSections.length) {
    const migrated = explicitSections
      .filter((section) => section.enabled)
      .map((section) => documentationSectionEditorBlock(section, protocol))
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (migrated) return `${migrated}\n`;
  }

  const manual = String(source?.markdown ?? page?.manualMarkdown ?? "").trim();
  if (!manual) return documentationTemplate(kind, protocol);
  if (containsDocumentationMarker(manual)) return `${manual}\n`;

  const placement = normalizeManualPlacement(source?.manualPlacement ?? page?.manualPlacement);
  if (placement === "only") return `${manual}\n`;
  const primary = documentationPrimaryMarkerDefinition(kind, protocol);
  if (!primary) return `${manual}\n`;
  const automaticBlock = `## ${primary.label}\n\n${primary.marker}`;
  if (placement === "after") return `${automaticBlock}\n\n${manual}\n`;
  if (placement === "inline" && manual.includes("{{LAYANG_AUTO_REFERENCE}}")) {
    return `${manual.replace("{{LAYANG_AUTO_REFERENCE}}", automaticBlock)}\n`;
  }
  return `${manual}\n\n${automaticBlock}\n`;
}

export function buildUnifiedDocsPages(project, options = {}) {
  const documentation = normalizeDocumentationState(project?.documentation);
  const sourceByKey = new Map(documentation.sources.map((source) => [source.key, source]));
  const publications = new Map(documentation.publications.map((item) => [item.pageId, item]));
  const collections = arrayOr(project?.collections);
  const examples = arrayOr(project?.examples);
  const protoIndex = buildProtoIndex(arrayOr(project?.protoLibraries));
  const mockIndex = buildMockIndex(project, options.grpcScenarios || []);
  const workspaceName = stringOr(options.workspaceName, "Layang Workspace");
  const pages = [];

  const workspaceSource = sourceByKey.get("workspace:workspace");
  pages.push(
    finalizePage(
      {
        id: "workspace:overview",
        kind: "workspace",
        entityId: "workspace",
        title: workspaceName,
        summary: workspaceSource?.summary || "Executable API documentation generated by Layang.",
        manualMarkdown: workspaceSource?.markdown || "",
        manualPlacement: normalizeManualPlacement(workspaceSource?.manualPlacement),
        sections: workspaceSource?.sections || [],
        sourceMetadata: sourceMetadata(workspaceSource),
        breadcrumbs: [],
        children: collections.map((collection) => `collection:${collection.id}`),
        overview: {
          collectionCount: collections.length,
          operationCount: collections.reduce((sum, collection) => sum + arrayOr(collection.requests).length, 0),
          protocols: protocolCounts(collections.flatMap((collection) => arrayOr(collection.requests))),
          collections: collections.map((collection) => ({
            id: `collection:${collection.id}`,
            title: stringOr(collection.name, "Collection"),
            summary: stringOr(collection.description, ""),
            operationCount: arrayOr(collection.requests).length,
          })),
        },
      },
      publications,
      documentation.settings,
    ),
  );

  for (const collection of collections) {
    const collectionSource = sourceByKey.get(docsSourceKey("collection", collection.id));
    const folders = arrayOr(collection.folders);
    const requests = arrayOr(collection.requests);
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const folderPath = (folder) => {
      const output = [];
      let current = folder;
      const visited = new Set();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        output.unshift(current);
        current = current.parentId ? folderById.get(current.parentId) : null;
      }
      return output;
    };
    const operationSummary = (request) => ({
      id: `request:${request.id}`,
      title: stringOr(request.name, "Request"),
      protocol: request.kind,
      method: operationMethodLabel(request),
      target: operationTargetLabel(request),
      summary: sourceByKey.get(docsSourceKey("request", request.id))?.summary || defaultRequestSummary(request),
    });

    pages.push(
      finalizePage(
        {
          id: `collection:${collection.id}`,
          kind: "collection",
          entityId: collection.id,
          title: stringOr(collection.name, "Collection"),
          summary: collectionSource?.summary || stringOr(collection.description, ""),
          manualMarkdown: collectionSource?.markdown || "",
          manualPlacement: normalizeManualPlacement(collectionSource?.manualPlacement),
          sections: collectionSource?.sections || [],
          sourceMetadata: sourceMetadata(collectionSource),
          breadcrumbs: [{ id: "workspace:overview", title: workspaceName }],
          children: [
            ...folders.filter((folder) => !folder.parentId).map((folder) => `folder:${folder.id}`),
            ...requests.filter((request) => !request.parentId).map((request) => `request:${request.id}`),
          ],
          collectionId: collection.id,
          overview: {
            operationCount: requests.length,
            folderCount: folders.length,
            protocols: protocolCounts(requests),
            folders: folders
              .filter((folder) => !folder.parentId)
              .map((folder) => ({ id: `folder:${folder.id}`, title: folder.name, summary: folder.description || "" })),
            operations: requests.map(operationSummary),
          },
        },
        publications,
        documentation.settings,
      ),
    );

    for (const folder of folders) {
      const source = sourceByKey.get(docsSourceKey("folder", folder.id));
      const ancestors = folderPath(folder);
      const folderRequests = requests.filter((request) => request.parentId === folder.id);
      pages.push(
        finalizePage(
          {
            id: `folder:${folder.id}`,
            kind: "folder",
            entityId: folder.id,
            collectionId: collection.id,
            title: stringOr(folder.name, "Folder"),
            summary: source?.summary || stringOr(folder.description, ""),
            manualMarkdown: source?.markdown || "",
            manualPlacement: normalizeManualPlacement(source?.manualPlacement),
            sections: source?.sections || [],
            sourceMetadata: sourceMetadata(source),
            breadcrumbs: [
              { id: "workspace:overview", title: workspaceName },
              { id: `collection:${collection.id}`, title: stringOr(collection.name, "Collection") },
              ...ancestors.slice(0, -1).map((item) => ({ id: `folder:${item.id}`, title: item.name })),
            ],
            children: [
              ...folders.filter((item) => item.parentId === folder.id).map((item) => `folder:${item.id}`),
              ...folderRequests.map((request) => `request:${request.id}`),
            ],
            overview: {
              operationCount: folderRequests.length,
              protocols: protocolCounts(folderRequests),
              folders: folders
                .filter((item) => item.parentId === folder.id)
                .map((item) => ({ id: `folder:${item.id}`, title: item.name, summary: item.description || "" })),
              operations: folderRequests.map(operationSummary),
            },
          },
          publications,
          documentation.settings,
        ),
      );
    }

    for (const request of requests) {
      const source = sourceByKey.get(docsSourceKey("request", request.id));
      const folder = request.parentId ? folderById.get(request.parentId) : null;
      const ancestors = folder ? folderPath(folder) : [];
      const requestExamples = examples.filter(
        (example) => example?.enabled !== false && exampleMatchesRequest(example, request, collection),
      );
      const mocks = mockIndex.get(request.id) || requestMocksByIdentity(mockIndex, request);
      const latestResponse = latestResponseForRequest(project, request);
      const contract = buildRequestContract(request, protoIndex, latestResponse, mocks, requestExamples);
      const codeSamples = buildCodeSamples(request, collection, contract, options);
      const errors = buildErrorReference(request, contract, mocks, latestResponse, requestExamples);
      const responseContract = buildResponseContract(request, contract, mocks, latestResponse, requestExamples);
      const explicitRelated = new Set(stringArray(source?.related));
      const related = requests
        .filter(
          (item) =>
            item.id !== request.id &&
            (item.parentId === request.parentId ||
              explicitRelated.has(item.id) ||
              explicitRelated.has(`request:${item.id}`)),
        )
        .slice(0, 12)
        .map((item) => ({ id: `request:${item.id}`, title: item.name, protocol: item.kind }));
      pages.push(
        finalizePage(
          {
            id: `request:${request.id}`,
            kind: "request",
            entityId: request.id,
            collectionId: collection.id,
            folderId: request.parentId || undefined,
            title: stringOr(request.name, "Request"),
            summary: source?.summary || defaultRequestSummary(request),
            manualMarkdown: source?.markdown || "",
            manualPlacement: normalizeManualPlacement(source?.manualPlacement),
            sections: source?.sections || [],
            sourceMetadata: sourceMetadata(source),
            breadcrumbs: [
              { id: "workspace:overview", title: workspaceName },
              { id: `collection:${collection.id}`, title: stringOr(collection.name, "Collection") },
              ...ancestors.map((item) => ({ id: `folder:${item.id}`, title: item.name })),
            ],
            protocol: request.kind,
            request,
            contract,
            responseContract,
            errors,
            examples: requestExamples,
            mocks,
            latestResponse,
            codeSamples,
            related,
            children: [],
          },
          publications,
          documentation.settings,
        ),
      );
    }
  }
  return pages;
}

export function buildDocsTree(pages) {
  const byId = new Map(arrayOr(pages).map((page) => [page.id, page]));
  const root = byId.get("workspace:overview");
  const build = (id, seen = new Set()) => {
    if (seen.has(id)) return null;
    const page = byId.get(id);
    if (!page) return null;
    const nextSeen = new Set(seen).add(id);
    return {
      ...page,
      children: arrayOr(page.children)
        .map((child) => build(child, nextSeen))
        .filter(Boolean),
    };
  };
  return root ? build(root.id) : null;
}

export function renderDocumentationMarkdown(page, settings = {}) {
  const include = { ...defaultIncludeSettings(), ...settings };
  const metadata = page.sourceMetadata || {};
  const lines = [
    "<!-- Generated by Layang from executable workspace sources. -->",
    "---",
    `title: ${yamlScalar(page.title)}`,
    `kind: ${page.kind}`,
    page.protocol ? `protocol: ${page.protocol}` : "",
    page.request?.method ? `method: ${String(page.request.method).toUpperCase()}` : "",
    page.request?.url ? `target: ${yamlScalar(page.request.url)}` : "",
    metadata.deprecated ? "deprecated: true" : "",
    metadata.tags?.length ? `tags: ${JSON.stringify(metadata.tags)}` : "",
    metadata.audience?.length ? `audience: ${JSON.stringify(metadata.audience)}` : "",
    "---",
    "",
    `# ${page.title}`,
    "",
  ].filter(Boolean);

  if (page.kind === "request") lines.push(requestBadgeLine(page), "");
  if (metadata.deprecated)
    lines.push("> **Deprecated.** This operation remains documented for migration and compatibility purposes.", "");
  if (page.summary) lines.push(page.summary, "");
  if (metadata.tags?.length) lines.push(`Tags: ${metadata.tags.map((tag) => `\`${tag}\``).join(" · ")}`, "");

  const manual = String(page.manualMarkdown || "").trim();
  if (containsDocumentationMarker(manual)) {
    const rendered = renderDocumentationEditorMarkdown(page, manual, include).trim();
    if (rendered) lines.push(rendered, "");
    return cleanMarkdown(lines);
  }

  const sections = normalizeDocumentationSections(page.sections);
  if (sections.length) {
    for (const section of sections) {
      if (!section.enabled) continue;
      const markdown = renderDocumentationSectionMarkdown(page, section, include).trim();
      if (markdown) lines.push(markdown, "");
    }
    return cleanMarkdown(lines);
  }

  // Backward compatibility for workspaces created before section-based authoring.
  const placement = normalizeManualPlacement(page.manualPlacement);
  const renderAutomatic = () => {
    if (page.kind !== "request") {
      if (include.includeOverviewIndexes) renderOverviewReference(lines, page);
      return;
    }
    renderRequestReference(lines, page, include);
  };
  if (placement === "only") {
    if (manual) lines.push(manual, "");
    return cleanMarkdown(lines);
  }
  if (placement === "inline") {
    const marker = "{{LAYANG_AUTO_REFERENCE}}";
    const markerIndex = manual.indexOf(marker);
    if (markerIndex >= 0) {
      const before = manual.slice(0, markerIndex).trim();
      const after = manual.slice(markerIndex + marker.length).trim();
      if (before) lines.push(before, "");
      renderAutomatic();
      if (after) lines.push(after, "");
      return cleanMarkdown(lines);
    }
  }
  if (placement === "before" && manual) lines.push(manual, "");
  renderAutomatic();
  if ((placement === "after" || placement === "inline") && manual) lines.push(manual, "");
  return cleanMarkdown(lines);
}

export function renderDocumentationSectionMarkdown(page, section, settings = {}) {
  const normalized = normalizeDocumentationSection(section, 0);
  if (!normalized.enabled) return "";
  if (normalized.mode === "manual")
    return renameFirstSectionHeading(String(normalized.markdown || "").trim(), normalized.title).trim();
  if (normalized.mode === "auto-editable" && String(normalized.markdown || "").trim()) {
    return renameFirstSectionHeading(String(normalized.markdown || "").trim(), normalized.title).trim();
  }

  const include = { ...defaultIncludeSettings(), ...settings };
  const lines = [];
  switch (normalized.kind) {
    case "overview-index":
      renderOverviewReference(lines, page);
      break;
    case "reference":
      renderPrimaryRequestReference(lines, page, include);
      break;
    case "request-example":
      renderRequestExampleSection(lines, page);
      break;
    case "response-example":
      renderResponseExampleSection(lines, page);
      break;
    case "errors":
      renderErrors(lines, page.errors);
      break;
    case "mocks":
      renderMocks(lines, page.mocks, page.protocol);
      break;
    case "code-samples":
      renderCodeSamples(lines, page.codeSamples);
      break;
    case "related":
      renderRelatedRequests(lines, page.related);
      break;
    default:
      return String(normalized.markdown || "").trim();
  }
  return renameFirstSectionHeading(cleanMarkdown(lines), normalized.title).trim();
}

export function renderDocumentationEditorMarkdown(page, markdown, settings = {}) {
  let output = String(markdown || "");
  const primary = documentationPrimaryMarkerDefinition(page?.kind, page?.protocol || page?.request?.kind || "");
  if (primary) {
    const legacySection = {
      id: primary.kind,
      kind: primary.kind,
      title: primary.label,
      enabled: true,
      mode: "auto",
      markdown: "",
    };
    const legacyGenerated = renderDocumentationSectionMarkdown(page, legacySection, settings).trim();
    output = replaceMarkerLines(output, "{{LAYANG_AUTO_REFERENCE}}", legacyGenerated);
    output = replaceMarkerLines(output, "{{LAYANG_REFERENCE}}", legacyGenerated);
  }
  for (const definition of documentationMarkerDefinitions(page?.kind, page?.protocol || page?.request?.kind || "")) {
    const section = {
      id: definition.kind,
      kind: definition.kind,
      title: definition.label,
      enabled: true,
      mode: "auto",
      markdown: "",
    };
    const generated = stripFirstSectionHeading(renderDocumentationSectionMarkdown(page, section, settings)).trim();
    output = replaceMarkerLines(output, definition.marker, generated);
  }
  return output.replace(/\n{3,}/g, "\n\n").trim();
}

export function validateDocumentationPage(page) {
  const errors = [];
  const warnings = [];
  if (!String(page?.title || "").trim())
    errors.push({ code: "MISSING_TITLE", message: "The documentation page has no title." });
  if (!String(page?.summary || "").trim())
    warnings.push({ code: "MISSING_SUMMARY", message: "Add a concise summary for search results and page headers." });
  const editorMarkdown = String(page?.manualMarkdown || "");
  const sections = normalizeDocumentationSections(page?.sections);
  const referenceEnabled =
    hasPrimaryReferenceMarker(editorMarkdown, page?.kind, page?.protocol || page?.request?.kind) ||
    sections.some((section) => section.enabled && section.kind === "reference" && section.mode !== "manual");
  const hasManualNarrative =
    stripDocumentationMarkers(editorMarkdown).trim().length > 0 ||
    sections.some((section) => section.enabled && section.mode !== "auto" && String(section.markdown || "").trim());
  if (page?.kind === "request" && page.protocol === "grpc" && page.contract?.unresolved && referenceEnabled) {
    errors.push({
      code: "SCHEMA_UNRESOLVED",
      message:
        "The pinned proto revision or RPC method cannot be resolved. Disable the automatic reference, convert it to editable Markdown, or repair the proto reference.",
    });
  } else if (page?.kind !== "request" && !hasManualNarrative) {
    warnings.push({
      code: "MISSING_OVERVIEW_NARRATIVE",
      message: "Add a manual overview or keep the generated index only.",
    });
  }
  return { errors, warnings };
}

export function buildCodeSamples(request, collection, contract = {}, _options = {}) {
  const collectionName = stringOr(collection?.name, "Collection");
  const requestName = stringOr(request?.name, "Request");
  const cli = `layang run ./workspace --collection ${shellQuote(collectionName)} --request ${shellQuote(requestName)}`;
  if (request.kind === "grpc") {
    const target = stringOr(request.url, "{{grpcTarget}}");
    const method = stringOr(request.grpc?.methodFullName || request.grpcMethodKey, "service/Method");
    const metadata = headerArgs(request.headers, "-H");
    const body = normalizedBody(request.body);
    return [
      { id: "layang-cli", label: "Layang CLI", language: "bash", code: cli, executable: true },
      {
        id: "grpcurl",
        label: "grpcurl",
        language: "bash",
        code: ["grpcurl", metadata, `-d ${shellQuote(body)}`, target, method].filter(Boolean).join(" \\\n  "),
      },
      { id: "node-grpc", label: "Node.js", language: "javascript", code: renderNodeGrpcSample(request, contract) },
      { id: "python-grpc", label: "Python", language: "python", code: renderPythonGrpcSample(request, contract) },
    ];
  }
  if (request.kind === "websocket") {
    const url = stringOr(request.url, "{{websocketUrl}}");
    return [
      { id: "layang-cli", label: "Layang CLI", language: "bash", code: cli, executable: true },
      {
        id: "browser-websocket",
        label: "Browser",
        language: "javascript",
        code: renderBrowserWebSocketSample(url, request.body),
      },
      {
        id: "node-websocket",
        label: "Node.js",
        language: "javascript",
        code: renderNodeWebSocketSample(url, request.body),
      },
      {
        id: "wscat",
        label: "wscat",
        language: "bash",
        code:
          request.body && String(request.body).trim()
            ? `wscat -c ${shellQuote(url)} -x ${shellQuote(String(request.body))}`
            : `wscat -c ${shellQuote(url)}`,
      },
    ];
  }
  const method = String(request.method || "GET").toUpperCase();
  const url = stringOr(request.url, "{{baseUrl}}");
  const body = normalizedBody(request.body);
  const headers = enabledPairs(request.headers);
  return [
    { id: "layang-cli", label: "Layang CLI", language: "bash", code: cli, executable: true },
    { id: "curl", label: "cURL", language: "bash", code: renderCurlSample(method, url, headers, body) },
    { id: "fetch", label: "JavaScript", language: "javascript", code: renderFetchSample(method, url, headers, body) },
    {
      id: "python-requests",
      label: "Python",
      language: "python",
      code: renderPythonRequestsSample(method, url, headers, body),
    },
  ];
}

export function renderStaticDocsSite(pages, options = {}) {
  const title = stringOr(options.title, "Layang API Docs");
  const linkedPages = arrayOr(pages).map((page) => attachPageLinks(page, (id) => `?page=${encodeURIComponent(id)}`));
  const rendered = linkedPages.map((page) => {
    const markdown = renderDocumentationMarkdown(page, options.include);
    const html = markdownToBasicHtml(markdown);
    const outline = extractMarkdownHeadings(markdown);
    const searchableText = stripMarkdownForSearch(markdown);
    return {
      id: page.id,
      title: page.title,
      kind: page.kind,
      protocol: page.protocol || "",
      status: page.status,
      deprecated: Boolean(page.sourceMetadata?.deprecated),
      breadcrumbs: arrayOr(page.breadcrumbs),
      children: arrayOr(page.children),
      summary: page.summary || "",
      tags: stringArray(page.sourceMetadata?.tags),
      outline,
      searchableText,
      html,
    };
  });
  const index = rendered.map(({ html: _html, ...item }) => item);
  const first = rendered.find((page) => page.id === "workspace:overview") || rendered[0];
  return {
    files: {
      "index.html": renderSiteShell(title, first?.id || ""),
      "search-index.json": `${JSON.stringify(index, null, 2)}\n`,
      "pages.json": `${JSON.stringify(Object.fromEntries(rendered.map((page) => [page.id, page.html])), null, 2)}\n`,
      "assets/data.js": `window.__LAYANG_DOCS_INDEX__=${JSON.stringify(index).replace(/</g, "\\u003c")};window.__LAYANG_DOCS_PAGES__=${JSON.stringify(Object.fromEntries(rendered.map((page) => [page.id, page.html]))).replace(/</g, "\\u003c")};`,
      "assets/docs.css": staticDocsCss(),
      "assets/site.js": staticDocsJs(title),
    },
  };
}

export function renderWikiDocsBundle(pages, options = {}) {
  const title = stringOr(options.title, "Layang API Reference");
  const allPages = arrayOr(pages);
  const pathById = new Map(allPages.map((page) => [page.id, wikiPagePath(page, allPages)]));
  const files = {};
  for (const page of allPages) {
    const currentPath = pathById.get(page.id);
    const linked = attachPageLinks(page, (id) => {
      const target = pathById.get(id);
      return target ? relativeWikiPath(currentPath, target) : "";
    });
    files[currentPath] = cleanWikiMarkdown(renderDocumentationMarkdown(linked, options.include));
  }
  files["SUMMARY.md"] = renderWikiSummary(allPages, pathById, title);
  files["IMPORT.md"] =
    `# Import this reference into a wiki\n\nThis directory contains clean, linked Markdown. Import the folder or the Markdown files into Outline, GitBook, Docusaurus, MkDocs, or another wiki.\n\n- Start with \`README.md\`.\n- \`SUMMARY.md\` preserves the workspace, collection, folder, and operation hierarchy.\n- All links are relative, so the reference remains navigable after moving the directory.\n- Secrets are redacted and disabled headers or parameters are excluded.\n`;
  return { files, pathById: Object.fromEntries(pathById) };
}

function wikiPagePath(page, pages) {
  if (page.kind === "workspace") return "README.md";
  const collection = pages.find(
    (item) => item.kind === "collection" && item.entityId === (page.collectionId || page.entityId),
  );
  const segments = collection ? [wikiSegment(collection.title, collection.entityId)] : [];
  for (const crumb of arrayOr(page.breadcrumbs))
    if (String(crumb.id).startsWith("folder:")) segments.push(wikiSegment(crumb.title, crumb.id));
  if (page.kind === "collection") return [...segments, "README.md"].join("/");
  if (page.kind === "folder") return [...segments, wikiSegment(page.title, page.id), "README.md"].join("/");
  return [...segments, `${wikiSegment(page.title, page.id)}.md`].join("/");
}

function wikiSegment(title, id) {
  const slug =
    String(title || "page")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "page";
  return `${slug}--${stableDocsHash(id).slice(-8)}`;
}

function relativeWikiPath(from, to) {
  const fromParts = String(from || "README.md").split("/");
  fromParts.pop();
  const toParts = String(to || "README.md").split("/");
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => ".."), ...toParts].join("/") || "./README.md";
}

function renderWikiSummary(pages, pathById, title) {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const root = byId.get("workspace:overview") || pages.find((page) => page.kind === "workspace");
  const lines = [`# ${title}`, "", `- [${root?.title || title}](${pathById.get(root?.id) || "README.md"})`];
  const walk = (id, depth, seen = new Set()) => {
    if (seen.has(id)) return;
    const page = byId.get(id);
    if (!page) return;
    const nextSeen = new Set(seen).add(id);
    for (const childId of arrayOr(page.children)) {
      const child = byId.get(childId);
      if (!child) continue;
      lines.push(`${"  ".repeat(depth)}- [${child.title}](${pathById.get(child.id)})`);
      walk(child.id, depth + 1, nextSeen);
    }
  };
  if (root) walk(root.id, 1);
  return `${lines.join("\n")}\n`;
}

function cleanWikiMarkdown(markdown) {
  return `${String(markdown || "")
    .replace(/^<!--[\s\S]*?-->\s*/, "")
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "")
    .replace(/^\[Open in Layang\]\([^\n]+\)\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

function finalizePage(page, publications, settings) {
  const sections = normalizeDocumentationSections(page.sections);
  const normalizedPage = { ...page, sections };
  const sourcePayload = {
    kind: normalizedPage.kind,
    entityId: normalizedPage.entityId,
    title: normalizedPage.title,
    summary: normalizedPage.summary,
    manualMarkdown: normalizedPage.manualMarkdown,
    manualPlacement: normalizedPage.manualPlacement,
    sections,
    sourceMetadata: normalizedPage.sourceMetadata,
    overview: normalizedPage.overview,
    request: normalizedPage.request,
    contract: normalizedPage.contract,
    responseContract: normalizedPage.responseContract,
    errors: normalizedPage.errors,
    examples: normalizedPage.examples,
    mocks: normalizedPage.mocks,
    codeSamples: normalizedPage.codeSamples,
    related: normalizedPage.related,
    settings,
  };
  const sourceHash = stableDocsHash(sourcePayload);
  const publication = publications.get(normalizedPage.id) || null;
  const validation = validateDocumentationPage(normalizedPage);
  const hasManualContent =
    stripDocumentationMarkers(normalizedPage.manualMarkdown).trim().length > 0 ||
    sections.some((section) => section.enabled && section.mode !== "auto" && String(section.markdown || "").trim());
  const status = validation.errors.length
    ? "error"
    : !hasManualContent && normalizedPage.kind !== "request"
      ? "draft"
      : !publication
        ? "ready"
        : publication.sourceHash === sourceHash
          ? "published"
          : "outdated";
  return { ...normalizedPage, sourceHash, publication, status, validation };
}

function buildRequestContract(request, protoIndex, latestResponse, mocks, examples) {
  if (request.kind === "grpc") return buildGrpcContract(request, protoIndex);
  if (request.kind === "websocket") return buildWebSocketContract(request, latestResponse, mocks, examples);
  return buildRestContract(request, latestResponse, mocks, examples);
}

function buildGrpcContract(request, protoIndex) {
  const methodKey = request.grpc?.methodFullName || request.grpcMethodKey || "";
  const bindingKey = `${request.grpc?.libraryId || ""}:${request.grpc?.versionId || ""}:${methodKey}`;
  const method = protoIndex.methodsByBinding.get(bindingKey) || protoIndex.methods.get(methodKey) || null;
  return {
    protocol: "grpc",
    libraryId: request.grpc?.libraryId || "",
    libraryName: method?.libraryName || "",
    revisionId: request.grpc?.versionId || "",
    revisionLabel: method?.versionLabel || "",
    methodFullName: methodKey,
    packageName: method?.packageName || "",
    serviceName: method?.serviceName || splitLast(methodKey, "/")[0],
    methodName: method?.methodName || splitLast(methodKey, "/")[1],
    description: method?.description || "",
    requestType: request.grpc?.requestType || method?.requestType || "",
    responseType: request.grpc?.responseType || method?.responseType || "",
    requestStream: Boolean(method?.requestStream),
    responseStream: Boolean(method?.responseStream),
    sourceFile: method?.sourceFile || "",
    protoSource: method?.sourceText || "",
    requestFields: method?.requestFields || [],
    responseFields: method?.responseFields || [],
    requestEnums: method?.requestEnums || [],
    responseEnums: method?.responseEnums || [],
    unresolved: !method,
  };
}

function buildRestContract(request, latestResponse, mocks, examples) {
  const body = safeJson(request.body);
  const responseExamples = collectResponseValues(latestResponse, mocks, examples);
  return {
    protocol: "rest",
    method: String(request.method || "GET").toUpperCase(),
    url: stringOr(request.url, "{{baseUrl}}"),
    pathParams: pairFields(request.restPathParams, "path"),
    queryParams: pairFields(request.restParams, "query"),
    headers: pairFields(request.headers, "header"),
    auth: request.restAuth || { type: "none" },
    bodyType: request.restBodyType || inferBodyType(request.body),
    requestFields: inferJsonFields(body),
    responseFields: inferJsonFields(responseExamples.find((value) => isObject(value) || Array.isArray(value))),
    contentTypes: inferContentTypes(request.headers, mocks),
    responseStatuses: uniqueNumbers([
      ...activeScenarios(mocks)
        .map((mock) => Number(mock.status))
        .filter(Number.isFinite),
      Number(latestResponse?.httpStatus || latestResponse?.status),
    ]),
  };
}

function buildWebSocketContract(request, latestResponse, mocks, examples) {
  const outbound = safeJson(request.body);
  const inboundValues = collectResponseValues(latestResponse, mocks, examples);
  const configuredEvents = arrayOr(request.events).map((event) => ({
    name: event.name || event.type || "message",
    direction: event.direction || "client ↔ server",
    path: event.path || request.url || "",
    description: event.description || "Configured WebSocket event",
    payload: event.payload ?? event.example,
  }));
  const mockEvents = arrayOr(mocks)
    .filter((mock) => mock?.enabled !== false)
    .map((mock) => ({
      name: mock.name || mock.id || "message",
      direction: mock.streamOnConnect
        ? "server → client"
        : mock.sendOnMessage === false
          ? "server → client"
          : "client ↔ server",
      path: mock.path || request.url || "",
      description: mock.matchMode ? `Match: ${mock.matchMode}` : "Configured mock message",
      payload: safeJson(mock.responseText ?? mock.body ?? mock.response?.data ?? mock.output?.data),
    }));
  const configuredCloseCodes = arrayOr(request.closeCodes)
    .map((item) => ({
      code: Number(item.code),
      meaning: item.meaning || item.description || "Configured close code",
    }))
    .filter((item) => Number.isFinite(item.code));
  return {
    protocol: "websocket",
    url: stringOr(request.url, "{{websocketUrl}}"),
    headers: pairFields(request.headers, "header"),
    subprotocols: stringArray(request.subprotocols || request.websocketSubprotocols),
    outboundFields: inferJsonFields(outbound),
    inboundFields: inferJsonFields(inboundValues.find((value) => isObject(value) || Array.isArray(value))),
    events: dedupeBy([...configuredEvents, ...mockEvents], (item) => `${item.name}:${item.direction}:${item.path}`),
    closeCodes: dedupeBy([{ code: 1000, meaning: "Normal closure" }, ...configuredCloseCodes], (item) =>
      String(item.code),
    ),
  };
}

function buildResponseContract(request, contract, mocks, latestResponse, examples) {
  const values = collectResponseValues(latestResponse, mocks, examples);
  const preferred = values.find((value) => value !== undefined && value !== null);
  if (request.kind === "grpc") {
    return {
      type: contract.responseType || "unknown",
      streaming: streamLabel(contract),
      fields: contract.responseFields || [],
      example: preferred ?? generatedExampleFromFields(contract.responseFields),
      source: preferred != null ? "saved or configured response" : "generated from pinned proto revision",
    };
  }
  if (request.kind === "websocket") {
    return {
      type: "WebSocket message",
      fields: contract.inboundFields || [],
      example: preferred ?? generatedExampleFromFields(contract.inboundFields),
      source: preferred != null ? "saved or configured message" : "inferred message contract",
    };
  }
  return {
    type: contract.contentTypes?.[0] || "application/json",
    statuses: contract.responseStatuses || [],
    fields: contract.responseFields || [],
    example: preferred ?? generatedExampleFromFields(contract.responseFields),
    source: preferred != null ? "saved response or mock scenario" : "inferred response contract",
  };
}

function buildErrorReference(request, contract, mocks, latestResponse, examples) {
  const errors = [];
  if (request.kind === "rest") {
    for (const mock of activeScenarios(mocks)) {
      const status = Number(mock.status);
      if (status >= 400)
        errors.push({
          code: String(status),
          meaning: httpStatusMeaning(status),
          when: mock.name || mock.id || "Configured mock scenario",
          example: safeJson(mock.body),
        });
    }
    const status = Number(latestResponse?.httpStatus || latestResponse?.status);
    if (status >= 400)
      errors.push({
        code: String(status),
        meaning: httpStatusMeaning(status),
        when: "Latest saved response",
        example: latestResponse?.body || latestResponse,
      });
  } else if (request.kind === "grpc") {
    for (const mock of activeScenarios(mocks)) {
      const code = mock.response?.code ?? mock.output?.code ?? mock.code;
      if (code != null && ![0, "0", "OK"].includes(code))
        errors.push({
          code: grpcStatusName(code),
          meaning: grpcStatusMeaning(code),
          when: mock.description || mock.id || "Configured mock scenario",
          example: mock.response?.data ?? mock.output?.data,
        });
    }
    const trailerCode = latestResponse?.trailers?.["grpc-status"];
    if (trailerCode != null && String(trailerCode) !== "0")
      errors.push({
        code: grpcStatusName(trailerCode),
        meaning: grpcStatusMeaning(trailerCode),
        when: latestResponse?.trailers?.["grpc-message"] || "Latest saved response",
      });
    if (contract.unresolved)
      errors.push({
        code: "SCHEMA_UNAVAILABLE",
        meaning: "The pinned proto method cannot be resolved.",
        when: "The schema library or revision was deleted or changed.",
      });
  } else {
    for (const mock of activeScenarios(mocks)) {
      if (mock.matchMode === "regex" || mock.matchMode === "jsonPath")
        errors.push({
          code: "NO_MATCH",
          meaning: "The incoming message did not match the configured scenario.",
          when: mock.name || mock.id || "Configured scenario",
        });
    }
    const logs = arrayOr(latestResponse?.logs).filter((log) => log?.type === "error");
    for (const log of logs)
      errors.push({
        code: "MESSAGE_ERROR",
        meaning: log.message || "WebSocket message error",
        when: "Latest saved runtime log",
      });
  }
  for (const example of arrayOr(examples).filter(
    (item) => item?.enabled !== false && String(item?.expectedStatus || "").trim(),
  )) {
    const code = String(example.expectedStatus).trim();
    const documentation = normalizeExampleDocumentation(example.documentation);
    const when = documentation.whenThisHappens || documentation.summary || example.name || "Saved example";
    if (request.kind === "rest") {
      const status = Number(code);
      if (status >= 400)
        errors.push({
          code: String(status),
          meaning: httpStatusMeaning(status),
          when,
          example: safeJson(example.expectedJson),
        });
    } else if (request.kind === "grpc") {
      if (!["0", "OK"].includes(code.toUpperCase()))
        errors.push({
          code: grpcStatusName(code),
          meaning: grpcStatusMeaning(code),
          when,
          example: safeJson(example.expectedJson),
        });
    } else if (!/[2][0-9][0-9]|OK|SUCCESS/i.test(code)) {
      errors.push({
        code,
        meaning: documentation.summary || "Saved WebSocket error example",
        when,
        example: safeJson(example.expectedJson),
      });
    }
  }
  return dedupeBy(errors, (item) => `${item.code}:${item.when}`);
}

function buildProtoIndex(libraries) {
  const methods = new Map();
  const methodsByBinding = new Map();
  for (const library of libraries) {
    for (const version of arrayOr(library.versions)) {
      const parsed = parseProtoSchema(arrayOr(version.files));
      for (const method of parsed.methods) {
        const requestMessage =
          parsed.messages.get(method.requestType) || parsed.messages.get(shortProtoName(method.requestType));
        const responseMessage =
          parsed.messages.get(method.responseType) || parsed.messages.get(shortProtoName(method.responseType));
        const compiledMethod = {
          ...method,
          libraryId: library.id,
          libraryName: library.name || "",
          versionId: version.id,
          versionLabel: version.version || "",
          requestFields: expandMessageFields(requestMessage, parsed),
          responseFields: expandMessageFields(responseMessage, parsed),
          requestEnums: enumsReferencedBy(requestMessage, parsed),
          responseEnums: enumsReferencedBy(responseMessage, parsed),
        };
        methods.set(method.fullName, compiledMethod);
        methodsByBinding.set(`${library.id}:${version.id}:${method.fullName}`, compiledMethod);
      }
    }
  }
  return { methods, methodsByBinding };
}

function parseProtoSchema(files) {
  const messages = new Map();
  const enums = new Map();
  const methods = [];
  for (const file of files) {
    const sourceText = String(file.text || "");
    const text = stripProtoBlockComments(sourceText);
    const sourceFile = file.name || "schema.proto";
    const packageName = text.match(/\bpackage\s+([\w.]+)\s*;/)?.[1] || "";
    for (const item of parseNamedBlocks(text, "enum")) {
      const values = [];
      const valueRegex = /(?:^|(?<=[;\n]))\s*(?:\/\/\s*([^\n]+)\n\s*)?(\w+)\s*=\s*(-?\d+)\s*;/g;
      for (let match = valueRegex.exec(item.body); match; match = valueRegex.exec(item.body)) {
        values.push({ name: match[2], number: Number(match[3]), description: String(match[1] || "").trim() });
      }
      const fullName = packageName ? `${packageName}.${item.name}` : item.name;
      const record = { name: item.name, fullName, values, sourceFile };
      enums.set(fullName, record);
      enums.set(item.name, record);
    }
    for (const item of parseNamedBlocks(text, "message")) {
      const oneofBlocks = parseNamedBlocks(item.body, "oneof");
      const normalBody = removeNamedBlocks(item.body, "oneof");
      const fields = parseProtoFields(normalBody, sourceFile);
      for (const block of oneofBlocks) {
        for (const field of parseProtoFields(block.body, sourceFile)) {
          fields.push({ ...field, oneof: block.name, optional: true, required: false });
        }
      }
      const fullName = packageName ? `${packageName}.${item.name}` : item.name;
      const record = { name: item.name, fullName, fields, oneofs: oneofBlocks.map((block) => block.name), sourceFile };
      messages.set(fullName, record);
      messages.set(item.name, record);
    }
    for (const service of parseNamedBlocks(text, "service")) {
      const serviceName = packageName ? `${packageName}.${service.name}` : service.name;
      const rpcRegex =
        /(?:\/\/\s*([^\n]+)\n\s*)?rpc\s+(\w+)\s*\(\s*(stream\s+)?([\w.]+)\s*\)\s*returns\s*\(\s*(stream\s+)?([\w.]+)\s*\)/g;
      for (let rpc = rpcRegex.exec(service.body); rpc; rpc = rpcRegex.exec(service.body)) {
        methods.push({
          packageName,
          serviceName,
          methodName: rpc[2],
          fullName: `${serviceName}/${rpc[2]}`,
          description: String(rpc[1] || "").trim(),
          requestStream: Boolean(rpc[3]),
          requestType: rpc[4],
          responseStream: Boolean(rpc[5]),
          responseType: rpc[6],
          sourceFile,
          sourceText,
        });
      }
    }
  }
  return { messages, enums, methods };
}

function parseProtoFields(body, sourceFile) {
  const fields = [];
  const fieldRegex =
    /(?:^|(?<=[;\n]))\s*(?:\/\/\s*([^\n]+)\n\s*)?(?:(repeated|optional|required)\s+)?(map\s*<\s*[\w.]+\s*,\s*[\w.]+\s*>|[\w.]+)\s+(\w+)\s*=\s*(\d+)(?:\s*\[([^\]]*)\])?\s*;/g;
  for (let match = fieldRegex.exec(body); match; match = fieldRegex.exec(body)) {
    const options = String(match[6] || "");
    fields.push({
      name: match[4],
      type: match[3].replace(/\s+/g, " "),
      number: Number(match[5]),
      repeated: match[2] === "repeated",
      optional: match[2] === "optional",
      required: match[2] === "required" || /\brequired\s*=\s*true\b/i.test(options),
      deprecated: /\bdeprecated\s*=\s*true\b/i.test(options),
      rules: parseFieldRules(options),
      description: String(match[1] || "").trim(),
      sourceFile,
    });
  }
  return fields;
}

function expandMessageFields(message, parsed, prefix = "", depth = 0, lineage = new Set()) {
  if (!message || depth > 6 || lineage.has(message.fullName || message.name)) return [];
  const nextLineage = new Set(lineage).add(message.fullName || message.name);
  const output = [];
  for (const field of message.fields) {
    const enumType = parsed.enums.get(field.type) || parsed.enums.get(shortProtoName(field.type));
    const nested = parsed.messages.get(field.type) || parsed.messages.get(shortProtoName(field.type));
    const segment = field.repeated ? `${field.name}[]` : field.name;
    const name = prefix ? `${prefix}.${segment}` : segment;
    const rules = [field.rules, field.oneof ? `oneof: ${field.oneof}` : ""].filter(Boolean).join(", ");
    output.push({
      ...field,
      name,
      rules,
      enumValues: enumType?.values || [],
      nestedType: nested?.fullName || "",
    });
    if (nested) output.push(...expandMessageFields(nested, parsed, name, depth + 1, nextLineage));
  }
  return output;
}

function enumsReferencedBy(message, parsed, visited = new Set()) {
  if (!message || visited.has(message.fullName || message.name)) return [];
  const nextVisited = new Set(visited).add(message.fullName || message.name);
  const output = [];
  for (const field of message.fields) {
    const item = parsed.enums.get(field.type) || parsed.enums.get(shortProtoName(field.type));
    if (item) output.push(item);
    const nested = parsed.messages.get(field.type) || parsed.messages.get(shortProtoName(field.type));
    if (nested) output.push(...enumsReferencedBy(nested, parsed, nextVisited));
  }
  return dedupeBy(output, (item) => item.fullName);
}

function parseNamedBlocks(text, keyword) {
  const output = [];
  const regex = new RegExp(`\\b${keyword}\\s+(\\w+)\\s*\\{`, "g");
  for (let match = regex.exec(text); match; match = regex.exec(text)) {
    let depth = 1;
    let cursor = regex.lastIndex;
    while (cursor < text.length && depth > 0) {
      if (text[cursor] === "{") depth += 1;
      else if (text[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    output.push({ name: match[1], body: text.slice(regex.lastIndex, Math.max(regex.lastIndex, cursor - 1)) });
    regex.lastIndex = cursor;
  }
  return output;
}

function buildMockIndex(project, grpcScenarios) {
  const output = new Map();
  for (const scenario of arrayOr(project?.restMockServer?.scenarios))
    if (scenario.requestId) appendMap(output, scenario.requestId, scenario);
  for (const scenario of arrayOr(project?.wsMockServer?.scenarios))
    if (scenario.requestId) appendMap(output, scenario.requestId, scenario);
  for (const scenario of arrayOr(grpcScenarios))
    appendMap(output, `grpc:${scenario.service}/${scenario.method}`, scenario);
  return output;
}

function requestMocksByIdentity(index, request) {
  if (request.kind !== "grpc") return [];
  return index.get(`grpc:${request.grpc?.methodFullName || request.grpcMethodKey || ""}`) || [];
}

function latestResponseForRequest(project, request) {
  const session = arrayOr(project?.requestTabs).find(
    (item) => item.sourceRequestId === request.id || item.id === request.id,
  );
  if (session?.lastResult) return session.lastResult;
  if (request.kind === "grpc") {
    const identity = request.grpc?.methodFullName || request.grpcMethodKey;
    const result = arrayOr(project?.docResults).find(
      (item) => (item.grpc?.methodFullName || item.methodKey) === identity,
    );
    if (result?.result) return result.result;
  }
  return null;
}

function renderOverviewReference(lines, page) {
  const overview = page.overview || {};
  lines.push("## Overview Summary", "");
  if (page.kind === "workspace") {
    lines.push(
      `- Collections: **${overview.collectionCount || 0}**`,
      `- Operations: **${overview.operationCount || 0}**`,
      `- Protocols: ${formatProtocolCounts(overview.protocols)}`,
      "",
    );
    if (overview.collections?.length) {
      lines.push("## Collections", "", "| Collection | Operations | Description |", "|---|---:|---|");
      for (const item of overview.collections)
        lines.push(
          `| ${markdownLink(item.title, item.href)} | ${item.operationCount || 0} | ${escapeTable(item.summary || "")} |`,
        );
      lines.push("");
    }
    return;
  }
  lines.push(
    `- Operations: **${overview.operationCount || 0}**`,
    overview.folderCount != null ? `- Folders: **${overview.folderCount}**` : "",
    `- Protocols: ${formatProtocolCounts(overview.protocols)}`,
    "",
  );
  if (overview.folders?.length) {
    lines.push("## Folders", "", "| Folder | Description |", "|---|---|");
    for (const item of overview.folders)
      lines.push(`| ${markdownLink(item.title, item.href)} | ${escapeTable(item.summary || "")} |`);
    lines.push("");
  }
  if (overview.operations?.length) {
    lines.push(
      "## Operations",
      "",
      "| Operation | Protocol | Method / Type | Target | Summary |",
      "|---|---|---|---|---|",
    );
    for (const item of overview.operations)
      lines.push(
        `| ${markdownLink(item.title, item.href)} | ${String(item.protocol || "").toUpperCase()} | \`${escapeTable(item.method)}\` | \`${escapeTable(item.target)}\` | ${escapeTable(item.summary || "")} |`,
      );
    lines.push("");
  }
}

function renderRequestReference(lines, page, include) {
  renderPrimaryRequestReference(lines, page, include);
  if (include.includeResponseContracts) renderResponseExampleSection(lines, page);
  if (include.includeErrors) renderErrors(lines, page.errors);
  if (include.includeExamples && page.examples?.length) renderExamples(lines, page.examples);
  if (include.includeMocks && page.mocks?.length) renderMocks(lines, page.mocks, page.protocol);
  if (include.includeCodeSamples && page.codeSamples?.length) renderCodeSamples(lines, page.codeSamples);
  if (include.includeRelatedRequests && page.related?.length) renderRelatedRequests(lines, page.related);
}

function renderPrimaryRequestReference(lines, page, _include) {
  const request = page.request || {};
  const contract = page.contract || {};
  if (request.kind === "grpc") {
    lines.push("## Proto Reference", "");
    if (contract.unresolved) {
      lines.push("> **Proto unavailable.** The pinned proto revision or RPC method cannot be resolved.", "");
    } else if (String(contract.protoSource || "").trim()) {
      const sourceLabel = [
        contract.sourceFile || "schema.proto",
        contract.libraryName || contract.libraryId,
        contract.revisionLabel || contract.revisionId,
      ]
        .filter(Boolean)
        .map((item) => `\`${escapeTable(item)}\``)
        .join(" · ");
      if (sourceLabel) lines.push(sourceLabel, "");
      lines.push(protoCodeBlock(contract.protoSource), "");
    } else {
      lines.push(`Pinned proto: \`${escapeTable(contract.sourceFile || "schema.proto")}\`.`, "");
    }
    return;
  }
  if (request.kind === "websocket") {
    lines.push(
      "## Connection Reference",
      "",
      "| Property | Value |",
      "|---|---|",
      `| URL | \`${escapeTable(contract.url)}\` |`,
      `| Subprotocols | ${contract.subprotocols?.length ? contract.subprotocols.map((item) => `\`${item}\``).join(", ") : "None"} |`,
      "",
    );
    return;
  }
  lines.push(
    "## Endpoint Reference",
    "",
    "| Property | Value |",
    "|---|---|",
    `| Method | \`${contract.method}\` |`,
    `| URL | \`${escapeTable(contract.url)}\` |`,
    "",
  );
}

function renderRequestExampleSection(lines, page) {
  const example = arrayOr(page.examples).find((item) => item?.enabled !== false);
  const value = example?.requestJson ?? example?.request ?? page.request?.body;
  lines.push("## Request Example", "");
  if (value == null || value === "") {
    lines.push("No request example has been saved yet.", "");
    return;
  }
  lines.push("```json", prettyJson(value), "```", "");
}

function renderResponseExampleSection(lines, page) {
  const response = page.responseContract || {};
  lines.push("## Response Example", "");
  if (response.type) lines.push(`Contract: \`${escapeTable(response.type)}\``, "");
  if (response.example == null) {
    lines.push("No response example has been saved yet.", "");
    return;
  }
  lines.push("```json", prettyJson(response.example), "```", response.source ? `Source: ${response.source}.` : "", "");
}

function renderRelatedRequests(lines, related) {
  const items = arrayOr(related);
  lines.push("## Related Operations", "");
  if (!items.length) {
    lines.push("No related operations are configured.", "");
    return;
  }
  for (const item of items)
    lines.push(`- ${markdownLink(item.title, item.href)} (${String(item.protocol).toUpperCase()})`);
  lines.push("");
}

function protoCodeBlock(source) {
  const text = String(source || "").trimEnd();
  const longestFence = Math.max(3, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length + 1));
  const fence = "`".repeat(longestFence);
  return `${fence}proto\n${text}\n${fence}`;
}

function _renderAuthentication(lines, request) {
  const headers = enabledPairs(request.headers);
  const authHeaders = headers.filter((item) => /authorization|api[-_]?key|token/i.test(item?.key || ""));
  const restAuth = request.restAuth;
  if (!authHeaders.length && (!restAuth || restAuth.type === "none")) return;
  lines.push("## Authentication and Permissions", "");
  if (restAuth && restAuth.type !== "none") lines.push(`Authentication type: \`${restAuth.type}\``, "");
  for (const item of authHeaders) lines.push(`- \`${item.key}\`: \`${redactSecretValue(item.key, item.value)}\``);
  lines.push("");
}

function _renderParameterTable(lines, title, fields) {
  const items = arrayOr(fields);
  if (!items.length) return;
  lines.push(`### ${title}`, "", "| Name | Required | Example |", "|---|---:|---|");
  for (const item of items)
    lines.push(
      `| \`${escapeTable(item.name)}\` | ${item.required ? "Yes" : "No"} | \`${escapeTable(item.example)}\` |`,
    );
  lines.push("");
}

function _renderFieldTable(lines, title, fields) {
  const items = arrayOr(fields);
  if (!items.length) return;
  lines.push(`### ${title}`, "", "| Field | Type | Required | Rules | Description |", "|---|---|---:|---|---|");
  for (const field of items) {
    const type = `${field.repeated ? "repeated " : ""}${field.type || "unknown"}`;
    const rules = [field.optional ? "optional" : "", field.deprecated ? "deprecated" : "", field.rules || ""]
      .filter(Boolean)
      .join(", ");
    lines.push(
      `| \`${escapeTable(field.name)}\` | \`${escapeTable(type)}\` | ${field.required ? "Yes" : "No"} | ${escapeTable(rules)} | ${escapeTable(field.description || "")} |`,
    );
  }
  lines.push("");
}

function _renderEnumTables(lines, enums) {
  for (const item of arrayOr(enums)) {
    lines.push(`### Enum ${item.name}`, "", "| Value | Number | Description |", "|---|---:|---|");
    for (const value of arrayOr(item.values))
      lines.push(`| \`${escapeTable(value.name)}\` | ${value.number} | ${escapeTable(value.description || "")} |`);
    lines.push("");
  }
}

function renderErrors(lines, errors) {
  const items = arrayOr(errors);
  lines.push("## Errors", "");
  if (!items.length) {
    lines.push(
      "No structured error examples have been saved yet. Add an error response example or mock scenario to document it automatically.",
      "",
    );
    return;
  }
  lines.push("| Code / Status | Meaning | When returned |", "|---|---|---|");
  for (const item of items)
    lines.push(
      `| \`${escapeTable(item.code)}\` | ${escapeTable(item.meaning || "")} | ${escapeTable(item.when || "")} |`,
    );
  lines.push("");
  for (const item of items.filter((entry) => entry.example != null))
    lines.push(`### ${item.code} Example`, "", "```json", prettyJson(item.example), "```", "");
}

function renderExamples(lines, examples) {
  lines.push("## Examples", "");
  for (const example of arrayOr(examples).filter((item) => item?.enabled !== false)) {
    const documentation = normalizeExampleDocumentation(example.documentation);
    lines.push(`### ${example.name || example.id || "Example"}`, "");
    const badges = [
      example.expectedStatus ? `Status: \`${escapeTable(example.expectedStatus)}\`` : "",
      stringArray(example.tags).length
        ? `Tags: ${stringArray(example.tags)
            .map((tag) => `\`${escapeTable(tag)}\``)
            .join(", ")}`
        : "",
    ].filter(Boolean);
    if (badges.length) lines.push(badges.join(" · "), "");
    if (documentation.summary) lines.push(documentation.summary, "");
    if (documentation.whenThisHappens) lines.push("#### When this happens", "", documentation.whenThisHappens, "");
    if (documentation.explanation) lines.push("#### Explanation", "", documentation.explanation, "");
    if (documentation.notes.length) {
      lines.push("#### Important notes", "");
      for (const note of documentation.notes) lines.push(`- ${note}`);
      lines.push("");
    }
    const metadata = enabledPairs(example.metadata);
    if (metadata.length) {
      lines.push("#### Request Metadata", "", "| Name | Value |", "|---|---|");
      for (const item of metadata)
        lines.push(`| \`${escapeTable(item.key)}\` | \`${escapeTable(redactSecretValue(item.key, item.value))}\` |`);
      lines.push("");
    }
    lines.push("#### Request Body", "", "```json", prettyJson(example.requestJson ?? example.request ?? {}), "```", "");
    if (example.expectedJson || example.responseJson || example.response)
      lines.push(
        "#### Expected Response",
        "",
        "```json",
        prettyJson(example.expectedJson ?? example.responseJson ?? example.response),
        "```",
        "",
      );
    const trailers = enabledPairs(example.expectedTrailers);
    if (trailers.length) {
      lines.push("#### Expected Trailers / Response Metadata", "", "| Name | Value |", "|---|---|");
      for (const item of trailers)
        lines.push(`| \`${escapeTable(item.key)}\` | \`${escapeTable(redactSecretValue(item.key, item.value))}\` |`);
      lines.push("");
    }
    if (String(example.assertions || "").trim())
      lines.push("#### Additional Assertions", "", "```json", prettyJson(example.assertions), "```", "");
  }
}

function normalizeExampleDocumentation(value) {
  return {
    summary: stringOr(value?.summary, "").trim(),
    whenThisHappens: stringOr(value?.whenThisHappens, "").trim(),
    explanation: stringOr(value?.explanation, "").trim(),
    notes: stringArray(value?.notes),
  };
}

function renderMocks(lines, mocks, protocol) {
  const items = activeScenarios(mocks);
  lines.push("## Mock Scenarios", "");
  if (!items.length) {
    lines.push("No active mock scenarios are configured for this operation.", "");
    return;
  }
  lines.push("| Scenario | Match / Trigger | Result |", "|---|---|---|");
  for (const mock of items) {
    const trigger = mockTriggerSummary(mock, protocol);
    const result = mockResultSummary(mock, protocol);
    lines.push(
      `| ${escapeTable(mock.name || mock.id || "Scenario")} | ${escapeTable(trigger)} | ${escapeTable(result)} |`,
    );
  }
  lines.push("");
  for (const mock of items) {
    const title = mock.name || mock.id || "Scenario";
    lines.push(
      `### ${title}`,
      "",
      "| Property | Value |",
      "|---|---|",
      `| Trigger | ${escapeTable(mockTriggerSummary(mock, protocol))} |`,
      `| Result | ${escapeTable(mockResultSummary(mock, protocol))} |`,
    );
    if (mock.delayMs != null || mock.response?.delayMs != null || mock.output?.delayMs != null)
      lines.push(`| Delay | \`${mock.delayMs ?? mock.response?.delayMs ?? mock.output?.delayMs} ms\` |`);
    if (protocol === "websocket") {
      lines.push(
        `| Path | \`${escapeTable(mock.path || "") || "/"}\` |`,
        `| Stream on connect | ${mock.streamOnConnect ? "Yes" : "No"} |`,
        `| Send on message | ${mock.sendOnMessage === false ? "No" : "Yes"} |`,
        `| Loop | ${mock.loop ? "Yes" : "No"} |`,
        `| Interval | \`${mock.intervalMs ?? 0} ms\` |`,
        `| Maximum loops | \`${mock.maxLoops ?? 0}\` |`,
      );
    }
    if (protocol === "grpc") {
      if (mock.priority != null) lines.push(`| Priority | \`${mock.priority}\` |`);
      if (mock.stream)
        lines.push(
          `| Stream interval | \`${mock.stream.intervalMs ?? "default"} ms\` |`,
          `| Stream loop | ${mock.stream.loop ? "Yes" : "No"} |`,
          `| Maximum loops | \`${mock.stream.maxLoops ?? "default"}\` |`,
        );
    }
    lines.push("");
    const matcher = mockMatcherPayload(mock, protocol);
    if (matcher != null) lines.push("#### Match Input", "", "```json", prettyJson(matcher), "```", "");
    const headers = enabledPairs(mock.headers);
    if (headers.length) {
      lines.push("#### Response Headers", "", "| Name | Value |", "|---|---|");
      for (const item of headers)
        lines.push(`| \`${escapeTable(item.key)}\` | \`${escapeTable(redactSecretValue(item.key, item.value))}\` |`);
      lines.push("");
    }
    const payloads = mockResponsePayloads(mock, protocol);
    payloads.forEach((payload, index) => {
      lines.push(
        payloads.length > 1 ? `#### Response ${index + 1}` : "#### Response Payload",
        "",
        "```json",
        prettyJson(payload),
        "```",
        "",
      );
    });
  }
}

function renderCodeSamples(lines, samples) {
  lines.push("## Code Examples", "");
  for (const sample of samples)
    lines.push(`### ${sample.label}`, "", `\`\`\`${sample.language || "text"}`, sample.code, "```", "");
}

function collectResponseValues(latestResponse, mocks, examples) {
  const output = [];
  if (latestResponse)
    output.push(latestResponse.messages?.at?.(-1) ?? latestResponse.body ?? latestResponse.message ?? latestResponse);
  for (const mock of activeScenarios(mocks))
    output.push(
      safeJson(
        mock.body ?? mock.responseText ?? mock.response?.data ?? mock.output?.data ?? mock.stream?.responses?.[0]?.data,
      ),
    );
  for (const example of arrayOr(examples).filter((item) => item?.enabled !== false))
    if (example.expectedJson || example.responseJson || example.response)
      output.push(safeJson(example.expectedJson ?? example.responseJson ?? example.response));
  return output.filter((value) => value !== undefined && value !== null && value !== "");
}

function inferJsonFields(value, prefix = "", depth = 0, lineage = new Set()) {
  if (depth > 6 || value == null) return [];
  const sample = Array.isArray(value) ? value[0] : value;
  if (!isObject(sample) || lineage.has(sample)) return [];
  const nextLineage = new Set(lineage).add(sample);
  const output = [];
  for (const [name, child] of Object.entries(sample)) {
    const isObjectArray = Array.isArray(child) && isObject(child[0]);
    const segment = isObjectArray ? `${name}[]` : name;
    const fieldName = prefix ? `${prefix}.${segment}` : segment;
    output.push({
      name: fieldName,
      type: inferValueType(child),
      required: false,
      repeated: Array.isArray(child),
      rules: "inferred",
      description: "Inferred from a saved body, response, example, or mock scenario.",
    });
    if (isObject(child)) output.push(...inferJsonFields(child, fieldName, depth + 1, nextLineage));
    else if (isObjectArray) output.push(...inferJsonFields(child[0], fieldName, depth + 1, nextLineage));
  }
  return output;
}

function generatedExampleFromFields(fields) {
  const output = {};
  for (const field of arrayOr(fields)) output[field.name] = exampleValueForType(field.type, field.enumValues);
  return Object.keys(output).length ? output : {};
}

function exampleValueForType(type, enumValues) {
  if (enumValues?.length) return enumValues[0].name;
  const value = String(type || "").toLowerCase();
  if (/bool/.test(value)) return false;
  if (/int|float|double|number/.test(value)) return 0;
  if (/bytes/.test(value)) return "base64";
  if (/map/.test(value)) return {};
  if (/repeated|array|\[\]/.test(value)) return [];
  return "string";
}

function pairFields(values, location) {
  return enabledPairs(values).map((item) => ({
    name: item.key,
    location,
    required: Boolean(item.required),
    example: redactSecretValue(item.key, item.value),
  }));
}

function inferContentTypes(headers, mocks) {
  const values = [];
  for (const item of enabledPairs(headers))
    if (String(item.key).toLowerCase() === "content-type") values.push(item.value);
  for (const mock of activeScenarios(mocks))
    for (const item of enabledPairs(mock.headers))
      if (String(item.key).toLowerCase() === "content-type") values.push(item.value);
  return dedupeBy(values.filter(Boolean), String).length
    ? dedupeBy(values.filter(Boolean), String)
    : ["application/json"];
}

function inferBodyType(body) {
  if (!String(body || "").trim()) return "none";
  return typeof safeJson(body) === "string" ? "text" : "json";
}

function inferValueType(value) {
  if (Array.isArray(value)) return value.length ? `array<${inferValueType(value[0])}>` : "array";
  if (value === null) return "null";
  if (isObject(value)) return "object";
  return typeof value;
}

function operationMethodLabel(request) {
  if (request.kind === "rest") return String(request.method || "GET").toUpperCase();
  if (request.kind === "grpc") return streamLabelFromRequest(request);
  return "WebSocket";
}

function operationTargetLabel(request) {
  if (request.kind === "grpc") return request.grpc?.methodFullName || request.grpcMethodKey || request.url || "";
  return request.url || "";
}

function protocolCounts(requests) {
  const output = { rest: 0, grpc: 0, websocket: 0 };
  for (const request of requests) if (request?.kind in output) output[request.kind] += 1;
  return output;
}

function formatProtocolCounts(counts = {}) {
  const labels = [
    ["REST", counts.rest],
    ["gRPC", counts.grpc],
    ["WebSocket", counts.websocket],
  ]
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`);
  return labels.length ? labels.join(" · ") : "None";
}

function sourceMetadata(source) {
  return {
    tags: stringArray(source?.tags),
    audience: stringArray(source?.audience),
    related: stringArray(source?.related),
    deprecated: Boolean(source?.deprecated),
  };
}

function renderCurlSample(method, url, headers, body) {
  const args = [`curl --request ${method}`, `--url ${shellQuote(url)}`];
  for (const item of headers)
    args.push(`--header ${shellQuote(`${item.key}: ${redactSecretValue(item.key, item.value)}`)}`);
  if (method !== "GET" && method !== "HEAD" && body && body !== "{}") args.push(`--data ${shellQuote(body)}`);
  return args.join(" \\\n  ");
}

function renderFetchSample(method, url, headers, body) {
  const headerObject = Object.fromEntries(headers.map((item) => [item.key, redactSecretValue(item.key, item.value)]));
  const bodyLine =
    method !== "GET" && method !== "HEAD" && body && body !== "{}" ? `,\n  body: JSON.stringify(${body})` : "";
  return `const response = await fetch(${JSON.stringify(url)}, {\n  method: ${JSON.stringify(method)},\n  headers: ${JSON.stringify(headerObject, null, 2).replace(/\n/g, "\n  ")}${bodyLine}\n});\n\nconst data = await response.json();\nconsole.log(data);`;
}

function renderPythonRequestsSample(method, url, headers, body) {
  const headerObject = Object.fromEntries(headers.map((item) => [item.key, redactSecretValue(item.key, item.value)]));
  const bodyArg =
    method !== "GET" && method !== "HEAD" && body && body !== "{}"
      ? `,\n    json=${pythonLiteral(safeJson(body))}`
      : "";
  return `import requests\n\nresponse = requests.request(\n    ${JSON.stringify(method)},\n    ${JSON.stringify(url)},\n    headers=${pythonLiteral(headerObject)}${bodyArg},\n    timeout=30,\n)\nresponse.raise_for_status()\nprint(response.json())`;
}

function renderNodeGrpcSample(request, contract) {
  const target = stringOr(request.url, "{{grpcTarget}}");
  const methodName =
    contract.methodName ||
    (contract.methodFullName || request.grpcMethodKey || "service/Method").split("/").pop() ||
    "Method";
  const serviceName = contract.serviceName || "package.Service";
  const sourceFile = contract.sourceFile || "service.proto";
  const metadataLines = enabledPairs(request.headers)
    .map(
      (item) =>
        `metadata.set(${JSON.stringify(item.key)}, ${JSON.stringify(redactSecretValue(item.key, item.value))});`,
    )
    .join("\n");
  const body = normalizedBody(request.body);
  const callBody = contract.responseStream
    ? `const call = client[${JSON.stringify(methodName)}](request, metadata);\ncall.on("data", (message) => console.log(message));\ncall.on("end", () => console.log("stream complete"));\ncall.on("error", console.error);`
    : `client[${JSON.stringify(methodName)}](request, metadata, (error, response) => {\n  if (error) throw error;\n  console.log(response);\n});`;
  return `import grpc from "@grpc/grpc-js";\nimport protoLoader from "@grpc/proto-loader";\n\nconst definition = protoLoader.loadSync(${JSON.stringify(sourceFile)}, {\n  keepCase: true,\n  longs: String,\n  enums: String,\n  defaults: true,\n  oneofs: true,\n});\nconst root = grpc.loadPackageDefinition(definition);\nconst Service = ${JSON.stringify(serviceName)}.split(".").reduce((value, key) => value[key], root);\nconst client = new Service(${JSON.stringify(target)}, grpc.credentials.createInsecure());\nconst metadata = new grpc.Metadata();\n${metadataLines || '// metadata.set("authorization", "Bearer <token>");'}\nconst request = ${body};\n\n${callBody}`;
}

function renderPythonGrpcSample(request, contract) {
  const target = stringOr(request.url, "{{grpcTarget}}");
  const methodName =
    contract.methodName ||
    (contract.methodFullName || request.grpcMethodKey || "service/Method").split("/").pop() ||
    "Method";
  const serviceShort = shortProtoName(contract.serviceName || "Service");
  const requestShort = shortProtoName(contract.requestType || "Request");
  const moduleBase = String(contract.sourceFile || "service.proto")
    .replace(/\.proto$/i, "")
    .replace(/[^a-zA-Z0-9_]/g, "_");
  const metadata = enabledPairs(request.headers)
    .map((item) => `(${JSON.stringify(item.key)}, ${JSON.stringify(redactSecretValue(item.key, item.value))})`)
    .join(", ");
  const body = pythonLiteral(safeJson(request.body));
  const call = contract.responseStream
    ? `for message in stub.${methodName}(request, metadata=metadata):\n    print(MessageToDict(message, preserving_proto_field_name=True))`
    : `response = stub.${methodName}(request, metadata=metadata)\nprint(MessageToDict(response, preserving_proto_field_name=True))`;
  return `# Generate stubs first:\n# python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. ${contract.sourceFile || "service.proto"}\nimport grpc\nfrom google.protobuf.json_format import ParseDict, MessageToDict\nimport ${moduleBase}_pb2\nimport ${moduleBase}_pb2_grpc\n\nchannel = grpc.insecure_channel(${JSON.stringify(target)})\nstub = ${moduleBase}_pb2_grpc.${serviceShort}Stub(channel)\nrequest = ParseDict(${body}, ${moduleBase}_pb2.${requestShort}())\nmetadata = [${metadata}]\n\n${call}`;
}

function renderBrowserWebSocketSample(url, body) {
  return `const socket = new WebSocket(${JSON.stringify(url)});\n\nsocket.addEventListener("open", () => {\n  socket.send(${JSON.stringify(String(body || ""))});\n});\n\nsocket.addEventListener("message", (event) => {\n  console.log(event.data);\n});`;
}

function renderNodeWebSocketSample(url, body) {
  return `import WebSocket from "ws";\n\nconst socket = new WebSocket(${JSON.stringify(url)});\nsocket.on("open", () => socket.send(${JSON.stringify(String(body || ""))}));\nsocket.on("message", (data) => console.log(data.toString()));`;
}

function requestBadgeLine(page) {
  if (page.protocol === "rest")
    return `\`${String(page.request.method || "GET").toUpperCase()}\` · \`${page.request.url || ""}\``;
  if (page.protocol === "websocket") return `\`WebSocket\` · \`${page.request.url || ""}\``;
  return `\`gRPC\` · \`${streamLabel(page.contract)}\` · \`${page.contract?.methodFullName || page.request.grpcMethodKey || ""}\``;
}

function _primaryCliCommand(page) {
  const preferred =
    page.protocol === "rest"
      ? "curl"
      : page.protocol === "grpc"
        ? "grpcurl"
        : page.protocol === "websocket"
          ? "wscat"
          : "layang-cli";
  return (
    page.codeSamples?.find((item) => item.id === preferred)?.code ||
    page.codeSamples?.find((item) => item.id === "layang-cli")?.code ||
    "layang list ./workspace"
  );
}

function streamLabel(contract) {
  if (contract?.requestStream && contract?.responseStream) return "bidirectional streaming";
  if (contract?.requestStream) return "client streaming";
  if (contract?.responseStream) return "server streaming";
  return "unary";
}

function streamLabelFromRequest(request) {
  return request.grpc?.requestStream && request.grpc?.responseStream
    ? "Bidirectional"
    : request.grpc?.requestStream
      ? "Client stream"
      : request.grpc?.responseStream
        ? "Server stream"
        : "Unary";
}

function defaultRequestSummary(request) {
  if (request.kind === "grpc") return `Call ${request.grpc?.methodFullName || request.grpcMethodKey || request.name}.`;
  if (request.kind === "websocket") return `Connect to ${request.url || "the configured WebSocket endpoint"}.`;
  return `${String(request.method || "GET").toUpperCase()} ${request.url || "the configured endpoint"}.`;
}

function exampleMatchesRequest(example, request, collection) {
  if (request.kind === "grpc") {
    const fullName = request.grpc?.methodFullName || request.grpcMethodKey || "";
    const [serviceName, methodName] = splitLast(fullName, "/");
    return example.serviceName === serviceName && example.methodName === methodName;
  }
  return example.serviceName === collection.name && example.methodName === request.name;
}

function parseFieldRules(options) {
  return String(options || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && !/^deprecated\s*=/.test(item))
    .join(", ");
}

function stripProtoBlockComments(text) {
  return String(text || "").replace(/\/\*[\s\S]*?\*\//g, "");
}
function shortProtoName(value) {
  const text = String(value || "");
  return text.split(".").filter(Boolean).pop() || text;
}

function httpStatusMeaning(status) {
  const values = {
    400: "Invalid request",
    401: "Authentication required",
    403: "Permission denied",
    404: "Resource not found",
    409: "Conflict",
    422: "Validation failed",
    429: "Rate limit exceeded",
    500: "Internal server error",
    502: "Upstream failure",
    503: "Service unavailable",
    504: "Upstream timeout",
  };
  return values[status] || `HTTP ${status} error`;
}

function grpcStatusName(code) {
  const number = Number(code);
  const values = [
    "OK",
    "CANCELLED",
    "UNKNOWN",
    "INVALID_ARGUMENT",
    "DEADLINE_EXCEEDED",
    "NOT_FOUND",
    "ALREADY_EXISTS",
    "PERMISSION_DENIED",
    "RESOURCE_EXHAUSTED",
    "FAILED_PRECONDITION",
    "ABORTED",
    "OUT_OF_RANGE",
    "UNIMPLEMENTED",
    "INTERNAL",
    "UNAVAILABLE",
    "DATA_LOSS",
    "UNAUTHENTICATED",
  ];
  return Number.isInteger(number) && values[number] ? values[number] : String(code || "UNKNOWN").toUpperCase();
}

function grpcStatusMeaning(code) {
  const name = grpcStatusName(code);
  const values = {
    INVALID_ARGUMENT: "The request contains invalid input.",
    NOT_FOUND: "The requested resource does not exist.",
    PERMISSION_DENIED: "The caller does not have permission.",
    UNAUTHENTICATED: "Authentication credentials are missing or invalid.",
    DEADLINE_EXCEEDED: "The operation exceeded its deadline.",
    UNAVAILABLE: "The service is temporarily unavailable.",
    INTERNAL: "The server encountered an internal failure.",
    RESOURCE_EXHAUSTED: "A quota or resource limit was exceeded.",
  };
  return values[name] || `gRPC status ${name}`;
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))];
}

function cleanMarkdown(lines) {
  return `${lines
    .filter((line, index) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .trimEnd()}\n`;
}

function extractMarkdownHeadings(markdown) {
  return String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{2,3})\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({ level: match[1].length, title: stripInlineMarkdown(match[2]), id: headingId(match[2]) }));
}

function stripMarkdownForSearch(markdown) {
  return String(markdown || "")
    .replace(/^---[\s\S]*?---/m, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`|[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripInlineMarkdown(value) {
  return String(value || "")
    .replace(/[`*_[\]]/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim();
}
function headingId(value) {
  return (
    stripInlineMarkdown(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function markdownToBasicHtml(markdown) {
  const lines = String(markdown || "")
    .replace(/^<!--[\s\S]*?-->\s*/, "")
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "")
    .split(/\r?\n/);
  const output = [];
  let index = 0;
  let sectionOpen = false;
  const closeSection = () => {
    if (sectionOpen) {
      output.push("</section>");
      sectionOpen = false;
    }
  };
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      if (heading[1].length === 2) {
        closeSection();
        output.push(`<section class="doc-section-plain" id="${escapeHtml(headingId(heading[2]))}">`);
        sectionOpen = true;
      }
      const level = heading[1].length;
      output.push(
        `<h${level} id="${escapeHtml(headingId(heading[2]))}">${renderInlineBasicHtml(heading[2])}<a class="heading-anchor" href="#${escapeHtml(headingId(heading[2]))}">#</a></h${level}>`,
      );
      index += 1;
      continue;
    }
    const fence = line.match(/^```([\w-]+)?/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      output.push(
        `<div class="code-block"><button class="copy-code" type="button">Copy</button><pre><code class="language-${escapeHtml(fence[1] || "text")}">${escapeHtml(code.join("\n"))}</code></pre></div>`,
      );
      continue;
    }
    if (isBasicTableHeader(lines, index)) {
      const headers = splitBasicTableRow(lines[index]);
      const rows = [];
      index += 2;
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
        rows.push(splitBasicTableRow(lines[index]));
        index += 1;
      }
      output.push(
        `<div class="doc-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInlineBasicHtml(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, column) => `<td>${renderInlineBasicHtml(row[column] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
      );
      continue;
    }
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*]\s+(.+)$/);
        if (!item) break;
        const task = item[1].match(/^\[([ xX])\]\s+(.+)$/);
        items.push(
          task
            ? `<label class="task-item"><input type="checkbox" disabled ${task[1].toLowerCase() === "x" ? "checked" : ""}> ${renderInlineBasicHtml(task[2])}</label>`
            : renderInlineBasicHtml(item[1]),
        );
        index += 1;
      }
      const tag = ordered ? "ol" : "ul";
      output.push(`<${tag}>${items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`);
      continue;
    }
    const image = line.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+["']([^"']*)["'])?\)$/);
    if (image) {
      output.push(
        `<figure><img src="${escapeHtml(safeBasicHref(image[2]))}" alt="${escapeHtml(image[1])}" loading="lazy">${image[3] ? `<figcaption>${escapeHtml(image[3])}</figcaption>` : ""}</figure>`,
      );
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length) {
        const item = lines[index].match(/^>\s?(.*)$/);
        if (!item) break;
        quote.push(item[1]);
        index += 1;
      }
      output.push(`<blockquote>${renderInlineBasicHtml(quote.join(" "))}</blockquote>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      output.push("<hr>");
      index += 1;
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBasicMarkdownBoundary(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    output.push(`<p>${renderInlineBasicHtml(paragraph.join(" "))}</p>`);
  }
  closeSection();
  return output.join("");
}

function renderInlineBasicHtml(value) {
  const text = String(value || "");
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const output = [];
  let cursor = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    output.push(escapeHtml(text.slice(cursor, match.index)));
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) output.push(`<code>${escapeHtml(token.slice(1, -1))}</code>`);
    else if (token.startsWith("**") && token.endsWith("**"))
      output.push(`<strong>${escapeHtml(token.slice(2, -2))}</strong>`);
    else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      output.push(`<a href="${escapeHtml(safeBasicHref(link?.[2] || "#"))}">${escapeHtml(link?.[1] || token)}</a>`);
    }
    cursor = match.index + token.length;
  }
  output.push(escapeHtml(text.slice(cursor)));
  return output.join("");
}

function safeBasicHref(value) {
  const href = String(value || "").trim();
  return /^(https?:|mailto:|layang:|#|\?|\.\.?\/)/i.test(href) ? href : "#";
}
function isBasicTableHeader(lines, index) {
  return /^\s*\|.*\|\s*$/.test(lines[index] || "") && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] || "");
}
function splitBasicTableRow(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}
function isBasicMarkdownBoundary(lines, index) {
  const line = lines[index] || "";
  return (
    /^(#{1,6})\s+/.test(line) ||
    /^```/.test(line) ||
    /^\s*(?:[-*]|\d+\.)\s+/.test(line) ||
    /^!\[/.test(line) ||
    /^>\s?/.test(line) ||
    /^---+$/.test(line.trim()) ||
    isBasicTableHeader(lines, index)
  );
}

function renderSiteShell(title, activeId) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="assets/docs.css"></head><body><aside class="site-nav"><div class="site-title"><h1>${escapeHtml(title)}</h1><span>API documentation</span></div><label class="search-label"><span>Search</span><input id="search" placeholder="Search documentation"></label><div class="protocol-filters" id="protocol-filters"><button data-protocol="" class="active">All</button><button data-protocol="rest">REST</button><button data-protocol="grpc">gRPC</button><button data-protocol="websocket">WebSocket</button></div><nav id="nav"></nav></aside><main><div id="breadcrumbs" class="breadcrumbs"></div><article id="content"></article><div id="pager" class="pager"></div></main><aside class="page-outline"><strong>On this page</strong><nav id="outline"></nav></aside><script>window.__LAYANG_ACTIVE__=${JSON.stringify(activeId)};</script><script src="assets/data.js"></script><script src="assets/site.js"></script></body></html>`;
}

function staticDocsJs(title) {
  return `(()=>{const index=window.__LAYANG_DOCS_INDEX__||[],pages=window.__LAYANG_DOCS_PAGES__||{};const byId=new Map(index.map(x=>[x.id,x]));const initial=new URLSearchParams(location.search).get('page');let active=initial&&byId.has(initial)?initial:(window.__LAYANG_ACTIVE__||index[0]?.id||'');let protocol='';const nav=document.getElementById('nav'),content=document.getElementById('content'),search=document.getElementById('search'),crumbs=document.getElementById('breadcrumbs'),outline=document.getElementById('outline'),pager=document.getElementById('pager');const label=x=>[...(x.breadcrumbs||[]).map(y=>y.title),x.title,x.summary,...(x.tags||[]),x.searchableText].join(' ').toLowerCase();function setUrl(id,replace=false){const url=new URL(location.href);url.searchParams.set('page',id);url.hash='';history[replace?'replaceState':'pushState']({page:id},'',url)}function select(id,replace=false){if(!byId.has(id))return;active=id;setUrl(id,replace);render();draw();window.scrollTo({top:0,behavior:'auto'})}function button(x,depth=0){const b=document.createElement('button');b.className=x.id===active?'active':'';b.style.paddingLeft=(8+depth*14)+'px';b.innerHTML='<span>'+escapeHtml(x.title)+'</span>'+(x.protocol?'<small>'+x.protocol.toUpperCase()+'</small>':'');b.onclick=()=>select(x.id);return b}function tree(id,depth=0,seen=new Set()){if(seen.has(id))return;const x=byId.get(id);if(!x||!matches(x))return;seen.add(id);nav.appendChild(button(x,depth));(x.children||[]).forEach(child=>tree(child,depth+1,new Set(seen)))}function matches(x){const q=search.value.trim().toLowerCase();return(!protocol||x.protocol===protocol)&&(!q||label(x).includes(q))}function draw(){nav.innerHTML='';const q=search.value.trim();if(q||protocol){index.filter(matches).forEach(x=>nav.appendChild(button(x)))}else{const root=byId.get('workspace:overview')||index[0];if(root)tree(root.id)}}function bindPageLinks(){content.querySelectorAll('a[href^="?page="]').forEach(a=>a.onclick=e=>{e.preventDefault();const id=new URL(a.href,location.href).searchParams.get('page');if(id)select(id)})}function render(){const x=byId.get(active)||index[0];if(!x)return;content.innerHTML=pages[x.id]||'<p>No documentation selected.</p>';crumbs.innerHTML=(x.breadcrumbs||[]).map(y=>'<button data-id="'+escapeHtml(y.id)+'">'+escapeHtml(y.title)+'</button>').join('<span>/</span>')+'<span>/</span><strong>'+escapeHtml(x.title)+'</strong>';crumbs.querySelectorAll('button').forEach(b=>b.onclick=()=>select(b.dataset.id));outline.innerHTML=(x.outline||[]).map(h=>'<a class="level-'+h.level+'" href="#'+escapeHtml(h.id)+'">'+escapeHtml(h.title)+'</a>').join('');content.querySelectorAll('.copy-code').forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.parentElement.querySelector('code')?.textContent||'');b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1200)});bindPageLinks();const pos=index.findIndex(i=>i.id===x.id),prev=index[pos-1],next=index[pos+1];pager.innerHTML=(prev?'<button data-id="'+escapeHtml(prev.id)+'">← '+escapeHtml(prev.title)+'</button>':'<span></span>')+(next?'<button data-id="'+escapeHtml(next.id)+'">'+escapeHtml(next.title)+' →</button>':'');pager.querySelectorAll('button').forEach(b=>b.onclick=()=>select(b.dataset.id));document.title=x.title+' · ${escapeHtml(title)}'}function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}search.oninput=draw;document.getElementById('protocol-filters').onclick=e=>{const b=e.target.closest('button');if(!b)return;protocol=b.dataset.protocol||'';document.querySelectorAll('#protocol-filters button').forEach(x=>x.classList.toggle('active',x===b));draw()};window.addEventListener('popstate',()=>{const id=new URLSearchParams(location.search).get('page');if(id&&byId.has(id)){active=id;render();draw()}});if(!initial)setUrl(active,true);render();draw()})();`;
}

function staticDocsCss() {
  return `:root{color-scheme:light dark;font-family:Inter,system-ui,sans-serif;--border:#8a8a8a3d;--muted:#8882;--accent:#4f7cff;--surface:Canvas}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;display:grid;grid-template-columns:280px minmax(0,1fr) 220px;min-height:100vh;background:Canvas;color:CanvasText}.site-nav,.page-outline{position:sticky;top:0;height:100vh;overflow:auto;padding:18px;border-right:1px solid var(--border)}.page-outline{border-right:0;border-left:1px solid var(--border)}.site-title h1{margin:0;font-size:17px}.site-title span{display:block;margin:4px 0 14px;color:GrayText;font-size:12px}.search-label span{display:block;font-size:11px;color:GrayText;margin-bottom:4px}input{width:100%;padding:8px;border:1px solid var(--border);border-radius:7px;background:Canvas;color:CanvasText}.protocol-filters{display:flex;gap:4px;margin:9px 0;overflow:auto}.protocol-filters button{border:1px solid var(--border);background:transparent;color:inherit;border-radius:999px;padding:4px 8px;font-size:10px}.protocol-filters button.active{background:var(--accent);color:white;border-color:var(--accent)}#nav{display:grid;gap:3px}#nav button{text-align:left;padding:7px 8px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;justify-content:space-between;gap:8px}#nav button small{font-size:9px;color:GrayText}#nav button:hover,#nav button.active{background:var(--muted)}#nav button.active{font-weight:650}main{min-width:0;padding:20px clamp(20px,4vw,56px) 48px}article{max-width:980px;line-height:1.65}.breadcrumbs{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:20px;color:GrayText;font-size:12px}.breadcrumbs button{border:0;background:transparent;color:inherit;padding:0;cursor:pointer}.page-outline strong{display:block;margin-bottom:9px;font-size:12px}.page-outline nav{display:grid;gap:6px}.page-outline a{font-size:11px;color:GrayText;text-decoration:none}.page-outline a.level-3{padding-left:10px}.page-outline a:hover{color:var(--accent)}pre{overflow:auto;padding:14px;border-radius:8px;background:var(--muted);margin:0}.code-block{position:relative;margin:12px 0}.copy-code{position:absolute;right:7px;top:7px;border:1px solid var(--border);background:Canvas;color:CanvasText;border-radius:5px;padding:4px 7px;font-size:10px;cursor:pointer}code{font-family:ui-monospace,SFMono-Regular,monospace}p{color:GrayText}h1,h2,h3{line-height:1.25;scroll-margin-top:16px}h1{font-size:28px}h2{margin-top:30px;font-size:19px;border-bottom:1px solid var(--border);padding-bottom:7px}h3{margin-top:22px;font-size:15px}.heading-anchor{opacity:0;margin-left:7px;text-decoration:none;font-size:.75em}h1:hover .heading-anchor,h2:hover .heading-anchor,h3:hover .heading-anchor{opacity:.55}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}ul,ol{padding-left:22px}.task-item{display:inline-flex;align-items:center;gap:6px}figure{margin:16px 0}figure img{display:block;max-width:100%;height:auto;border-radius:8px;border:1px solid var(--border)}figcaption{margin-top:6px;color:GrayText;font-size:11px}.doc-table-wrap{overflow:auto;margin:14px 0;border:1px solid var(--border);border-radius:8px}.doc-table-wrap table{width:100%;min-width:560px;border-collapse:collapse}.doc-table-wrap th,.doc-table-wrap td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;font-size:12px}.doc-table-wrap th{background:var(--muted)}blockquote{margin:14px 0;padding:10px 12px;border-left:3px solid var(--accent);background:var(--muted)}.pager{display:flex;justify-content:space-between;gap:10px;margin-top:36px;padding-top:18px;border-top:1px solid var(--border)}.pager button{max-width:46%;border:1px solid var(--border);background:transparent;color:inherit;border-radius:7px;padding:8px 10px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:1050px){body{grid-template-columns:260px minmax(0,1fr)}.page-outline{display:none}}@media(max-width:720px){body{display:block}.site-nav{position:relative;height:auto;border-right:0;border-bottom:1px solid var(--border)}main{padding:22px 16px}.site-nav #nav{max-height:260px;overflow:auto}}`;
}

function activeScenarios(values) {
  return arrayOr(values).filter((item) => item?.enabled !== false && item?.active !== false);
}
function redactStructuredSecrets(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((item) => redactStructuredSecrets(item, seen));
  if (!isObject(value)) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      /authorization|token|secret|password|api[-_]?key/i.test(key)
        ? "{{secret}}"
        : redactStructuredSecrets(child, seen),
    ]),
  );
}
function enabledPairs(values) {
  return arrayOr(values).filter((item) => item?.key && item?.enabled !== false);
}
function markdownLink(title, href) {
  return href ? `[${escapeTable(title)}](${href})` : escapeTable(title);
}
function attachPageLinks(page, resolver) {
  const link = (item) => ({ ...item, href: item?.id ? resolver(item.id) : item?.href || "" });
  return {
    ...page,
    related: arrayOr(page.related).map(link),
    overview: page.overview
      ? {
          ...page.overview,
          collections: arrayOr(page.overview.collections).map(link),
          folders: arrayOr(page.overview.folders).map(link),
          operations: arrayOr(page.overview.operations).map(link),
        }
      : page.overview,
  };
}
function _renderWebSocketReference(lines, contract) {
  const events = arrayOr(contract.events);
  if (events.length) {
    lines.push("## WebSocket Events", "", "| Event | Direction | Path | Description |", "|---|---|---|---|");
    for (const event of events)
      lines.push(
        `| \`${escapeTable(event.name)}\` | ${escapeTable(event.direction || "")} | \`${escapeTable(event.path || "")}\` | ${escapeTable(event.description || "")} |`,
      );
    lines.push("");
    for (const event of events.filter((item) => item.payload != null))
      lines.push(`### ${event.name} Payload`, "", "```json", prettyJson(event.payload), "```", "");
  }
  const closeCodes = arrayOr(contract.closeCodes);
  if (closeCodes.length) {
    lines.push("## WebSocket Close Codes", "", "| Code | Meaning |", "|---:|---|");
    for (const item of closeCodes) lines.push(`| \`${item.code}\` | ${escapeTable(item.meaning || "")} |`);
    lines.push("");
  }
}
function mockTriggerSummary(mock, protocol) {
  if (protocol === "rest") return `${mock.method || "ANY"} ${mock.path || ""}`.trim();
  if (protocol === "websocket")
    return `${mock.matchMode || "always"}${mock.matchValue ? `: ${mock.matchValue}` : ""}${mock.matchJsonPath ? `: ${mock.matchJsonPath}` : ""}`;
  return (
    mock.description ||
    (mock.input?.contains
      ? "contains matcher"
      : mock.input?.equals
        ? "equals matcher"
        : mock.input?.or
          ? "OR matcher"
          : "configured input")
  );
}
function mockResultSummary(mock, protocol) {
  if (protocol === "rest") return `HTTP ${mock.status ?? 200}`;
  if (protocol === "websocket")
    return mock.loop ? "stream loop" : mock.streamOnConnect ? "message on connect" : "message";
  const code = mock.response?.code ?? mock.output?.code;
  return mock.stream
    ? `stream (${arrayOr(mock.stream.responses).length} response${arrayOr(mock.stream.responses).length === 1 ? "" : "s"})`
    : code != null
      ? grpcStatusName(code)
      : "response";
}
function mockMatcherPayload(mock, protocol) {
  if (protocol === "rest") {
    const value = {
      query: Object.fromEntries(enabledPairs(mock.matchQuery).map((item) => [item.key, item.value])),
      headers: Object.fromEntries(
        enabledPairs(mock.matchHeaders).map((item) => [item.key, redactSecretValue(item.key, item.value)]),
      ),
    };
    if (mock.matchBodyContains) value.bodyContains = mock.matchBodyContains;
    if (mock.matchJsonPath) value.jsonPath = mock.matchJsonPath;
    if (mock.matchJsonEquals) value.jsonEquals = safeJson(mock.matchJsonEquals);
    return Object.values(value).some((item) => (isObject(item) ? Object.keys(item).length : item)) ? value : null;
  }
  if (protocol === "websocket")
    return mock.matchMode && mock.matchMode !== "always"
      ? { mode: mock.matchMode, value: mock.matchValue || undefined, jsonPath: mock.matchJsonPath || undefined }
      : null;
  return mock.input ?? mock.match ?? null;
}
function mockResponsePayloads(mock, protocol) {
  if (protocol === "rest") return [safeJson(mock.body ?? mock.responseText ?? {})];
  if (protocol === "websocket") return [safeJson(mock.responseText ?? mock.body ?? {})];
  if (arrayOr(mock.stream?.responses).length) return mock.stream.responses.map((item) => item?.data ?? item);
  const response = mock.response ?? mock.output;
  return response ? [response.data ?? response] : [];
}
function removeNamedBlocks(text, keyword) {
  let output = String(text || "");
  const blocks = parseNamedBlocks(output, keyword);
  for (const block of blocks) {
    const escapedName = block.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const startRegex = new RegExp(`\\b${keyword}\\s+${escapedName}\\s*\\{`);
    const match = startRegex.exec(output);
    if (!match) continue;
    let depth = 1,
      cursor = match.index + match[0].length;
    while (cursor < output.length && depth > 0) {
      if (output[cursor] === "{") depth += 1;
      else if (output[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    output = `${output.slice(0, match.index)}\n${output.slice(cursor)}`;
  }
  return output;
}

function documentationPrimaryMarkerDefinition(kind, protocol) {
  if (kind !== "request") {
    return { kind: "overview-index", label: "Generated Index", marker: DOCUMENTATION_AUTO_MARKERS.overviewIndex };
  }
  if (protocol === "grpc")
    return { kind: "reference", label: "Proto Reference", marker: DOCUMENTATION_AUTO_MARKERS.protoReference };
  if (protocol === "websocket")
    return { kind: "reference", label: "Connection Reference", marker: DOCUMENTATION_AUTO_MARKERS.connectionReference };
  return { kind: "reference", label: "Endpoint Reference", marker: DOCUMENTATION_AUTO_MARKERS.endpointReference };
}

function documentationMarkerForSectionKind(kind, protocol) {
  if (kind === "overview-index") return DOCUMENTATION_AUTO_MARKERS.overviewIndex;
  if (kind === "reference") return documentationPrimaryMarkerDefinition("request", protocol).marker;
  if (kind === "request-example") return DOCUMENTATION_AUTO_MARKERS.requestExample;
  if (kind === "response-example") return DOCUMENTATION_AUTO_MARKERS.responseExample;
  if (kind === "errors") return DOCUMENTATION_AUTO_MARKERS.errors;
  if (kind === "mocks") return DOCUMENTATION_AUTO_MARKERS.mockScenarios;
  if (kind === "code-samples") return DOCUMENTATION_AUTO_MARKERS.codeSamples;
  if (kind === "related") return DOCUMENTATION_AUTO_MARKERS.relatedOperations;
  return "";
}

function documentationSectionEditorBlock(section, protocol) {
  if (section.mode !== "auto") return String(section.markdown || "").trim();
  const marker = documentationMarkerForSectionKind(section.kind, protocol);
  if (!marker) return String(section.markdown || "").trim();
  return `## ${section.title || documentationSectionTitle(section.kind)}\n\n${marker}`;
}

function documentationMarkerValues(kind = "request", protocol = "") {
  return [
    "{{LAYANG_AUTO_REFERENCE}}",
    "{{LAYANG_REFERENCE}}",
    ...Object.values(DOCUMENTATION_AUTO_MARKERS),
    ...documentationMarkerDefinitions(kind, protocol).map((definition) => definition.marker),
  ];
}

function containsDocumentationMarker(markdown) {
  const value = String(markdown || "");
  return (
    Object.values(DOCUMENTATION_AUTO_MARKERS).some((marker) => value.includes(marker)) ||
    value.includes("{{LAYANG_AUTO_REFERENCE}}") ||
    value.includes("{{LAYANG_REFERENCE}}")
  );
}

function hasPrimaryReferenceMarker(markdown, kind, protocol) {
  const value = String(markdown || "");
  const primary = documentationPrimaryMarkerDefinition(kind, protocol);
  return (
    Boolean(primary) &&
    [primary.marker, "{{LAYANG_AUTO_REFERENCE}}", "{{LAYANG_REFERENCE}}"].some((marker) => value.includes(marker))
  );
}

function stripDocumentationMarkers(markdown) {
  let output = String(markdown || "");
  for (const marker of documentationMarkerValues()) output = output.split(marker).join("");
  return output;
}

function replaceMarkerLines(markdown, marker, replacement) {
  const escaped = String(marker).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^[\\t ]*${escaped}[\\t ]*$`, "gm");
  return String(markdown || "").replace(pattern, () => String(replacement || ""));
}

function stripFirstSectionHeading(markdown) {
  return String(markdown || "")
    .replace(/^\s*##\s+[^\n]+\n?/, "")
    .replace(/^\s+/, "");
}

function normalizeDocumentationSections(value) {
  const seen = new Set();
  return arrayOr(value)
    .filter(isObject)
    .map((section, index) => normalizeDocumentationSection(section, index))
    .filter((section) => {
      if (seen.has(section.id)) return false;
      seen.add(section.id);
      return true;
    });
}

function normalizeDocumentationSection(value, index) {
  const allowedKinds = new Set([
    "manual",
    "overview-index",
    "reference",
    "request-example",
    "response-example",
    "errors",
    "mocks",
    "code-samples",
    "related",
  ]);
  const kind = allowedKinds.has(value?.kind) ? value.kind : "manual";
  const mode = value?.mode === "auto" || value?.mode === "auto-editable" ? value.mode : "manual";
  const fallbackTitle = documentationSectionTitle(kind);
  return {
    id: stringOr(value?.id, `${kind}-${index + 1}`),
    kind,
    title: stringOr(value?.title, fallbackTitle),
    enabled: value?.enabled !== false,
    mode: kind === "manual" ? "manual" : mode,
    markdown: stringOr(value?.markdown, ""),
  };
}

function _resolveDocumentationSections(page) {
  const explicit = normalizeDocumentationSections(page?.sections);
  if (explicit.length) return explicit;

  const manual = String(page?.manualMarkdown || "").trim();
  const placement = normalizeManualPlacement(page?.manualPlacement);
  if (page?.kind !== "request") {
    const sections = [];
    if (manual)
      sections.push({
        id: "overview",
        kind: "manual",
        title: "Overview",
        enabled: true,
        mode: "manual",
        markdown: manual,
      });
    sections.push({
      id: "overview-index",
      kind: "overview-index",
      title: "Generated index",
      enabled: true,
      mode: "auto",
      markdown: "",
    });
    return sections;
  }

  const reference = {
    id: "reference",
    kind: "reference",
    title:
      page?.protocol === "grpc"
        ? "Proto Reference"
        : page?.protocol === "websocket"
          ? "Connection Reference"
          : "Endpoint Reference",
    enabled: placement !== "only",
    mode: "auto",
    markdown: "",
  };
  const manualSection = {
    id: "overview",
    kind: "manual",
    title: firstSectionHeading(manual) || "Overview",
    enabled: Boolean(manual),
    mode: "manual",
    markdown: manual,
  };
  let primary = placement === "after" ? [reference, manualSection] : [manualSection, reference];
  if (placement === "only") primary = [manualSection];
  if (placement === "inline" && manual.includes("{{LAYANG_AUTO_REFERENCE}}")) {
    const [before, after = ""] = manual.split("{{LAYANG_AUTO_REFERENCE}}", 2);
    primary = [
      {
        ...manualSection,
        id: "overview-before",
        title: firstSectionHeading(before) || "Overview",
        enabled: Boolean(before.trim()),
        markdown: before.trim(),
      },
      reference,
      {
        ...manualSection,
        id: "overview-after",
        title: firstSectionHeading(after) || "Additional Notes",
        enabled: Boolean(after.trim()),
        markdown: after.trim(),
      },
    ];
  }

  return [
    ...primary.filter((section) => section.enabled || section.kind !== "manual"),
    {
      id: "request-example",
      kind: "request-example",
      title: "Request Example",
      enabled: false,
      mode: "auto",
      markdown: "",
    },
    {
      id: "response-example",
      kind: "response-example",
      title: "Response Example",
      enabled: false,
      mode: "auto",
      markdown: "",
    },
    { id: "errors", kind: "errors", title: "Errors", enabled: false, mode: "auto", markdown: "" },
    { id: "mocks", kind: "mocks", title: "Mock Scenarios", enabled: false, mode: "auto", markdown: "" },
    { id: "code-samples", kind: "code-samples", title: "Code Examples", enabled: false, mode: "auto", markdown: "" },
    { id: "related", kind: "related", title: "Related Operations", enabled: false, mode: "auto", markdown: "" },
  ];
}

function documentationSectionTitle(kind) {
  if (kind === "overview-index") return "Generated index";
  if (kind === "reference") return "Reference";
  if (kind === "request-example") return "Request Example";
  if (kind === "response-example") return "Response Example";
  if (kind === "errors") return "Errors";
  if (kind === "mocks") return "Mock Scenarios";
  if (kind === "code-samples") return "Code Examples";
  if (kind === "related") return "Related Operations";
  return "Manual Section";
}

function firstSectionHeading(markdown) {
  const match = String(markdown || "").match(/^##\s+([^\n]+)/m);
  return match ? stripInlineMarkdown(match[1]) : "";
}

function renameFirstSectionHeading(markdown, title) {
  const normalizedTitle = String(title || "").trim();
  if (!normalizedTitle) return markdown;
  if (/^##\s+/m.test(markdown)) return markdown.replace(/^##\s+[^\n]+/m, `## ${normalizedTitle}`);
  return `## ${normalizedTitle}\n\n${String(markdown || "").trim()}`;
}

function defaultIncludeSettings() {
  return {
    includeSchemas: true,
    includeExamples: false,
    includeMocks: false,
    includeCodeSamples: false,
    includeRelatedRequests: false,
    includeErrors: false,
    includeResponseContracts: false,
    includeOverviewIndexes: true,
  };
}
function redactSecretValue(key, value) {
  return /authorization|token|secret|password|api[-_]?key/i.test(String(key || ""))
    ? "{{secret}}"
    : String(value || "");
}
function headerArgs(headers, flag) {
  return enabledPairs(headers)
    .map((item) => `${flag} ${shellQuote(`${item.key}: ${redactSecretValue(item.key, item.value)}`)}`)
    .join(" \\\n  ");
}
function normalizedBody(value) {
  return JSON.stringify(redactStructuredSecrets(safeJson(value)), null, 2);
}
function prettyJson(value) {
  if (typeof value === "string") {
    const parsed = safeJson(value);
    return typeof parsed === "string" ? parsed : JSON.stringify(redactStructuredSecrets(parsed), null, 2);
  }
  try {
    return JSON.stringify(redactStructuredSecrets(value ?? {}), null, 2);
  } catch {
    return String(value ?? "");
  }
}
function safeJson(value) {
  if (typeof value !== "string") return value ?? {};
  try {
    return JSON.parse(value || "{}");
  } catch {
    return value;
  }
}
function pythonLiteral(value) {
  return JSON.stringify(value, null, 2).replace(/true/g, "True").replace(/false/g, "False").replace(/null/g, "None");
}
function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, `'"'"'`)}'`;
}
function yamlScalar(value) {
  return JSON.stringify(String(value || ""));
}
function escapeTable(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function splitLast(value, separator) {
  const text = String(value || "");
  const index = text.lastIndexOf(separator);
  return index < 0 ? ["", text] : [text.slice(0, index), text.slice(index + separator.length)];
}
function normalizeManualPlacement(value) {
  return value === "after" || value === "only" || value === "inline" ? value : "before";
}

function normalizeDocKind(value) {
  return ["workspace", "collection", "folder", "request"].includes(value) ? value : "workspace";
}
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}
function dedupeBy(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function appendMap(map, key, value) {
  map.set(key, [...(map.get(key) || []), value]);
}
function stringArray(value) {
  return arrayOr(value)
    .map((item) => String(item).trim())
    .filter(Boolean);
}
function arrayOr(value) {
  return Array.isArray(value) ? value : [];
}
function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function stringOr(value, fallback) {
  return typeof value === "string" && value.length ? value : fallback;
}
