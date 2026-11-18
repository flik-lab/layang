"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { documentationPaths } = require("./docs-publication-paths.cjs");
const { buildGrpcReference, buildOpenApi, buildGrpcOpenApi } = require("./docs-protocol-references.cjs");
const { GrpcScenarioRepository } = require("./grpc-scenario-repository.cjs");
const { readWorkspace } = require("./cli-workspace.cjs");
const { stringifyYaml, parseYaml } = require("./workspace-yaml.cjs");

async function buildDocumentation(workspaceDirectory, options = {}) {
  const workspace = await readWorkspace(workspaceDirectory || ".");
  return buildDocumentationFromProject(workspace.root, workspace.project, {
    ...options,
    workspaceName: workspace.manifest?.workspace?.name || path.basename(workspace.root),
  });
}

async function buildDocumentationFromProject(rootDirectory, project, options = {}) {
  const root = path.resolve(rootDirectory || ".");
  const core = await import("./docs-core.mjs");
  // Same rules as the desktop app (e.g. include* switches apply only in "custom" sections mode),
  // so `docs:build` publishes what the Docs view previews.
  const docsSettings = core.normalizeDocumentationState(project?.documentation || {}).settings;
  const scenarioMetadata = fs.existsSync(path.join(root, "layang.yml"))
    ? (await new GrpcScenarioRepository(root).listMetadata()).items : [];
  const selectedByMethod = new Map();
  for (const scenario of scenarioMetadata) {
    if (!scenario.enabled) continue;
    const selected = selectedByMethod.get(scenario.methodKey) || [];
    if (selected.length >= 3) continue;
    const [service, method] = scenario.methodKey.split("/");
    selected.push({ id: scenario.scenarioId, name: scenario.name, service, method,
      executionMode: scenario.executionMode, responseCount: scenario.responseCount });
    selectedByMethod.set(scenario.methodKey, selected);
  }
  const allPages = core.buildUnifiedDocsPages(project || {}, {
    workspaceName: options.workspaceName || path.basename(root),
    grpcScenarios: options.grpcScenarios || [...selectedByMethod.values()].flat(),
  });
  const previousManifest = await readYamlIfExists(path.join(root, "docs", "build-manifest.yml"));
  const previousPublications = Array.isArray(previousManifest?.publications)
    ? previousManifest.publications.filter((item) => item?.pageId && item.outputPath)
    : [];
  const expected = new Map();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const generatedPublications = [];
  const outputPathById = publishedPaths(allPages);
  const pathsChanged = previousPublications.some(({ pageId, outputPath }) =>
    outputPathById.has(pageId) && outputPathById.get(pageId) !== outputPath);
  const partial = !pathsChanged && Boolean(options.pageId || options.collection || options.request);
  const selectedPages = partial ? filterPages(allPages, options) : allPages;
  const grpc = await buildGrpcReference(root, core.listDocumentationGrpcMethods(project?.protoLibraries),
    scenarioMetadata, core.markdownToBasicHtml, options.sourceBaseUrl);
  const openApi = buildOpenApi(allPages, options.workspaceName || path.basename(root));
  const grpcOpenApi = buildGrpcOpenApi(allPages, options.workspaceName || path.basename(root));
  const referenceLinks = [];
  const references = grpc.markdown;
  if (references.size) referenceLinks.push({ title: "gRPC reference", href: "grpc/index.html", markdown: "grpc/index.md" });
  if (grpcOpenApi) {
    const spec = stringifyYaml(grpcOpenApi);
    references.set("docs/published/grpc/openapi.yaml", spec);
    grpc.site["grpc/openapi.yaml"] = spec;
    referenceLinks.push({ title: "OpenAPI (gRPC)", href: "grpc/openapi.yaml", markdown: "grpc/openapi.yaml" });
  }
  if (openApi) {
    const spec = stringifyYaml(openApi);
    references.set("docs/published/rest/openapi.yaml", spec);
    grpc.site["rest/openapi.yaml"] = spec;
    referenceLinks.push({ title: "OpenAPI (REST)", href: "rest/openapi.yaml", markdown: "rest/openapi.yaml" });
  }
  for (const page of selectedPages) {
    const relative = outputPathById.get(page.id);
    const publication = {
      pageId: page.id,
      sourceHash: page.sourceHash,
      outputPath: relative.split(path.sep).join("/"),
      publishedAt: generatedAt,
    };
    const linkedPage = attachPublishedLinks({ ...page, publication, status: "published" }, relative, outputPathById);
    let markdown = core.renderDocumentationMarkdown(linkedPage, docsSettings);
    if (page.kind === "workspace" && referenceLinks.length) markdown += "\n## Protocol references\n\n" +
      referenceLinks.map(link => `- [${link.title}](${link.markdown})`).join("\n") + "\n";
    expected.set(path.join(root, relative), markdown);
    generatedPublications.push(publication);
  }

  for (const [relative, content] of references) {
    expected.set(path.join(root, relative), content);
    generatedPublications.push({ pageId: `reference:${relative}`, outputPath: relative,
      sourceHash: crypto.createHash("sha256").update(content).digest("hex"), publishedAt: generatedAt });
  }

  const selectedIds = new Set(generatedPublications.map(item => item.pageId));
  for (const item of previousPublications) if (String(item.pageId).startsWith("reference:")) selectedIds.add(item.pageId);
  const publications = partial
    ? [...previousPublications.filter((item) => !selectedIds.has(String(item.pageId))), ...generatedPublications]
    : generatedPublications;
  const publicationPaths = new Set(publications.map((item) => String(item.outputPath || "")).filter(Boolean));
  const generatedPaths = new Set(generatedPublications.map((item) => String(item.outputPath || "")).filter(Boolean));
  const stalePaths = previousPublications
    .filter((item) => (partial ? selectedIds.has(String(item.pageId)) : true))
    .map((item) => String(item.outputPath || ""))
    .filter((relative) => relative && !(partial ? generatedPaths : publicationPaths).has(relative));
  const differences = await compareExpectedFiles(expected);
  const brokenLinks = await findBrokenLocalLinks(root, expected);

  if (options.check) {
    if (options.staticSite !== false) differences.push(...await compareExpectedFiles(new Map(
      Object.entries(grpc.site).map(([relative, content]) => [path.join(root, "docs", "site", relative), content]),
    )));
    return makeReport(root, selectedPages, generatedPublications, differences, stalePaths, brokenLinks, true);
  }

  for (const [file, content] of expected) await writeTextAtomic(file, content);
  for (const relative of stalePaths) {
    const target = path.resolve(root, relative);
    if (target.startsWith(path.join(root, "docs", "published") + path.sep)) await fsp.rm(target, { force: true });
  }
  await writeTextAtomic(path.join(root, "docs", "build-manifest.yml"), stringifyYaml({ version: 1, publications }));

  const publicationById = new Map(publications.map((item) => [String(item.pageId), item]));
  const publishedPages = allPages.map((page) => {
    const publication = publicationById.get(page.id);
    return publication
      ? { ...page, publication, status: publication.sourceHash === page.sourceHash ? "published" : "outdated" }
      : page;
  });

  if (options.staticSite !== false) {
    const site = core.renderStaticDocsSite(publishedPages, {
      title: options.workspaceName || path.basename(root),
      include: docsSettings,
      referenceLinks,
    });
    await syncStaticSite(path.join(root, "docs", "site"), { ...site.files, ...grpc.site });
  }

  if (options.wikiExport !== false) {
    const wiki = core.renderWikiDocsBundle(publishedPages, {
      title: options.workspaceName || path.basename(root),
      include: docsSettings,
    });
    await syncStaticSite(path.join(root, "docs", "wiki-export"), wiki.files);
  }

  const report = makeReport(root, selectedPages, generatedPublications, differences, stalePaths, brokenLinks, false);
  report.wikiExportPath = path.join(root, "docs", "wiki-export");
  report.staticSitePath = path.join(root, "docs", "site", "index.html");
  await writeTextAtomic(
    path.join(root, ".layang", "docs-build-report.yml"),
    stringifyYaml({
      version: 1,
      generatedAt,
      documentation: {
        ok: report.ok,
        pageCount: report.pageCount,
        warningCount: report.warningCount,
        errorCount: report.errorCount,
        brokenLinks: report.brokenLinks,
        pages: report.pages,
      },
    }),
  );
  return report;
}

