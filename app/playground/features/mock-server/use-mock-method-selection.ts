import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { LoadedProto } from "@/lib/types";
import { findLoadedProtoMethod, type ProtoRuntimeRegistry } from "@/lib/proto-runtime-registry";
import type { MockServerProject } from "../../shared/workbench-types";
import { methodKey } from "../../shared/rpc-method-utils";
import { grpcMockOverviewMethodKey } from "../../shared/workbench-constants";

/** Resolves the selected gRPC method without touching scenario response bodies. */
export function useMockMethodSelection({
  activeProtoLibraryId,
  activeProtoVersionId,
  loaded,
  mockSelectedMethodKey,
  selectedMethodKey,
  mockServer,
  protoRuntimeRegistry,
  setMockSelectedMethodKey,
}: {
  activeProtoLibraryId: string;
  activeProtoVersionId: string;
  loaded: LoadedProto | null;
  mockSelectedMethodKey: string;
  selectedMethodKey: string;
  mockServer: MockServerProject;
  protoRuntimeRegistry: ProtoRuntimeRegistry;
  setMockSelectedMethodKey: Dispatch<SetStateAction<string>>;
}) {
  const mockSelectedMethod = useMemo(() => {
    const explicitKey = mockSelectedMethodKey.trim();
    if (explicitKey === grpcMockOverviewMethodKey) return null;

    const activeCompiled =
      activeProtoLibraryId && activeProtoVersionId
        ? protoRuntimeRegistry.resolveVersion(activeProtoLibraryId, activeProtoVersionId)
        : null;

    if (explicitKey) {
      const activeRevisionMatch = findLoadedProtoMethod(activeCompiled?.loaded, explicitKey);
      if (activeRevisionMatch) return activeRevisionMatch;

      const binding = mockServer.methodBindings?.[explicitKey];
      if (binding) {
        const boundCompiled = protoRuntimeRegistry.resolveVersion(binding.libraryId, binding.versionId);
        const boundMatch = findLoadedProtoMethod(boundCompiled?.loaded, explicitKey);
        if (boundMatch) return boundMatch;
      }

      for (const source of mockServer.protoSources ?? []) {
        const compiled = protoRuntimeRegistry.resolveVersion(source.libraryId, source.versionId);
        const attachedMatch = findLoadedProtoMethod(compiled?.loaded, explicitKey);
        if (attachedMatch) return attachedMatch;
      }

      const loadedMatch = findLoadedProtoMethod(loaded, explicitKey);
      if (loadedMatch) return loadedMatch;
    }

    const selectedMatch = findLoadedProtoMethod(activeCompiled?.loaded, selectedMethodKey);
    if (selectedMatch) return selectedMatch;
    if (activeCompiled?.loaded.methods[0]) return activeCompiled.loaded.methods[0];

    const loadedSelectedMatch = findLoadedProtoMethod(loaded, selectedMethodKey);
    if (loadedSelectedMatch) return loadedSelectedMatch;
    if (loaded?.methods[0]) return loaded.methods[0];

    for (const source of mockServer.protoSources ?? []) {
      const compiled = protoRuntimeRegistry.resolveVersion(source.libraryId, source.versionId);
      if (compiled?.loaded.methods[0]) return compiled.loaded.methods[0];
    }
    return null;
  }, [
    activeProtoLibraryId,
    activeProtoVersionId,
    loaded,
    mockSelectedMethodKey,
    selectedMethodKey,
    mockServer.methodBindings,
    mockServer.protoSources,
    protoRuntimeRegistry,
  ]);

  useEffect(() => {
    if (mockSelectedMethodKey || !mockSelectedMethod) return;
    setMockSelectedMethodKey(methodKey(mockSelectedMethod));
  }, [mockSelectedMethod, mockSelectedMethodKey]);

  return mockSelectedMethod;
}
