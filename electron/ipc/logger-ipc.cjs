"use strict";

const { ipcMain, shell } = require("electron");
const {
  allowedLevels,
  applyLoggerSettings,
  clearLogs,
  getLogInfo,
  getLogger,
  openLogFolder,
} = require("../utils/logger.cjs");
const allowedLevelSet = new Set(allowedLevels);
function registerLoggerIpc() {
  ipcMain.handle("logger:log", async (_event, payload = {}) => {
    const level = allowedLevelSet.has(payload.level) ? payload.level : "info";
    const scope = typeof payload.scope === "string" && payload.scope.trim() ? payload.scope.trim() : "renderer";
    const message = typeof payload.message === "string" ? payload.message : "";
    const data = Array.isArray(payload.data) ? payload.data : payload.data === undefined ? [] : [payload.data];
    getLogger(scope)[level](message, ...data);
    return { ok: true };
  });
  ipcMain.handle("logger:get-info", async () => ({ ok: true, ...getLogInfo() }));
  ipcMain.handle("logger:set-settings", async (_event, payload = {}) => ({
    ok: true,
    ...applyLoggerSettings(payload, { persist: true }),
  }));
  ipcMain.handle("logger:open-folder", async () => openLogFolder(shell));
  ipcMain.handle("logger:clear", async () => clearLogs());
}
module.exports = { registerLoggerIpc };
