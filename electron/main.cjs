const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const crypto = require("node:crypto");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const isDev = !app.isPackaged;
const activeNativeCalls = new Map();
let activeMockServer = null;

/**
 * Creates the frameless Electron BrowserWindow and loads the workbench.
 */
function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1180,
    minHeight: 780,
    title: "Layang",
    icon: path.join(__dirname, "assets", "icon.png"),
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const staticIndexPath = path.join(__dirname, "..", "out", "playground.html");
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("[renderer:did-fail-load]", errorCode, errorDescription, validatedURL);
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on("did-finish-load", () => {
    console.log("[renderer:did-finish-load]", win.webContents.getURL());
  });
  if (isDev && process.env.ELECTRON_LOAD_STATIC !== "1") {
    const startUrl = process.env.ELECTRON_START_URL || "http://localhost:3000/playground";
    void win.loadURL(startUrl);
  } else {
    void win.loadFile(staticIndexPath);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/**
 * Resolves the BrowserWindow that originated an IPC event.
 */
function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

ipcMain.handle("window:minimize", (event) => {
  windowFromEvent(event)?.minimize();
  return { ok: true };
});

ipcMain.handle("window:maximize-toggle", (event) => {
  const win = windowFromEvent(event);
  if (!win) return { maximized: false };
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return { maximized: win.isMaximized() };
});

ipcMain.handle("window:close", (event) => {
  windowFromEvent(event)?.close();
  return { ok: true };
});

ipcMain.handle("window:toggle-always-on-top", (event) => {
  const win = windowFromEvent(event);
  if (!win) return { alwaysOnTop: false };
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next);
  return { alwaysOnTop: next };
});

ipcMain.handle("workspace:get-default-folder", async () => {
  return { ok: true, directoryPath: getDefaultWorkspaceDirectory() };
});

ipcMain.handle("workspace:ensure-default-folder", async (_event, payload) => {
  const directoryPath = getDefaultWorkspaceDirectory();
  const snapshotPath = path.join(directoryPath, "layang.workspace.json");
  const existingSnapshot = await readJsonIfExists(snapshotPath).catch(() => null);
  if (existingSnapshot && typeof existingSnapshot === "object") {
    const bundle = await readWorkspaceFolder(directoryPath);
    return { ok: true, directoryPath, created: false, bundle };
  }

  await writeWorkspaceFolder(directoryPath, payload?.bundle ? payload.bundle : {});
  return { ok: true, directoryPath, created: true };
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

ipcMain.handle("native-grpc:invoke", async (event, payload) => {
  const runId = payload?.runId ? String(payload.runId) : "";
  const registerCall = (call, client) => {
    if (!runId) return;
    activeNativeCalls.set(runId, { call, client });
  };
  const emit = (grpcEvent) => {
    if (!runId || event.sender.isDestroyed()) return;
    event.sender.send(`native-grpc:event:${runId}`, grpcEvent);
  };
  try {
    return await invokeNativeGrpc(payload, emit, registerCall);
  } finally {
    if (runId) activeNativeCalls.delete(runId);
  }
});

ipcMain.handle("mock-server:start", async (_event, payload) => {
  try {
    const result = await startMockServer(payload || {});
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error?.message ? String(error.message) : String(error) };
  }
});

ipcMain.handle("mock-server:stop", async () => {
  await stopMockServer();
  return { ok: true, message: "Mock server stopped." };
});

ipcMain.handle("mock-server:update", async (_event, payload) => {
  try {
    const result = updateActiveMockServer(payload || {}, "ui");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error?.message ? String(error.message) : String(error) };
  }
});

ipcMain.handle("mock-server:status", async () => {
  if (!activeMockServer) return { running: false };
  return {
    running: true,
    port: activeMockServer.port,
    url: `grpc://0.0.0.0:${activeMockServer.port}`,
    scenarioCount: activeMockServer.runtime.scenarioIndex.length,
    methodCount: activeMockServer.methodCount,
    activeScenarioIds: activeMockServer.runtime.activeScenarioIds,
    enabledMethods: activeMockServer.runtime.enabledMethods,
    startedAt: activeMockServer.startedAt,
    configVersion: activeMockServer.runtime.configVersion,
    updatedAt: activeMockServer.runtime.updatedAt,
  };
});

