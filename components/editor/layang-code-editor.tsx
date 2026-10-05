"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from "react";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  StreamLanguage,
  indentUnit,
  syntaxHighlighting,
  type StreamParser,
} from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder as codeMirrorPlaceholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export type LayangCodeEditorLanguage =
  | "json"
  | "jsonc"
  | "yaml"
  | "yml"
  | "javascript"
  | "js"
  | "typescript"
  | "ts"
  | "markdown"
  | "md"
  | "proto"
  | "protobuf"
  | "text"
  | string;

export type LayangCodeEditorHandle = {
  focus: () => void;
  getValue: () => string;
  getSelection: () => { from: number; to: number };
  replaceDocument: (value: string) => void;
  replaceRange: (from: number, to: number, value: string, selection?: { anchor: number; head?: number }) => void;
  setSelection: (anchor: number, head?: number) => void;
};

type LayangCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onDraftChange?: (value: string) => void;
  onBlur?: (value: string) => void;
  language?: LayangCodeEditorLanguage;
  ariaLabel: string;
  ariaDescribedBy?: string;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  fullHeight?: boolean;
  resetKey?: string;
  buffered?: boolean;
  commitDelayMs?: number;
  readOnly?: boolean;
  lineWrapping?: boolean;
  onFormatRequest?: () => void;
  onToggleFullscreen?: () => void;
  onExitFullscreen?: () => void;
  className?: string;
  style?: CSSProperties;
};

type SavedEditorViewState = {
  anchor: number;
  head: number;
  scrollTop: number;
  scrollLeft: number;
};

const editorViewStateByKey = new Map<string, SavedEditorViewState>();
const editorLineHeightPx = 21;
const editorPaddingYPx = 10;

const protoKeywords = new Set([
  "syntax",
  "package",
  "import",
  "public",
  "weak",
  "option",
  "message",
  "enum",
  "service",
  "rpc",
  "returns",
  "stream",
  "repeated",
  "optional",
  "required",
  "oneof",
  "map",
  "reserved",
  "extensions",
  "extend",
  "to",
  "max",
  "group",
]);

const protoScalarTypes = new Set([
  "double",
  "float",
  "int32",
  "int64",
  "uint32",
  "uint64",
  "sint32",
  "sint64",
  "fixed32",
  "fixed64",
  "sfixed32",
  "sfixed64",
  "bool",
  "string",
  "bytes",
]);

type ProtoStreamState = { blockComment: boolean };

const protoParser: StreamParser<ProtoStreamState> = {
  startState: () => ({ blockComment: false }),
  token(stream, state) {
    if (state.blockComment) {
      while (!stream.eol()) {
        if (stream.match("*/")) {
          state.blockComment = false;
          break;
        }
        stream.next();
      }
      return "comment";
    }

    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.blockComment = true;
      while (!stream.eol()) {
        if (stream.match("*/")) {
          state.blockComment = false;
          break;
        }
        stream.next();
      }
      return "comment";
    }

    const quote = stream.peek();
    if (quote === '"' || quote === "'") {
      stream.next();
      let escaped = false;
      while (!stream.eol()) {
        const char = stream.next();
        if (char === quote && !escaped) break;
        escaped = char === "\\" && !escaped;
        if (char !== "\\") escaped = false;
      }
      return "string";
    }

    if (stream.match(/^-?(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/)) return "number";
    if (stream.match(/^[A-Za-z_][\w]*/)) {
      const word = stream.current();
      if (protoKeywords.has(word)) return "keyword";
      if (protoScalarTypes.has(word)) return "typeName";
      if (word === "true" || word === "false") return "atom";
      return "variableName";
    }
    if (stream.match(/^[=<>+\-*/!]+/)) return "operator";

    stream.next();
    return null;
  },
};

const protoLanguage = StreamLanguage.define(protoParser);

const layangSyntaxHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--code-syntax-keyword)" },
  { tag: tags.propertyName, color: "var(--code-syntax-property)" },
  { tag: tags.variableName, color: "var(--code-syntax-variable)" },
  { tag: tags.function(tags.variableName), color: "var(--code-syntax-function)" },
  { tag: tags.definition(tags.variableName), color: "var(--code-syntax-definition)" },
  { tag: tags.typeName, color: "var(--code-syntax-type)" },
  { tag: tags.string, color: "var(--code-syntax-string)" },
  { tag: tags.number, color: "var(--code-syntax-number)" },
  { tag: [tags.bool, tags.atom], color: "var(--code-syntax-boolean)" },
  { tag: tags.regexp, color: "var(--code-syntax-regexp)" },
  { tag: tags.escape, color: "var(--code-syntax-escape)" },
  { tag: tags.operator, color: "var(--code-syntax-operator)" },
  { tag: tags.punctuation, color: "var(--code-syntax-punctuation)" },
  { tag: tags.meta, color: "var(--code-syntax-meta)" },
  { tag: tags.comment, color: "var(--code-syntax-comment)" },
  { tag: tags.heading, color: "var(--code-syntax-heading)", fontWeight: "600" },
  { tag: tags.link, color: "var(--code-syntax-link)", textDecoration: "underline" },
  { tag: tags.invalid, color: "var(--code-syntax-invalid)", textDecoration: "underline wavy" },
]);