async function publishDocumentationPage(rootDirectory, project, pageId, options = {}) {
  return buildDocumentationFromProject(rootDirectory, project, {
    ...options,
    pageId,
    staticSite: options.staticSite !== false,
  });
}

async function checkDocumentation(workspaceDirectory, options = {}) {
  return buildDocumentation(workspaceDirectory, { ...options, check: true });
}

function filterPages(pages, options) {
  let output = Array.isArray(pages) ? pages : [];
  if (options.pageId) output = output.filter((page) => page.id === options.pageId);
  if (options.collection) {
    const needle = String(options.collection).toLowerCase();
    const matchingCollectionIds = new Set(
      pages
        .filter(
          (page) =>
            page.kind === "collection" && (page.entityId === options.collection || page.title.toLowerCase() === needle),
        )
        .map((page) => page.entityId),
    );
    output = output.filter(
      (page) => page.kind === "workspace" || matchingCollectionIds.has(page.collectionId || page.entityId),
    );
  }
  if (options.request) {
    const needle = String(options.request).toLowerCase();
    output = output.filter(
      (page) => page.kind === "request" && (page.entityId === options.request || page.title.toLowerCase() === needle),
    );
  }
  return output;
}

function publishedPaths(pages) {
  return new Map([...documentationPaths(pages, "index.md", ["grpc", "rest"])]
    .map(([id, relative]) => [id, `docs/published/${relative}`]));
}

