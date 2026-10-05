"use strict";

const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");
const { getLogger } = require("../utils/logger.cjs");
const { attachAppZoomShortcuts } = require("../utils/app-zoom-settings.cjs");
const { attachWindowNavigationGuards } = require("./navigation-policy.cjs");
const { windowTitleForContext } = require("./window-context.cjs");

const windowLogger = getLogger("window");

function createWindow(options = {}) {
  Menu.setApplicationMenu(null);
  const context = options.context || { kind: "main" };
  const bounds = options.bounds || {};
  const defaultWidth = context.kind === "main" ? 1500 : context.kind === "performance" ? 900 : 1180;
  const defaultHeight = context.kind === "main" ? 980 : context.kind === "performance" ? 780 : 820;
  const win = new BrowserWindow({
    width: Number.isFinite(bounds.width) ? bounds.width : defaultWidth,
    height: Number.isFinite(bounds.height) ? bounds.height : defaultHeight,
    ...(Number.isFinite(bounds.x) ? { x: bounds.x } : {}),
    ...(Number.isFinite(bounds.y) ? { y: bounds.y } : {}),
    title: windowTitleForContext({ ...context, title: options.title || context.title }),
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Layang currently performs direct REST/browser transport requests from the renderer,
      // so CORS enforcement remains disabled until those transports are fully moved to main-process IPC.
      // Navigation is separately locked to the Layang renderer below.
      webSecurity: false,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });

  attachRendererDiagnostics(win);
  attachAppZoomShortcuts(win, { logger: windowLogger });
  attachRendererSecurity(win);
  loadRenderer(win, context);
  return win;
}

function rendererLocation() {
  const isDev = !app.isPackaged && process.env.ELECTRON_LOAD_STATIC !== "1";
  const staticIndexPath = path.join(__dirname, "..", "..", "out", "playground.html");
  const startUrl = process.env.ELECTRON_START_URL || "http://localhost:12999/playground";
  return { isDev, staticIndexPath, startUrl };
}

function attachRendererSecurity(win) {
  const location = rendererLocation();
  attachWindowNavigationGuards(win, {
    ...location,
    shell,
    logger: windowLogger,
  });
  windowLogger.info("renderer navigation security enabled", {
    mode: location.isDev ? "development-origin" : "packaged-file",
    allowRunningInsecureContent: false,
    corsCompatibilityMode: true,
  });
}

function loadRenderer(win, context = { kind: "main" }) {
  const { isDev, staticIndexPath, startUrl } = rendererLocation();
  const query = new URLSearchParams();
  query.set("layangWindow", String(context.kind || "main"));
  if (context.resourceId) query.set("resourceId", String(context.resourceId));
  if (context.responseSessionId) query.set("responseSessionId", String(context.responseSessionId));
  if (isDev) {
    const separator = startUrl.includes("?") ? "&" : "?";
    void win.loadURL(`${startUrl}${separator}${query.toString()}`);
    return;
  }
  void win.loadFile(staticIndexPath, { query: Object.fromEntries(query.entries()) });
}

function attachRendererDiagnostics(win) {
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    windowLogger.error("renderer did-fail-load", { errorCode, errorDescription, validatedURL });
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    windowLogger.debug("renderer console", { level, message, line, sourceId });
  });
  win.webContents.on("did-finish-load", () => {
    windowLogger.info("renderer did-finish-load", { url: win.webContents.getURL() });
  });
  windowLogger.info("transport browser fetch enabled", {
    cors: "compatibility mode for direct desktop API transport",
    externalNavigation: "blocked from trusted renderer",
  });
}

module.exports = { createWindow };
