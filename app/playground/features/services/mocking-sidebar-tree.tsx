"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, IconButton, InputAdornment, Stack, TextField, Typography } from "@/components/shadcn/compat";
import { WorkbenchTree, workbenchTreeGroupSx, workbenchTreeMetrics } from "@/components/workbench-ui/tree";
import { Search } from "@/components/shadcn/icons";
import { loadProtoFiles } from "@/lib/proto-loader";
import type { RpcMethodInfo } from "@/lib/types";
import { methodKey } from "../../shared/rpc-method-utils";
import type { MockServerProject, MockServerStatus, ServiceProtocol } from "../../shared/workbench-types";
import type { ProtoLibrary } from "../proto-library/proto-library-types";
import { getMockMethodScenarioFile, parseMockScenarioText } from "../mock-server/mock-scenario-model";

type MockingSchemaGroup = {
  key: string;
  libraryId: string;
  versionId: string;
  label: string;
  services: Array<{ serviceName: string; methods: RpcMethodInfo[] }>;
};

const rowSx = {
  minHeight: workbenchTreeMetrics.rowHeight,
  height: workbenchTreeMetrics.rowHeight,
  px: 0.2,
  py: 0,
  borderRadius: "2px",
  my: "1px",
  "&:hover": { bgcolor: "action.hover" },
} as const;

function Chevron({ expanded, label, onClick }: { expanded: boolean; label: string; onClick: () => void }) {
  return (
    <IconButton
      size="small"
      aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
      aria-expanded={expanded}
      onClick={onClick}
      sx={{ width: 16, minWidth: 16, height: 20, p: 0, fontSize: 11, lineHeight: 1 }}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          display: "inline-block",
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 100ms ease",
        }}
      >
        ›
      </Box>
    </IconButton>
  );
}

