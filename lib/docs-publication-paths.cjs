"use strict";

function docsSlug(value, fallback = "page") {
  const slug = String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
  const name = slug || fallback;
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name) ? `${name}-page` : name;
}

function allocateSlugs(items, reserved = []) {
  const used = new Set(reserved);
  const assigned = new Map();
  const ordered = [...items].sort((a, b) => String(a.id).localeCompare(String(b.id), "en"));
  for (const item of ordered) {
    const base = docsSlug(item.title);
    let name = base;
    for (let suffix = 2; used.has(name); suffix++) name = `${base}-${suffix}`;
    used.add(name);
    assigned.set(item.id, name);
  }
  return assigned;
}

function documentationPaths(pages, indexName, reserved = []) {
  const groups = new Map();
  for (const page of pages) {
    if (page.kind === "workspace") continue;
    const parent = page.breadcrumbs?.at(-1)?.id || "workspace:overview";
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(page);
  }
  const segments = new Map();
  for (const [parent, siblings] of groups) {
    const names = allocateSlugs(siblings, ["index", "readme", "summary", "import",
      ...(parent === "workspace:overview" ? reserved : [])]);
    for (const [id, name] of names) segments.set(id, name);
  }
  return new Map(pages.map(page => {
    if (page.kind === "workspace") return [page.id, indexName];
    const parts = (page.breadcrumbs || []).map(crumb => segments.get(crumb.id)).filter(Boolean);
    const name = segments.get(page.id);
    const tail = page.kind === "request" ? [`${name}.md`] : [name, indexName];
    return [page.id, [...parts, ...tail].join("/")];
  }));
}

module.exports = { docsSlug, allocateSlugs, documentationPaths };