function languageExtension(language: LayangCodeEditorLanguage): Extension {
  switch (String(language || "text").toLowerCase()) {
    case "json":
    case "jsonc":
      return json();
    case "yaml":
    case "yml":
      return yaml();
    case "javascript":
    case "js":
      return javascript();
    case "typescript":
    case "ts":
      return javascript({ typescript: true });
    case "markdown":
    case "md":
      return markdown();
    case "proto":
    case "protobuf":
      return protoLanguage;
    default:
      return [];
  }
}

function editorTheme({ fullHeight, lineWrapping }: { fullHeight: boolean; lineWrapping: boolean }): Extension {
  return EditorView.theme({
    "&": {
      width: "100%",
      height: fullHeight ? "100%" : "auto",
      minWidth: "0",
      minHeight: "100%",
      backgroundColor: "var(--background)",
      color: "var(--code-editor-text, var(--foreground))",
      fontSize: "var(--font-size-mono, 12px)",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      minHeight: "100%",
      overflow: "auto",
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
      lineHeight: `${editorLineHeightPx}px`,
    },
    ".cm-content": {
      minHeight: "100%",
      padding: `${editorPaddingYPx}px 0`,
      caretColor: "var(--code-editor-cursor, var(--foreground))",
      whiteSpace: lineWrapping ? "pre-wrap" : "pre",
    },
    ".cm-line": { padding: "0 12px" },
    ".cm-gutters": {
      minHeight: "100%",
      borderRight: "1px solid var(--border)",
      backgroundColor: "var(--muted)",
      color: "var(--code-editor-gutter-text, var(--muted-foreground))",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 9px 0 10px",
      minWidth: "3ch",
    },
    ".cm-activeLine": { backgroundColor: "var(--code-editor-active-line, rgba(148, 163, 184, 0.1))" },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--code-editor-active-line, rgba(148, 163, 184, 0.1))",
      color: "var(--code-editor-gutter-active, var(--foreground))",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in srgb, var(--primary) 28%, transparent) !important",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--code-editor-cursor, var(--foreground))" },
    ".cm-panels": {
      backgroundColor: "var(--cm-search-panel-bg, var(--card))",
      color: "var(--cm-search-text, var(--foreground))",
      borderColor: "var(--cm-search-panel-border, var(--border))",
    },
    ".cm-panel.cm-search": {
      padding: "8px 10px",
      backgroundColor: "var(--cm-search-panel-bg, var(--card))",
      color: "var(--cm-search-text, var(--foreground))",
      borderBottom: "1px solid var(--cm-search-panel-border, var(--border))",
      fontFamily: '"Segoe UI Variable Text", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
      fontSize: "var(--font-size-control, 12px)",
      lineHeight: "28px",
    },
    ".cm-panel.cm-search .cm-textfield": {
      height: "28px",
      minWidth: "180px",
      margin: "2px 6px 2px 0",
      padding: "0 8px",
      border: "1px solid var(--cm-search-input-border, var(--border))",
      borderRadius: "5px",
      outline: "none",
      backgroundColor: "var(--cm-search-input-bg, var(--background))",
      color: "var(--cm-search-text, var(--foreground))",
      boxShadow: "none",
      verticalAlign: "middle",
    },
    ".cm-panel.cm-search .cm-textfield::placeholder": {
      color: "var(--cm-search-muted, var(--muted-foreground))",
      opacity: "0.9",
    },
    ".cm-panel.cm-search .cm-textfield:focus": {
      borderColor: "var(--cm-search-input-focus, var(--ring))",
      boxShadow: "0 0 0 2px color-mix(in srgb, var(--cm-search-input-focus, var(--ring)) 22%, transparent)",
    },
    // CodeMirror's search extension ships its own base button theme. Style the
    // concrete button element as well as .cm-button so native/default browser
    // button chrome cannot leak through, especially for disabled actions.
    ".cm-panel.cm-search button, .cm-panel.cm-search .cm-button": {
      WebkitAppearance: "none !important",
      appearance: "none !important",
      height: "28px",
      minWidth: "48px",
      margin: "2px 6px 2px 0",
      padding: "0 10px",
      border: "1px solid var(--cm-search-panel-border, var(--border)) !important",
      borderRadius: "5px",
      background: "var(--cm-search-next-bg, var(--secondary)) !important",
      backgroundImage: "none !important",
      backgroundColor: "var(--cm-search-next-bg, var(--secondary)) !important",
      color: "var(--cm-search-next-text, var(--secondary-foreground)) !important",
      boxShadow: "none !important",
      textShadow: "none !important",
      font: "inherit",
      fontWeight: "600",
      lineHeight: "26px",
      verticalAlign: "middle",
      opacity: "1",
    },
    '.cm-panel.cm-search button[name="next"]': {
      borderColor: "var(--cm-search-next-border, var(--ring)) !important",
      background: "var(--cm-search-next-bg, var(--secondary)) !important",
      color: "var(--cm-search-next-text, var(--secondary-foreground)) !important",
    },
    '.cm-panel.cm-search button[name="prev"]': {
      borderColor: "var(--cm-search-prev-border, var(--ring)) !important",
      background: "var(--cm-search-prev-bg, var(--secondary)) !important",
      color: "var(--cm-search-prev-text, var(--secondary-foreground)) !important",
    },
    '.cm-panel.cm-search button[name="select"]': {
      borderColor: "var(--cm-search-all-border, var(--ring)) !important",
      background: "var(--cm-search-all-bg, var(--secondary)) !important",
      color: "var(--cm-search-all-text, var(--secondary-foreground)) !important",
    },
    '.cm-panel.cm-search button[name="replace"]': {
      borderColor: "var(--cm-search-replace-border, var(--ring)) !important",
      background: "var(--cm-search-replace-bg, var(--secondary)) !important",
      color: "var(--cm-search-replace-text, var(--secondary-foreground)) !important",
    },
    '.cm-panel.cm-search button[name="replaceAll"]': {
      borderColor: "var(--cm-search-replace-all-border, var(--ring)) !important",
      background: "var(--cm-search-replace-all-bg, var(--secondary)) !important",
      color: "var(--cm-search-replace-all-text, var(--secondary-foreground)) !important",
    },
    ".cm-panel.cm-search button:hover:not(:disabled), .cm-panel.cm-search .cm-button:hover:not(:disabled)": {
      filter: "brightness(1.16) saturate(1.08)",
    },
    ".cm-panel.cm-search button:focus-visible, .cm-panel.cm-search .cm-button:focus-visible": {
      outline: "2px solid var(--ring) !important",
      outlineOffset: "1px",
    },
    ".cm-panel.cm-search button:disabled, .cm-panel.cm-search .cm-button:disabled": {
      borderColor: "var(--cm-search-panel-border, var(--border)) !important",
      background: "var(--cm-search-disabled-bg, var(--muted)) !important",
      backgroundColor: "var(--cm-search-disabled-bg, var(--muted)) !important",
      color: "var(--cm-search-disabled-text, var(--muted-foreground)) !important",
      opacity: "0.68 !important",
      cursor: "default",
    },
    ".cm-panel.cm-search label": {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      margin: "2px 8px 2px 0",
      color: "var(--foreground)",
      fontWeight: "500",
      lineHeight: "28px",
      whiteSpace: "nowrap",
      verticalAlign: "middle",
    },
    '.cm-panel.cm-search input[type="checkbox"]': {
      width: "15px",
      height: "15px",
      margin: "0",
      accentColor: "var(--cm-search-input-focus, var(--ring))",
      verticalAlign: "middle",
    },
    '.cm-panel.cm-search button[name="close"]': {
      width: "28px",
      minWidth: "28px",
      height: "28px",
      padding: "0",
      border: "0 !important",
      borderRadius: "4px",
      background: "transparent !important",
      backgroundColor: "transparent !important",
      color: "var(--foreground) !important",
      fontSize: "18px",
      lineHeight: "28px",
      opacity: "0.8",
    },
    '.cm-panel.cm-search button[name="close"]:hover': {
      background: "var(--accent) !important",
      backgroundColor: "var(--accent) !important",
      color: "var(--foreground) !important",
      opacity: "1",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      border: "1px solid var(--border)",
    },
  });
}

