import type { ChangeEvent } from "react";

import { ContentCopy, Download, Edit, PlayArrow, StopCircle } from "@/components/shadcn/icons";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
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
import type { GrpcResult } from "@/lib/types";
import { calculateBenchmarkStats } from "../benchmark/benchmark-panel";
import { MarkdownPreview as FeatureMarkdownPreview } from "../docs-publisher/docs-publisher-panel";
import { CodeTextField as FeatureCodeTextField } from "../request-editor/request-editor-panels";
import { JsonBlock as FeatureJsonBlock } from "../response-viewer/response-viewer";
import { formatTimestampShort } from "../../shared/formatters";
import type {
  ApiCollectionRequest,
  BenchmarkResult,
  MethodDoc,
  SavedExample,
  WebSocketMockStatus,
  WebSocketMockScenario,
} from "../../shared/workbench-types";

type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SelectInputChangeEvent = ChangeEvent<HTMLSelectElement>;

type WebSocketRequestPathRow = {
  id: string;
  requestId?: string;
  name: string;
  path: string;
  enabled: boolean;
  url: string;
  intervalMs?: number;
  loop?: boolean;
  maxLoops?: number;
};

type WebSocketSidebarRequestRow = WebSocketRequestPathRow & {
  scenarioId: string;
  requestName: string;
  clientCount?: number;
};

