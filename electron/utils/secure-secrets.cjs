"use strict";

const fs = require("node:fs");
const path = require("node:path");

const state = {
  configured: false,
  filePath: "",
  sessionSecrets: new Map(),
};

function configureSecureSecrets(options = {}) {
  const app = options.app;
  const userDataPath =
    typeof options.userDataPath === "string" && options.userDataPath.trim()
      ? options.userDataPath.trim()
      : app && typeof app.getPath === "function"
        ? app.getPath("userData")
        : path.join(process.cwd(), ".layang", "userData");
  state.filePath = path.join(userDataPath, "secure-secrets.json");
  state.configured = true;
  return getSafeStorageInfo();
}

function getSafeStorageInfo() {
  const safeStorage = getSafeStorage();
  const available = Boolean(safeStorage?.isEncryptionAvailable?.());
  let backend = "unavailable";
  try {
    backend =
      typeof safeStorage?.getSelectedStorageBackend === "function"
        ? String(safeStorage.getSelectedStorageBackend())
        : available
          ? process.platform === "win32"
            ? "dpapi"
            : "os-keyring"
          : "unavailable";
  } catch {
    backend = available ? "os-keyring" : "unavailable";
  }
  return {
    available,
    backend,
    secure: available && backend !== "basic_text" && backend !== "plaintext",
  };
}

function storeSecret(secretId, value) {
  ensureConfigured();
  const id = String(secretId || "").trim();
  if (!id) throw new Error("Secret id is required.");
  const text = typeof value === "string" ? value : String(value ?? "");
  const info = getSafeStorageInfo();
  if (!info.secure) {
    return { stored: false, secretId: id, ...info, reason: "secure-storage-unavailable" };
  }
  const safeStorage = getSafeStorage();
  const encrypted = safeStorage.encryptString(text).toString("base64");
  const data = readSecretsFile();
  data[id] = { encrypted, updatedAt: new Date().toISOString(), backend: info.backend };
  writeSecretsFile(data);
  return { stored: true, secretId: id, ...info };
}

function readSecret(secretId) {
  ensureConfigured();
  const id = String(secretId || "").trim();
  if (!id) return "";
  if (state.sessionSecrets.has(id)) return state.sessionSecrets.get(id) || "";
  const info = getSafeStorageInfo();
  if (!info.available) return "";
  const record = readSecretsFile()[id];
  if (!record?.encrypted) return "";
  try {
    return getSafeStorage().decryptString(Buffer.from(record.encrypted, "base64"));
  } catch {
    return "";
  }
}

function storeSessionSecret(secretId, value) {
  ensureConfigured();
  const id = String(secretId || "").trim();
  if (!id) throw new Error("Secret id is required.");
  state.sessionSecrets.set(id, typeof value === "string" ? value : String(value ?? ""));
  return { stored: true, sessionOnly: true, secretId: id };
}

function deleteSecret(secretId) {
  ensureConfigured();
  const id = String(secretId || "").trim();
  if (!id) return false;
  state.sessionSecrets.delete(id);
  const data = readSecretsFile();
  if (!Object.hasOwn(data, id)) return false;
  delete data[id];
  writeSecretsFile(data);
  return true;
}

function readSecretsFile() {
  if (!state.filePath || !fs.existsSync(state.filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(state.filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSecretsFile(data) {
  fs.mkdirSync(path.dirname(state.filePath), { recursive: true });
  fs.writeFileSync(state.filePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(state.filePath, 0o600);
  } catch {
    /* Windows ignores POSIX mode. */
  }
}

function ensureConfigured() {
  if (!state.configured) configureSecureSecrets();
}

function getSafeStorage() {
  try {
    return require("electron").safeStorage;
  } catch {
    return null;
  }
}

module.exports = {
  configureSecureSecrets,
  deleteSecret,
  getSafeStorageInfo,
  readSecret,
  storeSecret,
  storeSessionSecret,
};
