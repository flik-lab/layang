"use client";

import { Box, Stack, Typography } from "@/components/shadcn/compat";

type ViewContext = Record<string, any>;

export function WorkbenchStatusBar({ ctx }: { ctx: ViewContext }) {
  const { mockServerStatus, webAccessStatus, restMockStatus, wsMockStatus, workspaceFolderPath } = ctx;
  const serviceLabels = [
    mockServerStatus?.running ? `gRPC Mock :${mockServerStatus.port ?? 50055}` : null,
    webAccessStatus?.running ? `Web Access :${webAccessStatus.port ?? webAccessStatus.webPort ?? 8080}` : null,
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
        height: 24,
        zIndex: 1300,
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        px: 1,
        display: "flex",
        alignItems: "center",
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, width: "100%" }}>
        <Typography variant="caption" color="text.secondary" noWrap>
          {workspaceFolderPath ? "Workspace autosave enabled" : "Workspace not selected"}
        </Typography>
        {serviceLabels.map((label) => (
          <Typography key={label} variant="caption" color="success.main" noWrap>
            {label} running
          </Typography>
        ))}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary" noWrap>
          Local-first · REST · gRPC · WebSocket
        </Typography>
      </Stack>
    </Box>
  );
}