export function WebSocketMockSidebar({
  status,
  port,
  rows,
  activeScenarioId,
  onPortChange,
  onScenarioChange,
  onOpenScenario,
  onStart,
  onStop,
}: {
  status: WebSocketMockStatus;
  port: number;
  rows: WebSocketSidebarRequestRow[];
  activeScenarioId?: string;
  onPortChange: (value: number) => void;
  onScenarioChange: (scenarioId: string, patch: Partial<WebSocketMockScenario>) => void;
  onOpenScenario: (requestId: string | undefined, scenarioId: string) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const host = "127.0.0.1";
  const pathCounts = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.path || "/";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <Stack spacing={1.1}>
      <Paper variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
        <Stack spacing={0.9}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                WebSocket mock server
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap title={`ws://${host}:${port}`}>
                {status.running ? `Running · ${status.clientCount ?? 0} client` : "Stopped"}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={status.running ? "Running" : "Stopped"}
              color={status.running ? "success" : "default"}
            />
          </Stack>
          <Stack direction="row" spacing={0.7} alignItems="end" flexWrap="wrap" useFlexGap>
            <TextField size="small" label="IP" value={host} disabled sx={{ width: 118 }} />
            <TextField
              size="small"
              type="number"
              label="Port"
              value={String(port)}
              onChange={(event: TextInputChangeEvent) =>
                onPortChange(Math.max(1, Math.floor(Number(event.target.value) || 8090)))
              }
              disabled={status.running}
              sx={{ width: 92 }}
            />
            {status.running ? (
              <Button size="small" color="warning" variant="outlined" startIcon={<StopCircle />} onClick={onStop}>
                Stop
              </Button>
            ) : (
              <Button
                size="small"
                variant="contained"
                startIcon={<PlayArrow />}
                onClick={onStart}
                disabled={rows.length === 0}
              >
                Start
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
        <Stack spacing={0.8}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Typography variant="body2" fontWeight={600}>
              Active requests
            </Typography>
            <Chip size="small" label={rows.length} />
          </Stack>
          {rows.length === 0 ? (
            <Alert severity="info" variant="outlined">
              Create a WebSocket request, then configure its Mock tab.
            </Alert>
          ) : (
            <Stack spacing={0.65}>
              {rows.map((row) => {
                const duplicatePath = (pathCounts[row.path || "/"] ?? 0) > 1;
                return (
                  <Box
                    key={`ws-active-row-${row.scenarioId}`}
                    sx={{
                      p: 0.35,
                      borderRadius: 1,
                      bgcolor: activeScenarioId === row.scenarioId ? "action.selected" : "transparent",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <Stack spacing={0.45}>
                      <Stack direction="row" spacing={0.55} alignItems="center" sx={{ minWidth: 0 }}>
                        <Switch
                          checked={row.enabled}
                          onChange={(event: { target: { checked: boolean } }) =>
                            onScenarioChange(row.scenarioId, { enabled: event.target.checked })
                          }
                          aria-label={row.enabled ? "Disable mock request" : "Enable mock request"}
                          title={row.enabled ? "On" : "Off"}
                        />
                        <Typography
                          variant="caption"
                          fontWeight={600}
                          noWrap
                          title={row.requestName || row.name}
                          sx={{ minWidth: 0, flex: 1 }}
                        >
                          {row.requestName || row.name}
                        </Typography>
                        <Tooltip title="Edit scenario">
                          <IconButton
                            size="small"
                            aria-label="Edit scenario"
                            onClick={() => onOpenScenario(row.requestId, row.scenarioId)}
                            sx={{ flexShrink: 0 }}
                          >
                            <Edit sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                      <Stack direction="row" spacing={0.55} alignItems="end" flexWrap="wrap" useFlexGap>
                        <TextField
                          size="small"
                          label="Path"
                          value={row.path}
                          onChange={(event: TextInputChangeEvent) =>
                            onScenarioChange(row.scenarioId, { path: event.target.value })
                          }
                          disabled={status.running}
                          error={duplicatePath}
                          title={duplicatePath ? "Duplicate path" : row.path}
                          sx={{ width: 132 }}
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Interval"
                          value={String(row.intervalMs ?? 1000)}
                          onChange={(event: TextInputChangeEvent) =>
                            onScenarioChange(row.scenarioId, {
                              intervalMs: Math.max(1, Math.floor(Number(event.target.value) || 1000)),
                            })
                          }
                          sx={{ width: 78 }}
                        />
                        <FormControl size="small" sx={{ width: 70 }}>
                          <Select
                            value={row.loop ? "yes" : "no"}
                            onChange={(event: SelectInputChangeEvent) =>
                              onScenarioChange(row.scenarioId, { loop: event.target.value === "yes" })
                            }
                          >
                            <MenuItem value="no">No</MenuItem>
                            <MenuItem value="yes">Loop</MenuItem>
                          </Select>
                        </FormControl>
                        <TextField
                          size="small"
                          type="number"
                          label="Max"
                          value={String(row.maxLoops ?? 0)}
                          onChange={(event: TextInputChangeEvent) =>
                            onScenarioChange(row.scenarioId, {
                              maxLoops: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                            })
                          }
                          sx={{ width: 64 }}
                        />
                      </Stack>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

export function renderWebSocketDocsMarkdown({
  collectionRequest,
  url,
  message,
  examples,
  latestResult,
}: {
  collectionRequest: (ApiCollectionRequest & { collectionName?: string }) | null;
  url: string;
  message: string;
  examples: SavedExample[];
  latestResult: GrpcResult | null;
}) {
  const title = collectionRequest
    ? `${collectionRequest.collectionName ?? "Collection"}/${collectionRequest.name}`
    : "WebSocket Request";
  const requestUrl = url || collectionRequest?.url || "ws://localhost:8080";
  const latestMessage = latestResult?.messages?.at(-1) ?? latestResult?.messages?.[0] ?? null;
  const lines = [
    `# ${title}`,
    "",
    "## Request",
    `- URL: ${requestUrl}`,
    "- Transport: WebSocket",
    collectionRequest ? `- Request name: ${collectionRequest.name}` : "",
    collectionRequest?.collectionName ? `- Collection: ${collectionRequest.collectionName}` : "",
    "",
    "### Message body",
    "```json",
    message || collectionRequest?.body || "",
    "```",
    "",
    "## Latest response",
    latestResult
      ? `- Status: ${latestResult.trailers?.["grpc-status"] ?? latestResult.httpStatus ?? "ok"}`
      : "- Status: not saved",
    latestResult ? `- Messages: ${latestResult.totalMessages ?? latestResult.messages?.length ?? 0}` : "",
    latestResult ? `- Duration: ${latestResult.durationMs ?? 0} ms` : "",
    "",
    latestMessage
      ? ["```json", JSON.stringify(latestMessage, null, 2), "```"].join("\n")
      : "No response snapshot saved yet. Connect the request and publish again to include the latest response.",
    "",
    "## Examples",
    examples.length
      ? examples
          .map((example, index) =>
            [
              `### ${index + 1}. ${example.name}`,
              "",
              "Request:",
              "",
              "```json",
              example.requestJson?.trim() || "{}",
              "```",
              "",
            ].join("\n"),
          )
          .join("\n")
      : "No saved examples yet.",
    "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function WebSocketDocsPanel({
  collectionRequest,
  url,
  message,
  examples,
  latestResult,
  doc,
  onPreview,
  onExport,
  onPublish,
  onUnpublish,
}: {
  collectionRequest: (ApiCollectionRequest & { collectionName?: string }) | null;
  url: string;
  message: string;
  examples: SavedExample[];
  latestResult: GrpcResult | null;
  doc: MethodDoc | null;
  onPreview: () => void;
  onExport: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const markdown = renderWebSocketDocsMarkdown({ collectionRequest, url, message, examples, latestResult });
  return (
    <Stack spacing={1.2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap title={collectionRequest?.name ?? "WebSocket docs"}>
            WebSocket docs
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap title={url}>
            {url || collectionRequest?.url || "ws://localhost:8080"}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
          <Button size="small" variant="outlined" onClick={onPreview} disabled={!collectionRequest}>
            Preview
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Download />}
            onClick={onExport}
            disabled={!collectionRequest}
          >
            Export markdown
          </Button>
          {doc?.published ? (
            <Button size="small" variant="outlined" onClick={onUnpublish}>
              Unpublish
            </Button>
          ) : null}
          <Button size="small" variant="contained" onClick={onPublish} disabled={!collectionRequest}>
            {doc?.published ? "Update" : "Publish"}
          </Button>
        </Stack>
      </Stack>
      <Alert severity="warning" variant="outlined">
        Publish when the request is ready.
      </Alert>
      <FeatureMarkdownPreview markdown={markdown} />
    </Stack>
  );
}

export function WebSocketMockPanel({
  request,
  mockResponseText,
  onMockResponseTextChange,
  status,
  port,
  pathValue,
  intervalMs,
  loop,
  maxLoops,
  streamOnConnect,
  scenarios,
  activeScenario,
  requestPaths: _requestPaths,
  onPortChange: _onPortChange,
  onPathChange,
  onIntervalMsChange,
  onLoopChange,
  onMaxLoopsChange,
  onStreamOnConnectChange: _onStreamOnConnectChange,
  onScenarioSelect,
  onScenarioChange,
  onAddScenario,
  onStart,
  onStop,
  onSendOnce,
  onCopy,
}: {
  request: (ApiCollectionRequest & { collectionName?: string }) | null;
  mockResponseText: string;
  onMockResponseTextChange: (value: string) => void;
  status: WebSocketMockStatus;
  port: number;
  pathValue: string;
  intervalMs: number;
  loop: boolean;
  maxLoops: number;
  streamOnConnect: boolean;
  scenarios: WebSocketMockScenario[];
  activeScenario: WebSocketMockScenario | null;
  requestPaths?: WebSocketRequestPathRow[];
  onPortChange: (value: number) => void;
  onPathChange: (value: string) => void;
  onIntervalMsChange: (value: number) => void;
  onLoopChange: (value: boolean) => void;
  onMaxLoopsChange: (value: number) => void;
  onStreamOnConnectChange: (value: boolean) => void;
  onScenarioSelect: (scenarioId: string) => void;
  onScenarioChange: (patch: Partial<WebSocketMockScenario>) => void;
  onAddScenario: () => void;
  onStart: () => void;
  onStop: () => void;
  onSendOnce: () => void;
  onCopy: () => void;
}) {
  return (
    <Stack spacing={1.2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap" useFlexGap>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap title={request?.name ?? "WebSocket mock"}>
            WebSocket mock{request ? ` · ${request.name}` : ""}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap title={status.url ?? request?.url ?? ""}>
            Configure this request mock here. Use the sidebar for server control.
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" justifyContent="flex-end" useFlexGap>
          <Chip
            size="small"
            label={status.running ? `${status.clientCount ?? 0} client` : request ? `Port ${port}` : "No request"}
            color={status.running ? "success" : request ? "primary" : "default"}
          />
          {status.running ? (
            <Button size="small" variant="outlined" color="warning" startIcon={<StopCircle />} onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={onStart} disabled={!request}>
              Start
            </Button>
          )}
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 2 }}>
        <Stack spacing={1.1}>
          <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <Select
                value={activeScenario?.id ?? ""}
                onChange={(event: SelectInputChangeEvent) => onScenarioSelect(String(event.target.value))}
              >
                {scenarios.map((scenario) => (
                  <MenuItem key={`ws-panel-scenario-${scenario.id}`} value={scenario.id}>
                    {scenario.name || scenario.path}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button size="small" variant="outlined" onClick={onAddScenario} disabled={!request}>
              Add scenario
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PlayArrow />}
              onClick={onSendOnce}
              disabled={!status.running || !activeScenario}
            >
              Send one
            </Button>
            <Button size="small" variant="outlined" startIcon={<ContentCopy />} onClick={onCopy} disabled={!request}>
              Copy body
            </Button>
          </Stack>

          {request && activeScenario ? (
            <>
              <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField
                  size="small"
                  label="Scenario name"
                  value={activeScenario.name ?? ""}
                  onChange={(event: TextInputChangeEvent) => onScenarioChange({ name: event.target.value })}
                  sx={{ minWidth: 220, flex: 1 }}
                />
                <FormControl size="small" sx={{ width: 132 }}>
                  <Select
                    value={activeScenario.enabled === false ? "disabled" : "enabled"}
                    onChange={(event: SelectInputChangeEvent) =>
                      onScenarioChange({ enabled: event.target.value === "enabled" })
                    }
                  >
                    <MenuItem value="enabled">Enabled</MenuItem>
                    <MenuItem value="disabled">Disabled</MenuItem>
                  </Select>
                </FormControl>
              </Stack>

              <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}>
                <Stack spacing={0.9}>
                  <Typography variant="body2" fontWeight={560}>
                    Scenario settings
                  </Typography>
                  <Stack direction="row" spacing={0.8} alignItems="end" flexWrap="wrap" useFlexGap>
                    <TextField
                      size="small"
                      label="Path"
                      value={pathValue}
                      onChange={(event: TextInputChangeEvent) => onPathChange(event.target.value)}
                      disabled={status.running}
                      sx={{ minWidth: 180, maxWidth: 240 }}
                    />
                    <FormControl size="small" sx={{ width: 160 }}>
                      <Select
                        value={streamOnConnect ? "periodic" : activeScenario.sendOnMessage ? "incoming" : "manual"}
                        onChange={(event: SelectInputChangeEvent) => {
                          const value = event.target.value;
                          onScenarioChange({
                            streamOnConnect: value === "periodic",
                            sendOnMessage: value === "incoming",
                          });
                        }}
                      >
                        <MenuItem value="manual">Send one only</MenuItem>
                        <MenuItem value="periodic">Periodic</MenuItem>
                        <MenuItem value="incoming">On incoming match</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      size="small"
                      type="number"
                      label="Interval"
                      value={String(intervalMs)}
                      onChange={(event: TextInputChangeEvent) =>
                        onIntervalMsChange(Math.max(1, Math.floor(Number(event.target.value) || 1000)))
                      }
                      sx={{ width: 104 }}
                    />
                    <FormControl size="small" sx={{ width: 104 }}>
                      <Select
                        value={loop ? "yes" : "no"}
                        onChange={(event: SelectInputChangeEvent) => onLoopChange(event.target.value === "yes")}
                      >
                        <MenuItem value="no">No loop</MenuItem>
                        <MenuItem value="yes">Loop</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      size="small"
                      type="number"
                      label="Max"
                      value={String(maxLoops)}
                      onChange={(event: TextInputChangeEvent) =>
                        onMaxLoopsChange(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                      }
                      sx={{ width: 90 }}
                    />
                  </Stack>
                  {activeScenario.sendOnMessage ? (
                    <Stack direction="row" spacing={0.8} alignItems="end" flexWrap="wrap" useFlexGap>
                      <FormControl size="small" sx={{ width: 150 }}>
                        <Select
                          value={activeScenario.matchMode ?? "always"}
                          onChange={(event: SelectInputChangeEvent) =>
                            onScenarioChange({ matchMode: event.target.value as WebSocketMockScenario["matchMode"] })
                          }
                        >
                          <MenuItem value="always">Always</MenuItem>
                          <MenuItem value="contains">Contains</MenuItem>
                          <MenuItem value="regex">Regex</MenuItem>
                          <MenuItem value="jsonPath">JSON path</MenuItem>
                        </Select>
                      </FormControl>
                      {activeScenario.matchMode === "jsonPath" ? (
                        <TextField
                          size="small"
                          label="JSON path"
                          value={activeScenario.matchJsonPath || "$.method"}
                          onChange={(event: TextInputChangeEvent) =>
                            onScenarioChange({ matchJsonPath: event.target.value })
                          }
                          sx={{ width: 150 }}
                        />
                      ) : null}
                      {activeScenario.matchMode === "always" ? null : (
                        <TextField
                          size="small"
                          label={activeScenario.matchMode === "regex" ? "Regex" : "Expected value"}
                          value={activeScenario.matchValue || ""}
                          onChange={(event: TextInputChangeEvent) =>
                            onScenarioChange({ matchValue: event.target.value })
                          }
                          sx={{ minWidth: 180, flex: 1 }}
                        />
                      )}
                    </Stack>
                  ) : null}
                  <Typography variant="caption" color="text.secondary">
                    Send manually, periodically after connect, or when an incoming message matches.
                  </Typography>
                </Stack>
              </Paper>

              <Stack spacing={0.6}>
                <Typography variant="body2" fontWeight={560}>
                  Scenario code / mock message body
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Template variables: <code>{"{{count}}"}</code>, <code>{"{{loopIndex}}"}</code>,{" "}
                  <code>{"{{incoming}}"}</code>, <code>{"{{incoming.method}}"}</code>, <code>{"{{path}}"}</code>,{" "}
                  <code>{"{{uuid}}"}</code>, and <code>{"{{now}}"}</code>.
                </Typography>
                <FeatureCodeTextField
                  value={mockResponseText}
                  onChange={onMockResponseTextChange}
                  minRows={9}
                  maxRows={16}
                  language="json"
                  formatAriaLabel="Prettier JSON"
                  fullscreenTitle="WebSocket mock scenario editor"
                />
              </Stack>
            </>
          ) : (
            <Alert severity="info" variant="outlined">
              Select a WebSocket request to edit its mock scenarios.
            </Alert>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

export function WebSocketBenchmarkPanel({
  request,
  iterations,
  onIterationsChange,
  running,
  results,
  lastResult,
  onRun,
  onStop,
  onExport,
}: {
  request: (ApiCollectionRequest & { collectionName?: string }) | null;
  iterations: number;
  onIterationsChange: (value: number) => void;
  running: boolean;
  results: BenchmarkResult[];
  lastResult: GrpcResult | null;
  onRun: () => void;
  onStop: () => void;
  onExport: () => void;
}) {
  const stats = calculateBenchmarkStats(results);
  return (
    <Stack spacing={1.2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap title={request?.name ?? "WebSocket benchmark"}>
            WebSocket benchmark
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap title={request?.url ?? ""}>
            Records connection and response latency.
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.6}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Download />}
            onClick={onExport}
            disabled={results.length === 0}
          >
            Export benchmark
          </Button>
          {running ? (
            <Button size="small" variant="outlined" color="warning" startIcon={<StopCircle />} onClick={onStop}>
              Stop benchmark
            </Button>
          ) : (
            <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={onRun} disabled={!request}>
              Run benchmark
            </Button>
          )}
        </Stack>
      </Stack>
      <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          label="Runs"
          type="number"
          value={iterations}
          onChange={(event: TextInputChangeEvent) => onIterationsChange(Number(event.target.value))}
          inputProps={{ min: 1, max: 1000 }}
          sx={{ width: 110 }}
        />
        <Chip
          size="small"
          label={`OK ${stats.successful.length}/${results.length || 0}`}
          color={results.length && stats.successful.length === results.length ? "success" : "default"}
        />
        <Chip
          size="small"
          label={`Err ${stats.errorRate.toFixed(1)}%`}
          color={stats.errorRate > 0 ? "error" : "default"}
          variant="outlined"
        />
        <Chip size="small" label={`Avg ${stats.average.toFixed(1)} ms`} variant="outlined" />
        <Chip size="small" label={`P95 ${stats.p95.toFixed(1)} ms`} variant="outlined" />
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Messages</TableCell>
              <TableCell>Time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {results.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>Run a WebSocket benchmark to see samples.</TableCell>
              </TableRow>
            ) : (
              results.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.index}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={item.status}
                      color={item.ok ? "success" : "error"}
                      variant={item.ok ? "filled" : "outlined"}
                    />
                  </TableCell>
                  <TableCell>{item.durationMs.toFixed(1)} ms</TableCell>
                  <TableCell>{item.messageCount}</TableCell>
                  <TableCell>{formatTimestampShort(item.timestamp)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Stack spacing={0.8}>
        <Typography variant="body2" fontWeight={560}>
          Latest response snapshot
        </Typography>
        <FeatureJsonBlock value={lastResult ?? { message: "Connect a WebSocket request to capture a response." }} />
      </Stack>
    </Stack>
  );
}
