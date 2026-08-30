import type { ApiCollection } from "../../shared/workbench-types";

export const NEW_SCHEMA_COLLECTION_TARGET = "__layang_new_schema_collection__";

export function uniqueSchemaCollectionName(schemaName: string, collections: ApiCollection[]): string {
  const base = schemaName.trim() || "gRPC Schema";
  const names = new Set(collections.map((collection) => collection.name.trim().toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let index = 2;
  let candidate = `${base} ${index}`;
  while (names.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${base} ${index}`;
  }
  return candidate;
}

export function preferredSchemaCollectionId(
  schemaName: string,
  collections: ApiCollection[],
  contextualCollectionId = "",
): string {
  const matching = collections.find(
    (collection) => collection.name.trim().toLowerCase() === schemaName.trim().toLowerCase(),
  );
  if (matching) return matching.id;
  if (contextualCollectionId && collections.some((collection) => collection.id === contextualCollectionId)) {
    return contextualCollectionId;
  }
  return collections[0]?.id ?? NEW_SCHEMA_COLLECTION_TARGET;
}
