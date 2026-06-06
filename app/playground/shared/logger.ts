import type { LayangLoggerInfo, LayangLoggerSettings, LayangLogLevel } from "@/types/electron";

export type { LayangLoggerInfo, LayangLoggerSettings, LayangLogLevel };
export interface RendererLogger {
  debug: (message: string, ...data: unknown[]) => void;
  info: (message: string, ...data: unknown[]) => void;
  warn: (message: string, ...data: unknown[]) => void;
  error: (message: string, ...data: unknown[]) => void;
  child: (scope: string) => RendererLogger;
}
function send(level: LayangLogLevel, scope: string, message: string, data: unknown[]): void {
  if (typeof window === "undefined" || !window.electronLogger?.log) {
    const method = level === "debug" ? "debug" : level === "info" ? "info" : level;
    console[method]?.(`[${scope}] ${message}`, ...data);
    return;
  }
  void window.electronLogger
    .log({ level, scope, message, data })
    .catch((error) => console.warn("[Layang][logger] failed to send renderer log", error));
}
export function createLogger(scope = "renderer"): RendererLogger {
  return {
    debug: (message, ...data) => send("debug", scope, message, data),
    info: (message, ...data) => send("info", scope, message, data),
    warn: (message, ...data) => send("warn", scope, message, data),
    error: (message, ...data) => send("error", scope, message, data),
    child: (childScope) => createLogger(`${scope}:${childScope}`),
  };
}
export async function getLoggerInfo(): Promise<LayangLoggerInfo | null> {
  if (typeof window === "undefined" || !window.electronLogger?.getInfo) return null;
  return window.electronLogger.getInfo();
}
export async function updateLoggerSettings(settings: Partial<LayangLoggerSettings>): Promise<LayangLoggerInfo | null> {
  if (typeof window === "undefined" || !window.electronLogger?.setSettings) return null;
  return window.electronLogger.setSettings(settings);
}
export async function openLoggerFolder(): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (typeof window === "undefined" || !window.electronLogger?.openFolder)
    return { ok: false, error: "Electron logger is not available." };
  return window.electronLogger.openFolder();
}
export async function clearLoggerFiles(): Promise<LayangLoggerInfo | null> {
  if (typeof window === "undefined" || !window.electronLogger?.clear) return null;
  return window.electronLogger.clear();
}
