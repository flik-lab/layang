"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { ContentCopy, History, PlayArrow, StopCircle, Terminal } from "@/components/shadcn/icons";
import { Box, Button, IconButton, Stack, Tooltip, Typography } from "@/components/shadcn/compat";
import { WorkbenchTabs } from "@/components/ui/workbench";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import {
  clearCliHistory,
  readCliHistory,
  recordCliHistory,
  subscribeCliHistory,
  type CliHistoryEntry,
} from "./cli-command-history";

type CliOutputLine = { id: string; stream: "command" | "stdout" | "stderr" | "system"; text: string };

const ANSI_ESCAPE_PATTERN = new RegExp(
  ["\\u001B(?:\\[[0-?]*[ -/]*[@-~]", "|\\].*?(?:\\u0007|\\u001B\\\\))"].join(""),
  "g",
);

function cleanCliOutputChunk(text: string) {
  return String(text ?? "")
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

type Props = {
  open: boolean;
  height: number;
  minHeight?: number;
  maxHeight?: number;
  shellLeft: number;
  statusbarHeight: number;
  workspacePath: string;
  onClose: () => void;
  onHeightChange: (height: number) => void;
};

export function CliTerminalPanel({
  open,
  height,
  minHeight = 160,
  maxHeight = 560,
  shellLeft,
  statusbarHeight,
  workspacePath,
  onClose,
  onHeightChange,
}: Props) {
  const [tab, setTab] = useState<"terminal" | "history">("terminal");
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState("");
  const [lines, setLines] = useState<CliOutputLine[]>([
    { id: "welcome", stream: "system", text: "Layang CLI · type `help` or `--help` to inspect commands." },
  ]);
  const [history, setHistory] = useState<CliHistoryEntry[]>([]);
  const [historyCursor, setHistoryCursor] = useState(-1);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const outputRemainderRef = useRef<Record<"stdout" | "stderr", string>>({ stdout: "", stderr: "" });

  const terminalHistory = useMemo(() => history.filter((entry) => entry.source === "terminal"), [history]);
  const guiHistory = useMemo(() => history.filter((entry) => entry.source === "gui"), [history]);

  useEffect(() => {
    const refresh = () => setHistory(readCliHistory(workspacePath));
    refresh();
    const unsubscribeHistory = subscribeCliHistory(refresh);
    const unsubscribeGui = window.electronCli?.onGuiCommand?.((entry) => {
      recordCliHistory({
        source: "gui",
        command: entry.command,
        label: entry.label,
        createdAt: entry.createdAt,
        workspacePath,
        replayable: entry.replayable !== false,
      });
    });
    return () => {
      unsubscribeHistory();
      unsubscribeGui?.();
    };
  }, [workspacePath]);

  useEffect(() => {
    if (!open || tab !== "terminal") return;
    const element = outputRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines, open, tab]);

  if (!open) return null;

  const append = (stream: CliOutputLine["stream"], text: string) => {
    const cleaned = cleanCliOutputChunk(text);
    if (!cleaned) return;

    if (stream === "stdout" || stream === "stderr") {
      const buffered = `${outputRemainderRef.current[stream]}${cleaned}`;
      const parts = buffered.split("\n");
      outputRemainderRef.current[stream] = parts.pop() ?? "";
      if (!parts.length) return;
      const nextLines = parts.map((part, index) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${index}`,
        stream,
        text: part.length ? part : " ",
      }));
      setLines((current) => [...current, ...nextLines].slice(-800));
      return;
    }

    const nextLines = cleaned.split("\n").filter((part) => part.length > 0).map((part, index) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${index}`,
      stream,
      text: part,
    }));
    if (nextLines.length) setLines((current) => [...current, ...nextLines].slice(-800));
  };

  const flushOutputRemainders = () => {
    const pending = (["stdout", "stderr"] as const).flatMap((stream) => {
      const text = outputRemainderRef.current[stream];
      outputRemainderRef.current[stream] = "";
      if (!text) return [];
      return [{
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${stream}`,
        stream,
        text,
      } satisfies CliOutputLine];
    });
    if (pending.length) setLines((current) => [...current, ...pending].slice(-800));
  };

  const runCommand = async (input = command) => {
    const trimmed = input.trim();
    if (!trimmed || running) return;
    setTab("terminal");
    setCommand("");
    setHistoryCursor(-1);
    append("command", `❯ ${trimmed}\n`);

    if (trimmed === "clear" || trimmed === "cls") {
      outputRemainderRef.current = { stdout: "", stderr: "" };
      setLines([]);
      return;
    }
    if (trimmed === "history") {
      setTab("history");
      return;
    }
    if (trimmed === "pwd") {
      append("stdout", `${workspacePath || "No workspace folder"}\n`);
      return;
    }
    if (trimmed === "exit") {
      onClose();
      return;
    }

    if (!window.electronCli?.run) {
      append("stderr", "Integrated CLI is available in the Layang desktop app.\n");
      recordCliHistory({ source: "terminal", command: trimmed, workspacePath, exitCode: 1 });
      return;
    }

    const runId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setRunning(true);
    setActiveRunId(runId);
    let result: { ok?: boolean; code?: number; error?: string } | undefined;
    try {
      result = await window.electronCli.run({ command: trimmed, workspacePath, runId }, (event) => {
        if (event.type === "stdout") append("stdout", event.data);
        else if (event.type === "stderr") append("stderr", event.data);
      });
      if (result?.error) append("stderr", `${result.error}\n`);
    } catch (error) {
      append("stderr", `${error instanceof Error ? error.message : String(error)}\n`);
      result = { ok: false, code: 1 };
    } finally {
      flushOutputRemainders();
      append("system", `[exit ${result?.code ?? (result?.ok ? 0 : 1)}]\n`);
      setRunning(false);
      setActiveRunId("");
      recordCliHistory({
        source: "terminal",
        command: trimmed.startsWith("layang ") ? trimmed : `layang ${trimmed}`,
        workspacePath,
        exitCode: result?.code ?? (result?.ok ? 0 : 1),
      });
    }
  };

  const cancelRun = async () => {
    if (!activeRunId) return;
    await window.electronCli?.cancel?.(activeRunId);
    append("system", "^C stopping active CLI process…\n");
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void runCommand();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (!terminalHistory.length) return;
    event.preventDefault();
    const nextCursor =
      event.key === "ArrowUp"
        ? Math.min(historyCursor + 1, terminalHistory.length - 1)
        : Math.max(historyCursor - 1, -1);
    setHistoryCursor(nextCursor);
    const entry = nextCursor >= 0 ? terminalHistory[nextCursor] : null;
    setCommand(entry ? entry.command.replace(/^layang\s+/, "") : "");
  };

  const beginResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const viewportMax = Math.max(minHeight, Math.min(maxHeight, Math.floor(window.innerHeight * 0.65)));
    const move = (moveEvent: MouseEvent) => {
      const next = Math.max(minHeight, Math.min(viewportMax, startHeight + startY - moveEvent.clientY));
      onHeightChange(next);
    };
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };

  return (
    <Box
      component="section"
      aria-label="Layang CLI terminal"
      sx={{
        position: "fixed",
        left: shellLeft,
        right: 0,
        bottom: statusbarHeight,
        height,
        minHeight,
        maxHeight: `min(${maxHeight}px, 65vh)`,
        zIndex: 1250,
        bgcolor: "background.default",
        borderTop: "1px solid var(--border-strong)",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 -10px 28px rgba(0, 0, 0, 0.12)",
      }}
    >
      <Box
        role="separator"
        aria-orientation="horizontal"
        onMouseDown={beginResize}
        sx={{ position: "absolute", top: -3, left: 0, right: 0, height: 6, cursor: "ns-resize", zIndex: 2 }}
      />
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.6}
        sx={{ height: 30, minHeight: 30, px: 0.75, borderBottom: "1px solid var(--border-strong)" }}
      >
        <Terminal sx={{ fontSize: 14 }} />
        <Typography variant="caption" fontWeight={600} sx={{ letterSpacing: "0.06em" }}>
          TERMINAL
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary" noWrap title={workspacePath || undefined}>
          {workspacePath ? `cwd · ${workspacePath}` : "No workspace folder"}
        </Typography>
        {running ? (
          <Tooltip title="Stop active CLI process">
            <IconButton size="small" aria-label="Stop active CLI process" onClick={() => void cancelRun()}>
              <StopCircle sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        ) : null}
        <Tooltip title="Close terminal (Ctrl+`)">
          <Button size="small" variant="text" onClick={onClose} sx={{ minWidth: 28, px: 0.5 }}>
            ×
          </Button>
        </Tooltip>
      </Stack>
      <WorkbenchTabs
        value={tab}
        items={[
          { value: "terminal", label: "Terminal" },
          { value: "history", label: "GUI → CLI History", count: guiHistory.length },
        ]}
        onValueChange={setTab}
        idPrefix="cli-panel"
        ariaLabel="CLI panel sections"
        variant="underline"
      />

      {tab === "terminal" ? (
        <Box
          role="tabpanel"
          id="cli-panel-panel-terminal"
          aria-labelledby="cli-panel-tab-terminal"
          tabIndex={0}
          sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          <Box
            ref={outputRef}
            className="response-selectable"
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              p: 1,
              fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
              fontSize: 11.5,
              lineHeight: "20px",
              fontVariantLigatures: "none",
              bgcolor: "var(--code-bg, background.default)",
              userSelect: "text",
            }}
          >
            {lines.map((line) => (
              <Box
                component="div"
                key={line.id}
                sx={{
                  display: "block",
                  m: 0,
                  p: 0,
                  minHeight: "20px",
                  lineHeight: "20px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  color:
                    line.stream === "stderr"
                      ? "error.main"
                      : line.stream === "command"
                        ? "primary.main"
                        : line.stream === "system"
                          ? "text.secondary"
                          : "text.primary",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                }}
              >
                {line.text}
              </Box>
            ))}
          </Box>
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.6}
            sx={{ minHeight: 36, px: 0.8, borderTop: "1px solid var(--border-strong)" }}
          >
            <Typography
              component="span"
              sx={{ color: "primary.main", fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: 12 }}
            >
              layang ❯
            </Typography>
            <Box
              component="input"
              autoFocus
              aria-label="Layang CLI command"
              value={command}
              disabled={running}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setCommand(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="run --request 'Get user'  ·  mock:status  ·  schemas"
              sx={{
                minWidth: 0,
                flex: 1,
                height: 28,
                border: 0,
                outline: 0,
                bgcolor: "transparent",
                color: "text.primary",
                fontFamily: '"Cascadia Code", Consolas, monospace',
                fontSize: 11.5,
              }}
            />
            <Tooltip title="Run command">
              <span>
                <IconButton
                  size="small"
                  aria-label="Run CLI command"
                  disabled={!command.trim() || running}
                  onClick={() => void runCommand()}
                >
                  <PlayArrow sx={{ fontSize: 15 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Box>
      ) : (
        <Box
          role="tabpanel"
          id="cli-panel-panel-history"
          aria-labelledby="cli-panel-tab-history"
          tabIndex={0}
          sx={{ flex: 1, minHeight: 0, overflow: "auto" }}
        >
          <Stack
            direction="row"
            alignItems="center"
            sx={{ minHeight: 36, px: 1, borderBottom: "1px solid var(--border-strong)" }}
          >
            <History sx={{ fontSize: 14 }} />
            <Typography variant="caption" sx={{ ml: 0.7, flex: 1 }}>
              Replayable Layang CLI equivalents generated from GUI actions.
            </Typography>
            <Button size="small" variant="text" onClick={() => clearCliHistory(workspacePath, "gui")}>
              Clear GUI history
            </Button>
          </Stack>
          {!guiHistory.length ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 1.2 }}>
              No GUI → CLI history yet. Run a request, mock, schema, or Git action from the GUI to populate it.
            </Typography>
          ) : (
            guiHistory.map((entry) => (
              <Stack
                key={entry.id}
                direction="row"
                spacing={0.7}
                alignItems="center"
                sx={{ px: 1, py: 0.7, borderBottom: "1px solid", borderColor: "divider" }}
              >
                <Typography
                  variant="caption"
                  sx={{ width: 62, flexShrink: 0, color: entry.source === "gui" ? "primary.main" : "text.secondary" }}
                >
                  {entry.source === "gui" ? "GUI" : "CLI"}
                </Typography>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    component="div"
                    sx={{ fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: 11.5, overflowWrap: "anywhere" }}
                  >
                    {entry.command}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {entry.label || new Date(entry.createdAt).toLocaleString()}
                    {entry.exitCode !== undefined ? ` · exit ${entry.exitCode}` : ""}
                  </Typography>
                </Box>
                <Tooltip title="Copy command">
                  <IconButton
                    size="small"
                    aria-label="Copy CLI command"
                    onClick={() => void copyTextWithAnnouncement(entry.command, "CLI command copied")}
                  >
                    <ContentCopy sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
                <Button
                  size="small"
                  variant="text"
                  disabled={running}
                  onClick={() => {
                    setCommand(entry.command.replace(/^layang\s+/, ""));
                    setTab("terminal");
                  }}
                >
                  Use
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={entry.replayable === false || running}
                  onClick={() => void runCommand(entry.command.replace(/^layang\s+/, ""))}
                >
                  Run
                </Button>
              </Stack>
            ))
          )}
        </Box>
      )}
    </Box>
  );
}
