const { app, autoUpdater, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { registerGrpcMockIpc } = require("./ipc/grpc-mock-ipc.cjs");
const { registerNativeGrpcIpc } = require("./ipc/native-grpc-ipc.cjs");
const { registerWebSocketMockIpc } = require("./ipc/ws-mock-ipc.cjs");
const { registerRestMockIpc } = require("./ipc/rest-mock-ipc.cjs");
const { registerWindowIpc } = require("./ipc/window-ipc.cjs");
const { registerLoggerIpc } = require("./ipc/logger-ipc.cjs");
const {
  normalizeActiveScenarioIds,
  normalizeEnabledMethods,
  normalizeMockBindHost,
  normalizeMockServerPort,
  normalizeRuntimeStreamSettings,
  parseRuntimeScenarioText,
  stopMockServer,
} = require("./services/grpc-mock-server.cjs");
const { stopWebSocketMockServer } = require("./services/ws-mock-server.cjs");
const { stopRestMockServer } = require("./services/rest-mock-server.cjs");
const { configureLogger, getLogger, registerProcessErrorHandlers } = require("./utils/logger.cjs");
const { createWindow } = require("./window/create-window.cjs");
const { readJsonIfExists, walkDirectory, writeTextInside } = require("./utils/file-utils.cjs");
const { windowFromEvent } = require("./utils/ipc-utils.cjs");
const { safePathSegment, safeRelativePath } = require("./utils/path-utils.cjs");
const WINDOWS_APP_USER_MODEL_ID = "com.squirrel.Layang.layang";
const UPDATE_FEED_BASE_URL = "https://update.electronjs.org/flik-lab/layang";
const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const workspaceSettingsFileName = "layang-settings.json";
const mockWorkspaceWriteLockFileName = ".layang-mock-write-lock.json";
const mainLogger = getLogger("main");

startApplication();

function startApplication() {
  app.setName("Layang");

  if (handleWindowsSquirrelStartupEvent()) {
    return;
  }

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  registerWindowIpc();
  registerNativeGrpcIpc();
  registerGrpcMockIpc();
  registerWebSocketMockIpc();
  registerRestMockIpc();
  registerLoggerIpc();

  if (process.platform === "win32") {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }

  app.on("second-instance", () => {
    const existingWindow = BrowserWindow.getAllWindows()[0];
    if (!existingWindow) return;

    if (existingWindow.isMinimized()) existingWindow.restore();
    existingWindow.show();
    existingWindow.focus();
  });

  // Allow HTTPS endpoints with self-signed or otherwise untrusted certificates.
  // This is intended for the local/trusted desktop API workbench use case.
  app.on("certificate-error", (event, _webContents, url, error, _certificate, callback) => {
    event.preventDefault();
    mainLogger.warn("trusted desktop certificate override", { url, error });
    callback(true);
  });

  app.whenReady().then(() => {
    configureLogger({ app, appName: "Layang" });
    registerProcessErrorHandlers(getLogger("process"));
    mainLogger.info("app ready", { version: app.getVersion(), isPackaged: app.isPackaged });
    configureAutoUpdates();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    stopRuntimeServices("app before quit");
  });
}

function handleWindowsSquirrelStartupEvent() {
  if (process.platform !== "win32") return false;

  const squirrelEvent = process.argv.find((argument) => argument.startsWith("--squirrel-"));
  if (!squirrelEvent || squirrelEvent === "--squirrel-firstrun") return false;

  const updateExePath = path.resolve(path.dirname(process.execPath), "..", "Update.exe");
  const appExeName = path.basename(process.execPath);
  const shortcutLocations = "Desktop,StartMenu";

  const runUpdateExe = (args) => {
    try {
      spawn(updateExePath, args, { detached: true, stdio: "ignore" }).unref();
    } catch {
      // Squirrel install/update/uninstall events must exit cleanly and must not open the UI.
    }

    setTimeout(() => app.quit(), 1_000);
  };

  switch (squirrelEvent) {
    case "--squirrel-install":
    case "--squirrel-updated":
      runUpdateExe(["--createShortcut", appExeName, `--shortcut-locations=${shortcutLocations}`]);
      return true;

    case "--squirrel-uninstall":
      runUpdateExe(["--removeShortcut", appExeName, `--shortcut-locations=${shortcutLocations}`]);
      return true;

    case "--squirrel-obsolete":
      app.quit();
      return true;

    default:
      return false;
  }
}

function stopRuntimeServices(reason) {
  mainLogger.info(`${reason}: stopping mock servers`);
  void stopMockServer();
  void stopWebSocketMockServer();
  void stopRestMockServer();
}

function configureAutoUpdates() {
  if (process.env.LAYANG_DISABLE_AUTO_UPDATE === "1") {
    mainLogger.info("auto update disabled by environment variable");
    return;
  }

  if (!app.isPackaged) {
    mainLogger.info("auto update disabled outside packaged app");
    return;
  }

  if (process.platform !== "win32" && process.platform !== "darwin") {
    mainLogger.info("auto update disabled for unsupported platform", { platform: process.platform });
    return;
  }

  const feedUrl = `${UPDATE_FEED_BASE_URL}/${process.platform}-${process.arch}/${app.getVersion()}`;
  let updateCheckOrDownloadInProgress = false;
  let updateReadyToInstall = false;

  try {
    autoUpdater.setFeedURL({ url: feedUrl });
  } catch (error) {
    mainLogger.warn("failed to configure auto update feed", {
      error: error?.message ? String(error.message) : String(error),
    });
    return;
  }

  autoUpdater.on("checking-for-update", () => {
    updateCheckOrDownloadInProgress = true;
    mainLogger.info("checking for update", { feedUrl });
  });

  autoUpdater.on("update-available", () => {
    mainLogger.info("update available; downloading in background");
  });

  autoUpdater.on("update-not-available", () => {
    updateCheckOrDownloadInProgress = false;
    mainLogger.info("no update available");
  });

  autoUpdater.on("error", (error) => {
    updateCheckOrDownloadInProgress = false;
    mainLogger.warn("auto update error", {
      error: error?.message ? String(error.message) : String(error),
    });
  });

  autoUpdater.on("before-quit-for-update", () => {
    stopRuntimeServices("app before update quit");
  });

  autoUpdater.on("update-downloaded", async (_event, releaseNotes, releaseName) => {
    updateCheckOrDownloadInProgress = false;
    updateReadyToInstall = true;
    mainLogger.info("update downloaded", { releaseName });

    const result = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart & update", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Layang update ready",
      message: releaseName ? `Layang ${releaseName} is ready` : "A new Layang update is ready",
      detail:
        typeof releaseNotes === "string" && releaseNotes.trim()
          ? `${releaseNotes}\n\nRestart Layang to apply the update.`
          : "Restart Layang to apply the downloaded update.",
    });

    if (result.response === 0) autoUpdater.quitAndInstall();
  });

  const checkForUpdates = () => {
    if (updateCheckOrDownloadInProgress || updateReadyToInstall) {
      mainLogger.info("skip update check because an update check/download is already active");
      return;
    }

    try {
      updateCheckOrDownloadInProgress = true;
      autoUpdater.checkForUpdates();
    } catch (error) {
      updateCheckOrDownloadInProgress = false;
      mainLogger.warn("failed to start update check", {
        error: error?.message ? String(error.message) : String(error),
      });
    }
  };

  const firstCheckDelayMs = process.platform === "win32" && process.argv.includes("--squirrel-firstrun") ? 10_000 : 5_000;
  setTimeout(checkForUpdates, firstCheckDelayMs);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
}

