import type { LoadedProto, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import { loadProtoFiles } from "@/lib/proto-loader";
import type { ApiCollection, ApiCollectionRequest } from "../../shared/workbench-types";
import {
  computeProtoVersionChecksum,
  computeProtoContentChecksum,
  computeMethodSignatureHash,
  createPinnedGrpcBinding,
  createProtoLibraryVersion,
  normalizeProtoPath,
} from "./proto-library-domain";
import type {
  GrpcRequestBinding,
  ProtoLibrary,
  ProtoLibraryVersion,
  ProtoReferenceStatus,
} from "./proto-library-types";

export type ProtoChangeSeverity = "compatible" | "review" | "breaking";

export type ProtoSchemaChange = {
  id: string;
  severity: ProtoChangeSeverity;
  category: "method" | "message" | "field" | "enum" | "enum-value";
  action: "added" | "removed" | "changed" | "renamed";
  entity: string;
  detail: string;
};

export type ProtoVersionDiff = {
  fromVersionId: string;
  toVersionId: string;
  changes: ProtoSchemaChange[];
  summary: Record<ProtoChangeSeverity, number>;
};

export type ProtoRequestImpactStatus =
  | "compatible"
  | "body-review-required"
  | "method-signature-changed"
  | "method-missing";

export type ProtoRequestImpact = {
  collectionId: string;
  collectionName: string;
  requestId: string;
  requestName: string;
  methodFullName: string;
  status: ProtoRequestImpactStatus;
  reason: string;
  canUpdate: boolean;
};

export type ProtoVersionImportMode = "changed-files" | "complete-revision";

export type ProtoRevisionFileChange = {
  name: string;
  sourceName: string;
  previousName?: string;
  action: "added" | "replaced" | "unchanged" | "removed" | "renamed";
};

export type ProtoLibraryImportMatchKind = "exact" | "equivalent" | "revision-candidate";

export type ProtoLibraryImportAssessment = {
  kind: ProtoLibraryImportMatchKind;
  library: ProtoLibrary;
  version: ProtoLibraryVersion;
  similarity: number;
  sharedMethods: number;
  sharedMessages: number;
  reason: string;
};

export type ProtoVersionImportPlan = {
  libraryId: string;
  baseVersionId: string;
  importMode: ProtoVersionImportMode;
  fileChanges: ProtoRevisionFileChange[];
  candidateVersion: ProtoLibraryVersion;
  diff: ProtoVersionDiff;
  impacts: ProtoRequestImpact[];
};

export type ProtoVersionDependency = {
  type: "collection-request";
  collectionId: string;
  collectionName: string;
  requestId: string;
  requestName: string;
  methodFullName: string;
};

export type ProtoPurgeReferencePolicy =
  | { type: "keep-unresolved" }
  | { type: "move-compatible"; replacementVersionId: string };

export type ProtoVersionDeleteResult =
  | {
      ok: true;
      libraries: ProtoLibrary[];
      collections: ApiCollection[];
      nextLibraryId: string;
      nextVersionId: string;
    }
  | {
      ok: false;
      reason: string;
      dependencies: ProtoVersionDependency[];
    };

export type ProtoRepairCandidate = {
  libraryId: string;
  libraryName: string;
  versionId: string;
  versionLabel: string;
  method: RpcMethodInfo;
  methodFullName: string;
  score: number;
  exact: boolean;
};

type ProtoFieldManifest = {
  name: string;
  number: number;
  type: string;
  rule: string;
};

type ProtoMessageManifest = {
  name: string;
  fieldsByNumber: Map<number, ProtoFieldManifest>;
  fieldsByName: Map<string, ProtoFieldManifest>;
};

type ProtoEnumManifest = {
  name: string;
  valuesByName: Map<string, number>;
  valuesByNumber: Map<number, string>;
};

type ProtoManifest = {
  methods: Map<string, RpcMethodInfo>;
  messages: Map<string, ProtoMessageManifest>;
  enums: Map<string, ProtoEnumManifest>;
};

type NamespaceLike = {
  fullName?: string;
  name?: string;
  nestedArray?: unknown[];
  fieldsArray?: Array<{
    name: string;
    id: number;
    type: string;
    rule?: string;
    repeated?: boolean;
    map?: boolean;
    resolvedType?: { fullName?: string };
  }>;
  values?: Record<string, number>;
};

function entityName(item: NamespaceLike): string {
  return (item.fullName || item.name || "").replace(/^\./, "");
}

function schemaChange(input: Omit<ProtoSchemaChange, "id">): ProtoSchemaChange {
  const source = [input.severity, input.category, input.action, input.entity, input.detail].join("|");
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return { ...input, id: `proto-change-${(hash >>> 0).toString(16)}` };
}

function buildProtoManifest(loaded: LoadedProto): ProtoManifest {
  const manifest: ProtoManifest = {
    methods: new Map(loaded.methods.map((method) => [`${method.serviceName}/${method.methodName}`, method])),
    messages: new Map(),
    enums: new Map(),
  };

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const item = value as NamespaceLike;
    const name = entityName(item);

    if (Array.isArray(item.fieldsArray) && name) {
      const fields = item.fieldsArray.map((field) => ({
        name: field.name,
        number: field.id,
        type: (field.resolvedType?.fullName || field.type).replace(/^\./, ""),
        rule: field.map ? "map" : field.repeated ? "repeated" : field.rule || "optional",
      }));
      manifest.messages.set(name, {
        name,
        fieldsByNumber: new Map(fields.map((field) => [field.number, field])),
        fieldsByName: new Map(fields.map((field) => [field.name, field])),
      });
    } else if (item.values && name) {
      manifest.enums.set(name, {
        name,
        valuesByName: new Map(Object.entries(item.values)),
        valuesByNumber: new Map(Object.entries(item.values).map(([key, number]) => [number, key])),
      });
    }

    for (const child of item.nestedArray ?? []) visit(child);
  };

  visit(loaded.root);
  return manifest;
}

function canonicalProtoManifest(manifest: ProtoManifest): string {
  const methods = [...manifest.methods.entries()]
    .map(([name, method]) =>
      [
        name,
        method.requestType,
        method.responseType,
        method.requestStream ? "client-stream" : "single-request",
        method.responseStream ? "server-stream" : "single-response",
      ].join("|"),
    )
    .sort();
  const messages = [...manifest.messages.values()]
    .filter((message) => !message.name.startsWith("google.protobuf."))
    .map((message) =>
      [
        message.name,
        [...message.fieldsByNumber.values()]
          .sort((left, right) => left.number - right.number)
          .map((field) => `${field.number}:${field.name}:${field.type}:${field.rule}`)
          .join(","),
      ].join("|"),
    )
    .sort();
  const enums = [...manifest.enums.values()]
    .filter((item) => !item.name.startsWith("google.protobuf."))
    .map((item) =>
      [
        item.name,
        [...item.valuesByName.entries()]
          .sort(
            ([leftName, leftNumber], [rightName, rightNumber]) =>
              leftNumber - rightNumber || leftName.localeCompare(rightName),
          )
          .map(([name, number]) => `${number}:${name}`)
          .join(","),
      ].join("|"),
    )
    .sort();
  return JSON.stringify({ methods, messages, enums });
}

