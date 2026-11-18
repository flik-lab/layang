import { createId } from "../../shared/entity-utils";
import type { MetadataPair } from "@/lib/types";
import type { ApiCollectionRequest, SavedExample, SavedRequest } from "../../shared/workbench-types";

type LinkedRequest = ApiCollectionRequest & { collectionName?: string };

/*
 * On a saved collection request, "Saved requests" are that request's examples: saving stores the
 * editor's input in <request>.examples/<name>.example.yml, next to the request, so the CLI runs it
 * (`layang example:run`) and documentation lists it. Loose tabs keep the workspace-wide
 * saved-requests/ presets.
 */

/** Presents a request's examples in the Saved requests dropdown. */
export function examplesAsSavedRequests(examples: SavedExample[], request: LinkedRequest): SavedRequest[] {
  const method = request.grpc?.methodFullName ?? request.grpcMethodKey;
  return examples.map((example) => ({
    id: example.id,
    name: example.name,
    kind: request.kind,
    snapshot: {
      kind: request.kind,
      requestJson: example.requestJson,
      metadata: example.metadata,
      transportMode: request.kind === "rest" ? "rest" : request.kind === "websocket" ? "websocket" : "grpc-web",
      baseUrl: request.url,
      nativeTarget: "",
      environmentKey: "default",
      assertionJson: example.assertions ?? "",
      grpc: request.grpc,
      grpcMethodKey: method,
    },
    createdAt: example.createdAt,
    updatedAt: example.updatedAt ?? example.createdAt,
  }));
}

export type EditorInput = { requestJson: string; metadata: MetadataPair[]; assertionJson?: string };

/**
 * Saves the editor input as an example of `request`: a new one, or `existingId` overwritten.
 * Expectations, mock link and notes of an overwritten example are kept.
 */
export function saveEditorAsExample(
  examples: SavedExample[],
  request: LinkedRequest,
  input: EditorInput,
  name: string,
  existingId?: string,
): { examples: SavedExample[]; example: SavedExample } {
  const now = new Date().toISOString();
  const existing = existingId ? examples.find((item) => item.id === existingId) : undefined;
  const [serviceName, methodName] = splitMethod(request);
  const example: SavedExample = {
    ...(existing ?? {
      expectedJson: "{}",
      expectedStatus: "",
      expectedTrailers: [],
      tags: [],
      enabled: true,
      createdAt: now,
    }),
    id: existing?.id ?? createId(),
    name,
    requestId: request.id,
    requestRef: { ...(existing?.requestRef ?? {}), id: request.id },
    serviceName,
    methodName,
    requestJson: input.requestJson,
    metadata: input.metadata.map((item) => ({ ...item })),
    assertions: input.assertionJson?.trim() ? input.assertionJson : (existing?.assertions ?? ""),
    updatedAt: now,
  } as SavedExample;
  const next = existing
    ? examples.map((item) => (item.id === existing.id ? example : item))
    : [example, ...examples];
  return { examples: next, example };
}

function splitMethod(request: LinkedRequest): [string, string] {
  if (request.kind === "grpc") {
    const full = request.grpc?.methodFullName ?? request.grpcMethodKey ?? "";
    const index = full.lastIndexOf("/");
    if (index > 0) return [full.slice(0, index), full.slice(index + 1)];
  }
  return [request.collectionName ?? "Collection", request.name];
}