/** Compact VS Code-like tree for the Mocking rail context sidebar. */
export function MockingSidebarTree({
  protoLibraries,
  mockServer,
  mockServerStatus,
  selectedMethodKey,
  serviceProtocol,
  onSelectGrpcMethod,
  onSelectProtocol,
}: {
  protoLibraries: ProtoLibrary[];
  mockServer: MockServerProject;
  mockServerStatus?: MockServerStatus;
  selectedMethodKey: string;
  serviceProtocol: ServiceProtocol;
  onSelectGrpcMethod: (libraryId: string, versionId: string, method: RpcMethodInfo) => void;
  onSelectProtocol: (protocol: "grpc-mock" | "rest" | "websocket") => void;
}) {
  const groups = useMemo<MockingSchemaGroup[]>(() => {
    return (mockServer.protoSources ?? []).flatMap((source) => {
      const library = protoLibraries.find((item) => item.id === source.libraryId);
      const version = library?.versions.find((item) => item.id === source.versionId);
      if (!library || !version) return [];
      let methods: RpcMethodInfo[] = [];
      try {
        methods = loadProtoFiles(version.files).methods;
      } catch {
        methods = [];
      }
      const byService = new Map<string, RpcMethodInfo[]>();
      for (const method of methods) {
        const current = byService.get(method.serviceName) ?? [];
        current.push(method);
        byService.set(method.serviceName, current);
      }
      return [
        {
          key: `${library.id}:${version.id}`,
          libraryId: library.id,
          versionId: version.id,
          label: library.name,
          services: [...byService.entries()]
            .map(([serviceName, serviceMethods]) => ({
              serviceName,
              methods: serviceMethods.sort((a, b) => a.methodName.localeCompare(b.methodName)),
            }))
            .sort((a, b) => a.serviceName.localeCompare(b.serviceName)),
        },
      ];
    });
  }, [mockServer.protoSources, protoLibraries]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["protocol:grpc"]));
  const [query, setQuery] = useState("");
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    if (!selectedMethodKey) return;
    for (const group of groups) {
      for (const service of group.services) {
        if (!service.methods.some((method) => methodKey(method) === selectedMethodKey)) continue;
        setExpanded((current) =>
          new Set([...current, "protocol:grpc", `schema:${group.key}`, `service:${group.key}:${service.serviceName}`]),
        );
        return;
      }
    }
  }, [groups, selectedMethodKey]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => {
        const groupMatches = group.label.toLowerCase().includes(normalizedQuery);
        const services = group.services
          .map((service) => ({
            ...service,
            methods: groupMatches || service.serviceName.toLowerCase().includes(normalizedQuery)
              ? service.methods
              : service.methods.filter((method) => method.methodName.toLowerCase().includes(normalizedQuery)),
          }))
          .filter((service) => groupMatches || service.serviceName.toLowerCase().includes(normalizedQuery) || service.methods.length);
        return { ...group, services };
      })
      .filter((group) => group.label.toLowerCase().includes(normalizedQuery) || group.services.length);
  }, [groups, normalizedQuery]);

  useEffect(() => {
    if (!normalizedQuery) return;
    setExpanded((current) => {
      const next = new Set(current);
      next.add("protocol:grpc");
      for (const group of visibleGroups) {
        next.add(`schema:${group.key}`);
        for (const service of group.services) next.add(`service:${group.key}:${service.serviceName}`);
      }
      return next;
    });
  }, [normalizedQuery, visibleGroups]);

  const grpcExpanded = expanded.has("protocol:grpc");
  const grpcActive = serviceProtocol === "grpc-mock" || serviceProtocol === "web-access";
  const methodStates = useMemo(() => {
    const next = new Map<string, { configured: boolean; live: boolean; invalid: boolean; scenarioCount: number }>();
    for (const group of groups) {
      for (const service of group.services) {
        for (const method of service.methods) {
          const key = methodKey(method);
          const file = getMockMethodScenarioFile(mockServer, method);
          const parsed = parseMockScenarioText(file.scenarioText, file.format, mockServer.port);
          if (!parsed.ok) {
            next.set(key, { configured: false, live: false, invalid: true, scenarioCount: 0 });
            continue;
          }
          const scenarios = parsed.bundle.scenarios.filter(
            (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
          );
          const selectedScenarioId = mockServer.selectedScenarioIds[key] ?? scenarios[0]?.id;
          const hasActiveScenario = Boolean(selectedScenarioId && scenarios.some((scenario) => scenario.id === selectedScenarioId));
          const configured = mockServer.enabledMethods[key] !== false && hasActiveScenario && !method.requestStream;
          next.set(key, {
            configured,
            live: Boolean(mockServerStatus?.running && configured),
            invalid: false,
            scenarioCount: scenarios.length,
          });
        }
      }
    }
    return next;
  }, [groups, mockServer, mockServerStatus?.running]);
  const configuredMethodCount = [...methodStates.values()].filter((state) => state.configured).length;
  const liveMethodCount = [...methodStates.values()].filter((state) => state.live).length;

  return (
    <Stack spacing={0.45} sx={{ minHeight: 0 }}>
      <Box sx={{ px: 0.6, pt: 0.25 }}>
        <TextField
          size="small"
          fullWidth
          value={query}
          onChange={(event: any) => setQuery(event.target.value)}
          placeholder="Search mocks"
          InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 15 }} /></InputAdornment> }}
          inputProps={{ "aria-label": "Search mocks" }}
        />
      </Box>
      <Box sx={{ minHeight: 0, overflow: "auto" }}>
      <WorkbenchTree aria-label="Mocking tree">
      <Stack
        direction="row"
        alignItems="center"
        spacing={0}
        role="treeitem"
        aria-level={1}
        aria-expanded={grpcExpanded}
        sx={{ ...rowSx, minHeight: workbenchTreeMetrics.rootRowHeight, height: workbenchTreeMetrics.rootRowHeight }}
      >
        <Chevron expanded={grpcExpanded} label="gRPC" onClick={() => toggle("protocol:grpc")} />
        <Button
          size="small"
          variant="text"
          onClick={() => onSelectProtocol("grpc-mock")}
          sx={{
            flex: 1,
            minWidth: 0,
            height: workbenchTreeMetrics.rowHeight,
            px: 0.15,
            justifyContent: "flex-start",
            color: grpcActive ? "text.primary" : "text.secondary",
            fontWeight: grpcActive ? 600 : 500,
          }}
        >
          gRPC
        </Button>
        <Chip
          size="small"
          color={liveMethodCount > 0 ? "success" : configuredMethodCount > 0 ? "primary" : "default"}
          variant={liveMethodCount > 0 ? undefined : "outlined"}
          label={liveMethodCount > 0 ? `${liveMethodCount} live` : configuredMethodCount > 0 ? `${configuredMethodCount} ready` : "0 active"}
          title={mockServerStatus?.running ? "gRPC Mock runtime is running" : "gRPC Mock runtime is stopped"}
          sx={{ mr: 0.35, flexShrink: 0, height: 18, "& .MuiChip-label": { px: 0.5, fontSize: 10 } }}
        />
      </Stack>

      {grpcExpanded ? (
        <Box role="group" sx={workbenchTreeGroupSx}>
          {visibleGroups.length ? (
            visibleGroups.map((group) => {
              const schemaKey = `schema:${group.key}`;
              const schemaExpanded = expanded.has(schemaKey);
              return (
                <Box key={group.key} role="treeitem" aria-level={2} aria-expanded={schemaExpanded}>
                  <Stack direction="row" alignItems="center" spacing={0} sx={rowSx}>
                    <Chevron expanded={schemaExpanded} label={group.label} onClick={() => toggle(schemaKey)} />
                    <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1, fontWeight: 500 }}>
                      {group.label}
                    </Typography>
                  </Stack>
                  {schemaExpanded ? (
                    <Box role="group" sx={workbenchTreeGroupSx}>
                      {group.services.map((service) => {
                        const serviceKey = `service:${group.key}:${service.serviceName}`;
                        const serviceExpanded = expanded.has(serviceKey);
                        return (
                          <Box key={serviceKey} role="treeitem" aria-level={3} aria-expanded={serviceExpanded}>
                            <Stack direction="row" alignItems="center" spacing={0} sx={rowSx}>
                              <Chevron
                                expanded={serviceExpanded}
                                label={service.serviceName}
                                onClick={() => toggle(serviceKey)}
                              />
                              <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1, fontWeight: 500 }}>
                                {service.serviceName}
                              </Typography>
                            </Stack>
                            {serviceExpanded ? (
                              <Box role="group" sx={workbenchTreeGroupSx}>
                                {service.methods.map((method) => {
                                  const key = methodKey(method);
                                  const active = grpcActive && selectedMethodKey === key;
                                  return (
                                    <Button
                                      key={key}
                                      role="treeitem"
                                      aria-level={4}
                                      size="small"
                                      variant="text"
                                      onClick={() => onSelectGrpcMethod(group.libraryId, group.versionId, method)}
                                      sx={{
                                        ...rowSx,
                                        width: "100%",
                                        justifyContent: "flex-start",
                                        px: 0.35,
                                        color: "text.primary",
                                        bgcolor: active ? "action.selected" : "transparent",
                                        fontWeight: 400,
                                      }}
                                    >
                                      <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                                        {method.methodName}
                                      </Typography>
                                      {(() => {
                                        const state = methodStates.get(key);
                                        const label = state?.invalid
                                          ? "ERR"
                                          : state?.live
                                            ? "LIVE"
                                            : state?.configured
                                              ? "READY"
                                              : state?.scenarioCount
                                                ? "OFF"
                                                : "SETUP";
                                        const color = state?.invalid
                                          ? "error"
                                          : state?.live
                                            ? "success"
                                            : state?.configured
                                              ? "primary"
                                              : "default";
                                        return (
                                          <Chip
                                            size="small"
                                            color={color}
                                            variant={state?.live ? undefined : "outlined"}
                                            label={label}
                                            title={
                                              state?.invalid
                                                ? "Scenario file is invalid"
                                                : state?.live
                                                  ? "Mock is actively serving"
                                                  : state?.configured
                                                    ? "Mock is enabled and ready; start gRPC Mock to serve it"
                                                    : state?.scenarioCount
                                                      ? "Mock is disabled"
                                                      : "No mock scenario configured"
                                            }
                                            sx={{ flexShrink: 0, height: 18, "& .MuiChip-label": { px: 0.45, fontSize: 9.5 } }}
                                          />
                                        );
                                      })()}
                                    </Button>
                                  );
                                })}
                              </Box>
                            ) : null}
                          </Box>
                        );
                      })}
                    </Box>
                  ) : null}
                </Box>
              );
            })
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ px: 0.75, py: 0.5 }}>
              No Proto attached to gRPC Mock.
            </Typography>
          )}
        </Box>
      ) : null}

      <Button
        role="treeitem"
        aria-level={1}
        size="small"
        variant="text"
        onClick={() => onSelectProtocol("rest")}
        sx={{
          ...rowSx,
          width: "100%",
          justifyContent: "flex-start",
          px: 0.35,
          color: serviceProtocol === "rest" ? "text.primary" : "text.secondary",
          bgcolor: serviceProtocol === "rest" ? "action.selected" : "transparent",
          fontWeight: serviceProtocol === "rest" ? 600 : 500,
        }}
      >
        REST
      </Button>
      <Button
        role="treeitem"
        aria-level={1}
        size="small"
        variant="text"
        onClick={() => onSelectProtocol("websocket")}
        sx={{
          ...rowSx,
          width: "100%",
          justifyContent: "flex-start",
          px: 0.35,
          color: serviceProtocol === "websocket" ? "text.primary" : "text.secondary",
          bgcolor: serviceProtocol === "websocket" ? "action.selected" : "transparent",
          fontWeight: serviceProtocol === "websocket" ? 600 : 500,
        }}
      >
        WebSocket
      </Button>
    </WorkbenchTree>
      </Box>
    </Stack>
  );
}
