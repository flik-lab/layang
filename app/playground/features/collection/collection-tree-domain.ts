import type { ApiCollection, ApiCollectionRequest, CollectionFolder } from "../../shared/workbench-types";
import { createId } from "../../shared/entity-utils";

export type CollectionTreeNode =
  | { type: "folder"; id: string; folder: CollectionFolder; children: CollectionTreeNode[] }
  | { type: "request"; id: string; request: ApiCollectionRequest };

export type CollectionNodeRef =
  | { type: "folder"; collectionId: string; nodeId: string }
  | { type: "request"; collectionId: string; nodeId: string };

export type CollectionDropTarget = {
  collectionId: string;
  parentId: string | null;
  index?: number;
};

export type CollectionMoveResult =
  | { ok: true; collections: ApiCollection[] }
  | { ok: false; collections: ApiCollection[]; error: string };

function compareOrdered(
  left: { order: number; name: string; type: "folder" | "request" },
  right: { order: number; name: string; type: "folder" | "request" },
): number {
  if (left.order !== right.order) return left.order - right.order;
  if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
  return left.name.localeCompare(right.name);
}

export function buildCollectionTree(collection: ApiCollection): CollectionTreeNode[] {
  const folderByParent = new Map<string | null, CollectionFolder[]>();
  const requestByParent = new Map<string | null, ApiCollectionRequest[]>();
  const folderIds = new Set(collection.folders.map((folder) => folder.id));

  for (const folder of collection.folders) {
    const parentId = folder.parentId && folderIds.has(folder.parentId) ? folder.parentId : null;
    const list = folderByParent.get(parentId) ?? [];
    list.push(folder);
    folderByParent.set(parentId, list);
  }
  for (const request of collection.requests) {
    const parentId = request.parentId && folderIds.has(request.parentId) ? request.parentId : null;
    const list = requestByParent.get(parentId) ?? [];
    list.push(request);
    requestByParent.set(parentId, list);
  }

  const visiting = new Set<string>();
  const build = (parentId: string | null): CollectionTreeNode[] => {
    const items: Array<
      | { type: "folder"; order: number; name: string; folder: CollectionFolder }
      | { type: "request"; order: number; name: string; request: ApiCollectionRequest }
    > = [
      ...(folderByParent.get(parentId) ?? []).map((folder) => ({
        type: "folder" as const,
        order: folder.order,
        name: folder.name,
        folder,
      })),
      ...(requestByParent.get(parentId) ?? []).map((request) => ({
        type: "request" as const,
        order: request.order,
        name: request.name,
        request,
      })),
    ];
    return items.sort(compareOrdered).map((item): CollectionTreeNode => {
      if (item.type === "request") return { type: "request", id: item.request.id, request: item.request };
      if (visiting.has(item.folder.id))
        return { type: "folder", id: item.folder.id, folder: item.folder, children: [] };
      visiting.add(item.folder.id);
      const children = build(item.folder.id);
      visiting.delete(item.folder.id);
      return { type: "folder", id: item.folder.id, folder: item.folder, children };
    });
  };

  return build(null);
}

export function normalizeCollectionHierarchy(collection: ApiCollection): ApiCollection {
  const folderIds = new Set(collection.folders.map((folder) => folder.id));
  const parentById = new Map(collection.folders.map((folder) => [folder.id, folder.parentId]));
  const createsCycle = (folderId: string, parentId: string | null): boolean => {
    const visited = new Set<string>([folderId]);
    let current = parentId;
    while (current) {
      if (visited.has(current)) return true;
      visited.add(current);
      current = parentById.get(current) ?? null;
    }
    return false;
  };
  const folders = collection.folders.map((folder) => {
    const parentId =
      folder.parentId && folderIds.has(folder.parentId) && !createsCycle(folder.id, folder.parentId)
        ? folder.parentId
        : null;
    return { ...folder, collectionId: collection.id, parentId };
  });
  const normalizedFolderIds = new Set(folders.map((folder) => folder.id));
  const requests = collection.requests.map((request) => ({
    ...request,
    collectionId: collection.id,
    parentId: request.parentId && normalizedFolderIds.has(request.parentId) ? request.parentId : null,
  }));
  return normalizeCollectionOrders({ ...collection, folders, requests });
}

