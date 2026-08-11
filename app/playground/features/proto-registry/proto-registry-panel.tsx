"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  Add,
  Delete,
  Download,
  KeyboardArrowRight,
  ProtoIcon,
  Schema,
  Storage,
  Stream,
  Terminal,
} from "@/components/shadcn/icons";
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
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@/components/shadcn/compat";
import type { ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import { loadProtoFiles } from "@/lib/proto-loader";
import type { ApiCollection } from "../../shared/workbench-types";
import type { ProtoLibrary } from "../proto-library/proto-library-types";
import {
  assessProtoLibraryImport,
  prepareProtoVersionImport,
  type ProtoLibraryImportAssessment,
  type ProtoSchemaChange,
  type ProtoVersionDeleteResult,
  type ProtoVersionImportPlan,
} from "../proto-library/proto-version-management";
import { methodKey } from "../../shared/rpc-method-utils";

import { uniqueCollectionRequestName } from "../collection/grpc-request-name";

type EndpointServiceGroup = {
  serviceName: string;
  methods: RpcMethodInfo[];
};

export type EndpointFileGroup = {
  fileName: string;
  protoFile?: ProtoSourceFile;
  services: EndpointServiceGroup[];
  methodCount: number;
};

type ProtoContextTarget = { type: "file"; fileGroup: EndpointFileGroup } | { type: "method"; method: RpcMethodInfo };

type ProtoDiffFilePair = {
  key: string;
  action: "added" | "removed" | "modified" | "renamed" | "unchanged";
  previousName?: string;
  name: string;
  previousFile?: ProtoSourceFile;
  nextFile?: ProtoSourceFile;
};

type ProtoDiffRow = {
  leftNumber?: number;
  rightNumber?: number;
  leftText?: string;
  rightText?: string;
  leftKind: "same" | "removed" | "changed" | "empty";
  rightKind: "same" | "added" | "changed" | "empty";
};

function splitProtoLines(text: string | undefined) {
  if (text === undefined) return [];
  const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return normalized.length === 0 ? [""] : normalized.split("\n");
}

function alignProtoDiffLines(previousText: string | undefined, nextText: string | undefined): ProtoDiffRow[] {
  const previousLines = splitProtoLines(previousText);
  const nextLines = splitProtoLines(nextText);

  if (previousText === nextText) {
    return previousLines.map((line, index) => ({
      leftNumber: index + 1,
      rightNumber: index + 1,
      leftText: line,
      rightText: line,
      leftKind: "same",
      rightKind: "same",
    }));
  }

  if (previousLines.length * nextLines.length > 360_000) {
    const length = Math.max(previousLines.length, nextLines.length);
    return Array.from({ length }, (_, index) => {
      const leftText = previousLines[index];
      const rightText = nextLines[index];
      const both = leftText !== undefined && rightText !== undefined;
      const same = both && leftText === rightText;
      return {
        leftNumber: leftText === undefined ? undefined : index + 1,
        rightNumber: rightText === undefined ? undefined : index + 1,
        leftText,
        rightText,
        leftKind: leftText === undefined ? "empty" : same ? "same" : both ? "changed" : "removed",
        rightKind: rightText === undefined ? "empty" : same ? "same" : both ? "changed" : "added",
      };
    });
  }

  const matrix = Array.from({ length: previousLines.length + 1 }, () => new Uint32Array(nextLines.length + 1));
  for (let leftIndex = 1; leftIndex <= previousLines.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= nextLines.length; rightIndex += 1) {
      matrix[leftIndex][rightIndex] =
        previousLines[leftIndex - 1] === nextLines[rightIndex - 1]
          ? matrix[leftIndex - 1][rightIndex - 1] + 1
          : Math.max(matrix[leftIndex - 1][rightIndex], matrix[leftIndex][rightIndex - 1]);
    }
  }

  type Operation = {
    kind: "same" | "removed" | "added";
    text: string;
    leftNumber?: number;
    rightNumber?: number;
  };
  const reversed: Operation[] = [];
  let leftIndex = previousLines.length;
  let rightIndex = nextLines.length;
  while (leftIndex > 0 || rightIndex > 0) {
    if (leftIndex > 0 && rightIndex > 0 && previousLines[leftIndex - 1] === nextLines[rightIndex - 1]) {
      reversed.push({
        kind: "same",
        text: previousLines[leftIndex - 1],
        leftNumber: leftIndex,
        rightNumber: rightIndex,
      });
      leftIndex -= 1;
      rightIndex -= 1;
    } else if (
      leftIndex > 0 &&
      (rightIndex === 0 || matrix[leftIndex - 1][rightIndex] >= matrix[leftIndex][rightIndex - 1])
    ) {
      reversed.push({ kind: "removed", text: previousLines[leftIndex - 1], leftNumber: leftIndex });
      leftIndex -= 1;
    } else {
      reversed.push({ kind: "added", text: nextLines[rightIndex - 1], rightNumber: rightIndex });
      rightIndex -= 1;
    }
  }

  const operations = reversed.reverse();
  const rows: ProtoDiffRow[] = [];
  let operationIndex = 0;
  while (operationIndex < operations.length) {
    const operation = operations[operationIndex];
    if (operation.kind === "same") {
      rows.push({
        leftNumber: operation.leftNumber,
        rightNumber: operation.rightNumber,
        leftText: operation.text,
        rightText: operation.text,
        leftKind: "same",
        rightKind: "same",
      });
      operationIndex += 1;
      continue;
    }

    const removed: Operation[] = [];
    const added: Operation[] = [];
    while (operationIndex < operations.length && operations[operationIndex].kind !== "same") {
      const changed = operations[operationIndex];
      if (changed.kind === "removed") removed.push(changed);
      else added.push(changed);
      operationIndex += 1;
    }
    const changeLength = Math.max(removed.length, added.length);
    for (let index = 0; index < changeLength; index += 1) {
      const left = removed[index];
      const right = added[index];
      rows.push({
        leftNumber: left?.leftNumber,
        rightNumber: right?.rightNumber,
        leftText: left?.text,
        rightText: right?.text,
        leftKind: left ? (right ? "changed" : "removed") : "empty",
        rightKind: right ? (left ? "changed" : "added") : "empty",
      });
    }
  }
  return rows;
}

function buildProtoDiffFilePairs(
  previousFiles: ProtoSourceFile[],
  nextFiles: ProtoSourceFile[],
  plan: ProtoVersionImportPlan | null,
): ProtoDiffFilePair[] {
  const previousByName = new Map(previousFiles.map((file) => [file.name, file]));
  const nextByName = new Map(nextFiles.map((file) => [file.name, file]));
  const changes = plan?.fileChanges ?? [];

  if (changes.length > 0) {
    return changes
      .map((change) => {
        const previousName = change.previousName ?? change.name;
        const action: ProtoDiffFilePair["action"] = change.action === "replaced" ? "modified" : change.action;
        return {
          key: `${action}:${previousName}:${change.name}`,
          action,
          previousName: change.action === "added" ? undefined : previousName,
          name: change.name,
          previousFile: change.action === "added" ? undefined : previousByName.get(previousName),
          nextFile: change.action === "removed" ? undefined : nextByName.get(change.name),
        } satisfies ProtoDiffFilePair;
      })
      .sort((left, right) => {
        const rank = { modified: 0, renamed: 1, added: 2, removed: 3, unchanged: 4 } as const;
        return rank[left.action] - rank[right.action] || left.name.localeCompare(right.name);
      });
  }

  const names = [...new Set([...previousByName.keys(), ...nextByName.keys()])].sort();
  return names.map((name) => {
    const previousFile = previousByName.get(name);
    const nextFile = nextByName.get(name);
    const action = !previousFile
      ? "added"
      : !nextFile
        ? "removed"
        : previousFile.text === nextFile.text
          ? "unchanged"
          : "modified";
    return {
      key: `${action}:${name}`,
      action,
      previousName: previousFile ? name : undefined,
      name,
      previousFile,
      nextFile,
    };
  });
}

