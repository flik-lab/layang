import type { ChangeEvent } from "react";

import { ContentCopy, Download, PlayArrow, StopCircle } from "@/components/shadcn/icons";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
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
} from "../../shared/workbench-types";

type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SwitchInputChangeEvent = ChangeEvent<HTMLInputElement>;

export function WebSocketMockSidebar({
  request,
  mockResponseText,
  latestResult,
  status,
  port,
  pathValue,
  intervalMs,
  loop,
  maxLoops,
  streamOnConnect,
  onMockResponseTextChange,
  onPortChange,
  onPathChange,
  onIntervalMsChange,
  onLoopChange,
  onMaxLoopsChange,
  onStreamOnConnectChange,
  onStart,
  onStop,
  onSendOnce,
  onCopy,
}: {
  request: (ApiCollectionRequest & { collectionName?: string }) | null;
  mockResponseText: string;
  latestResult: GrpcResult | null;
  status: WebSocketMockStatus;
  port: number;
  pathValue: string;
  intervalMs: number;
  loop: boolean;
  maxLoops: number;
  streamOnConnect: boolean;
  onMockResponseTextChange: (value: string) => void;
  onPortChange: (value: number) => void;
  onPathChange: (value: string) => void;
  onIntervalMsChange: (value: number) => void;
  onLoopChange: (value: boolean) => void;
  onMaxLoopsChange: (value: number) => void;
  onStreamOnConnectChange: (value: boolean) => void;
  onStart: () => void;
  onStop: () => void;
  onSendOnce: () => void;
  onCopy: () => void;
}) {
  return (
    <Stack spacing={1.1}>
      <Alert severity={request ? "info" : "warning"}>
        {request
          ? "WS Mock is a real local WebSocket server/listener. It never echoes client messages; it only sends the body data manually or periodically."
          : "Select or create a WebSocket request to edit and run its mock server/listener."}
      </Alert>
      <Paper variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
        <Stack spacing={0.8}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap title={request?.name ?? "No WebSocket request"}>
                {request?.name ?? "No WebSocket request"}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap title={status.url ?? request?.url ?? ""}>
                {status.running ? status.url : (request?.url ?? "Open a WS request first")}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={status.running ? `${status.clientCount ?? 0} client` : "Stopped"}
              color={status.running ? "success" : "default"}
            />
          </Stack>
          <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              type="number"
              label="Port"
              value={String(port)}
              onChange={(event: TextInputChangeEvent) =>
                onPortChange(Math.max(1, Math.floor(Number(event.target.value) || 8090)))
              }
              disabled={status.running}
              sx={{ width: 96 }}
            />
            <TextField
              size="small"
              label="Path"
              value={pathValue}
              onChange={(event: TextInputChangeEvent) => onPathChange(event.target.value)}
              disabled={status.running}
              sx={{ width: 130 }}
            />
          </Stack>
          <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              type="number"
              label="Interval"
              value={String(intervalMs)}
              onChange={(event: TextInputChangeEvent) =>
                onIntervalMsChange(Math.max(1, Math.floor(Number(event.target.value) || 1000)))
              }
              sx={{ width: 105 }}
            />
            <TextField
              size="small"
              type="number"
              label="Max loops"
              value={String(maxLoops)}
              onChange={(event: TextInputChangeEvent) =>
                onMaxLoopsChange(Math.max(0, Math.floor(Number(event.target.value) || 0)))
              }
              helperText="0 = infinite"
              sx={{ width: 110 }}
            />
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.8} flexWrap="wrap" useFlexGap>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Switch
                checked={streamOnConnect}
                onChange={(event: SwitchInputChangeEvent) => onStreamOnConnectChange(event.target.checked)}
              />
              <Typography variant="caption">Periodic send</Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Switch checked={loop} onChange={(event: SwitchInputChangeEvent) => onLoopChange(event.target.checked)} />
              <Typography variant="caption">Loop</Typography>
            </Stack>
          </Stack>
          <FeatureCodeTextField
            value={mockResponseText}
            onChange={onMockResponseTextChange}
            minRows={7}
            maxRows={12}
            language="json"
          />
          <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
            {status.running ? (
              <Button size="small" variant="outlined" color="warning" startIcon={<StopCircle />} onClick={onStop}>
                Stop WS mock
              </Button>
            ) : (
              <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={onStart} disabled={!request}>
                Start WS mock
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              startIcon={<PlayArrow />}
              onClick={onSendOnce}
              disabled={!status.running}
            >
              Send one message
            </Button>
            <Button size="small" variant="outlined" startIcon={<ContentCopy />} onClick={onCopy} disabled={!request}>
              Copy
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.7 }}>
          Latest WebSocket response
        </Typography>
        <FeatureJsonBlock value={latestResult ?? { message: "Connect a WebSocket request to capture a response." }} />
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
        WebSocket docs are beta and may change. Publish when the request, examples, and latest response snapshot are
        ready.
      </Alert>
      <FeatureMarkdownPreview markdown={markdown} />
    </Stack>
  );
}

