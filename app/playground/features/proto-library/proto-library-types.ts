import type { ProtoSourceFile, RpcMethodInfo } from "@/lib/types";

export type ProtoVersionPolicy = "pinned" | "latest-compatible";
export type ProtoLifecycle = "active" | "archived";

export type ProtoReferenceStatus =
  | "valid"
  | "update-available"
  | "compatible-update-available"
  | "body-review-required"
  | "method-signature-changed"
  | "method-missing"
  | "version-missing"
  | "library-missing"
  | "ambiguous-migration";

export type ProtoLibrarySource =
  | { type: "local-files" }
  | { type: "directory"; path?: string; name?: string; localRef?: string }
  | { type: "reflection"; endpoint: string }
  | { type: "git"; repository: string; revision: string };

export type ProtoLibraryVersion = {
  id: string;
  libraryId: string;
  version: string;
  lifecycle: ProtoLifecycle;
  archivedAt?: string;
  checksum: string;
  files: ProtoSourceFile[];
  previousVersionId?: string;
  source: ProtoLibrarySource;
  importedAt: string;
  createdAt: string;
  storedChecksum?: string;
  integrity?: {
    status: "valid" | "externally-modified";
    actualChecksum: string;
    storedChecksum?: string;
  };
  extensions?: Record<string, unknown>;
};

export type ProtoLibrary = {
  id: string;
  /** Proto libraries are workspace-global and may be referenced by any collection. */
  name: string;
  description?: string;
  lifecycle: ProtoLifecycle;
  archivedAt?: string;
  defaultVersionId: string;
  versions: ProtoLibraryVersion[];
  createdAt: string;
  updatedAt: string;
  extensions?: Record<string, unknown>;
};

export type GrpcRequestBinding = {
  libraryId: string;
  versionId: string;
  methodFullName: string;
  requestType: string;
  responseType: string;
  methodSignatureHash: string;
  schemaChecksum: string;
  versionPolicy: ProtoVersionPolicy;
  status?: ProtoReferenceStatus;
};

export type ResolvedProtoMethod = {
  library: ProtoLibrary;
  version: ProtoLibraryVersion;
  method: RpcMethodInfo;
};
