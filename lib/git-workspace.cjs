"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { stringifyYaml, parseYaml } = require("./workspace-yaml.cjs");
const {
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
} = require("./workspace-v6-codec.cjs");

const { gitWorkspaceVersion: GIT_WORKSPACE_VERSION } = require("./workspace-versions.json");
const ROOT_FILE = "layang.yml";
const LOCAL_DIR = ".layang";
const SEQ_GAP = 1000;

async function readGitWorkspace(rootDirectory) {
  const root = path.resolve(rootDirectory || ".");
  const rootPath = path.join(root, ROOT_FILE);
  if (!fs.existsSync(rootPath)) return null;

  const manifest = await readYaml(rootPath);
  assertSupportedWorkspaceVersion(manifest, root);
  const local = await readLocalState(root);
  const [collections, protoLibraries, environments, examples, methodDocs, mocks, gatewayProfiles, documentation] =
    await Promise.all([
      readCollections(root, local.requestEnvironments),
      readProtoLibraries(root, local.paths),
      readEnvironments(root),
      readExamples(root),
      readPublishedDocs(root),
      readMocks(root, local.paths),
      readGatewayProfiles(root, local.paths),
      readDocumentation(root),
    ]);
  hydrateGrpcBindings(collections, protoLibraries);
  hydrateExampleReferences(examples, collections);

  const project = {
    version: 3,
    updatedAt: stringOr(local.project.updatedAt, new Date(0).toISOString()),
    ...local.project,
    collections,
    protoLibraries,
    protoFiles: deriveActiveProtoFiles(
      protoLibraries,
      local.project.activeProtoLibraryId,
      local.project.activeProtoVersionId,
    ),
    environments,
    examples,
    methodDocs,
    docResults: local.docResults,
    documentation,
    mockServer: {
      ...mocks.grpc,
      gatewayProfiles,
      activeGatewayProfileId: stringOr(mocks.grpc.activeGatewayProfileId, gatewayProfiles[0]?.id || "default-gateway"),
    },
    restMockServer: mocks.rest,
    wsMockServer: mocks.websocket,
    requestTabs: local.requestTabs,
    history: local.history,
  };

  return {
    root,
    source: `git-workspace-v${Number(manifest?.version || 5) >= 6 ? 6 : 5}`,
    manifest,
    project,
    layout: local.layout,
    settings: local.settings,
    scenarios: mocks.grpcScenarios,
    mockServer: project.mockServer,
  };
}

async function migrateGitWorkspace(rootDirectory, options = {}) {
  const root = path.resolve(rootDirectory || ".");
  const manifest = await readYamlIfExists(path.join(root, ROOT_FILE));
  if (!manifest) throw new Error(`No ${ROOT_FILE} was found in ${root}.`);
  const mode = options.mode === "format" ? "format" : "migrate";
  const currentVersion = Number(manifest.version || 1);
  assertSupportedWorkspaceVersion(manifest, root);
  const needsMigration =
    currentVersion < GIT_WORKSPACE_VERSION ||
    manifest?.format?.protos !== "revision-snapshot-v1" ||
    manifest?.format?.collections !== "yaml-entity-v2";
  const result = {
    root,
    mode,
    currentVersion,
    targetVersion: GIT_WORKSPACE_VERSION,
    needsMigration,
    check: options.check === true,
  };
  if (options.check) {
    if (mode === "format") result.needsFormatting = needsMigration || (await workspaceNeedsFormatting(root));
    return result;
  }
  const workspace = await readGitWorkspace(root);
  if (!workspace) throw new Error(`Unable to read workspace ${root}.`);
  await writeGitWorkspace(root, {
    project: workspace.project,
    layout: workspace.layout,
    settings: workspace.settings,
  });
  return { ...result, migrated: needsMigration, formatted: true, needsFormatting: false };
}

async function workspaceNeedsFormatting(root) {
  const before = await snapshotTrackedWorkspaceFiles(root);
  const tempBase = await fsp.mkdtemp(path.join(os.tmpdir(), "layang-format-check-"));
  const copyRoot = path.join(tempBase, "workspace");
  try {
    await fsp.cp(root, copyRoot, {
      recursive: true,
      force: true,
      filter: (source) => {
        const relative = path.relative(root, source);
        if (!relative) return true;
        const first = relative.split(path.sep)[0];
        return !new Set([".git", "node_modules", ".next", "out", "dist"]).has(first);
      },
    });
    const workspace = await readGitWorkspace(copyRoot);
    if (!workspace) throw new Error(`Unable to read workspace ${root}.`);
    await writeGitWorkspace(copyRoot, {
      project: workspace.project,
      layout: workspace.layout,
      settings: workspace.settings,
    });
    const after = await snapshotTrackedWorkspaceFiles(copyRoot);
    return !workspaceSnapshotsEqual(before, after);
  } finally {
    await fsp.rm(tempBase, { recursive: true, force: true });
  }
}

async function snapshotTrackedWorkspaceFiles(root) {
  const output = new Map();
  if (!fs.existsSync(root)) return output;
  await walk(root, async (file) => {
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (!isTrackedWorkspaceFormatFile(relative)) return;
    output.set(relative, await fsp.readFile(file));
  });
  return output;
}

function isTrackedWorkspaceFormatFile(relative) {
  if ([ROOT_FILE, "README.md", ".gitignore", ".gitattributes"].includes(relative)) return true;
  if (relative.startsWith("collections/")) return true;
  if (relative.startsWith("protos/")) return true;
  if (relative.startsWith("mocks/")) return true;
  if (relative.startsWith("gateways/")) return true;
  if (relative.startsWith("workspace-schemas/")) return true;
  if (relative.startsWith("examples/") && relative.endsWith(".example.yml")) return true;
  if (relative.startsWith("environments/") && relative.endsWith(".environment.yml")) return true;
  if (["docs/settings.yml", "docs/build-manifest.yml"].includes(relative)) return true;
  return false;
}

function workspaceSnapshotsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const [file, content] of left) {
    const other = right.get(file);
    if (!other || !content.equals(other)) return false;
  }
  return true;
}

async function writeGitWorkspace(rootDirectory, bundle) {
  const root = path.resolve(rootDirectory);
  await fsp.mkdir(root, { recursive: true });
  const project = isObject(bundle?.project) ? bundle.project : {};
  const previousManifest = await readYamlIfExists(path.join(root, ROOT_FILE));
  if (previousManifest) assertSupportedWorkspaceVersion(previousManifest, root);
  const workspaceId = stringOr(previousManifest?.workspace?.id, stableId("workspace", path.basename(root) || "layang"));
  const workspaceName = stringOr(previousManifest?.workspace?.name, path.basename(root) || "Layang Workspace");
  if (previousManifest && Number(previousManifest.version || 1) < GIT_WORKSPACE_VERSION) {
    await backupWorkspaceBeforeMigration(root, Number(previousManifest.version || 1));
  }

  // Proto revisions are immutable. Legacy workspaces only had project.protoFiles,
  // so promote those files into one managed library before writing v6. Without this
  // compatibility path a main-process folder migration could silently produce an
  // empty protos/ manifest even though the old workspace still had .proto files.
  const protoLibraries = protoLibrariesForWrite(project);
  await writeProtoLibraries(root, protoLibraries);

  // Do not let Promise.all reject while sibling writers are still mutating the workspace.
  // Migration staging may be removed immediately after an error, so every writer must
  // settle before the error escapes or late writes can race with rollback/cleanup.
  const writeResults = await Promise.allSettled([
    writeCollections(root, arrayOr(project.collections)),
    writeEnvironments(root, arrayOr(project.environments)),
    writeExamples(root, arrayOr(project.examples), arrayOr(project.collections)),
    writePublishedDocs(root, arrayOr(project.methodDocs)),
    writeMocks(root, project),
    writeGatewayProfiles(root, arrayOr(project.mockServer?.gatewayProfiles)),
    writeLocalState(root, bundle),
    ensureGitIgnore(root),
    ensureGitAttributes(root),
    ensureWorkspaceSchemas(root),
  ]);
  const failedWrite = writeResults.find((result) => result.status === "rejected");
  if (failedWrite) throw failedWrite.reason;
  await writeDocumentationSources(
    root,
    isObject(project.documentation) ? project.documentation : {},
    arrayOr(project.collections),
  );

  // The root manifest is the commit marker for the workspace format. Write it last so
  // a failed first write/migration cannot make a partial workspace look current.
  await writeYamlAtomic(path.join(root, ROOT_FILE), {
    version: GIT_WORKSPACE_VERSION,
    kind: "workspace",
    workspace: {
      id: workspaceId,
      name: workspaceName,
      description: optionalString(previousManifest?.workspace?.description),
    },
    extensions: isObject(previousManifest?.extensions) ? previousManifest.extensions : undefined,
    format: {
      collections: "yaml-entity-v2",
      protos: "revision-snapshot-v1",
      mocks: "native-yaml-v2",
      examples: "request-ref-v2",
      localState: `${LOCAL_DIR}/`,
    },
  });

  return { root, version: GIT_WORKSPACE_VERSION };
}


