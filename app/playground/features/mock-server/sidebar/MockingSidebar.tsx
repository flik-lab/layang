"use client";

import { useRef } from "react";
import { Box, Button, Chip, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from "@/components/shadcn/compat";
import { KeyboardArrowDown, KeyboardArrowRight, Search, Settings } from "@/components/shadcn/icons";
import { useMockCatalog, useMockCatalogQuery } from "../catalog/useMockCatalog";
import type { MockCatalogMethodRow } from "../catalog/mockCatalog.types";
import { mockingUiStore, useMockingUiSnapshot } from "../workspace/mockingUi.store";
import type { ServiceProtocol } from "../../../shared/workbench-types";
import { useFixedVirtualWindow } from "../../../shared/use-fixed-virtual-window";

const rowHeight = 30;

export function MockingSidebar(props: {
  running: boolean;
  selectedMethodKey: string;
  serviceProtocol: ServiceProtocol;
  onSelectGrpcMethod(row: MockCatalogMethodRow): void;
  onSelectProtocol(protocol: "grpc-mock" | "rest" | "websocket"): void;
  onOpenGrpcHome(): void;
}) {
  const catalog = useMockCatalog();
  const ui = useMockingUiSnapshot();
  useMockCatalogQuery(props.running);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualWindow = useFixedVirtualWindow({
    count: catalog.rows.length,
    itemSize: rowHeight,
    overscan: 12,
    scrollRef,
  });

  const grpcActive = props.serviceProtocol === "grpc-mock" || props.serviceProtocol === "web-access";

  return (
    <Stack spacing={0.45} sx={{ minHeight: 0, height: "100%" }}>
      <Box sx={{ px: 0.6, pt: 0.25 }}>
        <TextField
          size="small"
          fullWidth
          value={ui.query}
          onChange={(event: { target: { value: string } }) => mockingUiStore.setQuery(event.target.value)}
          placeholder="Search mocks"
          InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 15 }} /></InputAdornment> }}
          inputProps={{ "aria-label": "Search mocks" }}
        />
      </Box>

      <Stack direction="row" spacing={0.35} alignItems="center" sx={{ px: 0.6 }}>
        <Button size="small" variant={grpcActive ? "contained" : "text"} onClick={() => props.onSelectProtocol("grpc-mock")}>gRPC</Button>
        <Button size="small" variant={props.serviceProtocol === "rest" ? "contained" : "text"} onClick={() => props.onSelectProtocol("rest")}>REST</Button>
        <Button size="small" variant={props.serviceProtocol === "websocket" ? "contained" : "text"} onClick={() => props.onSelectProtocol("websocket")}>WS</Button>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="gRPC Home / Settings">
          <IconButton
            size="small"
            aria-label="gRPC Home / Settings"
            onClick={props.onOpenGrpcHome}
            sx={{ width: 28, height: 28 }}
          >
            <Settings sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {grpcActive ? (
        <Box ref={scrollRef} onScroll={virtualWindow.onScroll} sx={{ minHeight: 0, flex: 1, overflow: "auto" }}>
          <Box sx={{ height: virtualWindow.totalSize, position: "relative" }}>
            {virtualWindow.items.map((virtualRow: { index: number; key: string | number; start: number }) => {
              const row = catalog.rows[virtualRow.index];
              if (!row) return null;
              const selected = row.kind === "method" && props.selectedMethodKey === row.methodKey;
              return (
                <Box
                  key={virtualRow.key}
                  sx={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "100%",
                    height: rowHeight,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.kind === "proto" ? (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => mockingUiStore.toggleProto(row.protoId)}
                      sx={{ width: "100%", height: rowHeight, justifyContent: "flex-start", px: 0.5, color: "text.primary" }}
                    >
                      {ui.collapsedProtoIds.has(row.protoId) ? <KeyboardArrowRight sx={{ fontSize: 14 }} /> : <KeyboardArrowDown sx={{ fontSize: 14 }} />}
                      <Typography variant="body2" noWrap sx={{ ml: 0.25, minWidth: 0, flex: 1, textAlign: "left", fontWeight: 600 }}>{row.label}</Typography>
                    </Button>
                  ) : row.kind === "service" ? (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => mockingUiStore.toggleService(row.serviceId)}
                      sx={{ width: "100%", height: rowHeight, justifyContent: "flex-start", pl: 2.1, pr: 0.5, color: "text.primary" }}
                    >
                      {ui.collapsedServiceIds.has(row.serviceId) ? <KeyboardArrowRight sx={{ fontSize: 13 }} /> : <KeyboardArrowDown sx={{ fontSize: 13 }} />}
                      <Typography variant="body2" noWrap sx={{ ml: 0.2, minWidth: 0, flex: 1, textAlign: "left" }}>{row.serviceName}</Typography>
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => props.onSelectGrpcMethod(row)}
                      sx={{
                        width: "100%",
                        height: rowHeight,
                        justifyContent: "flex-start",
                        pl: 4.2,
                        pr: 0.5,
                        color: "text.primary",
                        bgcolor: selected ? "action.selected" : "transparent",
                      }}
                    >
                      <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>{row.methodName}</Typography>
                      <Chip
                        size="small"
                        label={row.status === "live" ? "LIVE" : row.status === "ready" ? "READY" : row.status === "error" ? "ERR" : "SETUP"}
                        color={row.status === "live" ? "success" : row.status === "ready" ? "primary" : row.status === "error" ? "error" : "default"}
                        variant={row.status === "live" ? undefined : "outlined"}
                        sx={{ height: 18, "& .MuiChip-label": { px: 0.45, fontSize: 9.5 } }}
                      />
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      ) : null}
    </Stack>
  );
}
