"use client";

import { useState, type ReactNode } from "react";
import { Box, Button, Chip, Paper, Stack, TextField, Typography } from "@/components/shadcn/compat";
import { DarkMode, LightMode, PanelBottom, PanelRight, Storage, UploadFile } from "@/components/shadcn/icons";
import { maxSidebarWidth, minSidebarWidth, sidebarWidth } from "../../shared/workbench-constants";
import { uiCopy } from "../../shared/ui-copy";

type ViewContext = Record<string, any>;

const settingCardSx = {
  width: "100%",
  borderBottom: "1px solid",
  borderColor: "divider",
  borderRadius: 0,
  px: 0,
  py: 1.25,
  bgcolor: "transparent",
  boxShadow: "none",
} as const;

export function SettingsWorkspace({ ctx }: { ctx: ViewContext }) {
  const {
    appZoomInfo,
    applyWorkspacePreference,
    bulkAddEnvironments,
    chooseCustomWorkspacePreference,
    createNewWorkspaceFolder,
    densityMode,
    environments,
    horizontalLayoutAvailable,
    openCertificateSettings,
    openEnvironmentManager,
    openLoggerSettings,
    openWorkspaceFolder,
    resetAppZoomLevel,
    saveWorkspaceFolder,
    saveWorkspaceFolderAs,
    requestResponseLayout,
    setRequestResponseLayout,
    setSidebarOpen,
    setSidebarWidthPx,
    setWorkbenchDensity,
    settingsSection,
    sidebarOpen,
    sidebarWidthPx,
    themeMode,
    toggleTheme,
    workspaceFolderPath,
    zoomAppIn,
    zoomAppOut,
  } = ctx;

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  function submitBulkEnvironments() {
    const added = bulkAddEnvironments(bulkText);
    if (added > 0) {
      setBulkText("");
      setBulkOpen(false);
    }
  }

  return (
    <Paper
      elevation={0}
      sx={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        flex: "1 1 auto",
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ minHeight: 50, px: 1.5, borderBottom: "1px solid var(--border-strong)" }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>Settings</Typography>
          <Typography variant="caption" color="text.secondary">Configure Layang without leaving the workbench.</Typography>
        </Box>
      </Stack>
      <Box sx={{ p: "var(--workbench-section-padding)", minHeight: 0, minWidth: 0, flex: 1, overflow: "auto" }}>
        <Box sx={{ width: "100%", maxWidth: 820 }}>
          {settingsSection === "general" && (
            <Stack spacing="var(--workbench-card-gap)" sx={{ width: "100%" }}>
              <SettingCard title="Appearance">
                <Stack spacing={1.1}>
                  <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                    <Button
                      variant="outlined"
                      startIcon={themeMode === "dark" ? <DarkMode /> : <LightMode />}
                      onClick={toggleTheme}
                    >
                      {themeMode === "dark" ? "Dark theme" : "Light theme"}
                    </Button>
                    <Button
                      variant={densityMode === "compact" ? "contained" : "outlined"}
                      onClick={() => setWorkbenchDensity("compact")}
                    >
                      Compact
                    </Button>
                    <Button
                      variant={densityMode === "comfortable" ? "contained" : "outlined"}
                      onClick={() => setWorkbenchDensity("comfortable")}
                    >
                      Comfortable
                    </Button>
                  </Stack>
                </Stack>
              </SettingCard>
              <SettingCard title="Navigation layout">
                <Stack spacing={1}>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                      variant={sidebarOpen ? "contained" : "outlined"}
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                    >
                      {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                    </Button>
                    <Chip label={`${Math.round(sidebarWidthPx)} px`} variant="outlined" />
                    <Button
                      variant="text"
                      onClick={() => {
                        setSidebarWidthPx(sidebarWidth);
                        setSidebarOpen(true);
                      }}
                    >
                      {uiCopy.actions.resetWidth}
                    </Button>
                  </Stack>
                  <Box
                    component="input"
                    type="range"
                    aria-label="Context sidebar width"
                    min={minSidebarWidth}
                    max={maxSidebarWidth}
                    step={8}
                    value={Math.round(sidebarWidthPx)}
                    onChange={(event: any) => setSidebarWidthPx(Number(event.target.value))}
                    sx={{ width: "100%", accentColor: "primary.main" }}
                  />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">
                      {minSidebarWidth}px
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {maxSidebarWidth}px
                    </Typography>
                  </Stack>
                </Stack>
              </SettingCard>
              <SettingCard title="Request editor layout">
                <Stack spacing={0.65}>
                  <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                    <Button
                      variant={requestResponseLayout === "horizontal" ? "contained" : "outlined"}
                      startIcon={<PanelRight />}
                      onClick={() => setRequestResponseLayout("horizontal")}
                    >
                      Side by side
                    </Button>
                    <Button
                      variant={requestResponseLayout === "vertical" ? "contained" : "outlined"}
                      startIcon={<PanelBottom />}
                      onClick={() => setRequestResponseLayout("vertical")}
                    >
                      Stacked
                    </Button>
                  </Stack>
                  {requestResponseLayout === "horizontal" && !horizontalLayoutAvailable ? (
                    <Typography variant="caption" color="text.secondary">
                      Side by side is preserved and will resume automatically when the workbench is wide enough.
                    </Typography>
                  ) : null}
                </Stack>
              </SettingCard>
              <SettingCard title="Interface zoom">
                <Stack direction="row" spacing={0.7} alignItems="center">
                  <Button variant="outlined" onClick={zoomAppOut}>
                    −
                  </Button>
                  <Chip label={`${appZoomInfo?.settings?.zoomPercent ?? 100}%`} />
                  <Button variant="outlined" onClick={zoomAppIn}>
                    +
                  </Button>
                  <Button variant="text" onClick={resetAppZoomLevel}>
                    Reset
                  </Button>
                </Stack>
              </SettingCard>
            </Stack>
          )}

          {settingsSection === "workspace" && (
            <Stack spacing="var(--workbench-card-gap)" sx={{ width: "100%" }}>
              <SettingCard title="Workspace folder">
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Storage color="primary" />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Active folder
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                        {workspaceFolderPath || "Workspace not selected"}
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                    <Button variant="contained" startIcon={<UploadFile />} onClick={() => void openWorkspaceFolder()}>
                      Open folder
                    </Button>
                    <Button variant="outlined" onClick={() => void createNewWorkspaceFolder()}>
                      New workspace
                    </Button>
                    <Button variant="outlined" onClick={() => void chooseCustomWorkspacePreference()}>
                      Choose folder
                    </Button>
                    <Button variant="text" onClick={() => void applyWorkspacePreference()}>
                      Use default
                    </Button>
                  </Stack>
                </Stack>
              </SettingCard>
              <SettingCard title="Workspace data">
                <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                  <Button variant="contained" onClick={() => void saveWorkspaceFolder()}>
                    Save
                  </Button>
                  <Button variant="outlined" onClick={() => void saveWorkspaceFolderAs()}>
                    Save as
                  </Button>
                  <Chip color="success" variant="outlined" label="Autosave" />
                </Stack>
              </SettingCard>
            </Stack>
          )}

          {settingsSection === "environments" && (
            <Stack spacing="var(--workbench-card-gap)" sx={{ width: "100%" }}>
              <SettingCard title="Environments">
                <Stack spacing={0.65}>
                  {environments.map((environment: any) => (
                    <Paper key={environment.key} variant="outlined" sx={{ px: 1, py: 0.75 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {environment.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {environment.grpcWebBaseUrl || environment.restBaseUrl || environment.nativeTarget}
                          </Typography>
                        </Box>
                        <Button size="small" onClick={() => openEnvironmentManager(environment)}>
                          Edit
                        </Button>
                      </Stack>
                    </Paper>
                  ))}
                  <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                    <Button variant="outlined" onClick={() => openEnvironmentManager()}>
                      Add
                    </Button>
                    <Button variant="text" onClick={() => setBulkOpen((current) => !current)}>
                      Bulk add
                    </Button>
                  </Stack>
                  {bulkOpen && (
                    <Paper variant="outlined" sx={{ px: 1, py: 1 }}>
                      <Stack spacing={0.7}>
                        <Typography variant="caption" color="text.secondary">
                          One environment per line: Name | rest=… | grpc=… | web=… | ws=…
                        </Typography>
                        <TextField
                          multiline
                          minRows={5}
                          value={bulkText}
                          onChange={(event: any) => setBulkText(event.target.value)}
                          placeholder={
                            "Local | rest=http://localhost:3000 | grpc=localhost:50051\nStaging | rest=https://api.example.com | web=https://grpc.example.com"
                          }
                        />
                        <Stack direction="row" spacing={0.7} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => {
                              setBulkOpen(false);
                              setBulkText("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button size="small" variant="contained" onClick={submitBulkEnvironments}>
                            Add environments
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  )}
                </Stack>
              </SettingCard>
            </Stack>
          )}

          {settingsSection === "network" && (
            <Stack spacing="var(--workbench-card-gap)" sx={{ width: "100%" }}>
              <SettingCard title="Certificates">
                <Button variant="contained" onClick={openCertificateSettings}>
                  Certificate settings
                </Button>
              </SettingCard>
              <SettingCard title="Web access">
                <Typography variant="body2" color="text.secondary">
                  Configure the browser bridge in Services → gRPC → Web access.
                </Typography>
              </SettingCard>
            </Stack>
          )}

          {settingsSection === "logging" && (
            <Stack spacing="var(--workbench-card-gap)" sx={{ width: "100%" }}>
              <SettingCard title="Application logging">
                <Button variant="contained" onClick={openLoggerSettings}>
                  Logging settings
                </Button>
              </SettingCard>
            </Stack>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

function SettingCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Paper elevation={0} sx={settingCardSx}>
      <Typography variant="body2" fontWeight={600}>{title}</Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {description}
        </Typography>
      )}
      <Box sx={{ mt: 0.8 }}>{children}</Box>
    </Paper>
  );
}
