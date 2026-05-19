"use client";

import { type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, useId, useMemo, useState } from "react";

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
import { designSystem } from "../../design-system";

type CodeTextFieldProps = {
  value: string;
  onChange: (value: string) => void;
  minRows: number;
  maxRows?: number;
  language?: string;
  onFormat?: () => void;
  formatDisabled?: boolean;
  formatAriaLabel?: string;
  fullscreenTitle?: string;
};

const editorIndent = "  ";
const editorLineHeightPx = 21;
const editorPaddingYPx = 10;
const formatShortcutLabel = "Shift+Alt+F";
const fullscreenShortcutLabel = "F11";
const quoteWrapShortcutLabel = "' or \" with selected text";
const exitFullscreenShortcutLabel = "Esc";

/** Renders a lightweight code editor with line numbers, current-line highlight, and undoable Tab indentation. */
export function CodeTextField({
  value,
  onChange,
  minRows,
  maxRows,
  language = "json",
  onFormat,
  formatDisabled = false,
  formatAriaLabel = "Format code",
  fullscreenTitle,
}: CodeTextFieldProps) {
  const [activeLine, setActiveLine] = useState(0);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const helpTextId = useId();
  const formatTooltip = `${formatAriaLabel} (${formatShortcutLabel})`;
  const fullscreenTooltip = fullscreenOpen
    ? `Exit full screen editor (${fullscreenShortcutLabel})`
    : `Open full screen editor (${fullscreenShortcutLabel})`;
  const codeEditorAriaLabel = `${language} code editor. Press Tab to insert 2 spaces, Shift+Tab to unindent, ${formatShortcutLabel} to format, ${fullscreenShortcutLabel} to toggle full screen, ${exitFullscreenShortcutLabel} to close full screen, and ${quoteWrapShortcutLabel} to wrap a selection.`;
  const lineCount = Math.max(1, value.split("\n").length);
  const visualRows = Math.max(minRows, lineCount);
  const maxHeight = maxRows ? maxRows * editorLineHeightPx + editorPaddingYPx * 2 : undefined;
  const minHeight = minRows * editorLineHeightPx + editorPaddingYPx * 2;
  const contentHeight = visualRows * editorLineHeightPx + editorPaddingYPx * 2;
  const lineNumbers = useMemo(
    () => Array.from({ length: visualRows }, (_, index) => (index < lineCount ? String(index + 1) : "")).join("\n"),
    [lineCount, visualRows],
  );

  function updateActiveLine(textarea: HTMLTextAreaElement, sourceValue = value) {
    const cursor = textarea.selectionStart ?? 0;
    const nextLine = sourceValue.slice(0, cursor).split("\n").length - 1;
    setActiveLine(Math.max(0, nextLine));
  }

  function restoreSelection(textarea: HTMLTextAreaElement, start: number, end: number) {
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, end);
    });
  }

  function handleFormat() {
    if (formatDisabled) return;
    if (onFormat) {
      onFormat();
      return;
    }

    const nextValue = formatEditorValue(value, language);
    if (nextValue !== value) onChange(nextValue);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    const key = event.key.toLowerCase();
    if (event.shiftKey && event.altKey && !event.ctrlKey && !event.metaKey && key === "f") {
      event.preventDefault();
      event.stopPropagation();
      handleFormat();
      return;
    }

    if (event.key === fullscreenShortcutLabel) {
      event.preventDefault();
      event.stopPropagation();
      setFullscreenOpen((current) => !current);
      return;
    }

    if (fullscreenOpen && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setFullscreenOpen(false);
      return;
    }

    const textarea = event.currentTarget;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;

    if (!event.ctrlKey && !event.metaKey && !event.altKey && start !== end && isEditorQuoteKey(event.key)) {
      event.preventDefault();
      const edit = wrapEditorSelection(value, start, end, event.key);
      applyUndoableTextareaEdit(textarea, edit, onChange);
      updateActiveLine(textarea, textarea.value);
      restoreSelection(textarea, edit.selectionStart, edit.selectionEnd);
      return;
    }

    if (event.key !== "Tab") return;
    event.preventDefault();

    const edit = event.shiftKey ? unindentEditorSelection(value, start, end) : indentEditorSelection(value, start, end);
    if (!edit) return;
    applyUndoableTextareaEdit(textarea, edit, onChange);
    updateActiveLine(textarea, textarea.value);
    restoreSelection(textarea, edit.selectionStart, edit.selectionEnd);
  }

  function renderEditor({ fullscreen = false }: { fullscreen?: boolean } = {}) {
    const describedById = fullscreen ? `${helpTextId}-fullscreen` : helpTextId;
    const editorMaxHeight = fullscreen ? undefined : maxHeight;
    const editorMinHeight = fullscreen ? Math.max(minHeight, 420) : minHeight;
    const editorHeight = fullscreen ? "calc(100vh - 160px)" : maxRows ? undefined : contentHeight;
    return (
      <Box
        className="code-editor-selectable code-editor"
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 0,
          overflow: "hidden",
          bgcolor: "background.default",
          boxShadow: "inset 0 1px 0 rgba(148, 163, 184, 0.08)",
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
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
              Tab = 2 spaces
            </Typography>
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
            <Tooltip title={fullscreenTooltip}>
              <IconButton
                size="small"
                aria-label={fullscreenTooltip}
                aria-keyshortcuts="F11"
                title={fullscreenTooltip}
                onClick={() => setFullscreenOpen((current) => !current)}
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
          Press Tab for 2 spaces, Shift+Tab to unindent, Shift+Alt+F to format, F11 to toggle full screen, Esc to close full screen, and quote keys to wrap selected text.
        </span>
        <div
          className="response-selectable code-editor__body"
          style={{
            display: "flex",
            minHeight: editorMinHeight,
            maxHeight: editorMaxHeight,
            height: editorHeight,
            overflow: "auto",
            resize: fullscreen ? "none" : "vertical",
            background: "var(--background)",
          }}
        >
          <pre
            aria-hidden="true"
            className="code-editor__gutter"
            style={{
              minHeight: fullscreen ? "100%" : contentHeight,
              margin: 0,
              padding: `${editorPaddingYPx}px 9px ${editorPaddingYPx}px 10px`,
              borderRight: "1px solid var(--border)",
              background: "var(--muted)",
              color: "var(--muted-foreground)",
              fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
              fontSize: designSystem.font.mono,
              lineHeight: `${editorLineHeightPx}px`,
              textAlign: "right",
              userSelect: "none",
            }}
          >
            {lineNumbers}
          </pre>
          <div
            className="code-editor__code-pane"
            style={{
              flex: "1 1 auto",
              minWidth: 0,
              minHeight: fullscreen ? "100%" : contentHeight,
              position: "relative",
            }}
          >
            <div
              aria-hidden="true"
              className="code-editor__active-line"
              style={{
                top: editorPaddingYPx + Math.min(activeLine, visualRows - 1) * editorLineHeightPx,
                height: editorLineHeightPx,
              }}
            />
            <textarea
              value={value}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                onChange(event.target.value);
                updateActiveLine(event.target, event.target.value);
              }}
              onClick={(event) => updateActiveLine(event.currentTarget)}
              onKeyUp={(event) => updateActiveLine(event.currentTarget)}
              onSelect={(event) => updateActiveLine(event.currentTarget)}
              onKeyDown={handleKeyDown}
              aria-label={codeEditorAriaLabel}
              aria-describedby={describedById}
              aria-keyshortcuts="Tab Shift+Tab Alt+Shift+F F11 Escape ' &quot;"
              title={codeEditorAriaLabel}
              spellCheck={false}
              rows={visualRows}
              className="code-editor__textarea"
              style={{
                width: "100%",
                minWidth: 0,
                minHeight: fullscreen ? "100%" : contentHeight,
                margin: 0,
                padding: `${editorPaddingYPx}px 12px`,
                border: 0,
                outline: 0,
                resize: "none",
                overflow: fullscreen ? "auto" : "hidden",
                background: "transparent",
                color: "var(--foreground)",
                fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                fontSize: designSystem.font.mono,
                lineHeight: `${editorLineHeightPx}px`,
                tabSize: 2,
                whiteSpace: "pre",
                position: "relative",
                zIndex: 1,
              }}
            />
          </div>
        </div>
      </Box>
    );
  }

  return (
    <>
      {renderEditor()}
      <Dialog open={fullscreenOpen} onClose={() => setFullscreenOpen(false)} fullWidth maxWidth="calc(100vw - 32px)">
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
            <IconButton size="small" aria-label="Close full screen editor (Esc or F11)" title="Close full screen editor (Esc or F11)" onClick={() => setFullscreenOpen(false)}>
              <Close sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent sx={{ p: 1.2 }}>
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

type TextareaEdit = {
  replaceStart: number;
  replaceEnd: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
};


function isEditorQuoteKey(key: string): key is "'" | '"' {
  return key === "'" || key === '"';
}

function wrapEditorSelection(value: string, start: number, end: number, quote: "'" | '"'): TextareaEdit {
  const selectedText = value.slice(start, end);
  return {
    replaceStart: start,
    replaceEnd: end,
    text: `${quote}${selectedText}${quote}`,
    selectionStart: start + quote.length,
    selectionEnd: end + quote.length,
  };
}

function indentEditorSelection(value: string, start: number, end: number): TextareaEdit {
  if (start === end) {
    return {
      replaceStart: start,
      replaceEnd: end,
      text: editorIndent,
      selectionStart: start + editorIndent.length,
      selectionEnd: start + editorIndent.length,
    };
  }

  const { blockStart, blockEnd } = getSelectedLineBlock(value, start, end);
  const block = value.slice(blockStart, blockEnd);
  const lines = block.split("\n");
  const nextBlock = lines.map((line) => `${editorIndent}${line}`).join("\n");
  const added = editorIndent.length * lines.length;
  return {
    replaceStart: blockStart,
    replaceEnd: blockEnd,
    text: nextBlock,
    selectionStart: start + editorIndent.length,
    selectionEnd: end + added,
  };
}

function unindentEditorSelection(value: string, start: number, end: number): TextareaEdit | null {
  const { blockStart, blockEnd } = getSelectedLineBlock(value, start, end);
  const block = value.slice(blockStart, blockEnd);
  const lines = block.split("\n");
  let removedBeforeStart = 0;
  let removedBeforeEnd = 0;
  let removedTotal = 0;
  let offset = 0;
  const relativeStart = start - blockStart;
  const relativeEnd = end - blockStart;
  const nextLines = lines.map((line) => {
    const removeLength = line.startsWith(editorIndent) ? editorIndent.length : line.startsWith("\t") ? 1 : 0;
    const lineStart = offset;
    offset += line.length + 1;
    if (!removeLength) return line;
    removedTotal += removeLength;
    if (lineStart < relativeStart) removedBeforeStart += Math.min(removeLength, relativeStart - lineStart);
    if (lineStart < relativeEnd) removedBeforeEnd += Math.min(removeLength, relativeEnd - lineStart);
    return line.slice(removeLength);
  });

  if (removedTotal === 0) return null;

  return {
    replaceStart: blockStart,
    replaceEnd: blockEnd,
    text: nextLines.join("\n"),
    selectionStart: Math.max(blockStart, start - removedBeforeStart),
    selectionEnd: Math.max(blockStart, end - removedBeforeEnd),
  };
}

function applyUndoableTextareaEdit(
  textarea: HTMLTextAreaElement,
  edit: TextareaEdit,
  onChange: (value: string) => void,
) {
  textarea.focus();
  textarea.setSelectionRange(edit.replaceStart, edit.replaceEnd);

  let appliedWithUndo = false;
  try {
    appliedWithUndo = document.execCommand?.("insertText", false, edit.text) ?? false;
  } catch {
    appliedWithUndo = false;
  }

  if (!appliedWithUndo) {
    textarea.setRangeText(edit.text, edit.replaceStart, edit.replaceEnd, "end");
    dispatchTextareaInput(textarea, edit.text);
  }

  onChange(textarea.value);
}

function dispatchTextareaInput(textarea: HTMLTextAreaElement, data: string) {
  try {
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data, inputType: "insertText" }));
  } catch {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function getSelectedLineBlock(value: string, start: number, end: number) {
  const blockStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const adjustedEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextLineBreak = value.indexOf("\n", adjustedEnd);
  const blockEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  return { blockStart, blockEnd };
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
    <Box>
      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 0.8 }}>
        <Typography variant="subtitle1">{title}</Typography>
        {typeName && <Chip label={typeName} size="small" variant="outlined" />}
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Field</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>No.</TableCell>
              <TableCell>Rules</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>No fields available.</TableCell>
              </TableRow>
            ) : (
              fields.map((field: ReturnType<typeof listMessageFields>[number]) => (
                <TableRow key={`${field.name}-${field.id}`}>
                  <TableCell sx={{ fontFamily: "monospace" }}>{field.name}</TableCell>
                  <TableCell sx={{ fontFamily: "monospace" }}>{field.type}</TableCell>
                  <TableCell>{field.id}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {field.repeated && <Chip label="repeated" size="small" />}
                      {field.map && <Chip label="map" size="small" />}
                      {field.required && <Chip label="required" size="small" color="warning" />}
                      {field.oneof && <Chip label={`oneof: ${field.oneof}`} size="small" />}
                      {!field.repeated && !field.map && !field.required && !field.oneof && (
                        <Typography variant="caption" color="text.secondary">
                          optional
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
