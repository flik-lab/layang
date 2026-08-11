"use strict";

const crypto = require("node:crypto");
const _fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { readGitWorkspace, writeGitWorkspace } = require("./git-workspace.cjs");
const { discoverProtoMethods, resolveProtoVersion } = require("./cli-workspace.cjs");

async function readProtoInput(inputPath) {
  const absolute = path.resolve(inputPath || "");
  const stat = await fsp.stat(absolute).catch(() => null);
  if (!stat) throw new Error(`Proto input was not found: ${absolute}`);
  const files = [];
  if (stat.isFile()) {
    if (!absolute.endsWith(".proto")) throw new Error("Schema input file must use the .proto extension.");
    files.push({ name: path.basename(absolute), text: await fsp.readFile(absolute, "utf8") });
  } else if (stat.isDirectory()) {
    await walk(absolute, async (file) => {
      if (!file.endsWith(".proto")) return;
      files.push({
        name: path.relative(absolute, file).split(path.sep).join("/"),
        text: await fsp.readFile(file, "utf8"),
      });
    });
  } else throw new Error("Schema input must be a .proto file or directory.");
  if (!files.length) throw new Error(`No .proto files found in ${absolute}.`);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

function computeChecksum(files) {
  const canonical = [...files]
    .map((file) => ({ name: normalizeProtoPath(file.name), text: String(file.text || "").replace(/\r\n/g, "\n") }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((file) => `${file.name}\n${file.text}`)
    .join("\n\0\n");
  return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

function stableId(prefix, value) {
  return `${prefix}-${crypto
    .createHash("sha1")
    .update(String(value || prefix))
    .digest("hex")
    .slice(0, 16)}`;
}

function createVersion(libraryId, files, label, previousVersionId) {
  const now = new Date().toISOString();
  const checksum = computeChecksum(files);
  return {
    id: stableId("proto-ver", `${libraryId}|${label}|${checksum}|${now}`),
    libraryId,
    version: String(label || "Revision"),
    lifecycle: "active",
    checksum,
    files: files.map((file) => ({ name: normalizeProtoPath(file.name), text: String(file.text || "") })),
    previousVersionId: previousVersionId || undefined,
    source: { type: "local-files" },
    importedAt: now,
    createdAt: now,
  };
}

function createLibrary(name, files, revisionLabel) {
  const now = new Date().toISOString();
  const checksum = computeChecksum(files);
  const id = stableId("proto-lib", `${name}|${checksum}|${now}`);
  const version = createVersion(id, files, revisionLabel || "Revision 1");
  return {
    id,
    name: String(name || "Proto Schema"),
    lifecycle: "active",
    defaultVersionId: version.id,
    versions: [version],
    createdAt: now,
    updatedAt: now,
  };
}

function findLibrary(project, selector) {
  const query = String(selector || "")
    .trim()
    .toLowerCase();
  return (
    (Array.isArray(project?.protoLibraries) ? project.protoLibraries : []).find(
      (library) =>
        String(library?.id || "").toLowerCase() === query || String(library?.name || "").toLowerCase() === query,
    ) || null
  );
}

async function importSchema(root, inputPath, options = {}) {
  const git = await requireGitWorkspace(root);
  const files = await readProtoInput(inputPath);
  const checksum = computeChecksum(files);
  const libraries = structuredClone(Array.isArray(git.project.protoLibraries) ? git.project.protoLibraries : []);
  for (const library of libraries) {
    const existing = (Array.isArray(library.versions) ? library.versions : []).find(
      (version) => version.checksum === checksum || computeChecksum(version.files || []) === checksum,
    );
    if (existing && !options.force) return { action: "existing", library, version: existing, checksum };
  }
  const name =
    String(options.name || path.basename(path.resolve(inputPath))).replace(/\.proto$/i, "") || "Proto Schema";
  const library = createLibrary(name, files, options.revision || "Revision 1");
  libraries.push(library);
  await persistProject(git, {
    ...git.project,
    protoLibraries: libraries,
    activeProtoLibraryId: library.id,
    activeProtoVersionId: library.defaultVersionId,
  });
  return { action: "created", library, version: library.versions[0], checksum };
}

async function updateSchema(root, selector, inputPath, options = {}) {
  const git = await requireGitWorkspace(root);
  const files = await readProtoInput(inputPath);
  const libraries = structuredClone(Array.isArray(git.project.protoLibraries) ? git.project.protoLibraries : []);
  const library = findLibrary({ protoLibraries: libraries }, selector);
  if (!library) throw new Error(`Schema ${selector} was not found.`);
  const checksum = computeChecksum(files);
  const exact = (library.versions || []).find(
    (version) => version.checksum === checksum || computeChecksum(version.files || []) === checksum,
  );
  if (exact && !options.force) return { action: "existing", library, version: exact, checksum };
  const previous =
    (library.versions || []).find((version) => version.id === library.defaultVersionId) || library.versions?.at(-1);
  const label = String(options.revision || nextRevisionLabel(library.versions || []));
  const version = createVersion(library.id, files, label, previous?.id);
  library.versions = [...(library.versions || []), version];
  library.defaultVersionId = version.id;
  library.updatedAt = new Date().toISOString();
  await persistProject(git, {
    ...git.project,
    protoLibraries: libraries,
    activeProtoLibraryId: library.id,
    activeProtoVersionId: version.id,
  });
  return { action: "revision-created", library, version, checksum, diff: diffProtoFiles(previous?.files || [], files) };
}

async function diffSchema(root, selector, inputPath) {
  const git = await requireGitWorkspace(root);
  const library = findLibrary(git.project, selector);
  if (!library) throw new Error(`Schema ${selector} was not found.`);
  const current =
    (library.versions || []).find((version) => version.id === library.defaultVersionId) || library.versions?.at(-1);
  const incoming = await readProtoInput(inputPath);
  return {
    schema: { id: library.id, name: library.name },
    currentRevision: current ? { id: current.id, label: current.version, checksum: current.checksum } : null,
    incomingChecksum: computeChecksum(incoming),
    ...diffProtoFiles(current?.files || [], incoming),
  };
}

function diffProtoFiles(previousFiles, nextFiles) {
  const before = new Map(
    (previousFiles || []).map((file) => [normalizeProtoPath(file.name), normalizeProtoText(file.text)]),
  );
  const after = new Map(
    (nextFiles || []).map((file) => [normalizeProtoPath(file.name), normalizeProtoText(file.text)]),
  );
  const addedFiles = [...after.keys()].filter((name) => !before.has(name)).sort();
  const removedFiles = [...before.keys()].filter((name) => !after.has(name)).sort();
  const changedFiles = [...after.keys()]
    .filter((name) => before.has(name) && before.get(name) !== after.get(name))
    .sort();
  const previousMethods = discoverProtoMethods(previousFiles || [])
    .map(methodKey)
    .sort();
  const nextMethods = discoverProtoMethods(nextFiles || [])
    .map(methodKey)
    .sort();
  const fileDiffs = [
    ...addedFiles.map((name) => createFileDiff(name, "added", "", after.get(name))),
    ...removedFiles.map((name) => createFileDiff(name, "removed", before.get(name), "")),
    ...changedFiles.map((name) => createFileDiff(name, "changed", before.get(name), after.get(name))),
  ].sort((left, right) => left.name.localeCompare(right.name));
  return {
    identical: !addedFiles.length && !removedFiles.length && !changedFiles.length,
    addedFiles,
    removedFiles,
    changedFiles,
    fileDiffs,
    addedMethods: nextMethods.filter((key) => !previousMethods.includes(key)),
    removedMethods: previousMethods.filter((key) => !nextMethods.includes(key)),
    retainedMethods: nextMethods.filter((key) => previousMethods.includes(key)),
  };
}

function createFileDiff(name, status, previousText, nextText) {
  const before = splitProtoLines(previousText);
  const after = splitProtoLines(nextText);
  const lines =
    status === "added"
      ? after.map((text, index) => ({ type: "add", oldLine: null, newLine: index + 1, text }))
      : status === "removed"
        ? before.map((text, index) => ({ type: "remove", oldLine: index + 1, newLine: null, text }))
        : diffLines(before, after);
  return {
    name,
    status,
    oldLineCount: before.length,
    newLineCount: after.length,
    additions: lines.filter((line) => line.type === "add").length,
    removals: lines.filter((line) => line.type === "remove").length,
    lines,
  };
}

function diffLines(before, after) {
  if (!before.length) return after.map((text, index) => ({ type: "add", oldLine: null, newLine: index + 1, text }));
  if (!after.length) return before.map((text, index) => ({ type: "remove", oldLine: index + 1, newLine: null, text }));
  const pairs = before.length * after.length <= 1_000_000 ? lcsPairs(before, after) : greedyPairs(before, after);
  const output = [];
  let oldIndex = 0;
  let newIndex = 0;
  for (const [matchedOld, matchedNew] of pairs) {
    while (oldIndex < matchedOld)
      output.push({ type: "remove", oldLine: oldIndex + 1, newLine: null, text: before[oldIndex++] });
    while (newIndex < matchedNew)
      output.push({ type: "add", oldLine: null, newLine: newIndex + 1, text: after[newIndex++] });
    output.push({ type: "context", oldLine: oldIndex + 1, newLine: newIndex + 1, text: before[oldIndex] });
    oldIndex += 1;
    newIndex += 1;
  }
  while (oldIndex < before.length)
    output.push({ type: "remove", oldLine: oldIndex + 1, newLine: null, text: before[oldIndex++] });
  while (newIndex < after.length)
    output.push({ type: "add", oldLine: null, newLine: newIndex + 1, text: after[newIndex++] });
  return output;
}

function lcsPairs(before, after) {
  const rows = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
  for (let oldIndex = before.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = after.length - 1; newIndex >= 0; newIndex -= 1) {
      rows[oldIndex][newIndex] =
        before[oldIndex] === after[newIndex]
          ? rows[oldIndex + 1][newIndex + 1] + 1
          : Math.max(rows[oldIndex + 1][newIndex], rows[oldIndex][newIndex + 1]);
    }
  }
  const pairs = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < before.length && newIndex < after.length) {
    if (before[oldIndex] === after[newIndex]) {
      pairs.push([oldIndex, newIndex]);
      oldIndex += 1;
      newIndex += 1;
    } else if (rows[oldIndex + 1][newIndex] >= rows[oldIndex][newIndex + 1]) oldIndex += 1;
    else newIndex += 1;
  }
  return pairs;
}

function greedyPairs(before, after) {
  const positions = new Map();
  after.forEach((line, index) => {
    const list = positions.get(line) || [];
    list.push(index);
    positions.set(line, list);
  });
  const pairs = [];
  let minimum = 0;
  for (let oldIndex = 0; oldIndex < before.length; oldIndex += 1) {
    const candidates = positions.get(before[oldIndex]) || [];
    const matchedNew = candidates.find((index) => index >= minimum);
    if (matchedNew === undefined) continue;
    pairs.push([oldIndex, matchedNew]);
    minimum = matchedNew + 1;
  }
  return pairs;
}

function normalizeProtoText(value) {
  return String(value || "").replace(/\r\n/g, "\n");
}
function splitProtoLines(value) {
  const text = normalizeProtoText(value);
  if (!text) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

async function deleteSchema(root, selector) {
  const git = await requireGitWorkspace(root);
  const libraries = structuredClone(Array.isArray(git.project.protoLibraries) ? git.project.protoLibraries : []);
  const library = findLibrary({ protoLibraries: libraries }, selector);
  if (!library) throw new Error(`Schema ${selector} was not found.`);
  const remaining = libraries.filter((item) => item.id !== library.id);
  const project = structuredClone(git.project);
  project.protoLibraries = remaining;
  project.requestTabs = markMissingBindings(project.requestTabs, library.id);
  project.collections = (project.collections || []).map((collection) => ({
    ...collection,
    requests: markMissingBindings(collection.requests, library.id),
  }));
  if (project.activeProtoLibraryId === library.id) {
    project.activeProtoLibraryId = remaining[0]?.id || "";
    project.activeProtoVersionId = remaining[0]?.defaultVersionId || "";
  }
  await persistProject(git, project);
  return {
    deleted: { id: library.id, name: library.name },
    unresolvedRequestCount: countMissingBindings(project, library.id),
  };
}

function markMissingBindings(items, deletedLibraryId) {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (item?.grpc?.libraryId !== deletedLibraryId) return item;
    return { ...item, grpc: { ...item.grpc, status: "library-missing" } };
  });
}

function countMissingBindings(project) {
  let count = (project.requestTabs || []).filter((item) => item?.grpc?.status === "library-missing").length;
  for (const collection of project.collections || [])
    count += (collection.requests || []).filter((item) => item?.grpc?.status === "library-missing").length;
  return count;
}

async function repairSchemas(root, options = {}) {
  const git = await requireGitWorkspace(root);
  const project = structuredClone(git.project);
  const preferred = options.schema ? findLibrary(project, options.schema) : null;
  const candidates = preferred ? [preferred] : Array.isArray(project.protoLibraries) ? project.protoLibraries : [];
  const requestFilter = String(options.request || "")
    .trim()
    .toLowerCase();
  const repaired = [];
  const unresolved = [];
  const repairList = (items) =>
    (Array.isArray(items) ? items : []).map((item) => {
      const broken =
        item?.grpc?.status === "library-missing" || (item?.grpc && !resolveProtoVersion(project, item.grpc));
      const nameMatches =
        !requestFilter ||
        String(item.id || "").toLowerCase() === requestFilter ||
        String(item.name || item.title || "").toLowerCase() === requestFilter;
      if (!broken || !nameMatches) return item;
      const methodFullName = String(item.grpc?.methodFullName || item.grpcMethodKey || item.methodKey || "");
      const match = findMethodCandidate(candidates, methodFullName);
      if (!match) {
        unresolved.push({ id: item.id, name: item.name || item.title, methodFullName });
        return item;
      }
      const next = {
        ...item,
        grpc: {
          ...item.grpc,
          libraryId: match.library.id,
          versionId: match.version.id,
          methodFullName,
          schemaChecksum: match.version.checksum,
          status: "valid",
        },
      };
      repaired.push({
        id: item.id,
        name: item.name || item.title,
        schema: match.library.name,
        revision: match.version.version,
        methodFullName,
      });
      return next;
    });
  project.requestTabs = repairList(project.requestTabs);
  project.collections = (project.collections || []).map((collection) => ({
    ...collection,
    requests: repairList(collection.requests),
  }));
  if (repaired.length) await persistProject(git, project);
  return { repaired, unresolved };
}

function findMethodCandidate(libraries, methodFullName) {
  for (const library of libraries || []) {
    const versions = [...(library.versions || [])].reverse();
    for (const version of versions) {
      if (discoverProtoMethods(version.files || []).some((method) => methodKey(method) === methodFullName))
        return { library, version };
    }
  }
  return null;
}

function methodKey(method) {
  return `${method.service}/${method.method}`;
}
function normalizeProtoPath(name) {
  return String(name || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}
function nextRevisionLabel(versions) {
  return `Revision ${(versions || []).length + 1}`;
}

async function requireGitWorkspace(root) {
  const git = await readGitWorkspace(path.resolve(root || "."));
  if (!git) throw new Error("Schema write commands require a Git-friendly Layang workspace (layang.yml).");
  return git;
}

async function persistProject(git, project) {
  await writeGitWorkspace(git.root, {
    project: { ...project, updatedAt: new Date().toISOString() },
    layout: git.layout,
    settings: git.settings,
  });
}

async function walk(directory, visitor) {
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file, visitor);
    else await visitor(file);
  }
}

module.exports = {
  readProtoInput,
  computeChecksum,
  createVersion,
  createLibrary,
  findLibrary,
  importSchema,
  updateSchema,
  diffSchema,
  diffProtoFiles,
  diffLines,
  createFileDiff,
  deleteSchema,
  repairSchemas,
  findMethodCandidate,
};