ipcMain.handle("native-grpc:cancel", async (_event, payload) => {
  const runId = payload?.runId ? String(payload.runId) : "";
  const active = activeNativeCalls.get(runId);
  if (!active) return { cancelled: false };

  try {
    if (active.call && typeof active.call.cancel === "function") active.call.cancel();
    if (active.client && typeof active.client.close === "function") active.client.close();
  } finally {
    activeNativeCalls.delete(runId);
  }

  return { cancelled: true };
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
  await writeJson(path.join(directoryPath, "requests", "tabs.json"), project.requestTabs || []);
  await writeRequestSessionFiles(directoryPath, project.requestTabs || []);
  await writeJson(path.join(directoryPath, "history", "history.json"), project.history || []);
  const mockServerProject = project.mockServer && typeof project.mockServer === "object" ? project.mockServer : {};
  await writeJson(path.join(directoryPath, "mocks", "mock-server.json"), {
    port: normalizeMockServerPort(mockServerProject.port || 50055),
    format: mockServerProject.format === "yaml" ? "yaml" : "json",
    streamDefaults: normalizeRuntimeStreamSettings(mockServerProject.streamDefaults || {}, {
      intervalMs: 500,
      loop: false,
      maxLoops: 0,
    }),
    selectedScenarioIds: normalizeActiveScenarioIds(
      mockServerProject.selectedScenarioIds || mockServerProject.activeScenarioIds || {},
    ),
    enabledMethods: normalizeEnabledMethods(mockServerProject.enabledMethods || {}),
  });
  const mockMethodFiles =
    mockServerProject.methodFiles && typeof mockServerProject.methodFiles === "object"
      ? mockServerProject.methodFiles
      : {};
  const mockFileKeys = Object.keys(mockMethodFiles);
  await fs.rm(path.join(directoryPath, "mocks", "scenarios"), { recursive: true, force: true });
  if (mockFileKeys.length) {
    const manifest = {};
    for (const key of mockFileKeys) {
      const file = mockMethodFiles[key] || {};
      const ext = file.format === "yaml" ? "yaml" : "json";
      const name = `${safePathSegment(key.replace("/", "."))}.${ext}`;
      manifest[key] = { file: name, format: ext };
      await writeTextInside(directoryPath, path.join("mocks", "scenarios", name), String(file.scenarioText || ""));
    }
    await writeJson(path.join(directoryPath, "mocks", "scenarios", "manifest.json"), manifest);
  } else if (project.mockServer?.scenarioText) {
    const ext = project.mockServer.format === "yaml" ? "yaml" : "json";
    await writeTextInside(
      directoryPath,
      path.join("mocks", `scenarios.${ext}`),
      String(project.mockServer.scenarioText),
    );
  }

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
    const splitRequestTabs = await readRequestSessionFiles(path.join(directoryPath, "requests"));
    if (splitMockServer) {
      snapshot.project = snapshot.project || {};
      const currentMockServer = snapshot.project.mockServer || {};
      snapshot.project.mockServer = {
        ...currentMockServer,
        ...splitMockServer,
        methodFiles: { ...(currentMockServer.methodFiles || {}), ...(splitMockServer.methodFiles || {}) },
      };
    }
    if (splitRequestTabs.length) {
      snapshot.project = snapshot.project || {};
      snapshot.project.requestTabs = splitRequestTabs;
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
  project.docResults =
    (await readJsonIfExists(path.join(directoryPath, "docs", "saved-results.json"))) || project.docResults || [];
  const splitRequestTabs = await readRequestSessionFiles(path.join(directoryPath, "requests"));
  project.requestTabs = splitRequestTabs.length
    ? splitRequestTabs
    : (await readJsonIfExists(path.join(directoryPath, "requests", "tabs.json"))) || project.requestTabs || [];
  project.history =
    (await readJsonIfExists(path.join(directoryPath, "history", "history.json"))) || project.history || [];
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
 * Writes JSON with stable pretty formatting.
 */
async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Reads a JSON file if it exists; missing files return null.
 */
async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
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
      environmentKey: session.environmentKey || "default",
      baseUrl: session.baseUrl || "",
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
    transportMode: record.transportMode === "grpc-web" ? "grpc-web" : "native-grpc",
    baseUrl: String(record.baseUrl || ""),
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
 * Writes a text file under a workspace directory with path traversal protection.
 */
async function writeTextInside(rootDir, relativePath, text) {
  const targetPath = path.normalize(path.join(rootDir, relativePath));
  if (!targetPath.startsWith(path.normalize(rootDir))) {
    throw new Error(`Unsafe workspace path: ${relativePath}`);
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, text, "utf8");
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
async function readMockServerFromFolder(mocksDir) {
  const serverConfig = (await readJsonIfExists(path.join(mocksDir, "mock-server.json")).catch(() => ({}))) || {};
  const port = normalizeMockServerPort(serverConfig.port || 50055);
  const formatDefault = serverConfig.format === "yaml" ? "yaml" : "json";
  const streamDefaults = normalizeRuntimeStreamSettings(
    serverConfig.streamDefaults || serverConfig.stream_defaults || {},
    { intervalMs: 500, loop: false, maxLoops: 0 },
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
  const manifest = (await readJsonIfExists(path.join(splitDir, "manifest.json"))) || {};
  const methodFiles = {};
  await walkDirectory(splitDir, async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".json" && ext !== ".yaml" && ext !== ".yml") return;
    if (path.basename(filePath).toLowerCase() === "manifest.json") return;
    const format = ext === ".json" ? "json" : "yaml";
    const relative = path.relative(splitDir, filePath).replace(/\\/g, "/");
    const manifestEntry = Object.entries(manifest).find(
      ([, item]) => (item && item.file === relative) || (item && item.file === path.basename(filePath)),
    );
    const key = manifestEntry ? manifestEntry[0] : path.basename(filePath, ext).replace(/\.(?=[^.]+$)/, "/");
    methodFiles[key] = {
      format,
      scenarioText: await fs.readFile(filePath, "utf8"),
      updatedAt: new Date().toISOString(),
    };
  });
  if (Object.keys(methodFiles).length) {
    return {
      port,
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

/**
 * Recursively walks a directory if it exists.
 */
async function walkDirectory(directoryPath, visitor) {
  let entries;
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const childPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) await walkDirectory(childPath, visitor);
    else if (entry.isFile()) await visitor(childPath);
  }
}

/**
 * Converts display labels into safe file names.
 */
function safePathSegment(input) {
  return (
    String(input || "item")
      .replace(/[^a-z0-9_.-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "item"
  );
}

/**
 * Invokes native gRPC through @grpc/grpc-js and streams normalized events back to the renderer.
 */
async function invokeNativeGrpc(payload, emit = () => undefined, registerCall = () => undefined) {
  validatePayload(payload);

  if (payload.method.requestStream) {
    throw new Error(
      "Native gRPC client streaming and bidirectional streaming are not implemented in this desktop MVP. Unary and server streaming are supported.",
    );
  }

  const startedTimestamp = new Date();
  const startedAt = Date.now();

  emit({
    type: "log",
    level: "info",
    message: "Native gRPC request prepared",
    details: {
      targetUrl: payload.targetUrl,
      service: payload.method.serviceName,
      method: payload.method.methodName,
      mode: payload.method.responseStream ? "server-streaming" : "unary",
    },
  });
  const workspaceDir = await writeProtoWorkspace(payload.protoFiles);

  try {
    const rootProtoFiles = payload.protoFiles.map((file) => safeRelativePath(file.name));
    const packageDefinition = protoLoader.loadSync(rootProtoFiles, {
      includeDirs: [workspaceDir],
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const loadedPackage = grpc.loadPackageDefinition(packageDefinition);
    const ServiceCtor = getByDottedPath(loadedPackage, payload.method.serviceName);

    if (typeof ServiceCtor !== "function") {
      throw new Error(`Service constructor not found: ${payload.method.serviceName}`);
    }

    const target = normalizeNativeTarget(payload.targetUrl);
    const credentials = target.secure ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();

    const client = new ServiceCtor(target.address, credentials, {
      "grpc.max_receive_message_length": 50 * 1024 * 1024,
      "grpc.max_send_message_length": 50 * 1024 * 1024,
    });

    const clientMethodName = findClientMethodName(client, payload.method.methodName);
    const metadata = metadataPairsToGrpcMetadata(payload.metadata || []);
    const deadlineMs = Number(payload.deadlineMs || 0);
    const callOptions = deadlineMs > 0 ? { deadline: new Date(Date.now() + Math.max(1, deadlineMs)) } : {};
    const maxMessages = normalizeMaxMessages(payload.maxMessages);

    emit({
      type: "log",
      level: "info",
      message: "Native gRPC client connected",
      details: {
        target: target.address,
        secure: target.secure,
        deadlineMs: deadlineMs > 0 ? deadlineMs : null,
        maxMessages,
      },
    });

    const result = payload.method.responseStream
      ? await invokeServerStreaming(
          client,
          clientMethodName,
          payload.requestJson,
          metadata,
          callOptions,
          emit,
          registerCall,
          maxMessages,
        )
      : await invokeUnary(
          client,
          clientMethodName,
          payload.requestJson,
          metadata,
          callOptions,
          emit,
          registerCall,
          maxMessages,
        );

    closeClient(client);

    const summary = {
      httpStatus: 0,
      headers: result.headers,
      trailers: result.trailers,
      messages: result.messages,
      totalMessages: result.totalMessages,
      droppedMessages: result.droppedMessages,
      durationMs: Date.now() - startedAt,
      requestUrl: `${target.address}/${payload.method.serviceName}/${payload.method.methodName}`,
      startedAt: startedTimestamp.toISOString(),
      completedAt: new Date().toISOString(),
      transport: "native-grpc",
    };

    emit({
      type: "log",
      level: summary.trailers["grpc-status"] === "0" ? "info" : "error",
      message: "Native gRPC request completed",
      details: {
        durationMs: summary.durationMs,
        messages: summary.totalMessages,
        storedMessages: summary.messages.length,
        droppedMessages: summary.droppedMessages,
        grpcStatus: summary.trailers["grpc-status"],
        grpcMessage: summary.trailers["grpc-message"],
      },
    });
    emit({ type: "end", summary });
    return summary;
  } catch (error) {
    emit({
      type: "error",
      message: "Native gRPC request failed before completion",
      details: errorToPlainObject(error),
    });
    throw error;
  } finally {
    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Normalizes the maximum message capture limit.
 */
function normalizeMaxMessages(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 500;
  return Math.max(1, Math.floor(numeric));
}

/**
 * Validates the renderer payload before native gRPC execution.
 */
function validatePayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Missing native gRPC payload.");
  if (!payload.targetUrl || typeof payload.targetUrl !== "string") throw new Error("Native gRPC target is required.");
  if (!payload.method || typeof payload.method !== "object") throw new Error("RPC method metadata is required.");
  if (!Array.isArray(payload.protoFiles) || payload.protoFiles.length === 0)
    throw new Error("At least one proto file is required.");
}

/**
 * Writes uploaded proto files to a temporary native gRPC workspace.
 */
async function writeProtoWorkspace(protoFiles) {
  const id = crypto.randomBytes(8).toString("hex");
  const workspaceDir = path.join(app.getPath("temp"), `layang-${id}`);
  await fs.mkdir(workspaceDir, { recursive: true });

  for (const file of protoFiles) {
    const relativePath = safeRelativePath(file.name);
    const absolutePath = path.join(workspaceDir, relativePath);
    const normalizedAbsolute = path.normalize(absolutePath);

    if (!normalizedAbsolute.startsWith(path.normalize(workspaceDir))) {
      throw new Error(`Unsafe proto path: ${file.name}`);
    }

    await fs.mkdir(path.dirname(normalizedAbsolute), { recursive: true });
    await fs.writeFile(normalizedAbsolute, String(file.text || ""), "utf8");
  }

  return workspaceDir;
}

/**
 * Converts proto file paths into safe relative workspace paths.
 */
function safeRelativePath(input) {
  const normalized = String(input || "schema.proto")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");

  return normalized || "schema.proto";
}

/**
 * Finds a nested package/service object by dotted path.
 */
function getByDottedPath(root, dottedPath) {
  return dottedPath.split(".").reduce((current, part) => {
    if (current && Object.hasOwn(current, part)) {
      return current[part];
    }
    return undefined;
  }, root);
}

/**
 * Finds the generated grpc-js client method for a proto method name.
 */
function findClientMethodName(client, protoMethodName) {
  const lowerCamel = protoMethodName.charAt(0).toLowerCase() + protoMethodName.slice(1);
  const candidates = [protoMethodName, lowerCamel];

  for (const candidate of candidates) {
    if (typeof client[candidate] === "function") return candidate;
  }

  const available = Object.keys(client).filter((key) => typeof client[key] === "function");
  const caseInsensitive = available.find((key) => key.toLowerCase() === protoMethodName.toLowerCase());
  if (caseInsensitive) return caseInsensitive;

  throw new Error(`RPC method not found on native client: ${protoMethodName}. Available: ${available.join(", ")}`);
}

/**
 * Normalizes native gRPC target URLs into grpc-js host strings and TLS mode.
 */
function normalizeNativeTarget(rawTarget) {
  const raw = String(rawTarget || "")
    .trim()
    .replace(/\/+$/, "");
  const secure = raw.startsWith("grpcs://") || raw.startsWith("https://");
  const withoutScheme = raw.replace(/^(grpcs|grpc|https|http):\/\//, "");
  const address = withoutScheme.split("/")[0];

  if (!address?.includes(":")) {
    throw new Error(
      "Native gRPC target must be host:port, grpc://host:port, grpcs://host:port, http://host:port, or https://host:port. Do not include a gRPC-Web proxy path.",
    );
  }

  return { address, secure };
}

/**
 * Converts UI metadata pairs into grpc-js Metadata.
 */
function metadataPairsToGrpcMetadata(pairs) {
  const metadata = new grpc.Metadata();

  for (const pair of pairs) {
    const key = String(pair.key || "")
      .trim()
      .toLowerCase();
    const value = String(pair.value || "").trim();
    if (!key) continue;

    if (key.endsWith("-bin")) {
      metadata.add(key, Buffer.from(value, "base64"));
    } else {
      metadata.add(key, value);
    }
  }

  return metadata;
}

/**
 * Converts grpc-js Metadata into a serializable object.
 */
function metadataToRecord(metadata) {
  const output = {};
  if (!metadata || typeof metadata.getMap !== "function") return output;

  const map = metadata.getMap();
  for (const [key, value] of Object.entries(map)) {
    output[key] = Buffer.isBuffer(value) ? value.toString("base64") : String(value);
  }

  return output;
}

/**
 * Converts grpc-js status objects into gRPC trailer fields.
 */
function statusToTrailers(status) {
  return {
    ...metadataToRecord(status?.metadata),
    "grpc-status": String(status && typeof status.code === "number" ? status.code : grpc.status.UNKNOWN),
    "grpc-message": status?.details ? String(status.details) : "",
  };
}

/**
 * Converts thrown native gRPC errors into serializable trailer fields.
 */
function errorToTrailers(error) {
  return {
    ...metadataToRecord(error?.metadata),
    "grpc-status": String(typeof error.code === "number" ? error.code : grpc.status.UNKNOWN),
    "grpc-message": error?.details
      ? String(error.details)
      : error?.message
        ? String(error.message)
        : "Native gRPC error",
  };
}

/**
 * Invokes a native unary RPC and captures headers, message, trailers, and duration.
 */
function invokeUnary(
  client,
  methodName,
  requestJson,
  metadata,
  callOptions,
  emit = () => undefined,
  registerCall = () => undefined,
  maxMessages = 500,
) {
  return new Promise((resolve) => {
    let headers = {};
    let trailers = {};

    emit({ type: "log", level: "info", message: "Native unary call started", details: { methodName } });

    const call = client[methodName](requestJson, metadata, callOptions, (error, response) => {
      if (error) {
        emit({ type: "error", message: "Native unary call failed", details: errorToPlainObject(error) });
        resolve({
          headers,
          trailers: { ...trailers, ...errorToTrailers(error) },
          messages: [],
          totalMessages: 0,
          droppedMessages: 0,
        });
        return;
      }

      if (!trailers["grpc-status"]) {
        trailers = { ...trailers, "grpc-status": String(grpc.status.OK), "grpc-message": "" };
      }

      const messages = [];
      let totalMessages = 0;
      let droppedMessages = 0;
      if (response !== undefined) {
        totalMessages = 1;
        if (maxMessages > 0) {
          messages.push(response);
          emit({ type: "message", index: 0, value: response });
          emit({
            type: "log",
            level: "info",
            message: "Native unary response decoded",
            details: { messageIndex: 0, storedMessages: messages.length },
          });
        } else {
          droppedMessages = 1;
        }
      }

      emit({ type: "trailers", trailers });
      resolve({ headers, trailers, messages, totalMessages, droppedMessages });
    });

    registerCall(call, client);

    call.on("metadata", (metadataEvent) => {
      headers = metadataToRecord(metadataEvent);
      emit({ type: "headers", httpStatus: 0, headers, contentType: "application/grpc" });
      emit({ type: "log", level: "info", message: "Native gRPC metadata received", details: headers });
    });

    call.on("status", (status) => {
      trailers = statusToTrailers(status);
      emit({ type: "trailers", trailers });
      emit({
        type: trailers["grpc-status"] === "0" ? "log" : "error",
        level: trailers["grpc-status"] === "0" ? "info" : "error",
        message:
          trailers["grpc-status"] === "0"
            ? "Native gRPC status OK"
            : `Native gRPC error ${trailers["grpc-status"]}: ${trailers["grpc-message"]}`,
        details: { status, trailers },
      });
    });
  });
}

/**
 * Invokes a native server-streaming RPC and captures messages until completion or cancellation.
 */
function invokeServerStreaming(
  client,
  methodName,
  requestJson,
  metadata,
  callOptions,
  emit = () => undefined,
  registerCall = () => undefined,
  maxMessages = 500,
) {
  return new Promise((resolve) => {
    let headers = {};
    let trailers = {};
    const messages = [];
    let totalMessages = 0;
    let droppedMessages = 0;
    let warnedLimit = false;
    let resolved = false;

    /**
     * Completes a native stream exactly once.
     */
    function finish(finalTrailers) {
      if (resolved) return;
      resolved = true;
      resolve({
        headers,
        trailers: finalTrailers || trailers || { "grpc-status": String(grpc.status.OK), "grpc-message": "" },
        messages,
        totalMessages,
        droppedMessages,
      });
    }

    emit({ type: "log", level: "info", message: "Native server stream started", details: { methodName } });

    const call = client[methodName](requestJson, metadata, callOptions);
    registerCall(call, client);

    call.on("metadata", (metadataEvent) => {
      headers = metadataToRecord(metadataEvent);
      emit({ type: "headers", httpStatus: 0, headers, contentType: "application/grpc" });
      emit({ type: "log", level: "info", message: "Native gRPC metadata received", details: headers });
    });

    call.on("data", (message) => {
      totalMessages += 1;
      if (maxMessages > 0 && messages.length >= maxMessages) {
        droppedMessages += 1;
        messages.shift();
        if (!warnedLimit) {
          warnedLimit = true;
          emit({
            type: "log",
            level: "warn",
            message: "Message capture limit reached; older stream messages are replaced while the stream continues.",
            details: { maxMessages },
          });
        }
      }

      messages.push(message);
      emit({ type: "message", index: totalMessages - 1, value: message });
      emit({
        type: "log",
        level: "info",
        message: `Native stream message #${totalMessages} received`,
        details: { messageIndex: totalMessages - 1, storedMessages: messages.length, droppedMessages },
      });
    });

    call.on("status", (status) => {
      trailers = statusToTrailers(status);
      emit({ type: "trailers", trailers });
      emit({
        type: trailers["grpc-status"] === "0" ? "log" : "error",
        level: trailers["grpc-status"] === "0" ? "info" : "error",
        message:
          trailers["grpc-status"] === "0"
            ? "Native stream status OK"
            : `Native stream error ${trailers["grpc-status"]}: ${trailers["grpc-message"]}`,
        details: { status, trailers },
      });
      finish(trailers);
    });

    call.on("error", (error) => {
      const errorTrailers = errorToTrailers(error);
      emit({
        type: "error",
        message: `Native stream error ${errorTrailers["grpc-status"]}: ${errorTrailers["grpc-message"]}`,
        details: errorToPlainObject(error),
      });
      emit({ type: "trailers", trailers: errorTrailers });
      finish(errorTrailers);
    });

    call.on("end", () => {
      if (!trailers["grpc-status"]) {
        trailers = { ...trailers, "grpc-status": String(grpc.status.OK), "grpc-message": "" };
      }
      finish(trailers);
    });
  });
}

/**
 * Converts an unknown error into a plain serializable object.
 */
function errorToPlainObject(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details,
      metadata: metadataToRecord(error.metadata),
    };
  }
  return error;
}

/**
 * Closes a grpc-js client without throwing during cleanup.
 */
function closeClient(client) {
  if (client && typeof client.close === "function") {
    client.close();
  }
}

/**
 * Starts a local native gRPC mock server from loaded proto metadata and scenario files.
 */
async function startMockServer(payload) {
  await stopMockServer();
  const port = normalizeMockServerPort(payload.port || 50055);
  const protoFiles = Array.isArray(payload.protoFiles) ? payload.protoFiles : [];
  const methods = Array.isArray(payload.methods) ? payload.methods : [];
  const scenarios = Array.isArray(payload.scenarios) ? payload.scenarios : [];
  const streamDefaults = normalizeRuntimeStreamSettings(payload.streamDefaults || {}, {
    intervalMs: 500,
    loop: false,
    maxLoops: 0,
  });
  const activeScenarioIds = normalizeActiveScenarioIds(payload.activeScenarioIds || payload.selectedScenarioIds || {});
  const enabledMethods = normalizeEnabledMethods(payload.enabledMethods || payload.enabled_methods || {});
  const workspaceDirectory =
    payload.workspaceDirectory && typeof payload.workspaceDirectory === "string" ? payload.workspaceDirectory : "";

  if (!protoFiles.length) throw new Error("At least one proto file is required to start the mock server.");
  if (!methods.length) throw new Error("No RPC methods were provided for the mock server.");

  const workspaceDir = await writeProtoWorkspace(protoFiles);
  const rootProtoFiles = protoFiles.map((file) => safeRelativePath(file.name));
  const packageDefinition = protoLoader.loadSync(rootProtoFiles, {
    includeDirs: [workspaceDir],
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loadedPackage = grpc.loadPackageDefinition(packageDefinition);
  const server = new grpc.Server({
    "grpc.max_receive_message_length": 50 * 1024 * 1024,
    "grpc.max_send_message_length": 50 * 1024 * 1024,
  });
  const timers = new Set();
  const activeCalls = new Set();
  const runtime = createMockRuntimeState(scenarios, streamDefaults, activeScenarioIds, enabledMethods, "start");
  const byService = new Map();

  for (const method of methods) {
    if (!method?.serviceName || !method.methodName) continue;
    const list = byService.get(method.serviceName) || [];
    list.push(method);
    byService.set(method.serviceName, list);
  }

  let methodCount = 0;
  for (const [serviceName, serviceMethods] of byService.entries()) {
    const ServiceCtor = getByDottedPath(loadedPackage, serviceName);
    const serviceDefinition = ServiceCtor?.service;
    if (!serviceDefinition) continue;
    const handlers = {};
    for (const method of serviceMethods) {
      const handlerName = findServiceDefinitionKey(serviceDefinition, method.methodName);
      handlers[handlerName] = createMockHandler(method, runtime, timers, activeCalls);
      methodCount += 1;
    }
    server.addService(serviceDefinition, handlers);
  }

  if (methodCount === 0) {
    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    throw new Error("No mockable service definitions were found in the loaded proto files.");
  }

  const boundPort = await new Promise((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, actualPort) => {
      if (error) reject(error);
      else resolve(actualPort);
    });
  });

  if (typeof server.start === "function") server.start();
  activeMockServer = {
    server,
    runtime,
    timers,
    activeCalls,
    workspaceDir,
    watchedWorkspaceDir: workspaceDirectory,
    watcher: null,
    configWatcher: null,
    watcherDebounce: null,
    port: boundPort,
    methodCount,
    methods,
    startedAt: new Date().toISOString(),
  };
  await startMockScenarioWatcher(workspaceDirectory, activeMockServer);

  return {
    port: boundPort,
    url: `grpc://0.0.0.0:${boundPort}`,
    scenarioCount: runtime.scenarioIndex.length,
    activeScenarioIds: runtime.activeScenarioIds,
    enabledMethods: runtime.enabledMethods,
    methodCount,
    configVersion: runtime.configVersion,
  };
}

/**
 * Stops the active mock server and clears open stream timers.
 */
async function stopMockServer() {
  const active = activeMockServer;
  if (!active) return;
  activeMockServer = null;
  if (active.watcherDebounce) clearTimeout(active.watcherDebounce);
  if (active.watcher && typeof active.watcher.close === "function") {
    try {
      active.watcher.close();
    } catch {
      /* ignore */
    }
  }
  if (active.configWatcher && typeof active.configWatcher.close === "function") {
    try {
      active.configWatcher.close();
    } catch {
      /* ignore */
    }
  }
  for (const timer of active.timers || []) clearTimeout(timer);
  for (const call of active.activeCalls || []) {
    try {
      call.destroy(grpcStatusError(grpc.status.UNAVAILABLE, "Mock server stopped. Stream disconnected."));
    } catch {
      /* ignore */
    }
  }
  await new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    try {
      active.server.tryShutdown(done);
      setTimeout(() => {
        try {
          active.server.forceShutdown();
        } catch {
          /* ignore */
        }
        done();
      }, 600);
    } catch {
      try {
        active.server.forceShutdown();
      } catch {
        /* ignore */
      }
      done();
    }
  });
  if (active.workspaceDir) await fs.rm(active.workspaceDir, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Normalizes the mock server port.
 */
function normalizeMockServerPort(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return 50055;
  return Math.max(1, Math.min(65535, numeric));
}

/**
 * Finds the service-definition method key generated by proto-loader.
 */
function findServiceDefinitionKey(serviceDefinition, protoMethodName) {
  const keys = Object.keys(serviceDefinition || {});
  const exact = keys.find((key) => key === protoMethodName);
  if (exact) return exact;
  const lowerCamel = protoMethodName.charAt(0).toLowerCase() + protoMethodName.slice(1);
  const lower = keys.find((key) => key === lowerCamel);
  if (lower) return lower;
  const insensitive = keys.find((key) => key.toLowerCase() === String(protoMethodName).toLowerCase());
  return insensitive || lowerCamel;
}

/**
 * Creates a mutable runtime config that can be hot-swapped while the server keeps running.
 */
function createMockRuntimeState(scenarios, streamDefaults, activeScenarioIds, enabledMethods, source) {
  return {
    scenarioIndex: (Array.isArray(scenarios) ? scenarios : [])
      .map((scenario, index) => normalizeMockRuntimeScenario(scenario, index))
      .filter(Boolean),
    streamDefaults: normalizeRuntimeStreamSettings(streamDefaults || {}, { intervalMs: 500, loop: false, maxLoops: 0 }),
    activeScenarioIds: normalizeActiveScenarioIds(activeScenarioIds || {}),
    enabledMethods: normalizeEnabledMethods(enabledMethods || {}),
    configVersion: 1,
    updatedAt: new Date().toISOString(),
    source: source || "unknown",
  };
}

/**
 * Replaces active runtime scenarios without restarting the bound gRPC server or open streams.
 */
function updateActiveMockServer(payload, source) {
  if (!activeMockServer) throw new Error("Mock server is not running.");
  const runtime = activeMockServer.runtime;
  const next = createMockRuntimeState(
    Array.isArray(payload.scenarios) ? payload.scenarios : runtime.scenarioIndex,
    payload.streamDefaults || runtime.streamDefaults,
    payload.activeScenarioIds || payload.selectedScenarioIds || runtime.activeScenarioIds,
    payload.enabledMethods || runtime.enabledMethods,
    source || "update",
  );
  runtime.scenarioIndex = next.scenarioIndex;
  runtime.streamDefaults = next.streamDefaults;
  runtime.activeScenarioIds = next.activeScenarioIds;
  runtime.enabledMethods = next.enabledMethods;
  runtime.configVersion += 1;
  runtime.updatedAt = new Date().toISOString();
  runtime.source = next.source;
  return {
    running: true,
    scenarioCount: runtime.scenarioIndex.length,
    activeScenarioIds: runtime.activeScenarioIds,
    enabledMethods: runtime.enabledMethods,
    configVersion: runtime.configVersion,
    updatedAt: runtime.updatedAt,
    source: runtime.source,
  };
}

/**
 * Watches saved external mock per-method files and hot-reloads them into the active runtime.
 */
async function startMockScenarioWatcher(workspaceDirectory, serverState) {
  if (!workspaceDirectory || !serverState) return;
  const scenariosDir = path.join(workspaceDirectory, "mocks", "scenarios");
  try {
    const stat = await fs.stat(scenariosDir);
    if (!stat.isDirectory()) return;
  } catch {
    return;
  }

  const reload = async () => {
    if (activeMockServer !== serverState) return;
    try {
      const loaded = await loadRuntimeScenariosFromWorkspace(
        workspaceDirectory,
        serverState.methods || [],
        serverState.port,
      );
      if (!loaded) return;
      updateActiveMockServer(loaded, "file");
    } catch (error) {
      console.warn("[Layang][Mock] scenario file hot reload skipped:", error?.message ? error.message : error);
    }
  };

  try {
    serverState.watcher = fsSync.watch(scenariosDir, { persistent: false }, () => {
      if (serverState.watcherDebounce) clearTimeout(serverState.watcherDebounce);
      serverState.watcherDebounce = setTimeout(() => void reload(), 250);
    });
    const mocksDir = path.join(workspaceDirectory, "mocks");
    serverState.configWatcher = fsSync.watch(mocksDir, { persistent: false }, (_event, fileName) => {
      if (String(fileName || "").toLowerCase() !== "mock-server.json") return;
      if (serverState.watcherDebounce) clearTimeout(serverState.watcherDebounce);
      serverState.watcherDebounce = setTimeout(() => void reload(), 250);
    });
  } catch (error) {
    console.warn("[Layang][Mock] scenario watcher disabled:", error?.message ? error.message : error);
  }
}

/**
 * Loads split per-method mock scenario files from a workspace folder for hot reload.
 */
async function loadRuntimeScenariosFromWorkspace(workspaceDirectory, methods, port) {
  const mocksDir = path.join(workspaceDirectory, "mocks");
  const serverConfig = (await readJsonIfExists(path.join(mocksDir, "mock-server.json")).catch(() => ({}))) || {};
  const streamDefaults = normalizeRuntimeStreamSettings(
    serverConfig.streamDefaults || serverConfig.stream_defaults || {},
    { intervalMs: 500, loop: false, maxLoops: 0 },
  );
  const enabledMethods = normalizeEnabledMethods(serverConfig.enabledMethods || serverConfig.enabled_methods || {});
  const scenariosDir = path.join(mocksDir, "scenarios");
  const manifest = (await readJsonIfExists(path.join(scenariosDir, "manifest.json")).catch(() => ({}))) || {};
  const scenarios = [];
  const activeScenarioIds = normalizeActiveScenarioIds(
    serverConfig.selectedScenarioIds ||
      serverConfig.selected_scenario_ids ||
      serverConfig.activeScenarioIds ||
      serverConfig.active_scenario_ids ||
      {},
  );
  await walkDirectory(scenariosDir, async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".json" && ext !== ".yaml" && ext !== ".yml") return;
    if (path.basename(filePath).toLowerCase() === "manifest.json") return;
    const format = ext === ".json" ? "json" : "yaml";
    const text = await fs.readFile(filePath, "utf8");
    const parsed = parseRuntimeScenarioText(text, format, port);
    const methodScenarios = parsed.scenarios.filter((scenario) =>
      methods.some((method) => method.serviceName === scenario.service && method.methodName === scenario.method),
    );
    scenarios.push(...methodScenarios);
    const selection = parsed.activeScenarioIds || {};
    for (const [key, id] of Object.entries(selection)) {
      if (id && !activeScenarioIds[key]) activeScenarioIds[key] = id;
    }
  });
  for (const [key, item] of Object.entries(manifest || {})) {
    if (
      item &&
      typeof item === "object" &&
      typeof item.selectedScenarioId === "string" &&
      item.selectedScenarioId.trim()
    ) {
      if (!activeScenarioIds[key]) activeScenarioIds[key] = item.selectedScenarioId.trim();
    }
  }
  for (const method of methods || []) {
    const key = `${method.serviceName}/${method.methodName}`;
    const activeScenario = scenarios.find(
      (scenario) =>
        scenario.service === method.serviceName &&
        scenario.method === method.methodName &&
        isRuntimeScenarioActive(scenario),
    );
    if (activeScenario && !activeScenarioIds[key]) activeScenarioIds[key] = activeScenario.id;
  }
  return { scenarios, activeScenarioIds, enabledMethods, streamDefaults };
}

/**
 * Parses one runtime JSON/YAML scenario file.
 */
function parseRuntimeScenarioText(text, format, fallbackPort) {
  const raw = format === "json" ? JSON.parse(text || "{}") : parseSimpleYaml(text || "{}");
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const rawScenarios = Array.isArray(raw)
    ? raw
    : Array.isArray(record.scenarios)
      ? record.scenarios
      : Array.isArray(record.stubs)
        ? record.stubs
        : [];
  const serverRecord =
    record.server && typeof record.server === "object" && !Array.isArray(record.server) ? record.server : {};
  const streamDefaults = normalizeRuntimeStreamSettings(
    serverRecord.streamDefaults || serverRecord.stream_defaults || {},
    { intervalMs: 500, loop: false, maxLoops: 0 },
  );
  const activeScenarioIds = normalizeActiveScenarioIds(
    serverRecord.selectedScenarioIds ||
      serverRecord.selected_scenario_ids ||
      serverRecord.activeScenarios ||
      serverRecord.active_scenarios ||
      {},
  );
  const enabledMethods = normalizeEnabledMethods(serverRecord.enabledMethods || serverRecord.enabled_methods || {});
  const scenarios = rawScenarios
    .map((scenario, index) =>
      normalizeMockRuntimeScenario(applyRuntimeStreamDefaultsToRawScenario(scenario, streamDefaults), index),
    )
    .filter(Boolean);
  return {
    port: normalizeMockServerPort(serverRecord.port || fallbackPort),
    streamDefaults,
    activeScenarioIds,
    enabledMethods,
    scenarios,
  };
}

/**
 * Applies per-file stream defaults to raw stream scenarios before runtime normalization.
 */
function applyRuntimeStreamDefaultsToRawScenario(scenario, defaults) {
  if (!scenario || typeof scenario !== "object" || !scenario.stream || typeof scenario.stream !== "object")
    return scenario;
  return {
    ...scenario,
    stream: {
      ...scenario.stream,
      intervalMs:
        scenario.stream.intervalMs !== undefined
          ? scenario.stream.intervalMs
          : scenario.stream.interval_ms !== undefined
            ? scenario.stream.interval_ms
            : defaults.intervalMs,
      loop: Object.hasOwn(scenario.stream, "loop") ? scenario.stream.loop : defaults.loop,
      maxLoops:
        scenario.stream.maxLoops !== undefined
          ? scenario.stream.maxLoops
          : scenario.stream.max_loops !== undefined
            ? scenario.stream.max_loops
            : defaults.maxLoops,
    },
  };
}

/**
 * Creates a grpc-js handler for unary and server-streaming mock methods.
 */
function createMockHandler(method, runtime, timers, activeCalls) {
  if (method.requestStream) {
    return method.responseStream
      ? (call) =>
          call.destroy(
            grpcStatusError(
              grpc.status.UNIMPLEMENTED,
              "Mock server currently supports unary and server-streaming methods.",
            ),
          )
      : (_call, callback) =>
          callback(
            grpcStatusError(
              grpc.status.UNIMPLEMENTED,
              "Mock server currently supports unary and server-streaming methods.",
            ),
          );
  }

  if (method.responseStream) {
    return (call) => handleMockServerStream(call, method, runtime, timers, activeCalls);
  }

  return (call, callback) => handleMockUnary(call, callback, method, runtime, timers);
}

/**
 * Handles one unary mock request using the latest hot-reloaded runtime config.
 */
function handleMockUnary(call, callback, method, runtime, timers) {
  const request = call?.request ? call.request : {};
  const scenario = findMatchingMockScenario(
    method,
    request,
    runtime.scenarioIndex,
    runtime.activeScenarioIds,
    runtime.enabledMethods,
  );
  if (!scenario) {
    callback(
      grpcStatusError(
        grpc.status.NOT_FOUND,
        buildMockNoMatchMessage(
          method,
          request,
          runtime.scenarioIndex,
          runtime.activeScenarioIds,
          runtime.enabledMethods,
        ),
      ),
    );
    return;
  }

  const output = getMockScenarioOutput(scenario);
  const code = normalizeGrpcStatus(output.code);
  const delayMs = normalizeDelayMs(output.delayMs);
  const timer = setTimeout(() => {
    timers.delete(timer);
    if (code !== grpc.status.OK) {
      callback(grpcStatusError(code, output.message || `Mock scenario ${scenario.id} returned status ${code}.`));
      return;
    }
    callback(null, output.data === undefined ? {} : output.data);
  }, delayMs);
  timers.add(timer);
}

/**
 * Sends a terminal error for a server-streaming mock call. This uses grpc-js
 * status APIs when available and falls back to stream error/destroy/end so the
 * client always receives a closed stream instead of waiting with no messages.
 */
function endMockServerStreamWithError(call, code, message, activeCalls) {
  if (activeCalls) activeCalls.delete(call);
  const error = grpcStatusError(code, message);
  try {
    if (call && typeof call.sendStatus === "function") {
      const metadata = new grpc.Metadata();
      call.sendStatus({ code, details: message || "", metadata });
      return;
    }
  } catch {
    // Fall through to stream-level termination.
  }

  // grpc-js server-streaming calls do not use a unary callback, so a no-match
  // must terminate the writable stream with a non-OK status. Emitting the
  // grpc-shaped error first prevents the client from waiting forever with an
  // open stream and no messages; destroy/end are defensive fallbacks for older
  // runtime shapes.
  try {
    if (call && typeof call.emit === "function") call.emit("error", error);
  } catch {
    // Ignore cleanup failures.
  }
  try {
    if (call && typeof call.destroy === "function") call.destroy(error);
  } catch {
    // Ignore cleanup failures.
  }
  try {
    if (call && typeof call.end === "function") call.end();
  } catch {
    // Ignore cleanup failures.
  }
}

/**
 * Handles one server-streaming mock request. Each tick reads the latest scenario text,
 * so UI/file edits change upcoming stream messages without disconnecting the client.
 */
function handleMockServerStream(call, method, runtime, timers, activeCalls) {
  const request = call?.request ? call.request : {};
  const initialScenario = findMatchingMockScenario(
    method,
    request,
    runtime.scenarioIndex,
    runtime.activeScenarioIds,
    runtime.enabledMethods,
  );
  if (!initialScenario) {
    endMockServerStreamWithError(
      call,
      grpc.status.NOT_FOUND,
      buildMockNoMatchMessage(
        method,
        request,
        runtime.scenarioIndex,
        runtime.activeScenarioIds,
        runtime.enabledMethods,
      ),
      activeCalls,
    );
    return;
  }

  const scenarioId = initialScenario.id;
  let index = 0;
  let restarts = 0;
  let closed = false;

  const cleanup = () => {
    closed = true;
    activeCalls.delete(call);
  };
  activeCalls.add(call);
  if (typeof call.on === "function") {
    call.on("cancelled", cleanup);
    call.on("error", cleanup);
  }

  const scheduleNext = (delay) => {
    if (closed) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      writeNext();
    }, normalizeDelayMs(delay));
    timers.add(timer);
  };

  const writeNext = () => {
    if (closed) return;
    const scenario = getLiveStreamScenario(method, request, scenarioId, runtime);
    if (!scenario) {
      closed = true;
      endMockServerStreamWithError(
        call,
        grpc.status.NOT_FOUND,
        buildMockNoMatchMessage(
          method,
          request,
          runtime.scenarioIndex,
          runtime.activeScenarioIds,
          runtime.enabledMethods,
        ),
        activeCalls,
      );
      return;
    }

    const stream = scenario.stream || {};
    const fallbackOutput = getMockScenarioOutput(scenario);
    const explicitResponses = Array.isArray(stream.responses) ? stream.responses.filter(isUsableMockStreamOutput) : [];
    const responses = explicitResponses.length
      ? explicitResponses
      : isUsableMockStreamOutput(fallbackOutput)
        ? [fallbackOutput]
        : [];
    if (!responses.length) {
      closed = true;
      endMockServerStreamWithError(
        call,
        grpc.status.FAILED_PRECONDITION,
        `Mock stream scenario ${scenario.id} has no stream output. Add stream.responses before starting the stream.`,
        activeCalls,
      );
      return;
    }
    const intervalMs = normalizeDelayMs(
      stream.intervalMs !== undefined ? stream.intervalMs : runtime.streamDefaults.intervalMs,
    );
    const shouldLoop = stream.loop !== undefined ? Boolean(stream.loop) : Boolean(runtime.streamDefaults.loop);
    const maxLoops = Math.max(
      0,
      Math.floor(Number(stream.maxLoops !== undefined ? stream.maxLoops : runtime.streamDefaults.maxLoops || 0)),
    );

    if (index >= responses.length) index = 0;
    const item = responses[index] || {};
    const code = normalizeGrpcStatus(item.code);
    if (code !== grpc.status.OK) {
      closed = true;
      endMockServerStreamWithError(
        call,
        code,
        item.message || `Mock stream scenario ${scenario.id} returned status ${code}.`,
        activeCalls,
      );
      return;
    }

    const wrote = call.write(item.data === undefined ? {} : item.data);
    index += 1;
    if (index >= responses.length) {
      if (!shouldLoop || (maxLoops > 0 && restarts >= maxLoops)) {
        const endDelay = Number(item.delayMs);
        const finish = () => {
          if (closed) return;
          closed = true;
          activeCalls.delete(call);
          call.end();
        };
        const delay = Number.isFinite(endDelay) && endDelay > 0 ? endDelay : intervalMs;
        const timer = setTimeout(() => {
          timers.delete(timer);
          finish();
        }, normalizeDelayMs(delay));
        timers.add(timer);
        return;
      }
      restarts += 1;
      index = 0;
    }
    const responseDelay = Number(item.delayMs);
    const nextDelay = Number.isFinite(responseDelay) && responseDelay > 0 ? responseDelay : intervalMs;
    if (wrote === false && typeof call.once === "function") {
      call.once("drain", () => scheduleNext(nextDelay));
    } else {
      scheduleNext(nextDelay);
    }
  };

  const firstStream = initialScenario.stream || {};
  const firstExplicitResponses = Array.isArray(firstStream.responses)
    ? firstStream.responses.filter(isUsableMockStreamOutput)
    : [];
  const firstFallbackOutput = getMockScenarioOutput(initialScenario);
  const firstResponses = firstExplicitResponses.length
    ? firstExplicitResponses
    : isUsableMockStreamOutput(firstFallbackOutput)
      ? [firstFallbackOutput]
      : [];
  if (!firstResponses.length) {
    endMockServerStreamWithError(
      call,
      grpc.status.FAILED_PRECONDITION,
      `Mock stream scenario ${scenarioId} has no stream output. Add stream.responses before starting the stream.`,
      activeCalls,
    );
    return;
  }
  const firstDelayRaw = Number(firstResponses[0]?.delayMs);
  scheduleNext(Number.isFinite(firstDelayRaw) && firstDelayRaw > 0 ? firstDelayRaw : 0);
}

/**
 * Returns the currently live stream scenario, preferring the scenario that started the call.
 */
function getLiveStreamScenario(method, request, scenarioId, runtime) {
  const candidates = getActiveRuntimeScenariosForMethod(
    method,
    runtime.scenarioIndex,
    runtime.activeScenarioIds,
    runtime.enabledMethods,
  );
  const sameScenario = candidates.find((scenario) => scenario.id === scenarioId);
  if (!sameScenario) return undefined;
  return mockMatcherMatches(sameScenario.input, request) ? sameScenario : undefined;
}

/**
 * Finds the first matching scenario for a method/request pair.
 */
function findMatchingMockScenario(method, request, scenarios, activeScenarioIds, enabledMethods) {
  return getActiveRuntimeScenariosForMethod(method, scenarios, activeScenarioIds, enabledMethods)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    .find((scenario) => mockMatcherMatches(scenario.input, request));
}

/**
 * Returns only scenarios marked active for a method. Inactive scenarios are never matched.
 */
function getActiveRuntimeScenariosForMethod(method, scenarios, activeScenarioIds, enabledMethods) {
  const methodScenarios = scenarios.filter(
    (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
  );
  const keySlash = `${method.serviceName}/${method.methodName}`;
  const keyDot = `${method.serviceName}.${method.methodName}`;
  if (enabledMethods && (enabledMethods[keySlash] === false || enabledMethods[keyDot] === false)) return [];
  const selectedId = activeScenarioIds && (activeScenarioIds[keySlash] || activeScenarioIds[keyDot]);
  if (selectedId)
    return methodScenarios.filter((scenario) => scenario.id === selectedId && isRuntimeScenarioActive(scenario));
  const active =
    methodScenarios
      .filter(isRuntimeScenarioActive)
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0] || methodScenarios[0];
  return active ? [active] : [];
}

function isRuntimeScenarioActive(scenario) {
  return !scenario || scenario.active !== false;
}

/**
 * Builds a gRPC error message that is visible in the response panel when no scenario matches.
 */
function buildMockNoMatchMessage(method, request, scenarios, activeScenarioIds, enabledMethods) {
  const runtimeMethodKey = `${method.serviceName}/${method.methodName}`;
  const allMethodScenarios = scenarios.filter(
    (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
  );
  const activeId =
    activeScenarioIds[runtimeMethodKey] || activeScenarioIds[`${method.serviceName}.${method.methodName}`] || "auto";
  const disabled =
    enabledMethods &&
    (enabledMethods[runtimeMethodKey] === false ||
      enabledMethods[`${method.serviceName}.${method.methodName}`] === false);
  const activeCandidates = getActiveRuntimeScenariosForMethod(method, scenarios, activeScenarioIds, enabledMethods);
  const requestText = stableJson(request);
  const clippedRequest = requestText.length > 600 ? `${requestText.slice(0, 600)}...` : requestText;
  const invalidInput =
    activeCandidates.length > 0 && activeCandidates.every((scenario) => !hasValidRuntimeMatcher(scenario.input));
  return [
    disabled
      ? `Mock request rejected: mocking is disabled for ${runtimeMethodKey}.`
      : invalidInput
        ? `Mock request rejected: selected scenario input is missing or invalid for ${runtimeMethodKey}.`
        : `Mock request rejected: the selected scenario input did not match equals/contains/or for ${runtimeMethodKey}.`,
    `Active scenario: ${activeId}.`,
    `Available scenarios for method: ${allMethodScenarios.map((scenario) => scenario.id).join(", ") || "none"}.`,
    activeCandidates.length
      ? `Checked active scenario(s): ${activeCandidates.map((scenario) => scenario.id).join(", ")}.`
      : "Checked active scenario(s): none.",
    `Request: ${clippedRequest}`,
  ].join(" ");
}

/**
 * Normalizes per-method scenario selections sent by the renderer.
 */
function normalizeActiveScenarioIds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.trim()) output[key] = item.trim();
  }
  return output;
}

function normalizeEnabledMethods(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof key === "string" && key.trim()) output[key] = Boolean(item);
  }
  return output;
}

