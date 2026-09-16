import type { RpcMethodInfo } from "@/lib/types";
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

/**
 * Builds only serializable catalog inputs. It deliberately does not parse scenario text.
 * Call it from an effect/idle task, never from JSX render.
 */
export function buildMockCatalogSourceSnapshot(
  mockServer: MockServerProject,
  protoRuntimeRegistry: ProtoRuntimeRegistry,
): MockCatalogSourceSnapshot {
  const methods: MockCatalogMethodInput[] = [];
  const scenarioFiles: MockCatalogScenarioFileInput[] = [];

  for (const source of mockServer.protoSources ?? []) {
    const compiled = protoRuntimeRegistry.resolveVersion(source.libraryId, source.versionId);
    if (!compiled) continue;
    for (const method of compiled.loaded.methods as RpcMethodInfo[]) {
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
      const key = `${method.serviceName}/${method.methodName}`;
      const file = mockServer.methodFiles?.[key];
      const catalogScenarios = (file?.catalogScenarios ?? []).filter(
        (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
      );
      scenarioFiles.push({
        methodId,
        revision: file
          ? `${file.updatedAt ?? "unversioned"}:${file.format}:${file.scenarioText.length}:${catalogScenarios.length}`
          : "missing",
        scenarioCount: catalogScenarios.length,
        scenarios: catalogScenarios.map((scenario) => ({
          id: scenario.id,
          label: scenario.description || scenario.id,
          description: scenario.description || "",
        })),
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
