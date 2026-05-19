import type { ChangeEvent } from "react";

import {
  Edit,
  PlayArrow,
  StopCircle,
} from "@/components/shadcn/icons";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@/components/shadcn/compat";
import type { RpcMethodInfo } from "@/lib/types";
import { designSystem } from "../../design-system";
import { CodeTextField as FeatureCodeTextField } from "../request-editor/request-editor-panels";
import { MethodMockSwitch, SmallEmpty } from "../sidebar/sidebar-panels";
import {
  createDefaultMockStreamDefaults,
  describeMockMatcher,
  safeMockFileBaseName,
} from "./mock-scenario-model";
import { methodKey } from "../../shared/rpc-method-utils";
import {
  buttonSx,
  compactCardSx,
  iconButtonSx,
} from "../../shared/workbench-constants";
import type {
  MockFormat,
  MockMethodScenarioFile,
  MockMethodScenarioRow,
  MockParseResult,
  MockServerProject,
  MockServerStatus,
  MockStreamSettings,
} from "../../shared/workbench-types";

type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SelectInputChangeEvent = ChangeEvent<HTMLSelectElement>;

export function MockServerSidebar({
  mockServer,
  selectedMethod,
  status,
  currentFile,
  currentParseResult,
  onSettings,
  onGenerate,
  onStart,
  onStop,
  onImport,
  onExport,
}: {
  mockServer: MockServerProject;
  selectedMethod: RpcMethodInfo | null;
  status: MockServerStatus;
  currentFile: MockMethodScenarioFile;
  currentParseResult: MockParseResult;
  onSettings: () => void;
  onGenerate: () => void;
  onStart: () => void;
  onStop: () => void;
  onImport: () => void;
  onExport: () => void;
}) {
  return (
    <Stack spacing={designSystem.space.gap}>
      <Paper variant="outlined" sx={compactCardSx}>
        <Stack spacing={0.8}>
          <Stack
            direction="row"
            spacing={0.6}
            alignItems="center"
            justifyContent="space-between"
          >
            <Typography variant="body2" fontWeight={560}>
              Mock server
            </Typography>
            <Chip
              size="small"
              color={status.running ? "success" : "default"}
              label={status.running ? "Running" : "Stopped"}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block">
            Bind {status.bindAddress ?? `${mockServer.bindHost}:${status.port ?? mockServer.port}`}
          </Typography>
          {status.url && (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
            >
              Local: {status.url}
            </Typography>
          )}
          {status.apisixTarget && (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              title="Use this host:port as the APISIX upstream target when APISIX runs in Docker Desktop on the same machine."
            >
              APISIX upstream: {status.apisixTarget}
            </Typography>
          )}
          {status.message && (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
            >
              {status.message}
            </Typography>
          )}
          <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            flexWrap="wrap"
          >
            <Button
              size="small"
              variant="outlined"
              onClick={onSettings}
              sx={buttonSx}
            >
              Settings
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<PlayArrow />}
              onClick={onStart}
              disabled={status.running}
              sx={buttonSx}
            >
              Start
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<StopCircle />}
              onClick={onStop}
              disabled={!status.running}
              sx={buttonSx}
            >
              Stop
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={compactCardSx}>
        <Stack spacing={0.7}>
          <Typography variant="body2" fontWeight={560}>
            Current method file
          </Typography>
          <Typography
            variant="caption"
            color={selectedMethod ? "text.secondary" : "error"}
            display="block"
          >
            {selectedMethod
              ? `${safeMockFileBaseName(selectedMethod)}.${currentFile.format === "yaml" ? "yaml" : "json"}`
              : "Select a method first"}
          </Typography>
          <Typography
            variant="caption"
            color={currentParseResult.ok ? "text.secondary" : "error"}
            display="block"
          >
            {currentParseResult.ok
              ? "Method mock file ready"
              : currentParseResult.error}
          </Typography>
          <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            flexWrap="wrap"
          >
            <Button
              size="small"
              variant="outlined"
              onClick={onGenerate}
              disabled={!selectedMethod}
              sx={buttonSx}
            >
              Add scenario
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={onImport}
              disabled={!selectedMethod}
              sx={buttonSx}
            >
              Import
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={onExport}
              disabled={!selectedMethod || !currentParseResult.ok}
              sx={buttonSx}
            >
              Export
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}

