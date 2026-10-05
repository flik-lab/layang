"use client";

import appPackage from "@/package.json";
import { Terminal } from "@/components/shadcn/icons";
import { Box, Button, Stack, Typography } from "@/components/shadcn/compat";
import {
  useGrpcMockRuntimeStatus,
  useRestMockRuntimeStatus,
  useWebAccessRuntimeStatus,
  useWebSocketMockRuntimeStatus,
} from "../mock-server/runtime/useMockRuntimeSelector";
import type { WorkbenchCliPanelModel, WorkbenchStatusBarModel } from "./workbenchShell.types";
import { performanceStats } from "../../shared/performance/performance-stats.store";

export function WorkbenchStatusBar({
  ctx,
  cliPanelOpen,
  setCliPanelOpen,
}: {
  ctx: WorkbenchStatusBarModel;
} & WorkbenchCliPanelModel) {
  performanceStats.recordRenderInvocation("statusBar");
  const { workspaceFolderPath } = ctx;
  const mockServerStatus = useGrpcMockRuntimeStatus();
  const webAccessStatus = useWebAccessRuntimeStatus();
  const restMockStatus = useRestMockRuntimeStatus();
  const wsMockStatus = useWebSocketMockRuntimeStatus();
  const serviceLabels = [
    mockServerStatus?.running ? `gRPC Mock :${mockServerStatus.port ?? 50055}` : null,
    webAccessStatus?.running ? `Web Access :${webAccessStatus.gateway?.webPort ?? webAccessStatus.port ?? 8080}` : null,
    restMockStatus?.running ? `REST mock :${restMockStatus.port ?? 3001}` : null,
    wsMockStatus?.running ? `WebSocket mock :${wsMockStatus.port ?? 3101}` : null,
  ].filter(Boolean) as string[];

  return (
    <Box
      component="footer"
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: 22,
        zIndex: 1300,
        borderTop: "1px solid",
        borderColor: "var(--border-strong)",
        bgcolor: "var(--titlebar-bg)",
        color: "text.secondary",
        px: 0.75,
        display: "flex",
        alignItems: "center",
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, width: "100%" }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }} noWrap>
          {workspaceFolderPath ? "● Workspace" : "○ No workspace"}
        </Typography>
        {serviceLabels.map((label) => (
          <Typography key={label} variant="caption" sx={{ color: "text.secondary" }} noWrap>
            {`● ${label}`}
          </Typography>
        ))}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="text"
          onClick={() => void window.electronWindow?.openDetached?.({ kind: "performance", title: "Performance" })}
          title="Open performance diagnostics window"
          sx={{ minWidth: 42, height: 20, px: 0.6, borderRadius: 0 }}
        >Perf</Button>
        <Button
          size="small"
          variant={cliPanelOpen ? "contained" : "text"}
          aria-pressed={Boolean(cliPanelOpen)}
          onClick={() => setCliPanelOpen?.((current: boolean) => !current)}
          title="Toggle Layang CLI terminal (Ctrl+`)"
          sx={{ minWidth: 48, height: 20, px: 0.6, gap: 0.45, borderRadius: 0 }}
        >
          <Terminal sx={{ fontSize: 13 }} /> CLI
        </Button>
        <Typography
          variant="caption"
          title={`Layang ${appPackage.version}`}
          sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
          noWrap
        >
          v{appPackage.version}
        </Typography>
      </Stack>
    </Box>
  );
}
