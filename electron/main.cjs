const { app, autoUpdater, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { registerGrpcMockIpc } = require("./ipc/grpc-mock-ipc.cjs");
const { registerGrpcGatewayIpc } = require("./ipc/grpc-gateway-ipc.cjs");
const { registerNativeGrpcIpc } = require("./ipc/native-grpc-ipc.cjs");
const { registerWebSocketMockIpc } = require("./ipc/ws-mock-ipc.cjs");
const { registerRestMockIpc } = require("./ipc/rest-mock-ipc.cjs");
const { registerWindowIpc } = require("./ipc/window-ipc.cjs");
const { registerLoggerIpc } = require("./ipc/logger-ipc.cjs");
const { registerCertificateSettingsIpc } = require("./ipc/certificate-settings-ipc.cjs");
const { registerAppZoomIpc } = require("./ipc/app-zoom-ipc.cjs");
const { registerGitIpc } = require("./ipc/git-ipc.cjs");
const { registerCliIpc, stopActiveCliRuns } = require("./ipc/cli-ipc.cjs");
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
const { stopAllGatewayProfiles } = require("./services/grpc-gateway-server.cjs");
const { stopRestMockServer } = require("./services/rest-mock-server.cjs");
const { configureLogger, getLogger, registerProcessErrorHandlers } = require("./utils/logger.cjs");
const { configureCertificateSettings, shouldAllowCertificateError } = require("./utils/certificate-settings.cjs");
const { configureAppZoomSettings } = require("./utils/app-zoom-settings.cjs");
const { configureSecureSecrets } = require("./utils/secure-secrets.cjs");
const { configureWebHttpsCertificates } = require("./utils/web-https-certificates.cjs");
const { createWindow } = require("./window/create-window.cjs");
const { readJsonIfExists, walkDirectory, writeTextInside } = require("./utils/file-utils.cjs");
const { windowFromEvent } = require("./utils/ipc-utils.cjs");
const { safePathSegment } = require("./utils/path-utils.cjs");
const { findWorkspaceArgument } = require("./utils/launch-args.cjs");
const { ROOT_FILE: gitWorkspaceRootFile, readGitWorkspace, writeGitWorkspace } = require("../lib/git-workspace.cjs");
const { exportBundleVersion: WORKSPACE_EXPORT_VERSION } = require("../lib/workspace-versions.json");
const {
  hasRecognizedLegacyWorkspaceFiles,
  migrateLegacyWorkspaceTransaction,
} = require("./services/workspace-migration.cjs");
const { buildDocumentation, checkDocumentation } = require("../lib/docs-workspace.cjs");
const WINDOWS_APP_USER_MODEL_ID = "com.squirrel.Layang.layang";
const UPDATE_FEED_BASE_URL = "https://update.electronjs.org/flik-lab/layang";
const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const workspaceSettingsFileName = "layang-settings.json";
const mockWorkspaceWriteLockFileName = ".layang-mock-write-lock.json";
const mainLogger = getLogger("main");
let pendingDeepLink = findDeepLink(process.argv);
let pendingWorkspaceOpen = findWorkspaceArgument(process.argv);
const workspaceInternalWriteAt = new Map();
const workspaceInternalFingerprint = new Map();
const workspaceWriteInProgress = new Set();

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
  registerGrpcGatewayIpc();
  registerWebSocketMockIpc();
  registerRestMockIpc();
  registerLoggerIpc();
  registerCertificateSettingsIpc();
  registerAppZoomIpc();
  registerGitIpc();
  registerCliIpc();

  if (process.platform === "win32") {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }
  registerLayangProtocol();

  app.on("second-instance", (_event, commandLine) => {
    const deepLink = findDeepLink(commandLine);
    if (deepLink) dispatchDeepLink(deepLink);
    const workspacePath = findWorkspaceArgument(commandLine);
    if (workspacePath) dispatchWorkspaceOpen(workspacePath);
    const existingWindow = BrowserWindow.getAllWindows()[0];
    if (!existingWindow) return;

    if (existingWindow.isMinimized()) existingWindow.restore();
    existingWindow.show();
    existingWindow.focus();
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    dispatchDeepLink(url);
  });

  app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
    const applicationWindow = BrowserWindow.fromWebContents(webContents);
    if (!applicationWindow) {
      mainLogger.warn("certificate error rejected outside Layang application window", { url, error });
      callback(false);
      return;
    }

    const decision = shouldAllowCertificateError(certificate, { url });
    if (decision.allow) {
      event.preventDefault();
      mainLogger.warn("desktop certificate error accepted by user policy", { url, error, reason: decision.reason });
      callback(true);
      return;
    }

    mainLogger.warn("desktop certificate error rejected", { url, error, reason: decision.reason });
    callback(false);
  });

  app.whenReady().then(async () => {
    configureLogger({ app, appName: "Layang" });
    configureCertificateSettings({ app });
    configureSecureSecrets({ app });
    configureWebHttpsCertificates({ app });
    configureAppZoomSettings({ app });
    registerProcessErrorHandlers(getLogger("process"));
    mainLogger.info("app ready", { version: app.getVersion(), isPackaged: app.isPackaged });
    if (pendingWorkspaceOpen) {
      await writeWorkspacePreference({ workspaceDirectoryPath: pendingWorkspaceOpen }).catch((error) => {
        mainLogger.warn("failed to persist CLI launch workspace", {
          error: error?.message ? String(error.message) : String(error),
        });
      });
    }
    configureAutoUpdates();
    const win = createWindow();
    win.webContents.once("did-finish-load", () => {
      if (pendingDeepLink) {
        win.webContents.send("layang:deep-link", pendingDeepLink);
        pendingDeepLink = "";
      }
      if (pendingWorkspaceOpen) {
        win.webContents.send("workspace:open-request", pendingWorkspaceOpen);
        pendingWorkspaceOpen = "";
      }
    });

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

function registerLayangProtocol() {
  try {
    if (process.defaultApp && process.argv[1]) {
      app.setAsDefaultProtocolClient("layang", process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient("layang");
    }
  } catch (error) {
    mainLogger.warn("failed to register layang protocol", {
      error: error?.message ? String(error.message) : String(error),
    });
  }
}

function findDeepLink(argumentsList) {
  return (
    (Array.isArray(argumentsList) ? argumentsList : []).find(
      (item) => typeof item === "string" && item.startsWith("layang://"),
    ) || ""
  );
}

function dispatchDeepLink(url) {
  if (!url?.startsWith("layang://")) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.webContents.isLoading()) {
    pendingDeepLink = url;
    return;
  }
  win.webContents.send("layang:deep-link", url);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function dispatchWorkspaceOpen(directoryPath) {
  if (!directoryPath) return;
  const resolvedPath = path.resolve(directoryPath);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.webContents.isLoading()) {
    pendingWorkspaceOpen = resolvedPath;
    return;
  }
  win.webContents.send("workspace:open-request", resolvedPath);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
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
  stopActiveCliRuns();
  void stopMockServer();
  void stopAllGatewayProfiles();
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

  const firstCheckDelayMs =
    process.platform === "win32" && process.argv.includes("--squirrel-firstrun") ? 10_000 : 5_000;
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

ipcMain.handle("workspace:migrate-legacy-local-state", async (_event, payload) => {
  const directoryPath =
    payload && typeof payload.directoryPath === "string" && payload.directoryPath.trim()
      ? payload.directoryPath.trim()
      : getConfiguredWorkspaceDirectory();
  const bundle = payload?.bundle ? payload.bundle : {};
  const sourceFingerprint = crypto.createHash("sha256").update(JSON.stringify(bundle)).digest("hex");

  try {
    await fs.mkdir(directoryPath, { recursive: true });

    if (fsSync.existsSync(path.join(directoryPath, gitWorkspaceRootFile))) {
      return {
        ok: true,
        status: "already-current",
        migrated: false,
        existing: true,
        directoryPath,
        bundle: await readWorkspaceFolder(directoryPath),
        sourceFingerprint,
      };
    }

    if (await hasRecognizedLegacyWorkspaceFiles(directoryPath)) {
      const legacyBundle = await readWorkspaceFolder(directoryPath);
      const migration = await migrateLegacyWorkspaceTransaction(directoryPath, legacyBundle);
      return {
        ok: true,
        status: "migrated",
        migrated: true,
        existing: true,
        directoryPath,
        bundle: workspaceBundleFromGit(migration.workspace),
        backupPath: migration.backupPath,
        cleanupWarning: migration.cleanupWarning,
        sourceFingerprint,
      };
    }

    const entries = (await fs.readdir(directoryPath)).filter((name) => name !== ".layang");
    if (entries.length > 0) {
      return {
        ok: false,
        status: "skipped",
        directoryPath,
        sourceFingerprint,
        error:
          "Legacy workspace migration target is not empty and does not contain a recognized Layang workspace. " +
          "Choose another workspace folder to avoid overwriting unrelated files.",
      };
    }

    const normalized = normalizeWorkspaceBundle(bundle);
    const backupPath = await backupLegacyLocalStateBundle(directoryPath, normalized);
    const migration = await migrateLegacyWorkspaceTransaction(directoryPath, normalized);
    return {
      ok: true,
      status: "migrated",
      migrated: true,
      existing: false,
      directoryPath,
      bundle: workspaceBundleFromGit(migration.workspace),
      backupPath: backupPath || migration.backupPath,
      cleanupWarning: migration.cleanupWarning,
      sourceFingerprint,
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      directoryPath,
      sourceFingerprint,
      error: error?.message ? String(error.message) : String(error),
    };
  }
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

ipcMain.handle("workspace:create-folder", async (event, payload) => {
  const win = windowFromEvent(event);
  const providedPath =
    payload && typeof payload.directoryPath === "string" && payload.directoryPath.trim()
      ? payload.directoryPath.trim()
      : "";
  const targetPath =
    providedPath || (await chooseWorkspaceDirectory(win, "Create or choose a new Layang workspace folder"));
  if (!targetPath) return { ok: false, cancelled: true };

  try {
    await fs.mkdir(targetPath, { recursive: true });
    const entries = await fs.readdir(targetPath);
    if (entries.includes(gitWorkspaceRootFile) || entries.includes("layang.workspace.json")) {
      return {
        ok: false,
        error: "The selected folder already contains a Layang workspace. Use Open workspace folder instead.",
      };
    }
    if (entries.length > 0) {
      return {
        ok: false,
        error: "Choose an empty folder for a new workspace to avoid mixing unrelated files.",
      };
    }
    await writeWorkspaceFolder(targetPath, payload?.bundle ? payload.bundle : {});
    return { ok: true, created: true, directoryPath: targetPath };
  } catch (error) {
    return { ok: false, error: error?.message ? String(error.message) : String(error) };
  }
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
    // Git-friendly workspaces store gRPC mock state under mocks/grpc/*.yml.
    // Reading the legacy mocks/mock-server.json tree here can return a stale
    // snapshot and overwrite the live editor when Start is clicked.
    const gitWorkspace = await readGitWorkspace(directoryPath);
    if (gitWorkspace?.mockServer) return { ok: true, mockServer: gitWorkspace.mockServer };
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
ipcMain.handle("workspace:get-revision", async (_event, payload) => {
  const directoryPath = payload && typeof payload.directoryPath === "string" ? payload.directoryPath.trim() : "";
  if (!directoryPath) return { ok: false, error: "Missing workspace folder path." };
  try {
    const fingerprint = await computeWorkspaceRevision(directoryPath);
    return {
      ok: true,
      directoryPath: path.resolve(directoryPath),
      fingerprint,
      internalWriteAt: workspaceInternalWriteAt.get(path.resolve(directoryPath)) || 0,
      internalFingerprint: workspaceInternalFingerprint.get(path.resolve(directoryPath)) || "",
      writeInProgress: workspaceWriteInProgress.has(path.resolve(directoryPath)),
    };
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

  try {
    const opened = await openWorkspaceFolder(directoryPath);
    return { ok: true, directoryPath, ...opened };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      directoryPath,
      error: error?.message ? String(error.message) : String(error),
    };
  }
});

ipcMain.handle("docs:build", async (_event, payload) => {
  const directoryPath = payload && typeof payload.directoryPath === "string" ? payload.directoryPath.trim() : "";
  if (!directoryPath) return { ok: false, error: "Save or open a workspace folder before publishing documentation." };
  try {
    const report = await buildDocumentation(directoryPath, {
      pageId: typeof payload?.pageId === "string" ? payload.pageId : "",
      collection: typeof payload?.collection === "string" ? payload.collection : "",
      request: typeof payload?.request === "string" ? payload.request : "",
      workspaceName: typeof payload?.workspaceName === "string" ? payload.workspaceName : path.basename(directoryPath),
    });
    return { ok: report.ok, report };
  } catch (error) {
    return { ok: false, error: error?.message ? String(error.message) : String(error) };
  }
});

ipcMain.handle("docs:check", async (_event, payload) => {
  const directoryPath = payload && typeof payload.directoryPath === "string" ? payload.directoryPath.trim() : "";
  if (!directoryPath) return { ok: false, error: "Missing workspace folder path." };
  try {
    const report = await checkDocumentation(directoryPath, {
      collection: typeof payload?.collection === "string" ? payload.collection : "",
      request: typeof payload?.request === "string" ? payload.request : "",
    });
    return { ok: report.ok, report };
  } catch (error) {
    return { ok: false, error: error?.message ? String(error.message) : String(error) };
  }
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
  await fs.mkdir(directoryPath, { recursive: true });
  if (fsSync.existsSync(path.join(directoryPath, gitWorkspaceRootFile))) {
    return {
      ok: true,
      status: "already-current",
      directoryPath,
      created: false,
      bundle: await readWorkspaceFolder(directoryPath),
    };
  }
  if (await hasRecognizedLegacyWorkspaceFiles(directoryPath)) {
    const legacyBundle = await readWorkspaceFolder(directoryPath);
    const migration = await migrateLegacyWorkspaceTransaction(directoryPath, legacyBundle);
    return {
      ok: true,
      status: "migrated",
      directoryPath,
      created: false,
      migrated: true,
      bundle: workspaceBundleFromGit(migration.workspace),
      backupPath: migration.backupPath,
      cleanupWarning: migration.cleanupWarning,
    };
  }

  await writeWorkspaceFolder(directoryPath, bundle);
  return { ok: true, status: "created", directoryPath, created: true };
}

async function backupLegacyLocalStateBundle(directoryPath, bundle) {
  const backupDir = path.join(directoryPath, ".layang", "backups", "legacy-local-storage-v2");
  const backupPath = path.join(backupDir, "layang.workspace.json");
  await fs.mkdir(backupDir, { recursive: true });
  await writeJson(backupPath, {
    version: 1,
    source: "electron-local-storage",
    capturedAt: new Date().toISOString(),
    bundle,
  });
  return backupPath;
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
  const resolvedDirectory = path.resolve(directoryPath);
  workspaceWriteInProgress.add(resolvedDirectory);
  workspaceInternalWriteAt.set(resolvedDirectory, Date.now());
  try {
    await fs.mkdir(resolvedDirectory, { recursive: true });
    const normalized = normalizeWorkspaceBundle(bundle);
    await writeGitWorkspace(resolvedDirectory, normalized);
    workspaceInternalFingerprint.set(resolvedDirectory, await computeWorkspaceRevision(resolvedDirectory));
  } finally {
    workspaceInternalWriteAt.set(resolvedDirectory, Date.now());
    workspaceWriteInProgress.delete(resolvedDirectory);
  }
}

async function computeWorkspaceRevision(directoryPath) {
  const root = path.resolve(directoryPath);
  const records = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && [".git", ".layang", "node_modules", ".next", "out", "dist"].includes(entry.name))
        continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        if (relative === "docs/site" || relative === "docs/published" || relative === "docs/wiki-export") continue;
        await visit(absolute);
      } else if (entry.isFile()) {
        const stat = await fs.stat(absolute);
        records.push(`${relative}:${stat.size}:${Math.trunc(stat.mtimeMs)}`);
      }
    }
  }
  await visit(root);
  return crypto.createHash("sha1").update(records.join("\n")).digest("hex");
}

/**
 * Reads a Layang workspace folder and returns a renderer-compatible workspace bundle.
 */
async function readWorkspaceFolder(directoryPath) {
  const gitWorkspace = await readGitWorkspace(directoryPath);
  if (gitWorkspace) return workspaceBundleFromGit(gitWorkspace);
  const snapshotPath = path.join(directoryPath, "layang.workspace.json");
  const snapshot = await readJsonIfExists(snapshotPath);
  if (snapshot && typeof snapshot === "object") {
    // Older desktop releases wrote both a full snapshot and newer split files. The
    // split files are the most recent source when present, so merge every persisted
    // domain before converting instead of trusting a potentially stale snapshot.
    const [
      splitProtoFiles,
      splitEnvironments,
      splitExamples,
      splitMethodDocs,
      splitDocResults,
      splitHistory,
      splitRestMockServer,
      splitCollections,
    ] = await Promise.all([
      readProtoFilesFromFolder(path.join(directoryPath, "protos")),
      readJsonIfExists(path.join(directoryPath, "environments", "environments.json")),
      readJsonIfExists(path.join(directoryPath, "examples", "examples.json")),
      readJsonIfExists(path.join(directoryPath, "docs", "published-docs.json")),
      readJsonIfExists(path.join(directoryPath, "docs", "saved-results.json")),
      readJsonIfExists(path.join(directoryPath, "history", "history.json")),
      readJsonIfExists(path.join(directoryPath, "mocks", "rest-mock-server.json")),
      readJsonIfExists(path.join(directoryPath, "collections", "collections.json")),
    ]);
    const splitMockServer = await readMockServerFromFolder(path.join(directoryPath, "mocks"));
    const splitRequestTabs = await readRequestSessionFiles(path.join(directoryPath, "requests"));
    snapshot.project = snapshot.project || {};

    if (splitProtoFiles.length) snapshot.project.protoFiles = splitProtoFiles;
    if (Array.isArray(splitEnvironments)) snapshot.project.environments = splitEnvironments;
    if (Array.isArray(splitExamples)) snapshot.project.examples = splitExamples;
    if (Array.isArray(splitMethodDocs)) snapshot.project.methodDocs = splitMethodDocs;
    if (Array.isArray(splitDocResults)) snapshot.project.docResults = splitDocResults;
    if (Array.isArray(splitHistory)) snapshot.project.history = splitHistory;
    if (splitMockServer) {
      const currentMockServer = snapshot.project.mockServer || {};
      snapshot.project.mockServer = {
        ...currentMockServer,
        ...splitMockServer,
        methodFiles: { ...(currentMockServer.methodFiles || {}), ...(splitMockServer.methodFiles || {}) },
      };
    }
    if (splitRestMockServer && typeof splitRestMockServer === "object") {
      snapshot.project.restMockServer = splitRestMockServer;
    }
    if (splitRequestTabs.length) snapshot.project.requestTabs = splitRequestTabs;
    if (Array.isArray(splitCollections)) snapshot.project.collections = splitCollections;
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

  const legacyBundle = normalizeWorkspaceBundle({
    type: "layang-workspace",
    version: WORKSPACE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "Layang",
    project,
    layout: (await readJsonIfExists(path.join(directoryPath, "layout.json"))) || {},
    settings: (await readJsonIfExists(path.join(directoryPath, "settings.json"))) || {},
  });
  return legacyBundle;
}

async function openWorkspaceFolder(directoryPath) {
  if (fsSync.existsSync(path.join(directoryPath, gitWorkspaceRootFile))) {
    return { bundle: await readWorkspaceFolder(directoryPath), migrated: false, status: "already-current" };
  }
  if (await hasRecognizedLegacyWorkspaceFiles(directoryPath)) {
    const legacyBundle = await readWorkspaceFolder(directoryPath);
    const migration = await migrateLegacyWorkspaceTransaction(directoryPath, legacyBundle);
    return {
      bundle: workspaceBundleFromGit(migration.workspace),
      migrated: true,
      status: "migrated",
      backupPath: migration.backupPath,
      cleanupWarning: migration.cleanupWarning,
    };
  }
  return { bundle: await readWorkspaceFolder(directoryPath), migrated: false, status: "not-a-workspace" };
}

function workspaceBundleFromGit(gitWorkspace) {
  if (!gitWorkspace) throw new Error("A readable Git/YAML workspace is required.");
  return normalizeWorkspaceBundle({
    type: "layang-workspace",
    version: WORKSPACE_EXPORT_VERSION,
    exportedAt: gitWorkspace.project?.updatedAt || new Date().toISOString(),
    app: "Layang",
    project: gitWorkspace.project,
    layout: gitWorkspace.layout,
    settings: gitWorkspace.settings,
  });
}

/**
 * Normalizes old gRPC Lab and new Layang workspace bundle envelopes.
 */
function normalizeWorkspaceBundle(bundle) {
  const input = bundle && typeof bundle === "object" ? bundle : {};
  return {
    type: "layang-workspace",
    version: WORKSPACE_EXPORT_VERSION,
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
 * The lock keeps overlapping workspace saves from exposing a partial scenario tree to
 * explicit reads. Runtime/editor state is only refreshed when the user requests Sync file.
 */
async function _writeMockWorkspaceFilesAtomically(directoryPath, project, mockServerProject) {
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
      format: mockServerProject.format === "json" ? "json" : "yaml",
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
      security: mockServerProject.security || {},
      limits: mockServerProject.limits || {},
      protoSources: Array.isArray(mockServerProject.protoSources)
        ? mockServerProject.protoSources
            .map((item) => ({
              libraryId: String(item?.libraryId || "").trim(),
              versionId: String(item?.versionId || "").trim(),
            }))
            .filter((item) => item.libraryId && item.versionId)
        : [],
      methodBindings:
        mockServerProject.methodBindings && typeof mockServerProject.methodBindings === "object"
          ? mockServerProject.methodBindings
          : {},
      gatewayProfiles: Array.isArray(mockServerProject.gatewayProfiles) ? mockServerProject.gatewayProfiles : [],
      activeGatewayProfileId: String(mockServerProject.activeGatewayProfileId || ""),
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
      await fs.rm(path.join(mocksDir, "scenarios.json"), { force: true }).catch(() => undefined);
      await fs.rm(path.join(mocksDir, "scenarios.yaml"), { force: true }).catch(() => undefined);
    } else {
      await writeEmptyScenarioManifest(scenariosDir);
      if (project.mockServer?.scenarioText) {
        const sourceFormat = project.mockServer.format === "yaml" ? "yaml" : "json";
        const parsed = parseRuntimeScenarioText(
          String(project.mockServer.scenarioText),
          sourceFormat,
          normalizeMockServerPort(mockServerProject.port || 50055),
        );
        await writeTextInside(
          directoryPath,
          path.join("mocks", "scenarios.yaml"),
          stringifyWorkspaceYaml({ version: 1, scenarios: parsed.scenarios || [] }),
        );
      }
      await fs.rm(path.join(mocksDir, "scenarios.json"), { force: true }).catch(() => undefined);
    }
  } finally {
    await fs.rm(lockPath, { force: true }).catch(() => undefined);
  }
}

function stringifyWorkspaceYaml(value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`;
    return value
      .map((item) => {
        if (isWorkspaceYamlScalar(item)) return `${pad}- ${formatWorkspaceYamlScalar(item)}\n`;
        return `${pad}-\n${stringifyWorkspaceYaml(item, indent + 2)}`;
      })
      .join("");
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (entries.length === 0) return `${pad}{}\n`;
    return entries
      .map(([key, item]) => {
        if (isWorkspaceYamlScalar(item)) return `${pad}${key}: ${formatWorkspaceYamlScalar(item)}\n`;
        return `${pad}${key}:\n${stringifyWorkspaceYaml(item, indent + 2)}`;
      })
      .join("");
  }
  return `${pad}${formatWorkspaceYamlScalar(value)}\n`;
}

function isWorkspaceYamlScalar(value) {
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === "object") return Object.keys(value).length === 0;
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function formatWorkspaceYamlScalar(value) {
  if (Array.isArray(value) && value.length === 0) return "[]";
  if (value && typeof value === "object" && Object.keys(value).length === 0) return "{}";
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const raw = String(value ?? "");
  if (!raw || /[:#\n\r\t{}[\],&*?|-]|^\s|\s$/.test(raw)) return JSON.stringify(raw);
  return raw;
}

/**
 * Writes split mock scenario files incrementally.
 *
 * Windows frequently locks directories that are open in editors, antivirus, or the
 * Next dev server. For that reason mocks/scenarios is treated like
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
    const sourceFormat = file.format === "json" ? "json" : "yaml";
    const parsed = parseRuntimeScenarioText(String(file.scenarioText || ""), sourceFormat, fallbackPort);
    const methodDir = safePathSegment(key.replace("/", ".")) || "method";
    const extension = sourceFormat === "json" ? "json" : "yaml";
    manifest.methods[key] = { format: sourceFormat, scenarios: {} };

    for (const scenario of parsed.scenarios || []) {
      const scenarioId = String(scenario.id || "scenario").trim() || "scenario";
      const baseName = safePathSegment(scenarioId) || "scenario";
      let relativeFile = `${methodDir}/${baseName}.${extension}`;
      let counter = 2;
      while (usedRelativeFiles.has(relativeFile)) {
        relativeFile = `${methodDir}/${baseName}-${counter}.${extension}`;
        counter += 1;
      }
      usedRelativeFiles.add(relativeFile);
      activeRelativeFiles.add(relativeFile);
      manifest.methods[key].scenarios[scenarioId] = { file: relativeFile, format: sourceFormat };
      if (sourceFormat === "json") await writeJson(path.join(scenariosDir, relativeFile), scenario);
      else await writeTextInside(scenariosDir, relativeFile, stringifyWorkspaceYaml(scenario));
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
async function _writeRequestSessionFiles(directoryPath, requestTabs) {
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
      sourceRequestId: session.sourceRequestId || undefined,
      grpc: session.grpc || undefined,
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
      sourceRequestId: envelope.sourceRequestId,
      grpc: envelope.grpc,
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
      if (!methodScenarioGroups[key]) methodScenarioGroups[key] = { format, scenarios: [] };
      methodScenarioGroups[key].scenarios.push(scenario);
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
    const methodFormat = entry && typeof entry === "object" && entry.format === "json" ? "json" : "yaml";
    methodScenarioGroups[key] = { format: methodFormat, scenarios: [] };
    for (const descriptor of Object.values(scenarios)) {
      if (!descriptor || typeof descriptor !== "object" || !descriptor.file) continue;
      const relativeFile = String(descriptor.file);
      if (relativeFile.includes("..") || path.isAbsolute(relativeFile)) continue;
      const format = descriptor.format === "json" ? "json" : "yaml";
      const filePath = path.join(splitDir, relativeFile);
      const text = await fs.readFile(filePath, "utf8");
      const parsed = parseRuntimeScenarioText(text, format, port);
      methodScenarioGroups[key].scenarios.push(...(parsed.scenarios || []));
    }
  }
  return methodScenarioGroups;
}

async function readMockServerFromFolder(mocksDir) {
  const serverConfig = (await readJsonIfExists(path.join(mocksDir, "mock-server.json")).catch(() => ({}))) || {};
  const port = normalizeMockServerPort(serverConfig.port || 50055);
  const bindHost = normalizeMockBindHost(serverConfig.bindHost || serverConfig.bind_host || "127.0.0.1");
  const formatDefault = serverConfig.format === "json" ? "json" : "yaml";
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
  const commonConfig = {
    security: serverConfig.security && typeof serverConfig.security === "object" ? serverConfig.security : {},
    limits: serverConfig.limits && typeof serverConfig.limits === "object" ? serverConfig.limits : {},
    protoSources: Array.isArray(serverConfig.protoSources) ? serverConfig.protoSources : [],
    methodBindings:
      serverConfig.methodBindings && typeof serverConfig.methodBindings === "object" ? serverConfig.methodBindings : {},
    gatewayProfiles: Array.isArray(serverConfig.gatewayProfiles) ? serverConfig.gatewayProfiles : [],
    activeGatewayProfileId: String(serverConfig.activeGatewayProfileId || ""),
  };
  const persistedUpdatedAt =
    typeof serverConfig.updatedAt === "string" && serverConfig.updatedAt.trim()
      ? serverConfig.updatedAt
      : new Date().toISOString();
  const splitDir = path.join(mocksDir, "scenarios");
  const methodScenarioGroups = await readScenarioGroupsFromSplitDirectory(splitDir, port);
  const methodFiles = {};
  for (const [key, group] of Object.entries(methodScenarioGroups)) {
    const format = group?.format === "json" ? "json" : "yaml";
    const scenarios = Array.isArray(group?.scenarios) ? group.scenarios : [];
    methodFiles[key] = {
      format,
      scenarioText:
        format === "json"
          ? `${JSON.stringify({ version: 1, scenarios }, null, 2)}\n`
          : stringifyWorkspaceYaml({ version: 1, scenarios }),
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
      ...commonConfig,
      scenarioText:
        formatDefault === "json"
          ? `${JSON.stringify({ version: 1, scenarios: [] }, null, 2)}\n`
          : stringifyWorkspaceYaml({ version: 1, scenarios: [] }),
      methodFiles,
      updatedAt: persistedUpdatedAt,
    };
  }

  const jsonPath = path.join(mocksDir, "scenarios.json");
  const yamlPaths = [path.join(mocksDir, "scenarios.yaml"), path.join(mocksDir, "scenarios.yml")];
  for (const yamlPath of yamlPaths) {
    try {
      const legacyYamlText = await fs.readFile(yamlPath, "utf8");
      const parsed = parseRuntimeScenarioText(legacyYamlText, "yaml", port);
      return {
        port,
        bindHost,
        format: "yaml",
        streamDefaults,
        selectedScenarioIds,
        enabledMethods,
        ...commonConfig,
        scenarioText: stringifyWorkspaceYaml({ version: 1, scenarios: parsed.scenarios || [] }),
        methodFiles: {},
        updatedAt: persistedUpdatedAt,
      };
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
  }
  try {
    const legacyJsonText = await fs.readFile(jsonPath, "utf8");
    const parsed = parseRuntimeScenarioText(legacyJsonText, "json", port);
    return {
      port,
      bindHost,
      format: "json",
      streamDefaults,
      selectedScenarioIds,
      enabledMethods,
      ...commonConfig,
      scenarioText: `${JSON.stringify({ version: 1, scenarios: parsed.scenarios || [] }, null, 2)}\n`,
      methodFiles: {},
      updatedAt: persistedUpdatedAt,
    };
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  return null;
}