function intersectionSize(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function jaccardSimilarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  const intersection = intersectionSize(left, right);
  return intersection / (left.size + right.size - intersection);
}

function manifestIdentitySets(manifest: ProtoManifest): {
  methods: Set<string>;
  messages: Set<string>;
  enums: Set<string>;
} {
  return {
    methods: new Set(manifest.methods.keys()),
    messages: new Set([...manifest.messages.keys()].filter((name) => !name.startsWith("google.protobuf."))),
    enums: new Set([...manifest.enums.keys()].filter((name) => !name.startsWith("google.protobuf."))),
  };
}

function protoManifestSimilarity(
  left: ProtoManifest,
  right: ProtoManifest,
): { score: number; sharedMethods: number; sharedMessages: number } {
  const leftSets = manifestIdentitySets(left);
  const rightSets = manifestIdentitySets(right);
  const sharedMethods = intersectionSize(leftSets.methods, rightSets.methods);
  const sharedMessages = intersectionSize(leftSets.messages, rightSets.messages);
  const dimensions = [
    {
      weight: 0.55,
      value: jaccardSimilarity(leftSets.methods, rightSets.methods),
      active: leftSets.methods.size + rightSets.methods.size > 0,
    },
    {
      weight: 0.35,
      value: jaccardSimilarity(leftSets.messages, rightSets.messages),
      active: leftSets.messages.size + rightSets.messages.size > 0,
    },
    {
      weight: 0.1,
      value: jaccardSimilarity(leftSets.enums, rightSets.enums),
      active: leftSets.enums.size + rightSets.enums.size > 0,
    },
  ].filter((dimension) => dimension.active);
  const totalWeight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const score =
    totalWeight > 0
      ? dimensions.reduce((sum, dimension) => sum + dimension.value * dimension.weight, 0) / totalWeight
      : 0;
  return { score, sharedMethods, sharedMessages };
}

/**
 * Finds an existing active schema that is identical or likely to be the parent
 * of an imported proto set. Source file names are deliberately excluded from
 * semantic comparison so renamed files do not create accidental duplicates.
 */
export function assessProtoLibraryImport(
  libraries: ProtoLibrary[],
  files: ProtoSourceFile[],
): ProtoLibraryImportAssessment | null {
  if (files.length === 0) return null;
  const incomingChecksum = computeProtoVersionChecksum(files);
  const incomingContentChecksum = computeProtoContentChecksum(files);
  const incomingManifest = buildProtoManifest(loadProtoFiles(files));
  const incomingCanonical = canonicalProtoManifest(incomingManifest);
  let best: ProtoLibraryImportAssessment | null = null;

  for (const library of libraries) {
    if (library.lifecycle === "archived") continue;
    for (const version of library.versions) {
      if (version.lifecycle === "archived") continue;
      if (
        version.checksum === incomingChecksum ||
        computeProtoContentChecksum(version.files) === incomingContentChecksum
      ) {
        return {
          kind: "exact",
          library,
          version,
          similarity: 1,
          sharedMethods: incomingManifest.methods.size,
          sharedMessages: incomingManifest.messages.size,
          reason: "The selected files are already stored in this revision.",
        };
      }

      try {
        const existingManifest = buildProtoManifest(loadProtoFiles(version.files));
        const similarity = protoManifestSimilarity(existingManifest, incomingManifest);
        const equivalent = canonicalProtoManifest(existingManifest) === incomingCanonical;
        const candidate: ProtoLibraryImportAssessment | null = equivalent
          ? {
              kind: "equivalent",
              library,
              version,
              similarity: 1,
              sharedMethods: similarity.sharedMethods,
              sharedMessages: similarity.sharedMessages,
              reason: "The API structure is identical; only source file names, paths, comments, or formatting differ.",
            }
          : similarity.score >= 0.5 && (similarity.sharedMethods > 0 || similarity.sharedMessages >= 2)
            ? {
                kind: "revision-candidate",
                library,
                version,
                similarity: similarity.score,
                sharedMethods: similarity.sharedMethods,
                sharedMessages: similarity.sharedMessages,
                reason: "This import shares enough RPC and message identities to be treated as a likely revision.",
              }
            : null;
        if (!candidate) continue;
        if (
          !best ||
          candidate.kind === "equivalent" ||
          candidate.similarity > best.similarity ||
          (candidate.similarity === best.similarity && version.id === library.defaultVersionId)
        ) {
          best = candidate;
        }
      } catch {
        // Ignore an older invalid revision and continue checking other candidates.
      }
    }
  }
  return best;
}

function wireTypeGroup(type: string): string {
  const normalized = type.replace(/^\./, "");
  if (["int32", "uint32", "sint32", "int64", "uint64", "sint64", "bool"].includes(normalized)) return "varint";
  if (["fixed32", "sfixed32", "float"].includes(normalized)) return "fixed32";
  if (["fixed64", "sfixed64", "double"].includes(normalized)) return "fixed64";
  if (["string", "bytes"].includes(normalized)) return "length-delimited";
  return `message-or-enum:${normalized}`;
}

function compareMethods(previous: ProtoManifest, next: ProtoManifest, changes: ProtoSchemaChange[]) {
  for (const [key, before] of previous.methods) {
    const after = next.methods.get(key);
    if (!after) {
      changes.push(
        schemaChange({
          severity: "breaking",
          category: "method",
          action: "removed",
          entity: key,
          detail: "RPC method was removed.",
        }),
      );
      continue;
    }
    if (computeMethodSignatureHash(before) !== computeMethodSignatureHash(after)) {
      changes.push(
        schemaChange({
          severity: "breaking",
          category: "method",
          action: "changed",
          entity: key,
          detail: `Signature changed from ${before.requestType} → ${before.responseType} to ${after.requestType} → ${after.responseType}, or its streaming mode changed.`,
        }),
      );
    }
  }

  for (const key of next.methods.keys()) {
    if (!previous.methods.has(key)) {
      changes.push(
        schemaChange({
          severity: "compatible",
          category: "method",
          action: "added",
          entity: key,
          detail: "RPC method was added.",
        }),
      );
    }
  }
}

