"use client";

import type { RpcMethodInfo } from "@/lib/types";
import { Box, Chip, IconButton, Stack, Switch, Tooltip, Typography } from "@/components/shadcn/compat";
import { KeyboardArrowDown, KeyboardArrowRight, Settings } from "@/components/shadcn/icons";
import type { MockCatalogMethodRow, MockCatalogRow } from "../catalog/mockCatalog.types";
import { MockScenarioPicker } from "./MockScenarioPicker";

export const mockCatalogRowHeight = 42;

function asRpcMethod(row: MockCatalogMethodRow): RpcMethodInfo {
  return {
    serviceName: row.serviceName,
    methodName: row.methodName,
    requestType: row.requestType,
    responseType: row.responseType,
    requestStream: row.requestStream,
    responseStream: row.responseStream,
  };
}

export function MockCatalogRowView(props: {
  row: MockCatalogRow;
  selectedMethodKey: string;
  onToggleProto(id: string): void;
  onToggleService(id: string): void;
  collapsedProtoIds: ReadonlySet<string>;
  collapsedServiceIds: ReadonlySet<string>;
  onSelectMethod(row: MockCatalogMethodRow, method: RpcMethodInfo): void;
  onScenarioChange(method: RpcMethodInfo, scenarioId: string): void;
  onEnabledChange(method: RpcMethodInfo, enabled: boolean): void;
  onAddScenario(method: RpcMethodInfo): void;
  onManageScenario(method: RpcMethodInfo, scenarioId: string): void;
}) {
  const {
    row,
    selectedMethodKey,
    onToggleProto,
    onToggleService,
    collapsedProtoIds,
    collapsedServiceIds,
    onSelectMethod,
    onScenarioChange,
    onEnabledChange,
    onAddScenario,
    onManageScenario,
  } = props;

  if (row.kind === "proto") {
    const collapsed = collapsedProtoIds.has(row.protoId);
    return (
      <Box
        component="button"
        type="button"
        onClick={() => onToggleProto(row.protoId)}
        sx={{
          width: "100%",
          height: mockCatalogRowHeight,
          display: "flex",
          alignItems: "center",
          gap: 0.6,
          px: 0.8,
          border: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "action.hover",
          color: "text.primary",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        {collapsed ? <KeyboardArrowRight sx={{ fontSize: 16 }} /> : <KeyboardArrowDown sx={{ fontSize: 16 }} />}
        <Typography variant="body2" fontWeight={600} noWrap sx={{ minWidth: 0 }}>
          {row.label}
        </Typography>
        <Chip size="small" variant="outlined" label={row.versionLabel} sx={{ height: 20 }} />
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto", flexShrink: 0 }}>
          {row.methodCount} methods · {row.scenarioCount} scenarios
        </Typography>
      </Box>
    );
  }

  if (row.kind === "service") {
    const collapsed = collapsedServiceIds.has(row.serviceId);
    return (
      <Box
        component="button"
        type="button"
        onClick={() => onToggleService(row.serviceId)}
        sx={{
          width: "100%",
          height: mockCatalogRowHeight,
          display: "flex",
          alignItems: "center",
          gap: 0.55,
          pl: 2.4,
          pr: 0.8,
          border: 0,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          color: "text.primary",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        {collapsed ? <KeyboardArrowRight sx={{ fontSize: 15 }} /> : <KeyboardArrowDown sx={{ fontSize: 15 }} />}
        <Typography variant="body2" fontWeight={600} noWrap sx={{ minWidth: 0, flex: 1 }}>
          {row.serviceName}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {row.methodCount} · {row.scenarioCount}
        </Typography>
      </Box>
    );
  }

  const method = asRpcMethod(row);
  const selected = selectedMethodKey === row.methodKey;
  const label = row.status === "live" ? "LIVE" : row.status === "ready" ? "READY" : row.status === "error" ? "ERR" : "SETUP";
  const color = row.status === "live" ? "success" : row.status === "ready" ? "primary" : row.status === "error" ? "error" : "default";

  return (
    <Box
      data-method-id={row.methodId}
      onClick={() => onSelectMethod(row, method)}
      sx={{
        height: mockCatalogRowHeight,
        display: "grid",
        gridTemplateColumns: "minmax(150px, 1.05fr) minmax(180px, 1.4fr) 82px 64px 34px",
        alignItems: "center",
        gap: 0.65,
        pl: 4.5,
        pr: 0.55,
        borderBottom: "1px solid",
        borderColor: "divider",
        borderLeft: "2px solid",
        borderLeftColor: selected ? "primary.main" : "transparent",
        bgcolor: selected ? "action.selected" : "background.paper",
        cursor: "pointer",
      }}
    >
      <Stack spacing={0} sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap title={row.methodName}>{row.methodName}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap>{row.responseStream ? "Server streaming" : "Unary"}</Typography>
      </Stack>

      <Box
        sx={{ minWidth: 0 }}
        onPointerDown={(event: { stopPropagation(): void }) => event.stopPropagation()}
        onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}
      >
        {row.errorDetail ? (
          <Typography variant="caption" color="error.main" noWrap title={row.errorDetail}>{row.errorDetail}</Typography>
        ) : (
          <MockScenarioPicker
            methodId={row.methodId}
            methodName={row.methodName}
            activeScenarioId={row.activeScenarioId}
            scenarioCount={row.scenarioCount}
            onChange={(scenarioId) => onScenarioChange(method, scenarioId)}
            onAdd={() => onAddScenario(method)}
          />
        )}
      </Box>

      <Chip size="small" color={color} variant={row.status === "live" ? undefined : "outlined"} label={label} sx={{ height: 22, mx: 0.5 }} />

      <Box
        sx={{ justifySelf: "center" }}
        onPointerDown={(event: { stopPropagation(): void }) => event.stopPropagation()}
        onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}
      >
        {!row.errorDetail ? (
          <Switch
            size="small"
            checked={row.enabled}
            disabled={row.scenarioCount === 0}
            inputProps={{ "aria-label": `Enable mock for ${row.methodName}` }}
            onChange={(event: { target: { checked: boolean } }) => onEnabledChange(method, event.target.checked)}
          />
        ) : null}
      </Box>

      <Box
        onPointerDown={(event: { stopPropagation(): void }) => event.stopPropagation()}
        onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}
      >
        <Tooltip title="Manage scenarios">
          <span>
            <IconButton
              size="small"
              aria-label={`Scenario settings for ${row.methodName}`}
              disabled={!row.activeScenarioId}
              onClick={() => onManageScenario(method, row.activeScenarioId)}
            >
              <Settings sx={{ fontSize: 15 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
