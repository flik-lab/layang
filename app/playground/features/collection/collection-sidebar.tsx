"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@/components/shadcn/compat";
import { loadProtoFiles } from "@/lib/proto-loader";
import { Add, Api, Folder, MoreHoriz, Stream, Terminal } from "@/components/shadcn/icons";
import { MethodStatusIndicator } from "../../shared/components/method-status-indicator";
import { SearchHighlightedText } from "../../shared/components/search-highlight";
import type {
  ApiCollection,
  ApiCollectionRequest,
  CollectionFolder,
  RequestSession,
} from "../../shared/workbench-types";
import type { ProtoLibrary } from "../proto-library/proto-library-types";
import { findProtoRepairCandidates, type ProtoRepairCandidate } from "../proto-library/proto-version-management";
import {
  buildCollectionTree,
  type CollectionDropTarget,
  type CollectionNodeRef,
  type CollectionTreeNode,
} from "./collection-tree-domain";

type CollectionContextTarget =
  | { type: "collection"; collection: ApiCollection }
  | { type: "folder"; collection: ApiCollection; folder: CollectionFolder }
  | { type: "request"; collection: ApiCollection; request: ApiCollectionRequest };

type RenameTarget =
  | { type: "collection"; collectionId: string; nodeId: string; value: string }
  | { type: "folder"; collectionId: string; nodeId: string; value: string }
  | { type: "request"; collectionId: string; nodeId: string; value: string };

type DeleteTarget = CollectionContextTarget;

type QuickAddTarget = { collection: ApiCollection; parentId: string | null };

type FilteredCollection = {
  collection: ApiCollection;
  tree: CollectionTreeNode[];
};

const labelSx = { fontSize: 12, lineHeight: "16px" } as const;
const rowSx = {
  minHeight: 28,
  px: 0.55,
  py: 0.25,
  borderRadius: 1,
  "&:hover": { bgcolor: "action.hover" },
} as const;
const TREE_BASE_PADDING_PX = 4;
const TREE_INDENT_PX = 8;
const MAX_VISUAL_DEPTH = 4;

const brokenGrpcReferenceStatuses = new Set([
  "method-signature-changed",
  "method-missing",
  "version-missing",
  "library-missing",
  "ambiguous-migration",
]);

function grpcRequestStatusCopy(status: string): { title: string; detail: string; error: boolean; actionable: boolean } {
  switch (status) {
    case "method-signature-changed":
      return {
        title: "Method changed",
        detail: "The RPC signature no longer matches this request. Choose a compatible method or revision.",
        error: true,
        actionable: false,
      };
    case "method-missing":
      return {
        title: "Method unavailable",
        detail: "The selected Proto revision no longer contains this RPC method.",
        error: true,
        actionable: false,
      };
    case "version-missing":
      return {
        title: "Revision unavailable",
        detail: "The Proto revision referenced by this request is no longer attached.",
        error: true,
        actionable: false,
      };
    case "library-missing":
      return {
        title: "Proto unavailable",
        detail: "The Proto schema referenced by this request is no longer available.",
        error: true,
        actionable: false,
      };
    case "ambiguous-migration":
      return {
        title: "Method needs review",
        detail: "More than one compatible RPC method was found. Select the intended method manually.",
        error: true,
        actionable: false,
      };
    case "body-review-required":
      return {
        title: "Request body needs review",
        detail: "The method binding was updated, but the request body may need manual adjustment.",
        error: false,
        actionable: false,
      };
    case "update-available":
      return {
        title: "Newer revision available",
        detail: "A newer Proto revision is available for this request. Select the indicator to review it.",
        error: false,
        actionable: true,
      };
    case "compatible-update-available":
      return {
        title: "Compatible revision available",
        detail: "A compatible Proto revision is available. Select the indicator to update this request.",
        error: false,
        actionable: true,
      };
    default:
      return {
        title: "Method needs attention",
        detail: status.replaceAll("-", " "),
        error: brokenGrpcReferenceStatuses.has(status),
        actionable: false,
      };
  }
}

function treeOffset(depth: number): string {
  return `${TREE_BASE_PADDING_PX + Math.min(depth + 1, MAX_VISUAL_DEPTH) * TREE_INDENT_PX}px`;
}

const itemButtonSx = {
  minHeight: 28,
  borderRadius: 1,
  mb: "4px",
  px: 0.45,
  py: 0.2,
  gap: "4px",
  "&.Mui-selected": { bgcolor: "action.selected" },
} as const;

function SmallEmpty({ body }: { body: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, textAlign: "center" }}>
      <Typography variant="caption" color="text.secondary">
        {body}
      </Typography>
    </Paper>
  );
}

function requestMatches(request: ApiCollectionRequest, query: string): boolean {
  return [
    request.name,
    request.kind,
    request.method ?? "",
    request.url,
    request.grpcMethodKey ?? "",
    request.grpc?.methodFullName ?? "",
  ]
    .join("/")
    .toLowerCase()
    .includes(query);
}

function filterTree(nodes: CollectionTreeNode[], query: string): CollectionTreeNode[] {
  return nodes.flatMap((node): CollectionTreeNode[] => {
    if (node.type === "request") return requestMatches(node.request, query) ? [node] : [];
    const children = filterTree(node.children, query);
    if (node.folder.name.toLowerCase().includes(query) || children.length > 0) {
      return [{ ...node, children: node.folder.name.toLowerCase().includes(query) ? node.children : children }];
    }
    return [];
  });
}

/** Filters collection, folder, and request fields while preserving tree breadcrumbs. */
export function filterCollections(collections: ApiCollection[], filterQuery: string): FilteredCollection[] {
  const query = filterQuery.trim().toLowerCase();
  return collections.flatMap((collection) => {
    const tree = buildCollectionTree(collection);
    if (!query || collection.name.toLowerCase().includes(query)) return [{ collection, tree }];
    const filteredTree = filterTree(tree, query);
    return filteredTree.length ? [{ collection, tree: filteredTree }] : [];
  });
}

