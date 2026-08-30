"use strict";

const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");
const { getLogger } = require("../utils/logger.cjs");
const { attachAppZoomShortcuts } = require("../utils/app-zoom-settings.cjs");
const { attachWindowNavigationGuards } = require("./navigation-policy.cjs");

const windowLogger = getLogger("window");

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1180,
    minHeight: 780,
    title: "Layang",
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
  loadRenderer(win);
  return win;
}

function rendererLocation() {
  const isDev = !app.isPackaged && process.env.ELECTRON_LOAD_STATIC !== "1";
  const staticIndexPath = path.join(__dirname, "..", "..", "out", "playground.html");
  const startUrl = process.env.ELECTRON_START_URL || "http://localhost:3000/playground";
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

function loadRenderer(win) {
  const { isDev, staticIndexPath, startUrl } = rendererLocation();
  if (isDev) {
    void win.loadURL(startUrl);
    return;
  }
  void win.loadFile(staticIndexPath);
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
