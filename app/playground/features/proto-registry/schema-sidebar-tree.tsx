"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Button, IconButton, Stack, Typography } from "@/components/shadcn/compat";
import { WorkbenchTree, workbenchTreeGroupSx, workbenchTreeMetrics } from "@/components/workbench-ui/tree";
import { loadProtoFiles } from "@/lib/proto-loader";
import type { RpcMethodInfo } from "@/lib/types";
import { methodKey } from "../../shared/rpc-method-utils";

const rowSx = {
  minHeight: workbenchTreeMetrics.rowHeight,
  height: workbenchTreeMetrics.rowHeight,
  px: 0.15,
  py: 0,
  my: "1px",
  borderRadius: "2px",
  "&:hover": { bgcolor: "action.hover" },
} as const;

function Chevron({ expanded, label, onClick }: { expanded: boolean; label: string; onClick: () => void }) {
  return (
    <IconButton
      size="small"
      aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
      aria-expanded={expanded}
      onClick={(event: any) => {
        event.stopPropagation();
        onClick();
      }}
      sx={{ width: 14, minWidth: 14, height: 18, p: 0, fontSize: 10, color: "text.secondary" }}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{ display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 90ms ease" }}
      >
        ›
      </Box>
    </IconButton>
  );
}

type SchemaTreeGroup = {
  library: any;
  version: any;
  services: Array<{ serviceName: string; methods: RpcMethodInfo[] }>;
};

export function SchemaSidebarTree({
  libraries,
  activeLibraryId,
  activeVersionId,
  query,
  onSelectVersion,
  onSelectMethod,
}: {
  libraries: any[];
  activeLibraryId: string;
  activeVersionId: string;
  query: string;
  onSelectVersion: (libraryId: string, versionId: string) => void;
  onSelectMethod: (libraryId: string, versionId: string, method: RpcMethodInfo) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const groups = useMemo<SchemaTreeGroup[]>(() => {
    return libraries.flatMap((library) => {
      const versions = (library.versions ?? []).filter((version: any) => version.lifecycle !== "archived");
      const version =
        versions.find((item: any) => library.id === activeLibraryId && item.id === activeVersionId) ??
        versions.find((item: any) => item.id === library.defaultVersionId) ??
        versions[0];
      if (!version) return [];
      let methods: RpcMethodInfo[] = [];
      try {
        methods = loadProtoFiles(version.files ?? []).methods ?? [];
      } catch {
        methods = [];
      }
      const byService = new Map<string, RpcMethodInfo[]>();
      for (const method of methods) {
        const items = byService.get(method.serviceName) ?? [];
        items.push(method);
        byService.set(method.serviceName, items);
      }
      let services = [...byService.entries()]
        .map(([serviceName, serviceMethods]) => ({ serviceName, methods: serviceMethods.sort((a, b) => a.methodName.localeCompare(b.methodName)) }))
        .sort((a, b) => a.serviceName.localeCompare(b.serviceName));
      if (normalizedQuery) {
        const libraryMatches = `${library.name} ${version.version}`.toLowerCase().includes(normalizedQuery);
        services = services
          .map((service) => ({
            ...service,
            methods: libraryMatches
              ? service.methods
              : service.methods.filter((method) => `${service.serviceName} ${method.methodName}`.toLowerCase().includes(normalizedQuery)),
          }))
          .filter((service) => libraryMatches || service.serviceName.toLowerCase().includes(normalizedQuery) || service.methods.length > 0);
        if (!libraryMatches && services.length === 0) return [];
      }
      return [{ library, version, services }];
    });
  }, [activeLibraryId, activeVersionId, libraries, normalizedQuery]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    if (!groups.length) return;
    setExpanded((current) => {
      const next = new Set(current);
      for (const group of groups) {
        if (group.library.id === activeLibraryId || normalizedQuery) next.add(`schema:${group.library.id}`);
        if (normalizedQuery) for (const service of group.services) next.add(`service:${group.library.id}:${service.serviceName}`);
      }
      return next;
    });
  }, [activeLibraryId, groups, normalizedQuery]);

  if (!groups.length) {
    return <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 0.75 }}>No schemas found.</Typography>;
  }

  return (
    <WorkbenchTree aria-label="Schemas tree">
      {groups.map((group) => {
        const schemaKey = `schema:${group.library.id}`;
        const schemaExpanded = expanded.has(schemaKey);
        const active = group.library.id === activeLibraryId;
        return (
          <Box key={group.library.id} role="treeitem" aria-level={1} aria-expanded={schemaExpanded}>
            <Stack direction="row" alignItems="center" spacing={0} sx={{ ...rowSx, minHeight: workbenchTreeMetrics.rootRowHeight, height: workbenchTreeMetrics.rootRowHeight, bgcolor: active ? "action.selected" : "transparent" }}>
              <Chevron expanded={schemaExpanded} label={group.library.name} onClick={() => toggle(schemaKey)} />
              <Button
                size="small"
                variant="text"
                onClick={() => onSelectVersion(group.library.id, group.version.id)}
                sx={{ flex: 1, minWidth: 0, height: "100%", px: 0.35, justifyContent: "flex-start", color: "text.primary", fontWeight: 600 }}
              >
                <Typography variant="body2" noWrap title={group.library.name} sx={{ minWidth: 0, flex: 1, textAlign: "left", fontWeight: 600 }}>
                  {group.library.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  title={`Active revision: ${group.version.version}`}
                  sx={{ ml: 0.5, flexShrink: 0, maxWidth: 84 }}
                  noWrap
                >
                  {group.version.version}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, flexShrink: 0 }}>{group.services.reduce((sum, service) => sum + service.methods.length, 0)}</Typography>
              </Button>
            </Stack>
            {schemaExpanded ? (
              <Box role="group" sx={workbenchTreeGroupSx}>
                {group.services.map((service) => {
                  const serviceKey = `service:${group.library.id}:${service.serviceName}`;
                  const serviceExpanded = expanded.has(serviceKey);
                  return (
                    <Box key={serviceKey} role="treeitem" aria-level={2} aria-expanded={serviceExpanded}>
                      <Stack direction="row" alignItems="center" spacing={0} sx={rowSx}>
                        <Chevron expanded={serviceExpanded} label={service.serviceName} onClick={() => toggle(serviceKey)} />
                        <Typography variant="body2" noWrap title={service.serviceName} sx={{ minWidth: 0, flex: 1, fontWeight: 500 }}>{service.serviceName}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ pr: 0.35 }}>{service.methods.length}</Typography>
                      </Stack>
                      {serviceExpanded ? (
                        <Box role="group" sx={workbenchTreeGroupSx}>
                          {service.methods.map((method) => (
                            <Button
                              key={`${group.library.id}:${group.version.id}:${methodKey(method)}`}
                              role="treeitem"
                              aria-level={3}
                              size="small"
                              variant="text"
                              onClick={() => onSelectMethod(group.library.id, group.version.id, method)}
                              sx={{ ...rowSx, width: "100%", justifyContent: "flex-start", px: 0.35, color: "text.primary", fontWeight: 400 }}
                            >
                              <Typography variant="body2" noWrap title={method.methodName} sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>{method.methodName}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, flexShrink: 0 }}>{method.requestStream || method.responseStream ? "S" : "U"}</Typography>
                            </Button>
                          ))}
                        </Box>
                      ) : null}
                    </Box>
                  );
                })}
              </Box>
            ) : null}
          </Box>
        );
      })}
    </WorkbenchTree>
  );
}