/**
 * Normalizes one runtime scenario while retaining compatible input/output aliases.
 */
function normalizeMockRuntimeScenario(value, index) {
  if (!value || typeof value !== "object") return null;
  const service = String(value.service || "").trim();
  const method = String(value.method || "").trim();
  if (!service || !method) return null;
  return {
    ...value,
    id: String(value.id || `${service}.${method}.${index + 1}`),
    service,
    method,
    priority: Number(value.priority || 0),
    active: Object.hasOwn(value, "active") ? Boolean(value.active) : true,
    input: normalizeRuntimeMatcher(value.input || value.match),
    response: normalizeRuntimeOutput(value.response || value.output),
    output: normalizeRuntimeOutput(value.output || value.response),
    stream: normalizeRuntimeStream(value.stream),
  };
}

/**
 * Normalizes runtime matcher blocks.
 */
function normalizeRuntimeMatcher(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    equals: Object.hasOwn(value, "equals") ? value.equals : undefined,
    contains: Object.hasOwn(value, "contains") ? value.contains : undefined,
    or: Array.isArray(value.or) ? value.or.map(normalizeRuntimeMatcher).filter(Boolean) : undefined,
  };
}

/**
 * Normalizes runtime output blocks.
 */
function normalizeRuntimeOutput(value) {
  if (!value || typeof value !== "object") return {};
  const code =
    value.code !== undefined ? value.code : value.returnCode !== undefined ? value.returnCode : value.return_code;
  const delayMs = value.delayMs !== undefined ? value.delayMs : value.delay_ms;
  return {
    data: Object.hasOwn(value, "data") ? value.data : undefined,
    code,
    message: value.message,
    delayMs,
  };
}