function documentationOutputPath(page, pages) {
  return publishedPaths(pages).get(page.id);
}

function attachPublishedLinks(page, currentPath, outputPathById) {
  const resolve = (id) => {
    const target = outputPathById.get(id);
    if (!target) return "";
    const relative = path.relative(path.dirname(currentPath), target).split(path.sep).join("/");
    return relative || path.basename(target);
  };
  const link = (item) => ({ ...item, href: item?.id ? resolve(item.id) : item?.href || "" });
  return {
    ...page,
    related: Array.isArray(page.related) ? page.related.map(link) : page.related,
    overview: page.overview
      ? {
          ...page.overview,
          collections: Array.isArray(page.overview.collections)
            ? page.overview.collections.map(link)
            : page.overview.collections,
          folders: Array.isArray(page.overview.folders) ? page.overview.folders.map(link) : page.overview.folders,
          operations: Array.isArray(page.overview.operations)
            ? page.overview.operations.map(link)
            : page.overview.operations,
        }
      : page.overview,
  };
}

async function compareExpectedFiles(expected) {
  const differences = [];
  for (const [file, content] of expected) {
    let current = "";
    try {
      current = await fsp.readFile(file, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (current !== content) differences.push(path.relative(process.cwd(), file));
  }
  return differences;
}

function makeReport(root, pages, publications, differences, stalePaths, brokenLinks, check) {
  const errors = pages.flatMap((page) =>
    (page.validation?.errors || []).map((issue) => ({ pageId: page.id, ...issue })),
  );
  const warnings = pages.flatMap((page) =>
    (page.validation?.warnings || []).map((issue) => ({ pageId: page.id, ...issue })),
  );
  const stale = check ? differences.length + stalePaths.length : 0;
  return {
    ok: errors.length === 0 && stale === 0 && brokenLinks.length === 0,
    root,
    pageCount: pages.length,
    publishedCount: publications.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    staleCount: stale,
    differences,
    stalePaths,
    brokenLinks,
    pages: pages.map((page) => ({
      id: page.id,
      title: page.title,
      kind: page.kind,
      status: page.status,
      sourceHash: page.sourceHash,
      validation: page.validation || { errors: [], warnings: [] },
    })),
  };
}

async function findBrokenLocalLinks(root, expected) {
  const expectedFiles = new Set(Array.from(expected.keys()).map((file) => path.resolve(file)));
  const broken = [];
  for (const [file, markdown] of expected) {
    if (path.extname(file) !== ".md") continue;
    const searchable = String(markdown || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]*`/g, "");
    const linkRegex = /\[[^\]]*\]\(([^)]+)\)/g;
    for (let match = linkRegex.exec(searchable); match; match = linkRegex.exec(searchable)) {
      const raw = String(match[1] || "")
        .trim()
        .replace(/^<|>$/g, "");
      if (!raw || /^(?:https?:|mailto:|layang:|#)/i.test(raw)) continue;
      const clean = raw.split(/[?#]/)[0];
      if (!clean) continue;
      let decoded;
      try { decoded = decodeURIComponent(clean); } catch { decoded = clean; }
      const target = path.resolve(path.dirname(file), decoded);
      if (expectedFiles.has(target) || fs.existsSync(target)) continue;
      broken.push({ page: path.relative(root, file).split(path.sep).join("/"), target: raw });
    }
  }
  return broken;
}

async function syncStaticSite(base, files) {
  const expected = new Set();
  for (const [relative, content] of Object.entries(files || {})) {
    const target = path.join(base, safeRelative(relative));
    expected.add(target);
    await writeTextAtomic(target, content);
  }
  if (!fs.existsSync(base)) return;
  await walk(base, async (file) => {
    if (!expected.has(file)) await fsp.rm(file, { force: true });
  });
}

async function walk(directory, visitor) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, visitor);
    else await visitor(full);
  }
}

async function readYamlIfExists(file) {
  try {
    return parseYaml(await fsp.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeTextAtomic(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  await fsp.writeFile(temporary, String(content), "utf8");
  try {
    await fsp.rename(temporary, file);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
    await fsp.rm(file, { force: true });
    await fsp.rename(temporary, file);
  }
}

function safeRelative(value) {
  return String(value || "file")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

module.exports = {
  buildDocumentation,
  buildDocumentationFromProject,
  publishDocumentationPage,
  checkDocumentation,
  documentationOutputPath,
};
