"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { readWorkspace } = require("./cli-workspace.cjs");
const { stringifyYaml, parseYaml } = require("./workspace-yaml.cjs");

async function buildDocumentation(workspaceDirectory, options = {}) {
  const workspace = await readWorkspace(workspaceDirectory || ".");
  return buildDocumentationFromProject(workspace.root, workspace.project, {
    ...options,
    grpcScenarios: workspace.scenarios || [],
    workspaceName: workspace.manifest?.workspace?.name || path.basename(workspace.root),
  });
}

async function buildDocumentationFromProject(rootDirectory, project, options = {}) {
  const root = path.resolve(rootDirectory || ".");
  const core = await import("./docs-core.mjs");
  const allPages = core.buildUnifiedDocsPages(project || {}, {
    workspaceName: options.workspaceName || path.basename(root),
    grpcScenarios: options.grpcScenarios || [],
  });
  const selectedPages = filterPages(allPages, options);
  const expected = new Map();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const generatedPublications = [];
  const outputPathById = new Map(allPages.map((page) => [page.id, documentationOutputPath(page, allPages)]));
  for (const page of selectedPages) {
    const relative = outputPathById.get(page.id);
    const publication = {
      pageId: page.id,
      sourceHash: page.sourceHash,
      outputPath: relative.split(path.sep).join("/"),
      publishedAt: generatedAt,
    };
    const linkedPage = attachPublishedLinks({ ...page, publication, status: "published" }, relative, outputPathById);
    const markdown = core.renderDocumentationMarkdown(linkedPage, project?.documentation?.settings || {});
    expected.set(path.join(root, relative), markdown);
    generatedPublications.push(publication);
  }

  const previousManifest = await readYamlIfExists(path.join(root, "docs", "build-manifest.yml"));
  const previousPublications = Array.isArray(previousManifest?.publications)
    ? previousManifest.publications.filter((item) => item?.pageId && item.outputPath)
    : [];
  const selectedIds = new Set(selectedPages.map((page) => page.id));
  const partial = Boolean(options.pageId || options.collection || options.request);
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
    return makeReport(root, selectedPages, generatedPublications, differences, stalePaths, brokenLinks, true);
  }

  for (const [file, content] of expected) await writeTextAtomic(file, content);
  for (const relative of stalePaths) {
    const target = path.resolve(root, relative);
    if (target.startsWith(path.join(root, "docs", "published"))) await fsp.rm(target, { force: true });
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
      include: project?.documentation?.settings || {},
    });
    await syncStaticSite(path.join(root, "docs", "site"), site.files);
  }

  if (options.wikiExport !== false) {
    const wiki = core.renderWikiDocsBundle(publishedPages, {
      title: options.workspaceName || path.basename(root),
      include: project?.documentation?.settings || {},
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

function documentationOutputPath(page, pages) {
  const base = path.join("docs", "published");
  if (page.kind === "workspace") return path.join(base, "index.md");
  const segments = [];
  const collection = pages.find(
    (item) => item.kind === "collection" && item.entityId === (page.collectionId || page.entityId),
  );
  if (collection) segments.push(entitySegment(collection.title, collection.entityId));
  for (const breadcrumb of page.breadcrumbs || []) {
    if (!String(breadcrumb.id).startsWith("folder:")) continue;
    segments.push(entitySegment(breadcrumb.title, String(breadcrumb.id).slice("folder:".length)));
  }
  if (page.kind === "folder") segments.push(entitySegment(page.title, page.entityId));
  if (page.kind === "collection" || page.kind === "folder") return path.join(base, ...segments, "index.md");
  return path.join(base, ...segments, `${entitySegment(page.title, page.entityId)}.md`);
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
      const target = path.resolve(path.dirname(file), clean);
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

function entitySegment(name, id) {
  return `${slug(name)}--${shortId(id)}`;
}
function slug(value) {
  return (
    String(value || "item")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}
function shortId(value) {
  return crypto
    .createHash("sha1")
    .update(String(value || "id"))
    .digest("hex")
    .slice(0, 8);
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
