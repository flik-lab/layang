"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { Download, Settings, Storage, UploadFile } from "@/components/shadcn/icons";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { ColorMode } from "../../design-system";
import type { RequestSession } from "../../shared/workbench-types";

type CompatTheme = { palette: { mode: ColorMode } };
type ButtonClickEvent = ReactMouseEvent<HTMLButtonElement>;
type WorkbenchViewContext = Record<string, any>;

export function WorkbenchAppBar({ ctx }: { ctx: WorkbenchViewContext }) {
  const {
    AppBar,
    AppLogoIcon,
    Box,
    Button,
    Divider,
    Menu,
    MenuItem,
    RequestTabs,
    Stack,
    Tooltip,
    Typography,
    WindowControls,
    activateRequestSession,
    activeRequestId,
    closeAllRequestSessions,
    closeOtherRequestSessions,
    closeRequestSession,
    colorTokens,
    createNewWorkspaceFolder,
    designSystem,
    openWorkspaceFolder,
    paletteMode,
    requestRunner,
    requestSessions,
    reorderRequestSessions,
    saveWorkspaceFolder,
    saveWorkspaceFolderAs,
    setProtoPreview,
    setSettingsSection,
    setSideSection,
    setSidebarOpen,
    setWorkspaceMenuAnchor,
    workspaceFolderPath,
    workspaceMenuAnchor,
  } = ctx;

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        zIndex: 1201,
        top: 0,
        left: 0,
        right: 0,
        width: "100vw",
        height: designSystem.size.titlebarHeight,
        justifyContent: "center",
        borderBottom: "1px solid",
        borderColor: (theme: CompatTheme) => colorTokens[paletteMode(theme.palette.mode)].border,
        bgcolor: (theme: CompatTheme) => colorTokens[paletteMode(theme.palette.mode)].titlebarBg,
        color: "text.primary",
        WebkitAppRegion: "drag",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.55}
        sx={{ px: 0.65, height: "100%", width: "100%", minWidth: 0, WebkitAppRegion: "drag" }}
      >
        <Stack direction="row" spacing={0.45} alignItems="center" sx={{ flexShrink: 0, WebkitAppRegion: "no-drag" }}>
          <Tooltip title={workspaceFolderPath ? `Workspace: ${workspaceFolderPath}` : "Workspace menu"}>
            <Button
              size="small"
              aria-label="Layang workspace menu"
              onClick={(event: ButtonClickEvent) => setWorkspaceMenuAnchor(event.currentTarget)}
              sx={{ minWidth: 104, px: 0.65, justifyContent: "flex-start", gap: "4px", borderColor: "transparent" }}
            >
              <AppLogoIcon size={22} />
              <Typography variant="body2" fontWeight={700} noWrap>
                Layang
              </Typography>
            </Button>
          </Tooltip>
          <Menu
            anchorEl={workspaceMenuAnchor}
            open={Boolean(workspaceMenuAnchor)}
            onClose={() => setWorkspaceMenuAnchor(null)}
          >
            {workspaceFolderPath && (
              <MenuItem disabled>
                <Typography variant="caption" noWrap title={workspaceFolderPath} sx={{ maxWidth: 360 }}>
                  Active: {workspaceFolderPath}
                </Typography>
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                setWorkspaceMenuAnchor(null);
                void createNewWorkspaceFolder();
              }}
            >
              <Storage fontSize="small" /> New workspace folder...
            </MenuItem>
            <MenuItem
              onClick={() => {
                setWorkspaceMenuAnchor(null);
                void openWorkspaceFolder();
              }}
            >
              <UploadFile fontSize="small" /> Switch / open workspace folder...
            </MenuItem>
            <MenuItem
              onClick={() => {
                setWorkspaceMenuAnchor(null);
                void saveWorkspaceFolder();
              }}
            >
              <Storage fontSize="small" /> Save workspace folder
            </MenuItem>
            <MenuItem
              onClick={() => {
                setWorkspaceMenuAnchor(null);
                void saveWorkspaceFolderAs();
              }}
            >
              <Download fontSize="small" /> Save workspace as...
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                setWorkspaceMenuAnchor(null);
                setSideSection("settings");
                setSettingsSection("workspace");
                setSidebarOpen(true);
              }}
            >
              <Settings fontSize="small" /> Workspace settings
            </MenuItem>
          </Menu>
        </Stack>

        <SidebarTrigger className="shrink-0" style={{ WebkitAppRegion: "no-drag" } as any} />

        <Box sx={{ WebkitAppRegion: "drag", minWidth: 0, flex: "1 1 auto", height: "100%", display: "flex" }}>
          <RequestTabs
            sessions={requestSessions}
            activeRequestId={activeRequestId}
            onActivate={(session: RequestSession) => {
              setProtoPreview(null);
              activateRequestSession(session);
              setSideSection("collections");
              setSidebarOpen(true);
            }}
            onClose={closeRequestSession}
            onCancel={requestRunner.cancelRequest}
            onCloseAll={closeAllRequestSessions}
            onCloseOther={closeOtherRequestSessions}
            onReorder={reorderRequestSessions}
            placement="top"
          />
        </Box>

        <WindowControls />
      </Stack>
    </AppBar>
  );
}
