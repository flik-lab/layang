const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyLoggerSettings,
  clearLogs,
  configureLogger,
  getLogInfo,
  getLogger,
} = require("../electron/utils/logger.cjs");

test("logger applies runtime settings and persists them", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-logger-"));
  const info = configureLogger({ userDataPath, isPackaged: true, appName: "LayangTest" });
  assert.equal(info.settings.level, "info");

  const updated = applyLoggerSettings({
    level: "debug",
    mirrorToConsole: true,
    maxBytes: 1024,
    maxTotalBytes: 2048,
    retentionDays: 3,
  });
  assert.equal(updated.settings.level, "debug");
  assert.equal(updated.settings.mirrorToConsole, true);
  assert.equal(updated.settings.maxTotalBytes, 2048);

  const settingsFile = path.join(userDataPath, "logger-settings.json");
  const saved = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  assert.equal(saved.level, "debug");
  assert.equal(saved.retentionDays, 3);
});

test("logger enforces max total log folder size", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-logger-cap-"));
  configureLogger({ userDataPath, isPackaged: true, appName: "LayangCap" });
  applyLoggerSettings({ level: "debug", maxBytes: 256, maxTotalBytes: 1024, retentionDays: 14 });
  const logger = getLogger("test");
  for (let index = 0; index < 80; index += 1) {
    logger.info("x".repeat(80), { index });
  }
  const info = getLogInfo();
  assert.ok(info.totalBytes <= info.settings.maxTotalBytes + info.settings.maxBytes);
});

test("logger clear removes log files and keeps logger usable", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "layang-logger-clear-"));
  configureLogger({ userDataPath, isPackaged: true, appName: "LayangClear" });
  getLogger("test").info("before clear");
  const cleared = clearLogs();
  assert.equal(cleared.ok, true);
  getLogger("test").info("after clear");
  const info = getLogInfo();
  assert.ok(info.fileCount >= 1);
});