ipcMain.handle("workspace:get-default-folder", async () => {
  return { ok: true, directoryPath: getConfiguredWorkspaceDirectory() };
});

ipcMain.handle("workspace:ensure-default-folder", async (_event, payload) => {
  return ensureWorkspaceFolder(getConfiguredWorkspaceDirectory(), payload?.bundle ? payload.bundle : {});
});

ipcMain.handle("workspace:ensure-folder", async (_event, payload) => {
  const directoryPath =
    payload && typeof payload.directoryPath === "string" && payload.directoryPath.trim()
      ? payload.directoryPath.trim()
      : "";
  if (!directoryPath) return { ok: false, error: "Missing workspace folder path." };

  return ensureWorkspaceFolder(directoryPath, payload?.bundle ? payload.bundle : {});
});

ipcMain.handle("workspace:get-preference", async () => {
  const preference = await readWorkspacePreference();
  const defaultDirectoryPath = getDefaultWorkspaceDirectory();
  return {
    ok: true,
    directoryPath: preference.workspaceDirectoryPath || defaultDirectoryPath,
    defaultDirectoryPath,
    hasCustomPreference: Boolean(preference.workspaceDirectoryPath),
  };
});

ipcMain.handle("workspace:set-preference", async (_event, payload) => {
  const directoryPath =
    payload && typeof payload.directoryPath === "string" && payload.directoryPath.trim()
      ? payload.directoryPath.trim()
      : "";
  await writeWorkspacePreference({ workspaceDirectoryPath: directoryPath });
  return {
    ok: true,
    directoryPath: directoryPath || getDefaultWorkspaceDirectory(),
    hasCustomPreference: Boolean(directoryPath),
  };
});

ipcMain.handle("workspace:choose-folder", async (event, payload) => {
  const win = windowFromEvent(event);
  const title =
    payload && typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "Choose Layang workspace folder";
  const directoryPath = await chooseWorkspaceDirectory(win, title);
  return directoryPath ? { ok: true, directoryPath } : { ok: false, cancelled: true };
});

ipcMain.handle("workspace:save-folder", async (event, payload) => {
  const win = windowFromEvent(event);
  const targetPath =
    payload && typeof payload.directoryPath === "string" && payload.directoryPath.trim()
      ? payload.directoryPath.trim()
      : await chooseWorkspaceDirectory(win, "Choose Layang workspace folder");

  if (!targetPath) return { ok: false, cancelled: true };

  await writeWorkspaceFolder(targetPath, payload?.bundle ? payload.bundle : {});
  return { ok: true, directoryPath: targetPath };
});