/**
 * Normalizes runtime stream blocks.
 */
function normalizeRuntimeStream(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    responses: Array.isArray(value.responses) ? value.responses.map(normalizeRuntimeOutput) : [],
    ...normalizeRuntimeStreamSettings(value, {}),
  };
}

/**
 * Normalizes stream interval and loop defaults without forcing missing values to false/0.
 */
function normalizeRuntimeStreamSettings(value, fallback) {
  const record = value && typeof value === "object" ? value : {};
  const intervalRaw = record.intervalMs !== undefined ? record.intervalMs : record.interval_ms;
  const maxLoopsRaw = record.maxLoops !== undefined ? record.maxLoops : record.max_loops;
  return {
    intervalMs: intervalRaw !== undefined ? normalizeDelayMs(intervalRaw) : fallback.intervalMs,
    loop: Object.hasOwn(record, "loop") ? Boolean(record.loop) : fallback.loop,
    maxLoops: maxLoopsRaw !== undefined ? Math.max(0, Math.floor(Number(maxLoopsRaw) || 0)) : fallback.maxLoops,
  };
}

/**
 * Reads output data from a scenario, with response kept as a legacy alias.
 */
function getMockScenarioOutput(scenario) {
  return normalizeRuntimeOutput(scenario.output || scenario.response || {});
}

