"use client";

import { Delete, Download } from "@/components/shadcn/icons";
import { Alert, Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography } from "@/components/shadcn/compat";
import type { GrpcResult, RpcMethodInfo } from "@/lib/types";
import { designSystem } from "../../design-system";
import { EmptyState } from "../../shared/components/empty-state";
import { formatTimestampShort } from "../../shared/formatters";
import { methodTypeLabel } from "../../shared/rpc-method-utils";
import type { MethodDoc, SavedExample } from "../../shared/workbench-types";

export type { MethodDoc };

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "list"; items: string[] }
  | { type: "hr" };

const compactCardSx = { p: designSystem.space.cardPadding, borderRadius: designSystem.size.cardRadius } as const;
const buttonSx = {
  minHeight: designSystem.size.buttonSmallHeight,
  height: designSystem.size.buttonSmallHeight,
  px: 1,
  fontSize: designSystem.font.label,
  lineHeight: 1,
  whiteSpace: "nowrap",
} as const;

/** Renders generated markdown as readable API documentation instead of a raw text block. */
export function MarkdownPreview({ markdown }: { markdown: string }) {
  const blocks = parseMarkdownBlocks(markdown);
  return (
    <div className="api-doc-preview">
      {blocks.map((block) => {
        const key = markdownBlockKey(block);
        if (block.type === "hr") return <hr key={key} className="api-doc-preview__hr" />;
        if (block.type === "heading") {
          const level = block.level ?? 2;
          const Heading = (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as "h1" | "h2" | "h3";
          return (
            <Heading key={key} className={`api-doc-preview__heading api-doc-preview__heading--${level}`}>
              {block.text}
            </Heading>
          );
        }
        if (block.type === "code")
          return (
            <pre key={key} className={`code-viewer code-viewer--${block.lang || "text"}`}>
              <code>{block.text}</code>
            </pre>
          );
        if (block.type === "list")
          return (
            <ul key={key} className="api-doc-preview__list">
              {(block.items ?? []).map((item) => (
                <li key={`item-${hashString(item)}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        return (
          <p key={key} className="api-doc-preview__paragraph">
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
}

/** Renders generated per-method documentation actions and summary. */
export function MethodDocsPanel({
  selectedMethod,
  doc,
  examples,
  docsResult,
  onPreview,
  onSaveResult,
  onExportPublic,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  selectedMethod: RpcMethodInfo | null;
  doc: MethodDoc | null;
  examples: SavedExample[];
  docsResult: GrpcResult | null;
  onPreview: () => void;
  onSaveResult: () => void;
  onExportPublic: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
}) {
  if (!selectedMethod)
    return <EmptyState title="No method selected" body="Select a method to generate documentation." />;
  return (
    <Stack spacing={1.1}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap title={`${selectedMethod.serviceName}/${selectedMethod.methodName}`}>
            Generated docs
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            title="Docs are generated from proto data, examples, and saved response snapshots."
          >
            Auto-generated from method, proto, examples, and saved result.
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
          <Button size="small" variant="outlined" onClick={onPreview}>
            Preview
          </Button>
          <Button size="small" variant="outlined" onClick={onSaveResult} disabled={!docsResult}>
            Save result
          </Button>
          <Button size="small" variant="outlined" onClick={onExportPublic}>
            Export docs
          </Button>
          {doc?.published ? (
            <Button size="small" variant="outlined" onClick={onUnpublish}>
              Unpublish
            </Button>
          ) : null}
          <Button size="small" variant="outlined" color="error" onClick={onDelete}>
            Delete
          </Button>
          <Button size="small" variant="contained" onClick={onPublish}>
            {doc?.published ? "Update" : "Publish"}
          </Button>
        </Stack>
      </Stack>
      <Paper variant="outlined" sx={{ ...compactCardSx, p: 1.2 }}>
        <Stack spacing={0.55}>
          <Typography
            variant="body2"
            fontWeight={560}
            noWrap
            title={`${selectedMethod.serviceName}/${selectedMethod.methodName}`}
          >
            {selectedMethod.methodName}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap title={selectedMethod.serviceName}>
            {selectedMethod.serviceName}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            title={`${selectedMethod.requestType} -> ${selectedMethod.responseType}`}
          >
            {" - "}
            {selectedMethod.requestType.split(".").pop()} → {selectedMethod.responseType.split(".").pop()}
          </Typography>
          <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={methodTypeLabel(selectedMethod)} />
            <Chip
              size="small"
              label={`${examples.length} example${examples.length === 1 ? "" : "s"}`}
              variant="outlined"
            />
            <Chip
              size="small"
              label={docsResult ? "saved result" : "no saved result"}
              color={docsResult ? "success" : "default"}
              variant="outlined"
            />
          </Stack>
        </Stack>
      </Paper>
      <Alert severity="info">
        Docs are generated automatically from proto metadata, examples, and a saved response snapshot. Run the method,
        save the response, then publish it to the Docs sidebar.
      </Alert>
    </Stack>
  );
}

/** Renders publishable API documentation entries in the sidebar. */
export function DocsSidebar({
  docs,
  activeMethodKey,
  onExport,
  onOpen,
  onUnpublish,
}: {
  docs: MethodDoc[];
  activeMethodKey: string;
  onExport: () => void;
  onOpen: (doc: MethodDoc) => void;
  onUnpublish: (doc: MethodDoc) => void;
}) {
  if (docs.length === 0)
    return <SmallEmpty body="Publish gRPC or WebSocket docs from the Docs tab to build static API docs." />;
  return (
    <Stack spacing={designSystem.space.gap}>
      <Button
        size="small"
        variant="outlined"
        startIcon={<Download />}
        onClick={onExport}
        sx={{ ...buttonSx, alignSelf: "flex-start" }}
      >
        Export docs
      </Button>
      {docs.map((doc) => (
        <Paper
          key={doc.methodKey}
          variant="outlined"
          sx={{ ...compactCardSx, borderColor: doc.methodKey === activeMethodKey ? "primary.main" : "divider" }}
        >
          <Stack direction="row" alignItems="center" spacing={0.7}>
            <button
              type="button"
              onClick={() => onOpen(doc)}
              style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", minWidth: 0 }}
            >
              <Typography variant="body2" fontWeight={520} noWrap title={doc.methodName}>
                {doc.methodName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap title={doc.serviceName} display="block">
                {doc.serviceName}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Updated {formatTimestampShort(doc.updatedAt)}
              </Typography>
            </button>
            <Tooltip title="Remove from published docs">
              <IconButton size="small" color="error" onClick={() => onUnpublish(doc)}>
                <Delete sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

/** Parses the small markdown subset produced by Layang docs export. */
function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;
  let codeLang = "";
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  };

  for (const line of lines) {
    const fence = line.match(/^```(\w+)?/);
    if (fence) {
      if (code) {
        blocks.push({ type: "code", lang: codeLang, text: code.join("\n") });
        code = null;
        codeLang = "";
      } else {
        flushParagraph();
        flushList();
        code = [];
        codeLang = fence[1] ?? "";
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushList();
      blocks.push({ type: "hr" });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Renders inline code spans in generated documentation text. */
function renderInlineMarkdown(text = "") {
  const parts = text.split(/(`[^`]+`)/g).filter(Boolean);
  return parts.map((part) =>
    part.startsWith("`") && part.endsWith("`") ? (
      <code key={`inline-${hashString(part)}`} className="inline-code">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function markdownBlockKey(block: MarkdownBlock): string {
  return `${block.type}-${hashString(JSON.stringify(block))}`;
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** Renders a compact empty-state card. */
function SmallEmpty({ body }: { body: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
    </Paper>
  );
}
