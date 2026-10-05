import type { MockProtoSource } from "../../shared/workbench-types";
import type { ProtoLibrary } from "../proto-library/proto-library-types";

/**
 * Mocking automatically sees every active workspace Proto schema.
 * Explicit mock sources still act as revision pins for their library.
 */
export function resolveEffectiveMockProtoSources(
  configuredSources: MockProtoSource[] | null | undefined,
  protoLibraries: ProtoLibrary[] | null | undefined,
): MockProtoSource[] {
  const byLibrary = new Map<string, MockProtoSource>();

  for (const source of configuredSources ?? []) {
    if (!source?.libraryId || !source?.versionId) continue;
    if (!byLibrary.has(source.libraryId)) byLibrary.set(source.libraryId, source);
  }

  for (const library of protoLibraries ?? []) {
    if (!library?.id || library.lifecycle === "archived" || byLibrary.has(library.id)) continue;
    const activeVersions = (library.versions ?? []).filter((version) => version.lifecycle !== "archived");
    const version =
      activeVersions.find((candidate) => candidate.id === library.defaultVersionId) ??
      activeVersions[0];
    if (!version?.id) continue;
    byLibrary.set(library.id, { libraryId: library.id, versionId: version.id });
  }

  return [...byLibrary.values()];
}