function isUsableMockStreamOutput(output) {
  if (!output || typeof output !== "object") return false;
  const code = normalizeGrpcStatus(output.code);
  return code !== grpc.status.OK || Object.hasOwn(output, "data");
}

/**
 * Returns true when a scenario has at least one usable input matcher.
 */
function hasValidRuntimeMatcher(matcher) {
  if (!matcher || typeof matcher !== "object") return false;
  if (Object.hasOwn(matcher, "equals") && matcher.equals !== undefined) return true;
  if (Object.hasOwn(matcher, "contains") && isUsableContainsMatcherValue(matcher.contains)) return true;
  return Array.isArray(matcher.or) && matcher.or.some(hasValidRuntimeMatcher);
}

function isUsableContainsMatcherValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * Evaluates equals/contains/or request matchers.
 */
function mockMatcherMatches(matcher, request) {
  if (!hasValidRuntimeMatcher(matcher)) return false;
  if (Array.isArray(matcher.or) && matcher.or.length) {
    return matcher.or.some((item) => mockMatcherMatches(item, request));
  }
  let matched = true;
  if (Object.hasOwn(matcher, "equals") && matcher.equals !== undefined) {
    matched = matched && stableJson(request) === stableJson(matcher.equals);
  }
  if (Object.hasOwn(matcher, "contains") && matcher.contains !== undefined) {
    matched = matched && jsonContains(request, matcher.contains);
  }
  return matched;
}

