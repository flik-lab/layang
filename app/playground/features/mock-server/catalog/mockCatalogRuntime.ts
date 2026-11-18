import { readProtoCatalog } from "@/lib/proto-catalog-client";
import type { ProtoRuntimeRegistry } from "@/lib/proto-runtime-registry";
import type { MockServerProject } from "../../../shared/workbench-types";
import type { MockCatalogMethodInput, MockCatalogScenarioFileInput } from "./mockCatalog.types";

export function mockCatalogMethodId(
  libraryId: string,
  versionId: string,
  serviceName: string,
  methodName: string,
): string {
  return `${libraryId}|${versionId}|${serviceName}|${methodName}`;
}

export type MockCatalogSourceSnapshot = {
  methods: MockCatalogMethodInput[];
  scenarioFiles: MockCatalogScenarioFileInput[];
};

/** Bounded, metadata-only fingerprint; never stringify full response bodies. */
export function mockCatalogMetadataRevision(scenarios: Array<{id:string;label:string;description:string}>): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (const item of scenarios) {
    for (const part of [item.id, item.label, item.description]) {
      for (let i = 0; i < part.length; i += 1) {
        const code = part.charCodeAt(i);
        a = Math.imul(a ^ code, 0x01000193);
        b = Math.imul(b ^ code, 0x85ebca6b);
      }
      a = Math.imul(a ^ 0xffff, 0x01000193);
      b = Math.imul(b ^ part.length, 0xc2b2ae35);
    }
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Builds only serializable catalog inputs. It deliberately does not parse scenario text.
 * Call it from an effect/idle task, never from JSX render.
 */
export async function buildMockCatalogSourceSnapshot(
  mockServer: MockServerProject,
  protoRuntimeRegistry: ProtoRuntimeRegistry,
  signal: AbortSignal,
): Promise<MockCatalogSourceSnapshot> {
  const methods: MockCatalogMethodInput[] = [];
  const scenarioFiles: MockCatalogScenarioFileInput[] = [];

  for (const source of mockServer.protoSources ?? []) {
    const compiled = protoRuntimeRegistry.getVersion(source.libraryId, source.versionId);
    if (!compiled) continue;
    const catalogMethods = await readProtoCatalog(compiled.version, signal);
    for (const method of catalogMethods) {
      const methodId = mockCatalogMethodId(
        source.libraryId,
        source.versionId,
        method.serviceName,
        method.methodName,
      );
      methods.push({
        methodId,
        libraryId: source.libraryId,
        versionId: source.versionId,
        libraryName: compiled.library.name,
        versionLabel: compiled.version.version,
        serviceName: method.serviceName,
        methodName: method.methodName,
        requestType: method.requestType,
        responseType: method.responseType,
        requestStream: method.requestStream,
        responseStream: method.responseStream,
      });
      scenarioFiles.push({
        methodId,
        revision: "missing",
        scenarioCount: 0,
        scenarios: [],
      });
    }
  }

  methods.sort((a, b) =>
    `${a.libraryName}/${a.serviceName}/${a.methodName}`.localeCompare(
      `${b.libraryName}/${b.serviceName}/${b.methodName}`,
    ),
  );
  return { methods, scenarioFiles };
}
