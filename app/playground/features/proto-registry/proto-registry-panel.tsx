"use client";

import type { MouseEvent as ReactMouseEvent } from "react";

import { Add, Delete, Download, ProtoIcon, Schema, Storage, Stream, Terminal } from "@/components/shadcn/icons";
import {
  Box,
  Chip,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@/components/shadcn/compat";
import type { LoadedProto, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import type { ApiCollection, ApiCollectionRequest } from "../../shared/workbench-types";

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

/** Groups loaded RPC methods by proto file and service for the endpoint tree. */
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

/** Renders the proto registry tree and opens proto files in a preview dialog. */
export function RegistryPanel({
  protoFiles,
  collections,
  endpointGroups,
  selectedMethodKey,
  loaded,
  onRemoveProto,
  onOpenProto,
  onExportProto,
  onSelectMethod,
  selectedCollectionRequestId,
  onSelectCollectionRequest,
  onAddCollectionRequest,
  onRemoveCollection,
}: {
  protoFiles: ProtoSourceFile[];
  collections: ApiCollection[];
  endpointGroups: EndpointFileGroup[];
  selectedMethodKey: string;
  loaded: LoadedProto | null;
  onRemoveProto: (name: string) => void;
  onOpenProto: (file: ProtoSourceFile) => void;
  onExportProto: (file: ProtoSourceFile) => void;
  onSelectMethod: (method: RpcMethodInfo) => void;
  selectedCollectionRequestId?: string;
  onSelectCollectionRequest: (collection: ApiCollection, request: ApiCollectionRequest) => void;
  onAddCollectionRequest: (collectionId: string) => void;
  onImportGrpcRequest: (collectionId: string) => void;
  onRemoveCollection: (collectionId: string) => void;
}) {
  if (protoFiles.length === 0 && collections.length === 0)
    return (
      <SmallEmpty body="No collection yet. Use the + menu to add a WebSocket collection or import a gRPC proto." />
    );

  const summarySx = {
    cursor: "pointer",
    listStyle: "none",
    "&::-webkit-details-marker": { display: "none" },
  };

  return (
    <Stack spacing={0.25}>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ px: 0.2, pb: 0.4 }}>
        <Typography variant="caption" color="text.secondary" noWrap>
          Collections
        </Typography>
        <Chip size="small" label={loaded?.methods.length ?? 0} />
      </Stack>
      {collections.map((collection) => (
        <Box key={collection.id} component="details" open sx={{ "&[open] > summary": { color: "text.primary" } }}>
          <Box component="summary" sx={summarySx}>
            <Stack
              direction="row"
              spacing={0.55}
              alignItems="center"
              sx={{ minHeight: 22, px: 0.3, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}
            >
              <Storage sx={{ fontSize: 14 }} color="primary" />
              <Typography fontWeight={520} fontSize={11.3} noWrap title={collection.name} sx={{ flex: 1, minWidth: 0 }}>
                {collection.name}
              </Typography>
              <Chip
                size="small"
                label={collection.requests.length}
                sx={{ height: 18, "& .MuiChip-label": { px: 0.65 } }}
              />
              <IconButton
                size="small"
                title="Add WebSocket request"
                aria-label={`Add WebSocket request to ${collection.name}`}
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onAddCollectionRequest(collection.id);
                }}
                sx={{ p: 0.2 }}
              >
                <Add sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton
                size="small"
                title="Delete collection"
                color="error"
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveCollection(collection.id);
                }}
                sx={{ p: 0.2 }}
              >
                <Delete sx={{ fontSize: 14 }} />
              </IconButton>
            </Stack>
          </Box>
          <Stack spacing={0.1} sx={{ pl: 1.15, pt: 0.1, pb: 0.35 }}>
            <List dense disablePadding className="collection-request-list" sx={{ pl: 0.45 }}>
              {collection.requests.map((request) => {
                const active = selectedCollectionRequestId === request.id;
                return (
                  <ListItemButton
                    key={request.id}
                    selected={active}
                    title={`${request.kind.toUpperCase()} ${request.url}`}
                    onClick={() => onSelectCollectionRequest(collection, request)}
                    sx={{
                      minHeight: 22,
                      borderRadius: 1,
                      mb: 0.03,
                      px: 0.35,
                      py: 0,
                      "&.Mui-selected": { bgcolor: "action.selected" },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 22 }}>
                      {request.kind === "websocket" ? (
                        <Stream sx={{ fontSize: 13 }} color="primary" />
                      ) : (
                        <Terminal sx={{ fontSize: 13 }} color="primary" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={`${requestKindBadge(request)}  ${request.name}`}
                      primaryTypographyProps={{
                        fontSize: 11.1,
                        fontWeight: active ? 540 : 450,
                        noWrap: true,
                        title: `${request.name} - ${request.url}`,
                      }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Stack>
        </Box>
      ))}
      {endpointGroups.length === 0 ? (
        collections.length === 0 ? (
          <SmallEmpty body="No matching collection, service, or request." />
        ) : null
      ) : (
        endpointGroups.map((fileGroup) => {
          const protoFile = fileGroup.protoFile;
          const imports = parseProtoImports(protoFile?.text ?? "");
          return (
            <Box
              key={fileGroup.fileName}
              component="details"
              open
              sx={{ "&[open] > summary": { color: "text.primary" } }}
            >
              <Box component="summary" sx={summarySx}>
                <Stack
                  direction="row"
                  spacing={0.55}
                  alignItems="center"
                  sx={{ minHeight: 23, px: 0.35, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}
                >
                  <Storage sx={{ fontSize: 14 }} color="primary" />
                  <Typography
                    fontWeight={520}
                    fontSize={11.3}
                    noWrap
                    title={fileGroup.fileName}
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {fileGroup.fileName}
                  </Typography>
                  <Chip
                    size="small"
                    label={fileGroup.methodCount}
                    sx={{ height: 18, "& .MuiChip-label": { px: 0.65 } }}
                  />
                  {protoFile && (
                    <IconButton
                      size="small"
                      title="View proto"
                      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onOpenProto(protoFile);
                      }}
                      sx={{ p: 0.25 }}
                    >
                      <ProtoIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  )}
                  {protoFile && (
                    <IconButton
                      size="small"
                      title="Export proto"
                      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onExportProto(protoFile);
                      }}
                      sx={{ p: 0.25 }}
                    >
                      <Download sx={{ fontSize: 14 }} />
                    </IconButton>
                  )}
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRemoveProto(fileGroup.fileName);
                    }}
                    sx={{ p: 0.25 }}
                  >
                    <Delete sx={{ fontSize: 14 }} />
                  </IconButton>
                </Stack>
              </Box>

              {imports.length > 0 && (
                <Stack
                  direction="row"
                  spacing={0.35}
                  alignItems="center"
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ pl: 2.2, py: 0.35 }}
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

              <Stack spacing={0.1} sx={{ pl: 1.1 }}>
                {fileGroup.services.map((service) => (
                  <Box key={service.serviceName} component="details" open>
                    <Box component="summary" sx={summarySx}>
                      <Stack
                        direction="row"
                        spacing={0.5}
                        alignItems="center"
                        sx={{ minHeight: 23, px: 0.35, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}
                      >
                        <Schema sx={{ fontSize: 13 }} color="secondary" />
                        <Typography
                          fontWeight={500}
                          fontSize={11.2}
                          noWrap
                          title={service.serviceName}
                          sx={{ flex: 1, minWidth: 0 }}
                        >
                          {service.serviceName}
                        </Typography>
                        <Chip
                          size="small"
                          label={service.methods.length}
                          sx={{ height: 18, "& .MuiChip-label": { px: 0.65 } }}
                        />
                      </Stack>
                    </Box>
                    <List dense disablePadding sx={{ pl: 1.35 }}>
                      {service.methods.map((method) => {
                        const active = selectedMethodKey === methodKey(method);
                        return (
                          <ListItemButton
                            key={`${methodKey(method)}-${method.sourceFile ?? fileGroup.fileName}`}
                            selected={active}
                            title={`${method.serviceName}/${method.methodName} (${method.requestType} -> ${method.responseType})`}
                            onClick={() => onSelectMethod(method)}
                            sx={{
                              minHeight: 24,
                              borderRadius: 1,
                              mb: 0.05,
                              px: 0.45,
                              py: 0.05,
                              "&.Mui-selected": { bgcolor: "action.selected" },
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 21 }}>
                              {method.responseStream ? (
                                <Stream sx={{ fontSize: 14 }} color="secondary" />
                              ) : (
                                <Terminal sx={{ fontSize: 14 }} color="primary" />
                              )}
                            </ListItemIcon>
                            <ListItemText
                              primary={`${method.methodName}  ·  ${method.requestType.split(".").pop()} → ${method.responseType.split(".").pop()}`}
                              primaryTypographyProps={{
                                fontSize: 11.1,
                                fontWeight: active ? 540 : 450,
                                noWrap: true,
                                title: `${method.methodName}  ·  ${method.requestType.split(".").pop()} -> ${method.responseType.split(".").pop()}`,
                              }}
                            />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  </Box>
                ))}
              </Stack>
            </Box>
          );
        })
      )}
    </Stack>
  );
}

/** Renders a read-only proto source preview. */
export function ProtoSourceBlock({ file }: { file: ProtoSourceFile }) {
  return (
    <div className="source-preview">
      <div className="source-preview__meta">
        <span className="source-preview__pill">{file.name}</span>
        <span>{file.text.length.toLocaleString()} chars</span>
      </div>
      <pre className="code-viewer code-viewer--proto">
        <code>{file.text.trim()}</code>
      </pre>
    </div>
  );
}

function requestKindBadge(request: ApiCollectionRequest): string {
  if (request.kind === "grpc") return "RPC";
  return "WS";
}

/** Extracts import statements from a proto source file. */
function parseProtoImports(source: string): string[] {
  return Array.from(source.matchAll(/^\s*import\s+(?:public\s+|weak\s+)?"([^"]+)"\s*;/gm)).map((match) => match[1]);
}

/** Renders a compact empty-state card. */
function SmallEmpty({ body }: { body: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
    </Paper>
  );
}

/** Returns the stable service/method key used throughout the workbench. */
function methodKey(method: RpcMethodInfo): string {
  return `${method.serviceName}/${method.methodName}`;
}
