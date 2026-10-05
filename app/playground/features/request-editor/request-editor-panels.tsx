"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useId,
  useRef,
  useState,
} from "react";

import { Close, DesktopWindows, Edit } from "@/components/shadcn/icons";

import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@/components/shadcn/compat";
import type { listMessageFields } from "@/lib/example-generator";
import { LayangCodeEditor, type LayangCodeEditorHandle } from "@/components/editor/layang-code-editor";

type CodeTextFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onDraftChange?: (value: string) => void;
  buffered?: boolean;
  /** Optional debounce for committing buffered edits to the parent model. */
  commitDelayMs?: number;
  onBlur?: (value: string) => void;
  minRows: number;
  maxRows?: number;
  language?: string;
  onFormat?: () => void;
  formatDisabled?: boolean;
  formatAriaLabel?: string;
  showFormatAction?: boolean;
  fullscreenTitle?: string;
  fullHeight?: boolean;
  resetKey?: string;
};

const formatShortcutLabel = "Shift+Alt+F";
const fullscreenShortcutLabel = "F11";
const exitFullscreenShortcutLabel = "Esc";

/** Renders the shared CodeMirror 6 editor used across Layang code-editing surfaces. */
export function CodeTextField({
  value,
  onChange,
  onDraftChange,
  buffered = true,
  commitDelayMs = 0,
  onBlur,
  minRows,
  maxRows,
  language = "json",
  onFormat,
  formatDisabled = false,
  formatAriaLabel = "Format code",
  showFormatAction = true,
  fullscreenTitle,
  fullHeight = false,
  resetKey,
}: CodeTextFieldProps) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const editorRef = useRef<LayangCodeEditorHandle | null>(null);
  const helpTextId = useId();
  const formatTooltip = `${formatAriaLabel} (${formatShortcutLabel})`;
  const fullscreenTooltip = fullscreenOpen
    ? `Exit full screen editor (${fullscreenShortcutLabel})`
    : `Open full screen editor (${fullscreenShortcutLabel})`;
  const codeEditorAriaLabel = `${language} code editor. Press Tab to indent, Shift+Tab to unindent, Ctrl+F to search, ${formatShortcutLabel} to format, ${fullscreenShortcutLabel} to toggle full screen, and ${exitFullscreenShortcutLabel} to close full screen.`;

  function handleFormat() {
    if (formatDisabled) return;
    if (onFormat) {
      onFormat();
      return;
    }
    const currentValue = editorRef.current?.getValue() ?? value;
    const nextValue = formatEditorValue(currentValue, language);
    if (nextValue !== currentValue) editorRef.current?.replaceDocument(nextValue);
  }

  function changeFullscreen(nextOpen: boolean) {
    setFullscreenOpen(nextOpen);
  }

  function renderEditor({ fullscreen = false }: { fullscreen?: boolean } = {}) {
    const describedById = fullscreen ? `${helpTextId}-fullscreen` : helpTextId;
    const shouldFillHeight = fullscreen || fullHeight;
    return (
      <Box
        className="code-editor-selectable code-editor"
        onPointerDown={(event: ReactPointerEvent<HTMLElement>) => event.stopPropagation()}
        onPointerUp={(event: ReactPointerEvent<HTMLElement>) => event.stopPropagation()}
        onMouseDown={(event: ReactMouseEvent<HTMLElement>) => event.stopPropagation()}
        onMouseUp={(event: ReactMouseEvent<HTMLElement>) => event.stopPropagation()}
        onClick={(event: ReactMouseEvent<HTMLElement>) => event.stopPropagation()}
        onDoubleClick={(event: ReactMouseEvent<HTMLElement>) => event.stopPropagation()}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 0,
          overflow: "hidden",
          bgcolor: "background.default",
          boxShadow: "inset 0 1px 0 rgba(148, 163, 184, 0.08)",
          ...(shouldFillHeight
            ? {
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                height: "100%",
                flex: "1 1 auto",
                width: "100%",
                minWidth: 0,
                alignSelf: "stretch",
              }
            : { width: "100%", minWidth: 0 }),
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            px: 1,
            py: 0.45,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            gap: 0.75,
            flexShrink: 0,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            {language}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={0.35} sx={{ flexShrink: 0 }}>
            {showFormatAction ? (
              <Tooltip title={formatTooltip}>
                <span>
                  <IconButton
                    size="small"
                    aria-label={formatTooltip}
                    aria-keyshortcuts="Alt+Shift+F"
                    title={formatTooltip}
                    onClick={handleFormat}
                    disabled={formatDisabled}
                    sx={{ width: 26, height: 26 }}
                  >
                    <Edit sx={{ fontSize: 14 }} />
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
            <Tooltip title={fullscreenTooltip}>
              <IconButton
                size="small"
                aria-label={fullscreenTooltip}
                aria-keyshortcuts="F11"
                title={fullscreenTooltip}
                onClick={() => changeFullscreen(!fullscreenOpen)}
                sx={{ width: 26, height: 26 }}
              >
                <DesktopWindows sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <span
          id={describedById}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          Code editor. Use Tab and Shift+Tab for indentation, Ctrl+F for search, Shift+Alt+F to format, F11 to toggle full screen, and Escape to close full screen.
        </span>
        <LayangCodeEditor
          ref={editorRef}
          value={value}
          onChange={onChange}
          onDraftChange={onDraftChange}
          buffered={buffered}
          commitDelayMs={commitDelayMs}
          onBlur={onBlur}
          language={language}
          ariaLabel={codeEditorAriaLabel}
          ariaDescribedBy={describedById}
          minRows={minRows}
          maxRows={maxRows}
          fullHeight={shouldFillHeight}
          resetKey={resetKey}
          onFormatRequest={showFormatAction && !formatDisabled ? handleFormat : undefined}
          onToggleFullscreen={() => changeFullscreen(!fullscreenOpen)}
          onExitFullscreen={fullscreen ? () => changeFullscreen(false) : undefined}
          className="response-selectable"
          style={{ flex: shouldFillHeight ? "1 1 auto" : undefined }}
        />
      </Box>
    );
  }

  return (
    <>
      {!fullscreenOpen ? renderEditor() : null}
      <Dialog open={fullscreenOpen} onClose={() => changeFullscreen(false)} fullScreen>
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <span>{fullscreenTitle ?? `${language.toUpperCase()} editor`}</span>
          <Tooltip title="Close full screen editor (Esc or F11)">
            <IconButton
              size="small"
              aria-label="Close full screen editor (Esc or F11)"
              title="Close full screen editor (Esc or F11)"
              onClick={() => changeFullscreen(false)}
            >
              <Close sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent
          sx={{
            p: 1.2,
            display: "flex",
            flex: "1 1 auto",
            width: "100%",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {renderEditor({ fullscreen: true })}
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatEditorValue(value: string, language: string) {
  const normalizedLanguage = language.toLowerCase();
  if (normalizedLanguage === "json" || normalizedLanguage === "jsonc") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return stripTrailingEditorWhitespace(value);
    }
  }

  return stripTrailingEditorWhitespace(value);
}

function stripTrailingEditorWhitespace(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n");
}

/** Renders protobuf field metadata for a request or response type. */
export function SchemaTable({
  title,
  typeName,
  fields,
}: {
  title: string;
  typeName?: string;
  fields: ReturnType<typeof listMessageFields>;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={0.7} alignItems="center" sx={{ mb: 0.55, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontSize: 13, lineHeight: 1.2 }}>
          {title}
        </Typography>
        {typeName && <Chip label={typeName} size="small" variant="outlined" />}
      </Stack>
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1, overflow: "hidden" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ py: 0.65, fontSize: 11, color: "text.secondary" }}>Field</TableCell>
              <TableCell sx={{ py: 0.65, fontSize: 11, color: "text.secondary" }}>Type</TableCell>
              <TableCell sx={{ width: 58, py: 0.65, fontSize: 11, color: "text.secondary" }}>No.</TableCell>
              <TableCell sx={{ py: 0.65, fontSize: 11, color: "text.secondary" }}>Rule</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} sx={{ py: 1, fontSize: 12, color: "text.secondary" }}>
                  No fields.
                </TableCell>
              </TableRow>
            ) : (
              fields.map((field: ReturnType<typeof listMessageFields>[number]) => (
                <TableRow key={`${field.name}-${field.id}`}>
                  <TableCell sx={{ py: 0.65, fontFamily: "monospace", fontSize: 11.5 }}>{field.name}</TableCell>
                  <TableCell sx={{ py: 0.65, fontFamily: "monospace", fontSize: 11.5, wordBreak: "break-word" }}>
                    {field.type}
                  </TableCell>
                  <TableCell sx={{ py: 0.65, fontSize: 11.5 }}>{field.id}</TableCell>
                  <TableCell sx={{ py: 0.65 }}>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {field.repeated && <Chip label="repeated" size="small" />}
                      {field.map && <Chip label="map" size="small" />}
                      {field.required && <Chip label="required" size="small" color="warning" />}
                      {field.oneof && <Chip label={field.oneof} size="small" />}
                      {!field.repeated && !field.map && !field.required && !field.oneof && (
                        <Typography variant="caption" color="text.secondary">
                          -
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
