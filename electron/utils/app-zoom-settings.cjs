"use strict";

const fs = require("node:fs");
const path = require("node:path");

const settingsFileName = "app-zoom-settings.json";
const minZoomPercent = 75;
const maxZoomPercent = 175;
const zoomStepPercent = 10;
const defaultSettings = Object.freeze({
  version: 1,
  zoomPercent: 100,
  updatedAt: "",
});

const state = {
  initialized: false,
  userDataPath: "",
  settingsFilePath: "",
  settings: { ...defaultSettings },
};

function configureAppZoomSettings(options = {}) {
  const app = options.app;
  const userDataPath =
    typeof options.userDataPath === "string" && options.userDataPath.trim()
      ? options.userDataPath.trim()
      : app && typeof app.getPath === "function"
        ? app.getPath("userData")
        : path.join(process.cwd(), ".layang", "userData");

  state.userDataPath = userDataPath;
  state.settingsFilePath = path.join(userDataPath, settingsFileName);
  state.settings = normalizeAppZoomSettings(readSettingsFile(state.settingsFilePath));
  state.initialized = true;
  return getAppZoomInfo();
}

function getAppZoomInfo() {
  ensureConfigured();
  return {
    ok: true,
    initialized: state.initialized,
    settingsFilePath: state.settingsFilePath,
    settings: { ...state.settings },
    minZoomPercent,
    maxZoomPercent,
    zoomStepPercent,
  };
}

function getCurrentZoomPercent() {
  ensureConfigured();
  return state.settings.zoomPercent;
}

function setAppZoomPercent(zoomPercent, options = {}) {
  ensureConfigured();
  const nextZoomPercent = normalizeZoomPercent(zoomPercent);
  const updatedAt = nextZoomPercent === state.settings.zoomPercent ? state.settings.updatedAt : new Date().toISOString();
  state.settings = normalizeAppZoomSettings({ ...state.settings, zoomPercent: nextZoomPercent, updatedAt });
  if (options.persist !== false) writeSettingsFile(state.settingsFilePath, state.settings);
  return getAppZoomInfo();
}

function zoomIn(options = {}) {
  return setAppZoomPercent(getCurrentZoomPercent() + zoomStepPercent, options);
}

function zoomOut(options = {}) {
  return setAppZoomPercent(getCurrentZoomPercent() - zoomStepPercent, options);
}

function resetZoom(options = {}) {
  return setAppZoomPercent(100, options);
}

function applyZoomToWindow(win, info = getAppZoomInfo()) {
  if (!win?.webContents || typeof win.webContents.setZoomFactor !== "function") return info;
  const settings = info?.settings ? info.settings : getAppZoomInfo().settings;
  win.webContents.setZoomFactor(settings.zoomPercent / 100);
  return info;
}

function attachAppZoomShortcuts(win, options = {}) {
  const logger = options.logger;
  applyZoomToWindow(win);
  win.webContents.on("before-input-event", (event, input) => {
    if (!isZoomShortcut(input)) return;
    event.preventDefault();
    const info = handleZoomShortcut(input);
    applyZoomToWindow(win, info);
    notifyZoomChanged(win, info);
    if (logger && typeof logger.info === "function") {
      logger.info("app zoom changed by shortcut", { zoomPercent: info.settings.zoomPercent });
    }
  });
}

function applyZoomFromRendererEvent(event, info) {
  const win = windowFromIpcEvent(event);
  if (win) {
    applyZoomToWindow(win, info);
    notifyZoomChanged(win, info);
  }
  return info;
}

function notifyZoomChanged(win, info = getAppZoomInfo()) {
  if (!win?.webContents || typeof win.webContents.send !== "function") return;
  win.webContents.send("app-zoom:changed", info);
}

function normalizeAppZoomSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: 1,
    zoomPercent: normalizeZoomPercent(source.zoomPercent),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : "",
  };
}

function normalizeZoomPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultSettings.zoomPercent;
  const rounded = Math.round(parsed);
  return Math.min(maxZoomPercent, Math.max(minZoomPercent, rounded));
}

function isZoomShortcut(input) {
  if (!input || typeof input !== "object") return false;
  if (input.type && input.type !== "keyDown") return false;
  if (input.control !== true && input.meta !== true) return false;
  return isZoomInInput(input) || isZoomOutInput(input) || isZoomResetInput(input);
}

function handleZoomShortcut(input) {
  if (isZoomInInput(input)) return zoomIn();
  if (isZoomOutInput(input)) return zoomOut();
  return resetZoom();
}

function isZoomInInput(input) {
  const key = normalizeKey(input.key);
  const code = normalizeKey(input.code);
  return key === "+" || key === "=" || code === "equal" || code === "numpadadd";
}

function isZoomOutInput(input) {
  const key = normalizeKey(input.key);
  const code = normalizeKey(input.code);
  return key === "-" || key === "_" || code === "minus" || code === "numpadsubtract";
}

function isZoomResetInput(input) {
  const key = normalizeKey(input.key);
  const code = normalizeKey(input.code);
  return key === "0" || code === "digit0" || code === "numpad0";
}

function normalizeKey(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readSettingsFile(settingsFilePath) {
  if (!settingsFilePath || !fs.existsSync(settingsFilePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsFilePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettingsFile(settingsFilePath, settings) {
  if (!settingsFilePath) return;
  fs.mkdirSync(path.dirname(settingsFilePath), { recursive: true });
  fs.writeFileSync(settingsFilePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function windowFromIpcEvent(event) {
  if (!event?.sender) return null;
  try {
    const { BrowserWindow } = require("electron");
    return BrowserWindow.fromWebContents(event.sender);
  } catch {
    return null;
  }
}

function ensureConfigured() {
  if (state.initialized) return;
  configureAppZoomSettings();
}

module.exports = {
  applyZoomFromRendererEvent,
  applyZoomToWindow,
  attachAppZoomShortcuts,
  configureAppZoomSettings,
  defaultSettings,
  getAppZoomInfo,
  getCurrentZoomPercent,
  isZoomShortcut,
  maxZoomPercent,
  minZoomPercent,
  normalizeAppZoomSettings,
  resetZoom,
  setAppZoomPercent,
  zoomIn,
  zoomOut,
  zoomStepPercent,
};
