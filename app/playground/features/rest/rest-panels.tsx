import type { ChangeEvent } from "react";
import { Add, Delete, Download, PlayArrow, StopCircle } from "@/components/shadcn/icons";
import {
  Alert,
  Box,
  Button,
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
import { MockExecutionControls } from "../mock-server/workspace/MockExecutionControls";
import { MockScenarioSplitPane } from "../mock-server/workspace/MockScenarioSplitPane";
import { uiCopy } from "../../shared/ui-copy";
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
              <TableCell width={56}>Actions</TableCell>
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
                      inputProps={{ "aria-label": `${title} key ${index + 1}` }}
                      onChange={(event: TextInputChangeEvent) => onUpdate(index, "key", event.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={item.value}
                      inputProps={{ "aria-label": `${title} value ${index + 1}` }}
                      onChange={(event: TextInputChangeEvent) => onUpdate(index, "value", event.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Remove ${title} row ${index + 1}`}
                      onClick={() => onRemove(index)}
                    >
                      <Delete sx={{ fontSize: 16 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant="caption" color="text.secondary">
                    No entries.
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
  request: _request,
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
  onSendPending,
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
  onSendPending?: () => void;
}) {
  const settings = (
    <Stack spacing={0.8} sx={{ p: 1 }}>
      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minWidth: 0, overflowX: "auto", "& > *": { flexShrink: 0 } }}>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ mr: 0.5 }}>
          {status.url ?? `http://${project.bindHost}:${project.port}`} · {scenarios.length} scenario{scenarios.length === 1 ? "" : "s"}
          {status.pendingCount ? ` · ${status.pendingCount} pending` : ""}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 8 }} />
        <Button size="small" variant="contained" startIcon={<PlayArrow />} disabled={status.running} onClick={onStart}>Start</Button>
        <Button size="small" variant="outlined" color="error" startIcon={<StopCircle />} disabled={!status.running} onClick={onStop}>Stop</Button>
      </Stack>

      {activeScenario ? (
        <>
          <Stack direction="row" spacing={0.65} alignItems="center" sx={{ minWidth: 0, overflowX: "auto", "& > *": { flexShrink: 0 } }}>
            <Typography variant="caption" color="text.secondary">Scenario</Typography>
            <FormControl size="small" sx={{ width: 240 }}>
              <Select value={activeScenario.id} inputProps={{ "aria-label": uiCopy.sections.scenario }} onChange={(event: SelectInputChangeEvent) => onScenarioSelect(String(event.target.value))}>
                {scenarios.map((scenario) => <MenuItem key={`rest-scenario-${scenario.id}`} value={scenario.id}>{scenario.name || scenario.id}</MenuItem>)}
              </Select>
            </FormControl>
            <Button size="small" variant="outlined" onClick={() => onAddScenario("success")}>Add</Button>
            <Button size="small" variant="text" onClick={() => onAddScenario("not-found")}>404</Button>
            <Button size="small" variant="text" onClick={() => onAddScenario("validation-error")}>422</Button>
            <Button size="small" variant="text" onClick={() => onAddScenario("delayed")}>Delay</Button>
            <MockExecutionControls execution={activeScenario.execution} showTimeout compact inline hideLabel onChange={(execution) => onScenarioChange({ execution })} />
            {activeScenario.execution?.manual ? (
              <Button size="small" variant="contained" onClick={onSendPending} disabled={!status.running || !status.pendingCount}>
                Release ({status.pendingCount ?? 0})
              </Button>
            ) : null}
            <Box sx={{ flex: 1, minWidth: 8 }} />
            <FormControl size="small" sx={{ width: 112 }}>
              <Select value={activeScenario.enabled ? "enabled" : "disabled"} onChange={(event: SelectInputChangeEvent) => onScenarioChange({ enabled: event.target.value === "enabled" })}>
                <MenuItem value="enabled">Enabled</MenuItem>
                <MenuItem value="disabled">Disabled</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <Stack direction="row" spacing={0.65} alignItems="center" sx={{ minWidth: 0, overflowX: "auto", "& > *": { flexShrink: 0 } }}>
            <TextField size="small" label="Name" value={activeScenario.name} onChange={(event: TextInputChangeEvent) => onScenarioChange({ name: event.target.value })} sx={{ width: 220 }} />
            <TextField size="small" label={uiCopy.fields.host} value={project.bindHost} onChange={(event: TextInputChangeEvent) => onBindHostChange(event.target.value)} sx={{ width: 150 }} />
            <TextField size="small" label={uiCopy.fields.port} type="number" value={project.port} onChange={(event: TextInputChangeEvent) => onPortChange(Number(event.target.value))} sx={{ width: 100 }} />
            <TextField size="small" label={uiCopy.fields.path} value={activeScenario.path} onChange={(event: TextInputChangeEvent) => onScenarioChange({ path: event.target.value })} sx={{ width: 220 }} />
            <TextField size="small" type="number" label="Status" value={activeScenario.status} onChange={(event: TextInputChangeEvent) => onScenarioChange({ status: Number(event.target.value) })} sx={{ width: 92 }} />
            <TextField size="small" type="number" label="Priority" value={activeScenario.priority ?? 0} onChange={(event: TextInputChangeEvent) => onScenarioChange({ priority: Number(event.target.value) })} sx={{ width: 96 }} />
            <TextField size="small" type="number" label={uiCopy.fields.delayMs} value={activeScenario.delayMs ?? 0} onChange={(event: TextInputChangeEvent) => onScenarioChange({ delayMs: Number(event.target.value) })} sx={{ width: 96 }} />
          </Stack>

          <Paper variant="outlined" sx={{ p: 0.8, borderRadius: 1.5 }}>
            <Stack spacing={0.7}>
              <Typography variant="caption" fontWeight={700}>{uiCopy.sections.matchers}</Typography>
              <RestPairEditor title="Query" rows={activeScenario.matchQuery ?? []} onAdd={() => onScenarioPairAdd("matchQuery")} onUpdate={(index, field, value) => onScenarioPairUpdate("matchQuery", index, field, value)} onRemove={(index) => onScenarioPairRemove("matchQuery", index)} />
              <RestPairEditor title="Headers" rows={activeScenario.matchHeaders ?? []} onAdd={() => onScenarioPairAdd("matchHeaders")} onUpdate={(index, field, value) => onScenarioPairUpdate("matchHeaders", index, field, value)} onRemove={(index) => onScenarioPairRemove("matchHeaders", index)} />
              <Stack direction="row" spacing={0.65} alignItems="center" sx={{ minWidth: 0, overflowX: "auto", "& > *": { flexShrink: 0 } }}>
                <TextField size="small" label="Body contains" value={activeScenario.matchBodyContains ?? ""} onChange={(event: TextInputChangeEvent) => onScenarioChange({ matchBodyContains: event.target.value })} sx={{ width: 220 }} />
                <TextField size="small" label="JSON path" value={activeScenario.matchJsonPath ?? ""} onChange={(event: TextInputChangeEvent) => onScenarioChange({ matchJsonPath: event.target.value })} placeholder="$.data.id" sx={{ width: 180 }} />
                <TextField size="small" label="JSON equals" value={activeScenario.matchJsonEquals ?? ""} onChange={(event: TextInputChangeEvent) => onScenarioChange({ matchJsonEquals: event.target.value })} placeholder="123 or true" sx={{ width: 180 }} />
              </Stack>
            </Stack>
          </Paper>
        </>
      ) : (
        <Alert severity="info" variant="outlined">Add a global REST scenario to start mocking.</Alert>
      )}
    </Stack>
  );

  const editor = activeScenario ? (
    <Stack spacing={0.45} sx={{ minHeight: 0, height: "100%", px: 1, pb: 0.8 }}>
      <Stack direction="row" alignItems="center" sx={{ minHeight: 32, flexShrink: 0 }}>
        <Typography variant="caption" fontWeight={700}>{uiCopy.sections.response}</Typography>
      </Stack>
      <Box sx={{ minHeight: 0, flex: 1 }}>
        <FeatureCodeTextField
          value={mockResponseText}
          onChange={onMockResponseTextChange}
          minRows={8}
          fullHeight
          language="json"
          formatAriaLabel="Prettier JSON"
          fullscreenTitle="REST mock response editor"
        />
      </Box>
    </Stack>
  ) : (
    <Box sx={{ height: "100%", display: "grid", placeItems: "center", color: "text.secondary" }}>
      <Typography variant="body2">No scenario selected.</Typography>
    </Box>
  );

  return (
    <MockScenarioSplitPane
      storageKey={`layang:rest-mock-settings-height:${activeScenario?.id ?? "default"}`}
      defaultSettingsHeight={250}
      minSettingsHeight={96}
      maxSettingsHeight={380}
      settings={settings}
      editor={editor}
    />
  );
}
