"use strict";

const fs = require("node:fs");
const path = require("node:path");
const util = require("node:util");

const allowedLevels = ["debug", "info", "warn", "error"];
const levelRank = { debug: 10, info: 20, warn: 30, error: 40 };
const originalConsole = {
  debug: console.debug.bind(console),
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
const defaultMaxBytes = 5 * 1024 * 1024;
const defaultMaxTotalBytes = 50 * 1024 * 1024;
const defaultRetentionDays = 14;
const state = {
  initialized: false,
  appName: "Layang",
  isPackaged: false,
  userDataPath: "",
  settingsFilePath: "",
  logDir: "",
  logFilePath: "",
  level: normalizeLogLevel(process.env.LAYANG_LOG_LEVEL, process.env.NODE_ENV === "production" ? "info" : "debug"),
  mirrorToConsole: process.env.LAYANG_LOG_CONSOLE === "1" || process.env.NODE_ENV !== "production",
  maxBytes: normalizePositiveInteger(process.env.LAYANG_LOG_MAX_BYTES, defaultMaxBytes),
  maxTotalBytes: normalizePositiveInteger(process.env.LAYANG_LOG_MAX_TOTAL_BYTES, defaultMaxTotalBytes),
  retentionDays: normalizePositiveInteger(process.env.LAYANG_LOG_RETENTION_DAYS, defaultRetentionDays),
};

function normalizeLogLevel(value, fallback = "info") {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return Object.hasOwn(levelRank, normalized) ? normalized : fallback;
}
function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function normalizeBoolean(value, fallback) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}
function hasEnv(name) {
  return Object.hasOwn(process.env, name);
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
function normalizeSettings(settings = {}, fallback = {}) {
  return {
    level: normalizeLogLevel(settings.level, fallback.level ?? state.level),
    mirrorToConsole: normalizeBoolean(settings.mirrorToConsole, fallback.mirrorToConsole ?? state.mirrorToConsole),
    maxBytes: normalizePositiveInteger(settings.maxBytes, fallback.maxBytes ?? state.maxBytes),
    maxTotalBytes: normalizePositiveInteger(settings.maxTotalBytes, fallback.maxTotalBytes ?? state.maxTotalBytes),
    retentionDays: normalizePositiveInteger(settings.retentionDays, fallback.retentionDays ?? state.retentionDays),
  };
}
function applyEnvOverrides(settings) {
  return {
    ...settings,
    level: hasEnv("LAYANG_LOG_LEVEL")
      ? normalizeLogLevel(process.env.LAYANG_LOG_LEVEL, settings.level)
      : settings.level,
    mirrorToConsole: hasEnv("LAYANG_LOG_CONSOLE")
      ? normalizeBoolean(process.env.LAYANG_LOG_CONSOLE, settings.mirrorToConsole)
      : settings.mirrorToConsole,
    maxBytes: hasEnv("LAYANG_LOG_MAX_BYTES")
      ? normalizePositiveInteger(process.env.LAYANG_LOG_MAX_BYTES, settings.maxBytes)
      : settings.maxBytes,
    maxTotalBytes: hasEnv("LAYANG_LOG_MAX_TOTAL_BYTES")
      ? normalizePositiveInteger(process.env.LAYANG_LOG_MAX_TOTAL_BYTES, settings.maxTotalBytes)
      : settings.maxTotalBytes,
    retentionDays: hasEnv("LAYANG_LOG_RETENTION_DAYS")
      ? normalizePositiveInteger(process.env.LAYANG_LOG_RETENTION_DAYS, settings.retentionDays)
      : settings.retentionDays,
  };
}
function configureLogger(options = {}) {
  const app = options.app;
  const userDataPath =
    typeof options.userDataPath === "string" && options.userDataPath.trim()
      ? options.userDataPath.trim()
      : app && typeof app.getPath === "function"
        ? app.getPath("userData")
        : path.join(process.cwd(), ".layang", "userData");
  const isPackaged = Boolean(options.isPackaged ?? app?.isPackaged);
  state.appName = options.appName || state.appName;
  state.isPackaged = isPackaged;
  state.userDataPath = userDataPath;
  state.settingsFilePath = path.join(userDataPath, "logger-settings.json");
  state.logDir = path.join(userDataPath, "logs");
  const startupDefaults = normalizeSettings(
    {
      level: options.level ?? (state.isPackaged ? "info" : "debug"),
      mirrorToConsole: options.mirrorToConsole ?? !state.isPackaged,
      maxBytes: options.maxBytes ?? defaultMaxBytes,
      maxTotalBytes: options.maxTotalBytes ?? defaultMaxTotalBytes,
      retentionDays: options.retentionDays ?? defaultRetentionDays,
    },
    state,
  );
  const persistedSettings = normalizeSettings(readSettingsFile(state.settingsFilePath), startupDefaults);
  applyLoggerSettings(applyEnvOverrides(persistedSettings), { persist: false, silent: true });
  fs.mkdirSync(state.logDir, { recursive: true });
  state.logFilePath = path.join(state.logDir, `${safeFileName(state.appName)}-${dateStamp()}.log`);
  rotateCurrentLogIfNeeded();
  cleanupOldLogs();
  cleanupTotalLogSize();
  state.initialized = true;
  getLogger("main").info("logger initialized", getLogInfo());
  return getLogInfo();
}
function safeFileName(value) {
  return (
    String(value || "layang")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "layang"
  );
}
function dateStamp(date = new Date()) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}
function timeStamp(date = new Date()) {
  return `${dateStamp(date)} ${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}:${`${date.getSeconds()}`.padStart(2, "0")}.${`${date.getMilliseconds()}`.padStart(3, "0")}`;
}
function shouldWrite(level) {
  return levelRank[level] >= levelRank[state.level];
}
function formatArg(arg) {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ""}`.trim();
  if (typeof arg === "string") return arg;
  return util.inspect(arg, { depth: 8, colors: false, breakLength: 160, maxArrayLength: 100 });
}
function formatLine(level, scope, args) {
  return `${timeStamp()} ${level.toUpperCase().padEnd(5)} [${scope}] ${args.map(formatArg).join(" ")}`;
}
function ensureLogFile() {
  if (!state.logFilePath) {
    const fallbackRoot = path.join(process.cwd(), ".layang", "logs");
    fs.mkdirSync(fallbackRoot, { recursive: true });
    state.logDir = fallbackRoot;
    state.logFilePath = path.join(fallbackRoot, `${safeFileName(state.appName)}-${dateStamp()}.log`);
  }
  fs.mkdirSync(path.dirname(state.logFilePath), { recursive: true });
  const expectedPath = path.join(
    state.logDir || path.dirname(state.logFilePath),
    `${safeFileName(state.appName)}-${dateStamp()}.log`,
  );
  if (state.logFilePath !== expectedPath) state.logFilePath = expectedPath;
  rotateCurrentLogIfNeeded();
}
function getLogFiles() {
  if (!state.logDir || !fs.existsSync(state.logDir)) return [];
  try {
    return fs
      .readdirSync(state.logDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map((entry) => {
        const filePath = path.join(state.logDir, entry.name);
        const stat = fs.statSync(filePath);
        return { filePath, name: entry.name, size: stat.size, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
  } catch {
    return [];
  }
}
function rotateCurrentLogIfNeeded() {
  if (!state.logFilePath || !fs.existsSync(state.logFilePath)) return;
  try {
    if (fs.statSync(state.logFilePath).size < state.maxBytes) return;
    fs.renameSync(state.logFilePath, state.logFilePath.replace(/\.log$/, `.${Date.now()}.log`));
  } catch {}
}
function cleanupOldLogs() {
  const cutoff = Date.now() - state.retentionDays * 24 * 60 * 60 * 1000;
  try {
    for (const file of getLogFiles()) if (file.mtimeMs < cutoff) fs.rmSync(file.filePath, { force: true });
  } catch {}
}
function cleanupTotalLogSize() {
  try {
    const files = getLogFiles();
    let total = files.reduce((sum, file) => sum + file.size, 0);
    const currentPath = state.logFilePath ? path.resolve(state.logFilePath) : "";
    for (const file of files) {
      if (total <= state.maxTotalBytes) break;
      if (currentPath && path.resolve(file.filePath) === currentPath) continue;
      fs.rmSync(file.filePath, { force: true });
      total -= file.size;
    }
  } catch {}
}
function write(level, scope, args) {
  const normalizedLevel = normalizeLogLevel(level, "info");
  const normalizedScope = typeof scope === "string" && scope.trim() ? scope.trim() : "app";
  const normalizedArgs = Array.isArray(args) ? args : [args];
  if (!shouldWrite(normalizedLevel)) return;
  const line = formatLine(normalizedLevel, normalizedScope, normalizedArgs);
  if (state.mirrorToConsole) {
    const consoleMethod = normalizedLevel === "debug" ? "debug" : normalizedLevel === "info" ? "info" : normalizedLevel;
    (originalConsole[consoleMethod] || originalConsole.log)(line);
  }
  try {
    ensureLogFile();
    fs.appendFileSync(state.logFilePath, `${line}\n`, "utf8");
    cleanupTotalLogSize();
  } catch (error) {
    originalConsole.error("[Layang][Logger] failed to write log file", error);
  }
}
function applyLoggerSettings(settings = {}, options = {}) {
  const next = normalizeSettings(settings, state);
  state.level = next.level;
  state.mirrorToConsole = next.mirrorToConsole;
  state.maxBytes = next.maxBytes;
  state.maxTotalBytes = next.maxTotalBytes;
  state.retentionDays = next.retentionDays;
  if (options.persist !== false && state.settingsFilePath) writeSettingsFile(state.settingsFilePath, next);
  cleanupOldLogs();
  cleanupTotalLogSize();
  if (!options.silent) getLogger("logger").info("logger settings updated", getLogSettings());
  return getLogInfo();
}
function getLogger(scope = "app") {
  return {
    debug: (...args) => write("debug", scope, args),
    info: (...args) => write("info", scope, args),
    warn: (...args) => write("warn", scope, args),
    error: (...args) => write("error", scope, args),
    child: (childScope) => getLogger(`${scope}:${childScope}`),
  };
}
function getLogSettings() {
  return {
    level: state.level,
    mirrorToConsole: state.mirrorToConsole,
    maxBytes: state.maxBytes,
    maxTotalBytes: state.maxTotalBytes,
    retentionDays: state.retentionDays,
  };
}
function getLogInfo() {
  const files = getLogFiles();
  return {
    initialized: state.initialized,
    logDir: state.logDir,
    logFilePath: state.logFilePath,
    settingsFilePath: state.settingsFilePath,
    isPackaged: state.isPackaged,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    fileCount: files.length,
    settings: getLogSettings(),
  };
}
function openLogFolder(shell) {
  if (!state.logDir) ensureLogFile();
  if (!shell || typeof shell.openPath !== "function")
    return Promise.resolve({ ok: false, error: "Electron shell.openPath is not available." });
  return shell
    .openPath(state.logDir)
    .then((error) => (error ? { ok: false, error } : { ok: true, path: state.logDir }));
}
function clearLogs() {
  if (!state.logDir) ensureLogFile();
  try {
    for (const file of getLogFiles()) fs.rmSync(file.filePath, { force: true });
    ensureLogFile();
    getLogger("logger").info("log files cleared");
    return { ok: true, ...getLogInfo() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
function serializeError(error) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}
function registerProcessErrorHandlers(logger = getLogger("process")) {
  process.on("uncaughtException", (error) => logger.error("uncaught exception", serializeError(error)));
  process.on("unhandledRejection", (reason) => logger.error("unhandled rejection", serializeError(reason)));
}
module.exports = {
  allowedLevels,
  applyLoggerSettings,
  clearLogs,
  configureLogger,
  getLogger,
  getLogInfo,
  getLogSettings,
  openLogFolder,
  registerProcessErrorHandlers,
  serializeError,
};
