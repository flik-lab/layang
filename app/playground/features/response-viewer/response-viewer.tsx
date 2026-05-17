"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@/components/shadcn/compat";
import { EmptyState } from "../../shared/components/empty-state";
import { formatTimestampShort } from "../../shared/formatters";
import { deepTextIncludes, filterJsonValue, safePrettyJson } from "../../shared/json-utils";
import type { HistoryItem, UiEvent } from "../../shared/workbench-types";

const maxMessageTableRows = 200;
const maxJsonBlockChars = 60000;

const oneLineMessageSx = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 12,
} as const;

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
  const displayEvents = useMemo(() => {
    return events
      .filter((event) => event.kind === "message" || event.kind === "error" || event.kind === "end")
      .map((event, index) => ({
        event,
        messageNumber: parseMessageNumber(event.title) ?? index + 1,
        timestampMs: new Date(event.timestamp).getTime(),
      }))
      .sort((a, b) => {
        const timeDiff =
          (Number.isFinite(b.timestampMs) ? b.timestampMs : 0) - (Number.isFinite(a.timestampMs) ? a.timestampMs : 0);
        return timeDiff || b.messageNumber - a.messageNumber;
      })
      .slice(0, maxMessageTableRows);
  }, [events]);

  if (displayEvents.length === 0) return <EmptyState title="No messages yet" body={empty} />;
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>No.</TableCell>
            <TableCell>Time</TableCell>
            <TableCell>Kind</TableCell>
            <TableCell>Summary</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {displayEvents.map(({ event, messageNumber }) => {
            const filteredPayload = filterQuery ? filterJsonValue(event.payload, filterQuery) : event.payload;
            const matches =
              !filterQuery ||
              filteredPayload !== undefined ||
              event.title.toLowerCase().includes(filterQuery.toLowerCase());
            const payload = filteredPayload ?? event.payload;
            const expanded = expandedId === event.id;
            return (
              <Fragment key={event.id}>
                <TableRow
                  sx={{ opacity: matches ? 1 : 0.45, cursor: "pointer" }}
                  onClick={() => setExpandedId(expanded ? null : event.id)}
                >
                  <TableCell sx={{ whiteSpace: "nowrap", width: 58 }}>#{messageNumber}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", width: 190 }}>
                    {formatTimestampShort(event.timestamp)}
                  </TableCell>
                  <TableCell sx={{ width: 92 }}>
                    <Chip
                      size="small"
                      label={event.kind}
                      color={event.kind === "error" ? "error" : event.kind === "end" ? "success" : "default"}
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 0 }}>
                    <Box
                      title={oneLinePayload(payload)}
                      sx={{
                        ...oneLineMessageSx,
                        fontFamily:
                          'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
                      }}
                    >
                      {oneLinePayload(payload)}
                    </Box>
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow key={`${event.id}-expanded`}>
                    <TableCell colSpan={4}>
                      <JsonBlock value={payload} compact highlightQuery={filterQuery} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
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
  const displayEvents = events.slice(0, maxMessageTableRows);
  if (displayEvents.length === 0) return <EmptyState title="No data" body={empty} />;
  return (
    <Stack spacing={0.8}>
      {displayEvents.map((event) => {
        const matches =
          !filterQuery ||
          deepTextIncludes(event.payload, filterQuery) ||
          event.title.toLowerCase().includes(filterQuery.toLowerCase());
        return (
          <Paper key={event.id} variant="outlined" sx={{ p: 1, borderRadius: 2, opacity: matches ? 1 : 0.45 }}>
            <Stack direction="row" spacing={0.7} alignItems="center" sx={{ mb: 0.6 }}>
              <Chip size="small" label={event.kind} />
              <Typography variant="caption" color="text.secondary">
                {formatTimestampShort(event.timestamp)}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 520 }}>
                {event.title}
              </Typography>
            </Stack>
            <JsonBlock value={event.payload} highlightQuery={filterQuery} />
          </Paper>
        );
      })}
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
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Duration</TableCell>
                <TableCell>Messages</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{formatTimestampShort(item.timestamp)}</TableCell>
                  <TableCell title={item.method}>{item.method}</TableCell>
                  <TableCell>
                    <Chip size="small" label={item.status} />
                  </TableCell>
                  <TableCell>{item.durationMs} ms</TableCell>
                  <TableCell>{item.messageCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

/** Renders an object as formatted JSON with optional text highlighting. */
export function JsonBlock({
  value,
  compact = false,
  highlightQuery = "",
}: {
  value: unknown;
  compact?: boolean;
  highlightQuery?: string;
}) {
  const truncated = safePrettyJson(value, {
    parseString: true,
    maxChars: maxJsonBlockChars,
    truncatedLabel: "... truncated ...",
  });
  return (
    <pre className={`code-viewer ${compact ? "code-viewer--compact" : ""}`}>
      <code>
        <HighlightedCodeText text={truncated} query={highlightQuery} />
      </code>
    </pre>
  );
}

/** Highlights a query in preformatted code text. */
function HighlightedCodeText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return text;
  const needle = query.trim();
  const regex = new RegExp(`(${escapeRegExp(needle)})`, "ig");
  const lowerNeedle = needle.toLowerCase();
  return text.split(regex).map((part) => (part.toLowerCase() === lowerNeedle ? <mark key={part}>{part}</mark> : part));
}

/** Escapes a string for safe regex use. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
