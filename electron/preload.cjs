const { contextBridge, ipcRenderer } = require("electron");

const activeRunIds = new Set();

function createRunId(explicitRunId) {
  if (explicitRunId) return String(explicitRunId);
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fall through to a renderer-safe id when Web Crypto is unavailable.
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


const activeCliRunIds = new Set();
const guiCliListeners = new Set();
const workspaceOpenListeners = new Set();
let pendingWorkspaceOpenRequest = "";

ipcRenderer.on("workspace:open-request", (_event, directoryPath) => {
  const nextPath = typeof directoryPath === "string" ? directoryPath : "";
  if (!nextPath) return;
  if (workspaceOpenListeners.size === 0) {
    pendingWorkspaceOpenRequest = nextPath;
    return;
  }
  for (const listener of workspaceOpenListeners) {
    try { listener(nextPath); } catch {}
  }
});

function quoteCliValue(value) {
  const text = String(value ?? "");
  if (/^[a-zA-Z0-9_./:@-]+$/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function notifyGuiCliCommand(command, label, replayable = true) {
  const entry = { command, label, replayable, createdAt: new Date().toISOString() };
  for (const listener of guiCliListeners) {
    try { listener(entry); } catch {}
  }
}

function invokeGitWithHistory(channel, payload, command, label, replayable = true) {
  return ipcRenderer.invoke(channel, payload).then((result) => {
    if (result?.ok !== false) notifyGuiCliCommand(command, label, replayable);
    return result;
  });
}

contextBridge.exposeInMainWorld("electronCli", {
  run: (payload, onEvent) => {
    const runId = createRunId(payload?.runId);
    activeCliRunIds.add(runId);
    const listener = typeof onEvent === "function" ? (_event, cliEvent) => onEvent(cliEvent) : null;
    if (listener) ipcRenderer.on(`cli:event:${runId}`, listener);
    return ipcRenderer.invoke("cli:run", { ...(payload || {}), runId }).finally(() => {
      if (listener) ipcRenderer.removeListener(`cli:event:${runId}`, listener);
      activeCliRunIds.delete(runId);
    });
  },
  cancel: (runId) => {
    const targetRunId = runId ? String(runId) : Array.from(activeCliRunIds).at(-1);
    return targetRunId
      ? ipcRenderer.invoke("cli:cancel", { runId: targetRunId })
      : Promise.resolve({ ok: true, cancelled: false });
  },
  mockRuntimeStatus: (workspacePath) => ipcRenderer.invoke("cli:mock-runtime-status", { workspacePath }),
  stopMockRuntime: (workspacePath) => ipcRenderer.invoke("cli:mock-runtime-stop", { workspacePath }),
  onGuiCommand: (callback) => {
    if (typeof callback !== "function") return () => undefined;
    guiCliListeners.add(callback);
    return () => guiCliListeners.delete(callback);
  },
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronGrpc", {
  invoke: (payload) => {
    const runId = createRunId(payload?.runId);
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
  onOpenRequest: (callback) => {
    if (typeof callback !== "function") return () => undefined;
    workspaceOpenListeners.add(callback);
    if (pendingWorkspaceOpenRequest) {
      const nextPath = pendingWorkspaceOpenRequest;
      pendingWorkspaceOpenRequest = "";
      queueMicrotask(() => {
        try { callback(nextPath); } catch {}
      });
    }
    return () => workspaceOpenListeners.delete(callback);
  },
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronGit", {
  info: (payload) => ipcRenderer.invoke("git:info", payload),
  init: (payload) => invokeGitWithHistory("git:init", payload, `layang git:init --branch ${quoteCliValue(payload?.initialBranch || "main")}`, "Initialize Git from GUI"),
  clone: (payload) => ipcRenderer.invoke("git:clone", payload),
  status: (payload) => ipcRenderer.invoke("git:status", payload),
  diff: (payload) => ipcRenderer.invoke("git:diff", payload),
  stage: (payload) => invokeGitWithHistory("git:stage", payload, `layang git:stage${(payload?.paths || []).map((item) => ` --path ${quoteCliValue(item)}`).join("")}`, "Stage Git changes from GUI"),
  unstage: (payload) => invokeGitWithHistory("git:unstage", payload, `layang git:unstage${(payload?.paths || []).map((item) => ` --path ${quoteCliValue(item)}`).join("")}`, "Unstage Git changes from GUI"),
  discard: (payload) => invokeGitWithHistory("git:discard", payload, `layang git:discard${(payload?.paths || []).map((item) => ` --path ${quoteCliValue(item)}`).join("")} --yes`, "Discard Git changes from GUI"),
  commit: (payload) => invokeGitWithHistory("git:commit", payload, `layang git:commit --message ${quoteCliValue(payload?.message || "")}`, "Commit from GUI"),
  log: (payload) => ipcRenderer.invoke("git:log", payload),
  branches: (payload) => ipcRenderer.invoke("git:branches", payload),
  createBranch: (payload) => invokeGitWithHistory("git:branch-create", payload, `layang git:branch-create --name ${quoteCliValue(payload?.name || "")}${payload?.switch ? " --switch" : ""}`, "Create Git branch from GUI"),
  switchBranch: (payload) => invokeGitWithHistory("git:branch-switch", payload, `layang git:branch-switch --name ${quoteCliValue(payload?.name || "")}${payload?.force ? " --force" : ""}`, "Switch Git branch from GUI"),
  fetch: (payload) => invokeGitWithHistory("git:fetch", payload, `layang git:fetch${payload?.remote ? ` --remote ${quoteCliValue(payload.remote)}` : ""}`, "Fetch Git remote from GUI"),
  addRemote: (payload) =>
    invokeGitWithHistory(
      "git:remote-add",
      payload,
      `layang git:remote-add --remote ${quoteCliValue(payload?.name || "origin")} --url "<repository-url>"`,
      "Add Git remote from GUI · enter the repository URL before replaying",
      false,
    ),
  removeRemote: (payload) =>
    invokeGitWithHistory(
      "git:remote-remove",
      payload,
      `layang git:remote-remove --remote ${quoteCliValue(payload?.name || "origin")}`,
      "Remove Git remote from GUI",
    ),
  pull: (payload) => invokeGitWithHistory("git:pull", payload, `layang git:pull${payload?.remote ? ` --remote ${quoteCliValue(payload.remote)}` : ""}${payload?.branch ? ` --branch ${quoteCliValue(payload.branch)}` : ""}${payload?.rebase ? " --rebase" : ""}`, "Pull Git changes from GUI"),
  push: (payload) => invokeGitWithHistory("git:push", payload, `layang git:push${payload?.remote ? ` --remote ${quoteCliValue(payload.remote)}` : ""}${payload?.branch ? ` --branch ${quoteCliValue(payload.branch)}` : ""}${payload?.setUpstream ? " --set-upstream" : ""}`, "Push Git changes from GUI"),
  check: (payload) => ipcRenderer.invoke("git:check", payload),
  scanSecrets: (payload) => ipcRenderer.invoke("git:scan-secrets", payload),
  continueMerge: (payload) => invokeGitWithHistory("git:merge-continue", payload, "layang git:merge-continue", "Continue Git merge from GUI"),
  abortMerge: (payload) => invokeGitWithHistory("git:merge-abort", payload, "layang git:merge-abort", "Abort Git merge from GUI"),
  uxState: (payload) => ipcRenderer.invoke("git:ux-state", payload),
  changeSets: (payload) => ipcRenderer.invoke("git:change-sets", payload),
  saveChangeSet: (payload) =>
    invokeGitWithHistory(
      "git:change-set-save",
      payload,
      `layang git:change-set-create${payload?.id ? ` --id ${quoteCliValue(payload.id)}` : ""} --name ${quoteCliValue(payload?.name || "Change Set")}${payload?.description ? ` --description ${quoteCliValue(payload.description)}` : ""}${payload?.color ? ` --color ${quoteCliValue(payload.color)}` : ""}${(payload?.paths || []).map((item) => ` --path ${quoteCliValue(item)}`).join("")}`,
      payload?.id ? "Update Git change set from GUI" : "Create Git change set from GUI",
    ),
  deleteChangeSet: (payload) =>
    invokeGitWithHistory(
      "git:change-set-delete",
      payload,
      `layang git:change-set-delete --id ${quoteCliValue(payload?.id || "")}`,
      "Delete Git change set from GUI",
    ),
  assignChangeSet: (payload) =>
    invokeGitWithHistory(
      "git:change-set-assign",
      payload,
      `layang git:change-set-assign --id ${quoteCliValue(payload?.id || "")}${(payload?.paths || []).map((item) => ` --path ${quoteCliValue(item)}`).join("")}`,
      "Assign files to Git change set from GUI",
    ),
  markReview: (payload) =>
    invokeGitWithHistory(
      "git:review-mark",
      payload,
      `layang git:review --path ${quoteCliValue(payload?.path || "")} --status ${quoteCliValue(payload?.status || "reviewed")}`,
      "Update Git review status from GUI",
    ),
  reviewSummary: (payload) => ipcRenderer.invoke("git:review-summary", payload),
  enhancedDiff: (payload) => ipcRenderer.invoke("git:diff-enhanced", payload),
  stageHunks: (payload) =>
    invokeGitWithHistory(
      "git:hunk-stage",
      payload,
      `layang git:hunk-stage --path ${quoteCliValue(payload?.file || "")}${(payload?.hunkIds || []).map((id) => ` --hunk ${quoteCliValue(id)}`).join("")}`,
      "Stage Git hunks from GUI",
    ),
  unstageHunks: (payload) =>
    invokeGitWithHistory(
      "git:hunk-unstage",
      payload,
      `layang git:hunk-unstage --path ${quoteCliValue(payload?.file || "")}${(payload?.hunkIds || []).map((id) => ` --hunk ${quoteCliValue(id)}`).join("")}`,
      "Unstage Git hunks from GUI",
    ),
  discardHunks: (payload) =>
    invokeGitWithHistory(
      "git:hunk-discard",
      payload,
      `layang git:hunk-discard --path ${quoteCliValue(payload?.file || "")}${(payload?.hunkIds || []).map((id) => ` --hunk ${quoteCliValue(id)}`).join("")} --yes`,
      "Discard Git hunks from GUI",
    ),
  stageFields: (payload) =>
    invokeGitWithHistory(
      "git:field-stage",
      payload,
      `layang git:field-stage --path ${quoteCliValue(payload?.file || "")}${(payload?.fields || []).map((field) => ` --field ${quoteCliValue(field)}`).join("")}`,
      "Stage structured fields from GUI",
    ),
  unstageFields: (payload) =>
    invokeGitWithHistory(
      "git:field-unstage",
      payload,
      `layang git:field-unstage --path ${quoteCliValue(payload?.file || "")}${(payload?.fields || []).map((field) => ` --field ${quoteCliValue(field)}`).join("")}`,
      "Unstage structured fields from GUI",
    ),
  clearCompletedChangeSets: (payload) =>
    invokeGitWithHistory(
      "git:change-sets-clear-completed",
      payload,
      "layang git:change-sets-clear",
      "Clear completed Git change sets from GUI",
    ),
  incoming: (payload) => ipcRenderer.invoke("git:incoming", payload),
  outgoing: (payload) => ipcRenderer.invoke("git:outgoing", payload),
  commitDetails: (payload) => ipcRenderer.invoke("git:commit-details", payload),
  historyGraph: (payload) => ipcRenderer.invoke("git:history-graph", payload),
  entityHistory: (payload) => ipcRenderer.invoke("git:entity-history", payload),
  branchHealth: (payload) => ipcRenderer.invoke("git:branch-health", payload),
  predictConflicts: (payload) => ipcRenderer.invoke("git:conflict-predict", payload),
  conflictDetails: (payload) => ipcRenderer.invoke("git:conflict-details", payload),
  resolveConflict: (payload) =>
    invokeGitWithHistory(
      "git:conflict-resolve",
      payload,
      `layang git:conflict-resolve --path ${quoteCliValue(payload?.file || "")} --mode ${quoteCliValue(payload?.mode || "custom")}${payload?.mode === "custom" ? ' --content "<resolved-content>"' : ""}`,
      payload?.mode === "custom"
        ? "Resolve Git conflict from GUI · enter resolved content before replaying"
        : "Resolve Git conflict from GUI",
      payload?.mode !== "custom",
    ),
  worktrees: (payload) => ipcRenderer.invoke("git:worktrees", payload),
  addWorktree: (payload) =>
    invokeGitWithHistory(
      "git:worktree-add",
      payload,
      `layang git:worktree-add --directory ${quoteCliValue(payload?.path || "")}${payload?.ref ? ` --ref ${quoteCliValue(payload.ref)}` : ""}${payload?.newBranch ? ` --branch ${quoteCliValue(payload.newBranch)}` : ""}`,
      "Add Git worktree from GUI",
    ),
  removeWorktree: (payload) =>
    invokeGitWithHistory(
      "git:worktree-remove",
      payload,
      `layang git:worktree-remove --directory ${quoteCliValue(payload?.path || "")}${payload?.force ? " --force" : ""}`,
      "Remove Git worktree from GUI",
    ),
  pruneWorktrees: (payload) =>
    invokeGitWithHistory("git:worktree-prune", payload, "layang git:worktree-prune", "Prune Git worktrees from GUI"),
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
