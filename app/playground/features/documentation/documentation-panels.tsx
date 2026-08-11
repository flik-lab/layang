"use client";

import {
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Build,
  CheckCircle,
  ContentCopy,
  Description,
  DocsIcon,
  Folder,
  FolderOpen,
  KeyboardArrowDown,
  KeyboardArrowRight,
  MoreHoriz,
  OpenInNew,
  Search,
  Settings,
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
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@/components/shadcn/compat";
import type {
  DocumentationSource,
  DocumentationSettings,
  DocumentationStatus,
  DocsCodeSample,
  UnifiedDocsPage,
} from "@/lib/docs-core.mjs";
import {
  docsSourceKey,
  documentationEditorMarkdown,
  documentationMarkerDefinitions,
  renderDocumentationMarkdown,
} from "@/lib/docs-core.mjs";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import { SearchHighlightedText } from "../../shared/components/search-highlight";
import { uiCopy } from "../../shared/ui-copy";
import { MarkdownPreview } from "../docs-publisher/docs-publisher-panel";
import { WorkbenchTabs } from "../shell/shell-components";

export type DocumentationPanelTab = "content" | "preview";

type TechnicalMenuAnchor = HTMLElement | null;

export function UnifiedDocumentationPanel({
  page,
  source,
  settings,
  onSaveSource,
  onOpenRequest,
  onPublish,
  onEditExample,
  defaultTab = "preview",
}: {
  page: UnifiedDocsPage | null;
  source: DocumentationSource | null;
  settings: DocumentationSettings;
  onSaveSource: (source: DocumentationSource) => void;
  onOpenRequest: () => void;
  onPublish: () => void;
  onEditExample?: (id: string, tab?: "general" | "request" | "response" | "documentation") => void;
  defaultTab?: DocumentationPanelTab;
}) {
  const [tab, setTab] = useState<DocumentationPanelTab>(defaultTab);
  const [summary, setSummary] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [markerToInsert, setMarkerToInsert] = useState("");
  const [codeSampleId, setCodeSampleId] = useState("layang-cli");
  const [tagsText, setTagsText] = useState("");
  const [audienceText, setAudienceText] = useState("");
  const [relatedText, setRelatedText] = useState("");
  const [deprecated, setDeprecated] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<TechnicalMenuAnchor>(null);
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab, page?.id]);

  useEffect(() => {
    setSummary(source?.summary ?? page?.summary ?? "");
    const editorMarkdown = page ? documentationEditorMarkdown(page, source) : "";
    setMarkdown(editorMarkdown);
    setMarkerToInsert(documentationMarkerDefinitions(page?.kind, page?.protocol)[0]?.marker ?? "");
    setTagsText((source?.tags ?? page?.sourceMetadata?.tags ?? []).join(", "));
    setAudienceText((source?.audience ?? page?.sourceMetadata?.audience ?? []).join(", "));
    setRelatedText((source?.related ?? page?.sourceMetadata?.related ?? []).join(", "));
    setDeprecated(Boolean(source?.deprecated ?? page?.sourceMetadata?.deprecated));
    setCodeSampleId(preferredCodeSample(page?.codeSamples)?.id ?? "layang-cli");
  }, [page?.id, source?.updatedAt]);

  const savedSummary = source?.summary ?? page?.summary ?? "";
  const savedMarkdown = page ? documentationEditorMarkdown(page, source) : "";
  const savedTags = (source?.tags ?? page?.sourceMetadata?.tags ?? []).join(", ");
  const savedAudience = (source?.audience ?? page?.sourceMetadata?.audience ?? []).join(", ");
  const savedRelated = (source?.related ?? page?.sourceMetadata?.related ?? []).join(", ");
  const savedDeprecated = Boolean(source?.deprecated ?? page?.sourceMetadata?.deprecated);
  const dirty =
    summary !== savedSummary ||
    markdown !== savedMarkdown ||
    tagsText !== savedTags ||
    audienceText !== savedAudience ||
    relatedText !== savedRelated ||
    deprecated !== savedDeprecated;
  const previewPage = page
    ? {
        ...page,
        summary,
        sections: [],
        manualMarkdown: markdown,
        manualPlacement: "inline" as const,
        sourceMetadata: {
          tags: parseCsv(tagsText),
          audience: parseCsv(audienceText),
          related: parseCsv(relatedText),
          deprecated,
        },
      }
    : null;
  const previewMarkdown = useMemo(
    () => (previewPage ? renderDocumentationMarkdown(previewPage, { ...settings, includeCodeSamples: false }) : ""),
    [previewPage, settings],
  );
  const activeCodeSample =
    page?.codeSamples?.find((sample) => sample.id === codeSampleId) ?? preferredCodeSample(page?.codeSamples);
  const markerDefinitions = documentationMarkerDefinitions(page?.kind, page?.protocol);

  if (!page) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1">No documentation page selected</Typography>
      </Paper>
    );
  }

  const insertAutomaticMarker = () => {
    const definition = markerDefinitions.find((item) => item.marker === markerToInsert) ?? markerDefinitions[0];
    if (!definition) return;
    const editor = document.getElementById("documentation-markdown-editor") as HTMLTextAreaElement | null;
    const existingIndex = markdown.indexOf(definition.marker);
    if (existingIndex >= 0) {
      editor?.focus();
      editor?.setSelectionRange(existingIndex, existingIndex + definition.marker.length);
      return;
    }
    const start = editor?.selectionStart ?? markdown.length;
    const end = editor?.selectionEnd ?? start;
    const before = markdown.slice(0, start);
    const after = markdown.slice(end);
    const leadingBreak = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const trailingBreak = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
    const block = `## ${titleCase(definition.label)}\n\n${definition.marker}`;
    const insertion = `${leadingBreak}${block}${trailingBreak}`;
    const next = `${before}${insertion}${after}`;
    const markerStart = before.length + leadingBreak.length + block.indexOf(definition.marker);
    setMarkdown(next);
    requestAnimationFrame(() => {
      const updatedEditor = document.getElementById("documentation-markdown-editor") as HTMLTextAreaElement | null;
      updatedEditor?.focus();
      updatedEditor?.setSelectionRange(markerStart, markerStart + definition.marker.length);
    });
  };
  const saveDraft = () => {
    onSaveSource({
      key: docsSourceKey(page.kind, page.entityId),
      kind: page.kind,
      entityId: page.entityId,
      summary,
      markdown,
      manualPlacement: "inline",
      sections: [],
      tags: parseCsv(tagsText),
      audience: parseCsv(audienceText),
      related: parseCsv(relatedText),
      deprecated,
      updatedAt: new Date().toISOString(),
    });
  };
  const publishDisabled = dirty || page.status === "published" || page.status === "error";
  const publishLabel = dirty
    ? "Save changes first"
    : page.status === "published"
      ? "Published"
      : page.status === "outdated"
        ? "Publish update"
        : "Publish";

  return (
    <Stack spacing={1.1} sx={{ minHeight: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.7}>
            <Typography variant="subtitle1" noWrap title={page.title}>
              {page.title}
            </Typography>
            <Chip
              size="small"
              label={documentationStatusLabel(page.status)}
              color={documentationStatusColor(page.status)}
              variant="outlined"
            />
            {dirty ? <Chip size="small" label={uiCopy.status.unsaved} color="warning" variant="outlined" /> : null}
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap>
            {page.breadcrumbs
              .map((item) => item.title)
              .concat(page.title)
              .join(" / ")}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.6} alignItems="center" justifyContent="flex-end">
          {page.kind === "request" ? (
            <Button size="small" variant="outlined" onClick={onOpenRequest}>
              Try request
            </Button>
          ) : null}
          <Tooltip
            title={
              dirty
                ? "Save first"
                : page.status === "published"
                  ? "Published"
                  : page.status === "error"
                    ? "Fix source"
                    : "Publish"
            }
          >
            <span>
              <Button size="small" variant="contained" disabled={publishDisabled} onClick={onPublish}>
                {publishLabel}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="More documentation actions">
            <IconButton
              size="small"
              aria-label="More documentation actions"
              onClick={(event: ReactMouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)}
            >
              <MoreHoriz sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setTechnicalDetailsOpen(true);
          }}
        >
          <Description sx={{ fontSize: 15 }} />
          {uiCopy.actions.technicalDetails}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            void copyTextWithAnnouncement(page.id, "Documentation page ID");
          }}
        >
          <ContentCopy sx={{ fontSize: 15 }} />
          {uiCopy.actions.copyId}
        </MenuItem>
        <MenuItem
          disabled={dirty || page.status === "error"}
          onClick={() => {
            setMenuAnchor(null);
            onPublish();
          }}
        >
          <Build sx={{ fontSize: 15 }} />
          Republish current page
        </MenuItem>
      </Menu>

      <WorkbenchTabs<DocumentationPanelTab>
        value={tab}
        onChange={setTab}
        idPrefix="documentation-editor"
        ariaLabel="Documentation editor sections"
        items={[
          { value: "content", label: "Write" },
          { value: "preview", label: "Preview" },
        ]}
      />

      {tab === "content" ? (
        <Stack
          role="tabpanel"
          id="documentation-editor-panel-content"
          aria-labelledby="documentation-editor-tab-content"
          tabIndex={0}
          spacing={1}
        >
          <TextField
            size="small"
            label="Summary"
            value={summary}
            onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setSummary(event.target.value)}
          />

          <Paper variant="outlined" sx={{ overflow: "hidden", borderColor: "rgba(148,163,184,0.24)" }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={0.7}
              alignItems={{ sm: "center" }}
              justifyContent="space-between"
              sx={{ p: 0.8, borderBottom: "1px solid", borderColor: "divider", bgcolor: "action.hover" }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={500}>
                  Markdown
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.6} sx={{ minWidth: { sm: 360 }, width: { xs: "100%", sm: "auto" } }}>
                <FormControl fullWidth aria-label="Automatic content to insert">
                  <Select
                    value={markerToInsert}
                    inputProps={{ "aria-label": "Automatic content to insert" }}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => setMarkerToInsert(event.target.value)}
                  >
                    {markerDefinitions.map((definition) => (
                      <option key={definition.marker} value={definition.marker}>
                        {titleCase(definition.label)}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <Button variant="outlined" onClick={insertAutomaticMarker}>
                  {uiCopy.actions.insertBlock}
                </Button>
              </Stack>
            </Stack>
            <TextField
              id="documentation-markdown-editor"
              multiline
              minRows={22}
              value={markdown}
              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMarkdown(event.target.value)}
              placeholder="Write the guide in Markdown."
              inputProps={{
                "aria-label": "Documentation Markdown",
                spellCheck: false,
                style: {
                  minHeight: 430,
                  border: 0,
                  borderRadius: 0,
                  resize: "vertical",
                  fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                },
              }}
            />
          </Paper>

          <details>
            <summary>Optional page metadata</summary>
            <Stack spacing={0.8} sx={{ pt: 1 }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={0.8}>
                <TextField
                  size="small"
                  fullWidth
                  label="Tags"
                  value={tagsText}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setTagsText(event.target.value)
                  }
                  placeholder="tracks, query, public"
                />
                <TextField
                  size="small"
                  fullWidth
                  label="Audience"
                  value={audienceText}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setAudienceText(event.target.value)
                  }
                  placeholder="frontend, integrator"
                />
                <TextField
                  size="small"
                  fullWidth
                  label="Related request IDs"
                  value={relatedText}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setRelatedText(event.target.value)
                  }
                  placeholder="request-search, request-stream"
                />
              </Stack>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1}
                sx={{ border: "1px solid", borderColor: "rgba(148,163,184,0.2)", borderRadius: 1.2, px: 1, py: 0.7 }}
              >
                <Typography variant="body2">Deprecated</Typography>
                <Switch
                  checked={deprecated}
                  inputProps={{ "aria-label": "Mark operation as deprecated" }}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDeprecated(event.target.checked)}
                />
              </Stack>
            </Stack>
          </details>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
            <span />
            <Button variant="contained" onClick={saveDraft} disabled={!dirty}>
              {uiCopy.actions.saveDraft}
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack
          role="tabpanel"
          id="documentation-editor-panel-preview"
          aria-labelledby="documentation-editor-tab-preview"
          tabIndex={0}
          spacing={1.2}
        >
          {page.kind === "request" ? (
            <Paper variant="outlined" sx={{ p: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography variant="body2" fontWeight={500}>
                  Request
                </Typography>
                <Button size="small" variant="outlined" onClick={onOpenRequest}>
                  Try request
                </Button>
              </Stack>
            </Paper>
          ) : null}
          {page.kind === "request" && page.examples?.length ? (
            <DocumentationExampleActions examples={page.examples} onEditExample={onEditExample} />
          ) : null}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 190px" },
              gap: 1.2,
              alignItems: "start",
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <MarkdownPreview markdown={previewMarkdown} />
            </Box>
            <DocumentationOutline markdown={previewMarkdown} />
          </Box>
          {settings.includeCodeSamples && page.codeSamples?.length ? (
            <details className="api-doc-preview__section" open>
              <summary className="api-doc-preview__section-summary">Code examples</summary>
              <Stack spacing={1} sx={{ pt: 1 }}>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {page.codeSamples.map((sample) => (
                    <Button
                      key={sample.id}
                      size="small"
                      variant={sample.id === activeCodeSample?.id ? "contained" : "outlined"}
                      onClick={() => setCodeSampleId(sample.id)}
                    >
                      {sample.label}
                    </Button>
                  ))}
                </Stack>
                <CodeSampleCard sample={activeCodeSample ?? null} />
              </Stack>
            </details>
          ) : null}
        </Stack>
      )}

      <Dialog open={technicalDetailsOpen} onClose={() => setTechnicalDetailsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{uiCopy.actions.technicalDetails}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Contract
              </Typography>
              <Typography variant="body2">{sourceContractLabel(page)}</Typography>
            </Box>
            <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                variant="outlined"
                label={documentationStatusLabel(page.status)}
                color={documentationStatusColor(page.status)}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`${countDocumentationMarkers(
                  markdown,
                  markerDefinitions.map((item) => item.marker),
                )} block${
                  countDocumentationMarkers(
                    markdown,
                    markerDefinitions.map((item) => item.marker),
                  ) === 1
                    ? ""
                    : "s"
                }`}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`${page.examples?.length ?? 0} example${(page.examples?.length ?? 0) === 1 ? "" : "s"}`}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`${page.mocks?.length ?? 0} mock${(page.mocks?.length ?? 0) === 1 ? "" : "s"}`}
              />
            </Stack>
            {page.validation?.errors.length || page.validation?.warnings.length ? (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Validation
                </Typography>
                <Stack spacing={0.35} sx={{ mt: 0.4 }}>
                  {page.validation.errors.map((issue) => (
                    <Alert key={issue.code} severity="error">
                      {issue.message}
                    </Alert>
                  ))}
                  {page.validation.warnings.map((issue) => (
                    <Alert key={issue.code} severity="warning">
                      {issue.message}
                    </Alert>
                  ))}
                </Stack>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No validation issues.
              </Typography>
            )}
            <details>
              <summary>Internal details</summary>
              <Box sx={{ pt: 0.8 }}>
                <Typography variant="caption" color="text.secondary">
                  Page ID
                </Typography>
                <Typography variant="body2" sx={{ overflowWrap: "anywhere", fontFamily: "monospace" }}>
                  {page.id}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.8 }}>
                  Source hash
                </Typography>
                <Typography variant="body2" sx={{ overflowWrap: "anywhere", fontFamily: "monospace" }}>
                  {page.sourceHash}
                </Typography>
              </Box>
            </details>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTechnicalDetailsOpen(false)}>{uiCopy.actions.close}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function countDocumentationMarkers(markdown: string, markers: string[]) {
  return markers.reduce((total, marker) => total + markdown.split(marker).length - 1, 0);
}