ipcMain.handle("workspace:read-mock-server", async (_event, payload) => {
  const directoryPath = payload && typeof payload.directoryPath === "string" ? payload.directoryPath.trim() : "";
  if (!directoryPath) return { ok: false, error: "Missing workspace folder path." };
  try {
    const mockServer = await readMockServerFromFolder(path.join(directoryPath, "mocks"));
    return { ok: true, mockServer };
  } catch (error) {
    return { ok: false, error: error?.message ? String(error.message) : String(error) };
  }
});

ipcMain.handle("workspace:open-path", async (_event, payload) => {
  const directoryPath = payload && typeof payload.directoryPath === "string" ? payload.directoryPath.trim() : "";
  const relativePath = payload && typeof payload.relativePath === "string" ? payload.relativePath.trim() : "";
  const ensureDirectory = Boolean(payload?.ensureDirectory);
  const reveal = Boolean(payload?.reveal);

  if (!directoryPath) return { ok: false, error: "Missing workspace folder path." };

  const rootPath = path.resolve(directoryPath);
  const targetPath = relativePath ? path.resolve(rootPath, relativePath) : rootPath;
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    return { ok: false, error: "Refusing to open a path outside the workspace folder." };
  }

  try {
    if (ensureDirectory) await fs.mkdir(targetPath, { recursive: true });
    if (reveal) {
      if (!fsSync.existsSync(targetPath)) {
        const parentPath = path.dirname(targetPath);
        await fs.mkdir(parentPath, { recursive: true });
        await fs.writeFile(targetPath, "", { flag: "a" });
      }
      shell.showItemInFolder(targetPath);
      return { ok: true, path: targetPath };
    }
    const openError = await shell.openPath(targetPath);
    return openError ? { ok: false, error: openError } : { ok: true, path: targetPath };
  } catch (error) {
    return { ok: false, error: error?.message ? String(error.message) : String(error) };
  }
});
ipcMain.handle("workspace:open-folder", async (event, payload) => {
  const win = windowFromEvent(event);
  const providedPath =
    payload && typeof payload.directoryPath === "string" && payload.directoryPath.trim()
      ? payload.directoryPath.trim()
      : "";
  const directoryPath = providedPath || (await chooseWorkspaceDirectory(win, "Open Layang workspace folder"));
  if (!directoryPath) return { ok: false, cancelled: true };

  const bundle = await readWorkspaceFolder(directoryPath);
  return { ok: true, directoryPath, bundle };
});

/**
 * Returns the default per-user workspace location.
 * The installer only installs the app. The workspace is created on first launch so it
 * always belongs to the signed-in OS user and survives app updates/uninstall unless
 * the user deletes it manually.
 */
function getDefaultWorkspaceDirectory() {
  const documentsDir = app.getPath("documents") || app.getPath("home");
  return path.join(documentsDir, "Layang", "Workspace");
}

function getWorkspaceSettingsPath() {
  return path.join(app.getPath("userData"), workspaceSettingsFileName);
}

async function readWorkspacePreference() {
  const settings = await readJsonIfExists(getWorkspaceSettingsPath()).catch(() => null);
  const workspaceDirectoryPath =
    settings && typeof settings.workspaceDirectoryPath === "string" ? settings.workspaceDirectoryPath.trim() : "";
  return { workspaceDirectoryPath };
}

async function writeWorkspacePreference(preference) {
  await writeJson(getWorkspaceSettingsPath(), {
    workspaceDirectoryPath:
      preference && typeof preference.workspaceDirectoryPath === "string"
        ? preference.workspaceDirectoryPath.trim()
        : "",
  });
}

function getConfiguredWorkspaceDirectory() {
  const settingsPath = getWorkspaceSettingsPath();
  try {
    if (fsSync.existsSync(settingsPath)) {
      const raw = fsSync.readFileSync(settingsPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.workspaceDirectoryPath === "string" && parsed.workspaceDirectoryPath.trim()) {
        return parsed.workspaceDirectoryPath.trim();
      }
    }
  } catch {
    // Fall back to the default per-user documents folder when settings are unreadable.
  }
  return getDefaultWorkspaceDirectory();
}

async function ensureWorkspaceFolder(directoryPath, bundle) {
  const snapshotPath = path.join(directoryPath, "layang.workspace.json");
  const existingSnapshot = await readJsonIfExists(snapshotPath).catch(() => null);
  if (existingSnapshot && typeof existingSnapshot === "object") {
    const storedBundle = await readWorkspaceFolder(directoryPath);
    return { ok: true, directoryPath, created: false, bundle: storedBundle };
  }

  await writeWorkspaceFolder(directoryPath, bundle);
  return { ok: true, directoryPath, created: true };
}

/**
 * Opens a native directory picker for file-based Layang workspaces.
 */