function compareMessages(previous: ProtoManifest, next: ProtoManifest, changes: ProtoSchemaChange[]) {
  for (const [messageName, before] of previous.messages) {
    const after = next.messages.get(messageName);
    if (!after) {
      changes.push(
        schemaChange({
          severity: "breaking",
          category: "message",
          action: "removed",
          entity: messageName,
          detail: "Message type was removed.",
        }),
      );
      continue;
    }

    for (const [number, beforeField] of before.fieldsByNumber) {
      const afterField = after.fieldsByNumber.get(number);
      if (!afterField) {
        const sameName = after.fieldsByName.get(beforeField.name);
        changes.push(
          schemaChange({
            severity: "breaking",
            category: "field",
            action: sameName ? "changed" : "removed",
            entity: `${messageName}.${beforeField.name}`,
            detail: sameName
              ? `Field number changed from ${beforeField.number} to ${sameName.number}.`
              : `Field ${beforeField.name} (${beforeField.number}) was removed or its number was reused.`,
          }),
        );
        continue;
      }

      if (afterField.name !== beforeField.name) {
        changes.push(
          schemaChange({
            severity: "review",
            category: "field",
            action: "renamed",
            entity: `${messageName}.${beforeField.name}`,
            detail: `Field ${beforeField.number} was renamed to ${afterField.name}; JSON request bodies may need updates.`,
          }),
        );
      }

      if (afterField.type !== beforeField.type) {
        const wireCompatible = wireTypeGroup(afterField.type) === wireTypeGroup(beforeField.type);
        changes.push(
          schemaChange({
            severity: wireCompatible ? "review" : "breaking",
            category: "field",
            action: "changed",
            entity: `${messageName}.${afterField.name}`,
            detail: `Field type changed from ${beforeField.type} to ${afterField.type}${wireCompatible ? " with the same wire group" : ""}.`,
          }),
        );
      }

      if (afterField.rule !== beforeField.rule) {
        changes.push(
          schemaChange({
            severity: "breaking",
            category: "field",
            action: "changed",
            entity: `${messageName}.${afterField.name}`,
            detail: `Field cardinality changed from ${beforeField.rule} to ${afterField.rule}.`,
          }),
        );
      }
    }

    for (const [number, afterField] of after.fieldsByNumber) {
      if (!before.fieldsByNumber.has(number)) {
        changes.push(
          schemaChange({
            severity: afterField.rule === "required" ? "review" : "compatible",
            category: "field",
            action: "added",
            entity: `${messageName}.${afterField.name}`,
            detail: `Field ${afterField.name} (${number}) was added${afterField.rule === "required" ? " as required" : ""}.`,
          }),
        );
      }
    }
  }

  for (const messageName of next.messages.keys()) {
    if (!previous.messages.has(messageName)) {
      changes.push(
        schemaChange({
          severity: "compatible",
          category: "message",
          action: "added",
          entity: messageName,
          detail: "Message type was added.",
        }),
      );
    }
  }
}

function compareEnums(previous: ProtoManifest, next: ProtoManifest, changes: ProtoSchemaChange[]) {
  for (const [enumName, before] of previous.enums) {
    const after = next.enums.get(enumName);
    if (!after) {
      changes.push(
        schemaChange({
          severity: "breaking",
          category: "enum",
          action: "removed",
          entity: enumName,
          detail: "Enum type was removed.",
        }),
      );
      continue;
    }

    for (const [name, number] of before.valuesByName) {
      const nextNumber = after.valuesByName.get(name);
      if (nextNumber === undefined) {
        changes.push(
          schemaChange({
            severity: "breaking",
            category: "enum-value",
            action: "removed",
            entity: `${enumName}.${name}`,
            detail: `Enum value ${name} (${number}) was removed or renamed.`,
          }),
        );
      } else if (nextNumber !== number) {
        changes.push(
          schemaChange({
            severity: "breaking",
            category: "enum-value",
            action: "changed",
            entity: `${enumName}.${name}`,
            detail: `Enum number changed from ${number} to ${nextNumber}.`,
          }),
        );
      }
    }

    for (const [name, number] of after.valuesByName) {
      if (!before.valuesByName.has(name)) {
        changes.push(
          schemaChange({
            severity: "compatible",
            category: "enum-value",
            action: "added",
            entity: `${enumName}.${name}`,
            detail: `Enum value ${name} (${number}) was added.`,
          }),
        );
      }
    }
  }

  for (const enumName of next.enums.keys()) {
    if (!previous.enums.has(enumName)) {
      changes.push(
        schemaChange({
          severity: "compatible",
          category: "enum",
          action: "added",
          entity: enumName,
          detail: "Enum type was added.",
        }),
      );
    }
  }
}

export function diffProtoVersions(
  previousVersion: ProtoLibraryVersion,
  nextVersion: ProtoLibraryVersion,
): ProtoVersionDiff {
  const previous = buildProtoManifest(loadProtoFiles(previousVersion.files));
  const next = buildProtoManifest(loadProtoFiles(nextVersion.files));
  const changes: ProtoSchemaChange[] = [];
  compareMethods(previous, next, changes);
  compareMessages(previous, next, changes);
  compareEnums(previous, next, changes);
  changes.sort((left, right) => {
    const rank: Record<ProtoChangeSeverity, number> = { breaking: 0, review: 1, compatible: 2 };
    return rank[left.severity] - rank[right.severity] || left.entity.localeCompare(right.entity);
  });
  return {
    fromVersionId: previousVersion.id,
    toVersionId: nextVersion.id,
    changes,
    summary: {
      compatible: changes.filter((change) => change.severity === "compatible").length,
      review: changes.filter((change) => change.severity === "review").length,
      breaking: changes.filter((change) => change.severity === "breaking").length,
    },
  };
}

function normalizedFileName(name: string): string {
  return normalizeProtoPath(name).replace(/^\/+/, "");
}

function commonUploadRoot(files: ProtoSourceFile[]): string {
  const roots = files.map((file) => normalizedFileName(file.name).split("/")).filter((parts) => parts.length > 1);
  if (roots.length !== files.length || roots.length === 0) return "";
  const first = roots[0][0];
  return roots.every((parts) => parts[0] === first) ? first : "";
}

