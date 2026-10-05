"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { BrowserWindow, screen } = require("electron");
const { getLogger } = require("../utils/logger.cjs");

const logger = getLogger("window-manager");
const STATE_FILE = "window-layout.json";
const VALID_KINDS = new Set(["main", "mocking", "request", "response", "performance"]);

let appRef = null;
let createWindowRef = null;
let statePath = "";
let persistedState = { version: 1, windows: {} };
let mainWindowId = null;
const persistTimers = new Map();
let appQuitting = false;
const managed = new Map();
const keyToWindowId = new Map();

function configureWindowManager({ app, createWindow }) {
  appRef = app;
  createWindowRef = createWindow;
  statePath = path.join(app.getPath("userData"), STATE_FILE);
  persistedState = readState(statePath);
  app.on("before-quit", () => {
    appQuitting = true;
    for (const entry of managed.values()) {
      persistWindowState(entry.win.id, { open: entry.context.kind !== "performance" });
    }
    writeState();
  });
}

function normalizeContext(input = {}, fallbackKind = "main") {
  const kind = VALID_KINDS.has(input.kind) ? input.kind : fallbackKind;
  const resourceId = typeof input.resourceId === "string" ? input.resourceId.trim() : "";
  const responseSessionId = typeof input.responseSessionId === "string" ? input.responseSessionId.trim() : "";
  const originWindowId = Number.isFinite(Number(input.originWindowId)) ? Number(input.originWindowId) : undefined;
  const originTabIndex = Number.isFinite(Number(input.originTabIndex)) ? Number(input.originTabIndex) : undefined;
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 180) : "";
  return {
    kind,
    resourceId,
    responseSessionId,
    originWindowId,
    originTabIndex,
    title,
  };
}

function contextKey(context) {
  if (context.kind === "main") return "main";
  if (context.kind === "mocking") return "mocking";
  if (context.kind === "performance") return "performance";
  const resource = context.resourceId || context.responseSessionId || "unbound";
  return `${context.kind}:${resource}`;
}

function createMainWindow() {
  ensureConfigured();
  const existing = getMainWindow();
  if (existing && !existing.isDestroyed()) {
    focusWindow(existing);
    return existing;
  }
  const context = normalizeContext({ kind: "main" });
  return createManagedWindow(context);
}

function restoreDetachedWindows() {
  ensureConfigured();
  const restored = [];
  for (const saved of Object.values(persistedState.windows || {})) {
    if (!saved || saved.open !== true || saved.kind === "main" || saved.kind === "performance" || !VALID_KINDS.has(saved.kind)) continue;
    const context = normalizeContext({
      kind: saved.kind,
      resourceId: saved.resourceId,
      responseSessionId: saved.responseSessionId,
      title: saved.title,
    }, saved.kind);
    if ((context.kind === "request" || context.kind === "response") && !context.resourceId) continue;
    const result = openDetachedWindow(context, getMainWindow());
    const win = result?.window || result;
    if (win && !win.isDestroyed()) restored.push(win.id);
  }
  return restored;
}

function openDetachedWindow(input, sourceWindow) {
  ensureConfigured();
  const context = normalizeContext(input, "request");
  if (context.kind === "main") return createMainWindow();
  const key = contextKey(context);
  const existingId = keyToWindowId.get(key);
  const existing = existingId ? BrowserWindow.fromId(existingId) : null;
  if (existing && !existing.isDestroyed()) {
    focusWindow(existing);
    return { window: existing, context: managed.get(existing.id)?.context ?? context, existing: true };
  }

  const withOrigin = {
    ...context,
    originWindowId: context.originWindowId ?? sourceWindow?.id ?? mainWindowId ?? undefined,
  };
  const win = createManagedWindow(withOrigin);
  return { window: win, context: withOrigin, existing: false };
}