/**
 * Deep contains matcher that supports object subsets and string contains checks.
 */
function jsonContains(actual, expected) {
  if (!isUsableContainsMatcherValue(expected)) return false;
  if (expected === null || typeof expected !== "object") {
    if (typeof actual === "string" && typeof expected === "string") return actual.includes(expected);
    return stableJson(actual).includes(String(expected));
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedItem) => actual.some((actualItem) => jsonContains(actualItem, expectedItem)));
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) => jsonContains(actual[key], value));
}

/**
 * Parses the small YAML subset generated by the app's scenario editor.
 */
function parseSimpleYaml(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((raw) => ({ indent: (raw.match(/^ */) || [""])[0].length, text: raw.trim() }))
    .filter((line) => line.text && !line.text.startsWith("#"));
  if (lines.length === 0) return {};
  const parsed = parseYamlBlock(lines, 0, lines[0].indent);
  return parsed[0];
}

function parseYamlBlock(lines, startIndex, indent) {
  const current = lines[startIndex];
  if (!current || current.indent < indent) return [{}, startIndex];
  if (current.text.startsWith("-")) return parseYamlArray(lines, startIndex, indent);
  return parseYamlObject(lines, startIndex, indent);
}

function parseYamlArray(lines, startIndex, indent) {
  const output = [];
  let index = startIndex;
  while (index < lines.length && lines[index].indent === indent && lines[index].text.startsWith("-")) {
    const rest = lines[index].text.slice(1).trim();
    index += 1;
    if (!rest) {
      const child = parseYamlBlock(lines, index, indent + 2);
      output.push(child[0]);
      index = child[1];
      continue;
    }
    if (looksLikeYamlKeyValue(rest)) {
      const item = {};
      index = parseYamlKeyValueInto(rest, item, lines, index, indent + 2);
      if (index < lines.length && lines[index].indent >= indent + 2) {
        const child = parseYamlBlock(lines, index, indent + 2);
        if (child[0] && typeof child[0] === "object" && !Array.isArray(child[0])) Object.assign(item, child[0]);
        index = child[1];
      }
      output.push(item);
    } else {
      output.push(parseYamlScalar(rest));
    }
  }
  return [output, index];
}

