import type { ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import type { GrpcRequestBinding, ProtoLibrary, ProtoLibraryVersion } from "./proto-library-types";

const legacyLibraryName = "Workspace Proto";

function stableHash(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const character of input) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

export function normalizeProtoPath(name: string): string {
  return name.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function computeProtoVersionChecksum(files: ProtoSourceFile[]): string {
  const canonical = [...files]
    .map((file) => ({ name: normalizeProtoPath(file.name), text: file.text.replaceAll("\r\n", "\n") }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((file) => `${file.name}\n${file.text}`)
    .join("\n\u0000\n");
  return `fnv1a64:${stableHash(canonical)}`;
}

export function computeProtoContentChecksum(files: ProtoSourceFile[]): string {
  const canonical = [...files]
    .map((file) => file.text.replaceAll("\r\n", "\n").trim())
    .sort()
    .join("\n\u0000\n");
  return `fnv1a64:${stableHash(canonical)}`;
}

export function computeMethodSignatureHash(method: RpcMethodInfo): string {
  return `fnv1a64:${stableHash(
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

export function createProtoLibraryVersion(input: {
  libraryId: string;
  files: ProtoSourceFile[];
  version: string;
  previousVersionId?: string;
  source?: ProtoLibraryVersion["source"];
  lifecycle?: ProtoLibraryVersion["lifecycle"];
  archivedAt?: string;
  createdAt?: string;
}): ProtoLibraryVersion {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const checksum = computeProtoVersionChecksum(input.files);
  return {
    id: `proto-ver-${stableHash(`${input.libraryId}|${input.version}|${checksum}`)}`,
    libraryId: input.libraryId,
    version: input.version,
    lifecycle: input.lifecycle ?? "active",
    archivedAt: input.lifecycle === "archived" ? (input.archivedAt ?? createdAt) : undefined,
    checksum,
    files: input.files.map((file) => ({ ...file, name: normalizeProtoPath(file.name) })),
    previousVersionId: input.previousVersionId,
    source: input.source ?? { type: "local-files" },
    importedAt: createdAt,
    createdAt,
  };
}

export function createProtoLibrary(input: {
  name: string;
  files: ProtoSourceFile[];
  versionLabel?: string;
  description?: string;
  createdAt?: string;
}): ProtoLibrary {
  if (input.files.length === 0) throw new Error("A proto library requires at least one .proto file.");
  const timestamp = input.createdAt ?? new Date().toISOString();
  const name = input.name.trim() || "Untitled Proto Library";
  const checksum = computeProtoVersionChecksum(input.files);
  const libraryId = `proto-lib-${stableHash(`${name}|${checksum}`)}`;
  const version = createProtoLibraryVersion({
    libraryId,
    files: input.files,
    version: input.versionLabel?.trim() || "v1",
    createdAt: timestamp,
  });
  return {
    id: libraryId,
    name,
    description: input.description?.trim() || undefined,
    lifecycle: "active",
    defaultVersionId: version.id,
    versions: [version],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createLegacyProtoLibrary(files: ProtoSourceFile[], createdAt?: string): ProtoLibrary | null {
  if (files.length === 0) return null;
  const timestamp = createdAt ?? new Date().toISOString();
  const checksum = computeProtoVersionChecksum(files);
  const libraryId = `proto-lib-${stableHash(`${legacyLibraryName}|${checksum}`)}`;
  const version = createProtoLibraryVersion({
    libraryId,
    files,
    version: "legacy-v1",
    createdAt: timestamp,
  });
  return {
    id: libraryId,
    name: legacyLibraryName,
    description: "Migrated automatically from the legacy workspace protoFiles field.",
    lifecycle: "active",
    defaultVersionId: version.id,
    versions: [version],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function getActiveProtoVersions(library: ProtoLibrary | null | undefined): ProtoLibraryVersion[] {
  if (!library || library.lifecycle === "archived") return [];
  return (Array.isArray(library.versions) ? library.versions : []).filter(
    (version) => version.lifecycle !== "archived",
  );
}

export function getDefaultProtoVersion(libraries: ProtoLibrary[]): ProtoLibraryVersion | null {
  for (const library of libraries) {
    const activeVersions = getActiveProtoVersions(library);
    const version = activeVersions.find((item) => item.id === library.defaultVersionId) ?? activeVersions[0];
    if (version) return version;
  }
  return null;
}

export function projectProtoFilesFromLibraries(libraries: ProtoLibrary[]): ProtoSourceFile[] {
  return getDefaultProtoVersion(libraries)?.files.map((file) => ({ ...file })) ?? [];
}

export function createPinnedGrpcBinding(
  library: ProtoLibrary,
  version: ProtoLibraryVersion,
  method: RpcMethodInfo,
): GrpcRequestBinding {
  return {
    libraryId: library.id,
    versionId: version.id,
    methodFullName: `${method.serviceName}/${method.methodName}`,
    requestType: method.requestType,
    responseType: method.responseType,
    methodSignatureHash: computeMethodSignatureHash(method),
    schemaChecksum: version.checksum,
    versionPolicy: "pinned",
    status: "valid",
  };
}

export function createLegacyGrpcBinding(
  grpcMethodKey: string,
  libraries: ProtoLibrary[],
  method?: RpcMethodInfo,
): GrpcRequestBinding | undefined {
  const library = libraries[0];
  const version = library?.versions.find((item) => item.id === library.defaultVersionId) ?? library?.versions[0];
  if (!library || !version || !grpcMethodKey) return undefined;
  const slash = grpcMethodKey.lastIndexOf("/");
  const serviceName = slash >= 0 ? grpcMethodKey.slice(0, slash) : grpcMethodKey;
  const methodName = slash >= 0 ? grpcMethodKey.slice(slash + 1) : "";
  const fallback: RpcMethodInfo = {
    serviceName,
    methodName,
    requestType: "",
    responseType: "",
    requestStream: false,
    responseStream: false,
  };
  const target = method ?? fallback;
  return {
    ...createPinnedGrpcBinding(library, version, target),
    methodFullName: grpcMethodKey,
    status: method ? "valid" : "ambiguous-migration",
  };
}

function normalizeRawProtoLibraries(input: unknown, legacyProtoFiles: ProtoSourceFile[] = []): ProtoLibrary[] {
  if (!Array.isArray(input) || input.length === 0) {
    const legacy = createLegacyProtoLibrary(legacyProtoFiles);
    return legacy ? [legacy] : [];
  }

  return input
    .filter((item): item is Partial<ProtoLibrary> => Boolean(item && typeof item === "object"))
    .map((item) => {
      const now = new Date().toISOString();
      const id = typeof item.id === "string" && item.id ? item.id : `proto-lib-${stableHash(now)}`;
      const rawVersions = Array.isArray(item.versions) ? item.versions : [];
      const versions = rawVersions
        .filter((version) => Boolean(version && typeof version === "object"))
        .map((version, index) => {
          const candidate = version as Partial<ProtoLibraryVersion>;
          const files = Array.isArray(candidate.files)
            ? candidate.files.filter((file): file is ProtoSourceFile =>
                Boolean(file && typeof file.name === "string" && typeof file.text === "string"),
              )
            : [];
          const normalized = createProtoLibraryVersion({
            libraryId: id,
            files,
            version: typeof candidate.version === "string" && candidate.version ? candidate.version : `v${index + 1}`,
            previousVersionId:
              typeof candidate.previousVersionId === "string" ? candidate.previousVersionId : undefined,
            source: candidate.source,
            lifecycle: "active",
            archivedAt: undefined,
            createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : now,
          });
          return {
            ...normalized,
            id: typeof candidate.id === "string" && candidate.id ? candidate.id : normalized.id,
            checksum:
              typeof candidate.checksum === "string" && candidate.checksum ? candidate.checksum : normalized.checksum,
            importedAt: typeof candidate.importedAt === "string" ? candidate.importedAt : normalized.importedAt,
          };
        });
      const defaultVersionId =
        typeof item.defaultVersionId === "string" && versions.some((version) => version.id === item.defaultVersionId)
          ? item.defaultVersionId
          : (versions[0]?.id ?? "");
      return {
        id,
        name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Untitled Proto Library",
        description: typeof item.description === "string" ? item.description : undefined,
        lifecycle: "active" as const,
        archivedAt: undefined,
        defaultVersionId,
        versions,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now,
      };
    })
    .filter((library) => library.versions.length > 0);
}

export type ProtoLibraryNormalizationResult = {
  libraries: ProtoLibrary[];
  libraryIdMap: Map<string, string>;
  versionIdMap: Map<string, string>;
};

function protoVersionMapKey(libraryId: string, versionId: string): string {
  return `${libraryId}:${versionId}`;
}

/**
 * Converts legacy collection-scoped proto libraries into reusable workspace-global libraries.
 * Libraries with the same name and a shared revision checksum are merged into one lineage.
 */
export function normalizeProtoLibrariesWithRemap(
  input: unknown,
  legacyProtoFiles: ProtoSourceFile[] = [],
): ProtoLibraryNormalizationResult {
  const rawLibraries = normalizeRawProtoLibraries(input, legacyProtoFiles);
  const libraries: ProtoLibrary[] = [];
  const libraryIdMap = new Map<string, string>();
  const versionIdMap = new Map<string, string>();

  for (const source of rawLibraries) {
    const sourceChecksums = new Set(source.versions.map((version) => version.checksum));
    let target = libraries.find(
      (candidate) =>
        candidate.name.trim().toLowerCase() === source.name.trim().toLowerCase() &&
        candidate.versions.some((version) => sourceChecksums.has(version.checksum)),
    );

    if (!target) {
      const firstChecksum = source.versions[0]?.checksum ?? source.id;
      const globalLibraryId = `proto-lib-${stableHash(`${source.name}|${firstChecksum}`)}`;
      target = {
        id: globalLibraryId,
        name: source.name,
        description: source.description,
        lifecycle: source.lifecycle,
        archivedAt: source.archivedAt,
        defaultVersionId: "",
        versions: [],
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      };
      libraries.push(target);
    }

    libraryIdMap.set(source.id, target.id);
    for (const sourceVersion of source.versions) {
      let targetVersion = target.versions.find((version) => version.checksum === sourceVersion.checksum);
      if (!targetVersion) {
        const versionLabel = target.versions.some((version) => version.version === sourceVersion.version)
          ? `${sourceVersion.version} (${target.versions.length + 1})`
          : sourceVersion.version;
        targetVersion = createProtoLibraryVersion({
          libraryId: target.id,
          files: sourceVersion.files,
          version: versionLabel,
          previousVersionId: target.versions.at(-1)?.id,
          source: sourceVersion.source,
          lifecycle: sourceVersion.lifecycle,
          archivedAt: sourceVersion.archivedAt,
          createdAt: sourceVersion.createdAt,
        });
        targetVersion = { ...targetVersion, importedAt: sourceVersion.importedAt };
        target.versions.push(targetVersion);
      }
      if (sourceVersion.lifecycle !== "archived" && targetVersion.lifecycle === "archived") {
        targetVersion.lifecycle = "active";
        targetVersion.archivedAt = undefined;
      }
      versionIdMap.set(protoVersionMapKey(source.id, sourceVersion.id), targetVersion.id);
      if (sourceVersion.id === source.defaultVersionId || !target.defaultVersionId) {
        target.defaultVersionId = targetVersion.id;
      }
    }
    if (source.lifecycle !== "archived") {
      target.lifecycle = "active";
      target.archivedAt = undefined;
    }
    if (source.updatedAt > target.updatedAt) target.updatedAt = source.updatedAt;
  }

  return { libraries, libraryIdMap, versionIdMap };
}

export function normalizeProtoLibraries(input: unknown, legacyProtoFiles: ProtoSourceFile[] = []): ProtoLibrary[] {
  return normalizeProtoLibrariesWithRemap(input, legacyProtoFiles).libraries;
}

export function remapGrpcBindingToGlobalLibrary(
  binding: GrpcRequestBinding | undefined,
  normalization: ProtoLibraryNormalizationResult,
): GrpcRequestBinding | undefined {
  if (!binding) return undefined;
  const libraryId = normalization.libraryIdMap.get(binding.libraryId) ?? binding.libraryId;
  const versionId =
    normalization.versionIdMap.get(protoVersionMapKey(binding.libraryId, binding.versionId)) ?? binding.versionId;
  const library = normalization.libraries.find((item) => item.id === libraryId);
  const version = library?.versions.find((item) => item.id === versionId);
  return {
    ...binding,
    libraryId,
    versionId,
    schemaChecksum: version?.checksum ?? binding.schemaChecksum,
  };
}

export function appendProtoLibraryVersion(
  libraries: ProtoLibrary[],
  files: ProtoSourceFile[],
  options: { libraryName?: string; versionLabel?: string; createdAt?: string } = {},
): ProtoLibrary[] {
  if (files.length === 0) return libraries;
  const checksum = computeProtoVersionChecksum(files);
  const existingLibrary = libraries[0];
  if (!existingLibrary) {
    const created = createLegacyProtoLibrary(files, options.createdAt);
    if (!created) return [];
    return [
      {
        ...created,
        name: options.libraryName?.trim() || created.name,
        versions: created.versions.map((version) => ({
          ...version,
          version: options.versionLabel?.trim() || "v1",
        })),
      },
    ];
  }

  const existingVersion = existingLibrary.versions.find((version) => version.checksum === checksum);
  if (existingVersion) {
    return libraries.map((library) =>
      library.id === existingLibrary.id ? { ...library, defaultVersionId: existingVersion.id } : library,
    );
  }

  const previousVersion =
    existingLibrary.versions.find((version) => version.id === existingLibrary.defaultVersionId) ??
    existingLibrary.versions.at(-1);
  const nextVersion = createProtoLibraryVersion({
    libraryId: existingLibrary.id,
    files,
    version: options.versionLabel?.trim() || `v${existingLibrary.versions.length + 1}`,
    previousVersionId: previousVersion?.id,
    createdAt: options.createdAt,
  });
  const updatedAt = options.createdAt ?? new Date().toISOString();
  return libraries.map((library) =>
    library.id === existingLibrary.id
      ? {
          ...library,
          defaultVersionId: nextVersion.id,
          versions: [...library.versions, nextVersion],
          updatedAt,
        }
      : library,
  );
}

export function normalizeGrpcRequestBinding(value: unknown): GrpcRequestBinding | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<GrpcRequestBinding>;
  if (
    typeof candidate.libraryId !== "string" ||
    typeof candidate.versionId !== "string" ||
    typeof candidate.methodFullName !== "string"
  ) {
    return undefined;
  }
  return {
    libraryId: candidate.libraryId,
    versionId: candidate.versionId,
    methodFullName: candidate.methodFullName,
    requestType: typeof candidate.requestType === "string" ? candidate.requestType : "",
    responseType: typeof candidate.responseType === "string" ? candidate.responseType : "",
    methodSignatureHash: typeof candidate.methodSignatureHash === "string" ? candidate.methodSignatureHash : "",
    schemaChecksum: typeof candidate.schemaChecksum === "string" ? candidate.schemaChecksum : "",
    versionPolicy: candidate.versionPolicy === "latest-compatible" ? "latest-compatible" : "pinned",
    status: candidate.status,
  };
}

export function hydrateLegacyGrpcBinding(
  binding: GrpcRequestBinding | undefined,
  grpcMethodKey: string | undefined,
  libraries: ProtoLibrary[] | null | undefined,
  methods: RpcMethodInfo[],
): GrpcRequestBinding | undefined {
  if (binding?.status === "valid" && binding.requestType && binding.responseType) return binding;
  const targetKey = binding?.methodFullName || grpcMethodKey;
  if (!targetKey) return binding;
  const availableLibraries = Array.isArray(libraries) ? libraries : [];
  const method = methods.find((item) => `${item.serviceName}/${item.methodName}` === targetKey);
  if (!method) return binding ?? createLegacyGrpcBinding(targetKey, availableLibraries);
  const library = availableLibraries.find((item) => item.id === binding?.libraryId) ?? availableLibraries[0];
  const versions = library && Array.isArray(library.versions) ? library.versions : [];
  const version =
    versions.find((item) => item.id === binding?.versionId) ??
    versions.find((item) => item.id === library?.defaultVersionId) ??
    versions[0];
  return library && version ? createPinnedGrpcBinding(library, version, method) : binding;
}

export function findProtoVersion(
  libraries: ProtoLibrary[] | null | undefined,
  libraryId?: string,
  versionId?: string,
): { library: ProtoLibrary; version: ProtoLibraryVersion } | null {
  const availableLibraries = Array.isArray(libraries) ? libraries : [];
  const preferredLibrary =
    availableLibraries.find((library) => library.id === libraryId) ??
    availableLibraries.find((library) => library.lifecycle !== "archived") ??
    availableLibraries[0];
  if (!preferredLibrary) return null;
  const availableVersions = Array.isArray(preferredLibrary.versions) ? preferredLibrary.versions : [];
  const activeVersions = availableVersions.filter((version) => version.lifecycle !== "archived");
  const preferredVersion =
    availableVersions.find((version) => version.id === versionId) ??
    activeVersions.find((version) => version.id === preferredLibrary.defaultVersionId) ??
    activeVersions[0] ??
    availableVersions.find((version) => version.id === preferredLibrary.defaultVersionId) ??
    availableVersions[0];
  return preferredVersion ? { library: preferredLibrary, version: preferredVersion } : null;
}

export function grpcBindingIdentity(binding: GrpcRequestBinding | undefined, fallbackMethodKey = ""): string {
  return binding ? `${binding.libraryId}:${binding.versionId}:${binding.methodFullName}` : fallbackMethodKey;
}