function protoLibrariesForWrite(project) {
  const libraries = arrayOr(project?.protoLibraries).filter(isObject);
  if (libraries.length) return libraries;

  const legacyFiles = arrayOr(project?.protoFiles)
    .filter((file) => file && typeof file === "object" && typeof file.name === "string" && file.name.trim())
    .map((file) => ({ name: safeRelative(String(file.name)), text: String(file.text || "") }));
  if (!legacyFiles.length) return [];

  const files = fileMap(legacyFiles);
  const checksum = computeProtoChecksum(files);
  const timestamp = stringOr(project?.updatedAt, new Date().toISOString());
  const libraryId = stableId("proto-library", `Workspace Proto|${checksum}`);
  const versionId = stableId("proto-version", `${libraryId}|legacy-v1|${checksum}`);
  return [
    {
      id: libraryId,
      name: "Workspace Proto",
      description: "Migrated automatically from the legacy workspace protoFiles field.",
      lifecycle: "active",
      defaultVersionId: versionId,
      versions: [
        {
          id: versionId,
          libraryId,
          version: "legacy-v1",
          lifecycle: "active",
          checksum,
          files: legacyFiles,
          source: { type: "local-files" },
          importedAt: timestamp,
          createdAt: timestamp,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

async function writeCollections(root, collections) {
  const base = path.join(root, "collections");
  await fsp.mkdir(base, { recursive: true });
  const expected = new Map();

  for (const collection of collections) {
    if (!isObject(collection)) continue;
    const collectionId = stringOr(collection.id, stableId("collection", collection.name));
    const collectionDir = path.join(base, entitySegment(collection.name || "collection", collectionId));
    expected.set(
      path.join(collectionDir, "collection.yml"),
      stringifyYaml({
        version: 2,
        kind: "collection",
        collection: compact({
          id: collectionId,
          name: stringOr(collection.name, "Collection"),
          description: optionalString(collection.description),
          extensions: nonEmptyObject(collection.extensions),
        }),
      }),
    );

    const folders = arrayOr(collection.folders).filter(isObject);
    const folderById = new Map(folders.map((folder) => [String(folder.id), folder]));
    const folderPathById = new Map();
    const resolving = new Set();
    const resolveFolderPath = (folder) => {
      const id = String(folder.id);
      if (folderPathById.has(id)) return folderPathById.get(id);
      if (resolving.has(id)) return collectionDir;
      resolving.add(id);
      const parent = folder.parentId ? folderById.get(String(folder.parentId)) : null;
      const parentPath = parent ? resolveFolderPath(parent) : collectionDir;
      const folderPath = path.join(parentPath, entitySegment(folder.name || "folder", id));
      resolving.delete(id);
      folderPathById.set(id, folderPath);
      return folderPath;
    };

    for (const folder of folders) {
      const folderPath = resolveFolderPath(folder);
      expected.set(
        path.join(folderPath, "folder.yml"),
        stringifyYaml({
          version: 2,
          kind: "folder",
          folder: compact({
            id: String(folder.id),
            name: stringOr(folder.name, "Folder"),
            description: optionalString(folder.description),
            order: normalizeOrder(folder.order),
            extensions: nonEmptyObject(folder.extensions),
          }),
        }),
      );
    }

    for (const request of arrayOr(collection.requests).filter(isObject)) {
      const parentPath = request.parentId
        ? folderPathById.get(String(request.parentId)) || collectionDir
        : collectionDir;
      const kind = normalizeKind(request.kind);
      const requestId = stringOr(request.id, stableId("request", `${collectionId}/${request.name}`));
      const fileName = `${entitySegment(request.name || "request", requestId)}.${kind}.yml`;
      expected.set(
        path.join(parentPath, fileName),
        stringifyYaml(encodeRequestDocument({ ...request, id: requestId, kind })),
      );
    }
  }

  await syncManagedFiles(base, expected, isManagedCollectionFile, { preserveComments: true });
}

async function readCollections(root, localEnvironmentByRequest = {}) {
  const base = path.join(root, "collections");
  if (!fs.existsSync(base)) return [];
  const collectionMetaFiles = [];
  await walk(base, async (file) => {
    if (path.basename(file) === "collection.yml") collectionMetaFiles.push(file);
  });
  const output = [];
  for (const metaFile of collectionMetaFiles.sort()) {
    const doc = await readYaml(metaFile);
    const meta = isObject(doc?.collection) ? doc.collection : {};
    const collectionDir = path.dirname(metaFile);
    const collectionId = stringOr(meta.id, stableId("collection", collectionDir));
    const folders = [];
    const requests = [];
    const folderIdByDirectory = new Map([[collectionDir, null]]);
    const folderFiles = [];
    const requestFiles = [];
    await walk(collectionDir, async (file) => {
      const name = path.basename(file);
      if (name === "folder.yml") folderFiles.push(file);
      else if (/\.(rest|grpc|websocket)\.yml$/i.test(name)) requestFiles.push(file);
    });
    folderFiles.sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
    for (const file of folderFiles) {
      const folderDoc = await readYaml(file);
      const folder = isObject(folderDoc?.folder) ? folderDoc.folder : {};
      const directory = path.dirname(file);
      const parentDirectory = path.dirname(directory);
      const id = stringOr(folder.id, stableId("folder", path.relative(collectionDir, directory)));
      folderIdByDirectory.set(directory, id);
      const legacy = Number(folderDoc?.version || 1) < 2 || !folderDoc?.kind;
      folders.push({
        id,
        collectionId,
        parentId: folderIdByDirectory.get(parentDirectory) || null,
        name: stringOr(folder.name, path.basename(directory)),
        description: optionalString(folder.description),
        order: legacy ? orderFromSeq(folder.seq) : normalizeOrder(folder.order),
        extensions: {
          ...(isObject(folder.extensions) ? folder.extensions : {}),
          ...collectUnknownFields(
            folder,
            new Set(["id", "name", "description", "order", "seq", "createdAt", "updatedAt", "extensions"]),
          ),
        },
        createdAt: stringOr(folder.createdAt, new Date(0).toISOString()),
        updatedAt: stringOr(folder.updatedAt, new Date(0).toISOString()),
      });
    }
    for (const file of requestFiles.sort()) {
      const requestDoc = await readYaml(file);
      const info = isObject(requestDoc?.info) ? requestDoc.info : {};
      const requestId = stringOr(info.id, stableId("request", path.relative(collectionDir, file)));
      const kindFromName = path.basename(file).match(/\.(rest|grpc|websocket)\.yml$/i)?.[1];
      const decoded = decodeRequestDocument(requestDoc, kindFromName, localEnvironmentByRequest[requestId]);
      const request = decoded.request;
      requests.push({
        id: requestId,
        collectionId,
        parentId: folderIdByDirectory.get(path.dirname(file)) || null,
        order: decoded.order === undefined ? orderFromSeq(info.seq) : decoded.order,
        name: stringOr(info.name, path.basename(file).replace(/\.(rest|grpc|websocket)\.yml$/i, "")),
        kind: decoded.kind,
        ...request,
        createdAt: stringOr(info.createdAt, new Date(0).toISOString()),
        updatedAt: stringOr(info.updatedAt, new Date(0).toISOString()),
      });
    }
    normalizeSiblingOrder(folders, requests);
    output.push({
      id: collectionId,
      name: stringOr(meta.name, path.basename(collectionDir)),
      description: optionalString(meta.description),
      extensions: {
        ...(isObject(meta.extensions) ? meta.extensions : {}),
        ...collectUnknownFields(meta, new Set(["id", "name", "description", "createdAt", "updatedAt", "extensions"])),
      },
      folders,
      requests,
      createdAt: stringOr(meta.createdAt, new Date(0).toISOString()),
      updatedAt: stringOr(meta.updatedAt, new Date(0).toISOString()),
    });
  }
  return output;
}

async function writeProtoLibraries(root, libraries) {
  const base = path.join(root, "protos");
  await fsp.mkdir(base, { recursive: true });
  const expected = new Map();
  expected.set(
    path.join(base, ".layang-managed"),
    "Managed by Layang. Store external or vendor proto sources outside this directory.\n",
  );

  for (const library of libraries.filter(isObject)) {
    const libraryId = stringOr(library.id, stableId("proto-library", library.name));
    const libraryDir = path.join(base, entitySegment(library.name || "proto", libraryId));
    expected.set(
      path.join(libraryDir, "library.yml"),
      stringifyYaml({
        version: 2,
        kind: "proto-library",
        library: compact({
          id: libraryId,
          name: stringOr(library.name, "Proto Schema"),
          description: optionalString(library.description),
          lifecycle: stringOr(library.lifecycle, "active"),
          archivedAt: optionalString(library.archivedAt),
          defaultRevisionId: optionalString(library.defaultVersionId),
          extensions: nonEmptyObject(library.extensions),
        }),
      }),
    );

    const versions = arrayOr(library.versions).filter(isObject);
    const versionById = new Map(versions.map((version) => [String(version.id), version]));
    const ordered = topologicalVersions(versions, versionById);
    for (let index = 0; index < ordered.length; index += 1) {
      const version = ordered[index];
      const versionId = stringOr(version.id, stableId("proto-version", `${libraryId}/${index}`));
      const versionDir = path.join(
        libraryDir,
        "revisions",
        entitySegment(version.version || `revision-${index + 1}`, versionId),
      );
      const currentFiles = new Map([...fileMap(version.files)].map(([name, text]) => [name, normalizeTextFile(text)]));
      const checksum = computeProtoChecksum(currentFiles);
      const sanitizedSource = sanitizeProtoSource(version.source, versionId);
      expected.set(
        path.join(versionDir, "revision.yml"),
        stringifyYaml({
          version: 2,
          kind: "proto-revision",
          revision: compact({
            id: versionId,
            label: stringOr(version.version, `Revision ${index + 1}`),
            lifecycle: stringOr(version.lifecycle, "active"),
            archivedAt: optionalString(version.archivedAt),
            checksum,
            previousRevisionId: optionalString(version.previousVersionId),
            storage: "snapshot",
            immutable: true,
            source: sanitizedSource.tracked,
            importedAt: optionalString(version.importedAt),
            createdAt: optionalString(version.createdAt),
            extensions: nonEmptyObject(version.extensions),
          }),
        }),
      );
      for (const [name, text] of currentFiles.entries()) {
        expected.set(path.join(versionDir, "files", safeRelative(name)), normalizeTextFile(String(text)));
      }
    }
  }

  await assertImmutableProtoRevisions(base, expected);
  await syncManagedFiles(base, expected, isManagedProtoFile, { preserveComments: true });
}

async function readProtoLibraries(root, localPaths = {}) {
  const base = path.join(root, "protos");
  if (!fs.existsSync(base)) return [];
  const libraryFiles = [];
  await walk(base, async (file) => {
    if (path.basename(file) === "library.yml") libraryFiles.push(file);
  });
  const libraries = [];
  for (const libraryFile of libraryFiles.sort()) {
    const libraryDoc = await readYaml(libraryFile);
    const meta = isObject(libraryDoc?.library) ? libraryDoc.library : {};
    const libraryDir = path.dirname(libraryFile);
    const revisionFiles = [];
    await walk(path.join(libraryDir, "revisions"), async (file) => {
      if (path.basename(file) === "revision.yml") revisionFiles.push(file);
    }).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
    const descriptors = [];
    for (const revisionFile of revisionFiles.sort()) {
      const doc = await readYaml(revisionFile);
      const revision = isObject(doc?.revision) ? doc.revision : {};
      const revisionDir = path.dirname(revisionFile);
      descriptors.push({
        revision,
        legacy: Number(doc?.version || 1) < 2 || !doc?.kind,
        deletedFiles: arrayOr(doc?.changes?.deletedFiles).map(String),
        revisionDir,
      });
    }
    const byId = new Map(descriptors.map((item) => [String(item.revision.id), item]));
    const resolved = new Map();
    const resolveFiles = async (descriptor, stack = new Set()) => {
      const id = String(descriptor.revision.id);
      if (resolved.has(id)) return resolved.get(id);
      if (stack.has(id)) throw new Error(`Proto revision cycle in ${libraryDir}: ${id}`);
      stack.add(id);
      let files = new Map();
      if (
        descriptor.revision.storage === "delta" &&
        (descriptor.revision.baseRevisionId || descriptor.revision.previousRevisionId)
      ) {
        const baseId = String(descriptor.revision.baseRevisionId || descriptor.revision.previousRevisionId);
        const baseDescriptor = byId.get(baseId);
        if (!baseDescriptor) throw new Error(`Missing base proto revision ${baseId}`);
        files = new Map(await resolveFiles(baseDescriptor, stack));
        for (const deleted of descriptor.deletedFiles) files.delete(deleted);
        const changes = await readProtoMap(path.join(descriptor.revisionDir, "changes"));
        for (const [name, text] of changes) files.set(name, text);
      } else {
        files = await readProtoMap(path.join(descriptor.revisionDir, "files"));
      }
      stack.delete(id);
      resolved.set(id, files);
      return files;
    };
    const versions = [];
    for (const descriptor of descriptors) {
      const files = await resolveFiles(descriptor);
      const revision = descriptor.revision;
      const actualChecksum = computeProtoChecksum(files);
      const storedChecksum = stringOr(revision.checksum, "");
      const revisionId = stringOr(revision.id, stableId("proto-version", descriptor.revisionDir));
      versions.push({
        id: revisionId,
        libraryId: stringOr(meta.id, stableId("proto-library", libraryDir)),
        version: stringOr(revision.label, "Revision"),
        lifecycle: stringOr(revision.lifecycle, "active"),
        archivedAt: optionalString(revision.archivedAt),
        checksum: actualChecksum,
        storedChecksum: storedChecksum || undefined,
        integrity:
          storedChecksum && storedChecksum !== actualChecksum
            ? { status: "externally-modified", storedChecksum, actualChecksum }
            : { status: "valid", actualChecksum },
        files: [...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, text]) => ({ name, text })),
        previousVersionId: optionalString(
          revision.previousRevisionId || revision.previousVersionId || revision.baseRevisionId,
        ),
        source: restoreProtoSource(isObject(revision.source) ? revision.source : { type: "local-files" }, localPaths),
        importedAt: stringOr(revision.importedAt, new Date(0).toISOString()),
        createdAt: stringOr(revision.createdAt, new Date(0).toISOString()),
        extensions: isObject(revision.extensions) ? revision.extensions : {},
      });
    }
    versions.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const libraryId = stringOr(meta.id, stableId("proto-library", libraryDir));
    libraries.push({
      id: libraryId,
      name: stringOr(meta.name, path.basename(libraryDir)),
      description: optionalString(meta.description),
      lifecycle: stringOr(meta.lifecycle, "active"),
      archivedAt: optionalString(meta.archivedAt),
      defaultVersionId: stringOr(meta.defaultRevisionId || meta.defaultVersionId, versions.at(-1)?.id || ""),
      versions,
      extensions: isObject(meta.extensions) ? meta.extensions : {},
      createdAt: stringOr(meta.createdAt, new Date(0).toISOString()),
      updatedAt: stringOr(meta.updatedAt, new Date(0).toISOString()),
    });
  }
  return libraries;
}

async function writeEnvironments(root, environments) {
  const base = path.join(root, "environments");
  const expected = new Map();
  for (const env of environments.filter(isObject)) {
    const key = stringOr(env.key, stableId("environment", env.label));
    const known = new Set([
      "key",
      "label",
      "grpcWebBaseUrl",
      "nativeTarget",
      "websocketUrl",
      "restBaseUrl",
      "variables",
      "extensions",
    ]);
    const extensions = { ...(isObject(env.extensions) ? env.extensions : {}), ...collectUnknownFields(env, known) };
    expected.set(
      path.join(base, `${entitySegment(env.label || key, key)}.environment.yml`),
      stringifyYaml({
        version: 2,
        kind: "environment",
        environment: compact({
          key,
          label: stringOr(env.label, key),
          targets: compact({
            rest: optionalString(env.restBaseUrl),
            grpcNative: optionalString(env.nativeTarget),
            grpcWeb: optionalString(env.grpcWebBaseUrl),
            websocket: optionalString(env.websocketUrl),
          }),
          variables: nonEmptyObject(env.variables),
          extensions: nonEmptyObject(extensions),
        }),
      }),
    );
  }
  await syncManagedFiles(base, expected, (file) => file.endsWith(".environment.yml"), { preserveComments: true });
}

async function readEnvironments(root) {
  const base = path.join(root, "environments");
  const files = await matchingFiles(base, (file) => file.endsWith(".environment.yml"));
  const output = [];
  for (const file of files) {
    const doc = await readYaml(file);
    if (!isObject(doc?.environment)) continue;
    const env = doc.environment;
    const targets = isObject(env.targets) ? env.targets : {};
    const known = new Set([
      "key",
      "label",
      "targets",
      "grpcWebBaseUrl",
      "nativeTarget",
      "websocketUrl",
      "restBaseUrl",
      "variables",
      "extensions",
    ]);
    output.push({
      key: env.key,
      label: env.label,
      grpcWebBaseUrl: stringOr(targets.grpcWeb, stringOr(env.grpcWebBaseUrl, "")),
      nativeTarget: stringOr(targets.grpcNative, stringOr(env.nativeTarget, "")),
      websocketUrl: stringOr(targets.websocket, stringOr(env.websocketUrl, "")),
      restBaseUrl: stringOr(targets.rest, stringOr(env.restBaseUrl, "")),
      variables: isObject(env.variables) ? env.variables : {},
      extensions: {
        ...(isObject(env.extensions) ? env.extensions : {}),
        ...collectUnknownFields(env, known),
      },
    });
  }
  const overlays = await matchingFiles(base, (file) => file.endsWith(".local.yml"));
  for (const file of overlays) {
    const doc = await readYaml(file);
    const overlay = isObject(doc?.environment) ? doc.environment : doc;
    if (!isObject(overlay) || !overlay.key) continue;
    const index = output.findIndex((environment) => String(environment.key) === String(overlay.key));
    if (index >= 0) output[index] = deepMerge(output[index], overlay);
    else output.push(overlay);
  }
  return output;
}

async function writeExamples(root, examples, collections = []) {
  const expected = new Map();
  const requestLocations = buildRequestLocations(root, collections);
  const orphanBase = path.join(root, "examples", "orphaned");
  for (const example of examples.filter(isObject)) {
    const id = stringOr(
      example.id,
      stableId("example", `${example.serviceName}/${example.methodName}/${example.name}`),
    );
    const requestId = stringOr(
      example.requestId || example.requestRef?.id,
      inferExampleRequestId(example, collections),
    );
    const requestLocation = requestId ? requestLocations.get(requestId) : null;
    const dir = requestLocation
      ? `${requestLocation.file.replace(/\.(rest|grpc|websocket)\.yml$/i, "")}.examples`
      : orphanBase;
    const document = encodeExampleDocument({
      ...example,
      id,
      requestId: requestId || undefined,
      requestRef: requestId ? { ...(example.requestRef || {}), id: requestId } : example.requestRef,
    });
    expected.set(
      path.join(dir, `${entitySegment(example.name || "example", id)}.example.yml`),
      stringifyYaml(document),
    );
  }
  await syncManagedFiles(
    path.join(root, "collections"),
    new Map([...expected].filter(([file]) => file.startsWith(path.join(root, "collections")))),
    (file) => file.endsWith(".example.yml"),
    { preserveComments: true },
  );
  await syncManagedFiles(
    path.join(root, "examples"),
    new Map([...expected].filter(([file]) => file.startsWith(path.join(root, "examples")))),
    (file) => file.endsWith(".example.yml"),
    { preserveComments: true },
  );
}

async function readExamples(root) {
  const collectionFiles = await matchingFiles(path.join(root, "collections"), (file) => file.endsWith(".example.yml"));
  const legacyFiles = await matchingFiles(path.join(root, "examples"), (file) => file.endsWith(".example.yml"));
  const output = [];
  for (const file of [...collectionFiles, ...legacyFiles].sort()) {
    const doc = await readYaml(file);
    if (isObject(doc?.example)) output.push(decodeExampleDocument(doc));
  }
  return output;
}

async function readDocumentation(root) {
  const sources = [];
  const workspaceMarkdownPath = path.join(root, "README.md");
  const workspaceMarkdown = await readTextIfExists(workspaceMarkdownPath);
  if (workspaceMarkdown.trim() && !isAutoDocumentationTemplate(workspaceMarkdown))
    sources.push(
      documentationSourceFromMarkdown({
        key: "workspace:workspace",
        kind: "workspace",
        entityId: "workspace",
        text: workspaceMarkdown,
        updatedAt: await fileModifiedAt(workspaceMarkdownPath),
      }),
    );

  const collectionsBase = path.join(root, "collections");
  for (const file of await matchingFiles(collectionsBase, (item) => path.basename(item) === "collection.yml")) {
    const doc = await readYaml(file);
    const collection = isObject(doc?.collection) ? doc.collection : {};
    const entityId = stringOr(collection.id, stableId("collection", file));
    const markdownPath = path.join(path.dirname(file), "README.md");
    const markdown = await readTextIfExists(markdownPath);
    if (markdown.trim() && !isAutoDocumentationTemplate(markdown))
      sources.push(
        documentationSourceFromMarkdown({
          key: `collection:${entityId}`,
          kind: "collection",
          entityId,
          text: markdown,
          updatedAt: await fileModifiedAt(markdownPath),
        }),
      );
  }
  for (const file of await matchingFiles(collectionsBase, (item) => path.basename(item) === "folder.yml")) {
    const doc = await readYaml(file);
    const folder = isObject(doc?.folder) ? doc.folder : {};
    const entityId = stringOr(folder.id, stableId("folder", file));
    const markdownPath = path.join(path.dirname(file), "README.md");
    const markdown = await readTextIfExists(markdownPath);
    if (markdown.trim() && !isAutoDocumentationTemplate(markdown))
      sources.push(
        documentationSourceFromMarkdown({
          key: `folder:${entityId}`,
          kind: "folder",
          entityId,
          text: markdown,
          updatedAt: await fileModifiedAt(markdownPath),
        }),
      );
  }
  for (const file of await matchingFiles(collectionsBase, (item) => /\.(rest|grpc|websocket)\.yml$/i.test(item))) {
    const doc = await readYaml(file);
    const info = isObject(doc?.info) ? doc.info : {};
    const entityId = stringOr(info.id, stableId("request", file));
    const markdownPath = file.replace(/\.yml$/i, ".md");
    const markdown = await readTextIfExists(markdownPath);
    if (markdown.trim() && !isAutoDocumentationTemplate(markdown))
      sources.push(
        documentationSourceFromMarkdown({
          key: `request:${entityId}`,
          kind: "request",
          entityId,
          text: markdown,
          updatedAt: await fileModifiedAt(markdownPath),
        }),
      );
  }

  const manifest = await readYamlIfExists(path.join(root, "docs", "build-manifest.yml"));
  const publications = arrayOr(manifest?.publications).filter(isObject);
  const settingsDoc = await readYamlIfExists(path.join(root, "docs", "settings.yml"));
  const settings = isObject(settingsDoc?.documentation) ? settingsDoc.documentation : {};
  return { sources, publications, settings };
}

async function writeDocumentationSources(root, documentation, collections) {
  const sources = new Map(
    arrayOr(documentation.sources)
      .filter(isObject)
      .map((source) => [String(source.key), source]),
  );
  await writeOrCreateMarkdown(
    path.join(root, "README.md"),
    sources.get("workspace:workspace"),
    workspaceReadmeTemplate(root, collections),
  );

  for (const collection of collections.filter(isObject)) {
    const collectionId = stringOr(collection.id, stableId("collection", collection.name));
    const collectionDir = path.join(root, "collections", entitySegment(collection.name || "collection", collectionId));
    await writeOrCreateMarkdown(
      path.join(collectionDir, "README.md"),
      sources.get(`collection:${collectionId}`),
      entityReadmeTemplate(collection.name || "Collection", collection.description, "collection"),
    );
    const folders = arrayOr(collection.folders).filter(isObject);
    const folderById = new Map(folders.map((folder) => [String(folder.id), folder]));
    const folderPathById = new Map();
    const resolveFolderPath = (folder) => {
      const id = String(folder.id);
      if (folderPathById.has(id)) return folderPathById.get(id);
      const parent = folder.parentId ? folderById.get(String(folder.parentId)) : null;
      const parentPath = parent ? resolveFolderPath(parent) : collectionDir;
      const folderPath = path.join(parentPath, entitySegment(folder.name || "folder", id));
      folderPathById.set(id, folderPath);
      return folderPath;
    };
    for (const folder of folders) {
      const folderPath = resolveFolderPath(folder);
      await writeOrCreateMarkdown(
        path.join(folderPath, "README.md"),
        sources.get(`folder:${folder.id}`),
        entityReadmeTemplate(folder.name || "Folder", folder.description, "folder"),
      );
    }
    for (const request of arrayOr(collection.requests).filter(isObject)) {
      const parentPath = request.parentId
        ? folderPathById.get(String(request.parentId)) || collectionDir
        : collectionDir;
      const kind = normalizeKind(request.kind);
      const requestId = stringOr(request.id, stableId("request", `${collectionId}/${request.name}`));
      const fileName = `${entitySegment(request.name || "request", requestId)}.${kind}.md`;
      await writeOrCreateMarkdown(
        path.join(parentPath, fileName),
        sources.get(`request:${requestId}`),
        requestReadmeTemplate(request),
      );
    }
  }

  await writeYamlAtomic(path.join(root, "docs", "settings.yml"), {
    version: 2,
    kind: "documentation-settings",
    documentation: {
      generatedOutput: "ignore",
      ...(isObject(documentation.settings) ? documentation.settings : {}),
    },
  });
  await writeYamlAtomic(path.join(root, "docs", "build-manifest.yml"), {
    version: 2,
    kind: "documentation-build",
    publications: arrayOr(documentation.publications),
  });
}

async function writeOrCreateMarkdown(file, source, template) {
  if (isObject(source) && typeof source.markdown === "string") {
    await writeTextAtomic(file, formatDocumentationMarkdown(source));
    return;
  }
  if (fs.existsSync(file)) return;
  await writeTextAtomic(file, `${String(template || "").trimEnd()}\n`);
}

function isAutoDocumentationTemplate(text) {
  return String(text || "").includes("<!-- layang:auto-template -->");
}

function documentationSourceFromMarkdown({ key, kind, entityId, text, updatedAt }) {
  const parsed = parseDocumentationMarkdown(text);
  return {
    key,
    kind,
    entityId,
    summary: stringOr(parsed.meta.summary, firstMarkdownParagraph(parsed.markdown)),
    markdown: parsed.markdown,
    manualPlacement: normalizeManualPlacement(parsed.meta.manualPlacement),
    sections: arrayOr(parsed.meta.sections).filter(isObject),
    tags: stringArray(parsed.meta.tags),
    audience: stringArray(parsed.meta.audience),
    related: stringArray(parsed.meta.related),
    deprecated: parsed.meta.deprecated === true,
    updatedAt,
  };
}

function parseDocumentationMarkdown(text) {
  const value = String(text || "").replace(/^\uFEFF/, "");
  const match = value.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { meta: {}, markdown: value };
  let meta = {};
  try {
    meta = parseYaml(match[1]) || {};
  } catch {
    meta = {};
  }
  return { meta: isObject(meta) ? meta : {}, markdown: value.slice(match[0].length) };
}

function formatDocumentationMarkdown(source) {
  const meta = {
    summary: stringOr(source.summary, ""),
    manualPlacement: normalizeManualPlacement(source.manualPlacement),
    sections: arrayOr(source.sections).filter(isObject),
    tags: stringArray(source.tags),
    audience: stringArray(source.audience),
    related: stringArray(source.related),
    deprecated: source.deprecated === true,
  };
  const hasMeta =
    meta.summary ||
    meta.manualPlacement !== "before" ||
    meta.sections.length ||
    meta.tags.length ||
    meta.audience.length ||
    meta.related.length ||
    meta.deprecated;
  const body = String(source.markdown || "")
    .replace(/^\s+/, "")
    .trimEnd();
  if (!hasMeta) return `${body}\n`;
  return `---\n${stringifyYaml(meta).trimEnd()}\n---\n\n${body}\n`;
}

function firstMarkdownParagraph(markdown) {
  return (
    String(markdown || "")
      .split(/\n\s*\n/)
      .map((part) => part.replace(/^#+\s+/gm, "").trim())
      .find((part) => part && !part.startsWith("<!--")) || ""
  );
}

async function fileModifiedAt(file) {
  try {
    return (await fsp.stat(file)).mtime.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

async function writePublishedDocs(root, docs) {
  const base = path.join(root, "docs", "published", "legacy-methods");
  const expected = new Map();
  for (const doc of docs.filter((item) => isObject(item) && item.published)) {
    const identity = `${doc.serviceName || "service"}.${doc.methodName || "method"}`;
    const file = path.join(base, `${entitySegment(identity, doc.methodKey || identity)}.md`);
    const meta = { ...doc };
    const markdown = String(meta.generatedMarkdown || "");
    delete meta.generatedMarkdown;
    expected.set(file, `---\n${stringifyYaml(meta).trimEnd()}\n---\n\n${markdown}`);
  }
  await syncManagedFiles(base, expected, (file) => file.endsWith(".md"));
}

async function readPublishedDocs(root) {
  const files = await matchingFiles(path.join(root, "docs", "published"), (file) => file.endsWith(".md"));
  const output = [];
  for (const file of files) {
    const text = await fsp.readFile(file, "utf8");
    const match = text.match(/^---\n([\s\S]*?)\n---\n?\n?([\s\S]*)$/);
    if (!match) continue;
    const meta = parseYaml(match[1]);
    if (!isObject(meta) || meta.pageId || (!meta.methodKey && !meta.serviceName && !meta.methodName)) continue;
    output.push({ ...meta, generatedMarkdown: match[2] });
  }
  return output;
}

async function writeMocks(root, project) {
  const grpc = isObject(project.mockServer) ? project.mockServer : {};
  const rest = isObject(project.restMockServer) ? project.restMockServer : {};
  const websocket = isObject(project.wsMockServer) ? project.wsMockServer : {};

  const grpcBase = path.join(root, "mocks", "grpc");
  const grpcExpected = new Map();
  const grpcServer = { ...grpc };
  const defaultGatewayProfileId = arrayOr(grpc.gatewayProfiles).find((profile) => profile?.id)?.id;
  if (!grpcServer.activeGatewayProfileId && defaultGatewayProfileId)
    grpcServer.activeGatewayProfileId = defaultGatewayProfileId;
  const methodFiles = isObject(grpcServer.methodFiles) ? grpcServer.methodFiles : {};
  delete grpcServer.methodFiles;
  delete grpcServer.scenarioText;
  delete grpcServer.gatewayProfiles;
  delete grpcServer.updatedAt;
  const securityResult = sanitizeSecurityPaths(grpcServer.security, "grpc-mock");
  grpcServer.security = securityResult.tracked;
  grpcExpected.set(
    path.join(grpcBase, "server.yml"),
    stringifyYaml({ version: 2, kind: "mock-server", server: grpcServer }),
  );

  if (!Object.keys(methodFiles).length) {
    let legacyScenarios = [];
    if (typeof grpc.scenarioText === "string" && grpc.scenarioText.trim()) {
      const parsed = parseScenarioBundle({ format: grpc.format, scenarioText: grpc.scenarioText });
      if (parsed.invalidSource) {
        throw new Error("Invalid legacy gRPC mock scenario source; refusing to migrate it as an empty mock workspace.");
      }
      legacyScenarios = parsed.scenarios;
    } else if (Array.isArray(grpc.scenarios)) {
      legacyScenarios = grpc.scenarios;
    }
    const grouped = groupGrpcScenarios(legacyScenarios);
    for (const [methodKey, scenarios] of grouped) {
      grpcExpected.set(
        path.join(grpcBase, "methods", `${entitySegment(methodKey, methodKey)}.mock.yml`),
        stringifyYaml({
          version: 2,
          kind: "grpc-mock",
          method: grpcMethodDescriptor(methodKey),
          scenarios,
        }),
      );
    }
  }
  for (const [methodKey, methodFile] of Object.entries(methodFiles)) {
    grpcExpected.set(
      path.join(grpcBase, "methods", `${entitySegment(methodKey, methodKey)}.mock.yml`),
      stringifyYaml(encodeGrpcMockDocument(methodKey, methodFile, parseScenarioBundle)),
    );
  }
  await syncManagedFiles(
    grpcBase,
    grpcExpected,
    (file) => /(?:server|scenarios)\.yml$/.test(file) || file.endsWith(".mock.yml"),
    { preserveComments: true },
  );

  await writeScenarioProject(path.join(root, "mocks", "rest"), rest, "rest");
  await writeScenarioProject(path.join(root, "mocks", "websocket"), websocket, "websocket");
}

async function writeScenarioProject(base, project, type) {
  const expected = new Map();
  const settings = { ...project };
  const scenarios = arrayOr(settings.scenarios);
  delete settings.scenarios;
  delete settings.updatedAt;
  expected.set(path.join(base, "server.yml"), stringifyYaml({ version: 2, kind: "mock-server", server: settings }));
  for (const scenario of scenarios.filter(isObject)) {
    const id = stringOr(scenario.id, stableId(`${type}-mock`, scenario.name));
    expected.set(
      path.join(base, "scenarios", `${entitySegment(scenario.name || "scenario", id)}.scenario.yml`),
      stringifyYaml(encodeScenarioDocument({ ...scenario, id }, type)),
    );
  }
  await syncManagedFiles(
    base,
    expected,
    (file) => path.basename(file) === "server.yml" || file.endsWith(".scenario.yml"),
    { preserveComments: true },
  );
}

async function readMocks(root, localPaths = {}) {
  const grpcBase = path.join(root, "mocks", "grpc");
  const grpcServerDoc = await readYamlIfExists(path.join(grpcBase, "server.yml"));
  const grpc = isObject(grpcServerDoc?.server) ? { ...grpcServerDoc.server } : {};
  grpc.security = restoreSecurityPaths(grpc.security, localPaths);
  const globalScenarioText = await readTextIfExists(path.join(grpcBase, "scenarios.yml"));
  const methodFiles = {};
  const grpcScenarios = [];
  for (const file of await matchingFiles(path.join(grpcBase, "methods"), (item) => item.endsWith(".mock.yml"))) {
    const doc = await readYaml(file);
    const decoded = decodeGrpcMockDocument(doc);
    if (!decoded.methodKey) continue;
    methodFiles[decoded.methodKey] = decoded.methodFile;
    grpcScenarios.push(...decoded.scenarios);
  }
  grpc.methodFiles = methodFiles;
  if (!Object.keys(methodFiles).length && globalScenarioText) {
    const parsed = parseScenarioBundle({ format: grpc.format, scenarioText: globalScenarioText });
    grpcScenarios.push(...parsed.scenarios);
  }
  grpc.scenarioText =
    grpc.format === "yaml"
      ? stringifyYaml({ version: 1, scenarios: grpcScenarios })
      : JSON.stringify({ version: 1, scenarios: grpcScenarios }, null, 2);
  const rest = await readScenarioProject(path.join(root, "mocks", "rest"), "rest");
  const websocket = await readScenarioProject(path.join(root, "mocks", "websocket"), "websocket");
  return { grpc, rest, websocket, grpcScenarios };
}

async function readScenarioProject(base, protocol) {
  const serverDoc = await readYamlIfExists(path.join(base, "server.yml"));
  const project = isObject(serverDoc?.server) ? serverDoc.server : {};
  const scenarios = [];
  for (const file of await matchingFiles(path.join(base, "scenarios"), (item) => item.endsWith(".scenario.yml"))) {
    const doc = await readYaml(file);
    if (isObject(doc?.scenario)) scenarios.push(decodeScenarioDocument(doc, protocol));
  }
  return { ...project, scenarios };
}

async function writeGatewayProfiles(root, profiles) {
  const base = path.join(root, "gateways");
  const expected = new Map();
  for (const profile of profiles.filter(isObject)) {
    const id = stringOr(profile.id, stableId("gateway", profile.name));
    const next = { ...profile, id };
    if (isObject(next.security)) next.security = sanitizeSecurityPaths(next.security, `gateway:${id}`).tracked;
    expected.set(
      path.join(base, `${entitySegment(profile.name || "gateway", id)}.gateway.yml`),
      stringifyYaml({
        version: 2,
        kind: "gateway",
        gateway: next,
      }),
    );
  }
  await syncManagedFiles(base, expected, (file) => file.endsWith(".gateway.yml"), { preserveComments: true });
}

async function readGatewayProfiles(root, localPaths = {}) {
  const profiles = [];
  for (const file of await matchingFiles(path.join(root, "gateways"), (item) => item.endsWith(".gateway.yml"))) {
    const doc = await readYaml(file);
    if (isObject(doc?.gateway)) {
      const profile = { ...doc.gateway };
      if (isObject(profile.security)) profile.security = restoreSecurityPaths(profile.security, localPaths);
      profiles.push(profile);
    }
  }
  return profiles;
}

async function writeLocalState(root, bundle) {
  const base = path.join(root, LOCAL_DIR);
  const project = isObject(bundle?.project) ? bundle.project : {};
  const sharedKeys = new Set([
    "collections",
    "protoLibraries",
    "protoFiles",
    "environments",
    "examples",
    "methodDocs",
    "docResults",
    "mockServer",
    "restMockServer",
    "wsMockServer",
    "requestTabs",
    "history",
    "documentation",
  ]);
  const localProject = Object.fromEntries(Object.entries(project).filter(([key]) => !sharedKeys.has(key)));
  const requestEnvironments = {};
  for (const collection of arrayOr(project.collections)) {
    for (const request of arrayOr(collection?.requests)) {
      if (request?.id && request?.environmentKey)
        requestEnvironments[String(request.id)] = String(request.environmentKey);
    }
  }
  const localPaths = collectLocalPathMappings(project);
  await writeYamlAtomic(path.join(base, "local.yml"), {
    version: 2,
    kind: "local-state",
    project: localProject,
    requestEnvironments,
    paths: localPaths,
  });
  await writeYamlAtomic(path.join(base, "layout.yml"), {
    version: 2,
    kind: "layout",
    layout: isObject(bundle?.layout) ? bundle.layout : {},
  });
  await writeYamlAtomic(path.join(base, "settings.yml"), {
    version: 2,
    kind: "settings",
    settings: isObject(bundle?.settings) ? bundle.settings : {},
  });
  await writeYamlAtomic(path.join(base, "history.yml"), {
    version: 2,
    kind: "history",
    history: arrayOr(project.history),
  });
  await writeYamlAtomic(path.join(base, "doc-results.yml"), {
    version: 2,
    kind: "doc-results",
    results: arrayOr(project.docResults),
  });

  const tabsBase = path.join(base, "tabs");
  const expected = new Map();
  for (const session of arrayOr(project.requestTabs).filter(isObject)) {
    const id = stringOr(session.id, stableId("tab", session.methodKey || session.title));
    expected.set(
      path.join(tabsBase, `${entitySegment(session.title || "request", id)}.tab.yml`),
      stringifyYaml({
        version: 2,
        kind: "request-tab",
        tab: { ...session, id },
      }),
    );
  }
  await syncManagedFiles(tabsBase, expected, (file) => file.endsWith(".tab.yml"));
}

async function readLocalState(root) {
  const base = path.join(root, LOCAL_DIR);
  const [localDoc, layoutDoc, settingsDoc, historyDoc, resultsDoc] = await Promise.all([
    readYamlIfExists(path.join(base, "local.yml")),
    readYamlIfExists(path.join(base, "layout.yml")),
    readYamlIfExists(path.join(base, "settings.yml")),
    readYamlIfExists(path.join(base, "history.yml")),
    readYamlIfExists(path.join(base, "doc-results.yml")),
  ]);
  const requestTabs = [];
  for (const file of await matchingFiles(path.join(base, "tabs"), (item) => item.endsWith(".tab.yml"))) {
    const doc = await readYaml(file);
    if (isObject(doc?.tab)) requestTabs.push(doc.tab);
  }
  return {
    project: isObject(localDoc?.project) ? localDoc.project : {},
    requestEnvironments: isObject(localDoc?.requestEnvironments) ? localDoc.requestEnvironments : {},
    paths: isObject(localDoc?.paths) ? localDoc.paths : {},
    layout: isObject(layoutDoc?.layout) ? layoutDoc.layout : {},
    settings: isObject(settingsDoc?.settings) ? settingsDoc.settings : {},
    history: arrayOr(historyDoc?.history),
    docResults: arrayOr(resultsDoc?.results),
    requestTabs,
  };
}

async function backupWorkspaceBeforeMigration(root, fromVersion) {
  const backupRoot = path.join(
    root,
    LOCAL_DIR,
    "backups",
    `workspace-v${fromVersion}-before-v${GIT_WORKSPACE_VERSION}`,
  );
  const marker = path.join(backupRoot, "backup.yml");
  if (fs.existsSync(marker)) return;
  await fsp.mkdir(backupRoot, { recursive: true });
  const names = [
    ROOT_FILE,
    "README.md",
    "collections",
    "protos",
    "environments",
    "examples",
    "mocks",
    "gateways",
    "docs",
  ];
  for (const name of names) {
    const source = path.join(root, name);
    if (!fs.existsSync(source)) continue;
    const target = path.join(backupRoot, name);
    await fsp.cp(source, target, { recursive: true, force: true });
  }
  await writeTextAtomic(
    marker,
    stringifyYaml({
      version: 1,
      backup: {
        fromWorkspaceVersion: fromVersion,
        targetWorkspaceVersion: GIT_WORKSPACE_VERSION,
        createdAt: new Date().toISOString(),
      },
    }),
  );
}

async function ensureWorkspaceSchemas(root) {
  const base = path.join(root, "workspace-schemas");
  const expected = new Map();
  const common = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required: ["version", "kind"],
    properties: {
      version: { const: 2 },
      kind: { type: "string" },
    },
    additionalProperties: true,
  };
  const schemas = {
    "request-v2.schema.json": {
      ...common,
      title: "Layang request v2",
      properties: {
        ...common.properties,
        kind: { const: "request" },
        info: {
          type: "object",
          required: ["id", "name", "protocol", "order"],
          properties: {
            id: { type: "string", minLength: 1 },
            name: { type: "string", minLength: 1 },
            protocol: { enum: ["rest", "grpc", "websocket"] },
            order: { type: "integer", minimum: 0 },
          },
          additionalProperties: true,
        },
        request: { type: "object", additionalProperties: true },
      },
      required: ["version", "kind", "info", "request"],
    },
    "environment-v2.schema.json": {
      ...common,
      title: "Layang environment v2",
      properties: {
        ...common.properties,
        kind: { const: "environment" },
        environment: {
          type: "object",
          required: ["key", "label"],
          properties: {
            key: { type: "string", minLength: 1 },
            label: { type: "string", minLength: 1 },
            targets: { type: "object", additionalProperties: { type: "string" } },
            variables: { type: "object", additionalProperties: true },
            extensions: { type: "object", additionalProperties: true },
          },
          additionalProperties: true,
        },
      },
      required: ["version", "kind", "environment"],
    },
    "proto-revision-v2.schema.json": {
      ...common,
      title: "Layang immutable proto revision v2",
      properties: {
        ...common.properties,
        kind: { const: "proto-revision" },
        revision: {
          type: "object",
          required: ["id", "label", "checksum", "storage", "immutable"],
          properties: {
            id: { type: "string", minLength: 1 },
            label: { type: "string", minLength: 1 },
            checksum: { type: "string", pattern: "^fnv1a64:" },
            storage: { const: "snapshot" },
            immutable: { const: true },
            source: { type: "object", additionalProperties: true },
            extensions: { type: "object", additionalProperties: true },
          },
          additionalProperties: true,
        },
      },
      required: ["version", "kind", "revision"],
    },
    "example-v2.schema.json": {
      ...common,
      title: "Layang example v2",
      properties: {
        ...common.properties,
        kind: { const: "example" },
        example: {
          type: "object",
          required: ["id", "name"],
          properties: {
            id: { type: "string", minLength: 1 },
            name: { type: "string", minLength: 1 },
            requestRef: {
              type: "object",
              properties: { id: { type: "string", minLength: 1 }, method: { type: "string" } },
              additionalProperties: true,
            },
            input: { type: "object", additionalProperties: true },
            expected: { type: "object", additionalProperties: true },
            assertions: {},
            extensions: { type: "object", additionalProperties: true },
          },
          additionalProperties: true,
        },
      },
      required: ["version", "kind", "example"],
    },
    "mock-scenario-v2.schema.json": {
      ...common,
      title: "Layang mock scenario v2",
      properties: {
        ...common.properties,
        kind: { enum: ["mock-scenario", "grpc-mock"] },
        scenario: { type: "object", additionalProperties: true },
        scenarios: { type: "array", items: { type: "object", additionalProperties: true } },
      },
    },
  };
  for (const [name, schema] of Object.entries(schemas)) {
    expected.set(path.join(base, name), `${JSON.stringify(schema, null, 2)}\n`);
  }
  expected.set(
    path.join(base, "README.md"),
    `# Layang Workspace Schemas\n\nJSON Schema files for Workspace Format v6. They are intended for VS Code, CI validation, and third-party tooling. Reusable CI examples are available under \`ci/\`.\n`,
  );
  expected.set(
    path.join(base, "ci", "validate-workspace.sh"),
    `#!/usr/bin/env sh\nset -eu\nWORKSPACE=\${1:-.}\nlayang workspace:migrate "$WORKSPACE" --check\nlayang workspace:format "$WORKSPACE" --check\nlayang validate "$WORKSPACE"\n`,
  );
  expected.set(
    path.join(base, "ci", "github-actions.template.yml"),
    `name: Validate Layang workspace\n\non:\n  pull_request:\n  push:\n\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Validate workspace\n        run: sh workspace-schemas/ci/validate-workspace.sh .\n`,
  );
  expected.set(
    path.join(base, "ci", "gitea-actions.template.yml"),
    `name: Validate Layang workspace\n\non:\n  pull_request:\n  push:\n\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Validate workspace\n        run: sh workspace-schemas/ci/validate-workspace.sh .\n`,
  );
  await syncManagedFiles(
    base,
    expected,
    (file) =>
      file.endsWith(".schema.json") || path.basename(file) === "README.md" || file.includes(`${path.sep}ci${path.sep}`),
  );
}

async function ensureGitIgnore(root) {
  const file = path.join(root, ".gitignore");
  const markerStart = "# BEGIN Layang managed ignores";
  const markerEnd = "# END Layang managed ignores";
  const legacyStart = "# BEGIN Layang local state";
  const legacyEnd = "# END Layang local state";
  const block = [
    markerStart,
    "# Local runtime, UI state, logs, history, and generated CLI results",
    ".layang/",
    "",
    "# Local environments and secret material",
    ".env",
    ".env.*",
    "!.env.example",
    "environments/*.local.yml",
    "*.secret.yml",
    "*.local.yml",
    "certificates/*.key",
    "certificates/*.pfx",
    "certificates/*.p12",
    "",
    "# Generated documentation is reproducible from source",
    "docs/site/",
    "docs/published/",
    "docs/wiki-export/",
    "",
    "# OS and editor state",
    ".DS_Store",
    "Thumbs.db",
    ".idea/",
    ".vscode/*",
    "!.vscode/extensions.json",
    markerEnd,
  ].join("\n");
  let current = await readTextIfExists(file);
  if (current.includes(legacyStart)) {
    const legacyPattern = new RegExp(`${escapeRegex(legacyStart)}[\\s\\S]*?${escapeRegex(legacyEnd)}`);
    current = current.replace(legacyPattern, block);
  } else if (current.includes(markerStart)) {
    const pattern = new RegExp(`${escapeRegex(markerStart)}[\\s\\S]*?${escapeRegex(markerEnd)}`);
    current = current.replace(pattern, block);
  } else {
    current = `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${block}\n`;
  }
  await writeTextAtomic(file, normalizeTextFile(current));
}

async function ensureGitAttributes(root) {
  const file = path.join(root, ".gitattributes");
  const markerStart = "# BEGIN Layang deterministic text";
  const markerEnd = "# END Layang deterministic text";
  const block = [
    markerStart,
    "* text=auto eol=lf",
    "*.yml text eol=lf",
    "*.yaml text eol=lf",
    "*.md text eol=lf",
    "*.proto text eol=lf",
    "*.json text eol=lf",
    "*.cjs text eol=lf",
    "*.mjs text eol=lf",
    "*.ts text eol=lf",
    "*.tsx text eol=lf",
    "*.pfx binary",
    "*.p12 binary",
    "*.png binary",
    "*.jpg binary",
    "*.jpeg binary",
    markerEnd,
  ].join("\n");
  let current = await readTextIfExists(file);
  if (current.includes(markerStart)) {
    const pattern = new RegExp(`${escapeRegex(markerStart)}[\\s\\S]*?${escapeRegex(markerEnd)}`);
    current = current.replace(pattern, block);
  } else {
    current = `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${block}\n`;
  }
  await writeTextAtomic(file, normalizeTextFile(current));
}

function hydrateGrpcBindings(collections, protoLibraries) {
  const libraries = new Map(arrayOr(protoLibraries).map((library) => [String(library.id), library]));
  for (const collection of arrayOr(collections)) {
    for (const request of arrayOr(collection?.requests)) {
      if (!request?.grpc) continue;
      const binding = request.grpc;
      const library = libraries.get(String(binding.libraryId));
      const version = arrayOr(library?.versions).find((item) => String(item.id) === String(binding.versionId));
      const method = discoverProtoMethod(arrayOr(version?.files), binding.methodFullName || request.grpcMethodKey);
      binding.schemaChecksum = stringOr(version?.checksum, binding.schemaChecksum || "");
      if (method) {
        binding.requestType = method.requestType;
        binding.responseType = method.responseType;
        binding.methodSignatureHash = computeMethodSignatureHash(method);
        binding.status = version?.integrity?.status === "externally-modified" ? "body-review-required" : "valid";
      } else if (library && version) {
        binding.status = "method-missing";
      } else if (library) {
        binding.status = "version-missing";
      } else {
        binding.status = "library-missing";
      }
      request.grpcMethodKey = binding.methodFullName || request.grpcMethodKey;
    }
  }
}

function hydrateExampleReferences(examples, collections) {
  const requests = new Map();
  for (const collection of arrayOr(collections)) {
    for (const request of arrayOr(collection?.requests)) requests.set(String(request.id), { request, collection });
  }
  for (const example of arrayOr(examples)) {
    const refId = example?.requestId || example?.requestRef?.id;
    const resolved = refId ? requests.get(String(refId)) : null;
    if (!resolved) continue;
    example.requestId = String(refId);
    example.requestRef = { ...(isObject(example.requestRef) ? example.requestRef : {}), id: String(refId) };
    if (resolved.request.kind === "grpc") {
      const [serviceName, methodName] = splitGrpcMethod(
        resolved.request.grpc?.methodFullName || resolved.request.grpcMethodKey,
      );
      example.serviceName = serviceName;
      example.methodName = methodName;
    } else {
      example.serviceName = resolved.collection.name;
      example.methodName = resolved.request.name;
    }
  }
}

function discoverProtoMethod(files, methodKey) {
  const target = String(methodKey || "");
  for (const file of arrayOr(files)) {
    const text = String(file?.text || "");
    const packageName = text.match(/\bpackage\s+([\w.]+)\s*;/)?.[1] || "";
    for (const serviceMatch of text.matchAll(/service\s+([A-Za-z_][\w]*)\s*\{([\s\S]*?)\}/g)) {
      const serviceName = packageName ? `${packageName}.${serviceMatch[1]}` : serviceMatch[1];
      for (const methodMatch of serviceMatch[2].matchAll(
        /rpc\s+([A-Za-z_][\w]*)\s*\((stream\s+)?([^)]*)\)\s*returns\s*\((stream\s+)?([^)]*)\)/g,
      )) {
        const candidate = {
          serviceName,
          methodName: methodMatch[1],
          requestType: methodMatch[3].trim(),
          responseType: methodMatch[5].trim(),
          requestStream: Boolean(methodMatch[2]),
          responseStream: Boolean(methodMatch[4]),
        };
        if (`${serviceName}/${candidate.methodName}` === target) return candidate;
      }
    }
  }
  return null;
}

function computeMethodSignatureHash(method) {
  return `fnv1a64:${fnv1a64(
    [
      method.serviceName,
      method.methodName,
      method.requestType,
      method.responseType,
      method.requestStream ? "client-stream" : "single-request",
      method.responseStream ? "server-stream" : "single-response",
    ].join("|"),
  )}`;
}

function computeProtoChecksum(files) {
  const canonical = [...files.entries()]
    .map(([name, text]) => ({ name: safeRelative(name), text: String(text).replace(/\r\n?/g, "\n") }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((file) => `${file.name}\n${file.text}`)
    .join("\n\u0000\n");
  return `fnv1a64:${fnv1a64(canonical)}`;
}

function fnv1a64(input) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const character of String(input || "")) {
    hash ^= BigInt(character.codePointAt(0) || 0);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

async function assertImmutableProtoRevisions(_base, expected) {
  for (const [revisionFile] of expected) {
    if (path.basename(revisionFile) !== "revision.yml" || !fs.existsSync(revisionFile)) continue;
    const existingDoc = await readYamlIfExists(revisionFile);
    if (Number(existingDoc?.version || 1) < 2 || existingDoc?.revision?.immutable !== true) continue;
    const revisionDir = path.dirname(revisionFile);
    const existingFiles = await readProtoMap(path.join(revisionDir, "files"));
    const storedChecksum = stringOr(existingDoc?.revision?.checksum, "");
    const actualChecksum = computeProtoChecksum(existingFiles);
    if (storedChecksum && storedChecksum !== actualChecksum) {
      throw new Error(
        `Immutable proto revision ${existingDoc.revision.id || revisionDir} was modified outside Layang. Create a new revision before saving.`,
      );
    }
    const expectedFiles = new Map();
    for (const [file, content] of expected) {
      if (!file.startsWith(`${path.join(revisionDir, "files")}${path.sep}`) || !file.endsWith(".proto")) continue;
      expectedFiles.set(
        path.relative(path.join(revisionDir, "files"), file).split(path.sep).join("/"),
        String(content),
      );
    }
    if (expectedFiles.size && computeProtoChecksum(expectedFiles) !== actualChecksum) {
      throw new Error(
        `Proto revision ${existingDoc.revision.id || revisionDir} is immutable. Import the changed files as a new revision.`,
      );
    }
  }
}

function buildRequestLocations(root, collections) {
  const output = new Map();
  for (const collection of arrayOr(collections)) {
    if (!isObject(collection)) continue;
    const collectionId = stringOr(collection.id, stableId("collection", collection.name));
    const collectionDir = path.join(root, "collections", entitySegment(collection.name || "collection", collectionId));
    const folders = arrayOr(collection.folders).filter(isObject);
    const folderById = new Map(folders.map((folder) => [String(folder.id), folder]));
    const folderPathById = new Map();
    const resolveFolderPath = (folder) => {
      const id = String(folder.id);
      if (folderPathById.has(id)) return folderPathById.get(id);
      const parent = folder.parentId ? folderById.get(String(folder.parentId)) : null;
      const parentPath = parent ? resolveFolderPath(parent) : collectionDir;
      const folderPath = path.join(parentPath, entitySegment(folder.name || "folder", id));
      folderPathById.set(id, folderPath);
      return folderPath;
    };
    for (const folder of folders) resolveFolderPath(folder);
    for (const request of arrayOr(collection.requests).filter(isObject)) {
      const requestId = stringOr(request.id, stableId("request", `${collectionId}/${request.name}`));
      const kind = normalizeKind(request.kind);
      const parentPath = request.parentId
        ? folderPathById.get(String(request.parentId)) || collectionDir
        : collectionDir;
      output.set(requestId, {
        file: path.join(parentPath, `${entitySegment(request.name || "request", requestId)}.${kind}.yml`),
        request,
        collection,
      });
    }
  }
  return output;
}

function inferExampleRequestId(example, collections) {
  const target = `${example?.serviceName || ""}/${example?.methodName || ""}`;
  for (const collection of arrayOr(collections)) {
    for (const request of arrayOr(collection?.requests)) {
      if (request?.kind === "grpc" && (request.grpc?.methodFullName || request.grpcMethodKey) === target)
        return String(request.id);
      if (
        String(collection?.name) === String(example?.serviceName) &&
        String(request?.name) === String(example?.methodName)
      )
        return String(request.id);
    }
  }
  return "";
}

function collectLocalPathMappings(project) {
  const paths = {};
  for (const library of arrayOr(project?.protoLibraries)) {
    for (const version of arrayOr(library?.versions)) {
      if (
        version?.source?.type === "directory" &&
        version.source.path &&
        path.isAbsolute(String(version.source.path))
      ) {
        paths[`proto-source:${version.id}`] = String(version.source.path);
      }
    }
  }
  const collectSecurity = (security, prefix) => Object.assign(paths, sanitizeSecurityPaths(security, prefix).paths);
  collectSecurity(project?.mockServer?.security, "grpc-mock");
  for (const profile of arrayOr(project?.mockServer?.gatewayProfiles))
    collectSecurity(profile?.security, `gateway:${profile.id}`);
  return paths;
}

function groupGrpcScenarios(scenarios) {
  const map = new Map();
  for (const scenario of arrayOr(scenarios)) {
    const key = scenario?.service && scenario?.method ? `${scenario.service}/${scenario.method}` : "unknown/unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(scenario);
  }
  return map;
}

function grpcMethodDescriptor(methodKey) {
  const [service, name] = splitGrpcMethod(methodKey);
  return { service, name };
}

function splitGrpcMethod(value) {
  const text = String(value || "");
  const index = text.lastIndexOf("/");
  return index >= 0 ? [text.slice(0, index), text.slice(index + 1)] : [text, ""];
}

function workspaceReadmeTemplate(root, collections) {
  const title = path.basename(root) || "Layang Workspace";
  const lines = [
    "<!-- layang:auto-template -->",
    `# ${title}`,
    "",
    "Portable API workspace readable and runnable with or without the Layang desktop application.",
    "",
    "## Collections",
    "",
  ];
  if (!arrayOr(collections).length) lines.push("No collections yet.");
  for (const collection of arrayOr(collections)) {
    const id = stringOr(collection.id, stableId("collection", collection.name));
    lines.push(
      `- [${collection.name || "Collection"}](collections/${entitySegment(collection.name || "collection", id)}/README.md)`,
    );
  }
  lines.push(
    "",
    "## Repository structure",
    "",
    "- `collections/` — executable REST, WebSocket, and gRPC requests",
    "- `protos/` — immutable full-snapshot protobuf revisions",
    "- `environments/` — shared non-secret targets and variables",
    "- `mocks/` — native YAML mock scenarios",
    "- `.layang/` — ignored local UI, runtime, path, and last-used environment state",
    "",
    "## CLI",
    "",
    "```bash",
    "layang validate .",
    "layang list .",
    "layang workspace:migrate . --check",
    "```",
  );
  return lines.join("\n");
}

function entityReadmeTemplate(name, description, kind) {
  return `<!-- layang:auto-template -->\n# ${name}\n\n${description || `Layang ${kind}.`}\n\nEdit this Markdown file freely. Layang keeps it as the human-readable documentation source.`;
}

function requestReadmeTemplate(request) {
  const kind = normalizeKind(request?.kind).toUpperCase();
  const target =
    request?.kind === "grpc"
      ? request?.grpc?.methodFullName || request?.grpcMethodKey || "Unbound method"
      : `${request?.method || ""} ${request?.url || ""}`.trim();
  return `<!-- layang:auto-template -->\n# ${request?.name || "Request"}\n\n**Protocol:** ${kind}\n\n**Target:** \`${target}\`\n\n## Summary\n\nDescribe what this request does.\n\n## Notes\n\nAdd operational guidance, assumptions, and expected behavior.`;
}

function collectUnknownFields(value, known) {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => !known.has(key) && item !== undefined));
}

function nonEmptyObject(value) {
  return isObject(value) && Object.keys(value).length ? value : undefined;
}

function normalizeOrder(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function normalizeTextFile(value) {
  return `${String(value || "")
    .replace(/\r\n?/g, "\n")
    .trimEnd()}\n`;
}

function deriveActiveProtoFiles(libraries, libraryId, versionId) {
  const library = libraries.find((item) => String(item.id) === String(libraryId)) || libraries[0];
  if (!library) return [];
  const version =
    arrayOr(library.versions).find((item) => String(item.id) === String(versionId)) ||
    arrayOr(library.versions).find((item) => String(item.id) === String(library.defaultVersionId)) ||
    arrayOr(library.versions)[0];
  return arrayOr(version?.files);
}

function normalizeSiblingOrder(folders, requests) {
  const groups = new Map();
  for (const item of [...folders, ...requests]) {
    const key = item.parentId || "__root__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const items of groups.values()) {
    items.sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name).localeCompare(String(b.name)));
    items.forEach((item, index) => {
      item.order = index;
    });
  }
}

function topologicalVersions(versions, byId) {
  const output = [];
  const visited = new Set();
  const visiting = new Set();
  function visit(version) {
    const id = String(version.id);
    if (visited.has(id)) return;
    if (visiting.has(id)) return;
    visiting.add(id);
    if (version.previousVersionId && byId.has(String(version.previousVersionId)))
      visit(byId.get(String(version.previousVersionId)));
    visiting.delete(id);
    visited.add(id);
    output.push(version);
  }
  versions.forEach(visit);
  return output;
}

function fileMap(files) {
  return new Map(
    arrayOr(files)
      .filter((item) => item?.name)
      .map((item) => [safeRelative(String(item.name)), String(item.text || "")]),
  );
}

function _diffFileMaps(base, current) {
  const output = new Map();
  for (const [name, text] of current) if (!base.has(name) || base.get(name) !== text) output.set(name, text);
  return output;
}

async function readProtoMap(directory) {
  const output = new Map();
  if (!fs.existsSync(directory)) return output;
  await walk(directory, async (file) => {
    if (!file.endsWith(".proto")) return;
    output.set(path.relative(directory, file).split(path.sep).join("/"), await fsp.readFile(file, "utf8"));
  });
  return output;
}

async function syncManagedFiles(base, expected, managedPredicate, options = {}) {
  await fsp.mkdir(base, { recursive: true });
  for (const [file, content] of expected) {
    const existing = options.preserveComments ? await readTextIfExists(file) : "";
    const next = options.preserveComments && /\.ya?ml$/i.test(file) ? preserveYamlComments(existing, content) : content;
    await writeTextAtomic(file, next);
  }
  const existing = [];
  await walk(base, async (file) => existing.push(file)).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  for (const file of existing) {
    if (managedPredicate(file) && !expected.has(file)) await fsp.rm(file, { force: true });
  }
  await removeEmptyDirectories(base);
}

async function removeEmptyDirectories(directory, preserveRoot = true) {
  if (!fs.existsSync(directory)) return;
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  for (const entry of entries)
    if (entry.isDirectory()) await removeEmptyDirectories(path.join(directory, entry.name), false);
  if (!preserveRoot && (await fsp.readdir(directory)).length === 0) await fsp.rmdir(directory).catch(() => undefined);
}

function isManagedCollectionFile(file) {
  const name = path.basename(file);
  return name === "collection.yml" || name === "folder.yml" || /\.(rest|grpc|websocket)\.yml$/i.test(name);
}

function isManagedProtoFile(file) {
  const name = path.basename(file);
  return (
    name === ".layang-managed" ||
    name === "library.yml" ||
    name === "revision.yml" ||
    file.endsWith(".proto") ||
    /[\\/]changes[\\/]/.test(file)
  );
}

async function matchingFiles(base, predicate) {
  const output = [];
  if (!fs.existsSync(base)) return output;
  await walk(base, async (file) => {
    if (predicate(file)) output.push(file);
  });
  return output.sort();
}

async function walk(directory, visitor) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, visitor);
    else await visitor(full);
  }
}