export function getCollectionNodeBreadcrumb(collection: ApiCollection, parentId: string | null): string[] {
  const byId = new Map(collection.folders.map((folder) => [folder.id, folder]));
  const output: string[] = [];
  const visited = new Set<string>();
  let currentId = parentId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = byId.get(currentId);
    if (!folder) break;
    output.unshift(folder.name);
    currentId = folder.parentId;
  }
  return output;
}

export function nextCollectionSiblingOrder(collection: ApiCollection, parentId: string | null): number {
  const siblingOrders = [
    ...collection.folders.filter((folder) => folder.parentId === parentId).map((folder) => folder.order),
    ...collection.requests.filter((request) => request.parentId === parentId).map((request) => request.order),
  ];
  return siblingOrders.length ? Math.max(...siblingOrders) + 1 : 0;
}

export function createCollectionFolder(
  collection: ApiCollection,
  parentId: string | null,
  name = "New Folder",
  now = new Date().toISOString(),
): CollectionFolder {
  const validParentId = parentId && collection.folders.some((folder) => folder.id === parentId) ? parentId : null;
  return {
    id: createId(),
    collectionId: collection.id,
    parentId: validParentId,
    name,
    order: nextCollectionSiblingOrder(collection, validParentId),
    createdAt: now,
    updatedAt: now,
  };
}

function descendantFolderIds(collection: ApiCollection, folderId: string): Set<string> {
  const output = new Set<string>();
  const queue = [folderId];
  while (queue.length) {
    const current = queue.shift();
    if (!current || output.has(current)) continue;
    output.add(current);
    for (const folder of collection.folders) {
      if (folder.parentId === current) queue.push(folder.id);
    }
  }
  return output;
}

export function getCollectionFolderRequestIds(collection: ApiCollection, folderId: string): string[] {
  const folderIds = descendantFolderIds(collection, folderId);
  return collection.requests
    .filter((request) => Boolean(request.parentId && folderIds.has(request.parentId)))
    .map((request) => request.id);
}

export function deleteCollectionFolder(
  collection: ApiCollection,
  folderId: string,
): { collection: ApiCollection; removedRequestIds: string[] } {
  const removedFolderIds = descendantFolderIds(collection, folderId);
  const removedRequestIds = getCollectionFolderRequestIds(collection, folderId);
  const now = new Date().toISOString();
  return {
    collection: normalizeCollectionOrders({
      ...collection,
      folders: collection.folders.filter((folder) => !removedFolderIds.has(folder.id)),
      requests: collection.requests.filter((request) => !removedRequestIds.includes(request.id)),
      updatedAt: now,
    }),
    removedRequestIds,
  };
}

function siblingRefs(collection: ApiCollection, parentId: string | null): CollectionNodeRef[] {
  return [
    ...collection.folders
      .filter((folder) => folder.parentId === parentId)
      .map((folder) => ({
        type: "folder" as const,
        collectionId: collection.id,
        nodeId: folder.id,
        order: folder.order,
        name: folder.name,
      })),
    ...collection.requests
      .filter((request) => request.parentId === parentId)
      .map((request) => ({
        type: "request" as const,
        collectionId: collection.id,
        nodeId: request.id,
        order: request.order,
        name: request.name,
      })),
  ]
    .sort(compareOrdered)
    .map(({ type, collectionId, nodeId }) => ({ type, collectionId, nodeId }));
}

function applySiblingOrders(
  collection: ApiCollection,
  parentId: string | null,
  refs: CollectionNodeRef[],
): ApiCollection {
  const orderByKey = new Map(refs.map((ref, index) => [`${ref.type}:${ref.nodeId}`, index]));
  return {
    ...collection,
    folders: collection.folders.map((folder) =>
      folder.parentId === parentId
        ? { ...folder, order: orderByKey.get(`folder:${folder.id}`) ?? folder.order }
        : folder,
    ),
    requests: collection.requests.map((request) =>
      request.parentId === parentId
        ? { ...request, order: orderByKey.get(`request:${request.id}`) ?? request.order }
        : request,
    ),
  };
}

export function normalizeCollectionOrders(collection: ApiCollection): ApiCollection {
  const parentIds = new Set<string | null>([null]);
  for (const folder of collection.folders) parentIds.add(folder.parentId);
  for (const request of collection.requests) parentIds.add(request.parentId);
  let next = collection;
  for (const parentId of parentIds) next = applySiblingOrders(next, parentId, siblingRefs(next, parentId));
  return next;
}

