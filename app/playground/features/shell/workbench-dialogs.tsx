"use client";

import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { LayangLoggerSettings, LayangLogLevel } from "../../shared/logger";

type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SelectInputChangeEvent = ChangeEvent<HTMLSelectElement>;
type TextInputKeyboardEvent = ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>;
type ToastState = { id: number; open: boolean; message: string; severity: "success" | "info" | "warning" | "error" };

type WorkbenchViewContext = Record<string, any>;

export function WorkbenchDialogs(props: { ctx: WorkbenchViewContext }) {
  const {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FeatureMarkdownPreview,
    FeatureProtoSourceBlock,
    MockServerSettingsDialog,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Stack,
    TextField,
    Typography,
    activeTransportMode,
    addMockScenarioForMethod,
    applyWorkspacePreference,
    chooseCustomWorkspacePreference,
    collectionDialogOpen,
    collectionNameDraft,
    confirmAddCollection,
    confirmAddCollectionRequest,
    confirmRenameMockScenario,
    confirmSaveCurrentEnvironment,
    deleteEditingMockScenario,
    docsPreview,
    downloadTextFile,
    envDialogMode,
    envDialogOpen,
    envDraftName,
    envDraftUrl,
    handleMockBindHostChange,
    handleMockGlobalStreamBaseChange,
    handleMockMethodEnabledChange,
    handleMockPortChange,
    handleMockScenarioSelectChange,
    handleMockScenarioStreamSettingsChange,
    mockMappingRows,
    mockScenarioDialogOpen,
    mockScenarioDraftId,
    mockScenarioEditing,
    mockServer,
    mockServerStatus,
    loggerDraft,
    loggerInfo,
    loggerLevelOptions,
    loggerSettingsOpen,
    mockSettingsOpen,
    parsedMockConfig,
    protoPreview,
    openLogFolder,
    removeEditingEnvironment,
    requestKindDraft,
    requestNameDialogOpen,
    requestNameDraft,
    setCollectionDialogOpen,
    setCollectionNameDraft,
    setDocsPreview,
    setEnvDialogOpen,
    setEnvDraftName,
    setEnvDraftUrl,
    setLoggerDraft,
    setLoggerSettingsOpen,
    setMockScenarioDialogOpen,
    setMockScenarioDraftId,
    setMockSettingsOpen,
    setProtoPreview,
    setRequestNameDialogOpen,
    setRequestNameDraft,
    setToast,
    saveLoggerSettings,
    clearLogFiles,
    startMockServer,
    stopMockServer,
    timestampForFile,
    toast,
    transportTargetLabel,
    transportTargetPlaceholder,
    workspaceSetupDefaultPath,
    workspaceSetupOpen,
    workspaceSetupPending,
  } = props.ctx;

  return (
    <>
      <MockServerSettingsDialog
        open={mockSettingsOpen}
        onClose={() => setMockSettingsOpen(false)}
        mockServer={mockServer}
        status={mockServerStatus}
        parseResult={parsedMockConfig}
        mappingRows={mockMappingRows}
        onPortChange={handleMockPortChange}
        onBindHostChange={handleMockBindHostChange}
        onScenarioSelectChange={handleMockScenarioSelectChange}
        onMethodEnabledChange={handleMockMethodEnabledChange}
        onScenarioStreamSettingsChange={handleMockScenarioStreamSettingsChange}
        onStreamBaseChange={handleMockGlobalStreamBaseChange}
        onAddScenarioForMethod={addMockScenarioForMethod}
        onStart={() => void startMockServer()}
        onStop={() => void stopMockServer()}
      />

      <Dialog open={workspaceSetupOpen} onClose={() => undefined} fullWidth maxWidth="sm">
        <DialogTitle>Choose Workspace Folder</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              Layang stores requests, mocks, docs, environments, and history in a workspace folder on disk.
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <Typography variant="subtitle2">Default location</Typography>
              <Typography variant="body2" color="text.secondary">
                {workspaceSetupDefaultPath || "Documents\\Layang\\Workspace"}
              </Typography>
            </Paper>
            <Typography variant="caption" color="text.secondary">
              You can keep the default Documents location or choose another folder before the first workspace is
              created.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void chooseCustomWorkspacePreference()} disabled={workspaceSetupPending}>
            Choose custom folder
          </Button>
          <Button variant="contained" onClick={() => void applyWorkspacePreference()} disabled={workspaceSetupPending}>
            Use default folder
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={mockScenarioDialogOpen} onClose={() => setMockScenarioDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Edit Scenario</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <TextField
              autoFocus
              size="small"
              label="Scenario name"
              value={mockScenarioDraftId}
              onChange={(event: TextInputChangeEvent) => setMockScenarioDraftId(event.target.value)}
              placeholder="sayhello-success"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="error" onClick={deleteEditingMockScenario} disabled={!mockScenarioEditing}>
            Delete
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setMockScenarioDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmRenameMockScenario} disabled={!mockScenarioEditing}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={collectionDialogOpen} onClose={() => setCollectionDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add Collection</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <TextField
              autoFocus
              size="small"
              label="Collection name"
              value={collectionNameDraft}
              onChange={(event: TextInputChangeEvent) => setCollectionNameDraft(event.target.value)}
              onKeyDown={(event: TextInputKeyboardEvent) => {
                if (event.key === "Enter") confirmAddCollection();
              }}
              placeholder="Sample API Collection"
            />
            <Typography variant="caption" color="text.secondary">
              Use the row buttons to add REST or WebSocket requests.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCollectionDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmAddCollection}>
            Add Collection
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={requestNameDialogOpen} onClose={() => setRequestNameDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{requestKindDraft === "rest" ? "Add REST Request" : "Add WebSocket Request"}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <TextField
              autoFocus
              size="small"
              label={requestKindDraft === "rest" ? "REST request name" : "WebSocket request name"}
              value={requestNameDraft}
              onChange={(event: TextInputChangeEvent) => setRequestNameDraft(event.target.value)}
              onKeyDown={(event: TextInputKeyboardEvent) => {
                if (event.key === "Enter") confirmAddCollectionRequest();
              }}
              placeholder={requestKindDraft === "rest" ? "List users" : "Chat stream"}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRequestNameDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmAddCollectionRequest}>
            Add Request
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={envDialogOpen} onClose={() => setEnvDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{envDialogMode === "edit" ? "Update Environment" : "Save Environment"}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <TextField
              autoFocus
              size="small"
              label="Environment name"
              value={envDraftName}
              onChange={(event: TextInputChangeEvent) => setEnvDraftName(event.target.value)}
              placeholder="Develop Env"
            />
            <TextField
              size="small"
              label={transportTargetLabel(activeTransportMode)}
              value={envDraftUrl}
              onChange={(event: TextInputChangeEvent) => setEnvDraftUrl(event.target.value)}
              placeholder={transportTargetPlaceholder(activeTransportMode)}
            />
            <Typography variant="caption" color="text.secondary">
              {envDialogMode === "edit" ? "Update the selected environment." : "Save this environment for reuse."}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          {envDialogMode === "edit" && (
            <Button color="error" onClick={removeEditingEnvironment}>
              Remove
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setEnvDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmSaveCurrentEnvironment}>
            {envDialogMode === "edit" ? "Update" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(docsPreview)} onClose={() => setDocsPreview(null)} fullWidth maxWidth="lg">
        <DialogTitle>{docsPreview?.title ?? "Generated docs"}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {docsPreview && <FeatureMarkdownPreview markdown={docsPreview.markdown} />}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              docsPreview &&
              downloadTextFile(`layang-docs-${timestampForFile()}.md`, docsPreview.markdown, "text/markdown")
            }
          >
            Export markdown
          </Button>
          <Button variant="contained" onClick={() => setDocsPreview(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(protoPreview)} onClose={() => setProtoPreview(null)} fullWidth maxWidth="lg">
        <DialogTitle>{protoPreview?.name ?? "Proto source"}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>{protoPreview && <FeatureProtoSourceBlock file={protoPreview} />}</DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              protoPreview &&
              downloadTextFile(
                `layang-proto-${protoPreview.name.replace(/[^a-z0-9_.-]/gi, "-")}-${timestampForFile()}.proto`,
                protoPreview.text,
                "text/x-protobuf",
              )
            }
          >
            Export proto
          </Button>
          <Button variant="contained" onClick={() => setProtoPreview(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={loggerSettingsOpen} onClose={() => setLoggerSettingsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Logger settings</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.4} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Runtime changes apply immediately and are saved for the next app start. Environment variables can still
              override these values when the app starts.
            </Typography>
            <Select
              size="small"
              label="Log level"
              value={loggerDraft.level}
              onChange={(event: SelectInputChangeEvent) =>
                setLoggerDraft((current: LayangLoggerSettings) => ({
                  ...current,
                  level: event.target.value as LayangLogLevel,
                }))
              }
            >
              {loggerLevelOptions.map((level: string) => (
                <MenuItem key={level} value={level}>
                  {level}
                </MenuItem>
              ))}
            </Select>
            <Select
              size="small"
              label="Console logging"
              value={loggerDraft.mirrorToConsole ? "1" : "0"}
              onChange={(event: SelectInputChangeEvent) =>
                setLoggerDraft((current: LayangLoggerSettings) => ({
                  ...current,
                  mirrorToConsole: event.target.value === "1",
                }))
              }
            >
              <MenuItem value="0">Off</MenuItem>
              <MenuItem value="1">On</MenuItem>
            </Select>
            <TextField
              size="small"
              label="Max file size (MB)"
              type="number"
              value={Math.max(1, Math.round(loggerDraft.maxBytes / 1024 / 1024))}
              onChange={(event: TextInputChangeEvent) =>
                setLoggerDraft((current: LayangLoggerSettings) => ({
                  ...current,
                  maxBytes: Math.max(1, Number.parseInt(event.target.value || "1", 10)) * 1024 * 1024,
                }))
              }
            />
            <TextField
              size="small"
              label="Max logs folder size (MB)"
              type="number"
              value={Math.max(1, Math.round(loggerDraft.maxTotalBytes / 1024 / 1024))}
              onChange={(event: TextInputChangeEvent) =>
                setLoggerDraft((current: LayangLoggerSettings) => ({
                  ...current,
                  maxTotalBytes: Math.max(1, Number.parseInt(event.target.value || "1", 10)) * 1024 * 1024,
                }))
              }
            />
            <TextField
              size="small"
              label="Retention days"
              type="number"
              value={loggerDraft.retentionDays}
              onChange={(event: TextInputChangeEvent) =>
                setLoggerDraft((current: LayangLoggerSettings) => ({
                  ...current,
                  retentionDays: Math.max(1, Number.parseInt(event.target.value || "1", 10)),
                }))
              }
            />
            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Log folder
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                {loggerInfo?.logDir || "Logger is not available in this browser session."}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {loggerInfo
                  ? `${loggerInfo.fileCount} file(s), ${Math.round(loggerInfo.totalBytes / 1024)} KB total`
                  : ""}
              </Typography>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void openLogFolder()}>Open folder</Button>
          <Button color="error" onClick={() => void clearLogFiles()}>
            Clear logs
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setLoggerSettingsOpen(false)}>Close</Button>
          <Button variant="contained" onClick={() => void saveLoggerSettings()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        key={toast.id}
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((current: ToastState) => ({ ...current, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((current: ToastState) => ({ ...current, open: false }))}
          sx={{ maxWidth: 560 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}
