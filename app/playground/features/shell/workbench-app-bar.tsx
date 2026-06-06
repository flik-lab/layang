"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import type { ColorMode } from "../../design-system";
import type { RequestSession } from "../../shared/workbench-types";

type CompatTheme = { palette: { mode: ColorMode } };
type ButtonClickEvent = ReactMouseEvent<HTMLButtonElement>;

type WorkbenchViewContext = Record<string, any>;

export function WorkbenchAppBar(props: { ctx: WorkbenchViewContext }) {
  const {
    AppBar,
    AppLogoIcon,
    Box,
    Button,
    Divider,
    DocsIcon,
    Download,
    ListItemText,
    Menu,
    MenuItem,
    RequestTabs,
    Stack,
    Storage,
    Tooltip,
    Typography,
    UploadFile,
    WindowControls,
    activateRequestSession,
    activeRequestId,
    closeAllRequestSessions,
    closeOtherRequestSessions,
    closeRequestSession,
    colorTokens,
    designSystem,
    exportGeneratedProtoDocsHtml,
    exportGeneratedProtoDocsMarkdown,
    exportProject,
    exportPublicDocs,
    openLoggerSettings,
    openProtoFolderImporter,
    openWorkspaceFolder,
    openWorkspaceImporter,
    paletteMode,
    requestRunner,
    requestSessions,
    saveWorkspaceFolder,
    saveWorkspaceFolderAs,
    saveWorkspaceLocally,
    setWorkspaceMenuAnchor,
    workspaceFolderPath,
    workspaceMenuAnchor,
  } = props.ctx;

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
        <Stack
          direction="row"
          spacing={0.7}
          alignItems="center"
          sx={{ width: 166, flexShrink: 0, justifyContent: "flex-start", WebkitAppRegion: "drag" }}
        >
          <Tooltip title="Layang workspace">
            <Button
              size="small"
              aria-label="Layang workspace menu"
              onClick={(event: ButtonClickEvent) => setWorkspaceMenuAnchor(event.currentTarget)}
              sx={{
                WebkitAppRegion: "no-drag",
                height: 28,
                minWidth: 0,
                px: 0.75,
                gap: "6px",
                borderColor: "transparent",
              }}
            >
              <AppLogoIcon size={19} />
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
            <MenuItem onClick={saveWorkspaceLocally}>
              <Storage fontSize="small" /> Save browser snapshot
            </MenuItem>
            <MenuItem onClick={() => void saveWorkspaceFolder()}>
              <Storage fontSize="small" /> Save workspace folder
            </MenuItem>
            <MenuItem onClick={() => void saveWorkspaceFolderAs()}>
              <Download fontSize="small" /> Save workspace folder as...
            </MenuItem>
            <MenuItem onClick={() => void openWorkspaceFolder()}>
              <UploadFile fontSize="small" /> Open workspace folder
            </MenuItem>
            <MenuItem
              onClick={() => {
                setWorkspaceMenuAnchor(null);
                openLoggerSettings();
              }}
            >
              <Storage fontSize="small" /> Logger settings
            </MenuItem>
            <Divider />
            <MenuItem onClick={exportProject}>
              <Download fontSize="small" /> Export portable JSON
            </MenuItem>
            <MenuItem onClick={openWorkspaceImporter}>
              <UploadFile fontSize="small" /> Import workspace / collection / docs / examples
            </MenuItem>
            <MenuItem onClick={openProtoFolderImporter}>
              <UploadFile fontSize="small" /> Import gRPC proto / collection folder
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                setWorkspaceMenuAnchor(null);
                exportPublicDocs();
              }}
            >
              <DocsIcon fontSize="small" /> Export published docs
            </MenuItem>
            <MenuItem
              onClick={() => {
                setWorkspaceMenuAnchor(null);
                exportGeneratedProtoDocsMarkdown();
              }}
            >
              <DocsIcon fontSize="small" /> Generate proto docs Markdown
            </MenuItem>
            <MenuItem
              onClick={() => {
                setWorkspaceMenuAnchor(null);
                exportGeneratedProtoDocsHtml();
              }}
            >
              <DocsIcon fontSize="small" /> Generate proto docs HTML
            </MenuItem>
            {workspaceFolderPath && (
              <MenuItem disabled>
                <ListItemText primary="Folder" secondary={workspaceFolderPath} />
              </MenuItem>
            )}
          </Menu>
        </Stack>
        <Box sx={{ WebkitAppRegion: "drag", minWidth: 0, flex: "1 1 auto", height: "100%", display: "flex" }}>
          <RequestTabs
            sessions={requestSessions}
            activeRequestId={activeRequestId}
            onActivate={(session: RequestSession) => activateRequestSession(session)}
            onClose={closeRequestSession}
            onCancel={requestRunner.cancelRequest}
            onCloseAll={closeAllRequestSessions}
            onCloseOther={closeOtherRequestSessions}
            placement="top"
          />
        </Box>
        <Box
          aria-label="Drag window"
          sx={{ alignSelf: "stretch", width: 72, flexShrink: 0, WebkitAppRegion: "drag" }}
        />
        <WindowControls />
      </Stack>
    </AppBar>
  );
}