function createManagedWindow(context) {
  const key = contextKey(context);
  const saved = persistedState.windows?.[key];
  const bounds = normalizeRestoredBounds(saved?.bounds);
  const win = createWindowRef({ context, bounds, title: context.title });
  const entry = { key, context, win };
  managed.set(win.id, entry);
  keyToWindowId.set(key, win.id);
  if (context.kind === "main") mainWindowId = win.id;

  if (saved?.maximized) {
    win.once("ready-to-show", () => {
      if (!win.isDestroyed()) win.maximize();
    });
  }

  persistWindowState(win.id, { open: true });
  const persist = () => schedulePersistWindow(win.id);
  win.on("resize", persist);
  win.on("move", persist);
  win.on("maximize", persist);
  win.on("unmaximize", persist);
  win.on("close", () => {
    const timer = persistTimers.get(win.id);
    if (timer) clearTimeout(timer);
    persistTimers.delete(win.id);
    persistWindowState(win.id, { open: appQuitting, immediate: true });
  });
  win.on("closed", () => {
    const timer = persistTimers.get(win.id);
    if (timer) clearTimeout(timer);
    persistTimers.delete(win.id);
    managed.delete(win.id);
    keyToWindowId.delete(key);
    if (mainWindowId === win.id) mainWindowId = null;
    broadcastRegistryChanged();
  });

  broadcastRegistryChanged();
  return win;
}

function getWindowContext(win) {
  if (!win) return normalizeContext({ kind: "main" });
  const entry = managed.get(win.id);
  return { ...(entry?.context ?? normalizeContext({ kind: win.id === mainWindowId ? "main" : "request" })), windowId: win.id };
}

function listManagedWindows() {
  return [...managed.values()]
    .filter((entry) => !entry.win.isDestroyed())
    .map((entry) => ({
      windowId: entry.win.id,
      key: entry.key,
      ...entry.context,
      focused: entry.win.isFocused(),
    }));
}

function getMainWindow() {
  return mainWindowId ? BrowserWindow.fromId(mainWindowId) : null;
}

function reattachWindow(win) {
  if (!win || win.isDestroyed()) return { ok: false, error: "Window is unavailable." };
  const context = getWindowContext(win);
  if (context.kind === "main" || context.kind === "performance") return { ok: true, context };

  let target = null;
  if (context.kind === "response") {
    if (context.originWindowId) target = BrowserWindow.fromId(context.originWindowId);
    if ((!target || target.isDestroyed()) && context.resourceId) {
      const requestWindowId = keyToWindowId.get(`request:${context.resourceId}`);
      target = requestWindowId ? BrowserWindow.fromId(requestWindowId) : null;
    }
  }
  if (!target || target.isDestroyed()) target = createMainWindow();

  const payload = { ...context, detachedWindowId: win.id, targetWindowId: target.id };
  sendWhenReady(target, "layang:window-reattach", payload);
  focusWindow(target);
  win.close();
  return { ok: true, context: payload, mainWindowId: getMainWindow()?.id, targetWindowId: target.id };
}


function reattachManagedWindow(input = {}) {
  const context = normalizeContext(input, input.kind || "request");
  if (context.kind === "main") return { ok: false, error: "Main window is already attached." };
  const key = contextKey(context);
  const id = keyToWindowId.get(key);
  const target = id ? BrowserWindow.fromId(id) : null;
  if (!target || target.isDestroyed()) return { ok: false, found: false };
  // Response windows are read-only views, so they can reattach directly.
  // This avoids depending on a renderer-side handshake for the common Back action.
  if (context.kind === "response") {
    return reattachWindow(target);
  }
  // Editable request/mocking windows still need the renderer to run its
  // save/dirty handoff guard before calling window:reattach.
  sendWhenReady(target, "layang:request-reattach", { kind: context.kind, resourceId: context.resourceId });
  focusWindow(target);
  return { ok: true, found: true, windowId: target.id };
}

function focusManagedWindow(input = {}) {
  const context = normalizeContext(input, input.kind || "request");
  const key = contextKey(context);
  const id = keyToWindowId.get(key);
  const target = id ? BrowserWindow.fromId(id) : null;
  if (!target || target.isDestroyed()) return { ok: false, found: false };
  focusWindow(target);
  return { ok: true, found: true, windowId: target.id };
}

function broadcast(channel, payload, options = {}) {
  const excludeId = Number(options.excludeWindowId || 0);
  for (const entry of managed.values()) {
    if (entry.win.isDestroyed() || entry.win.id === excludeId) continue;
    sendWhenReady(entry.win, channel, payload);
  }
}

function broadcastViewEvent(topic, payload, sourceWindow) {
  const sourceContext = getWindowContext(sourceWindow);
  broadcast(
    "layang:window-event",
    { topic: String(topic || ""), payload, sourceWindowId: sourceWindow?.id ?? 0, sourceContext },
    { excludeWindowId: sourceWindow?.id },
  );
}