function dragPayload(event: ReactDragEvent<HTMLElement>, source: CollectionNodeRef) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-layang-collection-node", JSON.stringify(source));
  event.dataTransfer.setData("text/plain", `${source.type}:${source.nodeId}`);
}

function readDragPayload(event: ReactDragEvent<HTMLElement>): CollectionNodeRef | null {
  try {
    const raw = event.dataTransfer.getData("application/x-layang-collection-node");
    const parsed = JSON.parse(raw) as Partial<CollectionNodeRef>;
    if (
      (parsed.type === "folder" || parsed.type === "request") &&
      typeof parsed.collectionId === "string" &&
      typeof parsed.nodeId === "string"
    ) {
      return parsed as CollectionNodeRef;
    }
  } catch {
    // Ignore foreign drag payloads.
  }
  return null;
}

/** Renders a nested, reorderable collection tree without mixing proto registry nodes into it. */
export function CollectionSidebar({
  collections,
  protoLibraries,
  filterQuery,
  selectedCollectionRequestId,
  requestSessions = [],
  onSelectCollectionRequest,
  onAddCollectionRequest,
  onCreateFolder,
  onRenameCollection,
  onRemoveCollection,
  onRenameFolder,
  onRemoveFolder,
  onRenameCollectionRequest,
  onRemoveCollectionRequest,
  onMoveNode,
  onRepairGrpcRequest,
}: {
  collections: ApiCollection[];
  protoLibraries: ProtoLibrary[];
  filterQuery: string;
  selectedCollectionRequestId?: string;
  requestSessions?: RequestSession[];
  onSelectCollectionRequest: (collection: ApiCollection, request: ApiCollectionRequest) => void;
  onAddCollectionRequest: (
    collectionId: string,
    kind?: "websocket" | "rest" | "grpc",
    parentId?: string | null,
  ) => void;
  onCreateFolder: (collectionId: string, parentId?: string | null) => CollectionFolder | null;
  onRenameCollection: (collectionId: string, nextName: string) => void;
  onRemoveCollection: (collectionId: string) => void;
  onRenameFolder: (collectionId: string, folderId: string, nextName: string) => void;
  onRemoveFolder: (collectionId: string, folderId: string) => void;
  onRenameCollectionRequest: (collectionId: string, requestId: string, nextName: string) => void;
  onRemoveCollectionRequest: (collectionId: string, requestId: string) => void;
  onMoveNode: (source: CollectionNodeRef, target: CollectionDropTarget) => boolean;
  onRepairGrpcRequest: (collectionId: string, requestId: string, candidate: ProtoRepairCandidate) => void;
}) {
  const filteredCollections = useMemo(() => filterCollections(collections, filterQuery), [collections, filterQuery]);
  const requestTabState = useMemo(() => {
    const state = new Map<string, { open: boolean; running: boolean }>();
    for (const session of requestSessions) {
      const requestId = session.sourceRequestId ?? (session.requestKind ? session.methodKey : "");
      if (!requestId) continue;
      const current = state.get(requestId) ?? { open: false, running: false };
      state.set(requestId, { open: true, running: current.running || session.running });
    }
    return state;
  }, [requestSessions]);

  const grpcMethodPresentation = useMemo(() => {
    const result = new Map<string, "Unary" | "Stream">();
    for (const library of protoLibraries) {
      for (const version of library.versions) {
        try {
          for (const method of loadProtoFiles(version.files).methods) {
            const fullName = `${method.serviceName}/${method.methodName}`;
            result.set(
              `${library.id}:${version.id}:${fullName}`,
              method.requestStream || method.responseStream ? "Stream" : "Unary",
            );
          }
        } catch {
          // Invalid or incomplete revisions are surfaced through the request status chip.
        }
      }
    }
    return result;
  }, [protoLibraries]);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = JSON.parse(window.localStorage.getItem("layang:collection-tree-expanded") ?? "[]");
      return Array.isArray(stored) ? new Set(stored.filter((value) => typeof value === "string")) : new Set();
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    window.localStorage.setItem("layang:collection-tree-expanded", JSON.stringify([...expandedNodeIds]));
  }, [expandedNodeIds]);
  useEffect(() => {
    const activeCollection = collections.find((collection) =>
      collection.requests.some((request) => request.id === selectedCollectionRequestId),
    );
    if (!activeCollection) {
      if (collections[0] && expandedNodeIds.size === 0)
        setExpandedNodeIds(new Set([`collection:${collections[0].id}`]));
      return;
    }
    const request = activeCollection.requests.find((item) => item.id === selectedCollectionRequestId);
    const nextKeys = [`collection:${activeCollection.id}`];
    let folderId = request?.parentId ?? null;
    while (folderId) {
      nextKeys.push(`folder:${folderId}`);
      folderId = activeCollection.folders.find((folder) => folder.id === folderId)?.parentId ?? null;
    }
    setExpandedNodeIds((current) => new Set([...current, ...nextKeys]));
  }, [collections, selectedCollectionRequestId]);
  const knownCollectionIdsRef = useRef(new Set(collections.map((collection) => collection.id)));
  const [contextAnchor, setContextAnchor] = useState<HTMLElement | null>(null);
  const [contextTarget, setContextTarget] = useState<CollectionContextTarget | null>(null);
  const [quickAddAnchor, setQuickAddAnchor] = useState<HTMLElement | null>(null);
  const [quickAddTarget, setQuickAddTarget] = useState<QuickAddTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [dropKey, setDropKey] = useState("");
  const [changeTarget, setChangeTarget] = useState<{
    collection: ApiCollection;
    request: ApiCollectionRequest;
  } | null>(null);
  const [changeLibraryId, setChangeLibraryId] = useState("");
  const [changeVersionId, setChangeVersionId] = useState("");
  const [changeServiceName, setChangeServiceName] = useState("");
  const [changeMethodFullName, setChangeMethodFullName] = useState("");
  const [repairTarget, setRepairTarget] = useState<{
    collection: ApiCollection;
    request: ApiCollectionRequest;
  } | null>(null);
  const [repairCandidateKey, setRepairCandidateKey] = useState("");
  const repairCandidates = useMemo<ProtoRepairCandidate[]>(() => {
    if (!repairTarget?.request.grpc) return [];
    return findProtoRepairCandidates(protoLibraries, repairTarget.request.grpc).slice(0, 200);
  }, [protoLibraries, repairTarget]);

  const changeLibrary = protoLibraries.find((library) => library.id === changeLibraryId) ?? null;
  const changeVersion = changeLibrary?.versions.find((version) => version.id === changeVersionId) ?? null;
  const changeMethods = useMemo(() => {
    if (!changeVersion) return [];
    try {
      return loadProtoFiles(changeVersion.files).methods;
    } catch {
      return [];
    }
  }, [changeVersion]);
  const changeServices = useMemo(
    () => [...new Set(changeMethods.map((method) => method.serviceName))].sort(),
    [changeMethods],
  );
  const changeServiceMethods = useMemo(
    () => changeMethods.filter((method) => method.serviceName === changeServiceName),
    [changeMethods, changeServiceName],
  );
  const changeCandidate = useMemo<ProtoRepairCandidate | null>(() => {
    if (!changeLibrary || !changeVersion || !changeMethodFullName) return null;
    const method = changeMethods.find((item) => `${item.serviceName}/${item.methodName}` === changeMethodFullName);
    if (!method) return null;
    return {
      libraryId: changeLibrary.id,
      libraryName: changeLibrary.name,
      versionId: changeVersion.id,
      versionLabel: changeVersion.version,
      method,
      methodFullName: changeMethodFullName,
      score: 0,
      exact: changeTarget?.request.grpc?.methodFullName === changeMethodFullName,
    };
  }, [changeLibrary, changeMethods, changeMethodFullName, changeTarget, changeVersion]);

  const openChangeReference = (
    target: { collection: ApiCollection; request: ApiCollectionRequest },
    preferLatestRevision = false,
  ) => {
    const currentBinding = target.request.grpc;
    const library = protoLibraries.find((item) => item.id === currentBinding?.libraryId) ?? protoLibraries[0];
    const availableVersions = library?.versions ?? [];
    const latestVersion =
      availableVersions.length > 0
        ? availableVersions.reduce(
            (latest, candidate) => (candidate.importedAt >= latest.importedAt ? candidate : latest),
            availableVersions[0],
          )
        : undefined;
    const preferredVersionId = preferLatestRevision ? latestVersion?.id : currentBinding?.versionId;
    const version =
      library?.versions.find((item) => item.id === preferredVersionId) ??
      library?.versions.find((item) => item.id === library.defaultVersionId) ??
      library?.versions[0];
    let methods = [] as ReturnType<typeof loadProtoFiles>["methods"];
    try {
      methods = version ? loadProtoFiles(version.files).methods : [];
    } catch {
      methods = [];
    }
    const currentMethod = methods.find(
      (method) => `${method.serviceName}/${method.methodName}` === currentBinding?.methodFullName,
    );
    const method = currentMethod ?? methods[0];
    setChangeTarget(target);
    setChangeLibraryId(library?.id ?? "");
    setChangeVersionId(version?.id ?? "");
    setChangeServiceName(method?.serviceName ?? "");
    setChangeMethodFullName(method ? `${method.serviceName}/${method.methodName}` : "");
  };

  useEffect(() => {
    const currentIds = new Set(collections.map((collection) => collection.id));
    const addedIds = collections
      .map((collection) => collection.id)
      .filter((collectionId) => !knownCollectionIdsRef.current.has(collectionId));
    if (addedIds.length) {
      setExpandedNodeIds(
        (current) => new Set([...current, ...addedIds.map((collectionId) => `collection:${collectionId}`)]),
      );
    }
    knownCollectionIdsRef.current = currentIds;
  }, [collections]);

  const closeContextMenu = () => {
    setContextAnchor(null);
    setContextTarget(null);
  };

  const closeQuickAdd = () => {
    setQuickAddAnchor(null);
    setQuickAddTarget(null);
  };

  const openQuickAdd = (event: ReactMouseEvent<HTMLElement>, collection: ApiCollection, parentId: string | null) => {
    event.stopPropagation();
    setQuickAddAnchor(event.currentTarget);
    setQuickAddTarget({ collection, parentId });
  };

  const createQuickRequest = (kind: "rest" | "grpc" | "websocket") => {
    if (!quickAddTarget) return;
    const { collection, parentId } = quickAddTarget;
    setExpandedNodeIds(
      (current) => new Set([...current, `collection:${collection.id}`, ...(parentId ? [`folder:${parentId}`] : [])]),
    );
    closeQuickAdd();
    onAddCollectionRequest(collection.id, kind, parentId);
  };

  const beginRename = (target: CollectionContextTarget) => {
    if (target.type === "collection") {
      setRenameTarget({
        type: "collection",
        collectionId: target.collection.id,
        nodeId: target.collection.id,
        value: target.collection.name,
      });
    } else if (target.type === "folder") {
      setRenameTarget({
        type: "folder",
        collectionId: target.collection.id,
        nodeId: target.folder.id,
        value: target.folder.name,
      });
    } else {
      setRenameTarget({
        type: "request",
        collectionId: target.collection.id,
        nodeId: target.request.id,
        value: target.request.name,
      });
    }
    closeContextMenu();
  };

  const createFolderAndRename = (collection: ApiCollection, parentId: string | null) => {
    const folder = onCreateFolder(collection.id, parentId);
    if (!folder) return;
    setExpandedNodeIds(
      (current) =>
        new Set([
          ...current,
          `collection:${collection.id}`,
          ...(parentId ? [`folder:${parentId}`] : []),
          `folder:${folder.id}`,
        ]),
    );
    setRenameTarget({
      type: "folder",
      collectionId: collection.id,
      nodeId: folder.id,
      value: folder.name,
    });
    closeContextMenu();
    closeQuickAdd();
  };

  const commitRename = () => {
    if (!renameTarget) return;
    const nextName = renameTarget.value.trim();
    if (!nextName) {
      setRenameTarget(null);
      return;
    }
    if (renameTarget.type === "collection") onRenameCollection(renameTarget.collectionId, nextName);
    else if (renameTarget.type === "folder") onRenameFolder(renameTarget.collectionId, renameTarget.nodeId, nextName);
    else onRenameCollectionRequest(renameTarget.collectionId, renameTarget.nodeId, nextName);
    setRenameTarget(null);
  };

  const handleRenameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setRenameTarget(null);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "collection") onRemoveCollection(deleteTarget.collection.id);
    else if (deleteTarget.type === "folder") onRemoveFolder(deleteTarget.collection.id, deleteTarget.folder.id);
    else onRemoveCollectionRequest(deleteTarget.collection.id, deleteTarget.request.id);
    setDeleteTarget(null);
  };

  const toggleExpanded = (key: string) => {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const performDrop = (event: ReactDragEvent<HTMLElement>, target: CollectionDropTarget, _key: string) => {
    event.preventDefault();
    event.stopPropagation();
    const source = readDragPayload(event);
    setDropKey("");
    if (!source) return;
    if (onMoveNode(source, target) && target.parentId) {
      setExpandedNodeIds((current) => new Set([...current, `folder:${target.parentId}`]));
    }
  };

  const renderNode = (
    collection: ApiCollection,
    node: CollectionTreeNode,
    parentId: string | null,
    index: number,
    depth: number,
    queryActive: boolean,
  ): ReactNode => {
    if (node.type === "folder") {
      const expanded = queryActive || expandedNodeIds.has(`folder:${node.folder.id}`);
      const renaming = renameTarget?.type === "folder" && renameTarget.nodeId === node.folder.id;
      const key = `folder:${node.folder.id}`;
      return (
        <Box key={key} sx={{ position: "relative" }}>
          <Stack
            className="collection-tree-row"
            role="treeitem"
            aria-level={depth + 2}
            aria-expanded={expanded}
            tabIndex={0}
            onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleExpanded(`folder:${node.folder.id}`);
              }
            }}
            direction="row"
            spacing={0.35}
            alignItems="center"
            draggable={!renaming}
            onDragStart={(event: ReactDragEvent<HTMLElement>) =>
              dragPayload(event, { type: "folder", collectionId: collection.id, nodeId: node.folder.id })
            }
            onDragEnd={() => setDropKey("")}
            onDragOver={(event: ReactDragEvent<HTMLElement>) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropKey(key);
            }}
            onDragLeave={() => setDropKey((current) => (current === key ? "" : current))}
            onDrop={(event: ReactDragEvent<HTMLElement>) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
              if (ratio > 0.25 && ratio < 0.75) {
                performDrop(event, { collectionId: collection.id, parentId: node.folder.id }, key);
              } else {
                performDrop(
                  event,
                  { collectionId: collection.id, parentId, index: ratio <= 0.25 ? index : index + 1 },
                  key,
                );
              }
            }}
            onContextMenu={(event: ReactMouseEvent<HTMLElement>) => {
              event.preventDefault();
              event.stopPropagation();
              setContextAnchor(event.currentTarget);
              setContextTarget({ type: "folder", collection, folder: node.folder });
            }}
            sx={{
              ...rowSx,
              ml: treeOffset(depth),
              "&:hover .tree-row-action, &:focus-within .tree-row-action": { opacity: 1, pointerEvents: "auto" },
              outlineWidth: dropKey === key ? 1 : 0,
              outlineStyle: "solid",
              outlineColor: "primary.main",
            }}
          >
            <IconButton
              size="small"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${node.folder.name}`}
              aria-expanded={expanded}
              onClick={() => toggleExpanded(`folder:${node.folder.id}`)}
              sx={{ p: 0.05, fontSize: 12, lineHeight: 1 }}
            >
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  display: "inline-block",
                  transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 120ms ease",
                }}
              >
                ›
              </Box>
            </IconButton>
            {renaming ? (
              <TextField
                autoFocus
                size="small"
                value={renameTarget.value}
                onChange={(event: ReactChangeEvent<HTMLInputElement>) =>
                  setRenameTarget({ ...renameTarget, value: event.target.value })
                }
                onKeyDown={handleRenameKeyDown}
                onBlur={commitRename}
                inputProps={{ "aria-label": "Folder name" }}
                sx={{ flex: 1, minWidth: 0 }}
              />
            ) : (
              <Typography
                noWrap
                title={node.folder.name}
                onDoubleClick={() => beginRename({ type: "folder", collection, folder: node.folder })}
                sx={{ ...labelSx, flex: 1, minWidth: 0, fontWeight: 500 }}
              >
                <SearchHighlightedText text={node.folder.name} query={filterQuery} />
              </Typography>
            )}
            <IconButton
              size="small"
              title="Add inside folder"
              aria-label={`Add request to ${node.folder.name}`}
              onClick={(event: ReactMouseEvent<HTMLElement>) => openQuickAdd(event, collection, node.folder.id)}
              sx={{
                width: 24,
                height: 24,
                p: 0,
                color: "primary.main",
                "&:hover, &:focus-visible": { bgcolor: "action.hover" },
              }}
            >
              <Add sx={{ fontSize: 15 }} />
            </IconButton>
          </Stack>
          {expanded && (
            <Box role="group">
              {node.children.map((child, childIndex) =>
                renderNode(collection, child, node.folder.id, childIndex, depth + 1, queryActive),
              )}
            </Box>
          )}
        </Box>
      );
    }

    const request = node.request;
    const active = selectedCollectionRequestId === request.id;
    const tabState = requestTabState.get(request.id);
    const requestOpen = Boolean(tabState?.open);
    const requestRunning = Boolean(tabState?.running);
    const renaming = renameTarget?.type === "request" && renameTarget.nodeId === request.id;
    const key = `request:${request.id}`;
    const grpcMethodFullName = request.grpc?.methodFullName ?? request.grpcMethodKey ?? "";
    const grpcPresentation = request.grpc
      ? grpcMethodPresentation.get(`${request.grpc.libraryId}:${request.grpc.versionId}:${grpcMethodFullName}`)
      : undefined;
    const grpcMode = request.kind === "grpc" ? (grpcPresentation ?? "Unary") : undefined;
    const grpcStatus =
      request.kind === "grpc" && request.grpc?.status && request.grpc.status !== "valid" ? request.grpc.status : null;
    const grpcStatusPresentation = grpcStatus ? grpcRequestStatusCopy(grpcStatus) : null;
    return (
      <ListItemButton
        key={key}
        component="div"
        tabIndex={0}
        selected={active}
        role="treeitem"
        aria-level={depth + 2}
        draggable={!renaming}
        title={`${request.kind.toUpperCase()} ${request.url}${requestRunning ? " · Running" : requestOpen ? " · Open in tab" : ""}`}
        onDragStart={(event: ReactDragEvent<HTMLElement>) =>
          dragPayload(event, { type: "request", collectionId: collection.id, nodeId: request.id })
        }
        onDragEnd={() => setDropKey("")}
        onDragOver={(event: ReactDragEvent<HTMLElement>) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropKey(key);
        }}
        onDragLeave={() => setDropKey((current) => (current === key ? "" : current))}
        onDrop={(event: ReactDragEvent<HTMLElement>) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const after = rect.height ? event.clientY - rect.top > rect.height / 2 : false;
          performDrop(event, { collectionId: collection.id, parentId, index: index + (after ? 1 : 0) }, key);
        }}
        onClick={() => !renaming && onSelectCollectionRequest(collection, request)}
        onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
          if (renaming) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectCollectionRequest(collection, request);
          }
        }}
        onContextMenu={(event: ReactMouseEvent<HTMLElement>) => {
          event.preventDefault();
          event.stopPropagation();
          setContextAnchor(event.currentTarget);
          setContextTarget({ type: "request", collection, request });
        }}
        sx={{
          ...itemButtonSx,
          ml: treeOffset(depth),
          width: `calc(100% - ${treeOffset(depth)})`,
          overflow: "visible",
          outlineWidth: dropKey === key ? 1 : 0,
          outlineStyle: "solid",
          outlineColor: "primary.main",
          "&:hover .request-row-action, &:focus-within .request-row-action": { opacity: 1, pointerEvents: "auto" },
        }}
      >
        <Chip
          size="small"
          label={request.kind === "rest" ? "API" : request.kind === "websocket" ? "WS" : "RPC"}
          title={
            request.kind === "rest"
              ? `${request.method ?? "REST"} request`
              : request.kind === "websocket"
                ? "WebSocket request"
                : "gRPC request"
          }
          sx={{ height: 20, minWidth: 36, flexShrink: 0, "& .MuiChip-label": { px: 0.45, fontSize: 11 } }}
        />
        {renaming ? (
          <TextField
            autoFocus
            size="small"
            value={renameTarget.value}
            onChange={(event: ReactChangeEvent<HTMLInputElement>) =>
              setRenameTarget({ ...renameTarget, value: event.target.value })
            }
            onKeyDown={handleRenameKeyDown}
            onBlur={commitRename}
            inputProps={{ "aria-label": "Request name" }}
            onClick={(event: ReactMouseEvent<HTMLInputElement>) => event.stopPropagation()}
            sx={{ flex: 1, minWidth: 0 }}
          />
        ) : (
          <ListItemText
            primary={<SearchHighlightedText text={request.name} query={filterQuery} />}
            secondary={request.kind === "grpc" ? grpcMode : undefined}
            primaryTypographyProps={{
              noWrap: true,
              title: `${request.name} - ${request.url}`,
              sx: { ...labelSx, fontWeight: 400 },
            }}
            secondaryTypographyProps={{ noWrap: true, sx: { fontSize: 11, lineHeight: "14px" } }}
          />
        )}
        {grpcStatus && grpcStatusPresentation ? (
          <MethodStatusIndicator
            tone={grpcStatusPresentation.error ? "error" : "warning"}
            title={grpcStatusPresentation.title}
            detail={grpcStatusPresentation.detail}
            context={grpcMethodFullName || undefined}
            placement="right"
            onActivate={
              grpcStatusPresentation.actionable ? () => openChangeReference({ collection, request }, true) : undefined
            }
          />
        ) : null}
        {requestOpen && (
          <Box
            component="span"
            role="img"
            aria-label={requestRunning ? `${request.name} is running` : `${request.name} is open in a tab`}
            title={requestRunning ? "Running" : active ? "Active tab" : "Open tab"}
            sx={{
              width: 8,
              height: 8,
              flexShrink: 0,
              borderRadius: "50%",
              bgcolor: requestRunning ? "success.main" : active ? "primary.main" : "transparent",
              border: "1.5px solid",
              borderColor: requestRunning ? "success.main" : "primary.main",
              outline: requestRunning ? "2px solid var(--background)" : "none",
            }}
          />
        )}
        <IconButton
          className="request-row-action"
          size="small"
          aria-label={`Actions for ${request.name}`}
          onClick={(event: ReactMouseEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            setContextAnchor(event.currentTarget);
            setContextTarget({ type: "request", collection, request });
          }}
          sx={{
            width: 24,
            height: 24,
            flexShrink: 0,
            ml: "auto",
            opacity: active ? 1 : 0,
            pointerEvents: active ? "auto" : "none",
          }}
        >
          <MoreHoriz sx={{ fontSize: 15 }} />
        </IconButton>
      </ListItemButton>
    );
  };

  if (collections.length === 0) return <SmallEmpty body="No collection yet. Use the + menu to create one." />;
  if (filteredCollections.length === 0) return <SmallEmpty body="No matching collection, folder, or request." />;

  const queryActive = Boolean(filterQuery.trim());
  return (
    <>
      <Stack spacing={0.25} role="tree" aria-label="Requests">
        {filteredCollections.map(({ collection, tree }) => {
          const collectionKey = `collection:${collection.id}`;
          const expanded = queryActive || expandedNodeIds.has(collectionKey);
          const renaming = renameTarget?.type === "collection" && renameTarget.nodeId === collection.id;
          return (
            <Box
              key={collection.id}
              role="treeitem"
              aria-level={1}
              aria-expanded={expanded}
              sx={{ position: "relative" }}
            >
              <Stack
                className="collection-tree-row"
                tabIndex={0}
                onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleExpanded(collectionKey);
                  }
                }}
                direction="row"
                spacing={0.45}
                alignItems="center"
                onDragOver={(event: ReactDragEvent<HTMLElement>) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropKey(collectionKey);
                }}
                onDragLeave={() => setDropKey((current) => (current === collectionKey ? "" : current))}
                onDrop={(event: ReactDragEvent<HTMLElement>) =>
                  performDrop(event, { collectionId: collection.id, parentId: null }, collectionKey)
                }
                onContextMenu={(event: ReactMouseEvent<HTMLElement>) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setContextAnchor(event.currentTarget);
                  setContextTarget({ type: "collection", collection });
                }}
                sx={{
                  ...rowSx,
                  ml: `${TREE_BASE_PADDING_PX}px`,
                  "&:hover .tree-row-action, &:focus-within .tree-row-action": { opacity: 1, pointerEvents: "auto" },
                  outlineWidth: dropKey === collectionKey ? 1 : 0,
                  outlineStyle: "solid",
                  outlineColor: "primary.main",
                }}
              >
                <IconButton
                  size="small"
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${collection.name}`}
                  aria-expanded={expanded}
                  onClick={() => toggleExpanded(collectionKey)}
                  sx={{ p: 0.1, fontSize: 12, lineHeight: 1 }}
                >
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      display: "inline-block",
                      transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 120ms ease",
                    }}
                  >
                    ›
                  </Box>
                </IconButton>
                {renaming ? (
                  <TextField
                    autoFocus
                    size="small"
                    value={renameTarget.value}
                    onChange={(event: ReactChangeEvent<HTMLInputElement>) =>
                      setRenameTarget({ ...renameTarget, value: event.target.value })
                    }
                    onKeyDown={handleRenameKeyDown}
                    onBlur={commitRename}
                    inputProps={{ "aria-label": "Collection name" }}
                    sx={{ flex: 1, minWidth: 0 }}
                  />
                ) : (
                  <Typography
                    fontWeight={500}
                    noWrap
                    title={collection.name}
                    onDoubleClick={() => beginRename({ type: "collection", collection })}
                    sx={{ ...labelSx, flex: 1, minWidth: 0 }}
                  >
                    <SearchHighlightedText text={collection.name} query={filterQuery} />
                  </Typography>
                )}
                <IconButton
                  size="small"
                  title="Add to collection"
                  aria-label={`Add request to ${collection.name}`}
                  onClick={(event: ReactMouseEvent<HTMLElement>) => openQuickAdd(event, collection, null)}
                  sx={{
                    width: 24,
                    height: 24,
                    p: 0,
                    color: "primary.main",
                    "&:hover, &:focus-visible": { bgcolor: "action.hover" },
                  }}
                >
                  <Add sx={{ fontSize: 15 }} />
                </IconButton>
              </Stack>
              {expanded && (
                <Box role="group">
                  {tree.length ? (
                    tree.map((node, index) => renderNode(collection, node, null, index, 0, queryActive))
                  ) : (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ pl: `${TREE_BASE_PADDING_PX + TREE_INDENT_PX}px`, py: 0.35 }}
                    >
                      {queryActive ? "No matching folder or request." : "No folder or request yet."}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>

      <Menu anchorEl={quickAddAnchor} open={Boolean(quickAddAnchor)} onClose={closeQuickAdd}>
        <MenuItem onClick={() => createQuickRequest("rest")}>
          <Api sx={{ fontSize: 15, mr: 0.75 }} />
          HTTP request
        </MenuItem>
        <MenuItem onClick={() => createQuickRequest("grpc")}>
          <Terminal sx={{ fontSize: 15, mr: 0.75 }} />
          gRPC request
        </MenuItem>
        <MenuItem onClick={() => createQuickRequest("websocket")}>
          <Stream sx={{ fontSize: 15, mr: 0.75 }} />
          WebSocket request
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!quickAddTarget) return;
            const { collection, parentId } = quickAddTarget;
            createFolderAndRename(collection, parentId);
          }}
        >
          <Folder sx={{ fontSize: 15, mr: 0.75 }} />
          Folder
        </MenuItem>
      </Menu>

      <Menu anchorEl={contextAnchor} open={Boolean(contextAnchor)} onClose={closeContextMenu}>
        {contextTarget?.type === "collection" ? (
          <>
            <MenuItem onClick={() => createFolderAndRename(contextTarget.collection, null)}>New folder</MenuItem>
            <MenuItem
              onClick={() => {
                const id = contextTarget.collection.id;
                closeContextMenu();
                onAddCollectionRequest(id, "rest", null);
              }}
            >
              New HTTP request
            </MenuItem>
            <MenuItem
              onClick={() => {
                const id = contextTarget.collection.id;
                closeContextMenu();
                onAddCollectionRequest(id, "grpc", null);
              }}
            >
              New gRPC request
            </MenuItem>
            <MenuItem
              onClick={() => {
                const id = contextTarget.collection.id;
                closeContextMenu();
                onAddCollectionRequest(id, "websocket", null);
              }}
            >
              New WebSocket request
            </MenuItem>

            <MenuItem onClick={() => beginRename(contextTarget)}>Rename collection</MenuItem>
            <MenuItem
              onClick={() => {
                setDeleteTarget(contextTarget);
                closeContextMenu();
              }}
            >
              Delete collection
            </MenuItem>
          </>
        ) : contextTarget?.type === "folder" ? (
          <>
            <MenuItem onClick={() => createFolderAndRename(contextTarget.collection, contextTarget.folder.id)}>
              New subfolder
            </MenuItem>
            <MenuItem
              onClick={() => {
                const { collection, folder } = contextTarget;
                closeContextMenu();
                onAddCollectionRequest(collection.id, "rest", folder.id);
              }}
            >
              New HTTP request
            </MenuItem>
            <MenuItem
              onClick={() => {
                const { collection, folder } = contextTarget;
                closeContextMenu();
                onAddCollectionRequest(collection.id, "grpc", folder.id);
              }}
            >
              New gRPC request
            </MenuItem>
            <MenuItem
              onClick={() => {
                const { collection, folder } = contextTarget;
                closeContextMenu();
                onAddCollectionRequest(collection.id, "websocket", folder.id);
              }}
            >
              New WebSocket request
            </MenuItem>
            <MenuItem onClick={() => beginRename(contextTarget)}>Rename folder</MenuItem>
            <MenuItem
              onClick={() => {
                setDeleteTarget(contextTarget);
                closeContextMenu();
              }}
            >
              Delete folder and contents
            </MenuItem>
          </>
        ) : contextTarget?.type === "request" ? (
          <>
            {contextTarget.request.kind === "grpc" && contextTarget.request.grpc && (
              <>
                <MenuItem
                  onClick={() => {
                    openChangeReference({ collection: contextTarget.collection, request: contextTarget.request });
                    closeContextMenu();
                  }}
                >
                  Change schema or revision
                </MenuItem>
                {brokenGrpcReferenceStatuses.has(contextTarget.request.grpc.status ?? "valid") && (
                  <MenuItem
                    onClick={() => {
                      setRepairTarget({ collection: contextTarget.collection, request: contextTarget.request });
                      setRepairCandidateKey("");
                      closeContextMenu();
                    }}
                  >
                    Repair broken reference
                  </MenuItem>
                )}
              </>
            )}
            <MenuItem onClick={() => beginRename(contextTarget)}>Rename request</MenuItem>
            <MenuItem
              onClick={() => {
                setDeleteTarget(contextTarget);
                closeContextMenu();
              }}
            >
              Delete request
            </MenuItem>
          </>
        ) : null}
      </Menu>

      <Dialog open={Boolean(changeTarget)} onClose={() => setChangeTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Change schema or revision</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {changeTarget ? `${changeTarget.collection.name} / ${changeTarget.request.name}` : ""}
            </Typography>
            <FormControl size="small">
              <Typography variant="caption" color="text.secondary">
                Global proto schema
              </Typography>
              <Select
                value={changeLibraryId}
                onChange={(event: ReactChangeEvent<HTMLSelectElement>) => {
                  const libraryId = String(event.target.value);
                  const library = protoLibraries.find((item) => item.id === libraryId);
                  const version =
                    library?.versions.find((item) => item.id === library.defaultVersionId) ?? library?.versions[0];
                  let methods = [] as ReturnType<typeof loadProtoFiles>["methods"];
                  try {
                    methods = version ? loadProtoFiles(version.files).methods : [];
                  } catch {
                    methods = [];
                  }
                  const wantedMethod = changeTarget?.request.grpc?.methodFullName;
                  const method =
                    methods.find((item) => `${item.serviceName}/${item.methodName}` === wantedMethod) ?? methods[0];
                  setChangeLibraryId(libraryId);
                  setChangeVersionId(version?.id ?? "");
                  setChangeServiceName(method?.serviceName ?? "");
                  setChangeMethodFullName(method ? `${method.serviceName}/${method.methodName}` : "");
                }}
              >
                {protoLibraries.map((library) => (
                  <MenuItem key={library.id} value={library.id}>
                    {library.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small">
              <Typography variant="caption" color="text.secondary">
                Revision
              </Typography>
              <Select
                value={changeVersionId}
                onChange={(event: ReactChangeEvent<HTMLSelectElement>) => {
                  const versionId = String(event.target.value);
                  const version = changeLibrary?.versions.find((item) => item.id === versionId);
                  let methods = [] as ReturnType<typeof loadProtoFiles>["methods"];
                  try {
                    methods = version ? loadProtoFiles(version.files).methods : [];
                  } catch {
                    methods = [];
                  }
                  const wantedMethod = changeTarget?.request.grpc?.methodFullName;
                  const method =
                    methods.find((item) => `${item.serviceName}/${item.methodName}` === wantedMethod) ?? methods[0];
                  setChangeVersionId(versionId);
                  setChangeServiceName(method?.serviceName ?? "");
                  setChangeMethodFullName(method ? `${method.serviceName}/${method.methodName}` : "");
                }}
              >
                {(changeLibrary?.versions ?? []).map((version) => (
                  <MenuItem key={version.id} value={version.id}>
                    {version.version}
                    {version.id === changeLibrary?.defaultVersionId ? " · default" : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small">
              <Typography variant="caption" color="text.secondary">
                Service
              </Typography>
              <Select
                value={changeServiceName}
                onChange={(event: ReactChangeEvent<HTMLSelectElement>) => {
                  const serviceName = String(event.target.value);
                  const method = changeMethods.find((item) => item.serviceName === serviceName);
                  setChangeServiceName(serviceName);
                  setChangeMethodFullName(method ? `${method.serviceName}/${method.methodName}` : "");
                }}
              >
                {changeServices.map((serviceName) => (
                  <MenuItem key={serviceName} value={serviceName}>
                    {serviceName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small">
              <Typography variant="caption" color="text.secondary">
                Method
              </Typography>
              <Select
                value={changeMethodFullName}
                onChange={(event: ReactChangeEvent<HTMLSelectElement>) =>
                  setChangeMethodFullName(String(event.target.value))
                }
              >
                {changeServiceMethods.map((method) => {
                  const fullName = `${method.serviceName}/${method.methodName}`;
                  return (
                    <MenuItem key={fullName} value={fullName}>
                      {method.methodName}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
            {changeCandidate && (
              <Paper variant="outlined" sx={{ p: 1 }}>
                <Typography variant="body2" fontWeight={500}>
                  {changeCandidate.methodFullName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {changeCandidate.method.requestType} → {changeCandidate.method.responseType}
                </Typography>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={() => setChangeTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!changeTarget || !changeCandidate}
            onClick={() => {
              if (!changeTarget || !changeCandidate) return;
              onRepairGrpcRequest(changeTarget.collection.id, changeTarget.request.id, changeCandidate);
              setChangeTarget(null);
            }}
          >
            Apply schema reference
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(repairTarget)} onClose={() => setRepairTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Repair broken gRPC reference</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {repairTarget
                ? `${repairTarget.collection.name} / ${repairTarget.request.name} currently references ${repairTarget.request.grpc?.methodFullName ?? repairTarget.request.grpcMethodKey ?? "an unresolved method"}.`
                : ""}
            </Typography>
            <FormControl size="small">
              <Typography variant="caption" color="text.secondary">
                Replacement method
              </Typography>
              <Select
                value={repairCandidateKey}
                onChange={(event: ReactChangeEvent<HTMLSelectElement>) =>
                  setRepairCandidateKey(String(event.target.value))
                }
              >
                <option value="">Select a proto version and method</option>
                {repairCandidates.map((candidate) => {
                  const key = `${candidate.libraryId}|${candidate.versionId}|${candidate.methodFullName}`;
                  return (
                    <option key={key} value={key}>
                      {candidate.exact ? "Exact · " : ""}
                      {candidate.libraryName} {candidate.versionLabel} · {candidate.methodFullName}
                    </option>
                  );
                })}
              </Select>
            </FormControl>
            {repairCandidates.length === 0 && (
              <Typography variant="body2" color="error">
                No callable RPC method is available in the stored proto versions.
              </Typography>
            )}
            {repairCandidateKey &&
              (() => {
                const candidate = repairCandidates.find(
                  (item) => `${item.libraryId}|${item.versionId}|${item.methodFullName}` === repairCandidateKey,
                );
                return candidate ? (
                  <Paper variant="outlined" sx={{ p: 1 }}>
                    <Typography variant="body2" fontWeight={500}>
                      {candidate.methodFullName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {candidate.method.requestType} → {candidate.method.responseType} · score {candidate.score}
                    </Typography>
                  </Paper>
                ) : null;
              })()}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={() => setRepairTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!repairCandidateKey || !repairTarget}
            onClick={() => {
              if (!repairTarget) return;
              const candidate = repairCandidates.find(
                (item) => `${item.libraryId}|${item.versionId}|${item.methodFullName}` === repairCandidateKey,
              );
              if (!candidate) return;
              onRepairGrpcRequest(repairTarget.collection.id, repairTarget.request.id, candidate);
              setRepairTarget(null);
              setRepairCandidateKey("");
            }}
          >
            Apply reference
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {deleteTarget?.type === "collection"
            ? `Delete “${deleteTarget.collection.name}”?`
            : deleteTarget?.type === "folder"
              ? `Delete “${deleteTarget.folder.name}”?`
              : deleteTarget
                ? `Delete “${deleteTarget.request.name}”?`
                : "Delete item?"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={0.7}>
            {deleteTarget?.type === "collection" ? (
              <>
                <Typography variant="body2">
                  {deleteTarget.collection.folders.length} folder
                  {deleteTarget.collection.folders.length === 1 ? "" : "s"} · {deleteTarget.collection.requests.length}{" "}
                  request{deleteTarget.collection.requests.length === 1 ? "" : "s"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Linked tabs will close.
                </Typography>
              </>
            ) : deleteTarget?.type === "folder" ? (
              <Typography variant="body2" color="text.secondary">
                Nested folders, requests, linked tabs, and mock presets will be removed.
              </Typography>
            ) : deleteTarget ? (
              <Typography variant="body2" color="text.secondary">
                The request, linked tab, and mock preset will be removed from “{deleteTarget.collection.name}”.
              </Typography>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
