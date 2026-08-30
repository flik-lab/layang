"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Add, ContentCopy, Delete, Edit, PlayArrow } from "@/components/shadcn/icons";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@/components/shadcn/compat";
import type { RpcMethodInfo } from "@/lib/types";
import { EmptyState } from "../../shared/components/empty-state";
import { formatTimestampShort } from "../../shared/formatters";
import { buttonSx, compactCardSx, iconButtonSx } from "../../shared/workbench-constants";
import type { SavedExample } from "../../shared/workbench-types";
import { WorkbenchTabs } from "@/components/ui/workbench";

export type ExampleEditorTab = "general" | "request" | "response" | "documentation";

type ExamplePair = { key: string; value: string };

export function ExamplesPanel({
  examples,
  selectedMethod,
  canSave,
  onSave,
  onImport,
  onExport,
  onLoad,
  onRun,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  examples: SavedExample[];
  selectedMethod: RpcMethodInfo | null;
  canSave: boolean;
  onSave: () => void;
  onImport: () => void;
  onExport: () => void;
  onLoad: (example: SavedExample) => void;
  onRun: (example: SavedExample) => void;
  onEdit: (example: SavedExample, tab?: ExampleEditorTab) => void;
  onDuplicate: (example: SavedExample) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Stack spacing={1}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography variant="subtitle1">{selectedMethod ? "Method examples" : "Request examples"}</Typography>
        <Stack direction="row" spacing={0.6}>
          <Button size="small" variant="outlined" onClick={onImport} sx={buttonSx}>
            Load example
          </Button>
          <Button size="small" variant="outlined" onClick={onExport} disabled={examples.length === 0} sx={buttonSx}>
            Export
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<Add />}
            disabled={!canSave}
            onClick={onSave}
            sx={buttonSx}
          >
            Save current
          </Button>
        </Stack>
      </Stack>
      {examples.length === 0 ? (
        <EmptyState
          title="No saved examples"
          body={
            selectedMethod
              ? "Save a request from this menu, or load an example JSON for the matching method."
              : "Save the current request or load an example JSON."
          }
        />
      ) : (
        <Stack spacing={0.8}>
          {examples.map((example) => {
            const summary = example.documentation?.summary?.trim();
            return (
              <Paper
                key={example.id}
                variant="outlined"
                sx={{ ...compactCardSx, opacity: example.enabled === false ? 0.72 : 1 }}
              >
                <Stack spacing={0.8}>
                  <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={0.55} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="body2" fontWeight={600} noWrap title={example.name}>
                          {example.name}
                        </Typography>
                        {example.expectedStatus ? (
                          <Chip size="small" label={example.expectedStatus} variant="outlined" />
                        ) : null}
                        {example.enabled === false ? (
                          <Chip size="small" label="Hidden from docs" color="warning" variant="outlined" />
                        ) : null}
                      </Stack>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        title={`${example.serviceName}/${example.methodName}`}
                      >
                        {example.serviceName}/{example.methodName} ·{" "}
                        {formatTimestampShort(example.updatedAt ?? example.createdAt)}
                      </Typography>
                      {summary ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45 }}>
                          {summary}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.45 }}>
                          Add a short explanation so external readers understand this example.
                        </Typography>
                      )}
                      {example.tags?.length ? (
                        <Stack direction="row" spacing={0.4} sx={{ mt: 0.6 }} flexWrap="wrap" useFlexGap>
                          {example.tags.map((tag) => (
                            <Chip key={tag} size="small" label={tag} variant="outlined" />
                          ))}
                        </Stack>
                      ) : null}
                    </Box>
                    <Stack
                      direction="row"
                      spacing={0.45}
                      alignItems="center"
                      justifyContent="flex-end"
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ flexShrink: 0 }}
                    >
                      <Button size="small" variant="text" onClick={() => onEdit(example, "documentation")}>
                        Edit description
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Edit />}
                        onClick={() => onEdit(example, "general")}
                        sx={buttonSx}
                      >
                        Edit data
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopy />}
                        onClick={() => onDuplicate(example)}
                        sx={buttonSx}
                      >
                        Duplicate
                      </Button>
                      <Button size="small" variant="outlined" onClick={() => onLoad(example)} sx={buttonSx}>
                        Load
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<PlayArrow />}
                        onClick={() => onRun(example)}
                        sx={buttonSx}
                      >
                        Run
                      </Button>
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`Delete ${example.name}`}
                        onClick={() => onDelete(example.id)}
                        sx={iconButtonSx}
                      >
                        <Delete sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Stack>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