async function readYaml(file) {
  return parseYaml(await fsp.readFile(file, "utf8"));
}
async function readYamlIfExists(file) {
  try {
    return await readYaml(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
async function readTextIfExists(file) {
  try {
    return await fsp.readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}
async function writeYamlAtomic(file, value) {
  const generated = stringifyYaml(value);
  const existing = await readTextIfExists(file);
  return writeTextAtomic(file, preserveYamlComments(existing, generated));
}
async function writeTextAtomic(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  await fsp.writeFile(temporary, String(text), "utf8");
  try {
    await fsp.rename(temporary, file);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
    await fsp.rm(file, { force: true });
    await fsp.rename(temporary, file);
  }
}

function safeRelative(value) {
  const normalized = String(value || "file.proto")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const parts = normalized.split("/").filter((part) => part && part !== "." && part !== "..");
  return parts.length ? parts.join("/") : "file.proto";
}
function entitySegment(name, id) {
  return `${slug(name)}--${shortId(id)}`;
}
function slug(value) {
  const output = String(value || "item")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return output || "item";
}
function shortId(value) {
  return crypto
    .createHash("sha1")
    .update(String(value || "id"))
    .digest("hex")
    .slice(0, 8);
}
function stableId(prefix, value) {
  return `${prefix}-${crypto
    .createHash("sha1")
    .update(String(value || prefix))
    .digest("hex")
    .slice(0, 12)}`;
}
function _seqFromOrder(value) {
  const order = Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
  return (order + 1) * SEQ_GAP;
}
function orderFromSeq(value) {
  const seq = Number(value);
  return Number.isFinite(seq) ? Math.max(0, Math.round(seq / SEQ_GAP) - 1) : 0;
}
function normalizeManualPlacement(value) {
  return value === "after" || value === "inline" || value === "only" ? value : "before";
}

function normalizeKind(value) {
  return value === "grpc" ? "grpc" : value === "websocket" ? "websocket" : "rest";
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
function optionalString(value) {
  return typeof value === "string" && value.length ? value : undefined;
}
function deepMerge(base, overlay) {
  if (!isObject(base) || !isObject(overlay)) return overlay;
  const output = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    output[key] = isObject(value) && isObject(output[key]) ? deepMerge(output[key], value) : value;
  }
  return output;
}
function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
function depth(value) {
  return String(value).split(path.sep).length;
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertSupportedWorkspaceVersion(manifest, root) {
  const version = Number(manifest?.version || 1);
  if (!Number.isFinite(version) || version < 1) {
    throw new Error(`Invalid Layang workspace version in ${path.join(root, ROOT_FILE)}.`);
  }
  if (version > GIT_WORKSPACE_VERSION) {
    const error = new Error(
      `Workspace v${version} requires a newer version of Layang. This build supports up to v${GIT_WORKSPACE_VERSION}.`,
    );
    error.code = "UNSUPPORTED_WORKSPACE_VERSION";
    error.workspaceVersion = version;
    error.supportedWorkspaceVersion = GIT_WORKSPACE_VERSION;
    throw error;
  }
}

module.exports = {
  GIT_WORKSPACE_VERSION,
  WORKSPACE_VERSION: GIT_WORKSPACE_VERSION,
  ROOT_FILE,
  LOCAL_DIR,
  readGitWorkspace,
  writeGitWorkspace,
  migrateGitWorkspace,
  readCollections,
  writeCollections,
  readProtoLibraries,
  writeProtoLibraries,
  ensureGitIgnore,
  ensureGitAttributes,
  readDocumentation,
  writeDocumentationSources,
  readGatewayProfiles,
  writeGatewayProfiles,
};
