"use strict";

const { ipcMain } = require("electron");
const {
  applyZoomFromRendererEvent,
  getAppZoomInfo,
  resetZoom,
  setAppZoomPercent,
  zoomIn,
  zoomOut,
} = require("../utils/app-zoom-settings.cjs");

function registerAppZoomIpc() {
  ipcMain.handle("app-zoom:get", async () => getAppZoomInfo());

  ipcMain.handle("app-zoom:set", async (event, payload = {}) => {
    try {
      return applyZoomFromRendererEvent(event, setAppZoomPercent(payload.zoomPercent));
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("app-zoom:in", async (event) => {
    try {
      return applyZoomFromRendererEvent(event, zoomIn());
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("app-zoom:out", async (event) => {
    try {
      return applyZoomFromRendererEvent(event, zoomOut());
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("app-zoom:reset", async (event) => {
    try {
      return applyZoomFromRendererEvent(event, resetZoom());
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });
}

module.exports = { registerAppZoomIpc };
