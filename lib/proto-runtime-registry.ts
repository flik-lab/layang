import { loadProtoFiles } from "./proto-loader";
import type { LoadedProto, RpcMethodInfo } from "./types";
import type {
  GrpcRequestBinding,
  ProtoLibrary,
  ProtoLibraryVersion,
  ResolvedProtoMethod,
} from "../app/playground/features/proto-library/proto-library-types";

export type CompiledProtoVersion = {
  library: ProtoLibrary;
  version: ProtoLibraryVersion;
  loaded: LoadedProto;
};

export class ProtoRuntimeRegistry {
  private readonly libraries = new Map<string, ProtoLibrary>();
  private readonly compiledByVersionId = new Map<string, CompiledProtoVersion>();

  constructor(libraries: ProtoLibrary[]) {
    for (const library of libraries) this.libraries.set(library.id, library);
  }

  listLibraries(): ProtoLibrary[] {
    return [...this.libraries.values()];
  }

  resolveVersion(libraryId: string, versionId: string): CompiledProtoVersion | null {
    const cached = this.compiledByVersionId.get(versionId);
    if (cached && cached.library.id === libraryId) return cached;

    const library = this.libraries.get(libraryId);
    const version = library?.versions.find((item) => item.id === versionId);
    if (!library || !version) return null;

    const compiled: CompiledProtoVersion = {
      library,
      version,
      loaded: loadProtoFiles(version.files),
    };
    this.compiledByVersionId.set(versionId, compiled);
    return compiled;
  }

  listMethodKeys(): string[] {
    const keys = new Set<string>();
    for (const library of this.libraries.values()) {
      for (const version of library.versions) {
        try {
          const compiled = this.resolveVersion(library.id, version.id);
          for (const method of compiled?.loaded.methods ?? []) {
            keys.add(`${method.serviceName}/${method.methodName}`);
          }
        } catch {
          // Invalid historical versions remain isolated and must not break other versions.
        }
      }
    }
    return [...keys].sort();
  }

  resolveMethod(binding: GrpcRequestBinding): ResolvedProtoMethod | null {
    const compiled = this.resolveVersion(binding.libraryId, binding.versionId);
    if (!compiled) return null;
    const method = compiled.loaded.methods.find(
      (item) => `${item.serviceName}/${item.methodName}` === binding.methodFullName,
    );
    return method ? { library: compiled.library, version: compiled.version, method } : null;
  }

  findMethod(libraryId: string, versionId: string, methodFullName: string): RpcMethodInfo | null {
    const compiled = this.resolveVersion(libraryId, versionId);
    return compiled?.loaded.methods.find((item) => `${item.serviceName}/${item.methodName}` === methodFullName) ?? null;
  }
}
