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

const MAX_COMPILED_PROTO_CACHE = 24;
const compiledProtoCache = new Map<string, LoadedProto>();
// Weak ownership: method lookup must not keep an evicted protobuf root alive.
const methodIndexes = new WeakMap<LoadedProto, Map<string, RpcMethodInfo>>();

export function findLoadedProtoMethod(loaded: LoadedProto | null | undefined, key: string): RpcMethodInfo | null {
  if (!loaded) return null;
  let index = methodIndexes.get(loaded);
  if (!index) {
    index = new Map(loaded.methods.map(method => [`${method.serviceName}/${method.methodName}`, method]));
    methodIndexes.set(loaded, index);
  }
  return index.get(key) ?? null;
}

function getCachedLoadedProto(version: ProtoLibraryVersion): LoadedProto {
  const cacheKey = version.checksum || version.id;
  const cached = compiledProtoCache.get(cacheKey);
  if (cached) {
    compiledProtoCache.delete(cacheKey);
    compiledProtoCache.set(cacheKey, cached);
    return cached;
  }

  const loaded = loadProtoFiles(version.files);
  compiledProtoCache.set(cacheKey, loaded);
  while (compiledProtoCache.size > MAX_COMPILED_PROTO_CACHE) {
    const oldestKey = compiledProtoCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    compiledProtoCache.delete(oldestKey);
  }
  return loaded;
}

export class ProtoRuntimeRegistry {
  private readonly libraries = new Map<string, ProtoLibrary>();
  private readonly compiledByVersionId = new Map<string, CompiledProtoVersion>();

  constructor(libraries: ProtoLibrary[]) {
    for (const library of libraries) this.libraries.set(library.id, library);
  }

  listLibraries(): ProtoLibrary[] {
    return [...this.libraries.values()];
  }

  getVersion(libraryId: string, versionId: string) {
    const library = this.libraries.get(libraryId);
    const version = library?.versions.find(item => item.id === versionId);
    return library && version ? { library, version } : null;
  }

  resolveVersion(libraryId: string, versionId: string): CompiledProtoVersion | null {
    const key = JSON.stringify([libraryId, versionId]);
    const cached = this.compiledByVersionId.get(key);
    if (cached) {
      this.compiledByVersionId.delete(key);
      this.compiledByVersionId.set(key, cached);
      return cached;
    }

    const library = this.libraries.get(libraryId);
    const version = library?.versions.find((item) => item.id === versionId);
    if (!library || !version) return null;

    const compiled: CompiledProtoVersion = {
      library,
      version,
      loaded: getCachedLoadedProto(version),
    };
    this.compiledByVersionId.set(key, compiled);
    // The registry previously retained every root even after the shared LRU
    // evicted it. Bound both owners when browsing large proto libraries.
    while (this.compiledByVersionId.size > MAX_COMPILED_PROTO_CACHE) {
      const oldest = this.compiledByVersionId.keys().next().value;
      if (oldest === undefined) break;
      this.compiledByVersionId.delete(oldest);
    }
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
    const method = findLoadedProtoMethod(compiled.loaded, binding.methodFullName);
    return method ? { library: compiled.library, version: compiled.version, method } : null;
  }

  findMethod(libraryId: string, versionId: string, methodFullName: string): RpcMethodInfo | null {
    const compiled = this.resolveVersion(libraryId, versionId);
    return findLoadedProtoMethod(compiled?.loaded, methodFullName);
  }
}