export function MockServerSettingsDialog({
  open,
  onClose,
  mockServer,
  status,
  parseResult,
  mappingRows,
  onPortChange,
  onBindHostChange,
  onScenarioSelectChange,
  onMethodEnabledChange,
  onScenarioStreamSettingsChange,
  onStreamBaseChange,
  onStart,
  onStop,
}: {
  open: boolean;
  onClose: () => void;
  mockServer: MockServerProject;
  status: MockServerStatus;
  parseResult: MockParseResult;
  mappingRows: MockMethodScenarioRow[];
  onPortChange: (value: string) => void;
  onBindHostChange: (value: string) => void;
  onScenarioSelectChange: (method: RpcMethodInfo, scenarioId: string) => void;
  onMethodEnabledChange: (method: RpcMethodInfo, enabled: boolean) => void;
  onScenarioStreamSettingsChange: (
    method: RpcMethodInfo,
    scenarioId: string,
    patch: Partial<MockStreamSettings>,
  ) => void;
  onStreamBaseChange: (patch: Partial<MockStreamSettings>) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const streamDefaults =
    mockServer.streamDefaults ?? createDefaultMockStreamDefaults();
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Mock server settings</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={1.2} sx={{ mt: 0.5 }}>
          <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
            <Stack spacing={1}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="end"
                flexWrap="wrap"
              >
                <TextField
                  size="small"
                  type="number"
                  label="Port"
                  value={String(mockServer.port)}
                  onChange={(event: TextInputChangeEvent) =>
                    onPortChange(event.target.value)
                  }
                  sx={{ width: 120 }}
                />
                <TextField
                  size="small"
                  label="Bind IP"
                  value={mockServer.bindHost}
                  onChange={(event: TextInputChangeEvent) =>
                    onBindHostChange(event.target.value)
                  }
                  placeholder="127.0.0.1"
                  title="IP address where the mock gRPC server listens. Use a LAN IP if APISIX runs on another machine or container that cannot reach localhost."
                  sx={{ width: 170 }}
                />
                {status.running ? (
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    startIcon={<StopCircle />}
                    onClick={onStop}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<PlayArrow />}
                    onClick={onStart}
                  >
                    Start
                  </Button>
                )}
                <Box sx={{ flex: 1, minWidth: 160 }} />
                <Chip
                  size="small"
                  color={status.running ? "success" : "default"}
                  label={
                    status.running
                      ? `Running on ${status.bindAddress ?? `${mockServer.bindHost}:${status.port ?? mockServer.port}`}`
                      : "Stopped"
                  }
                />
              </Stack>
              <Stack
                direction="row"
                spacing={0.8}
                alignItems="center"
                flexWrap="wrap"
              >
                <TextField
                  size="small"
                  type="number"
                  label="Interval ms"
                  value={String(streamDefaults.intervalMs ?? 0)}
                  onChange={(event: TextInputChangeEvent) =>
                    onStreamBaseChange({
                      intervalMs: Math.max(
                        0,
                        Math.floor(Number(event.target.value) || 0),
                      ),
                    })
                  }
                  sx={{ width: 130 }}
                />
                <Stack spacing={0.3}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    Loop
                  </Typography>
                  <FormControl size="small" sx={{ width: 120 }}>
                    <Select
                      value={streamDefaults.loop ? "yes" : "no"}
                      onChange={(event: SelectInputChangeEvent) =>
                        onStreamBaseChange({
                          loop: event.target.value === "yes",
                        })
                      }
                    >
                      <MenuItem value="no">No</MenuItem>
                      <MenuItem value="yes">Yes</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
                <TextField
                  size="small"
                  type="number"
                  label="Max loops"
                  value={String(streamDefaults.maxLoops ?? 0)}
                  onChange={(event: TextInputChangeEvent) =>
                    onStreamBaseChange({
                      maxLoops: Math.max(
                        0,
                        Math.floor(Number(event.target.value) || 0),
                      ),
                    })
                  }
                  helperText="0 = infinite"
                  sx={{ width: 130 }}
                />
              </Stack>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
            <Stack spacing={0.9}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1}
                flexWrap="wrap"
              >
                <Typography variant="body2" fontWeight={560}>
                  Methods
                </Typography>
              </Stack>
              {parseResult.ok ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Mock</TableCell>
                        <TableCell>Method</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Scenario</TableCell>
                        <TableCell>Stream override</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {mappingRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5}>
                            Import proto files before adding scenarios.
                          </TableCell>
                        </TableRow>
                      ) : (
                        mappingRows.map((row) => {
                          const stream = row.activeScenario?.stream;
                          const canStream =
                            row.mode === "server-stream" &&
                            Boolean(row.activeScenario);
                          return (
                            <TableRow key={`settings-${row.methodKey}`}>
                              <TableCell sx={{ width: 72 }}>
                                <MethodMockSwitch
                                  checked={row.methodEnabled}
                                  onChange={(checked) =>
                                    onMethodEnabledChange(row.method, checked)
                                  }
                                />
                              </TableCell>
                              <TableCell
                                title={`${row.serviceName}/${row.methodName}`}
                              >
                                {row.methodName}
                              </TableCell>
                              <TableCell>{row.mode}</TableCell>
                              <TableCell sx={{ minWidth: 230 }}>
                                {row.scenarios.length ? (
                                  <FormControl
                                    size="small"
                                    sx={{ minWidth: 220 }}
                                  >
                                    <Select
                                      value={
                                        row.activeScenarioId ||
                                        row.scenarios[0]?.id ||
                                        ""
                                      }
                                      onChange={(
                                        event: SelectInputChangeEvent,
                                      ) =>
                                        onScenarioSelectChange(
                                          row.method,
                                          String(event.target.value),
                                        )
                                      }
                                    >
                                      {row.scenarios.map((scenario) => (
                                        <MenuItem
                                          key={`scenario-option-${row.methodKey}-${scenario.id}`}
                                          value={scenario.id}
                                        >
                                          {scenario.id}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                ) : (
                                  <Typography
                                    variant="caption"
                                    color="error"
                                    display="block"
                                  >
                                    No scenario
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell sx={{ minWidth: 360 }}>
                                {canStream ? (
                                  <Stack
                                    direction="row"
                                    spacing={0.6}
                                    alignItems="center"
                                    flexWrap="wrap"
                                  >
                                    <TextField
                                      size="small"
                                      type="number"
                                      label="Interval"
                                      value={String(
                                        stream?.intervalMs ??
                                          streamDefaults.intervalMs ??
                                          0,
                                      )}
                                      onChange={(event: TextInputChangeEvent) =>
                                        onScenarioStreamSettingsChange(
                                          row.method,
                                          row.activeScenarioId,
                                          {
                                            intervalMs: Math.max(
                                              0,
                                              Math.floor(
                                                Number(event.target.value) || 0,
                                              ),
                                            ),
                                          },
                                        )
                                      }
                                      sx={{ width: 110 }}
                                    />
                                    <Stack spacing={0.3}>
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        display="block"
                                      >
                                        Loop
                                      </Typography>
                                      <FormControl
                                        size="small"
                                        sx={{ width: 110 }}
                                      >
                                        <Select
                                          value={
                                            (stream?.loop ??
                                            streamDefaults.loop)
                                              ? "yes"
                                              : "no"
                                          }
                                          onChange={(
                                            event: SelectInputChangeEvent,
                                          ) =>
                                            onScenarioStreamSettingsChange(
                                              row.method,
                                              row.activeScenarioId,
                                              {
                                                loop:
                                                  event.target.value === "yes",
                                              },
                                            )
                                          }
                                        >
                                          <MenuItem value="no">No</MenuItem>
                                          <MenuItem value="yes">Yes</MenuItem>
                                        </Select>
                                      </FormControl>
                                    </Stack>
                                    <TextField
                                      size="small"
                                      type="number"
                                      label="Max"
                                      value={String(
                                        stream?.maxLoops ??
                                          streamDefaults.maxLoops ??
                                          0,
                                      )}
                                      onChange={(event: TextInputChangeEvent) =>
                                        onScenarioStreamSettingsChange(
                                          row.method,
                                          row.activeScenarioId,
                                          {
                                            maxLoops: Math.max(
                                              0,
                                              Math.floor(
                                                Number(event.target.value) || 0,
                                              ),
                                            ),
                                          },
                                        )
                                      }
                                      sx={{ width: 100 }}
                                    />
                                  </Stack>
                                ) : (
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    display="block"
                                  >
                                    {row.mode === "unary"
                                      ? "Unary method"
                                      : "Streaming type not supported"}
                                  </Typography>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Alert severity="error" variant="filled">
                  {parseResult.error}
                </Alert>
              )}
            </Stack>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export function MockServerPanel({
  selectedMethod,
  status,
  currentFile,
  currentParseResult,
  editorText,
  streamDefaults,
  mappingRows,
  onScenarioTextChange,
  onFormatChange,
  onFormat,
  onAddScenario,
  onScenarioSelectChange,
  onMethodEnabledChange,
  onScenarioStreamSettingsChange,
  onEditScenario,
  onImport,
  onExport,
  onOpenFolder,
  onOpenSettings,
}: {
  selectedMethod: RpcMethodInfo | null;
  status: MockServerStatus;
  currentFile: MockMethodScenarioFile;
  currentParseResult: MockParseResult;
  editorText: string;
  streamDefaults: Required<
    Pick<MockStreamSettings, "intervalMs" | "loop" | "maxLoops">
  >;
  mappingRows: MockMethodScenarioRow[];
  onScenarioTextChange: (value: string) => void;
  onFormatChange: (format: MockFormat) => void;
  onFormat: () => void;
  onAddScenario: () => void;
  onScenarioSelectChange: (method: RpcMethodInfo, scenarioId: string) => void;
  onMethodEnabledChange: (method: RpcMethodInfo, enabled: boolean) => void;
  onScenarioStreamSettingsChange: (
    method: RpcMethodInfo,
    scenarioId: string,
    patch: Partial<MockStreamSettings>,
  ) => void;
  onEditScenario: (method: RpcMethodInfo, scenarioId: string) => void;
  onImport: () => void;
  onExport: () => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
}) {
  const currentRow = selectedMethod
    ? mappingRows.find((row) => row.methodKey === methodKey(selectedMethod))
    : undefined;
  const currentScenarios = currentRow?.scenarios ?? [];
  const streamBase = streamDefaults ?? createDefaultMockStreamDefaults();
  const activeStream = currentRow?.activeScenario?.stream;
  const selectedScenarioId =
    currentRow?.activeScenarioId || currentScenarios[0]?.id || "";
  return (
    <Stack spacing={1.2}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        flexWrap="wrap"
      >
        <Stack spacing={0.2} sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1">Method mock scenarios</Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {selectedMethod
              ? `${selectedMethod.serviceName}/${selectedMethod.methodName} - ${safeMockFileBaseName(selectedMethod)}.${currentFile.format === "yaml" ? "yaml" : "json"}`
              : "Select a method to edit its own mock file"}
          </Typography>
        </Stack>
        <Stack
          direction="row"
          spacing={0.6}
          alignItems="center"
          flexWrap="wrap"
        >
          <Chip
            size="small"
            label={status.running ? "Running" : "Stopped"}
            color={status.running ? "success" : "default"}
          />
          <Button size="small" variant="outlined" onClick={onOpenSettings}>
            Mock settings
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap">
        <FormControl size="small" sx={{ width: 96 }} disabled={!selectedMethod}>
          <Select
            value={currentFile.format}
            onChange={(event: SelectInputChangeEvent) =>
              onFormatChange(event.target.value as MockFormat)
            }
          >
            <MenuItem value="json">JSON</MenuItem>
            <MenuItem value="yaml">YAML</MenuItem>
          </Select>
        </FormControl>
        <Button
          size="small"
          variant="outlined"
          onClick={onAddScenario}
          disabled={!selectedMethod}
        >
          Add scenario
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={onImport}
          disabled={!selectedMethod}
        >
          Import
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={onExport}
          disabled={!selectedMethod || !currentParseResult.ok}
        >
          Export
        </Button>
        <Button size="small" variant="outlined" onClick={onOpenFolder}>
          Open folder
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
        <Stack spacing={0.8}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            flexWrap="wrap"
          >
            <Typography variant="body2" fontWeight={560}>
              Scenario for current method
            </Typography>
            {selectedMethod && (
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
              >
                {currentFile.format.toUpperCase()}
              </Typography>
            )}
          </Stack>
          {!selectedMethod ? (
            <SmallEmpty body="Select a method to edit that method's mock file." />
          ) : currentScenarios.length === 0 ? (
            <SmallEmpty body="No scenario exists for this method yet. Click Add scenario." />
          ) : (
            <Stack spacing={0.8}>
              <Stack
                direction="row"
                spacing={0.8}
                alignItems="center"
                flexWrap="wrap"
              >
                <MethodMockSwitch
                  checked={Boolean(currentRow?.methodEnabled)}
                  onChange={(checked) =>
                    onMethodEnabledChange(selectedMethod, checked)
                  }
                />
                <Typography variant="body2" fontWeight={540}>
                  {currentRow?.methodEnabled ? "Mock enabled" : "Mock disabled"}
                </Typography>
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <Select
                    value={selectedScenarioId}
                    onChange={(event: SelectInputChangeEvent) =>
                      onScenarioSelectChange(
                        selectedMethod,
                        String(event.target.value),
                      )
                    }
                  >
                    {currentScenarios.map((scenario) => (
                      <MenuItem
                        key={`current-scenario-${scenario.id}`}
                        value={scenario.id}
                      >
                        {scenario.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Tooltip title="Edit scenario">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() =>
                        onEditScenario(selectedMethod, selectedScenarioId)
                      }
                      disabled={!selectedScenarioId}
                      sx={iconButtonSx}
                    >
                      <Edit sx={{ fontSize: 15 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                {currentRow?.activeScenario && (
                  <Chip
                    size="small"
                    label={describeMockMatcher(currentRow.activeScenario.input)}
                  />
                )}
              </Stack>
              {selectedMethod.responseStream && currentRow?.activeScenario ? (
                <Stack
                  direction="row"
                  spacing={0.7}
                  alignItems="center"
                  flexWrap="wrap"
                >
                  <TextField
                    size="small"
                    type="number"
                    label="Interval ms"
                    value={String(
                      activeStream?.intervalMs ?? streamBase.intervalMs ?? 0,
                    )}
                    onChange={(event: TextInputChangeEvent) =>
                      onScenarioStreamSettingsChange(
                        selectedMethod,
                        selectedScenarioId,
                        {
                          intervalMs: Math.max(
                            0,
                            Math.floor(Number(event.target.value) || 0),
                          ),
                        },
                      )
                    }
                    sx={{ width: 130 }}
                  />
                  <Stack spacing={0.3}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Loop
                    </Typography>
                    <FormControl size="small" sx={{ width: 120 }}>
                      <Select
                        value={
                          (activeStream?.loop ?? streamBase.loop) ? "yes" : "no"
                        }
                        onChange={(event: SelectInputChangeEvent) =>
                          onScenarioStreamSettingsChange(
                            selectedMethod,
                            selectedScenarioId,
                            {
                              loop: event.target.value === "yes",
                            },
                          )
                        }
                      >
                        <MenuItem value="no">No</MenuItem>
                        <MenuItem value="yes">Yes</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>
                  <TextField
                    size="small"
                    type="number"
                    label="Max loops"
                    value={String(
                      activeStream?.maxLoops ?? streamBase.maxLoops ?? 0,
                    )}
                    onChange={(event: TextInputChangeEvent) =>
                      onScenarioStreamSettingsChange(
                        selectedMethod,
                        selectedScenarioId,
                        {
                          maxLoops: Math.max(
                            0,
                            Math.floor(Number(event.target.value) || 0),
                          ),
                        },
                      )
                    }
                    helperText="0 = infinite"
                    sx={{ width: 130 }}
                  />
                  <Chip
                    size="small"
                    label={`${currentRow.activeScenario.stream?.responses?.length ?? 0} stream response`}
                  />
                </Stack>
              ) : (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                >
                  Unary scenarios use output data only.
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </Paper>

      <Stack spacing={0.6}>
        <Typography variant="body2" fontWeight={560}>
          Selected scenario JSON/YAML editor
        </Typography>
        <FeatureCodeTextField
          value={editorText}
          onChange={onScenarioTextChange}
          minRows={15}
          maxRows={28}
          language={currentFile.format}
          onFormat={onFormat}
          formatDisabled={!selectedMethod}
          formatAriaLabel="Format scenario"
          fullscreenTitle="Mock scenario editor"
        />
      </Stack>
    </Stack>
  );
}