export function ExampleEditorDialog({
  open,
  example,
  initialTab = "general",
  onClose,
  onSave,
  onDuplicate,
}: {
  open: boolean;
  example: SavedExample | null;
  initialTab?: ExampleEditorTab;
  onClose: () => void;
  onSave: (example: SavedExample) => void;
  onDuplicate?: (example: SavedExample) => void;
}) {
  const [tab, setTab] = useState<ExampleEditorTab>(initialTab);
  const [draft, setDraft] = useState<SavedExample | null>(example ? normalizeExample(example) : null);
  const [notesText, setNotesText] = useState(example?.documentation?.notes?.join("\n") ?? "");
  const [tagsText, setTagsText] = useState(example?.tags?.join(", ") ?? "");

  useEffect(() => {
    if (!open || !example) return;
    const normalized = normalizeExample(example);
    setDraft(normalized);
    setNotesText(normalized.documentation?.notes.join("\n") ?? "");
    setTagsText(normalized.tags?.join(", ") ?? "");
    setTab(initialTab);
  }, [open, example?.id, example?.updatedAt, initialTab]);

  const requestJsonError = useMemo(() => jsonError(draft?.requestJson ?? "{}"), [draft?.requestJson]);
  const responseJsonError = useMemo(() => jsonError(draft?.expectedJson ?? "{}"), [draft?.expectedJson]);
  const assertionsError = useMemo(
    () => (draft?.assertions?.trim() ? jsonError(draft.assertions) : ""),
    [draft?.assertions],
  );
  const invalid = !draft?.name.trim() || Boolean(requestJsonError || responseJsonError || assertionsError);

  if (!draft) return null;

  const updateDocumentation = (field: "summary" | "whenThisHappens" | "explanation", value: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            documentation: { ...normalizeDocumentation(current.documentation), [field]: value },
          }
        : current,
    );
  };
  const save = () => {
    if (invalid) return;
    onSave({
      ...draft,
      tags: parseCsv(tagsText),
      documentation: { ...normalizeDocumentation(draft.documentation), notes: parseLines(notesText) },
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Edit example</DialogTitle>
      <DialogContent>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 360px" },
            gap: 1.3,
            pt: 0.4,
          }}
        >
          <Stack spacing={1} sx={{ minWidth: 0 }}>
            <WorkbenchTabs<ExampleEditorTab>
              value={tab}
              onValueChange={setTab}
              idPrefix="example-editor"
              ariaLabel="Example editor sections"
              variant="underline"
              items={[
                { value: "general", label: "General" },
                { value: "request", label: "Request" },
                { value: "response", label: "Response" },
                { value: "documentation", label: "Documentation" },
              ]}
            />

            {tab === "general" ? (
              <Stack
                role="tabpanel"
                id="example-editor-panel-general"
                aria-labelledby="example-editor-tab-general"
                tabIndex={0}
                spacing={1}
              >
                <TextField
                  size="small"
                  label="Example name"
                  value={draft.name}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, name: event.target.value })}
                  required
                  error={!draft.name.trim()}
                  helperText={
                    !draft.name.trim() ? "Example name is required." : "Shown in generated docs, tests, and exports."
                  }
                />
                <TextField
                  size="small"
                  label="Tags"
                  value={tagsText}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setTagsText(event.target.value)}
                  placeholder="success, selected-track, realtime"
                  helperText="Comma-separated labels used by readers and future filters."
                />
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, px: 1, py: 0.75 }}
                >
                  <Box>
                    <Typography variant="body2">Include in generated documentation</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Disabled examples remain executable locally but are hidden from public docs.
                    </Typography>
                  </Box>
                  <Switch
                    checked={draft.enabled !== false}
                    inputProps={{ "aria-label": "Include example in generated documentation" }}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setDraft({ ...draft, enabled: event.target.checked })
                    }
                  />
                </Stack>
                <Stack direction={{ xs: "column", md: "row" }} spacing={0.8}>
                  <TextField size="small" fullWidth label="Service / collection" value={draft.serviceName} disabled />
                  <TextField size="small" fullWidth label="Method / request" value={draft.methodName} disabled />
                </Stack>
              </Stack>
            ) : null}

            {tab === "request" ? (
              <Stack
                role="tabpanel"
                id="example-editor-panel-request"
                aria-labelledby="example-editor-tab-request"
                tabIndex={0}
                spacing={1}
              >
                <PairEditor
                  label="Request metadata"
                  pairs={draft.metadata}
                  onChange={(metadata) => setDraft({ ...draft, metadata })}
                />
                <TextField
                  multiline
                  minRows={14}
                  label="Request JSON"
                  value={draft.requestJson}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setDraft({ ...draft, requestJson: event.target.value })
                  }
                  error={Boolean(requestJsonError)}
                  helperText={requestJsonError || "This is the executable request used by Load and Run."}
                  inputProps={{ style: codeInputStyle }}
                />
              </Stack>
            ) : null}

            {tab === "response" ? (
              <Stack
                role="tabpanel"
                id="example-editor-panel-response"
                aria-labelledby="example-editor-tab-response"
                tabIndex={0}
                spacing={1}
              >
                <TextField
                  size="small"
                  label="Expected status"
                  value={draft.expectedStatus ?? ""}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setDraft({ ...draft, expectedStatus: event.target.value })
                  }
                  placeholder="OK, NOT_FOUND, 200, 404"
                  helperText="Use a gRPC status name or an HTTP status code."
                />
                <PairEditor
                  label="Expected trailers / response metadata"
                  pairs={draft.expectedTrailers ?? []}
                  onChange={(expectedTrailers) => setDraft({ ...draft, expectedTrailers })}
                />
                <TextField
                  multiline
                  minRows={10}
                  label="Expected response JSON"
                  value={draft.expectedJson}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setDraft({ ...draft, expectedJson: event.target.value })
                  }
                  error={Boolean(responseJsonError)}
                  helperText={
                    responseJsonError ||
                    "The expected payload displayed in docs and used by existing example assertions."
                  }
                  inputProps={{ style: codeInputStyle }}
                />
                <TextField
                  multiline
                  minRows={5}
                  label="Additional assertions JSON"
                  value={draft.assertions ?? ""}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setDraft({ ...draft, assertions: event.target.value })
                  }
                  error={Boolean(assertionsError)}
                  helperText={
                    assertionsError || "Optional structured assertions, such as JSONPath checks or field expectations."
                  }
                  placeholder={'{"grpcStatus":"0","minMessages":1,"maxLatencyMs":3000}'}
                  inputProps={{ style: codeInputStyle }}
                />
              </Stack>
            ) : null}

            {tab === "documentation" ? (
              <Stack
                role="tabpanel"
                id="example-editor-panel-documentation"
                aria-labelledby="example-editor-tab-documentation"
                tabIndex={0}
                spacing={1}
              >
                <Alert severity="info" variant="outlined">
                  These fields add reader-friendly context. Request and response data stay executable and are not
                  duplicated only for display.
                </Alert>
                <TextField
                  size="small"
                  label="Summary"
                  value={draft.documentation?.summary ?? ""}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updateDocumentation("summary", event.target.value)
                  }
                  placeholder="Track is found and the server starts streaming full state updates."
                />
                <TextField
                  multiline
                  minRows={3}
                  label="When this happens"
                  value={draft.documentation?.whenThisHappens ?? ""}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    updateDocumentation("whenThisHappens", event.target.value)
                  }
                  placeholder="Use this example after an operator selects an active tactical track."
                />
                <TextField
                  multiline
                  minRows={5}
                  label="Explanation"
                  value={draft.documentation?.explanation ?? ""}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    updateDocumentation("explanation", event.target.value)
                  }
                  placeholder="Explain what the important fields mean and what the reader should observe."
                />
                <TextField
                  multiline
                  minRows={5}
                  label="Important notes"
                  value={notesText}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setNotesText(event.target.value)
                  }
                  placeholder={
                    "One note per line\nDo not retry INVALID_ARGUMENT\nCancel the stream when selection changes"
                  }
                  helperText="One note per line. Notes become a readable list in Markdown and wiki exports."
                />
              </Stack>
            ) : null}
          </Stack>

          <ExampleLivePreview
            example={{
              ...draft,
              tags: parseCsv(tagsText),
              documentation: { ...normalizeDocumentation(draft.documentation), notes: parseLines(notesText) },
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        {onDuplicate ? (
          <Button
            onClick={() =>
              onDuplicate({
                ...draft,
                tags: parseCsv(tagsText),
                documentation: { ...normalizeDocumentation(draft.documentation), notes: parseLines(notesText) },
              })
            }
          >
            Duplicate
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={invalid}>
          Save example
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PairEditor({
  label,
  pairs,
  onChange,
}: {
  label: string;
  pairs: ExamplePair[];
  onChange: (pairs: ExamplePair[]) => void;
}) {
  return (
    <Stack spacing={0.6}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        <Button
          size="small"
          variant="text"
          startIcon={<Add />}
          onClick={() => onChange([...pairs, { key: "", value: "" }])}
        >
          Add row
        </Button>
      </Stack>
      {pairs.length ? (
        pairs.map((pair, index) => {
          const pairKey = `${pair.key || "row"}-${pair.value}`;
          return (
            <Stack key={pairKey} direction="row" spacing={0.6} alignItems="center">
              <TextField
                size="small"
                label="Name"
                value={pair.key}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  onChange(
                    pairs.map((item, itemIndex) => (itemIndex === index ? { ...item, key: event.target.value } : item)),
                  )
                }
                sx={{ flex: "0 0 38%" }}
              />
              <TextField
                size="small"
                label="Value"
                value={pair.value}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  onChange(
                    pairs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, value: event.target.value } : item,
                    ),
                  )
                }
                sx={{ flex: 1 }}
              />
              <IconButton
                size="small"
                aria-label={`Remove ${pair.key || "row"}`}
                onClick={() => onChange(pairs.filter((_, itemIndex) => itemIndex !== index))}
              >
                <Delete sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>
          );
        })
      ) : (
        <Typography variant="caption" color="text.secondary">
          No metadata configured.
        </Typography>
      )}
    </Stack>
  );
}