function normalizeUploadedFiles(baseFiles: ProtoSourceFile[], uploadedFiles: ProtoSourceFile[]): ProtoSourceFile[] {
  const baseNames = new Set(baseFiles.map((file) => normalizedFileName(file.name)));
  const root = commonUploadRoot(uploadedFiles);
  const exactMatches = uploadedFiles.filter((file) => baseNames.has(normalizedFileName(file.name))).length;
  const strippedMatches = root
    ? uploadedFiles.filter((file) => baseNames.has(normalizedFileName(file.name).split("/").slice(1).join("/"))).length
    : 0;
  const baseUsesRoot = Boolean(root && [...baseNames].some((name) => name.startsWith(`${root}/`)));
  const stripRoot = Boolean(root && (strippedMatches > exactMatches || (exactMatches === 0 && !baseUsesRoot)));
  return uploadedFiles.map((file) => {
    const normalized = normalizedFileName(file.name);
    return {
      ...file,
      name: stripRoot ? normalized.split("/").slice(1).join("/") : normalized,
    };
  });
}

function resolveIncrementalTargetName(baseFiles: ProtoSourceFile[], uploadedName: string): string {
  const normalized = normalizedFileName(uploadedName);
  const exact = baseFiles.find((file) => normalizedFileName(file.name) === normalized);
  if (exact) return normalizedFileName(exact.name);

  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  const basenameMatches = baseFiles.filter(
    (file) => normalizedFileName(file.name).slice(normalizedFileName(file.name).lastIndexOf("/") + 1) === basename,
  );
  if (basenameMatches.length === 1) return normalizedFileName(basenameMatches[0].name);
  if (basenameMatches.length > 1) {
    throw new Error(
      `Cannot determine which ${basename} should be replaced because the base revision contains multiple files with that name. Upload the file from a folder so its relative path is preserved.`,
    );
  }
  return normalized;
}

