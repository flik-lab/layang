import type { LoadedProto, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import type { ProtoRuntimeRegistry } from "@/lib/proto-runtime-registry";
import { readProtoCatalog } from "@/lib/proto-catalog-client";
import type { ProtoLibrary } from "../proto-library/proto-library-types";
import type { MockServerProject } from "../../shared/workbench-types";
import { resolveEffectiveMockProtoSources } from "./mock-proto-sources";

/** Prepare runtime metadata without compiling every attached root in React. */
export async function resolveMockRuntimeSchema(project: MockServerProject, context: {
  protoLibraries: ProtoLibrary[];
  protoRuntimeRegistry: ProtoRuntimeRegistry;
  activeProtoLibraryId: string;
  activeProtoVersionId: string;
  loaded: LoadedProto | null;
  protoFiles: ProtoSourceFile[];
}, signal: AbortSignal) {
  const automatic = resolveEffectiveMockProtoSources(project.protoSources, context.protoLibraries);
  const sources = automatic.length ? automatic : context.activeProtoLibraryId && context.activeProtoVersionId
    ? [{ libraryId: context.activeProtoLibraryId, versionId: context.activeProtoVersionId }] : [];
  const versions = sources.map(source => context.protoRuntimeRegistry.getVersion(source.libraryId, source.versionId))
    .filter(item => item !== null);
  if (!versions.length && context.loaded && context.protoFiles.length)
    return { protoFiles: context.protoFiles, methods: context.loaded.methods, sources };
  const uniqueFiles = new Map<string, ProtoSourceFile>();
  const uniqueMethods = new Map<string, RpcMethodInfo>();
  for (const item of versions) {
    const methods = await readProtoCatalog(item.version, signal);
    for (const file of item.version.files) {
      const prior = uniqueFiles.get(file.name);
      if (prior && prior.text !== file.text)
        throw new Error(`Conflicting Proto source ${file.name}; select compatible versions before starting.`);
      uniqueFiles.set(file.name, file);
    }
    for (const method of methods) {
      const key = `${method.serviceName}/${method.methodName}`;
      if (!uniqueMethods.has(key)) uniqueMethods.set(key, method);
    }
  }
  return { protoFiles: [...uniqueFiles.values()], methods: [...uniqueMethods.values()], sources };
}
