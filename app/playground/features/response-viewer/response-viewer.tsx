"use client";

import { Fragment, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  TableBody,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from "@/components/shadcn/compat";
import { ContentCopy } from "@/components/shadcn/icons";
import { EmptyState } from "../../shared/components/empty-state";
import { ResizableTable, type ResizableTableColumn } from "../../shared/components/resizable-table";
import { formatTimestampReadable, formatTimestampShort } from "../../shared/formatters";
import { deepTextIncludes, safePrettyJson } from "../../shared/json-utils";
import type { HistoryItem, UiEvent } from "../../shared/workbench-types";

const maxMessageTableRows = 200;
const maxJsonBlockChars = 60000;

const oneLineMessageSx = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 12,
} as const;

const messageTableColumns: ResizableTableColumn[] = [
  { id: "no", label: "No", width: 44, minWidth: 36, maxWidth: 80, sx: { textAlign: "right" } },
  { id: "time", label: "Time", width: 136, minWidth: 112, maxWidth: 260 },
  { id: "summary", label: "Summary", width: 560, minWidth: 260, maxWidth: 1400 },
];

const historyTableColumns: ResizableTableColumn[] = [
  { id: "time", label: "Time", width: 136, minWidth: 112, maxWidth: 260 },
  { id: "method", label: "Method", width: 320, minWidth: 160, maxWidth: 900 },
  { id: "status", label: "Status", width: 120, minWidth: 90, maxWidth: 260 },
  { id: "duration", label: "Duration", width: 110, minWidth: 90, maxWidth: 180 },
  { id: "messages", label: "Messages", width: 92, minWidth: 76, maxWidth: 160, sx: { textAlign: "right" } },
];