export function moveCollectionNode(
  collections: ApiCollection[],
  source: CollectionNodeRef,
  target: CollectionDropTarget,
): CollectionMoveResult {
  const sourceCollection = collections.find((collection) => collection.id === source.collectionId);
  const targetCollection = collections.find((collection) => collection.id === target.collectionId);
  if (!sourceCollection || !targetCollection) {
    return { ok: false, collections, error: "Source or target collection was not found." };
  }
  const targetParentValid =
    target.parentId === null || targetCollection.folders.some((folder) => folder.id === target.parentId);
  if (!targetParentValid) return { ok: false, collections, error: "Target folder was not found." };

  const now = new Date().toISOString();
  let sourceNext = sourceCollection;
  let targetNext = targetCollection;
  let movedRef: CollectionNodeRef;

  if (source.type === "request") {
    const request = sourceCollection.requests.find((candidate) => candidate.id === source.nodeId);
    if (!request) return { ok: false, collections, error: "Request was not found." };
    sourceNext = {
      ...sourceCollection,
      requests: sourceCollection.requests.filter((candidate) => candidate.id !== source.nodeId),
      updatedAt: now,
    };
    const movedRequest: ApiCollectionRequest = {
      ...request,
      collectionId: targetCollection.id,
      parentId: target.parentId,
      order: 0,
      updatedAt: now,
    };
    targetNext = {
      ...targetCollection,
      requests: [...targetCollection.requests.filter((candidate) => candidate.id !== source.nodeId), movedRequest],
      updatedAt: now,
    };
    movedRef = { type: "request", collectionId: targetCollection.id, nodeId: source.nodeId };
  } else {
    const folder = sourceCollection.folders.find((candidate) => candidate.id === source.nodeId);
    if (!folder) return { ok: false, collections, error: "Folder was not found." };
    const movedFolderIds = descendantFolderIds(sourceCollection, source.nodeId);
    if (source.collectionId === target.collectionId && target.parentId && movedFolderIds.has(target.parentId)) {
      return { ok: false, collections, error: "A folder cannot be moved inside itself or one of its descendants." };
    }
    const movedFolders = sourceCollection.folders
      .filter((candidate) => movedFolderIds.has(candidate.id))
      .map((candidate) => ({
        ...candidate,
        collectionId: targetCollection.id,
        parentId: candidate.id === source.nodeId ? target.parentId : candidate.parentId,
        order: candidate.id === source.nodeId ? 0 : candidate.order,
        updatedAt: now,
      }));
    const movedRequests = sourceCollection.requests
      .filter((request) => Boolean(request.parentId && movedFolderIds.has(request.parentId)))
      .map((request) => ({ ...request, collectionId: targetCollection.id, updatedAt: now }));
    sourceNext = {
      ...sourceCollection,
      folders: sourceCollection.folders.filter((candidate) => !movedFolderIds.has(candidate.id)),
      requests: sourceCollection.requests.filter(
        (request) => !(request.parentId && movedFolderIds.has(request.parentId)),
      ),
      updatedAt: now,
    };
    targetNext = {
      ...targetCollection,
      folders: [...targetCollection.folders.filter((candidate) => !movedFolderIds.has(candidate.id)), ...movedFolders],
      requests: [
        ...targetCollection.requests.filter((request) => !movedRequests.some((moved) => moved.id === request.id)),
        ...movedRequests,
      ],
      updatedAt: now,
    };
    movedRef = { type: "folder", collectionId: targetCollection.id, nodeId: source.nodeId };
  }

  sourceNext = normalizeCollectionOrders(sourceNext);
  const targetSiblings = siblingRefs(targetNext, target.parentId).filter(
    (ref) => !(ref.type === movedRef.type && ref.nodeId === movedRef.nodeId),
  );
  const insertionIndex = Math.max(0, Math.min(target.index ?? targetSiblings.length, targetSiblings.length));
  targetSiblings.splice(insertionIndex, 0, movedRef);
  targetNext = normalizeCollectionOrders(applySiblingOrders(targetNext, target.parentId, targetSiblings));

  const nextCollections = collections.map((collection) => {
    if (source.collectionId === target.collectionId && collection.id === source.collectionId) return targetNext;
    if (collection.id === source.collectionId) return sourceNext;
    if (collection.id === target.collectionId) return targetNext;
    return collection;
  });
  return { ok: true, collections: nextCollections };
}
