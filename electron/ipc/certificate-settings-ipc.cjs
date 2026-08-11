"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { ipcMain, dialog, session } = require("electron");
const {
  getHttpsEnvironment,
  openHttpsCertificateFolder,
  setupLocalHttps,
  testHttpsEndpoint,
  validateHttpsCertificate,
} = require("../utils/web-https-certificates.cjs");
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
      const info = applyCertificateSettings(payload);
      await closeCertificateRelatedConnections();
      return info;
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("certificate-settings:clear", async () => {
    try {
      const info = clearCertificatePem();
      await closeCertificateRelatedConnections();
      return info;
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
      const info = importCertificatePems(items);
      await closeCertificateRelatedConnections();
      return { ...info, filePaths: result.filePaths, filePath: result.filePaths[0] };
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("certificate-settings:https-environment", async () => {
    try {
      return await getHttpsEnvironment();
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("certificate-settings:https-setup-local", async (_event, payload = {}) => {
    try {
      return await setupLocalHttps(payload);
    } catch (error) {
      return { ok: false, valid: false, mode: "local", error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("certificate-settings:https-choose-pem", async () => {
    try {
      const certificate = await dialog.showOpenDialog({
        title: "Select TLS certificate",
        properties: ["openFile"],
        filters: [
          { name: "Certificate", extensions: ["pem", "crt", "cer"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (certificate.canceled || !certificate.filePaths[0]) return { ok: true, cancelled: true };
      const privateKey = await dialog.showOpenDialog({
        title: "Select TLS private key",
        properties: ["openFile"],
        filters: [
          { name: "Private key", extensions: ["pem", "key"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (privateKey.canceled || !privateKey.filePaths[0]) return { ok: true, cancelled: true };
      const ca = await dialog.showOpenDialog({
        title: "Select optional certificate chain",
        properties: ["openFile"],
        filters: [
          { name: "CA chain", extensions: ["pem", "crt", "cer"] },
          { name: "All files", extensions: ["*"] },
        ],
        buttonLabel: "Use certificate chain",
      });
      return {
        ok: true,
        certificatePath: certificate.filePaths[0],
        privateKeyPath: privateKey.filePaths[0],
        caPath: ca.canceled ? "" : ca.filePaths[0] || "",
      };
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("certificate-settings:https-choose-pfx", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Select PFX/P12 certificate",
        properties: ["openFile"],
        filters: [
          { name: "PKCS#12", extensions: ["pfx", "p12"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (result.canceled || !result.filePaths[0]) return { ok: true, cancelled: true };
      return { ok: true, pfxPath: result.filePaths[0] };
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("certificate-settings:https-validate", async (_event, payload = {}) => {
    try {
      return await validateHttpsCertificate(payload);
    } catch (error) {
      return {
        ok: false,
        valid: false,
        mode: payload?.mode || "pem",
        error: error?.message ? String(error.message) : String(error),
      };
    }
  });

  ipcMain.handle("certificate-settings:https-test", async (_event, payload = {}) => {
    try {
      return await testHttpsEndpoint(payload);
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("certificate-settings:https-open-folder", async () => {
    try {
      return await openHttpsCertificateFolder();
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });
}

async function closeCertificateRelatedConnections() {
  if (session?.defaultSession && typeof session.defaultSession.closeAllConnections === "function") {
    await session.defaultSession.closeAllConnections();
  }
}

module.exports = { registerCertificateSettingsIpc };