function parseYamlObject(lines, startIndex, indent) {
  const output = {};
  let index = startIndex;
  while (index < lines.length && lines[index].indent === indent && !lines[index].text.startsWith("-")) {
    index = parseYamlKeyValueInto(lines[index].text, output, lines, index + 1, indent + 2);
  }
  return [output, index];
}

function parseYamlKeyValueInto(text, output, lines, nextIndex, childIndent) {
  const colon = text.indexOf(":");
  if (colon < 0) throw new Error(`Expected key: value, got ${text}`);
  const key = text
    .slice(0, colon)
    .trim()
    .replace(/^['"]|['"]$/g, "");
  const rawValue = text.slice(colon + 1).trim();
  if (!rawValue) {
    if (nextIndex < lines.length && lines[nextIndex].indent >= childIndent) {
      const child = parseYamlBlock(lines, nextIndex, lines[nextIndex].indent);
      output[key] = child[0];
      return child[1];
    }
    output[key] = {};
    return nextIndex;
  }
  output[key] = parseYamlScalar(rawValue);
  return nextIndex;
}

function looksLikeYamlKeyValue(text) {
  const colon = text.indexOf(":");
  return colon > 0 && /^[A-Za-z0-9_.-]+\s*:/.test(text);
}

function parseYamlScalar(text) {
  const trimmed = String(text || "").trim();
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "{}") return {};
  if (trimmed === "[]") return [];
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))
    return JSON.parse(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed)) return numeric;
  return trimmed;
}

/**
 * Stable JSON stringifier for deterministic matching.
 */
function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

/**
 * Converts string/number status values into grpc-js status codes.
 */
function normalizeGrpcStatus(value) {
  if (value === undefined || value === null || value === "") return grpc.status.OK;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const key = String(value).trim().toUpperCase();
  return grpc.status[key] !== undefined ? grpc.status[key] : grpc.status.UNKNOWN;
}

/**
 * Normalizes delay values in milliseconds.
 */
function normalizeDelayMs(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(60_000, Math.floor(numeric));
}

/**
 * Builds a grpc-js compatible Error with status metadata.
 */
function grpcStatusError(code, message) {
  const error = new Error(message || `gRPC status ${code}`);
  error.code = code;
  error.details = message || "";
  try {
    error.metadata = new grpc.Metadata();
  } catch {
    /* metadata is optional */
  }
  return error;
}