function DocumentationExampleActions({
  examples,
  onEditExample,
}: {
  examples: NonNullable<UnifiedDocsPage["examples"]>;
  onEditExample?: (id: string, tab?: "general" | "request" | "response" | "documentation") => void;
}) {
  const visible = examples.filter((example) => example.enabled !== false);
  if (!visible.length) return null;
  return (
    <details className="api-doc-preview__section" open>
      <summary className="api-doc-preview__section-summary">Editable examples</summary>
      <Stack spacing={0.8} sx={{ pt: 1 }}>
        {visible.map((example) => {
          const documentation = example.documentation ?? {};
          return (
            <Paper key={String(example.id)} variant="outlined" sx={{ p: 1 }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="space-between"
                spacing={1}
                alignItems={{ md: "center" }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" fontWeight={600}>
                      {String(example.name || "Example")}
                    </Typography>
                    {example.expectedStatus ? (
                      <Chip size="small" label={String(example.expectedStatus)} variant="outlined" />
                    ) : null}
                    {Array.isArray(example.tags)
                      ? example.tags.map((tag: string) => (
                          <Chip key={tag} size="small" label={tag} variant="outlined" />
                        ))
                      : null}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                    {documentation.summary || "No description"}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.55} sx={{ flexShrink: 0 }}>
                  <Button
                    size="small"
                    variant="text"
                    disabled={!onEditExample}
                    onClick={() => onEditExample?.(String(example.id), "documentation")}
                  >
                    Edit description
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!onEditExample}
                    onClick={() => onEditExample?.(String(example.id), "general")}
                  >
                    Edit example data
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </details>
  );
}

function CodeSampleCard({ sample }: { sample: DocsCodeSample | null }) {
  if (!sample) return <Alert severity="info">No code sample is available.</Alert>;
  const copy = () => copyTextWithAnnouncement(sample.code, `${sample.label} code`);
  return (
    <Paper variant="outlined" sx={{ p: 1.2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.7 }}>
        <Typography variant="subtitle1">{sample.label}</Typography>
        <Tooltip title="Copy code">
          <IconButton size="small" onClick={copy} aria-label={`Copy ${sample.label} code`}>
            <ContentCopy sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <pre className={`code-viewer code-viewer--${sample.language}`}>
        <code>{sample.code}</code>
      </pre>
    </Paper>
  );
}

export function UnifiedDocsSidebar({
  pages,
  activePageId,
  onOpen,
  onBuildAll,
  onCheck,
  onOpenSite,
  onOpenWikiExport,
  settings,
  onSettingsChange,
}: {
  pages: UnifiedDocsPage[];
  activePageId: string;
  onOpen: (page: UnifiedDocsPage) => void;
  onBuildAll: () => void;
  onCheck: () => void;
  onOpenSite: () => void;
  onOpenWikiExport: () => void;
  settings: DocumentationSettings;
  onSettingsChange: (settings: DocumentationSettings) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["workspace:overview"]));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manageAnchor, setManageAnchor] = useState<TechnicalMenuAnchor>(null);

  const pageById = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      next.add("workspace:overview");
      for (const page of pages) if (page.kind === "collection") next.add(page.id);
      return next;
    });
  }, [pages]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return pages
      .filter((page) =>
        `${page.title} ${page.summary} ${page.protocol ?? ""} ${page.manualMarkdown ?? ""} ${(page.sourceMetadata?.tags ?? []).join(" ")} ${(page.sourceMetadata?.audience ?? []).join(" ")} ${String(page.contract?.methodFullName ?? page.request?.url ?? "")} ${(page.errors ?? []).map((item) => `${item.code} ${item.meaning}`).join(" ")} ${page.breadcrumbs.map((item) => item.title).join(" ")}`
          .toLowerCase()
          .includes(needle),
      )
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [pages, query]);

  const staleCount = pages.filter((page) => page.status === "outdated").length;
  const unpublishedCount = pages.filter((page) => page.status === "ready" || page.status === "draft").length;
  const errorCount = pages.filter((page) => page.status === "error").length;
  const buildSummary = errorCount
    ? `${errorCount} build error${errorCount === 1 ? "" : "s"}`
    : staleCount
      ? `${staleCount} update${staleCount === 1 ? "" : "s"} required`
      : unpublishedCount
        ? `${unpublishedCount} unpublished`
        : "Published docs are current";

  const toggleExpanded = (pageId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const renderTreeNode = (page: UnifiedDocsPage, depth: number): ReactNode => {
    const childPages = page.children.map((childId) => pageById.get(childId)).filter(Boolean) as UnifiedDocsPage[];
    const isExpanded = expanded.has(page.id);
    return (
      <Box key={page.id}>
        <Stack direction="row" alignItems="stretch" spacing={0.2} sx={{ pl: depth * 0.8 }}>
          {childPages.length ? (
            <IconButton
              size="small"
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${page.title}`}
              onClick={() => toggleExpanded(page.id)}
              sx={{ width: 26, minWidth: 26 }}
            >
              {isExpanded ? <KeyboardArrowDown sx={{ fontSize: 14 }} /> : <KeyboardArrowRight sx={{ fontSize: 14 }} />}
            </IconButton>
          ) : (
            <Box sx={{ width: 26, minWidth: 26 }} />
          )}
          <Button
            variant="text"
            onClick={() => onOpen(page)}
            sx={{
              flex: 1,
              minWidth: 0,
              justifyContent: "flex-start",
              textAlign: "left",
              px: 0.7,
              py: 0.45,
              fontWeight: 400,
              border: "1px solid",
              borderColor: page.id === activePageId ? "rgba(59,130,246,0.42)" : "transparent",
              bgcolor: page.id === activePageId ? "rgba(59,130,246,0.11)" : "transparent",
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.6} sx={{ width: "100%", minWidth: 0 }}>
              {documentationPageIcon(page, isExpanded)}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {page.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {page.kind === "request"
                    ? `${String(page.protocol ?? "request").toUpperCase()} · ${documentationStatusLabel(page.status)}`
                    : page.kind}
                </Typography>
              </Box>
            </Stack>
          </Button>
        </Stack>
        {childPages.length && isExpanded ? (
          <Stack spacing={0.15}>{childPages.map((child) => renderTreeNode(child, depth + 1))}</Stack>
        ) : null}
      </Box>
    );
  };

  const root = pageById.get("workspace:overview") ?? pages.find((page) => page.kind === "workspace") ?? null;

  return (
    <Stack spacing={1} sx={{ height: "100%", minHeight: 0, p: 1 }}>
      <TextField
        size="small"
        placeholder="Search documentation"
        value={query}
        onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setQuery(event.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search sx={{ fontSize: 16 }} />
            </InputAdornment>
          ),
        }}
      />

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", pr: 0.2 }}>
        {query.trim() ? (
          <Stack spacing={0.25}>
            {filtered.length ? (
              filtered.map((page) => (
                <Button
                  key={page.id}
                  variant="text"
                  onClick={() => onOpen(page)}
                  sx={{
                    justifyContent: "flex-start",
                    textAlign: "left",
                    px: 0.8,
                    py: 0.5,
                    fontWeight: 400,
                    border: "1px solid",
                    borderColor: page.id === activePageId ? "rgba(59,130,246,0.42)" : "transparent",
                    bgcolor: page.id === activePageId ? "rgba(59,130,246,0.11)" : "transparent",
                  }}
                >
                  <Box sx={{ minWidth: 0, width: "100%" }}>
                    <Typography variant="body2" noWrap>
                      <SearchHighlightedText text={page.title} query={query} />
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      <SearchHighlightedText
                        text={page.breadcrumbs.map((item) => item.title).join(" / ") || page.kind}
                        query={query}
                      />
                    </Typography>
                  </Box>
                </Button>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                No documentation matches this search.
              </Typography>
            )}
          </Stack>
        ) : root ? (
          renderTreeNode(root, 0)
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            No documentation pages are available.
          </Typography>
        )}
      </Box>

      <Divider />
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.6}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
          <CheckCircle
            sx={{ fontSize: 15 }}
            color={errorCount ? "error" : staleCount || unpublishedCount ? "warning" : "secondary"}
          />
          <Typography variant="caption" color="text.secondary" noWrap title={buildSummary}>
            {buildSummary}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.2}>
          <Tooltip title="Build and publication actions">
            <IconButton
              size="small"
              aria-label="Build and publication actions"
              onClick={(event: ReactMouseEvent<HTMLElement>) => setManageAnchor(event.currentTarget)}
            >
              <MoreHoriz sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Documentation settings">
            <IconButton size="small" aria-label="Documentation settings" onClick={() => setSettingsOpen(true)}>
              <Settings sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Menu anchorEl={manageAnchor} open={Boolean(manageAnchor)} onClose={() => setManageAnchor(null)}>
        <MenuItem
          onClick={() => {
            setManageAnchor(null);
            onBuildAll();
          }}
        >
          <Build sx={{ fontSize: 15 }} />
          {uiCopy.actions.buildAll}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setManageAnchor(null);
            onCheck();
          }}
        >
          <CheckCircle sx={{ fontSize: 15 }} />
          {uiCopy.actions.checkFiles}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setManageAnchor(null);
            onOpenSite();
          }}
        >
          <OpenInNew sx={{ fontSize: 15 }} />
          {uiCopy.actions.openSite}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setManageAnchor(null);
            onOpenWikiExport();
          }}
        >
          <FolderOpen sx={{ fontSize: 15 }} />
          Open wiki export
        </MenuItem>
      </Menu>

      <DocumentationSettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={onSettingsChange}
      />
    </Stack>
  );
}

function DocumentationOutline({ markdown }: { markdown: string }) {
  const headings = useMemo(
    () =>
      markdown
        .split(/\r?\n/)
        .map((line) => line.match(/^(#{2,3})\s+(.+)$/))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => ({ level: match[1].length, title: match[2].replace(/[`*_]/g, "") })),
    [markdown],
  );
  if (!headings.length) return null;
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1, position: { lg: "sticky" }, top: { lg: 8 }, display: { xs: "none", lg: "block" } }}
    >
      <Typography variant="caption" fontWeight={600}>
        On this page
      </Typography>
      <Stack spacing={0.35} sx={{ mt: 0.7 }}>
        {headings.map((heading) => (
          <Typography
            key={`${heading.level}-${heading.title}`}
            variant="caption"
            color="text.secondary"
            sx={{ pl: heading.level === 3 ? 1 : 0 }}
            noWrap
            title={heading.title}
          >
            {heading.title}
          </Typography>
        ))}
      </Stack>
    </Paper>
  );
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