async function chooseWorkspaceDirectory(win, title) {
  const result = await dialog.showOpenDialog(win || undefined, {
    title,
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths.length) return "";
  return result.filePaths[0];
}

/**
 * Writes a portable workspace folder using both a full snapshot and Git-friendly split files.
 */
async function writeWorkspaceFolder(directoryPath, bundle) {
  await fs.mkdir(directoryPath, { recursive: true });
  const normalized = normalizeWorkspaceBundle(bundle);
  const project = normalized.project || {};
  const layout = normalized.layout || {};
  const settings = normalized.settings || {};

  await writeJson(path.join(directoryPath, "layang.workspace.json"), normalized);
  await writeJson(path.join(directoryPath, "project.json"), project);
  await writeJson(path.join(directoryPath, "layout.json"), layout);
  await writeJson(path.join(directoryPath, "settings.json"), settings);
  await writeJson(path.join(directoryPath, "environments", "environments.json"), project.environments || []);
  await writeJson(path.join(directoryPath, "examples", "examples.json"), project.examples || []);
  await writeJson(path.join(directoryPath, "docs", "published-docs.json"), project.methodDocs || []);
  await writeJson(path.join(directoryPath, "docs", "saved-results.json"), project.docResults || []);
  await writeJson(path.join(directoryPath, "collections", "collections.json"), project.collections || []);
  await writeJson(path.join(directoryPath, "requests", "tabs.json"), project.requestTabs || []);
  await writeRequestSessionFiles(directoryPath, project.requestTabs || []);
  await writeJson(path.join(directoryPath, "history", "history.json"), project.history || []);
  const mockServerProject = project.mockServer && typeof project.mockServer === "object" ? project.mockServer : {};
  await writeMockWorkspaceFilesAtomically(directoryPath, project, mockServerProject);

  const protoFiles = Array.isArray(project.protoFiles) ? project.protoFiles : [];
  await fs.rm(path.join(directoryPath, "protos"), { recursive: true, force: true });
  for (const file of protoFiles) {
    const relativePath = safeRelativePath(file?.name ? file.name : "schema.proto");
    await writeTextInside(directoryPath, path.join("protos", relativePath), String(file?.text ? file.text : ""));
  }

  const examples = Array.isArray(project.examples) ? project.examples : [];
  for (const example of examples) {
    const service = safePathSegment(example.serviceName || "service");
    const method = safePathSegment(example.methodName || "method");
    const name = safePathSegment(example.name || example.id || "example");
    await writeJson(path.join(directoryPath, "examples", service, method, `${name}.json`), example);
  }

  const docs = Array.isArray(project.methodDocs) ? project.methodDocs : [];
  for (const doc of docs) {
    if (!doc?.published) continue;
    const name = safePathSegment(`${doc.serviceName || "service"}.${doc.methodName || "method"}`);
    await writeTextInside(directoryPath, path.join("docs", `${name}.md`), String(doc.generatedMarkdown || ""));
  }

  await writeTextInside(
    directoryPath,
    ".gitignore",
    [
      "# Layang local runtime files",
      ".DS_Store",
      "node_modules/",
      "history/*.tmp",
      "secrets*.json",
      "*.local.json",
      "",
    ].join("\n"),
  );
}

/**
 * Reads a Layang workspace folder and returns a renderer-compatible workspace bundle.
 */
async function readWorkspaceFolder(directoryPath) {
  const snapshotPath = path.join(directoryPath, "layang.workspace.json");
  const snapshot = await readJsonIfExists(snapshotPath);
  if (snapshot && typeof snapshot === "object") {
    const splitMockServer = await readMockServerFromFolder(path.join(directoryPath, "mocks"));
    const splitRestMockServer = await readJsonIfExists(path.join(directoryPath, "mocks", "rest-mock-server.json"));
    const splitRequestTabs = await readRequestSessionFiles(path.join(directoryPath, "requests"));
    const splitCollections = await readJsonIfExists(path.join(directoryPath, "collections", "collections.json"));
    if (splitMockServer) {
      snapshot.project = snapshot.project || {};
      const currentMockServer = snapshot.project.mockServer || {};
      snapshot.project.mockServer = {
        ...currentMockServer,
        ...splitMockServer,
        methodFiles: { ...(currentMockServer.methodFiles || {}), ...(splitMockServer.methodFiles || {}) },
      };
    }
    if (splitRestMockServer && typeof splitRestMockServer === "object") {
      snapshot.project = snapshot.project || {};
      snapshot.project.restMockServer = splitRestMockServer;
    }
    if (splitRequestTabs.length) {
      snapshot.project = snapshot.project || {};
      snapshot.project.requestTabs = splitRequestTabs;
    }
    if (Array.isArray(splitCollections)) {
      snapshot.project = snapshot.project || {};
      snapshot.project.collections = splitCollections;
    }
    return normalizeWorkspaceBundle(snapshot);
  }

  const project = (await readJsonIfExists(path.join(directoryPath, "project.json"))) || {};
  project.protoFiles = await readProtoFilesFromFolder(path.join(directoryPath, "protos"));
  project.environments =
    (await readJsonIfExists(path.join(directoryPath, "environments", "environments.json"))) ||
    project.environments ||
    [];
  project.examples =
    (await readJsonIfExists(path.join(directoryPath, "examples", "examples.json"))) || project.examples || [];
  project.methodDocs =
    (await readJsonIfExists(path.join(directoryPath, "docs", "published-docs.json"))) || project.methodDocs || [];
  project.collections =
    (await readJsonIfExists(path.join(directoryPath, "collections", "collections.json"))) || project.collections || [];
  project.docResults =
    (await readJsonIfExists(path.join(directoryPath, "docs", "saved-results.json"))) || project.docResults || [];
  const splitRequestTabs = await readRequestSessionFiles(path.join(directoryPath, "requests"));
  project.requestTabs = splitRequestTabs.length
    ? splitRequestTabs
    : (await readJsonIfExists(path.join(directoryPath, "requests", "tabs.json"))) || project.requestTabs || [];
  project.history =
    (await readJsonIfExists(path.join(directoryPath, "history", "history.json"))) || project.history || [];
  project.restMockServer =
    (await readJsonIfExists(path.join(directoryPath, "mocks", "rest-mock-server.json"))) ||
    project.restMockServer ||
    {};
  const mockSettings =
    (await readJsonIfExists(path.join(directoryPath, "mocks", "mock-server.json"))) || project.mockServer || {};
  const splitMockServer = await readMockServerFromFolder(path.join(directoryPath, "mocks"));
  project.mockServer = splitMockServer
    ? {
        ...mockSettings,
        ...splitMockServer,
        methodFiles: { ...(mockSettings.methodFiles || {}), ...(splitMockServer.methodFiles || {}) },
      }
    : mockSettings;

  return normalizeWorkspaceBundle({
    type: "layang-workspace",
    version: 4,
    exportedAt: new Date().toISOString(),
    app: "Layang",
    project,
    layout: (await readJsonIfExists(path.join(directoryPath, "layout.json"))) || {},
    settings: (await readJsonIfExists(path.join(directoryPath, "settings.json"))) || {},
  });
}

/**
 * Normalizes old gRPC Lab and new Layang workspace bundle envelopes.
 */
function normalizeWorkspaceBundle(bundle) {
  const input = bundle && typeof bundle === "object" ? bundle : {};
  return {
    type: "layang-workspace",
    version: 4,
    exportedAt: input.exportedAt || new Date().toISOString(),
    app: "Layang",
    project: input.project || input.workspace || {},
    layout: input.layout || {},
    settings: input.settings || {},
  };
}

/**
 * Returns the marker file used to tell runtime watchers that a mock workspace save is still in progress.
 */
function mockWorkspaceWriteLockPath(directoryPath) {
  return path.join(directoryPath, "mocks", mockWorkspaceWriteLockFileName);
}

/**
 * Writes gRPC/REST mock config plus split scenario files under a short-lived lock.
 *
 * The running gRPC mock server watches these files for hot reload. Without a lock and
 * atomic directory replacement, a watcher can reload exactly after mocks/scenarios is
 * removed but before the new files are written, which makes the runtime fall back to
 * an empty/default scenario set for one iteration.
 */
async function writeMockWorkspaceFilesAtomically(directoryPath, project, mockServerProject) {
  const mocksDir = path.join(directoryPath, "mocks");
  const lockPath = mockWorkspaceWriteLockPath(directoryPath);
  await fs.mkdir(mocksDir, { recursive: true });
  await writeJson(lockPath, {
    status: "writing",
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  try {
    await writeJson(path.join(mocksDir, "mock-server.json"), {
      port: normalizeMockServerPort(mockServerProject.port || 50055),
      bindHost: normalizeMockBindHost(mockServerProject.bindHost || "127.0.0.1"),
      format: mockServerProject.format === "yaml" ? "yaml" : "json",
      updatedAt:
        typeof mockServerProject.updatedAt === "string" && mockServerProject.updatedAt.trim()
          ? mockServerProject.updatedAt
          : project.updatedAt || new Date().toISOString(),
      streamDefaults: normalizeRuntimeStreamSettings(mockServerProject.streamDefaults || {}, {
        intervalMs: 1000,
        loop: false,
        maxLoops: 0,
      }),
      selectedScenarioIds: normalizeActiveScenarioIds(
        mockServerProject.selectedScenarioIds || mockServerProject.activeScenarioIds || {},
      ),
      enabledMethods: normalizeEnabledMethods(mockServerProject.enabledMethods || {}),
    });
    await writeJson(
      path.join(mocksDir, "rest-mock-server.json"),
      project.restMockServer || {
        port: 3007,
        bindHost: "127.0.0.1",
        scenarios: [],
      },
    );

    const mockMethodFiles =
      mockServerProject.methodFiles && typeof mockServerProject.methodFiles === "object"
        ? mockServerProject.methodFiles
        : {};
    const mockFileKeys = Object.keys(mockMethodFiles);
    const scenariosDir = path.join(mocksDir, "scenarios");

    if (mockFileKeys.length) {
      await writeScenarioFilesIncrementally(
        scenariosDir,
        mockMethodFiles,
        normalizeMockServerPort(mockServerProject.port || 50055),
      );
    } else {
      await writeEmptyScenarioManifest(scenariosDir);
      if (project.mockServer?.scenarioText) {
        const ext = project.mockServer.format === "yaml" ? "yaml" : "json";
        await writeTextInside(
          directoryPath,
          path.join("mocks", `scenarios.${ext}`),
          String(project.mockServer.scenarioText),
        );
      }
    }
  } finally {
    await fs.rm(lockPath, { force: true }).catch(() => undefined);
  }
}

/**
 * Writes split mock scenario files incrementally.
 *
 * Windows frequently locks directories that are being watched by Electron, editors,
 * antivirus, or the Next dev server. For that reason mocks/scenarios is treated like
 * a normal workspace tree: individual scenario files are updated in place, then
 * manifest.json is written last as the source of truth. We never rename or replace
 * the whole scenarios directory during normal autosave.
 */
async function writeScenarioFilesIncrementally(scenariosDir, mockMethodFiles, fallbackPort) {
  await fs.mkdir(scenariosDir, { recursive: true });

  const manifest = { version: 1, layout: "scenario-files-v1", methods: {} };
  const usedRelativeFiles = new Set();
  const activeRelativeFiles = new Set(["manifest.json"]);

  for (const key of Object.keys(mockMethodFiles || {})) {
    const file = mockMethodFiles[key] || {};
    const parsed = parseRuntimeScenarioText(
      String(file.scenarioText || ""),
      file.format === "yaml" ? "yaml" : "json",
      fallbackPort,
    );
    const methodDir = safePathSegment(key.replace("/", ".")) || "method";
    manifest.methods[key] = { format: "json", scenarios: {} };

    for (const scenario of parsed.scenarios || []) {
      const scenarioId = String(scenario.id || "scenario").trim() || "scenario";
      const baseName = safePathSegment(scenarioId) || "scenario";
      let relativeFile = `${methodDir}/${baseName}.json`;
      let counter = 2;
      while (usedRelativeFiles.has(relativeFile)) {
        relativeFile = `${methodDir}/${baseName}-${counter}.json`;
        counter += 1;
      }
      usedRelativeFiles.add(relativeFile);
      activeRelativeFiles.add(relativeFile);
      manifest.methods[key].scenarios[scenarioId] = { file: relativeFile, format: "json" };
      await writeJson(path.join(scenariosDir, relativeFile), scenario);
    }
  }

  await writeJson(path.join(scenariosDir, "manifest.json"), manifest);
  await pruneScenarioFilesNotInManifest(scenariosDir, activeRelativeFiles).catch(() => undefined);
}

async function writeEmptyScenarioManifest(scenariosDir) {
  await fs.mkdir(scenariosDir, { recursive: true });
  await writeJson(path.join(scenariosDir, "manifest.json"), {
    version: 1,
    layout: "scenario-files-v1",
    methods: {},
  });
  await pruneScenarioFilesNotInManifest(scenariosDir, new Set(["manifest.json"])).catch(() => undefined);
}

async function pruneScenarioFilesNotInManifest(scenariosDir, activeRelativeFiles) {
  await walkDirectory(scenariosDir, async (filePath) => {
    const relative = path.relative(scenariosDir, filePath).replace(/\\/g, "/");
    if (activeRelativeFiles.has(relative)) return;
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".json" && ext !== ".yaml" && ext !== ".yml") return;
    await fs.rm(filePath, { force: true }).catch(() => undefined);
  });

  await removeEmptyDirectories(scenariosDir, scenariosDir).catch(() => undefined);
}

async function removeEmptyDirectories(rootDir, currentDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    await removeEmptyDirectories(rootDir, path.join(currentDir, entry.name));
  }
  if (currentDir === rootDir) return;
  const remaining = await fs.readdir(currentDir).catch(() => []);
  if (remaining.length === 0) await fs.rmdir(currentDir).catch(() => undefined);
}

/**
 * Replaces a directory by preparing the complete next contents in a sibling temp
 * directory first, then swapping it into place. Watchers may still receive rename
 * events, but they never need to observe a half-written scenarios directory.
 */
async function _replaceDirectoryAtomically(targetDir, writeTempDirectory) {
  const parentDir = path.dirname(targetDir);
  const baseName = path.basename(targetDir);
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpDir = path.join(parentDir, `.${baseName}.tmp-${suffix}`);
  const backupDir = path.join(parentDir, `.${baseName}.bak-${suffix}`);

  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(backupDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  let movedExisting = false;
  try {
    await writeTempDirectory(tmpDir);
    await fs.rename(targetDir, backupDir).then(
      () => {
        movedExisting = true;
      },
      (error) => {
        if (error?.code !== "ENOENT") throw error;
      },
    );
    await fs.rename(tmpDir, targetDir);
    await fs.rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    const shouldFallbackInPlace = error?.code === "EPERM" || error?.code === "EBUSY" || error?.code === "EACCES";
    if (shouldFallbackInPlace) {
      await replaceDirectoryInPlace(targetDir, tmpDir);
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      await fs.rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
      return;
    }

    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    if (movedExisting) {
      await fs.rename(backupDir, targetDir).catch(() => undefined);
    } else {
      await fs.rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
    }
    throw error;
  }
}

async function replaceDirectoryInPlace(targetDir, sourceDir) {
  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(sourceDir, targetDir, { recursive: true, force: true });

  // Best-effort cleanup only. On Windows, dev servers, editors, or file watchers can
  // briefly lock scenario files/folders; stale files are harmless because manifest.json
  // is the source of truth for scenario discovery.
  await pruneDirectoryEntriesNotInSource(targetDir, sourceDir).catch(() => undefined);
}

async function pruneDirectoryEntriesNotInSource(targetDir, sourceDir) {
  const [targetEntries, sourceEntries] = await Promise.all([
    fs.readdir(targetDir, { withFileTypes: true }).catch(() => []),
    fs.readdir(sourceDir, { withFileTypes: true }).catch(() => []),
  ]);
  const sourceNames = new Set(sourceEntries.map((entry) => entry.name));
  for (const entry of targetEntries) {
    const targetPath = path.join(targetDir, entry.name);
    const sourcePath = path.join(sourceDir, entry.name);
    if (!sourceNames.has(entry.name)) {
      await fs.rm(targetPath, { recursive: true, force: true }).catch(() => undefined);
      continue;
    }
    if (entry.isDirectory()) {
      await pruneDirectoryEntriesNotInSource(targetPath, sourcePath).catch(() => undefined);
    }
  }
}

/**
 * Writes a text file and creates its parent folder.
 */
async function _writeTextFile(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
}

/**
 * Writes JSON with stable pretty formatting.
 */
async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Writes each request tab as its own Git-friendly JSON file.
 */
async function writeRequestSessionFiles(directoryPath, requestTabs) {
  const requestsDir = path.join(directoryPath, "requests", "items");
  await fs.rm(requestsDir, { recursive: true, force: true });
  const sessions = Array.isArray(requestTabs) ? requestTabs : [];
  const manifest = [];
  for (const session of sessions) {
    if (!session || typeof session !== "object" || !session.methodKey) continue;
    const serviceMethod = String(session.methodKey).replace("/", ".");
    const base = safePathSegment(`${serviceMethod}.${session.title || session.id || "request"}`);
    const fileName = `${base}.json`;
    const envelope = {
      type: "layang-request",
      version: 1,
      id: session.id || base,
      title: session.title || session.methodKey,
      methodKey: session.methodKey,
      serviceName: session.serviceName || String(session.methodKey).split("/")[0] || "",
      transportMode: session.transportMode || "native-grpc",
      requestKind: session.requestKind || (session.transportMode === "websocket" ? "websocket" : "grpc"),
      requestUrl: session.requestUrl || session.baseUrl || "",
      httpMethod: session.httpMethod || "",
      environmentKey: session.environmentKey || "default",
      baseUrl: session.baseUrl || session.requestUrl || "",
      nativeTarget: session.nativeTarget || "",
      requestJson: session.requestJson || "{}",
      metadata: Array.isArray(session.metadata) ? session.metadata : [],
      assertionJson: session.assertionJson || "",
      responseTab: session.responseTab || "messages",
      status: session.status || "idle",
      openedAt: session.openedAt || new Date().toISOString(),
      updatedAt: session.updatedAt || new Date().toISOString(),
    };
    await writeJson(path.join(requestsDir, fileName), envelope);
    manifest.push({
      id: envelope.id,
      methodKey: envelope.methodKey,
      title: envelope.title,
      file: `items/${fileName}`,
      updatedAt: envelope.updatedAt,
    });
  }
  await writeJson(path.join(directoryPath, "requests", "manifest.json"), { version: 1, requests: manifest });
}

/**
 * Reads Git-friendly per-request files. Falls back to tabs.json outside this helper.
 */
async function readRequestSessionFiles(requestsDir) {
  const output = [];
  await walkDirectory(path.join(requestsDir, "items"), async (filePath) => {
    if (!filePath.toLowerCase().endsWith(".json")) return;
    const record = await readJsonIfExists(filePath);
    const session = normalizeRequestSessionFile(record);
    if (session) output.push(session);
  });
  output.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return output;
}

function normalizeRequestTransportMode(value) {
  if (value === "websocket") return "websocket";
  if (value === "grpc-web") return "grpc-web";
  return "native-grpc";
}

function normalizeRequestSessionFile(record) {
  if (!record || typeof record !== "object") return null;
  const methodKey = String(record.methodKey || "").trim();
  if (!methodKey) return null;
  const [serviceName, methodName] = methodKey.split("/");
  return {
    id: String(record.id || safePathSegment(methodKey)),
    methodKey,
    title: String(record.title || methodName || methodKey),
    serviceName: String(record.serviceName || serviceName || ""),
    requestJson:
      typeof record.requestJson === "string" ? record.requestJson : JSON.stringify(record.request || {}, null, 2),
    metadata: Array.isArray(record.metadata) ? record.metadata : [],
    transportMode: normalizeRequestTransportMode(record.transportMode),
    requestKind: record.requestKind === "websocket" ? "websocket" : record.requestKind === "grpc" ? "grpc" : undefined,
    requestUrl: String(record.requestUrl || record.url || record.baseUrl || ""),
    httpMethod: String(record.httpMethod || record.method || ""),
    baseUrl: String(record.baseUrl || record.requestUrl || record.url || ""),
    nativeTarget: String(record.nativeTarget || ""),
    environmentKey: String(record.environmentKey || "default"),
    assertionJson: String(record.assertionJson || ""),
    responseTab: String(record.responseTab || "messages"),
    events: [],
    lastResult: null,
    assertionResults: [],
    running: false,
    status: ["done", "error", "cancelled"].includes(record.status) ? record.status : "idle",
    openedAt: String(record.openedAt || new Date().toISOString()),
    updatedAt: String(record.updatedAt || new Date().toISOString()),
  };
}

/**
 * Reads every proto file from a workspace protos folder.
 */
async function readProtoFilesFromFolder(protosDir) {
  const output = [];
  await walkDirectory(protosDir, async (filePath) => {
    if (!filePath.toLowerCase().endsWith(".proto")) return;
    const relative = path.relative(protosDir, filePath).replace(/\\/g, "/");
    output.push({ name: relative, text: await fs.readFile(filePath, "utf8") });
  });
  return output;
}

/**
 * Reads mock server scenario editor files from a workspace folder.
 * Supports the new external mock split layout under mocks/scenarios/*.json|yaml and the legacy combined file.
 */

async function readScenarioGroupsFromSplitDirectory(splitDir, port) {
  const manifestPath = path.join(splitDir, "manifest.json");
  const manifest = await readJsonIfExists(manifestPath).catch(() => null);
  if (manifest && typeof manifest === "object" && manifest.layout === "scenario-files-v1") {
    return readScenarioGroupsFromManifest(splitDir, manifest, port);
  }

  const methodScenarioGroups = {};
  await walkDirectory(splitDir, async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".json" && ext !== ".yaml" && ext !== ".yml") return;
    if (path.basename(filePath).toLowerCase() === "manifest.json") return;
    const format = ext === ".json" ? "json" : "yaml";
    const text = await fs.readFile(filePath, "utf8");
    const parsed = parseRuntimeScenarioText(text, format, port);
    for (const scenario of parsed.scenarios || []) {
      const key = `${scenario.service}/${scenario.method}`;
      if (!methodScenarioGroups[key]) methodScenarioGroups[key] = [];
      methodScenarioGroups[key].push(scenario);
    }
  });
  return methodScenarioGroups;
}