/** Creates a complete candidate snapshot by replacing only uploaded files in a base revision. */
export function mergeProtoRevisionFiles(
  baseFiles: ProtoSourceFile[],
  changedFiles: ProtoSourceFile[],
): { files: ProtoSourceFile[]; changes: ProtoRevisionFileChange[] } {
  if (changedFiles.length === 0) throw new Error("Select at least one changed .proto file.");
  const normalizedChanges = normalizeUploadedFiles(baseFiles, changedFiles);
  const baseByName = new Map(
    baseFiles.map((file) => [normalizedFileName(file.name), { ...file, name: normalizedFileName(file.name) }]),
  );
  const usedTargets = new Set<string>();
  const changes: ProtoRevisionFileChange[] = [];

  for (const changed of normalizedChanges) {
    const targetName = resolveIncrementalTargetName(baseFiles, changed.name);
    if (usedTargets.has(targetName)) throw new Error(`The upload contains more than one candidate for ${targetName}.`);
    usedTargets.add(targetName);
    const previous = baseByName.get(targetName);
    const next = { ...changed, name: targetName };
    baseByName.set(targetName, next);
    changes.push({
      name: targetName,
      sourceName: normalizedFileName(changed.name),
      action: previous ? (previous.text === next.text ? "unchanged" : "replaced") : "added",
    });
  }

  return {
    files: [...baseByName.values()].sort((left, right) => left.name.localeCompare(right.name)),
    changes: changes.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function completeRevisionFiles(
  baseFiles: ProtoSourceFile[],
  uploadedFiles: ProtoSourceFile[],
): { files: ProtoSourceFile[]; changes: ProtoRevisionFileChange[] } {
  if (uploadedFiles.length === 0) throw new Error("Select one or more .proto files for the complete revision.");
  const files = normalizeUploadedFiles(baseFiles, uploadedFiles);
  const duplicate = files.find(
    (file, index) =>
      files.findIndex((candidate) => normalizedFileName(candidate.name) === normalizedFileName(file.name)) !== index,
  );
  if (duplicate) throw new Error(`The selected revision contains duplicate path ${duplicate.name}.`);
  const baseByName = new Map(baseFiles.map((file) => [normalizedFileName(file.name), file]));
  const nextByName = new Map(files.map((file) => [normalizedFileName(file.name), file]));
  const removed = baseFiles.filter((file) => !nextByName.has(normalizedFileName(file.name)));
  const claimedRemovedNames = new Set<string>();
  const normalizeSourceText = (text: string) => text.replaceAll("\r\n", "\n").trim();
  const changes = files.map((file): ProtoRevisionFileChange => {
    const name = normalizedFileName(file.name);
    const previous = baseByName.get(name);
    if (previous) {
      return {
        name,
        sourceName: name,
        action: previous.text === file.text ? "unchanged" : "replaced",
      };
    }
    const renameCandidates = removed.filter(
      (candidate) =>
        !claimedRemovedNames.has(normalizedFileName(candidate.name)) &&
        normalizeSourceText(candidate.text) === normalizeSourceText(file.text),
    );
    if (renameCandidates.length === 1) {
      const previousName = normalizedFileName(renameCandidates[0].name);
      claimedRemovedNames.add(previousName);
      return {
        name,
        sourceName: name,
        previousName,
        action: "renamed",
      };
    }
    return { name, sourceName: name, action: "added" };
  });
  return {
    files: files.map((file) => ({ ...file, name: normalizedFileName(file.name) })),
    changes: [
      ...changes,
      ...removed
        .filter((file) => !claimedRemovedNames.has(normalizedFileName(file.name)))
        .map(
          (file): ProtoRevisionFileChange => ({
            name: normalizedFileName(file.name),
            sourceName: normalizedFileName(file.name),
            action: "removed",
          }),
        ),
    ].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function verifyRequestBody(loaded: LoadedProto, method: RpcMethodInfo, bodyText: string): string | null {
  try {
    const value = bodyText.trim() ? JSON.parse(bodyText) : {};
    const requestType = loaded.root.lookupType(method.requestType);
    return requestType.verify(value) || null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function requestUsesVersion(request: ApiCollectionRequest, libraryId: string, versionId: string): boolean {
  return request.kind === "grpc" && request.grpc?.libraryId === libraryId && request.grpc.versionId === versionId;
}

function impactForRequest(
  collection: ApiCollection,
  request: ApiCollectionRequest,
  baseLoaded: LoadedProto,
  candidateLoaded: LoadedProto,
  diff: ProtoVersionDiff,
): ProtoRequestImpact {
  const methodFullName = request.grpc?.methodFullName || request.grpcMethodKey || "";
  const before = baseLoaded.methods.find((method) => `${method.serviceName}/${method.methodName}` === methodFullName);
  const after = candidateLoaded.methods.find(
    (method) => `${method.serviceName}/${method.methodName}` === methodFullName,
  );

  const common = {
    collectionId: collection.id,
    collectionName: collection.name,
    requestId: request.id,
    requestName: request.name,
    methodFullName,
  };

  if (!after) {
    return {
      ...common,
      status: "method-missing",
      reason: "The RPC method does not exist in the candidate version.",
      canUpdate: false,
    };
  }
  if (!before || computeMethodSignatureHash(before) !== computeMethodSignatureHash(after)) {
    return {
      ...common,
      status: "method-signature-changed",
      reason: "The request/response type or streaming mode changed.",
      canUpdate: false,
    };
  }

  const bodyError = verifyRequestBody(candidateLoaded, after, request.body);
  const relatedReview = diff.changes.some(
    (change) =>
      change.severity !== "compatible" &&
      (change.entity === after.requestType || change.entity.startsWith(`${after.requestType}.`)),
  );
  if (bodyError || relatedReview) {
    return {
      ...common,
      status: "body-review-required",
      reason: bodyError
        ? `Request body is not valid for the candidate type: ${bodyError}`
        : "Request message changed and should be reviewed.",
      canUpdate: true,
    };
  }
  return {
    ...common,
    status: "compatible",
    reason: "Method signature and saved request body remain compatible.",
    canUpdate: true,
  };
}

export function prepareProtoVersionImport(input: {
  library: ProtoLibrary;
  baseVersion: ProtoLibraryVersion;
  files: ProtoSourceFile[];
  versionLabel: string;
  collections: ApiCollection[];
  importMode?: ProtoVersionImportMode;
  createdAt?: string;
  /** Allows a deliberate version-label bump even when the schema bytes are unchanged. */
  allowDuplicateChecksum?: boolean;
}): ProtoVersionImportPlan {
  const importMode = input.importMode ?? "complete-revision";
  const snapshot =
    importMode === "changed-files"
      ? mergeProtoRevisionFiles(input.baseVersion.files, input.files)
      : completeRevisionFiles(input.baseVersion.files, input.files);
  const candidateVersion = createProtoLibraryVersion({
    libraryId: input.library.id,
    files: snapshot.files,
    version: input.versionLabel.trim() || `v${input.library.versions.length + 1}`,
    previousVersionId: input.baseVersion.id,
    createdAt: input.createdAt,
  });
  const existing = input.library.versions.find((version) => version.checksum === candidateVersion.checksum);
  if (existing && !input.allowDuplicateChecksum) {
    throw new Error(`This schema already exists as ${existing.version}.`);
  }
  if (input.library.versions.some((version) => version.id === candidateVersion.id)) {
    throw new Error(`Revision label “${candidateVersion.version}” already exists for this schema content.`);
  }

  const baseLoaded = loadProtoFiles(input.baseVersion.files);
  const candidateLoaded = loadProtoFiles(candidateVersion.files);
  const diff = diffProtoVersions(input.baseVersion, candidateVersion);
  const impacts = input.collections.flatMap((collection) =>
    collection.requests
      .filter((request) => requestUsesVersion(request, input.library.id, input.baseVersion.id))
      .map((request) => impactForRequest(collection, request, baseLoaded, candidateLoaded, diff)),
  );
  return {
    libraryId: input.library.id,
    baseVersionId: input.baseVersion.id,
    importMode,
    fileChanges: snapshot.changes,
    candidateVersion,
    diff,
    impacts,
  };
}

function statusForUnselectedImpact(impact: ProtoRequestImpact): ProtoReferenceStatus {
  return impact.status === "compatible" ? "compatible-update-available" : "update-available";
}

export function applyProtoVersionImport(input: {
  libraries: ProtoLibrary[];
  collections: ApiCollection[];
  plan: ProtoVersionImportPlan;
  selectedRequestIds: ReadonlySet<string>;
  setAsDefault?: boolean;
}): { libraries: ProtoLibrary[]; collections: ApiCollection[] } {
  const library = input.libraries.find((item) => item.id === input.plan.libraryId);
  if (!library) throw new Error("Proto library no longer exists.");
  if (library.versions.some((version) => version.id === input.plan.candidateVersion.id)) {
    throw new Error("Proto version has already been imported.");
  }

  const candidateLoaded = loadProtoFiles(input.plan.candidateVersion.files);
  const impactByRequestId = new Map(input.plan.impacts.map((impact) => [impact.requestId, impact]));
  const collections = input.collections.map((collection) => ({
    ...collection,
    requests: collection.requests.map((request) => {
      const impact = impactByRequestId.get(request.id);
      if (!impact || !request.grpc) return request;
      if (!input.selectedRequestIds.has(request.id)) {
        return { ...request, grpc: { ...request.grpc, status: statusForUnselectedImpact(impact) } };
      }
      if (!impact.canUpdate) return request;
      const method = candidateLoaded.methods.find(
        (item) => `${item.serviceName}/${item.methodName}` === impact.methodFullName,
      );
      if (!method) return request;
      const binding = createPinnedGrpcBinding(library, input.plan.candidateVersion, method);
      return {
        ...request,
        grpcMethodKey: binding.methodFullName,
        grpc: {
          ...binding,
          status: (impact.status === "body-review-required" ? "body-review-required" : "valid") as ProtoReferenceStatus,
        },
        updatedAt: new Date().toISOString(),
      };
    }),
    updatedAt: collection.requests.some((request) => input.selectedRequestIds.has(request.id))
      ? new Date().toISOString()
      : collection.updatedAt,
  }));

  const libraries = input.libraries.map((item) =>
    item.id === library.id
      ? {
          ...item,
          defaultVersionId: input.setAsDefault === false ? item.defaultVersionId : input.plan.candidateVersion.id,
          versions: [...item.versions, input.plan.candidateVersion],
          updatedAt: new Date().toISOString(),
        }
      : item,
  );
  return { libraries, collections };
}

export function findProtoVersionDependencies(
  collections: ApiCollection[],
  libraryId: string,
  versionId: string,
): ProtoVersionDependency[] {
  return collections.flatMap((collection) =>
    collection.requests
      .filter((request) => requestUsesVersion(request, libraryId, versionId))
      .map((request) => ({
        type: "collection-request" as const,
        collectionId: collection.id,
        collectionName: collection.name,
        requestId: request.id,
        requestName: request.name,
        methodFullName: request.grpc?.methodFullName || request.grpcMethodKey || "",
      })),
  );
}

export function archiveProtoVersion(input: {
  libraries: ProtoLibrary[];
  libraryId: string;
  versionId: string;
}): ProtoVersionDeleteResult {
  const library = input.libraries.find((item) => item.id === input.libraryId);
  const version = library?.versions.find((item) => item.id === input.versionId);
  if (!library || !version) {
    return { ok: false, reason: "Proto revision was not found.", dependencies: [] };
  }
  if (version.lifecycle === "archived") {
    return {
      ok: true,
      libraries: input.libraries,
      collections: [],
      nextLibraryId: library.id,
      nextVersionId: version.id,
    };
  }
  const now = new Date().toISOString();
  const libraries = input.libraries.map((item) => {
    if (item.id !== library.id) return item;
    const versions = item.versions.map((candidate) =>
      candidate.id === version.id ? { ...candidate, lifecycle: "archived" as const, archivedAt: now } : candidate,
    );
    const nextActive = versions.find((candidate) => candidate.id !== version.id && candidate.lifecycle !== "archived");
    return {
      ...item,
      versions,
      defaultVersionId: item.defaultVersionId === version.id && nextActive ? nextActive.id : item.defaultVersionId,
      updatedAt: now,
    };
  });
  const nextLibrary = libraries.find((item) => item.id === library.id) ?? libraries[0];
  const nextVersion =
    nextLibrary?.versions.find((item) => item.id === nextLibrary.defaultVersionId) ??
    nextLibrary?.versions.find((item) => item.lifecycle !== "archived") ??
    nextLibrary?.versions[0];
  return {
    ok: true,
    libraries,
    collections: [],
    nextLibraryId: nextLibrary?.id ?? "",
    nextVersionId: nextVersion?.id ?? "",
  };
}

export function restoreProtoVersion(input: {
  libraries: ProtoLibrary[];
  libraryId: string;
  versionId: string;
}): ProtoVersionDeleteResult {
  const library = input.libraries.find((item) => item.id === input.libraryId);
  const version = library?.versions.find((item) => item.id === input.versionId);
  if (!library || !version) {
    return { ok: false, reason: "Proto revision was not found.", dependencies: [] };
  }
  const now = new Date().toISOString();
  const libraries = input.libraries.map((item) =>
    item.id === library.id
      ? {
          ...item,
          lifecycle: "active" as const,
          archivedAt: undefined,
          versions: item.versions.map((candidate) =>
            candidate.id === version.id
              ? { ...candidate, lifecycle: "active" as const, archivedAt: undefined }
              : candidate,
          ),
          defaultVersionId: item.versions.some(
            (candidate) => candidate.id === item.defaultVersionId && candidate.lifecycle !== "archived",
          )
            ? item.defaultVersionId
            : version.id,
          updatedAt: now,
        }
      : item,
  );
  return {
    ok: true,
    libraries,
    collections: [],
    nextLibraryId: library.id,
    nextVersionId: version.id,
  };
}

export function archiveProtoLibrary(input: { libraries: ProtoLibrary[]; libraryId: string }): ProtoVersionDeleteResult {
  const library = input.libraries.find((item) => item.id === input.libraryId);
  if (!library) return { ok: false, reason: "Proto schema was not found.", dependencies: [] };
  const now = new Date().toISOString();
  const libraries = input.libraries.map((item) =>
    item.id === library.id ? { ...item, lifecycle: "archived" as const, archivedAt: now, updatedAt: now } : item,
  );
  const nextLibrary = libraries.find((item) => item.lifecycle !== "archived") ?? library;
  const nextVersion =
    nextLibrary.versions.find((item) => item.id === nextLibrary.defaultVersionId) ??
    nextLibrary.versions.find((item) => item.lifecycle !== "archived") ??
    nextLibrary.versions[0];
  return {
    ok: true,
    libraries,
    collections: [],
    nextLibraryId: nextLibrary.id,
    nextVersionId: nextVersion?.id ?? "",
  };
}

export function restoreProtoLibrary(input: { libraries: ProtoLibrary[]; libraryId: string }): ProtoVersionDeleteResult {
  const library = input.libraries.find((item) => item.id === input.libraryId);
  if (!library) return { ok: false, reason: "Proto schema was not found.", dependencies: [] };
  const now = new Date().toISOString();
  const versions = library.versions.map((version) =>
    version.lifecycle === "archived" ? { ...version, lifecycle: "active" as const, archivedAt: undefined } : version,
  );
  const defaultVersion =
    versions.find((version) => version.id === library.defaultVersionId && version.lifecycle !== "archived") ??
    versions.find((version) => version.lifecycle !== "archived") ??
    versions[0];
  const libraries = input.libraries.map((item) =>
    item.id === library.id
      ? {
          ...item,
          lifecycle: "active" as const,
          archivedAt: undefined,
          versions,
          defaultVersionId: defaultVersion?.id ?? "",
          updatedAt: now,
        }
      : item,
  );
  return {
    ok: true,
    libraries,
    collections: [],
    nextLibraryId: library.id,
    nextVersionId: defaultVersion?.id ?? "",
  };
}

export function purgeProtoVersion(input: {
  libraries: ProtoLibrary[];
  collections: ApiCollection[];
  libraryId: string;
  versionId: string;
  referencePolicy?: ProtoPurgeReferencePolicy;
}): ProtoVersionDeleteResult {
  const library = input.libraries.find((item) => item.id === input.libraryId);
  const version = library?.versions.find((item) => item.id === input.versionId);
  if (!library || !version) {
    return { ok: false, reason: "Proto revision was not found.", dependencies: [] };
  }
  const dependencies = findProtoVersionDependencies(input.collections, input.libraryId, input.versionId);
  const policy = input.referencePolicy ?? { type: "keep-unresolved" as const };
  const replacement =
    policy.type === "move-compatible"
      ? library.versions.find((item) => item.id === policy.replacementVersionId)
      : undefined;
  if (policy.type === "move-compatible" && !replacement) {
    return { ok: false, reason: "Select a valid replacement revision.", dependencies };
  }

  let collections = input.collections;
  if (dependencies.length > 0 && policy.type === "move-compatible" && replacement) {
    const sourceLoaded = loadProtoFiles(version.files);
    const replacementLoaded = loadProtoFiles(replacement.files);
    const unresolved = dependencies.filter((dependency) => {
      const sourceMethod = sourceLoaded.methods.find(
        (method) => `${method.serviceName}/${method.methodName}` === dependency.methodFullName,
      );
      const replacementMethod = replacementLoaded.methods.find(
        (method) => `${method.serviceName}/${method.methodName}` === dependency.methodFullName,
      );
      return (
        !sourceMethod ||
        !replacementMethod ||
        computeMethodSignatureHash(sourceMethod) !== computeMethodSignatureHash(replacementMethod)
      );
    });
    if (unresolved.length > 0) {
      return {
        ok: false,
        reason: `${unresolved.length} request(s) cannot be moved because their RPC method is absent or has an incompatible signature in ${replacement.version}.`,
        dependencies: unresolved,
      };
    }

    const dependencyIds = new Set(dependencies.map((dependency) => dependency.requestId));
    collections = input.collections.map((collection) => ({
      ...collection,
      requests: collection.requests.map((request) => {
        if (!dependencyIds.has(request.id)) return request;
        const methodFullName = request.grpc?.methodFullName || request.grpcMethodKey || "";
        const method = replacementLoaded.methods.find(
          (item) => `${item.serviceName}/${item.methodName}` === methodFullName,
        );
        if (!method) return request;
        const bodyError = verifyRequestBody(replacementLoaded, method, request.body);
        const binding = createPinnedGrpcBinding(library, replacement, method);
        return {
          ...request,
          grpcMethodKey: binding.methodFullName,
          grpc: { ...binding, status: (bodyError ? "body-review-required" : "valid") as ProtoReferenceStatus },
          updatedAt: new Date().toISOString(),
        };
      }),
      updatedAt: collection.requests.some((request) => dependencyIds.has(request.id))
        ? new Date().toISOString()
        : collection.updatedAt,
    }));
  }

  const remainingVersions = library.versions.filter((item) => item.id !== input.versionId);
  const removesLibrary = remainingVersions.length === 0;
  if (dependencies.length > 0 && policy.type === "keep-unresolved") {
    collections = input.collections.map((collection) => ({
      ...collection,
      requests: collection.requests.map((request) =>
        requestUsesVersion(request, input.libraryId, input.versionId) && request.grpc
          ? {
              ...request,
              grpc: {
                ...request.grpc,
                status: removesLibrary ? "library-missing" : "version-missing",
              },
              updatedAt: new Date().toISOString(),
            }
          : request,
      ),
      updatedAt: collection.requests.some((request) => requestUsesVersion(request, input.libraryId, input.versionId))
        ? new Date().toISOString()
        : collection.updatedAt,
    }));
  }

  const libraries = removesLibrary
    ? input.libraries.filter((item) => item.id !== library.id)
    : input.libraries.map((item) => {
        if (item.id !== library.id) return item;
        const activeVersions = remainingVersions.filter((candidate) => candidate.lifecycle !== "archived");
        const nextDefault =
          policy.type === "move-compatible" && replacement
            ? replacement.id
            : (activeVersions.find((candidate) => candidate.id === item.defaultVersionId)?.id ??
              activeVersions[0]?.id ??
              remainingVersions[0]?.id ??
              "");
        return {
          ...item,
          versions: remainingVersions,
          defaultVersionId: nextDefault,
          updatedAt: new Date().toISOString(),
        };
      });
  const nextLibrary =
    libraries.find((item) => item.id === library.id) ??
    libraries.find((item) => item.lifecycle !== "archived") ??
    libraries[0];
  const nextVersion =
    nextLibrary?.versions.find((item) => item.id === nextLibrary.defaultVersionId) ??
    nextLibrary?.versions.find((item) => item.lifecycle !== "archived") ??
    nextLibrary?.versions[0];
  return {
    ok: true,
    libraries,
    collections,
    nextLibraryId: nextLibrary?.id ?? "",
    nextVersionId: nextVersion?.id ?? "",
  };
}

export function purgeProtoLibrary(input: {
  libraries: ProtoLibrary[];
  collections: ApiCollection[];
  libraryId: string;
}): ProtoVersionDeleteResult {
  const library = input.libraries.find((item) => item.id === input.libraryId);
  if (!library) return { ok: false, reason: "Proto schema was not found.", dependencies: [] };
  const _dependencies = input.collections.flatMap((collection) =>
    collection.requests
      .filter((request) => request.grpc?.libraryId === input.libraryId)
      .map((request) => ({
        type: "collection-request" as const,
        collectionId: collection.id,
        collectionName: collection.name,
        requestId: request.id,
        requestName: request.name,
        methodFullName: request.grpc?.methodFullName || request.grpcMethodKey || "",
      })),
  );
  const collections = input.collections.map((collection) => ({
    ...collection,
    requests: collection.requests.map((request) =>
      request.grpc?.libraryId === input.libraryId
        ? {
            ...request,
            grpc: { ...request.grpc, status: "library-missing" as const },
            updatedAt: new Date().toISOString(),
          }
        : request,
    ),
    updatedAt: collection.requests.some((request) => request.grpc?.libraryId === input.libraryId)
      ? new Date().toISOString()
      : collection.updatedAt,
  }));
  const libraries = input.libraries.filter((item) => item.id !== input.libraryId);
  const nextLibrary = libraries.find((item) => item.lifecycle !== "archived") ?? libraries[0];
  const nextVersion =
    nextLibrary?.versions.find((item) => item.id === nextLibrary.defaultVersionId) ??
    nextLibrary?.versions.find((item) => item.lifecycle !== "archived") ??
    nextLibrary?.versions[0];
  return {
    ok: true,
    libraries,
    collections,
    nextLibraryId: nextLibrary?.id ?? "",
    nextVersionId: nextVersion?.id ?? "",
  };
}

/** @deprecated Use purgeProtoVersion with an explicit reference policy. */
export function deleteProtoVersion(input: {
  libraries: ProtoLibrary[];
  collections: ApiCollection[];
  libraryId: string;
  versionId: string;
  replacementVersionId?: string;
}): ProtoVersionDeleteResult {
  return purgeProtoVersion({
    libraries: input.libraries,
    collections: input.collections,
    libraryId: input.libraryId,
    versionId: input.versionId,
    referencePolicy: input.replacementVersionId
      ? { type: "move-compatible", replacementVersionId: input.replacementVersionId }
      : { type: "keep-unresolved" },
  });
}

function methodNamePart(methodFullName: string): string {
  return methodFullName.slice(methodFullName.lastIndexOf("/") + 1).toLowerCase();
}

function serviceNamePart(methodFullName: string): string {
  return methodFullName.slice(0, methodFullName.lastIndexOf("/")).toLowerCase();
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const upper = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = upper;
    }
  }
  return previous[right.length];
}

export function findProtoRepairCandidates(
  libraries: ProtoLibrary[],
  binding: GrpcRequestBinding,
): ProtoRepairCandidate[] {
  const wantedMethod = methodNamePart(binding.methodFullName);
  const wantedService = serviceNamePart(binding.methodFullName);
  const candidates: ProtoRepairCandidate[] = [];

  for (const library of libraries) {
    for (const version of library.versions) {
      let loaded: LoadedProto;
      try {
        loaded = loadProtoFiles(version.files);
      } catch {
        continue;
      }
      for (const method of loaded.methods) {
        const fullName = `${method.serviceName}/${method.methodName}`;
        const methodName = method.methodName.toLowerCase();
        const serviceName = method.serviceName.toLowerCase();
        let score = 0;
        if (fullName === binding.methodFullName) score += 200;
        if (methodName === wantedMethod) score += 80;
        if (serviceName === wantedService) score += 60;
        if (method.requestType === binding.requestType) score += 35;
        if (method.responseType === binding.responseType) score += 35;
        score += Math.max(0, 20 - editDistance(methodName, wantedMethod) * 4);
        candidates.push({
          libraryId: library.id,
          libraryName: library.name,
          versionId: version.id,
          versionLabel: version.version,
          method,
          methodFullName: fullName,
          score,
          exact: fullName === binding.methodFullName,
        });
      }
    }
  }
  return candidates.sort(
    (left, right) => right.score - left.score || left.methodFullName.localeCompare(right.methodFullName),
  );
}

export type ProtoMissingReferenceRestoreResult = {
  collections: ApiCollection[];
  restoredRequestIds: string[];
  reviewRequestIds: string[];
  unresolvedRequestIds: string[];
};

const missingReferenceStatuses = new Set<ProtoReferenceStatus>([
  "library-missing",
  "version-missing",
  "method-missing",
]);

/**
 * Rebinds a missing runtime reference to an imported revision when the RPC
 * identity and either its signature or previous checksum still match.
 */
export function restoreMissingGrpcBinding(input: {
  binding: GrpcRequestBinding;
  library: ProtoLibrary;
  version: ProtoLibraryVersion;
  loaded?: LoadedProto;
}): { binding: GrpcRequestBinding; restored: boolean; needsReview: boolean } {
  const status = input.binding.status ?? "valid";
  if (!missingReferenceStatuses.has(status)) {
    return { binding: input.binding, restored: false, needsReview: false };
  }
  const loaded = input.loaded ?? loadProtoFiles(input.version.files);
  const method = loaded.methods.find(
    (item) => `${item.serviceName}/${item.methodName}` === input.binding.methodFullName,
  );
  if (!method) return { binding: input.binding, restored: false, needsReview: false };

  const nextSignature = computeMethodSignatureHash(method);
  const signatureMatches = !input.binding.methodSignatureHash || input.binding.methodSignatureHash === nextSignature;
  const checksumMatches = !input.binding.schemaChecksum || input.binding.schemaChecksum === input.version.checksum;
  if (!signatureMatches && !checksumMatches) {
    return { binding: input.binding, restored: false, needsReview: false };
  }

  const next = createPinnedGrpcBinding(input.library, input.version, method);
  const needsReview = !signatureMatches;
  return {
    binding: {
      ...next,
      status: needsReview ? "body-review-required" : "valid",
    },
    restored: true,
    needsReview,
  };
}

/** Restores saved collection requests after a deleted schema is imported again. */
export function restoreMissingGrpcReferencesForVersion(input: {
  collections: ApiCollection[];
  library: ProtoLibrary;
  version: ProtoLibraryVersion;
}): ProtoMissingReferenceRestoreResult {
  const loaded = loadProtoFiles(input.version.files);
  const restoredRequestIds: string[] = [];
  const reviewRequestIds: string[] = [];
  const unresolvedRequestIds: string[] = [];
  const now = new Date().toISOString();

  const collections = input.collections.map((collection) => {
    let changed = false;
    const requests = collection.requests.map((request) => {
      if (request.kind !== "grpc" || !request.grpc || !missingReferenceStatuses.has(request.grpc.status ?? "valid")) {
        return request;
      }
      const result = restoreMissingGrpcBinding({
        binding: request.grpc,
        library: input.library,
        version: input.version,
        loaded,
      });
      if (!result.restored) {
        unresolvedRequestIds.push(request.id);
        return request;
      }
      const method = loaded.methods.find(
        (item) => `${item.serviceName}/${item.methodName}` === result.binding.methodFullName,
      );
      if (!method) {
        unresolvedRequestIds.push(request.id);
        return request;
      }
      const bodyError = verifyRequestBody(loaded, method, request.body);
      const needsReview = result.needsReview || Boolean(bodyError);
      changed = true;
      restoredRequestIds.push(request.id);
      if (needsReview) reviewRequestIds.push(request.id);
      return {
        ...request,
        grpcMethodKey: result.binding.methodFullName,
        grpc: {
          ...result.binding,
          status: needsReview ? ("body-review-required" as const) : ("valid" as const),
        },
        updatedAt: now,
      };
    });
    return changed ? { ...collection, requests, updatedAt: now } : collection;
  });

  return { collections, restoredRequestIds, reviewRequestIds, unresolvedRequestIds };
}

export function repairGrpcRequestBinding(input: {
  libraries: ProtoLibrary[];
  collections: ApiCollection[];
  collectionId: string;
  requestId: string;
  candidate: ProtoRepairCandidate;
}): ApiCollection[] {
  const library = input.libraries.find((item) => item.id === input.candidate.libraryId);
  const version = library?.versions.find((item) => item.id === input.candidate.versionId);
  if (!library || !version) throw new Error("Repair target no longer exists.");
  const loaded = loadProtoFiles(version.files);
  const method = loaded.methods.find(
    (item) => `${item.serviceName}/${item.methodName}` === input.candidate.methodFullName,
  );
  if (!method) throw new Error("Repair method no longer exists.");

  return input.collections.map((collection) => {
    if (collection.id !== input.collectionId) return collection;
    return {
      ...collection,
      requests: collection.requests.map((request) => {
        if (request.id !== input.requestId) return request;
        const bodyError = verifyRequestBody(loaded, method, request.body);
        const signatureChanged = Boolean(
          request.grpc?.methodSignatureHash && request.grpc.methodSignatureHash !== computeMethodSignatureHash(method),
        );
        const binding = createPinnedGrpcBinding(library, version, method);
        return {
          ...request,
          grpcMethodKey: binding.methodFullName,
          grpc: {
            ...binding,
            status: (bodyError || signatureChanged ? "body-review-required" : "valid") as ProtoReferenceStatus,
          },
          updatedAt: new Date().toISOString(),
        };
      }),
      updatedAt: new Date().toISOString(),
    };
  });
}

export function resolveGrpcBindingStatus(libraries: ProtoLibrary[], binding: GrpcRequestBinding): ProtoReferenceStatus {
  const library = libraries.find((item) => item.id === binding.libraryId);
  if (!library) return "library-missing";
  const version = library.versions.find((item) => item.id === binding.versionId);
  if (!version) return "version-missing";
  try {
    const loaded = loadProtoFiles(version.files);
    const method = loaded.methods.find((item) => `${item.serviceName}/${item.methodName}` === binding.methodFullName);
    if (!method) return "method-missing";
    if (binding.methodSignatureHash && binding.methodSignatureHash !== computeMethodSignatureHash(method)) {
      return "method-signature-changed";
    }
    if (
      binding.status === "update-available" ||
      binding.status === "compatible-update-available" ||
      binding.status === "body-review-required"
    ) {
      return binding.status;
    }
    return "valid";
  } catch {
    return "version-missing";
  }
}
