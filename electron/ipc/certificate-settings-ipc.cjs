"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { ipcMain, dialog } = require("electron");
const {
  applyCertificateSettings,
  clearCertificatePem,
  getCertificateSettingsInfo,
  importCertificatePems,
} = require("../utils/certificate-settings.cjs");

function registerCertificateSettingsIpc() {
  ipcMain.handle("certificate-settings:get", async () => getCertificateSettingsInfo());

  ipcMain.handle("certificate-settings:set", async (_event, payload = {}) => {
    try {
      return applyCertificateSettings(payload);
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("certificate-settings:clear", async () => {
    try {
      return clearCertificatePem();
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("certificate-settings:import-file", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Import certificates",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "Certificate files", extensions: ["pem", "crt", "cer"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) return { ok: true, cancelled: true };
      const items = await Promise.all(
        result.filePaths.map(async (filePath) => ({
          name: path.basename(filePath),
          sourcePath: filePath,
          pemText: await fs.readFile(filePath, "utf8"),
        })),
      );
      return { ...importCertificatePems(items), filePaths: result.filePaths, filePath: result.filePaths[0] };
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });
}

module.exports = { registerCertificateSettingsIpc };