/** Renders response messages as newest-first one-line rows that expand on click. */
export function MessageTable({
  events,
  empty,
  filterQuery = "",
}: {
  events: UiEvent[];
  empty: string;
  filterQuery?: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const normalizedFilterQuery = filterQuery.trim();
  const displayEvents = useMemo<Array<{ event: UiEvent; messageNumber: number; timestampMs: number }>>(() => {
    const normalizedQuery = filterQuery.trim();
    return events
      .filter((event) => event.kind === "message" || event.kind === "error" || event.kind === "end")
      .map((event, index) => ({
        event,
        messageNumber: parseMessageNumber(event.title) ?? index + 1,
        timestampMs: new Date(event.timestamp).getTime(),
      }))
      .filter(({ event }) => {
        if (!normalizedQuery) return true;
        return (
          deepTextIncludes(event.payload, normalizedQuery) ||
          event.title.toLowerCase().includes(normalizedQuery.toLowerCase())
        );
      })
      .sort((a, b) => {
        const timeDiff =
          (Number.isFinite(b.timestampMs) ? b.timestampMs : 0) - (Number.isFinite(a.timestampMs) ? a.timestampMs : 0);
        return timeDiff || b.messageNumber - a.messageNumber;
      })
      .slice(0, maxMessageTableRows);
  }, [events, filterQuery]);

  if (displayEvents.length === 0) {
    return (
      <EmptyState
        title={normalizedFilterQuery ? "No matching messages" : "No messages yet"}
        body={normalizedFilterQuery ? `No message rows contain "${normalizedFilterQuery}".` : empty}
      />
    );
  }
  return (
    <ResizableTable columns={messageTableColumns}>
      <TableBody>
        {displayEvents.map(({ event, messageNumber }: { event: UiEvent; messageNumber: number }) => {
          const expanded = expandedId === event.id;
          const summary = oneLinePayload(event.payload);
          return (
            <Fragment key={event.id}>
              <TableRow sx={{ cursor: "pointer" }} onClick={() => setExpandedId(expanded ? null : event.id)}>
                <TableCell sx={{ whiteSpace: "nowrap", textAlign: "right", color: "text.secondary" }}>
                  {messageNumber}
                </TableCell>
                <TableCell
                  title={formatTimestampShort(event.timestamp)}
                  sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {formatTimestampReadable(event.timestamp)}
                </TableCell>
                <TableCell sx={{ minWidth: 0 }}>
                  <Box
                    title={summary}
                    sx={{
                      ...oneLineMessageSx,
                      fontFamily:
                        'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
                    }}
                  >
                    <HighlightedInlineText text={summary} query={filterQuery} />
                  </Box>
                </TableCell>
              </TableRow>
              {expanded && (
                <TableRow key={`${event.id}-expanded`}>
                  <TableCell colSpan={3}>
                    <Box
                      sx={{
                        position: "relative",
                        maxHeight: 440,
                        overflow: "auto",
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1.25,
                        bgcolor: "var(--muted)",
                        "& .code-viewer": {
                          maxHeight: "none",
                          overflow: "visible",
                          border: 0,
                          borderRadius: 0,
                          bgcolor: "transparent",
                        },
                      }}
                    >
                      <Tooltip title={copiedId === event.id ? "Copied" : "Copy message"}>
                        <IconButton
                          size="small"
                          aria-label="Copy message"
                          onClick={(clickEvent: MouseEvent<HTMLButtonElement>) => {
                            clickEvent.stopPropagation();
                            void copyMessagePayload(event.payload).then((copied) => {
                              if (!copied) return;
                              setCopiedId(event.id);
                              window.setTimeout(() => setCopiedId((current) => (current === event.id ? null : current)), 1200);
                            });
                          }}
                          sx={{
                            position: "sticky",
                            top: 8,
                            right: 8,
                            float: "right",
                            m: 0.75,
                            zIndex: 2,
                            bgcolor: "background.paper",
                            border: "1px solid",
                            borderColor: "divider",
                            boxShadow: 1,
                            "&:hover": { bgcolor: "action.hover" },
                          }}
                        >
                          <ContentCopy sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <JsonBlock value={event.payload} compact highlightQuery={filterQuery} />
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </ResizableTable>
  );
}

/** Extracts the original message sequence number from titles like "Message #12". */
function parseMessageNumber(title: string): number | null {
  const match = String(title || "").match(/#(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** Formats JSON-like payloads as one compact line for dense message rows. */
function oneLinePayload(value: unknown): string {
  const text = safePrettyJson(value, { parseString: true }).replace(/\s+/g, " ").trim();
  if (!text) return "{}";
  return text.length > 320 ? `${text.slice(0, 320)}...` : text;
}

/** Copies the selected message payload in a user-friendly raw/pretty format. */
async function copyMessagePayload(value: unknown): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(messagePayloadCopyText(value));
    return true;
  } catch {
    return false;
  }
}

/** Preserves raw text messages while pretty-printing JSON-like payloads. */
function messagePayloadCopyText(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return safePrettyJson(value);
}

/** Renders lower-volume raw event lists. */
export function EventList({
  events,
  empty,
  filterQuery = "",
}: {
  events: UiEvent[];
  empty: string;
  filterQuery?: string;
}) {
  const normalizedFilterQuery = filterQuery.trim();
  const displayEvents = (
    normalizedFilterQuery
      ? events.filter(
          (event) =>
            deepTextIncludes(event.payload, normalizedFilterQuery) ||
            event.title.toLowerCase().includes(normalizedFilterQuery.toLowerCase()),
        )
      : events
  ).slice(0, maxMessageTableRows);
  if (displayEvents.length === 0) {
    return (
      <EmptyState
        title={normalizedFilterQuery ? "No matching events" : "No data"}
        body={normalizedFilterQuery ? `No event rows contain "${normalizedFilterQuery}".` : empty}
      />
    );
  }
  return (
    <Stack spacing={0.8}>
      {displayEvents.map((event) => (
        <Paper key={event.id} variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
          <Stack direction="row" spacing={0.7} alignItems="center" sx={{ mb: 0.6 }}>
            <Typography variant="caption" color="text.secondary">
              {formatTimestampReadable(event.timestamp)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 520 }}>
              <HighlightedInlineText text={event.title} query={filterQuery} />
            </Typography>
          </Stack>
          <JsonBlock value={event.payload} highlightQuery={filterQuery} />
        </Paper>
      ))}
    </Stack>
  );
}

/** Renders method-scoped request history. */
export function HistoryTable({
  history,
  filterQuery = "",
  onClear,
}: {
  history: HistoryItem[];
  filterQuery?: string;
  onClear?: () => void;
}) {
  const filtered = filterQuery ? history.filter((item) => deepTextIncludes(item, filterQuery)) : history;
  return (
    <Stack spacing={0.8}>
      {onClear && (
        <Button size="small" color="error" variant="text" onClick={onClear} sx={{ alignSelf: "flex-start" }}>
          Clear history
        </Button>
      )}
      {filtered.length === 0 ? (
        <EmptyState title="No history" body="Run a request to create a history item." />
      ) : (
        <ResizableTable columns={historyTableColumns}>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell
                  title={formatTimestampShort(item.timestamp)}
                  sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {formatTimestampReadable(item.timestamp)}
                </TableCell>
                <TableCell title={item.method}>{item.method}</TableCell>
                <TableCell>
                  <Chip size="small" label={item.status} />
                </TableCell>
                <TableCell>{item.durationMs} ms</TableCell>
                <TableCell sx={{ textAlign: "right" }}>{item.messageCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </ResizableTable>
      )}
    </Stack>
  );
}

/** Renders only the newest response message payload as formatted JSON. */
export function LatestResponseJsonViewer({
  value,
  empty = "Run a request to see the latest response payload.",
  filterQuery = "",
  fullHeight = false,
}: {
  value: unknown;
  empty?: string;
  filterQuery?: string;
  fullHeight?: boolean;
}) {
  if (value === undefined) {
    return <EmptyState title="No latest response" body={empty} />;
  }

  return <JsonBlock value={value} highlightQuery={filterQuery} fullHeight={fullHeight} />;
}

/** Renders an object as formatted JSON with optional text highlighting. */
export function JsonBlock({
  value,
  compact = false,
  highlightQuery = "",
  fullHeight = false,
}: {
  value: unknown;
  compact?: boolean;
  highlightQuery?: string;
  fullHeight?: boolean;
}) {
  const truncated = safePrettyJson(value, {
    parseString: true,
    maxChars: maxJsonBlockChars,
    truncatedLabel: "... truncated ...",
  });
  return (
    <pre
      className={["code-viewer", compact ? "code-viewer--compact" : "", fullHeight ? "code-viewer--fill" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <code>
        <HighlightedCodeText text={truncated} query={highlightQuery} />
      </code>
    </pre>
  );
}

/** Highlights a query in preformatted code text. */
function HighlightedCodeText({ text, query }: { text: string; query: string }) {
  return renderBoldMatches(text, query);
}

/** Highlights a query in a compact single-line label without changing the source value. */
function HighlightedInlineText({ text, query }: { text: string; query: string }) {
  return renderBoldMatches(text, query);
}

/** Renders query matches in bold without mutating or filtering the source value. */
function renderBoldMatches(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;

  const regex = new RegExp(escapeRegExp(needle), "ig");
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(regex)) {
    const matchText = match[0];
    const start = match.index ?? cursor;
    const end = start + matchText.length;

    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }

    nodes.push(<strong key={`match-${start}-${end}-${matchText}`}>{matchText}</strong>);
    cursor = end;
  }

  if (cursor === 0) return text;
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

/** Escapes a string for safe regex use. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
