"use client";

import { useRef } from "react";
import type { RpcMethodInfo } from "@/lib/types";
import { Alert, Box, Button, InputAdornment, Paper, Stack, TextField, Typography } from "@/components/shadcn/compat";
import { Search } from "@/components/shadcn/icons";
import { useMockCatalog, useMockCatalogQuery } from "../catalog/useMockCatalog";
import { mockingUiStore, useMockingUiSnapshot, type MockingMethodFilter } from "./mockingUi.store";
import type { MockCatalogMethodRow } from "../catalog/mockCatalog.types";
import { MockCatalogRowView, mockCatalogRowHeight } from "./MockCatalogRow";
import { useFixedVirtualWindow } from "../../../shared/use-fixed-virtual-window";

export function MockCatalogPanel(props: {
  running: boolean;
  port: number;
  selectedMethodKey: string;
  onSelectMethod(row: MockCatalogMethodRow, method: RpcMethodInfo): void;
  onScenarioChange(method: RpcMethodInfo, scenarioId: string): void;
  onEnabledChange(method: RpcMethodInfo, enabled: boolean): void;
  onAddScenario(method: RpcMethodInfo): void;
  onManageScenario(method: RpcMethodInfo, scenarioId: string): void;
}) {
  const catalog = useMockCatalog();
  const ui = useMockingUiSnapshot();
  useMockCatalogQuery(props.running);

  return (
    <Stack spacing={0.65} sx={{ minHeight: 0, height: "100%" }}>
      <Box className="flex min-w-0 flex-col gap-1.5 lg:flex-row lg:items-center">
        <TextField
          size="small"
          fullWidth
          value={ui.query}
          onChange={(event: { target: { value: string } }) => mockingUiStore.setQuery(event.target.value)}
          placeholder="Search Proto, service, method, or scenario"
          inputProps={{ "aria-label": "Search gRPC Mock methods and scenarios" }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 15 }} /></InputAdornment> }}
          sx={{ minWidth: 0, flex: 1 }}
        />
        <Stack direction="row" spacing={0.35} alignItems="center" flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
          {([
            ["all", "All", catalog.summary.totalMethods],
            ["live", "Live", catalog.summary.live],
            ["ready", "Ready", catalog.summary.ready],
            ["setup", "Needs setup", catalog.summary.setup + catalog.summary.error],
          ] as const).map(([value, label, count]) => (
            <Button
              key={value}
              size="small"
              variant={ui.methodFilter === value ? "contained" : "text"}
              aria-pressed={ui.methodFilter === value}
              onClick={() => mockingUiStore.setMethodFilter(value as MockingMethodFilter)}
              sx={{ minWidth: 0, height: 28, px: 0.85, boxShadow: "none" }}
            >
              {label} {count}
            </Button>
          ))}
        </Stack>
      </Box>

      <Stack direction="row" spacing={0.7} alignItems="center" sx={{ minHeight: 18, px: 0.15 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {catalog.summary.visibleMethods} shown
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0, flex: 1 }}>
          {props.running ? `Runtime running on :${props.port}` : "Runtime stopped — ready methods serve immediately after Start"}
        </Typography>
      </Stack>

      {catalog.error ? <Alert severity="error" variant="outlined">{catalog.error}</Alert> : null}
      {catalog.loading && catalog.rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">Indexing Mocking catalog in worker…</Typography>
        </Paper>
      ) : catalog.rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="subtitle1">No matching methods</Typography>
          <Typography variant="body2" color="text.secondary">Change search/filter or attach a Proto.</Typography>
        </Paper>
      ) : (
        <MockCatalogList {...props} />
      )}
    </Stack>
  );
}

export function MockCatalogList(props: {
  running: boolean;
  port: number;
  selectedMethodKey: string;
  onSelectMethod(row: MockCatalogMethodRow, method: RpcMethodInfo): void;
  onScenarioChange(method: RpcMethodInfo, scenarioId: string): void;
  onEnabledChange(method: RpcMethodInfo, enabled: boolean): void;
  onAddScenario(method: RpcMethodInfo): void;
  onManageScenario(method: RpcMethodInfo, scenarioId: string): void;
}) {
  const catalog = useMockCatalog();
  const ui = useMockingUiSnapshot();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualWindow = useFixedVirtualWindow({
    count: catalog.rows.length,
    itemSize: mockCatalogRowHeight,
    overscan: 16,
    scrollRef,
  });

  return (
    <Box ref={scrollRef} onScroll={virtualWindow.onScroll} sx={{ minHeight: 0, flex: 1, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
      <Box sx={{ height: virtualWindow.totalSize, position: "relative", width: "100%" }}>
        {virtualWindow.items.map((virtualRow: { index: number; key: string | number; start: number }) => {
          const row = catalog.rows[virtualRow.index];
          if (!row) return null;
          return (
            <Box
              key={virtualRow.key}
              data-index={virtualRow.index}
              sx={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
            >
              <MockCatalogRowView
                row={row}
                selectedMethodKey={props.selectedMethodKey}
                collapsedProtoIds={ui.collapsedProtoIds}
                collapsedServiceIds={ui.collapsedServiceIds}
                onToggleProto={mockingUiStore.toggleProto}
                onToggleService={mockingUiStore.toggleService}
                onSelectMethod={props.onSelectMethod}
                onScenarioChange={props.onScenarioChange}
                onEnabledChange={props.onEnabledChange}
                onAddScenario={props.onAddScenario}
                onManageScenario={props.onManageScenario}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