function DocumentationSettingsDialog({
  open,
  settings,
  onClose,
  onChange,
}: {
  open: boolean;
  settings: DocumentationSettings;
  onClose: () => void;
  onChange: (settings: DocumentationSettings) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Documentation settings</DialogTitle>
      <DialogContent>
        <Stack spacing={1.4}>
          <Box>
            <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
              Publishing
            </Typography>
            <FormControl fullWidth>
              <Select
                value={settings.mode}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  onChange({ ...settings, mode: event.target.value as DocumentationSettings["mode"] })
                }
              >
                <option value="preview-manual-publish">Preview, then publish</option>
                <option value="publish-on-save">Publish on save</option>
                <option value="manual">Manual build only</option>
              </Select>
            </FormControl>
          </Box>
          <Divider />
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2">Overview indexes</Typography>
            </Box>
            <Switch
              checked={settings.includeOverviewIndexes}
              inputProps={{ "aria-label": "Overview indexes" }}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onChange({ ...settings, includeOverviewIndexes: event.target.checked })
              }
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function documentationPageIcon(page: UnifiedDocsPage, expanded: boolean) {
  if (page.kind === "workspace") return <DocsIcon sx={{ fontSize: 15 }} />;
  if (page.kind === "request") return <Description sx={{ fontSize: 15 }} />;
  return expanded ? <FolderOpen sx={{ fontSize: 15 }} /> : <Folder sx={{ fontSize: 15 }} />;
}

function preferredCodeSample(samples: DocsCodeSample[] | undefined): DocsCodeSample | null {
  if (!samples?.length) return null;
  return samples.find((sample) => sample.id !== "layang-cli") ?? samples[0];
}

function documentationStatusLabel(status: DocumentationStatus): string {
  if (status === "ready") return "Unpublished";
  if (status === "outdated") return "Update required";
  if (status === "error") return "Build error";
  if (status === "published") return "Published";
  return "Draft";
}

function documentationStatusColor(status: DocumentationStatus): "success" | "warning" | "error" | "default" {
  if (status === "published") return "success";
  if (status === "outdated" || status === "ready") return "warning";
  if (status === "error") return "error";
  return "default";
}

function sourceContractLabel(page: UnifiedDocsPage): string {
  if (page.protocol === "grpc") {
    return `${String(page.contract?.libraryId ?? "schema")} / ${String(page.contract?.revisionId ?? "revision")}`;
  }
  if (page.protocol === "rest") {
    return `${String(page.request?.method ?? "GET")} ${String(page.request?.url ?? "")}`;
  }
  return String(page.request?.url ?? page.kind);
}