async function readScenarioGroupsFromManifest(splitDir, manifest, port) {
  const methodScenarioGroups = {};
  const methods = manifest.methods && typeof manifest.methods === "object" ? manifest.methods : {};
  for (const [key, entry] of Object.entries(methods)) {
    const scenarios =
      entry && typeof entry === "object" && entry.scenarios && typeof entry.scenarios === "object"
        ? entry.scenarios
        : {};
    methodScenarioGroups[key] = [];
    for (const descriptor of Object.values(scenarios)) {
      if (!descriptor || typeof descriptor !== "object" || !descriptor.file) continue;
      const relativeFile = String(descriptor.file);
      if (relativeFile.includes("..") || path.isAbsolute(relativeFile)) continue;
      const format = descriptor.format === "yaml" || descriptor.format === "yml" ? "yaml" : "json";
      const filePath = path.join(splitDir, relativeFile);
      const text = await fs.readFile(filePath, "utf8");
      const parsed = parseRuntimeScenarioText(text, format, port);
      methodScenarioGroups[key].push(...(parsed.scenarios || []));
    }
  }
  return methodScenarioGroups;
}

async function readMockServerFromFolder(mocksDir) {
  const serverConfig = (await readJsonIfExists(path.join(mocksDir, "mock-server.json")).catch(() => ({}))) || {};
  const port = normalizeMockServerPort(serverConfig.port || 50055);
  const bindHost = normalizeMockBindHost(serverConfig.bindHost || serverConfig.bind_host || "127.0.0.1");
  const formatDefault = serverConfig.format === "yaml" ? "yaml" : "json";
  const streamDefaults = normalizeRuntimeStreamSettings(
    serverConfig.streamDefaults || serverConfig.stream_defaults || {},
    { intervalMs: 1000, loop: false, maxLoops: 0 },
  );
  const selectedScenarioIds = normalizeActiveScenarioIds(
    serverConfig.selectedScenarioIds ||
      serverConfig.selected_scenario_ids ||
      serverConfig.activeScenarioIds ||
      serverConfig.active_scenario_ids ||
      {},
  );
  const enabledMethods = normalizeEnabledMethods(serverConfig.enabledMethods || serverConfig.enabled_methods || {});
  const splitDir = path.join(mocksDir, "scenarios");
  const methodScenarioGroups = await readScenarioGroupsFromSplitDirectory(splitDir, port);
  const methodFiles = {};
  for (const [key, scenarios] of Object.entries(methodScenarioGroups)) {
    methodFiles[key] = {
      format: "json",
      scenarioText: JSON.stringify({ version: 1, scenarios }, null, 2),
      updatedAt: new Date().toISOString(),
    };
  }
  if (Object.keys(methodFiles).length) {
    return {
      port,
      bindHost,
      format: formatDefault,
      streamDefaults,
      selectedScenarioIds,
      enabledMethods,
      scenarioText: JSON.stringify({ version: 1, scenarios: [] }, null, 2),
      methodFiles,
      updatedAt: new Date().toISOString(),
    };
  }

  const jsonPath = path.join(mocksDir, "scenarios.json");
  const yamlPath = path.join(mocksDir, "scenarios.yaml");
  try {
    return {
      port,
      bindHost,
      format: "json",
      streamDefaults,
      selectedScenarioIds,
      enabledMethods,
      scenarioText: await fs.readFile(jsonPath, "utf8"),
      methodFiles: {},
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  try {
    return {
      port,
      bindHost,
      format: "yaml",
      streamDefaults,
      selectedScenarioIds,
      enabledMethods,
      scenarioText: await fs.readFile(yamlPath, "utf8"),
      methodFiles: {},
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  return null;
}