function ExampleLivePreview({ example }: { example: SavedExample }) {
  const documentation = normalizeDocumentation(example.documentation);
  const request = prettyJson(example.requestJson);
  const response = prettyJson(example.expectedJson);
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.2,
        minWidth: 0,
        position: { lg: "sticky" },
        top: { lg: 0 },
        alignSelf: "start",
        maxHeight: { lg: "68vh" },
        overflow: "auto",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        LIVE DOCUMENTATION PREVIEW
      </Typography>
      <Stack direction="row" spacing={0.45} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.45 }}>
        <Typography variant="subtitle1">{example.name || "Untitled example"}</Typography>
        {example.expectedStatus ? <Chip size="small" label={example.expectedStatus} variant="outlined" /> : null}
      </Stack>
      {example.tags?.length ? (
        <Typography variant="caption" color="text.secondary">
          {example.tags.join(" · ")}
        </Typography>
      ) : null}
      {documentation.summary ? (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {documentation.summary}
        </Typography>
      ) : null}
      {documentation.whenThisHappens ? (
        <PreviewText title="When this happens" value={documentation.whenThisHappens} />
      ) : null}
      {documentation.explanation ? <PreviewText title="Explanation" value={documentation.explanation} /> : null}
      {documentation.notes.length ? (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" fontWeight={600}>
            Important notes
          </Typography>
          <Box component="ul" sx={{ mt: 0.35, mb: 0, pl: 2.2 }}>
            {documentation.notes.map((note) => (
              <Typography component="li" variant="body2" key={note}>
                {note}
              </Typography>
            ))}
          </Box>
        </Box>
      ) : null}
      <Divider sx={{ my: 1 }} />
      <Typography variant="caption" fontWeight={600}>
        Request
      </Typography>
      <Box component="pre" sx={previewCodeSx}>
        {request}
      </Box>
      <Typography variant="caption" fontWeight={600}>
        Expected response
      </Typography>
      <Box component="pre" sx={previewCodeSx}>
        {response}
      </Box>
    </Paper>
  );
}