function clampOffset(value: number, docLength: number) {
  return Math.max(0, Math.min(value, docLength));
}

function saveViewState(view: EditorView | null, resetKey?: string) {
  if (!view || !resetKey) return;
  const selection = view.state.selection.main;
  editorViewStateByKey.set(resetKey, {
    anchor: selection.anchor,
    head: selection.head,
    scrollTop: view.scrollDOM.scrollTop,
    scrollLeft: view.scrollDOM.scrollLeft,
  });
}

export const LayangCodeEditor = forwardRef<LayangCodeEditorHandle, LayangCodeEditorProps>(function LayangCodeEditor(
  {
    value,
    onChange,
    onDraftChange,
    onBlur,
    language = "text",
    ariaLabel,
    ariaDescribedBy,
    placeholder,
    minRows = 6,
    maxRows,
    fullHeight = false,
    resetKey,
    buffered = false,
    commitDelayMs = 0,
    readOnly = false,
    lineWrapping = false,
    onFormatRequest,
    onToggleFullscreen,
    onExitFullscreen,
    className,
    style,
  },
  forwardedRef,
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const pendingCommitRef = useRef<string | null>(null);
  const latestDraftRef = useRef(value);
  const lastEmittedRef = useRef(value);
  const applyingExternalRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onDraftChangeRef = useRef(onDraftChange);
  const onBlurRef = useRef(onBlur);
  const onFormatRequestRef = useRef(onFormatRequest);
  const onToggleFullscreenRef = useRef(onToggleFullscreen);
  const onExitFullscreenRef = useRef(onExitFullscreen);
  const commitDelayRef = useRef(commitDelayMs);
  const bufferedRef = useRef(buffered);

  useEffect(() => {
    onChangeRef.current = onChange;
    onDraftChangeRef.current = onDraftChange;
    onBlurRef.current = onBlur;
    onFormatRequestRef.current = onFormatRequest;
    onToggleFullscreenRef.current = onToggleFullscreen;
    onExitFullscreenRef.current = onExitFullscreen;
    commitDelayRef.current = commitDelayMs;
    bufferedRef.current = buffered;
  }, [buffered, commitDelayMs, onBlur, onChange, onDraftChange, onExitFullscreen, onFormatRequest, onToggleFullscreen]);

  function clearCommitTimer() {
    if (commitTimerRef.current === null) return;
    window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
  }

  function emitChange(nextValue: string) {
    pendingCommitRef.current = null;
    lastEmittedRef.current = nextValue;
    onChangeRef.current(nextValue);
  }

  function flushPending(nextValue = latestDraftRef.current) {
    clearCommitTimer();
    if (pendingCommitRef.current !== null || nextValue !== lastEmittedRef.current) emitChange(nextValue);
  }

  function scheduleCommit(nextValue: string) {
    const delay = bufferedRef.current ? Math.max(0, commitDelayRef.current) : 0;
    if (delay <= 0) {
      emitChange(nextValue);
      return;
    }
    pendingCommitRef.current = nextValue;
    clearCommitTimer();
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      const pending = pendingCommitRef.current;
      if (pending !== null) emitChange(pending);
    }, delay);
  }

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus() {
        viewRef.current?.focus();
      },
      getValue() {
        return viewRef.current?.state.doc.toString() ?? latestDraftRef.current;
      },
      getSelection() {
        const selection = viewRef.current?.state.selection.main;
        if (!selection) return { from: 0, to: 0 };
        return { from: selection.from, to: selection.to };
      },
      replaceDocument(nextValue: string) {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: nextValue } });
      },
      replaceRange(from: number, to: number, insert: string, selection) {
        const view = viewRef.current;
        if (!view) return;
        const docLength = view.state.doc.length;
        const safeFrom = clampOffset(from, docLength);
        const safeTo = clampOffset(Math.max(safeFrom, to), docLength);
        const nextAnchor = selection?.anchor ?? safeFrom + insert.length;
        const nextHead = selection?.head ?? nextAnchor;
        view.dispatch({
          changes: { from: safeFrom, to: safeTo, insert },
          selection: {
            anchor: clampOffset(nextAnchor, docLength - (safeTo - safeFrom) + insert.length),
            head: clampOffset(nextHead, docLength - (safeTo - safeFrom) + insert.length),
          },
          scrollIntoView: true,
        });
        view.focus();
      },
      setSelection(anchor: number, head = anchor) {
        const view = viewRef.current;
        if (!view) return;
        const docLength = view.state.doc.length;
        view.dispatch({
          selection: { anchor: clampOffset(anchor, docLength), head: clampOffset(head, docLength) },
          scrollIntoView: true,
        });
        view.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    latestDraftRef.current = value;
    lastEmittedRef.current = value;
    const saved = resetKey ? editorViewStateByKey.get(resetKey) : undefined;
    const docLength = value.length;
    const selection = saved
      ? {
          anchor: clampOffset(saved.anchor, docLength),
          head: clampOffset(saved.head, docLength),
        }
      : undefined;

    const contentAttributes: Record<string, string> = {
      "aria-label": ariaLabel,
      "aria-multiline": "true",
      spellcheck: "false",
      autocapitalize: "off",
      autocomplete: "off",
    };
    if (ariaDescribedBy) contentAttributes["aria-describedby"] = ariaDescribedBy;

    const shortcutKeymap = keymap.of([
      indentWithTab,
      {
        key: "Shift-Alt-f",
        run: () => {
          onFormatRequestRef.current?.();
          return Boolean(onFormatRequestRef.current);
        },
      },
      {
        key: "F11",
        run: () => {
          onToggleFullscreenRef.current?.();
          return Boolean(onToggleFullscreenRef.current);
        },
      },
      {
        key: "Escape",
        run: () => {
          if (!onExitFullscreenRef.current) return false;
          onExitFullscreenRef.current();
          return true;
        },
      },
    ]);

    const extensions: Extension[] = [
      basicSetup,
      EditorState.tabSize.of(2),
      indentUnit.of("  "),
      languageExtension(language),
      syntaxHighlighting(layangSyntaxHighlightStyle),
      editorTheme({ fullHeight, lineWrapping }),
      shortcutKeymap,
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of(contentAttributes),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || applyingExternalRef.current) return;
        const nextValue = update.state.doc.toString();
        latestDraftRef.current = nextValue;
        onDraftChangeRef.current?.(nextValue);
        scheduleCommit(nextValue);
      }),
      EditorView.domEventHandlers({
        blur(_event, view) {
          const nextValue = view.state.doc.toString();
          latestDraftRef.current = nextValue;
          flushPending(nextValue);
          saveViewState(view, resetKey);
          onBlurRef.current?.(nextValue);
        },
      }),
    ];
    if (lineWrapping) extensions.push(EditorView.lineWrapping);
    if (placeholder) extensions.push(codeMirrorPlaceholder(placeholder));

    const state = EditorState.create({ doc: value, selection, extensions });
    const view = new EditorView({ state, parent: mount });
    viewRef.current = view;

    if (saved) {
      window.requestAnimationFrame(() => {
        if (viewRef.current !== view) return;
        view.scrollDOM.scrollTop = saved.scrollTop;
        view.scrollDOM.scrollLeft = saved.scrollLeft;
      });
    }

    return () => {
      saveViewState(view, resetKey);
      const finalValue = view.state.doc.toString();
      latestDraftRef.current = finalValue;
      flushPending(finalValue);
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [ariaDescribedBy, ariaLabel, fullHeight, language, lineWrapping, placeholder, readOnly, resetKey]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (value === currentValue) {
      lastEmittedRef.current = value;
      return;
    }

    // Ignore the delayed parent echo of a buffered edit while the editor still owns a newer draft.
    if (view.hasFocus && value === lastEmittedRef.current && value !== latestDraftRef.current) return;

    applyingExternalRef.current = true;
    try {
      const selection = view.state.selection.main;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: {
          anchor: clampOffset(selection.anchor, value.length),
          head: clampOffset(selection.head, value.length),
        },
      });
      latestDraftRef.current = value;
      lastEmittedRef.current = value;
    } finally {
      applyingExternalRef.current = false;
    }
  }, [value]);

  const minHeight = Math.max(1, minRows) * editorLineHeightPx + editorPaddingYPx * 2;
  const maxHeight = maxRows ? Math.max(minRows, maxRows) * editorLineHeightPx + editorPaddingYPx * 2 : undefined;
  const lineCount = Math.max(1, value.split("\n").length);
  const visibleRows = maxRows ? Math.min(Math.max(minRows, lineCount), Math.max(minRows, maxRows)) : Math.max(minRows, lineCount);
  const desiredHeight = visibleRows * editorLineHeightPx + editorPaddingYPx * 2;

  return (
    <div
      className={className}
      style={{
        width: "100%",
        minWidth: 0,
        minHeight: fullHeight ? 0 : minHeight,
        height: fullHeight ? "100%" : desiredHeight,
        maxHeight: fullHeight ? undefined : maxHeight,
        overflow: "hidden",
        background: "var(--background)",
        ...style,
      }}
    >
      <div ref={mountRef} style={{ width: "100%", height: "100%", minHeight: "inherit" }} />
    </div>
  );
});
