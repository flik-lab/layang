"use strict";

/**
 * Canonical, file-backed, on-demand gRPC mock scenarios. Legacy documents
 * are read only by the verified one-time migration importer.
 * Cache entries contain ONLY metadata; no response bodies are retained.
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseYaml, stringifyYaml } = require("./workspace-yaml.cjs");
const { decodeGrpcMockDocument } = require("./workspace-v6-codec.cjs");

const { MAX_SCENARIO_BYTES, MAX_INLINE_SCENARIO_BYTES, MAX_SNAPSHOT_BYTES } = require("./grpc-scenario-limits.cjs");
const { normalizeMockExecution } = require("./mock-execution-engine.cjs");
const MAX_LEGACY_BYTES = 128 * 1024 * 1024;
const MAX_INDEX_BYTES = 12 * 1024 * 1024;
const INDEX_VERSION = 5;
const mutex = new Map();

function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function token(value) { return sha(value).slice(0, 32); }
function reject(message, code = "INVALID_SCENARIO") {
  const error = new Error(message); error.code = code; throw error;
}
function* scenarioReadBatches(files, maxFiles = 8) {
  let batch = [];
  let bytes = 0;
  for (const file of files) {
    if (batch.length && (batch.length >= maxFiles || bytes + file.size > MAX_SCENARIO_BYTES)) {
      yield batch;
      batch = [];
      bytes = 0;
    }
    batch.push(file);
    bytes += file.size;
  }
  if (batch.length) yield batch;
}
function cleanKey(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 512 || value.includes("\0"))
    reject(`Invalid ${label}.`);
  return value;
}
function refParts(ref) {
  const methodKey = cleanKey(ref?.methodKey, "methodKey");
  const scenarioId = cleanKey(ref?.scenarioId, "scenarioId");
  return { methodKey, scenarioId };
}
function relativeRef(ref) {
  const { methodKey, scenarioId } = refParts(ref);
  return path.join("mocks", "grpc", "scenarios", token(methodKey), `${token(scenarioId)}.scenario.yml`);
}
function streamExecution(stream) {
  if (!stream || typeof stream !== "object") return undefined;
  const mode = stream.mode ?? stream.streamMode ?? stream.stream_mode;
  return normalizeMockExecution(stream.execution, {
    streamMode: mode === "live-push" ? "live-push" : "scheduled",
    intervalMs: stream.intervalMs ?? stream.interval_ms,
    loop: stream.loop,
    maxLoops: stream.maxLoops ?? stream.max_loops,
  });
}

function metadataFromDocument(doc, ref, file, stat, contentHash) {
  const scenario = doc.scenario;
  const execution = streamExecution(scenario.stream);
  return {
    methodKey: ref.methodKey,
    scenarioId: ref.scenarioId,
    fileRef: file.split(path.sep).join("/"),
    name: typeof scenario.name === "string" ? scenario.name : ref.scenarioId,
    enabled: scenario.enabled !== false,
    executionMode: execution?.mode || scenario.execution?.mode || scenario.executionMode || "incoming",
    execution,
    responseCount: Array.isArray(scenario.stream?.responses) ? scenario.stream.responses.length :
      Array.isArray(scenario.responses) ? scenario.responses.length : (scenario.response ? 1 : 0),
    revision: doc.revision,
    contentHash,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  };
}
function ensureDoc(doc, ref) {
  if (!doc || doc.version !== 3 || doc.kind !== "grpc-scenario" || !doc.scenario ||
      typeof doc.scenario !== "object" || Array.isArray(doc.scenario)) reject("Invalid v3 scenario document.");
  if (doc.methodKey !== ref.methodKey || doc.id !== ref.scenarioId || doc.scenario.id !== ref.scenarioId)
    reject("Scenario document identity mismatch.", "SCENARIO_IDENTITY_MISMATCH");
  if (!Number.isSafeInteger(doc.revision) || doc.revision < 1) reject("Invalid scenario revision.");
  return doc;
}
async function assertDirectoryChain(root, file) {
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(`${root}${path.sep}`)) reject("Path escapes workspace.", "UNSAFE_PATH");
  const relative = path.relative(root, absolute).split(path.sep);
  let current = root;
  for (const part of relative) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); } catch (err) {
      if (err.code === "ENOENT") return absolute;
      throw err;
    }
    if (stat.isSymbolicLink()) reject("Symlink scenario paths are not allowed.", "UNSAFE_PATH");
    if (!stat.isDirectory() && part !== relative[relative.length - 1]) reject("Invalid scenario directory.", "UNSAFE_PATH");
  }
  return absolute;
}
async function writeAtomic(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  try {
    const handle = await fs.open(tmp, "wx", 0o600);
    try { await handle.writeFile(content, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(tmp, file);
  } finally { await fs.rm(tmp, { force: true }).catch(() => {}); }
}
async function withLock(lockKey, action) {
  const previous = mutex.get(lockKey) || Promise.resolve();
  const result = previous.catch(() => {}).then(action);
  mutex.set(lockKey, result);
  try { return await result; } finally { if (mutex.get(lockKey) === result) mutex.delete(lockKey); }
}

class GrpcScenarioRepository {
  constructor(root) {
    this.root = path.resolve(root);
    this.base = path.join(this.root, "mocks", "grpc", "scenarios");
    this.indexFile = path.join(this.root, "mocks", "grpc", ".cache", "scenario-index-v3.json");
  }
  async ensureWorkspace() {
    const stat = await fs.lstat(this.root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) reject("Invalid workspace root.", "UNSAFE_PATH");
    const manifest = await fs.lstat(path.join(this.root, "layang.yml"));
    if (!manifest.isFile() || manifest.isSymbolicLink()) reject("Not a Layang workspace.", "UNSAFE_PATH");
  }
  async fileFor(ref) {
    return assertDirectoryChain(this.root, relativeRef(ref));
  }
  async read(ref, { maxBytes = MAX_SCENARIO_BYTES } = {}) {
    await this.ensureWorkspace();
    const file = await this.fileFor(ref);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > maxBytes) reject(`Scenario exceeds the ${maxBytes / 1024 / 1024} MiB limit for this operation.`, "SCENARIO_TOO_LARGE");
    const sourceText = await fs.readFile(file, "utf8");
    if (Buffer.byteLength(sourceText) > maxBytes) reject(`Scenario exceeds the ${maxBytes / 1024 / 1024} MiB limit for this operation.`, "SCENARIO_TOO_LARGE");
    const doc = ensureDoc(parseYaml(sourceText), refParts(ref));
    const contentHash = sha(sourceText);
    return { ...metadataFromDocument(doc, ref, path.relative(this.root, file), stat, contentHash), sourceText, scenario: doc.scenario };
  }
  async save(ref, sourceText, expected = {}) {
    await this.ensureWorkspace();
    const identity = refParts(ref);
    if (typeof sourceText !== "string" || Buffer.byteLength(sourceText) > MAX_SCENARIO_BYTES)
      reject("Scenario exceeds size limit.", "SCENARIO_TOO_LARGE");
    // The renderer cannot set canonical identity or revision. Only scenario body is accepted.
    const source = parseYaml(sourceText);
    const scenario = source?.kind === "grpc-scenario" ? source.scenario : source?.scenario || source;
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) reject("Expected scenario object.");
    if (scenario.id !== undefined && scenario.id !== identity.scenarioId) reject("Scenario ID mismatch.");
    return this.commit(identity, expected, () => scenario, { includeExecution: true });
  }

  async updateExecution(ref, expected, patch, includeSource = false) {
    await this.ensureWorkspace();
    const identity = refParts(ref);
    const { mode, intervalMs, loop, maxExecutions } = patch ?? {};
    if (!["incoming", "standby", "periodic", "hybrid"].includes(mode) ||
        !Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 86_400_000 ||
        typeof loop !== "boolean" || !Number.isSafeInteger(maxExecutions) || maxExecutions < 0)
      reject("Invalid stream delivery settings.");
    return this.commit(identity, expected, current => {
      if (!current) reject("Save a scenario before setting its delivery mode.");
      const stream = current.stream ?? { responses: current.response ? [current.response] : [] };
      const prior = streamExecution(stream);
      const preset = normalizeMockExecution({ mode });
      const execution = prior?.mode === mode
        ? prior
        : { ...preset, timeoutMs: prior?.timeoutMs ?? preset.timeoutMs,
          schedule: { ...preset.schedule, ...prior?.schedule, enabled: preset.schedule.enabled } };
      return { ...current, stream: { ...stream, execution: {
        ...stream.execution, ...execution,
        periodic: { ...stream.execution?.periodic, ...execution.periodic, intervalMs, loop, maxExecutions },
      } } };
    }, { includeSource, includeExecution: true });
  }

  async commit(identity, expected, update, { includeSource = false, includeExecution = false } = {}) {
    const file = await this.fileFor(identity);
    return withLock(file, async () => {
      let existing;
      try { existing = await this.read(identity); } catch (err) { if (err.code !== "ENOENT") throw err; }
      const currentRevision = existing?.revision || 0;
      if (expected.expectedRevision !== currentRevision ||
        (existing && expected.expectedHash !== existing.contentHash) ||
        (!existing && expected.expectedHash)) {
        return { ok: false, conflict: { revision: currentRevision, contentHash: existing?.contentHash || "" } };
      }
      const doc = { version: 3, kind: "grpc-scenario", methodKey: identity.methodKey,
        id: identity.scenarioId, revision: currentRevision + 1,
        scenario: { ...update(existing?.scenario), id: identity.scenarioId } };
      const text = stringifyYaml(doc);
      if (Buffer.byteLength(text) > MAX_SCENARIO_BYTES) reject("Scenario exceeds size limit.", "SCENARIO_TOO_LARGE");
      await assertDirectoryChain(this.root, relativeRef(identity));
      await writeAtomic(file, text);
      // Preserve the old index as an incremental change journal. The next
      // listing fingerprints disk metadata and reparses only this document.
      const saved = { revision: doc.revision, contentHash: sha(text) };
      if (includeExecution && doc.scenario.stream) saved.execution = streamExecution(doc.scenario.stream);
      if (includeSource && Buffer.byteLength(text) <= MAX_INLINE_SCENARIO_BYTES) saved.sourceText = stringifyYaml(doc.scenario);
      return { ok: true, saved };
    });
  }
  async remove(ref, expected = {}) {
    await this.ensureWorkspace();
    const file = await this.fileFor(ref);
    return withLock(file, async () => {
      const current = await this.read(ref);
      if (expected.expectedRevision !== current.revision || expected.expectedHash !== current.contentHash)
        return { ok: false, conflict: { revision: current.revision, contentHash: current.contentHash } };
      await fs.unlink(file);
      // A deleted file disappears from the next fingerprint scan. Keep the
      // remaining index metadata for incremental reconciliation.
      return { ok: true };
    });
  }
  async invalidateIndex() {
    // Index is disposable; never a source of truth.
    await fs.rm(this.indexFile, { force: true });
  }
  async listScenarioPaths() {
    await assertDirectoryChain(this.root, path.relative(this.root, this.base));
    let dirs = [];
    try { dirs = await fs.readdir(this.base, { withFileTypes: true }); } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
    const fileNames = [];
    for (let offset=0; offset<dirs.length; offset+=16) {
      const parts = await Promise.all(dirs.slice(offset,offset+16).map(async dir => {
        if (dir.isSymbolicLink()) reject("Symlink scenario directory.", "UNSAFE_PATH");
        if (!dir.isDirectory()) return [];
        const directory = path.join(this.base,dir.name);
        const output = [];
        for (const item of await fs.readdir(directory,{withFileTypes:true})) {
          if (item.isSymbolicLink()) reject("Symlink scenario file.", "UNSAFE_PATH");
          if (item.isFile() && item.name.endsWith(".scenario.yml")) output.push(path.join(directory,item.name));
        }
        return output;
      }));
      for (const group of parts) fileNames.push(...group);
    }
    return fileNames.sort((a, b) => a.localeCompare(b));
  }

  async statScenarioPaths(fileNames) {
    return Promise.all(fileNames.map(async file => {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) reject("Unsafe scenario file.", "UNSAFE_PATH");
      if (stat.size > MAX_SCENARIO_BYTES) reject("Scenario exceeds size limit.", "SCENARIO_TOO_LARGE");
      return { file, relative: path.relative(this.root, file).split(path.sep).join("/"),
        size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
    }));
  }

  async scanFiles() {
    const fileNames = await this.listScenarioPaths();
    const files = [];
    for (let offset=0; offset<fileNames.length; offset+=64) {
      files.push(...await this.statScenarioPaths(fileNames.slice(offset, offset + 64)));
    }
    return files;
  }
  /**
   * Catalog view: always fingerprint actual disk files, but reuse metadata for
   * unaffected documents when a single scenario changes. No response body is
   * retained in the index. Direct edits are detected by stat/ctime metadata.
   */
  async readMetadataIndex() {
    try {
      await assertDirectoryChain(this.root, path.relative(this.root, this.indexFile));
      const stat = await fs.lstat(this.indexFile);
      if (!stat.isSymbolicLink() && stat.isFile() && stat.size <= MAX_INDEX_BYTES) {
        const decoded = JSON.parse(await fs.readFile(this.indexFile, "utf8"));
        if (decoded?.version === INDEX_VERSION && Array.isArray(decoded.items) &&
            typeof decoded.fingerprint === "string" && decoded.items.every(item =>
              typeof item?.methodKey === "string" && typeof item.scenarioId === "string" &&
              typeof item.fileRef === "string" && typeof item.name === "string" &&
              Number.isSafeInteger(item.size) && item.size >= 0 && item.size <= MAX_SCENARIO_BYTES &&
              Number.isSafeInteger(item.revision) && typeof item.contentHash === "string")) return decoded;
      }
    } catch (err) { if (err.code !== "ENOENT" && !(err instanceof SyntaxError)) throw err; }
    return null;
  }

  async readCachedMetadata() {
    await this.ensureWorkspace();
    return (await this.readMetadataIndex())?.items;
  }

  async listMetadata(onProgress) {
    await this.ensureWorkspace();
    const cached = await this.readMetadataIndex();
    const fingerprintFor = files => sha(JSON.stringify(files.map(({ relative, size, mtimeMs, ctimeMs }) => [relative, size, mtimeMs, ctimeMs])));
    const files = cached ? await this.scanFiles() : [];
    if (cached && cached.fingerprint === fingerprintFor(files)) return { items: cached.items, cached: true };

    // Older generations are discarded once; new generations reuse only the
    // metadata of files whose size, mtime AND ctime are unchanged.
    const previous = new Map((cached?.items || []).map(item => [item.fileRef, item]));
    const items = [];
    const seen = new Set();
    let published = 0;
    const readBatch = async batch => {
      const portion = await Promise.all(batch.map(async fileInfo => {
        const { file, relative, size, mtimeMs, ctimeMs } = fileInfo;
        const prior = previous.get(relative);
        let meta;
        if (prior && prior.size === size && prior.mtimeMs === mtimeMs && prior.ctimeMs === ctimeMs) {
          meta = prior;
        } else {
          const raw = await fs.readFile(file, "utf8");
          if (Buffer.byteLength(raw) > MAX_SCENARIO_BYTES)
            reject("Scenario exceeds size limit.", "SCENARIO_TOO_LARGE");
          const doc = parseYaml(raw);
          if (typeof doc?.methodKey !== "string" || typeof doc?.id !== "string") reject(`Invalid scenario in ${relative}`);
          const ref = refParts({ methodKey: doc.methodKey, scenarioId: doc.id });
          if (path.resolve(this.root, relativeRef(ref)) !== file) reject(`Scenario path does not match its identity: ${relative}`, "SCENARIO_IDENTITY_MISMATCH");
          ensureDoc(doc, ref);
          // Refuse to publish a mixed index if the document was modified during
          // the stat/read window. Callers can safely retry with a fresh listing.
          const latestStat = await fs.stat(file);
          if (latestStat.size !== size || latestStat.mtimeMs !== mtimeMs || latestStat.ctimeMs !== ctimeMs)
            reject("Scenario changed during index compilation; retry.", "SCENARIO_CHANGED");
          meta = metadataFromDocument(doc, ref, relative, latestStat, sha(raw));
        }
        return meta;
      }));
      for (const meta of portion) {
        const key = `${meta.methodKey}\0${meta.scenarioId}`;
        if (seen.has(key)) reject("Duplicate scenario ID.");
        seen.add(key);
        items.push(meta);
      }
      // Publish a small first page, then batch updates to limit IPC and rendering work.
      if (!cached && onProgress && items.length - published >= (published ? 1024 : 64)) {
        onProgress(items.slice(published));
        published = items.length;
      }
    };
    if (cached) {
      for (const batch of scenarioReadBatches(files, 64)) await readBatch(batch);
    } else {
      // Publish the first batch while the remaining files are still being checked.
      const paths = await this.listScenarioPaths();
      for (let offset = 0; offset < paths.length; offset += 64) {
        const group = await this.statScenarioPaths(paths.slice(offset, offset + 64));
        files.push(...group);
        for (const batch of scenarioReadBatches(group, 64)) await readBatch(batch);
      }
    }
    const index = JSON.stringify({ version: INDEX_VERSION, fingerprint: fingerprintFor(files), items });
    if (Buffer.byteLength(index) <= MAX_INDEX_BYTES) {
      await assertDirectoryChain(this.root, path.relative(this.root, this.indexFile));
      await writeAtomic(this.indexFile, index);
    }
    return { items, cached: false };
  }

  /**
   * Runtime method-scoped snapshot does not traverse unrelated scenario
   * directories, regardless of the total workspace catalog size.
   */
  async listMethodMetadata(methodKey) {
    await this.ensureWorkspace();
    const validMethodKey = cleanKey(methodKey, "methodKey");
    const directory = path.join(this.base, token(validMethodKey));
    await assertDirectoryChain(this.root, path.relative(this.root, directory));
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (err) { if (err.code === "ENOENT") return { items: [], cached: false }; throw err; }
    const entriesToRead = entries.filter(entry => entry.name.endsWith(".scenario.yml"));
    if (entriesToRead.some(entry => !entry.isFile() || entry.isSymbolicLink()))
      reject("Unsafe scenario file in method directory.", "UNSAFE_PATH");
    const items = [];
    const files = [];
    for (let offset = 0; offset < entriesToRead.length; offset += 32) {
      files.push(...await Promise.all(entriesToRead.slice(offset, offset + 32).map(async entry => {
        const file = path.join(directory, entry.name);
        const stat = await fs.stat(file);
        if (!stat.isFile() || stat.size > MAX_SCENARIO_BYTES)
          reject("Scenario exceeds size limit.", "SCENARIO_TOO_LARGE");
        return { file, stat, size: stat.size };
      })));
    }
    for (const batch of scenarioReadBatches(files)) {
      const portion = await Promise.all(batch.map(async ({ file, stat }) => {
        const raw = await fs.readFile(file, "utf8");
        if (Buffer.byteLength(raw) > MAX_SCENARIO_BYTES)
          reject("Scenario exceeds size limit.", "SCENARIO_TOO_LARGE");
        const doc = parseYaml(raw);
        const ref = refParts({ methodKey: validMethodKey, scenarioId: doc?.id });
        ensureDoc(doc, ref);
        if (relativeRef(ref) !== path.relative(this.root, file))
          reject("Scenario path does not match its identity.", "SCENARIO_IDENTITY_MISMATCH");
        const check = await fs.stat(file);
        if (check.size !== stat.size || check.mtimeMs !== stat.mtimeMs || check.ctimeMs !== stat.ctimeMs)
          reject("Scenario changed during method compilation; retry.", "SCENARIO_CHANGED");
        return metadataFromDocument(doc, ref, path.relative(this.root, file), stat, sha(raw));
      }));
      items.push(...portion);
    }
    items.sort((a, b) => a.fileRef.localeCompare(b.fileRef));
    return { items, cached: false };
  }
  async buildRuntimeSnapshot(expected = {}) {
    // The index contains only metadata. A method-scoped Apply reads only that
    // method's bodies, rather than rehydrating 10k unrelated scenarios.
    const scope = typeof expected.methodKey === "string" ? expected.methodKey : null;
    const before = scope ? await this.listMethodMetadata(scope) : await this.listMetadata();
    const selectedItems = scope ? before.items.filter(item => item.methodKey === scope) : before.items;
    if (selectedItems.reduce((sum, item) => sum + item.size, 0) > MAX_SNAPSHOT_BYTES)
      reject("Scenario files exceed the 128 MiB runtime snapshot budget.", "SNAPSHOT_TOO_LARGE");
    const scenarios = [];
    for (const batch of scenarioReadBatches(selectedItems)) {
      const compiled = await Promise.all(batch.map(async item => {
        const current = await this.read(item);
        if (current.revision !== item.revision || current.contentHash !== item.contentHash)
          reject("Scenario changed during runtime compilation; retry apply.", "SCENARIO_CHANGED");
        const separator = item.methodKey.lastIndexOf("/");
        if (separator <= 0 || separator === item.methodKey.length - 1) reject("Invalid gRPC method identity.");
        return { ...current.scenario,
          service: item.methodKey.slice(0, separator), method: item.methodKey.slice(separator + 1) };
      }));
      scenarios.push(...compiled);
    }
    const after = scope ? await this.listMethodMetadata(scope) : await this.listMetadata();
    if (JSON.stringify(before.items.map(x => [x.methodKey,x.scenarioId,x.contentHash])) !==
        JSON.stringify(after.items.map(x => [x.methodKey,x.scenarioId,x.contentHash])))
      reject("Scenario index changed during runtime compilation; retry apply.", "SCENARIO_CHANGED");
    if (expected.ref) {
      if (scope && expected.ref.methodKey !== scope)
        reject("Method-scoped Apply cannot select an unrelated scenario.", "SCENARIO_IDENTITY_MISMATCH");
      const found = after.items.find(item => item.methodKey === expected.ref.methodKey && item.scenarioId === expected.ref.scenarioId);
      if (!found || found.revision !== expected.revision || found.contentHash !== expected.contentHash)
        reject("Selected scenario revision was not saved or has changed.", "SCENARIO_CHANGED");
    }
    return { scenarios, count: scenarios.length, methodKey: scope,
      snapshotHash: sha(JSON.stringify(after.items.map(x => [x.methodKey,x.scenarioId,x.revision,x.contentHash]))) };
  }

  /**
   * One-time, lossless migration of the pre-v3 gRPC scenario documents.
   * Compatibility is limited to this importer. Legacy files are NOT a live
   * scenario source after migration. Originals are archived under .layang.
   */
  async migrateLegacy(options = {}) {
    await this.ensureWorkspace();
    return withLock(`${this.root}:canonical-grpc-migration`, async () => {
      const base = path.join(this.root, "mocks", "grpc");
      const methodDir = path.join(base, "methods");
      await assertDirectoryChain(this.root, path.relative(this.root, methodDir));
      let sources = [];
      try {
        sources = (await fs.readdir(methodDir, { withFileTypes: true }))
          .filter(item => item.name.endsWith(".mock.yml"))
          .map(item => ({ ...item, sourcePath: path.join(methodDir, item.name),
            relative: path.join("methods", item.name), isSafeFile: item.isFile() && !item.isSymbolicLink() }));
      } catch (err) { if (err.code !== "ENOENT") throw err; }
      const globalPath = path.join(base, "scenarios.yml");
      try {
        const stat = await fs.lstat(globalPath);
        sources.push({ sourcePath: globalPath, relative: "scenarios.yml",
          isSafeFile: stat.isFile() && !stat.isSymbolicLink(), global: true });
      } catch (err) { if (err.code !== "ENOENT") throw err; }
      if (!sources.length) return { ok: true, alreadyMigrated: true, migrated: 0, methods: 0, scenarios: 0 };
      if (sources.some(source => !source.isSafeFile)) reject("Unsafe legacy mock source.", "UNSAFE_PATH");
      const oldFiles = [];
      const scenarios = new Map();
      for (const source of sources) {
        await assertDirectoryChain(this.root, path.relative(this.root, source.sourcePath));
        const stat = await fs.stat(source.sourcePath);
        if (stat.size > MAX_LEGACY_BYTES) reject("Legacy document exceeds 128 MiB; split it before migration.");
        const raw = await fs.readFile(source.sourcePath, "utf8");
        const decoded = source.global
          ? (() => {
              const value = parseYaml(raw);
              if (!Array.isArray(value) && !Array.isArray(value?.scenarios))
                reject("Invalid global gRPC scenario bundle; refusing to discard it.");
              return { globalScenarios: Array.isArray(value) ? value : value.scenarios };
            })()
          : decodeGrpcMockDocument(parseYaml(raw));
        const entries = source.global ? decoded.globalScenarios : decoded.scenarios;
        if (!Array.isArray(entries)) reject("Invalid legacy gRPC scenario bundle.");
        for (const scenario of entries) {
          const methodKey = source.global
            ? `${String(scenario?.service || "")}/${String(scenario?.method || "")}`
            : decoded.methodKey;
          if (!methodKey || methodKey.startsWith("/") || methodKey.endsWith("/") ||
              typeof scenario?.id !== "string" || !scenario.id)
            reject("Legacy scenario lacks a valid method identity or scenario ID.");
          const ref = refParts({ methodKey, scenarioId: scenario.id });
          const fileName = await this.fileFor(ref);
          const identity = path.resolve(fileName);
          if (scenarios.has(identity)) reject("Duplicate legacy scenario identity; migration aborted.", "MIGRATION_CONFLICT");
          const doc = { version: 3, kind: "grpc-scenario", methodKey: ref.methodKey,
            id: ref.scenarioId, revision: 1, scenario: { ...scenario, id: ref.scenarioId } };
          const content = stringifyYaml(doc);
          const size = Buffer.byteLength(content);
          if (size > MAX_SCENARIO_BYTES)
            reject(`Legacy scenario "${ref.scenarioId}" for ${ref.methodKey} is ${(size / 1024 / 1024).toFixed(1)} MiB after conversion. The limit is 32 MiB. Original file kept at ${source.relative}.`, "SCENARIO_TOO_LARGE");
          scenarios.set(identity, { ref, fileName, doc, content, exists: false });
        }
        oldFiles.push({ ...source, raw });
      }
      // A workspace may have been partly migrated earlier. Never replace a v3
      // document, even if it has the same identity and a newer revision.
      for (const item of scenarios.values()) {
        try {
          const current = await this.read(item.ref);
          if (JSON.stringify(current.scenario) !== JSON.stringify(item.doc.scenario))
            reject("Legacy/v3 scenario collision; originals kept for manual resolution.", "MIGRATION_CONFLICT");
          item.exists = true;
        } catch (err) { if (err.code !== "ENOENT") throw err; }
      }
      if (options.dryRun !== false) {
        return { ok: true, dryRun: true, methods: oldFiles.filter(item => !item.global).length,
          scenarios: scenarios.size, alreadyPresent: [...scenarios.values()].filter(item => item.exists).length };
      }
      const backup = path.join(this.root, ".layang", `grpc-v3-backup-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`);
      await assertDirectoryChain(this.root, path.relative(this.root, backup));
      await fs.mkdir(backup, { recursive: true });
      for (const item of oldFiles) {
        const destination = path.join(backup, item.relative);
        await writeAtomic(destination, item.raw);
        if (sha(await fs.readFile(destination, "utf8")) !== sha(item.raw))
          reject("Backup verification failed; legacy source has not been removed.", "MIGRATION_BACKUP_FAILED");
      }
      const written = [];
      const removed = [];
      try {
        for (const item of scenarios.values()) {
          if (item.exists) continue;
          await assertDirectoryChain(this.root, relativeRef(item.ref));
          await writeAtomic(item.fileName, item.content);
          written.push(item.fileName);
          const saved = await this.read(item.ref);
          if (saved.revision !== 1 || saved.contentHash !== sha(item.content))
            reject("Converted scenario failed verification.", "MIGRATION_VERIFY_FAILED");
        }
        await this.invalidateIndex();
        await this.listMetadata(); // detect collisions/corruption before deleting old sources
        if (options.cleanup !== false) {
          for (const source of oldFiles) {
            // Refuse removal if a concurrent external edit changed the source.
            if (sha(await fs.readFile(source.sourcePath, "utf8")) !== sha(source.raw))
              reject("Legacy source changed during migration; refusing cleanup.", "MIGRATION_CONFLICT");
            await fs.unlink(source.sourcePath);
            removed.push(source);
          }
        }
        return { ok: true, migrated: written.length,
          methods: oldFiles.filter(item => !item.global).length,
          scenarios: scenarios.size, backupPath: backup,
          legacyPreserved: options.cleanup === false };
      } catch (err) {
        for (const source of removed) await writeAtomic(source.sourcePath, source.raw);
        for (const fileName of written) await fs.rm(fileName, { force: true }).catch(() => {});
        await this.invalidateIndex();
        throw err;
      }
    });
  }}

module.exports = { GrpcScenarioRepository, MAX_SCENARIO_BYTES, relativeRef };