function PreviewText({ title, value }: { title: string; value: string }) {
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="caption" fontWeight={600}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
        {value}
      </Typography>
    </Box>
  );
}

function normalizeExample(example: SavedExample): SavedExample {
  return {
    ...example,
    enabled: example.enabled !== false,
    tags: example.tags ?? [],
    expectedStatus: example.expectedStatus ?? "",
    expectedTrailers: example.expectedTrailers?.map((item) => ({ ...item })) ?? [],
    assertions: example.assertions ?? "",
    metadata: example.metadata?.map((item) => ({ ...item })) ?? [],
    documentation: normalizeDocumentation(example.documentation),
  };
}

function normalizeDocumentation(value: SavedExample["documentation"]): NonNullable<SavedExample["documentation"]> {
  return {
    summary: value?.summary ?? "",
    whenThisHappens: value?.whenThisHappens ?? "",
    explanation: value?.explanation ?? "",
    notes: value?.notes ?? [],
  };
}

function jsonError(value: string): string {
  const text = value.trim();
  if (!text) return "JSON is required.";
  try {
    JSON.parse(text);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid JSON.";
  }
}

function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value || "{}"), null, 2);
  } catch {
    return value || "{}";
  }
}

function parseCsv(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const codeInputStyle = { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 12 };
const previewCodeSx = {
  mt: 0.35,
  mb: 1,
  p: 0.8,
  borderRadius: 1,
  bgcolor: "action.hover",
  overflow: "auto",
  fontSize: 11.5,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};