export function WebSocketMockPanel({
  request,
  mockResponseText,
  onMockResponseTextChange,
  latestResult,
  status,
  port,
  pathValue,
  intervalMs,
  loop,
  maxLoops,
  streamOnConnect,
  onPortChange,
  onPathChange,
  onIntervalMsChange,
  onLoopChange,
  onMaxLoopsChange,
  onStreamOnConnectChange,
  onStart,
  onStop,
  onSendOnce,
  onCopy,
}: {
  request: (ApiCollectionRequest & { collectionName?: string }) | null;
  mockResponseText: string;
  onMockResponseTextChange: (value: string) => void;
  latestResult: GrpcResult | null;
  status: WebSocketMockStatus;
  port: number;
  pathValue: string;
  intervalMs: number;
  loop: boolean;
  maxLoops: number;
  streamOnConnect: boolean;
  onPortChange: (value: number) => void;
  onPathChange: (value: string) => void;
  onIntervalMsChange: (value: number) => void;
  onLoopChange: (value: boolean) => void;
  onMaxLoopsChange: (value: number) => void;
  onStreamOnConnectChange: (value: boolean) => void;
  onStart: () => void;
  onStop: () => void;
  onSendOnce: () => void;
  onCopy: () => void;
}) {
  return (
    <Stack spacing={1.2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1">WebSocket mock server</Typography>
          <Typography variant="caption" color="text.secondary" noWrap title={status.url ?? request?.url ?? ""}>
            {status.running ? status.url : "Start a real local WS mock server, then connect the request to it."}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={status.running ? `${status.clientCount ?? 0} client` : request ? "WS" : "No request"}
          color={status.running ? "success" : request ? "primary" : "default"}
        />
      </Stack>
      <Alert severity="info">
        The mock runs as a real WebSocket server/listener in the desktop app. It does not echo client messages; it sends
        the body data one-by-one or as a periodic stream without touching gRPC stream mocks.
      </Alert>
      <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 2 }}>
        <Stack spacing={1.1}>
          <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              type="number"
              label="Port"
              value={String(port)}
              onChange={(event: TextInputChangeEvent) =>
                onPortChange(Math.max(1, Math.floor(Number(event.target.value) || 8090)))
              }
              disabled={status.running}
              sx={{ width: 110 }}
            />
            <TextField
              size="small"
              label="Path"
              value={pathValue}
              onChange={(event: TextInputChangeEvent) => onPathChange(event.target.value)}
              disabled={status.running}
              sx={{ width: 180 }}
            />
            <TextField
              size="small"
              type="number"
              label="Interval ms"
              value={String(intervalMs)}
              onChange={(event: TextInputChangeEvent) =>
                onIntervalMsChange(Math.max(1, Math.floor(Number(event.target.value) || 1000)))
              }
              sx={{ width: 130 }}
            />
            <TextField
              size="small"
              type="number"
              label="Max loops"
              value={String(maxLoops)}
              onChange={(event: TextInputChangeEvent) =>
                onMaxLoopsChange(Math.max(0, Math.floor(Number(event.target.value) || 0)))
              }
              helperText="0 = infinite"
              sx={{ width: 130 }}
            />
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1.3} flexWrap="wrap" useFlexGap>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Switch
                checked={streamOnConnect}
                onChange={(event: SwitchInputChangeEvent) => onStreamOnConnectChange(event.target.checked)}
              />
              <Typography variant="body2">Periodic send after connect</Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Switch checked={loop} onChange={(event: SwitchInputChangeEvent) => onLoopChange(event.target.checked)} />
              <Typography variant="body2">Loop stream</Typography>
            </Stack>
          </Stack>
          <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
            {status.running ? (
              <Button size="small" variant="outlined" color="warning" startIcon={<StopCircle />} onClick={onStop}>
                Stop WS mock
              </Button>
            ) : (
              <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={onStart} disabled={!request}>
                Start WS mock
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              startIcon={<PlayArrow />}
              onClick={onSendOnce}
              disabled={!status.running}
            >
              Send one message
            </Button>
            <Button size="small" variant="outlined" startIcon={<ContentCopy />} onClick={onCopy} disabled={!request}>
              Copy mock body
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <Stack spacing={0.6}>
        <Typography variant="body2" fontWeight={560}>
          Mock message body
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Use a JSON object for one message or a JSON array to send messages one-by-one. Template variables:{" "}
          <code>{"{{count}}"}</code>, <code>{"{{index}}"}</code>, and <code>{"{{now}}"}</code>.
        </Typography>
        <FeatureCodeTextField
          value={mockResponseText}
          onChange={onMockResponseTextChange}
          minRows={9}
          maxRows={16}
          language="json"
        />
      </Stack>
      <Stack spacing={0.8}>
        <Typography variant="body2" fontWeight={560}>
          Latest WebSocket response
        </Typography>
        <FeatureJsonBlock value={latestResult ?? { message: "Connect a WebSocket request to capture a response." }} />
      </Stack>
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
            Opens a connection, sends the message when provided, and records first response/close latency.
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
