"use client";

export type CliHistorySource = "gui" | "terminal";
export type CliHistoryEntry = {
  id: string;
  createdAt: string;
  source: CliHistorySource;
  command: string;
  label?: string;
  workspacePath?: string;
  exitCode?: number;
  replayable?: boolean;
};

const storageKey = "layang.cli.command-history.v1";
const historyEventName = "layang:cli-history-changed";
const maxEntries = 250;

export function quoteCliArg(value: unknown): string {
  const text = String(value ?? "");
  if (!text) return '""';
  if (/^[a-zA-Z0-9_./:@-]+$/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function recordCliHistory(
  entry: Omit<CliHistoryEntry, "id" | "createdAt"> & Partial<Pick<CliHistoryEntry, "id" | "createdAt">>,
): CliHistoryEntry | null {
  if (typeof window === "undefined") return null;
  const normalized: CliHistoryEntry = {
    id: entry.id || createHistoryId(),
    createdAt: entry.createdAt || new Date().toISOString(),
    source: entry.source,
    command: String(entry.command || "").trim(),
    label: entry.label,
    workspacePath: entry.workspacePath || "",
    exitCode: entry.exitCode,
    replayable: entry.replayable !== false,
  };
  if (!normalized.command) return null;
  const current = readStoredHistory();
  const next = [normalized, ...current.filter((item) => item.id !== normalized.id)].slice(0, maxEntries);
  window.localStorage.setItem(storageKey, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(historyEventName, { detail: normalized }));
  return normalized;
}

export function recordGuiCliCommand(input: {
  command: string;
  label?: string;
  workspacePath?: string;
  replayable?: boolean;
}) {
  return recordCliHistory({ ...input, source: "gui" });
}

export function readCliHistory(workspacePath = ""): CliHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const normalizedPath = normalizePath(workspacePath);
  return readStoredHistory().filter((entry) => {
    if (!normalizedPath) return true;
    return !entry.workspacePath || normalizePath(entry.workspacePath) === normalizedPath;
  });
}

export function clearCliHistory(workspacePath = "", source?: CliHistorySource) {
  if (typeof window === "undefined") return;
  const normalizedPath = normalizePath(workspacePath);
  if (!normalizedPath && !source) window.localStorage.removeItem(storageKey);
  else {
    const next = readStoredHistory().filter((entry) => {
      const sameWorkspace = !normalizedPath || !entry.workspacePath || normalizePath(entry.workspacePath) === normalizedPath;
      const sameSource = !source || entry.source === source;
      return !(sameWorkspace && sameSource);
    });
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }
  window.dispatchEvent(new CustomEvent(historyEventName));
}

export function subscribeCliHistory(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(historyEventName, listener);
  return () => window.removeEventListener(historyEventName, listener);
}

function readStoredHistory(): CliHistoryEntry[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.command === "string") : [];
  } catch {
    return [];
  }
}

function normalizePath(value: string) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function createHistoryId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