function broadcastWorkspaceSaved(directoryPath, sourceWindow) {
  broadcastViewEvent(
    "workspace:saved",
    { directoryPath: typeof directoryPath === "string" ? path.resolve(directoryPath) : "", savedAt: Date.now() },
    sourceWindow,
  );
}

function broadcastRegistryChanged() {
  const windows = listManagedWindows();
  broadcast("layang:window-registry-changed", { windows });
}

function closeAllManagedWindows() {
  for (const entry of [...managed.values()]) {
    if (!entry.win.isDestroyed()) entry.win.destroy();
  }
  managed.clear();
  keyToWindowId.clear();
  mainWindowId = null;
}

function sendWhenReady(win, channel, payload) {
  if (!win || win.isDestroyed()) return;
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", () => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    });
    return;
  }
  win.webContents.send(channel, payload);
}

function focusWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  else if (!win.isVisible()) win.show();
  win.focus();
}

function persistWindowState(windowId, options = {}) {
  const entry = managed.get(windowId);
  if (!entry || entry.win.isDestroyed()) return;
  const previous = persistedState.windows[entry.key] || {};
  persistedState.windows[entry.key] = {
    ...previous,
    bounds: entry.win.getNormalBounds(),
    maximized: entry.win.isMaximized(),
    kind: entry.context.kind,
    resourceId: entry.context.resourceId || undefined,
    responseSessionId: entry.context.responseSessionId || undefined,
    title: entry.context.title || undefined,
    open: options.open ?? previous.open ?? true,
    updatedAt: new Date().toISOString(),
  };
  if (options.immediate) writeState();
}

function schedulePersistWindow(windowId) {
  const previous = persistTimers.get(windowId);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    persistTimers.delete(windowId);
    // Reading BrowserWindow bounds on every native move event is expensive on
    // Windows. Capture bounds only after the drag/resize has settled.
    persistWindowState(windowId, { open: true });
    writeState();
  }, 260);
  persistTimers.set(windowId, timer);
}

function writeState() {
  if (!statePath) return;
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(temporaryPath, `${JSON.stringify(persistedState, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, statePath);
  } catch (error) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch {}
    logger.warn("failed to persist window layout", { error: error?.message ? String(error.message) : String(error) });
  }
}

function readState(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (parsed && typeof parsed === "object" && parsed.windows && typeof parsed.windows === "object") {
      return { version: 1, windows: parsed.windows };
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      logger.warn("window layout state was unreadable; starting with a clean layout", {
        error: error?.message ? String(error.message) : String(error),
      });
    }
  }
  return { version: 1, windows: {} };
}

function normalizeRestoredBounds(bounds) {
  if (!bounds || typeof bounds !== "object") return undefined;
  const candidate = {
    x: Number(bounds.x), y: Number(bounds.y), width: Number(bounds.width), height: Number(bounds.height),
  };
  if (![candidate.x, candidate.y, candidate.width, candidate.height].every(Number.isFinite)) return undefined;
  candidate.width = Math.max(240, Math.round(candidate.width));
  candidate.height = Math.max(180, Math.round(candidate.height));

  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay()?.workArea;
  const fallback = primary || displays[0]?.workArea;
  if (!fallback) return candidate;

  const best = displays
    .map((display) => ({ workArea: display.workArea, area: intersectionArea(candidate, display.workArea) }))
    .sort((left, right) => right.area - left.area)[0];
  const workArea = best?.area > 0 ? best.workArea : fallback;
  const width = Math.min(candidate.width, Math.max(240, workArea.width));
  const height = Math.min(candidate.height, Math.max(180, workArea.height));
  return {
    x: clampNumber(candidate.x, workArea.x, workArea.x + Math.max(0, workArea.width - width)),
    y: clampNumber(candidate.y, workArea.y, workArea.y + Math.max(0, workArea.height - height)),
    width,
    height,
  };
}

function intersectionArea(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ensureConfigured() {
  if (!appRef || !createWindowRef) throw new Error("Window manager has not been configured.");
}

module.exports = {
  broadcast,
  broadcastRegistryChanged,
  broadcastViewEvent,
  broadcastWorkspaceSaved,
  closeAllManagedWindows,
  configureWindowManager,
  createMainWindow,
  focusManagedWindow,
  getMainWindow,
  getWindowContext,
  listManagedWindows,
  openDetachedWindow,
  reattachManagedWindow,
  reattachWindow,
  restoreDetachedWindows,
};
