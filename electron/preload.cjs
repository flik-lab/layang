const { contextBridge, ipcRenderer } = require("electron");
const crypto = require("node:crypto");

const activeRunIds = new Set();

contextBridge.exposeInMainWorld("electronGrpc", {
  invoke: (payload) => {
    const runId = payload?.runId
      ? String(payload.runId)
      : crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    activeRunIds.add(runId);
    const onEvent = typeof payload.onEvent === "function" ? payload.onEvent : undefined;
    const serializablePayload = { ...payload, runId };
    delete serializablePayload.onEvent;

    let listener;
    if (onEvent) {
      listener = (_event, grpcEvent) => onEvent(grpcEvent);
      ipcRenderer.on(`native-grpc:event:${runId}`, listener);
    }

    return ipcRenderer.invoke("native-grpc:invoke", serializablePayload).finally(() => {
      if (listener) ipcRenderer.removeListener(`native-grpc:event:${runId}`, listener);
      activeRunIds.delete(runId);
    });
  },
  cancelActive: (runId) => {
    const targetRunId = runId ? String(runId) : Array.from(activeRunIds).at(-1);
    return targetRunId
      ? ipcRenderer.invoke("native-grpc:cancel", { runId: targetRunId })
      : Promise.resolve({ cancelled: false });
  },
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronWorkspace", {
  createFolder: (bundle, directoryPath) => ipcRenderer.invoke("workspace:create-folder", { bundle, directoryPath }),
  saveFolder: (bundle, directoryPath) => ipcRenderer.invoke("workspace:save-folder", { bundle, directoryPath }),
  openFolder: (directoryPath) => ipcRenderer.invoke("workspace:open-folder", { directoryPath }),
  readMockServer: (directoryPath) => ipcRenderer.invoke("workspace:read-mock-server", { directoryPath }),
  getDefaultFolder: () => ipcRenderer.invoke("workspace:get-default-folder"),
  ensureDefaultFolder: (bundle) => ipcRenderer.invoke("workspace:ensure-default-folder", { bundle }),
  ensureFolder: (bundle, directoryPath) => ipcRenderer.invoke("workspace:ensure-folder", { bundle, directoryPath }),
  migrateLegacyLocalState: (bundle, directoryPath) =>
    ipcRenderer.invoke("workspace:migrate-legacy-local-state", { bundle, directoryPath }),
  getPreference: () => ipcRenderer.invoke("workspace:get-preference"),
  setPreference: (directoryPath) => ipcRenderer.invoke("workspace:set-preference", { directoryPath }),
  chooseFolder: (title) => ipcRenderer.invoke("workspace:choose-folder", { title }),
  openPath: (directoryPath, relativePath, options) =>
    ipcRenderer.invoke("workspace:open-path", { directoryPath, relativePath, ...(options || {}) }),
  getRevision: (directoryPath) => ipcRenderer.invoke("workspace:get-revision", { directoryPath }),
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronGit", {
  info: (payload) => ipcRenderer.invoke("git:info", payload),
  init: (payload) => ipcRenderer.invoke("git:init", payload),
  clone: (payload) => ipcRenderer.invoke("git:clone", payload),
  status: (payload) => ipcRenderer.invoke("git:status", payload),
  diff: (payload) => ipcRenderer.invoke("git:diff", payload),
  stage: (payload) => ipcRenderer.invoke("git:stage", payload),
  unstage: (payload) => ipcRenderer.invoke("git:unstage", payload),
  discard: (payload) => ipcRenderer.invoke("git:discard", payload),
  commit: (payload) => ipcRenderer.invoke("git:commit", payload),
  log: (payload) => ipcRenderer.invoke("git:log", payload),
  branches: (payload) => ipcRenderer.invoke("git:branches", payload),
  createBranch: (payload) => ipcRenderer.invoke("git:branch-create", payload),
  switchBranch: (payload) => ipcRenderer.invoke("git:branch-switch", payload),
  fetch: (payload) => ipcRenderer.invoke("git:fetch", payload),
  addRemote: (payload) => ipcRenderer.invoke("git:remote-add", payload),
  removeRemote: (payload) => ipcRenderer.invoke("git:remote-remove", payload),
  pull: (payload) => ipcRenderer.invoke("git:pull", payload),
  push: (payload) => ipcRenderer.invoke("git:push", payload),
  check: (payload) => ipcRenderer.invoke("git:check", payload),
  scanSecrets: (payload) => ipcRenderer.invoke("git:scan-secrets", payload),
  continueMerge: (payload) => ipcRenderer.invoke("git:merge-continue", payload),
  abortMerge: (payload) => ipcRenderer.invoke("git:merge-abort", payload),
  uxState: (payload) => ipcRenderer.invoke("git:ux-state", payload),
  changeSets: (payload) => ipcRenderer.invoke("git:change-sets", payload),
  saveChangeSet: (payload) => ipcRenderer.invoke("git:change-set-save", payload),
  deleteChangeSet: (payload) => ipcRenderer.invoke("git:change-set-delete", payload),
  assignChangeSet: (payload) => ipcRenderer.invoke("git:change-set-assign", payload),
  markReview: (payload) => ipcRenderer.invoke("git:review-mark", payload),
  reviewSummary: (payload) => ipcRenderer.invoke("git:review-summary", payload),
  enhancedDiff: (payload) => ipcRenderer.invoke("git:diff-enhanced", payload),
  stageHunks: (payload) => ipcRenderer.invoke("git:hunk-stage", payload),
  unstageHunks: (payload) => ipcRenderer.invoke("git:hunk-unstage", payload),
  discardHunks: (payload) => ipcRenderer.invoke("git:hunk-discard", payload),
  stageFields: (payload) => ipcRenderer.invoke("git:field-stage", payload),
  unstageFields: (payload) => ipcRenderer.invoke("git:field-unstage", payload),
  clearCompletedChangeSets: (payload) => ipcRenderer.invoke("git:change-sets-clear-completed", payload),
  incoming: (payload) => ipcRenderer.invoke("git:incoming", payload),
  outgoing: (payload) => ipcRenderer.invoke("git:outgoing", payload),
  commitDetails: (payload) => ipcRenderer.invoke("git:commit-details", payload),
  historyGraph: (payload) => ipcRenderer.invoke("git:history-graph", payload),
  entityHistory: (payload) => ipcRenderer.invoke("git:entity-history", payload),
  branchHealth: (payload) => ipcRenderer.invoke("git:branch-health", payload),
  predictConflicts: (payload) => ipcRenderer.invoke("git:conflict-predict", payload),
  conflictDetails: (payload) => ipcRenderer.invoke("git:conflict-details", payload),
  resolveConflict: (payload) => ipcRenderer.invoke("git:conflict-resolve", payload),
  worktrees: (payload) => ipcRenderer.invoke("git:worktrees", payload),
  addWorktree: (payload) => ipcRenderer.invoke("git:worktree-add", payload),
  removeWorktree: (payload) => ipcRenderer.invoke("git:worktree-remove", payload),
  pruneWorktrees: (payload) => ipcRenderer.invoke("git:worktree-prune", payload),
  suggestCommit: (payload) => ipcRenderer.invoke("git:commit-suggest", payload),
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronDeepLink", {
  onOpen: (callback) => {
    if (typeof callback !== "function") return () => undefined;
    const listener = (_event, url) => callback(url);
    ipcRenderer.on("layang:deep-link", listener);
    return () => ipcRenderer.removeListener("layang:deep-link", listener);
  },
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronDocs", {
  build: (payload) => ipcRenderer.invoke("docs:build", payload),
  check: (payload) => ipcRenderer.invoke("docs:check", payload),
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronMock", {
  start: (payload) => ipcRenderer.invoke("mock-server:start", payload),
  stop: () => ipcRenderer.invoke("mock-server:stop"),
  update: (payload) => ipcRenderer.invoke("mock-server:update", payload),
  status: () => ipcRenderer.invoke("mock-server:status"),
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronGateway", {
  start: (payload) => ipcRenderer.invoke("grpc-gateway:start", payload),
  stop: (payload) => ipcRenderer.invoke("grpc-gateway:stop", payload),
  status: (payload) => ipcRenderer.invoke("grpc-gateway:status", payload),
  list: () => ipcRenderer.invoke("grpc-gateway:list"),
  logs: (payload) => ipcRenderer.invoke("grpc-gateway:logs", payload),
  clearLogs: (payload) => ipcRenderer.invoke("grpc-gateway:logs-clear", payload),
  saveCapture: (payload) => ipcRenderer.invoke("grpc-gateway:capture-save", payload),
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronWsMock", {
  start: (payload) => ipcRenderer.invoke("ws-mock:start", payload),
  stop: () => ipcRenderer.invoke("ws-mock:stop"),
  update: (payload) => ipcRenderer.invoke("ws-mock:update", payload),
  send: (payload) => ipcRenderer.invoke("ws-mock:send", payload),
  status: () => ipcRenderer.invoke("ws-mock:status"),
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronRestMock", {
  start: (payload) => ipcRenderer.invoke("rest-mock:start", payload),
  stop: () => ipcRenderer.invoke("rest-mock:stop"),
  update: (payload) => ipcRenderer.invoke("rest-mock:update", payload),
  status: () => ipcRenderer.invoke("rest-mock:status"),
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronWindow", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximizeToggle: () => ipcRenderer.invoke("window:maximize-toggle"),
  close: () => ipcRenderer.invoke("window:close"),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("window:toggle-always-on-top"),
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronLogger", {
  log: (payload) => ipcRenderer.invoke("logger:log", payload),
  getInfo: () => ipcRenderer.invoke("logger:get-info"),
  setSettings: (settings) => ipcRenderer.invoke("logger:set-settings", settings),
  openFolder: () => ipcRenderer.invoke("logger:open-folder"),
  clear: () => ipcRenderer.invoke("logger:clear"),
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronCertificateSettings", {
  get: () => ipcRenderer.invoke("certificate-settings:get"),
  set: (settings) => ipcRenderer.invoke("certificate-settings:set", settings),
  clear: () => ipcRenderer.invoke("certificate-settings:clear"),
  importFile: () => ipcRenderer.invoke("certificate-settings:import-file"),
  getHttpsEnvironment: () => ipcRenderer.invoke("certificate-settings:https-environment"),
  setupLocalHttps: (payload) => ipcRenderer.invoke("certificate-settings:https-setup-local", payload),
  choosePemFiles: () => ipcRenderer.invoke("certificate-settings:https-choose-pem"),
  choosePfxFile: () => ipcRenderer.invoke("certificate-settings:https-choose-pfx"),
  validateHttpsCertificate: (payload) => ipcRenderer.invoke("certificate-settings:https-validate", payload),
  testHttps: (payload) => ipcRenderer.invoke("certificate-settings:https-test", payload),
  openHttpsFolder: () => ipcRenderer.invoke("certificate-settings:https-open-folder"),
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronAppZoom", {
  get: () => ipcRenderer.invoke("app-zoom:get"),
  set: (zoomPercent) => ipcRenderer.invoke("app-zoom:set", { zoomPercent }),
  zoomIn: () => ipcRenderer.invoke("app-zoom:in"),
  zoomOut: () => ipcRenderer.invoke("app-zoom:out"),
  reset: () => ipcRenderer.invoke("app-zoom:reset"),
  onChanged: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, info) => callback(info);
    ipcRenderer.on("app-zoom:changed", listener);
    return () => ipcRenderer.removeListener("app-zoom:changed", listener);
  },
  isAvailable: true,
});
