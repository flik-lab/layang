import type { ChangeEvent } from "react";
import { Add, Delete, Download, PlayArrow } from "@/components/shadcn/icons";
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@/components/shadcn/compat";
import { MarkdownPreview as FeatureMarkdownPreview } from "../docs-publisher/docs-publisher-panel";
import { CodeTextField as FeatureCodeTextField } from "../request-editor/request-editor-panels";
import { formatTimestampShort } from "../../shared/formatters";
import type {
  ApiCollectionRequest,
  MethodDoc,
  RestMockProject,
  RestMockScenario,
  RestMockStatus,
} from "../../shared/workbench-types";
import type { GrpcResult, MetadataPair } from "@/lib/types";
import { renderRestDocsMarkdown } from "./rest-model";

type TextInputChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
type SelectInputChangeEvent = ChangeEvent<HTMLSelectElement>;

export function RestPairEditor({
  title,
  rows,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string;
  rows: MetadataPair[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof MetadataPair, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <Stack spacing={0.7}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1">{title}</Typography>
        <Button size="small" startIcon={<Add />} onClick={onAdd}>
          Add row
        </Button>
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Key</TableCell>
              <TableCell>Value</TableCell>
              <TableCell width={56}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length ? (
              rows.map((item, index) => (
                <TableRow key={`${title}-${item.key || "blank"}-${item.value || "blank"}`}>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={item.key}
                      onChange={(event: TextInputChangeEvent) => onUpdate(index, "key", event.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={item.value}
                      onChange={(event: TextInputChangeEvent) => onUpdate(index, "value", event.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" color="error" onClick={() => onRemove(index)}>
                      <Delete sx={{ fontSize: 16 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant="caption" color="text.secondary">
                    No {title.toLowerCase()} configured.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

export function RestDocsPanel({
  collectionRequest,
  url,
  latestResult,
  doc,
  onPreview,
  onExport,
  onPublish,
  onUnpublish,
}: {
  collectionRequest: (ApiCollectionRequest & { collectionName?: string }) | null;
  url: string;
  latestResult: GrpcResult | null;
  doc: MethodDoc | null;
  onPreview: () => void;
  onExport: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const markdown = collectionRequest
    ? renderRestDocsMarkdown({ collectionRequest, url, latestResult })
    : "Select a REST request to preview generated docs.";
  return (
    <Stack spacing={1.2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap title={collectionRequest?.name ?? "REST docs"}>
            REST docs
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap title={url}>
            {url || collectionRequest?.url || "https://api.example.com"}
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
      <Alert severity="info" variant="outlined">
        Generated from the saved request and latest response.
      </Alert>
      <FeatureMarkdownPreview markdown={markdown} />
    </Stack>
  );
}

export function RestMockPanel({
  request,
  scenarios,
  activeScenario,
  mockResponseText,
  status,
  project,
  onMockResponseTextChange,
  onPortChange,
  onBindHostChange,
  onScenarioSelect,
  onScenarioChange,
  onScenarioPairAdd,
  onScenarioPairUpdate,
  onScenarioPairRemove,
  onAddScenario,
  onStart,
  onStop,
}: {
  request: (ApiCollectionRequest & { collectionName?: string }) | null;
  scenarios: RestMockScenario[];
  activeScenario: RestMockScenario | null;
  mockResponseText: string;
  status: RestMockStatus;
  project: RestMockProject;
  onMockResponseTextChange: (value: string) => void;
  onPortChange: (value: number) => void;
  onBindHostChange: (value: string) => void;
  onScenarioSelect: (scenarioId: string) => void;
  onScenarioChange: (patch: Partial<RestMockScenario>) => void;
  onScenarioPairAdd: (field: "matchQuery" | "matchHeaders") => void;
  onScenarioPairUpdate: (
    field: "matchQuery" | "matchHeaders",
    index: number,
    pairField: keyof MetadataPair,
    value: string,
  ) => void;
  onScenarioPairRemove: (field: "matchQuery" | "matchHeaders", index: number) => void;
  onAddScenario: (preset: "success" | "not-found" | "validation-error" | "delayed") => void;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <Stack spacing={1.2}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
        <Box>
          <Typography variant="subtitle1">REST mock server</Typography>
          <Typography variant="caption" color="text.secondary">
            Mock saved REST requests with scenario priority, query/header/body matching, delay, and templates.
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.7} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            color={status.running ? "success" : "default"}
            label={status.running ? "Running" : "Stopped"}
          />
          {status.running ? (
            <Button size="small" variant="outlined" color="warning" onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button size="small" variant="contained" startIcon={<PlayArrow />} onClick={onStart}>
              Start
            </Button>
          )}
        </Stack>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          label="Bind IP"
          value={project.bindHost}
          onChange={(event: TextInputChangeEvent) => onBindHostChange(event.target.value)}
          sx={{ width: 180 }}
        />
        <TextField
          size="small"
          label="Port"
          type="number"
          value={project.port}
          onChange={(event: TextInputChangeEvent) => onPortChange(Number(event.target.value))}
          sx={{ width: 120 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
          {status.url ?? `http://${project.bindHost}:${project.port}`}
        </Typography>
      </Stack>
      {request && activeScenario ? (
        <Stack spacing={1.1}>
          <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <Select
                value={activeScenario.id}
                onChange={(event: SelectInputChangeEvent) => onScenarioSelect(String(event.target.value))}
              >
                {scenarios.map((scenario) => (
                  <MenuItem key={`rest-scenario-${scenario.id}`} value={scenario.id}>
                    {scenario.name || scenario.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button size="small" variant="outlined" onClick={() => onAddScenario("success")}>
              Success
            </Button>
            <Button size="small" variant="outlined" onClick={() => onAddScenario("not-found")}>
              404
            </Button>
            <Button size="small" variant="outlined" onClick={() => onAddScenario("validation-error")}>
              422
            </Button>
            <Button size="small" variant="outlined" onClick={() => onAddScenario("delayed")}>
              Delayed
            </Button>
          </Stack>
          <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              label="Scenario name"
              value={activeScenario.name}
              onChange={(event: TextInputChangeEvent) => onScenarioChange({ name: event.target.value })}
              sx={{ minWidth: 220, flex: 1 }}
            />
            <TextField
              size="small"
              label="Path"
              value={activeScenario.path}
              onChange={(event: TextInputChangeEvent) => onScenarioChange({ path: event.target.value })}
              sx={{ minWidth: 220 }}
            />
            <TextField
              size="small"
              type="number"
              label="Status"
              value={activeScenario.status}
              onChange={(event: TextInputChangeEvent) => onScenarioChange({ status: Number(event.target.value) })}
              sx={{ width: 105 }}
            />
            <TextField
              size="small"
              type="number"
              label="Priority"
              value={activeScenario.priority ?? 0}
              onChange={(event: TextInputChangeEvent) => onScenarioChange({ priority: Number(event.target.value) })}
              sx={{ width: 105 }}
            />
            <TextField
              size="small"
              type="number"
              label="Delay ms"
              value={activeScenario.delayMs ?? 0}
              onChange={(event: TextInputChangeEvent) => onScenarioChange({ delayMs: Number(event.target.value) })}
              sx={{ width: 115 }}
            />
            <FormControl size="small" sx={{ width: 120 }}>
              <Select
                value={activeScenario.enabled ? "enabled" : "disabled"}
                onChange={(event: SelectInputChangeEvent) =>
                  onScenarioChange({ enabled: event.target.value === "enabled" })
                }
              >
                <MenuItem value="enabled">Enabled</MenuItem>
                <MenuItem value="disabled">Disabled</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Paper variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle1">Matchers</Typography>
              <RestPairEditor
                title="Query must equal"
                rows={activeScenario.matchQuery ?? []}
                onAdd={() => onScenarioPairAdd("matchQuery")}
                onUpdate={(index, field, value) => onScenarioPairUpdate("matchQuery", index, field, value)}
                onRemove={(index) => onScenarioPairRemove("matchQuery", index)}
              />
              <RestPairEditor
                title="Headers must equal"
                rows={activeScenario.matchHeaders ?? []}
                onAdd={() => onScenarioPairAdd("matchHeaders")}
                onUpdate={(index, field, value) => onScenarioPairUpdate("matchHeaders", index, field, value)}
                onRemove={(index) => onScenarioPairRemove("matchHeaders", index)}
              />
              <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField
                  size="small"
                  label="Body contains"
                  value={activeScenario.matchBodyContains ?? ""}
                  onChange={(event: TextInputChangeEvent) =>
                    onScenarioChange({ matchBodyContains: event.target.value })
                  }
                  sx={{ minWidth: 220, flex: 1 }}
                />
                <TextField
                  size="small"
                  label="JSON path"
                  value={activeScenario.matchJsonPath ?? ""}
                  onChange={(event: TextInputChangeEvent) => onScenarioChange({ matchJsonPath: event.target.value })}
                  placeholder="$.data.id"
                  sx={{ width: 180 }}
                />
                <TextField
                  size="small"
                  label="JSON equals"
                  value={activeScenario.matchJsonEquals ?? ""}
                  onChange={(event: TextInputChangeEvent) => onScenarioChange({ matchJsonEquals: event.target.value })}
                  placeholder="123 or true"
                  sx={{ width: 180 }}
                />
              </Stack>
            </Stack>
          </Paper>
          <Stack spacing={0.8}>
            <Typography variant="subtitle1">Response body</Typography>
            <FeatureCodeTextField
              value={mockResponseText}
              onChange={onMockResponseTextChange}
              minRows={7}
              maxRows={12}
              language="json"
              formatAriaLabel="Prettier JSON"
              fullscreenTitle="REST mock response editor"
            />
            <Typography variant="caption" color="text.secondary">
              Templates: {"{{now}}"}, {"{{timestamp}}"}, {"{{uuid}}"}, {"{{request.path.id}}"},{" "}
              {"{{request.query.name}}"}, {"{{request.header.authorization}}"}, {"{{request.bodyJson.data.id}}"}
            </Typography>
          </Stack>
        </Stack>
      ) : (
        <Alert severity="info" variant="outlined">
          Select a REST request to edit its mock scenarios.
        </Alert>
      )}
      {status.requestLog?.length ? (
        <Paper variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
          <Typography variant="subtitle1">Recent mock requests</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell>Path</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Scenario</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {status.requestLog.slice(0, 8).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatTimestampShort(entry.timestamp)}</TableCell>
                    <TableCell>{entry.method}</TableCell>
                    <TableCell>{entry.path}</TableCell>
                    <TableCell>{entry.status}</TableCell>
                    <TableCell>{entry.scenarioId ?? "miss"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ) : null}
    </Stack>
  );
}
