"use strict";

const { app, BrowserWindow, Menu } = require("electron");
const path = require("node:path");
const { getLogger } = require("../utils/logger.cjs");
const { attachAppZoomShortcuts } = require("../utils/app-zoom-settings.cjs");

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
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  attachRendererDiagnostics(win);
  attachAppZoomShortcuts(win, { logger: windowLogger });
  loadRenderer(win);
  return win;
}

function loadRenderer(win) {
  const isDev = !app.isPackaged;
  const staticIndexPath = path.join(__dirname, "..", "..", "out", "playground.html");
  if (isDev && process.env.ELECTRON_LOAD_STATIC !== "1") {
    const startUrl = process.env.ELECTRON_START_URL || "http://localhost:3000/playground";
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
  windowLogger.info("transport browser fetch enabled", { cors: "disabled for trusted desktop window" });
}

module.exports = { createWindow };