function diffCellBackground(kind: ProtoDiffRow["leftKind"] | ProtoDiffRow["rightKind"], side: "left" | "right") {
  if (kind === "removed" || (kind === "changed" && side === "left")) return "rgba(239, 68, 68, 0.13)";
  if (kind === "added" || (kind === "changed" && side === "right")) return "rgba(16, 185, 129, 0.13)";
  if (kind === "empty") return "rgba(148, 163, 184, 0.04)";
  return "transparent";
}

function ProtoSideBySideDiff({
  previousFiles,
  nextFiles,
  plan,
}: {
  previousFiles: ProtoSourceFile[];
  nextFiles: ProtoSourceFile[];
  plan: ProtoVersionImportPlan | null;
}) {
  const filePairs = useMemo(
    () => buildProtoDiffFilePairs(previousFiles, nextFiles, plan),
    [nextFiles, plan, previousFiles],
  );
  const [selectedKey, setSelectedKey] = useState("");

  useEffect(() => {
    if (filePairs.length === 0) {
      setSelectedKey("");
      return;
    }
    if (!filePairs.some((pair) => pair.key === selectedKey)) {
      setSelectedKey(filePairs[0].key);
    }
  }, [filePairs, selectedKey]);

  const selectedPair = filePairs.find((pair) => pair.key === selectedKey) ?? filePairs[0];
  const rows = useMemo(
    () => alignProtoDiffLines(selectedPair?.previousFile?.text, selectedPair?.nextFile?.text),
    [selectedPair],
  );
  const changedLineCount = rows.filter((row) => row.leftKind !== "same" || row.rightKind !== "same").length;

  if (!selectedPair) return null;

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={0.75}
        alignItems={{ md: "center" }}
        sx={{ p: 0.9, borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" fontWeight={600}>
            Proto source comparison
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {changedLineCount === 0
              ? "No line changes in the selected file."
              : `${changedLineCount} changed line${changedLineCount === 1 ? "" : "s"} in the selected file.`}
          </Typography>
        </Box>
        <Chip
          size="small"
          color={
            selectedPair.action === "added"
              ? "success"
              : selectedPair.action === "removed"
                ? "error"
                : selectedPair.action === "unchanged"
                  ? "default"
                  : "warning"
          }
          label={selectedPair.action}
        />
        {filePairs.length > 1 && (
          <FormControl size="small" sx={{ width: { xs: "100%", md: 300 } }}>
            <Select
              value={selectedPair.key}
              inputProps={{ "aria-label": "Proto file to compare" }}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedKey(String(event.target.value))}
            >
              {filePairs.map((pair) => (
                <MenuItem key={pair.key} value={pair.key}>
                  {pair.action === "renamed" && pair.previousName ? `${pair.previousName} → ${pair.name}` : pair.name} ·{" "}
                  {pair.action}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Stack>

      <Box sx={{ maxHeight: 390, overflow: "auto" }}>
        <Box sx={{ minWidth: 920 }}>
          <Box
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              display: "grid",
              gridTemplateColumns: "48px minmax(390px, 1fr) 48px minmax(390px, 1fr)",
              borderBottom: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            <Box sx={{ px: 0.6, py: 0.55, textAlign: "right", color: "text.secondary", fontSize: 11 }}>#</Box>
            <Box sx={{ px: 0.8, py: 0.55, minWidth: 0 }}>
              <Typography variant="caption" fontWeight={600} noWrap title={selectedPair.previousName ?? "Not present"}>
                {selectedPair.previousName ?? "Not present"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Current revision
              </Typography>
            </Box>
            <Box sx={{ px: 0.6, py: 0.55, textAlign: "right", color: "text.secondary", fontSize: 11 }}>#</Box>
            <Box sx={{ px: 0.8, py: 0.55, minWidth: 0 }}>
              <Typography
                variant="caption"
                fontWeight={600}
                noWrap
                title={selectedPair.nextFile?.name ?? "Not present"}
              >
                {selectedPair.nextFile?.name ?? "Not present"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Imported revision
              </Typography>
            </Box>
          </Box>
          {rows.map((row) => (
            <Box
              key={`${row.leftNumber ?? "0"}:${row.rightNumber ?? "0"}:${row.leftKind}:${row.rightKind}:${row.leftText ?? ""}:${row.rightText ?? ""}`}
              sx={{
                display: "grid",
                gridTemplateColumns: "48px minmax(390px, 1fr) 48px minmax(390px, 1fr)",
                borderBottom: "1px solid",
                borderColor: "rgba(148, 163, 184, 0.08)",
              }}
            >
              <Box
                sx={{
                  px: 0.6,
                  py: 0.18,
                  textAlign: "right",
                  color: "text.secondary",
                  bgcolor: diffCellBackground(row.leftKind, "left"),
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 11,
                  userSelect: "text",
                }}
              >
                {row.leftNumber ?? ""}
              </Box>
              <Box
                title={row.leftText}
                sx={{
                  minWidth: 0,
                  px: 0.8,
                  py: 0.18,
                  overflow: "hidden",
                  bgcolor: diffCellBackground(row.leftKind, "left"),
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 11,
                  whiteSpace: "pre",
                  userSelect: "text",
                }}
              >
                {row.leftText ?? ""}
              </Box>
              <Box
                sx={{
                  px: 0.6,
                  py: 0.18,
                  textAlign: "right",
                  color: "text.secondary",
                  bgcolor: diffCellBackground(row.rightKind, "right"),
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 11,
                  userSelect: "text",
                }}
              >
                {row.rightNumber ?? ""}
              </Box>
              <Box
                title={row.rightText}
                sx={{
                  minWidth: 0,
                  px: 0.8,
                  py: 0.18,
                  overflow: "hidden",
                  bgcolor: diffCellBackground(row.rightKind, "right"),
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 11,
                  whiteSpace: "pre",
                  userSelect: "text",
                }}
              >
                {row.rightText ?? ""}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Paper>
  );
}

const labelSx = {
  fontSize: 12,
  lineHeight: "16px",
} as const;

const rowSx = {
  minHeight: 28,
  px: 0.55,
  py: 0.25,
  borderRadius: 1,
  "&:hover": { bgcolor: "action.hover" },
} as const;

const itemButtonSx = {
  minHeight: 28,
  borderRadius: 1,
  mb: 0.05,
  px: 0.55,
  py: 0.25,
  gap: "4px",
  "&.Mui-selected": { bgcolor: "action.selected" },
} as const;

/** Groups loaded RPC methods by proto file and service for the Proto Schemas tree. */
export function buildEndpointGroups(
  methods: RpcMethodInfo[],
  protoFiles: ProtoSourceFile[],
  filterQuery: string,
): EndpointFileGroup[] {
  const query = filterQuery.trim().toLowerCase();
  const protoByName = new Map(protoFiles.map((file) => [file.name, file]));
  const fallbackFile = protoFiles[0]?.name ?? "Unknown proto";
  const fileGroups = new Map<string, Map<string, RpcMethodInfo[]>>();

  for (const method of methods) {
    const fileName = method.sourceFile || fallbackFile;
    const haystack = [fileName, method.serviceName, method.methodName, method.requestType, method.responseType]
      .join("/")
      .toLowerCase();
    if (query && !haystack.includes(query)) continue;

    let serviceGroups = fileGroups.get(fileName);
    if (!serviceGroups) {
      serviceGroups = new Map();
      fileGroups.set(fileName, serviceGroups);
    }
    let serviceMethods = serviceGroups.get(method.serviceName);
    if (!serviceMethods) {
      serviceMethods = [];
      serviceGroups.set(method.serviceName, serviceMethods);
    }
    serviceMethods.push(method);
  }

  for (const file of protoFiles) {
    const haystack = [file.name, file.text].join("/").toLowerCase();
    if (!fileGroups.has(file.name) && (!query || haystack.includes(query))) fileGroups.set(file.name, new Map());
  }

  return Array.from(fileGroups.entries())
    .map(([fileName, serviceMap]) => {
      const services = Array.from(serviceMap.entries())
        .map(([serviceName, serviceMethods]) => ({
          serviceName,
          methods: serviceMethods.sort((a, b) => a.methodName.localeCompare(b.methodName)),
        }))
        .sort((a, b) => a.serviceName.localeCompare(b.serviceName));
      return {
        fileName,
        protoFile: protoByName.get(fileName),
        services,
        methodCount: services.reduce((sum, service) => sum + service.methods.length, 0),
      };
    })
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

/**
 * Renders the workspace-global proto registry. The panel only manages schemas and
 * source navigation. Requests are created explicitly through the + action on an RPC method.
 */
export function ProtoExplorerPanel({
  protoFiles,
  protoLibraries,
  activeLibraryId,
  activeVersionId,
  collections,
  endpointGroups,
  selectedProtoFileName,
  filterQuery,
  onOpenProto,
  onExportProto,
  onSelectLibraryVersion,
  onCreateLibrary,
  onApplyVersionImport,
  onDeleteLibrary,
  onCreateRequestFromMethod,
}: {
  protoFiles: ProtoSourceFile[];
  protoLibraries: ProtoLibrary[];
  activeLibraryId: string;
  activeVersionId: string;
  collections: ApiCollection[];
  endpointGroups: EndpointFileGroup[];
  selectedProtoFileName: string;
  filterQuery: string;
  onOpenProto: (file: ProtoSourceFile) => void;
  onExportProto: (file: ProtoSourceFile) => void;
  onSelectLibraryVersion: (libraryId: string, versionId: string) => void;
  onCreateLibrary: (name: string, versionLabel: string, files: ProtoSourceFile[]) => void;
  onApplyVersionImport: (
    plan: ProtoVersionImportPlan,
    selectedRequestIds: ReadonlySet<string>,
    setAsDefault?: boolean,
  ) => void;
  onDeleteLibrary: (libraryId: string) => ProtoVersionDeleteResult;
  onCreateRequestFromMethod: (
    collectionId: string,
    method: RpcMethodInfo,
    parentId?: string | null,
    requestName?: string,
  ) => void;
}) {
  const [expandedFileNames, setExpandedFileNames] = useState<Set<string>>(
    () => new Set(endpointGroups.map((group) => group.fileName)),
  );
  const [expandedServiceKeys, setExpandedServiceKeys] = useState<Set<string>>(
    () =>
      new Set(
        endpointGroups.flatMap((group) =>
          group.services.map((service) => serviceExpansionKey(group.fileName, service.serviceName)),
        ),
      ),
  );
  const knownFileNamesRef = useRef(new Set(endpointGroups.map((group) => group.fileName)));
  const knownServiceKeysRef = useRef(
    new Set(
      endpointGroups.flatMap((group) =>
        group.services.map((service) => serviceExpansionKey(group.fileName, service.serviceName)),
      ),
    ),
  );
  const [contextAnchor, setContextAnchor] = useState<HTMLElement | null>(null);
  const [contextTarget, setContextTarget] = useState<ProtoContextTarget | null>(null);

  const createFileInputRef = useRef<HTMLInputElement | null>(null);
  const createFolderInputRef = useRef<HTMLInputElement | null>(null);
  const updateFileInputRef = useRef<HTMLInputElement | null>(null);
  const updateFolderInputRef = useRef<HTMLInputElement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createFiles, setCreateFiles] = useState<ProtoSourceFile[]>([]);
  const [createError, setCreateError] = useState("");
  const [createAssessment, setCreateAssessment] = useState<ProtoLibraryImportAssessment | null>(null);
  const [createRevisionPlan, setCreateRevisionPlan] = useState<ProtoVersionImportPlan | null>(null);
  const [createRevisionLabel, setCreateRevisionLabel] = useState("");
  const [createUpdateExistingRequests, setCreateUpdateExistingRequests] = useState(true);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateFiles, setUpdateFiles] = useState<ProtoSourceFile[]>([]);
  const [updateError, setUpdateError] = useState("");
  const [updateExistingRequests, setUpdateExistingRequests] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLibraryId, setDeleteLibraryId] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const [selectedLibraryId, setSelectedLibraryId] = useState(() => activeLibraryId || protoLibraries[0]?.id || "");
  const selectedLibrary =
    protoLibraries.find((library) => library.id === selectedLibraryId) ??
    protoLibraries.find((library) => library.id === activeLibraryId) ??
    protoLibraries[0];
  const selectedVersion = selectedLibrary
    ? (selectedLibrary.versions.find(
        (version) =>
          version.id === (selectedLibrary.id === activeLibraryId ? activeVersionId : selectedLibrary.defaultVersionId),
      ) ?? selectedLibrary.versions[0])
    : undefined;
  const updatePreviewPlan = useMemo(() => {
    if (!selectedLibrary || !selectedVersion || updateFiles.length === 0) return null;
    try {
      return prepareProtoVersionImport({
        library: selectedLibrary,
        baseVersion: selectedVersion,
        files: updateFiles,
        versionLabel: `Revision ${selectedLibrary.versions.length + 1}`,
        collections,
        importMode: "changed-files",
      });
    } catch {
      return null;
    }
  }, [collections, selectedLibrary, selectedVersion, updateFiles]);
  const deleteLibrary = protoLibraries.find((library) => library.id === deleteLibraryId) ?? selectedLibrary;
  const deleteDependencies = useMemo(
    () =>
      deleteLibrary
        ? collections.flatMap((collection) =>
            collection.requests
              .filter((request) => request.grpc?.libraryId === deleteLibrary.id)
              .map((request) => ({
                collectionId: collection.id,
                collectionName: collection.name,
                requestId: request.id,
                requestName: request.name,
                methodFullName: request.grpc?.methodFullName ?? "",
              })),
          )
        : [],
    [collections, deleteLibrary],
  );

  const [requestMethod, setRequestMethod] = useState<RpcMethodInfo | null>(null);
  const [requestCollectionId, setRequestCollectionId] = useState("");
  const [requestFolderId, setRequestFolderId] = useState("");
  const [requestName, setRequestName] = useState("");
  const requestCollection = collections.find((collection) => collection.id === requestCollectionId);

  useEffect(() => {
    for (const input of [createFolderInputRef.current, updateFolderInputRef.current]) {
      input?.setAttribute("webkitdirectory", "");
      input?.setAttribute("directory", "");
    }
  }, [createOpen, updateOpen]);

  useEffect(() => {
    if (activeLibraryId && protoLibraries.some((library) => library.id === activeLibraryId)) {
      setSelectedLibraryId(activeLibraryId);
      return;
    }
    if (!selectedLibraryId || !protoLibraries.some((library) => library.id === selectedLibraryId)) {
      setSelectedLibraryId(protoLibraries[0]?.id ?? "");
    }
  }, [activeLibraryId, protoLibraries, selectedLibraryId]);

  useEffect(() => {
    const currentFileNames = new Set(endpointGroups.map((group) => group.fileName));
    const currentServiceKeys = new Set(
      endpointGroups.flatMap((group) =>
        group.services.map((service) => serviceExpansionKey(group.fileName, service.serviceName)),
      ),
    );
    const addedFileNames = [...currentFileNames].filter((name) => !knownFileNamesRef.current.has(name));
    const addedServiceKeys = [...currentServiceKeys].filter((key) => !knownServiceKeysRef.current.has(key));
    if (addedFileNames.length > 0) {
      setExpandedFileNames((current) => new Set([...current, ...addedFileNames]));
    }
    if (addedServiceKeys.length > 0) {
      setExpandedServiceKeys((current) => new Set([...current, ...addedServiceKeys]));
    }
    knownFileNamesRef.current = currentFileNames;
    knownServiceKeysRef.current = currentServiceKeys;
  }, [endpointGroups]);

  const closeContextMenu = () => {
    setContextAnchor(null);
    setContextTarget(null);
  };

  const resetCreate = useCallback(() => {
    setCreateName("");
    setCreateFiles([]);
    setCreateError("");
    setCreateAssessment(null);
    setCreateRevisionPlan(null);
    setCreateRevisionLabel("");
    setCreateUpdateExistingRequests(true);
    if (createFileInputRef.current) createFileInputRef.current.value = "";
    if (createFolderInputRef.current) createFolderInputRef.current.value = "";
  }, []);

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    resetCreate();
  }, [resetCreate]);

  const openCreate = useCallback(() => {
    resetCreate();
    setCreateOpen(true);
  }, [resetCreate]);

  useEffect(() => {
    const openImportDialog = (event: Event) => {
      const mode = event instanceof CustomEvent && event.detail?.mode === "folder" ? "folder" : "files";
      resetCreate();
      setCreateOpen(true);
      window.requestAnimationFrame(() => {
        if (mode === "folder") createFolderInputRef.current?.click();
        else createFileInputRef.current?.click();
      });
    };
    window.addEventListener("layang:open-proto-import", openImportDialog);
    return () => window.removeEventListener("layang:open-proto-import", openImportDialog);
  }, [resetCreate]);

  const readFiles = async (event: ChangeEvent<HTMLInputElement>, mode: "create" | "update") => {
    try {
      const selectedFiles = Array.from(event.target.files ?? []).filter((file) =>
        file.name.toLowerCase().endsWith(".proto"),
      );
      if (selectedFiles.length === 0) throw new Error("Select one or more .proto files.");
      const sources = await Promise.all(
        selectedFiles.map(async (file) => ({
          name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
          text: await file.text(),
        })),
      );
      if (mode === "create") {
        loadProtoFiles(sources);
        const firstPath = sources[0]?.name.replaceAll("\\", "/") ?? "Proto Schema";
        const rootName = firstPath.includes("/") ? firstPath.split("/")[0] : firstPath.replace(/\.proto$/i, "");
        const assessment = assessProtoLibraryImport(protoLibraries, sources);
        const revisionLabel = assessment ? `Revision ${assessment.library.versions.length + 1}` : "";
        const revisionPlan = assessment
          ? prepareProtoVersionImport({
              library: assessment.library,
              baseVersion: assessment.version,
              files: sources,
              versionLabel: revisionLabel,
              collections,
              importMode: "complete-revision",
              allowDuplicateChecksum: assessment.kind === "exact",
            })
          : null;
        setCreateFiles(sources);
        setCreateName((current) => current.trim() || rootName || "Proto Schema");
        setCreateAssessment(assessment);
        setCreateRevisionLabel(revisionLabel);
        setCreateRevisionPlan(revisionPlan);
        setCreateError("");
      } else {
        setUpdateFiles(sources);
        setUpdateError("");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (mode === "create") {
        setCreateFiles([]);
        setCreateAssessment(null);
        setCreateRevisionPlan(null);
        setCreateError(message);
      } else {
        setUpdateFiles([]);
        setUpdateError(message);
      }
    } finally {
      event.target.value = "";
    }
  };

  const submitCreate = () => {
    if (createFiles.length === 0) return;
    try {
      onCreateLibrary(createName.trim() || "Proto Schema", "Revision 1", createFiles);
      closeCreate();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    }
  };

  const useExistingSchema = () => {
    if (!createAssessment) return;
    onSelectLibraryVersion(createAssessment.library.id, createAssessment.version.id);
    const firstFile = [...createAssessment.version.files].sort((left, right) => left.name.localeCompare(right.name))[0];
    if (firstFile) onOpenProto(firstFile);
    closeCreate();
  };

  const submitCreateRevision = () => {
    if (!createAssessment || createFiles.length === 0) return;
    try {
      const plan = prepareProtoVersionImport({
        library: createAssessment.library,
        baseVersion: createAssessment.version,
        files: createFiles,
        versionLabel: createRevisionLabel.trim() || `Revision ${createAssessment.library.versions.length + 1}`,
        collections,
        importMode: "complete-revision",
        allowDuplicateChecksum: createAssessment.kind === "exact",
      });
      const selectedRequestIds = createUpdateExistingRequests
        ? new Set(plan.impacts.filter((impact) => impact.canUpdate).map((impact) => impact.requestId))
        : new Set<string>();
      onApplyVersionImport(plan, selectedRequestIds, true);
      closeCreate();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    }
  };

  const submitUpdate = () => {
    if (!selectedLibrary || !selectedVersion || updateFiles.length === 0) return;
    try {
      const plan = prepareProtoVersionImport({
        library: selectedLibrary,
        baseVersion: selectedVersion,
        files: updateFiles,
        versionLabel: `Revision ${selectedLibrary.versions.length + 1}`,
        collections,
        importMode: "changed-files",
      });
      const selectedRequestIds = updateExistingRequests
        ? new Set(plan.impacts.filter((impact) => impact.canUpdate).map((impact) => impact.requestId))
        : new Set<string>();
      onApplyVersionImport(plan, selectedRequestIds, true);
      setUpdateOpen(false);
      setUpdateFiles([]);
      setUpdateError("");
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : String(error));
    }
  };

  const openDeleteLibrary = (libraryId: string) => {
    setDeleteLibraryId(libraryId);
    setDeleteError("");
    setDeleteOpen(true);
  };

  const submitDelete = () => {
    if (!deleteLibrary) return;
    const result = onDeleteLibrary(deleteLibrary.id);
    if (!result.ok) {
      setDeleteError(result.reason);
      return;
    }
    setDeleteOpen(false);
    setDeleteLibraryId("");
    setDeleteError("");
  };

  const openRequestDialog = (method: RpcMethodInfo) => {
    setRequestMethod(method);
    setRequestCollectionId(collections[0]?.id ?? "");
    setRequestFolderId("");
    const defaultCollection = collections[0];
    setRequestName(
      uniqueCollectionRequestName(method.methodName, defaultCollection?.requests.map((request) => request.name) ?? []),
    );
  };

  const submitRequest = () => {
    if (!requestMethod || !requestCollectionId) return;
    onCreateRequestFromMethod(
      requestCollectionId,
      requestMethod,
      requestFolderId || null,
      requestName.trim() ||
        uniqueCollectionRequestName(
          requestMethod.methodName,
          requestCollection?.requests.map((request) => request.name) ?? [],
        ),
    );
    setRequestMethod(null);
  };

  const createSchemaDialog = (
    <Dialog open={createOpen} onClose={closeCreate} fullWidth maxWidth="xl">
      <DialogTitle>Add proto schema</DialogTitle>
      <DialogContent>
        <Stack spacing={1.15} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Choose proto files or a folder.
          </Typography>
          <input
            ref={createFileInputRef}
            type="file"
            accept=".proto,text/x-protobuf"
            multiple
            hidden
            onChange={(event) => void readFiles(event, "create")}
          />
          <input
            ref={createFolderInputRef}
            type="file"
            accept=".proto,text/x-protobuf"
            multiple
            hidden
            {...{ webkitdirectory: "", directory: "" }}
            onChange={(event) => void readFiles(event, "create")}
          />
          <Stack direction="row" spacing={0.75}>
            <Button variant="outlined" onClick={() => createFileInputRef.current?.click()}>
              Choose files
            </Button>
            <Button variant="outlined" onClick={() => createFolderInputRef.current?.click()}>
              Choose folder
            </Button>
          </Stack>
          {createFiles.length > 0 && (
            <>
              <TextField
                size="small"
                label="Schema name"
                value={createName}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setCreateName(event.target.value)}
              />
              <Typography variant="body2" color="text.secondary">
                {createFiles.length} proto file{createFiles.length === 1 ? "" : "s"} ready.
              </Typography>
            </>
          )}
          {createAssessment && (
            <Paper variant="outlined" sx={{ p: 1.1 }}>
              <Stack spacing={0.85}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={0.75} alignItems={{ sm: "center" }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {createAssessment.kind === "exact"
                        ? "Schema already exists"
                        : createAssessment.kind === "equivalent"
                          ? "Equivalent schema found"
                          : "Possible revision found"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Matches {createAssessment.library.name} · {createAssessment.version.version} ·{" "}
                      {Math.round(createAssessment.similarity * 100)}% structural similarity
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    color={createAssessment.kind === "revision-candidate" ? "warning" : "success"}
                    label={createAssessment.kind === "revision-candidate" ? "revision candidate" : "duplicate"}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {createAssessment.reason}
                </Typography>
                <ProtoSideBySideDiff
                  previousFiles={createAssessment.version.files}
                  nextFiles={createRevisionPlan?.candidateVersion.files ?? createFiles}
                  plan={createRevisionPlan}
                />
                {createAssessment.kind === "revision-candidate" && (
                  <TextField
                    size="small"
                    label="New revision label"
                    value={createRevisionLabel}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setCreateRevisionLabel(event.target.value)}
                  />
                )}

                {createRevisionPlan && createAssessment.kind === "revision-candidate" && (
                  <>
                    <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
                      <Chip size="small" color="error" label={`${createRevisionPlan.diff.summary.breaking} breaking`} />
                      <Chip size="small" color="warning" label={`${createRevisionPlan.diff.summary.review} review`} />
                      <Chip
                        size="small"
                        color="success"
                        label={`${createRevisionPlan.diff.summary.compatible} compatible`}
                      />
                      <Chip
                        size="small"
                        label={`${createRevisionPlan.impacts.length} request impact${createRevisionPlan.impacts.length === 1 ? "" : "s"}`}
                      />
                    </Stack>

                    <Stack spacing={0.35} sx={{ maxHeight: 180, overflow: "auto" }}>
                      {createRevisionPlan.fileChanges
                        .filter((change) => change.action !== "unchanged")
                        .slice(0, 8)
                        .map((change) => (
                          <Stack
                            key={`${change.action}:${change.previousName ?? ""}:${change.name}`}
                            direction="row"
                            spacing={0.65}
                            alignItems="center"
                          >
                            <Chip
                              size="small"
                              color={
                                change.action === "added"
                                  ? "success"
                                  : change.action === "removed"
                                    ? "error"
                                    : "warning"
                              }
                              label={change.action}
                              sx={{ minWidth: 72 }}
                            />
                            <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
                              {change.action === "renamed" && change.previousName
                                ? `${change.previousName} → ${change.name}`
                                : change.name}
                            </Typography>
                          </Stack>
                        ))}
                      {createRevisionPlan.diff.changes.slice(0, 8).map((change: ProtoSchemaChange) => (
                        <Stack key={change.id} direction="row" spacing={0.65} alignItems="flex-start">
                          <Chip
                            size="small"
                            color={
                              change.severity === "breaking"
                                ? "error"
                                : change.severity === "review"
                                  ? "warning"
                                  : "success"
                            }
                            label={change.severity}
                            sx={{ minWidth: 72 }}
                          />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="caption"
                              fontWeight={600}
                              sx={{ display: "block", overflowWrap: "anywhere" }}
                            >
                              {change.entity}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {change.detail}
                            </Typography>
                          </Box>
                        </Stack>
                      ))}
                      {createRevisionPlan.diff.changes.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                          No contract changes. Only source files or layout differ.
                        </Typography>
                      )}
                    </Stack>

                    {createRevisionPlan.impacts.length > 0 && (
                      <Button
                        size="small"
                        variant={createUpdateExistingRequests ? "contained" : "outlined"}
                        onClick={() => setCreateUpdateExistingRequests((current) => !current)}
                      >
                        {createUpdateExistingRequests ? "Update compatible requests" : "Keep requests pinned"}
                      </Button>
                    )}
                  </>
                )}
              </Stack>
            </Paper>
          )}
          {createError && (
            <Typography variant="body2" color="error">
              {createError}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={closeCreate}>
          Cancel
        </Button>
        {!createAssessment && (
          <Button variant="contained" disabled={createFiles.length === 0} onClick={submitCreate}>
            Add schema
          </Button>
        )}
        {createAssessment?.kind === "revision-candidate" && (
          <Button variant="outlined" onClick={submitCreate}>
            Create separate schema
          </Button>
        )}
        {createAssessment && (
          <Button
            variant={createAssessment.kind === "revision-candidate" ? "outlined" : "contained"}
            onClick={useExistingSchema}
          >
            {createAssessment.kind === "revision-candidate" ? "Use existing" : "Use existing"}
          </Button>
        )}
        {createRevisionPlan && (
          <Button
            variant={createAssessment?.kind === "revision-candidate" ? "contained" : "outlined"}
            onClick={submitCreateRevision}
          >
            Create revision
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );

  if (protoLibraries.length === 0) {
    return (
      <>
        <Stack spacing={1} sx={{ p: 1 }}>
          <Button variant="contained" onClick={openCreate}>
            Add schema
          </Button>
          <SmallEmpty body="No proto schema uploaded yet. Add it once and reuse it from any collection." />
        </Stack>
        {createSchemaDialog}
      </>
    );
  }

  const queryActive = Boolean(filterQuery.trim());
  const totalMethods = endpointGroups.reduce((sum, group) => sum + group.methodCount, 0);
  const openFirstFile = (files: ProtoSourceFile[]) => {
    const firstFile = [...files].sort((a, b) => a.name.localeCompare(b.name))[0];
    if (firstFile) onOpenProto(firstFile);
  };
  const openMethodSource = (method: RpcMethodInfo) => {
    const sourceFile = findProtoFileForMethod(protoFiles, method);
    if (sourceFile) onOpenProto(sourceFile);
  };

  return (
    <>
      <Stack direction="row" spacing={0.5} sx={{ px: 0.2, pb: 0.55 }}>
        <Button
          size="small"
          variant="outlined"
          disabled={!selectedLibrary}
          onClick={() => {
            setUpdateFiles([]);
            setUpdateError("");
            setUpdateOpen(true);
          }}
        >
          Update
        </Button>
        <Button
          size="small"
          color="error"
          variant="text"
          disabled={!selectedLibrary}
          onClick={() => selectedLibrary && openDeleteLibrary(selectedLibrary.id)}
        >
          Delete
        </Button>
      </Stack>

      <Stack spacing={0.25}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.2, pb: 0.3 }}>
          Uploaded schemas
        </Typography>
        {protoLibraries.map((library) => {
          const version =
            (library.id === activeLibraryId
              ? library.versions.find((item) => item.id === activeVersionId)
              : undefined) ??
            library.versions.find((item) => item.id === library.defaultVersionId) ??
            library.versions[0];
          const usageCount = collections.reduce(
            (count, collection) =>
              count + collection.requests.filter((request) => request.grpc?.libraryId === library.id).length,
            0,
          );
          return (
            <Box
              key={library.id}
              sx={{
                display: "flex",
                alignItems: "center",
                minWidth: 0,
                borderRadius: 1,
                mb: 0.05,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <ListItemButton
                selected={selectedLibrary?.id === library.id}
                onClick={() => {
                  setSelectedLibraryId(library.id);
                  if (version) {
                    onSelectLibraryVersion(library.id, version.id);
                    openFirstFile(version.files);
                  }
                }}
                sx={{
                  ...itemButtonSx,
                  flex: 1,
                  minWidth: 0,
                  mb: 0,
                  alignItems: "flex-start",
                  "&:hover": { bgcolor: "transparent" },
                }}
              >
                <ListItemIcon sx={{ minWidth: 20, pt: 0.2 }}>
                  <ProtoIcon sx={{ fontSize: 15 }} color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary={library.name}
                  secondary={`${library.versions.length} revision${library.versions.length === 1 ? "" : "s"} · used by ${usageCount} request${usageCount === 1 ? "" : "s"}`}
                  primaryTypographyProps={{ noWrap: true, sx: { ...labelSx, fontWeight: 600 } }}
                  secondaryTypographyProps={{ noWrap: true, sx: { fontSize: 11 } }}
                />
              </ListItemButton>
              <IconButton
                size="small"
                color="error"
                aria-label={`Delete ${library.name}`}
                title={`Delete ${library.name}`}
                onClick={() => openDeleteLibrary(library.id)}
                sx={{
                  flex: "0 0 auto",
                  mr: 0.25,
                  p: 0.35,
                  opacity: selectedLibrary?.id === library.id ? 1 : 0.55,
                  "&:hover": { opacity: 1 },
                  "&:focus-visible": { opacity: 1 },
                }}
              >
                <Delete sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          );
        })}

        {selectedLibrary && selectedVersion && (
          <Stack direction="row" spacing={0.7} alignItems="center" sx={{ px: 0.2, py: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} noWrap>
              {selectedLibrary.name}
            </Typography>
            <FormControl size="small" sx={{ width: 128 }}>
              <Select
                value={selectedVersion.id}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  const versionId = String(event.target.value);
                  const version = selectedLibrary.versions.find((item) => item.id === versionId);
                  onSelectLibraryVersion(selectedLibrary.id, versionId);
                  if (version) openFirstFile(version.files);
                }}
              >
                {selectedLibrary.versions.map((version) => (
                  <MenuItem key={version.id} value={version.id}>
                    {version.version}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        )}

        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 0.2, pb: 0.4 }}
        >
          <Typography variant="caption" color="text.secondary" noWrap>
            {protoFiles.length} file{protoFiles.length === 1 ? "" : "s"} · {totalMethods} RPC method
            {totalMethods === 1 ? "" : "s"}
          </Typography>
          <Stack direction="row" spacing={0.2}>
            <Button
              size="small"
              variant="text"
              onClick={() => {
                setExpandedFileNames(new Set(endpointGroups.map((group) => group.fileName)));
                setExpandedServiceKeys(
                  new Set(
                    endpointGroups.flatMap((group) =>
                      group.services.map((service) => serviceExpansionKey(group.fileName, service.serviceName)),
                    ),
                  ),
                );
              }}
              sx={{ minWidth: 0, px: 0.55, py: 0.15 }}
            >
              Expand
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => {
                setExpandedFileNames(new Set());
                setExpandedServiceKeys(new Set());
              }}
              sx={{ minWidth: 0, px: 0.55, py: 0.15 }}
            >
              Collapse
            </Button>
          </Stack>
        </Stack>

        {endpointGroups.length === 0 ? (
          <SmallEmpty body="No matching file, service, or method." />
        ) : (
          endpointGroups.map((fileGroup) => {
            const protoFile = fileGroup.protoFile;
            const imports = parseProtoImports(protoFile?.text ?? "");
            const fileExpanded = queryActive || expandedFileNames.has(fileGroup.fileName);
            return (
              <Box key={fileGroup.fileName}>
                <Stack
                  direction="row"
                  spacing={0.55}
                  alignItems="center"
                  onContextMenu={(event: ReactMouseEvent<HTMLElement>) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setContextAnchor(event.currentTarget);
                    setContextTarget({ type: "file", fileGroup });
                  }}
                  onClick={() => protoFile && onOpenProto(protoFile)}
                  sx={{
                    ...rowSx,
                    cursor: protoFile ? "pointer" : "default",
                    bgcolor: selectedProtoFileName === fileGroup.fileName ? "action.selected" : undefined,
                  }}
                >
                  <IconButton
                    size="small"
                    aria-label={`${fileExpanded ? "Collapse" : "Expand"} ${fileGroup.fileName}`}
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setExpandedFileNames((current) => toggleSetValue(current, fileGroup.fileName));
                    }}
                    sx={{ p: 0.1 }}
                  >
                    <KeyboardArrowRight
                      sx={{
                        fontSize: 14,
                        transform: fileExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 120ms ease",
                      }}
                    />
                  </IconButton>
                  <Storage sx={{ fontSize: 14 }} color="primary" />
                  <Typography
                    fontWeight={500}
                    noWrap
                    title={fileGroup.fileName}
                    sx={{ ...labelSx, flex: 1, minWidth: 0 }}
                  >
                    {fileGroup.fileName}
                  </Typography>
                  <Chip
                    size="small"
                    label={fileGroup.methodCount}
                    sx={{ height: 18, "& .MuiChip-label": { px: 0.65 } }}
                  />
                </Stack>

                {fileExpanded && (
                  <>
                    {imports.length > 0 && (
                      <Stack
                        direction="row"
                        spacing={0.35}
                        alignItems="center"
                        flexWrap="wrap"
                        useFlexGap
                        sx={{ pl: 3.2, py: 0.35 }}
                      >
                        {imports.map((name) => {
                          const importedFile = protoFiles.find(
                            (file) => file.name === name || file.name.endsWith(`/${name}`),
                          );
                          return (
                            <Chip
                              key={name}
                              size="small"
                              label={name}
                              variant="outlined"
                              onClick={() => importedFile && onOpenProto(importedFile)}
                              color={importedFile ? "primary" : "default"}
                              sx={{ maxWidth: "100%", height: 20 }}
                            />
                          );
                        })}
                      </Stack>
                    )}
                    <Stack spacing={0.1} sx={{ pl: 2.6 }}>
                      {fileGroup.services.map((service) => {
                        const expansionKey = serviceExpansionKey(fileGroup.fileName, service.serviceName);
                        const serviceExpanded = queryActive || expandedServiceKeys.has(expansionKey);
                        return (
                          <Box key={service.serviceName}>
                            <Stack
                              direction="row"
                              spacing={0.5}
                              alignItems="center"
                              onClick={() => {
                                const sourceFile = findProtoFileForService(protoFiles, service.methods);
                                if (sourceFile) onOpenProto(sourceFile);
                              }}
                              sx={{ ...rowSx, cursor: service.methods.length > 0 ? "pointer" : "default" }}
                            >
                              <IconButton
                                size="small"
                                aria-label={`${serviceExpanded ? "Collapse" : "Expand"} ${service.serviceName}`}
                                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setExpandedServiceKeys((current) => toggleSetValue(current, expansionKey));
                                }}
                                sx={{ p: 0.1 }}
                              >
                                <KeyboardArrowRight
                                  sx={{
                                    fontSize: 13,
                                    transform: serviceExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                    transition: "transform 120ms ease",
                                  }}
                                />
                              </IconButton>
                              <Schema sx={{ fontSize: 13 }} color="secondary" />
                              <Typography
                                fontWeight={500}
                                noWrap
                                title={service.serviceName}
                                sx={{ ...labelSx, flex: 1, minWidth: 0 }}
                              >
                                {service.serviceName}
                              </Typography>
                              <Chip
                                size="small"
                                label={service.methods.length}
                                sx={{ height: 18, "& .MuiChip-label": { px: 0.65 } }}
                              />
                            </Stack>

                            {serviceExpanded && (
                              <List dense disablePadding sx={{ pl: 2.15 }}>
                                {service.methods.map((method) => {
                                  const sourceFile = findProtoFileForMethod(protoFiles, method);
                                  const active = Boolean(sourceFile && selectedProtoFileName === sourceFile.name);
                                  return (
                                    <Box
                                      key={`${methodKey(method)}-${method.sourceFile ?? fileGroup.fileName}`}
                                      role="button"
                                      tabIndex={0}
                                      aria-current={active ? "true" : undefined}
                                      title={`${method.serviceName}/${method.methodName} (${method.requestType} -> ${method.responseType})`}
                                      onClick={() => openMethodSource(method)}
                                      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
                                        if (event.key !== "Enter" && event.key !== " ") return;
                                        event.preventDefault();
                                        openMethodSource(method);
                                      }}
                                      onContextMenu={(event: ReactMouseEvent<HTMLElement>) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setContextAnchor(event.currentTarget);
                                        setContextTarget({ type: "method", method });
                                      }}
                                      className={`shadcn-list-button flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-accent text-accent-foreground" : ""}`}
                                      sx={itemButtonSx}
                                    >
                                      <ListItemIcon sx={{ minWidth: 16, width: 16 }}>
                                        {method.responseStream ? (
                                          <Stream sx={{ fontSize: 14 }} color="secondary" />
                                        ) : (
                                          <Terminal sx={{ fontSize: 14 }} color="primary" />
                                        )}
                                      </ListItemIcon>
                                      <Chip
                                        size="small"
                                        label={method.responseStream || method.requestStream ? "STRM" : "RPC"}
                                        sx={{
                                          height: 20,
                                          minWidth: 36,
                                          "& .MuiChip-label": { px: 0.45, fontSize: 11 },
                                        }}
                                      />
                                      <ListItemText
                                        primary={method.methodName}
                                        secondary={`${method.requestType.split(".").pop()} → ${method.responseType.split(".").pop()}`}
                                        primaryTypographyProps={{
                                          noWrap: true,
                                          title: method.methodName,
                                          sx: { ...labelSx, fontWeight: 500 },
                                        }}
                                        secondaryTypographyProps={{ noWrap: true, sx: { fontSize: 11 } }}
                                      />
                                      <IconButton
                                        size="small"
                                        title="Add request to collection"
                                        aria-label={`Add ${method.methodName} to collection`}
                                        disabled={collections.length === 0}
                                        onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          openRequestDialog(method);
                                        }}
                                        sx={{ p: 0.15 }}
                                      >
                                        <Add sx={{ fontSize: 14 }} />
                                      </IconButton>
                                    </Box>
                                  );
                                })}
                              </List>
                            )}
                          </Box>
                        );
                      })}
                    </Stack>
                  </>
                )}
              </Box>
            );
          })
        )}
      </Stack>

      <Menu anchorEl={contextAnchor} open={Boolean(contextAnchor)} onClose={closeContextMenu}>
        {contextTarget?.type === "file" ? (
          <>
            {contextTarget.fileGroup.protoFile && (
              <MenuItem
                onClick={() => {
                  const file = contextTarget.fileGroup.protoFile;
                  closeContextMenu();
                  if (file) onOpenProto(file);
                }}
              >
                <ProtoIcon fontSize="small" /> View proto
              </MenuItem>
            )}
            {contextTarget.fileGroup.protoFile && (
              <MenuItem
                onClick={() => {
                  const file = contextTarget.fileGroup.protoFile;
                  closeContextMenu();
                  if (file) onExportProto(file);
                }}
              >
                <Download fontSize="small" /> Export proto
              </MenuItem>
            )}
          </>
        ) : contextTarget?.type === "method" ? (
          <>
            <MenuItem
              onClick={() => {
                const method = contextTarget.method;
                closeContextMenu();
                openMethodSource(method);
              }}
            >
              <ProtoIcon fontSize="small" /> Open source
            </MenuItem>
            <MenuItem
              onClick={() => {
                const method = contextTarget.method;
                closeContextMenu();
                openRequestDialog(method);
              }}
            >
              <Add fontSize="small" /> Add to collection
            </MenuItem>
          </>
        ) : null}
      </Menu>

      {createSchemaDialog}

      <Dialog open={updateOpen} onClose={() => setUpdateOpen(false)} fullWidth maxWidth="xl">
        <DialogTitle>Update {selectedLibrary?.name ?? "proto schema"}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.1} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Add changed files. Unchanged files are kept in the new revision.
            </Typography>
            <input
              ref={updateFileInputRef}
              type="file"
              accept=".proto,text/x-protobuf"
              multiple
              hidden
              onChange={(event) => void readFiles(event, "update")}
            />
            <input
              ref={updateFolderInputRef}
              type="file"
              accept=".proto,text/x-protobuf"
              multiple
              hidden
              {...{ webkitdirectory: "", directory: "" }}
              onChange={(event) => void readFiles(event, "update")}
            />
            <Stack direction="row" spacing={0.75}>
              <Button variant="outlined" onClick={() => updateFileInputRef.current?.click()}>
                Choose files
              </Button>
              <Button variant="outlined" onClick={() => updateFolderInputRef.current?.click()}>
                Choose folder
              </Button>
            </Stack>
            {updateFiles.length > 0 && (
              <Typography variant="body2">
                {updateFiles.length} changed file{updateFiles.length === 1 ? "" : "s"} ready.
              </Typography>
            )}
            {selectedVersion && updatePreviewPlan && (
              <ProtoSideBySideDiff
                previousFiles={selectedVersion.files}
                nextFiles={updatePreviewPlan.candidateVersion.files}
                plan={updatePreviewPlan}
              />
            )}
            <Button
              size="small"
              variant={updateExistingRequests ? "contained" : "outlined"}
              onClick={() => setUpdateExistingRequests((current) => !current)}
            >
              {updateExistingRequests ? "Update compatible requests" : "Keep requests pinned"}
            </Button>
            {updateError && (
              <Typography variant="body2" color="error">
                {updateError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdateOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={updateFiles.length === 0} onClick={submitUpdate}>
            Create revision
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteLibraryId("");
          setDeleteError("");
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete {deleteLibrary?.name ?? "schema"}?</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 0.5 }}>
            <Typography variant="body2">All revisions will be removed from this workspace.</Typography>
            {deleteDependencies.length > 0 ? (
              <>
                <Typography variant="body2" color="warning.main">
                  {deleteDependencies.length} saved request{deleteDependencies.length === 1 ? "" : "s"} use this schema.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Requests remain saved but become unavailable until reassigned.
                </Typography>
                <Stack spacing={0.25} sx={{ maxHeight: 96, overflowY: "auto" }}>
                  {deleteDependencies.slice(0, 5).map((dependency) => (
                    <Typography
                      key={`${dependency.collectionId}-${dependency.requestId}-${dependency.methodFullName}`}
                      variant="caption"
                      color="text.secondary"
                      noWrap
                    >
                      {dependency.collectionName} / {dependency.requestName}
                    </Typography>
                  ))}
                  {deleteDependencies.length > 5 && (
                    <Typography variant="caption" color="text.secondary">
                      +{deleteDependencies.length - 5} more
                    </Typography>
                  )}
                </Stack>
              </>
            ) : (
              <Typography variant="caption" color="text.secondary">
                No saved requests use this schema.
              </Typography>
            )}
            {deleteError && (
              <Typography variant="body2" color="error">
                {deleteError}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteOpen(false);
              setDeleteLibraryId("");
              setDeleteError("");
            }}
          >
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={submitDelete}>
            Delete schema
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(requestMethod)} onClose={() => setRequestMethod(null)} fullWidth maxWidth="sm">
        <DialogTitle>Add gRPC request</DialogTitle>
        <DialogContent>
          <Stack spacing={1.1} sx={{ pt: 0.5 }}>
            <TextField
              size="small"
              label="Request name"
              value={requestName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setRequestName(event.target.value)}
            />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Collection
              </Typography>
              <Select
                value={requestCollectionId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  setRequestCollectionId(String(event.target.value));
                  setRequestFolderId("");
                }}
                fullWidth
                size="small"
              >
                {collections.map((collection) => (
                  <MenuItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Folder
              </Typography>
              <Select
                value={requestFolderId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setRequestFolderId(String(event.target.value))}
                fullWidth
                size="small"
              >
                <MenuItem value="">Collection root</MenuItem>
                {(requestCollection?.folders ?? []).map((folder) => (
                  <MenuItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Paper variant="outlined" sx={{ p: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                {requestMethod?.serviceName}/{requestMethod?.methodName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Current schema revision
              </Typography>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRequestMethod(null)}>Cancel</Button>
          <Button variant="contained" disabled={!requestCollectionId || !requestName.trim()} onClick={submitRequest}>
            Add request
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Renders a read-only proto source preview. */
export function ProtoSourceBlock({ file, fullHeight = false }: { file: ProtoSourceFile; fullHeight?: boolean }) {
  return (
    <div className={fullHeight ? "source-preview source-preview--fill" : "source-preview"}>
      <div className="source-preview__meta">
        <span className="source-preview__pill">{file.name}</span>
        <span>{file.text.length.toLocaleString()} chars</span>
      </div>
      <pre
        className={fullHeight ? "code-viewer code-viewer--proto code-viewer--fill" : "code-viewer code-viewer--proto"}
      >
        <code>{file.text.trim()}</code>
      </pre>
    </div>
  );
}

/** Extracts import statements from a proto source file. */
function parseProtoImports(source: string): string[] {
  return Array.from(source.matchAll(/^\s*import\s+(?:public\s+|weak\s+)?"([^"]+)"\s*;/gm))
    .map((match) => match[1])
    .filter((fileName) => !isBundledWellKnownProto(fileName));
}

function isBundledWellKnownProto(fileName: string): boolean {
  switch (fileName) {
    case "google/protobuf/any.proto":
    case "google/protobuf/duration.proto":
    case "google/protobuf/empty.proto":
    case "google/protobuf/field_mask.proto":
    case "google/protobuf/struct.proto":
    case "google/protobuf/timestamp.proto":
    case "google/protobuf/wrappers.proto":
      return true;
    default:
      return false;
  }
}

function serviceExpansionKey(fileName: string, serviceName: string): string {
  return `${fileName}::${serviceName}`;
}

function findProtoFileForMethod(protoFiles: ProtoSourceFile[], method: RpcMethodInfo): ProtoSourceFile | undefined {
  if (method.sourceFile) {
    const exact = protoFiles.find((file) => file.name === method.sourceFile);
    if (exact) return exact;
    const bySuffix = protoFiles.find((file) => file.name.endsWith(`/${method.sourceFile}`));
    if (bySuffix) return bySuffix;
  }
  return protoFiles.find((file) => file.text.includes(`rpc ${method.methodName}`)) ?? protoFiles[0];
}

function findProtoFileForService(protoFiles: ProtoSourceFile[], methods: RpcMethodInfo[]): ProtoSourceFile | undefined {
  for (const method of methods) {
    const file = findProtoFileForMethod(protoFiles, method);
    if (file) return file;
  }
  return protoFiles[0];
}

function toggleSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function SmallEmpty({ body }: { body: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
    </Paper>
  );
}
