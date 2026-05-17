"use client";

import { type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, useMemo, useRef, useState } from "react";

import {
  Box,
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
import type { listMessageFields } from "@/lib/example-generator";
import { designSystem } from "../../design-system";

type CodeTextFieldProps = {
  value: string;
  onChange: (value: string) => void;
  minRows: number;
  maxRows?: number;
  language?: string;
};

const editorIndent = "  ";
const editorLineHeightPx = 21;
const editorPaddingYPx = 10;

/** Renders a lightweight code editor with line numbers, current-line highlight, and undoable Tab indentation. */
export function CodeTextField({ value, onChange, minRows, maxRows, language = "json" }: CodeTextFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeLine, setActiveLine] = useState(0);
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

  function restoreSelection(start: number, end: number) {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, end);
    });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Tab") return;
    event.preventDefault();

    const textarea = event.currentTarget;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const edit = event.shiftKey ? unindentEditorSelection(value, start, end) : indentEditorSelection(value, start, end);
    if (!edit) return;
    applyUndoableTextareaEdit(textarea, edit, onChange);
    updateActiveLine(textarea, textarea.value);
    restoreSelection(edit.selectionStart, edit.selectionEnd);
  }

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
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}
        >
          {language}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
          Tab = 2 spaces
        </Typography>
      </Stack>
      <div
        className="response-selectable code-editor__body"
        style={{
          display: "flex",
          minHeight,
          maxHeight,
          height: maxRows ? undefined : contentHeight,
          overflow: "auto",
          resize: "vertical",
          background: "var(--background)",
        }}
      >
        <pre
          aria-hidden="true"
          className="code-editor__gutter"
          style={{
            minHeight: contentHeight,
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
            minHeight: contentHeight,
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
            ref={textareaRef}
            value={value}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              onChange(event.target.value);
              updateActiveLine(event.target, event.target.value);
            }}
            onClick={(event) => updateActiveLine(event.currentTarget)}
            onKeyUp={(event) => updateActiveLine(event.currentTarget)}
            onSelect={(event) => updateActiveLine(event.currentTarget)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            rows={visualRows}
            className="code-editor__textarea"
            style={{
              width: "100%",
              minWidth: 0,
              minHeight: contentHeight,
              margin: 0,
              padding: `${editorPaddingYPx}px 12px`,
              border: 0,
              outline: 0,
              resize: "none",
              overflow: "hidden",
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

type TextareaEdit = {
  replaceStart: number;
  replaceEnd: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

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
