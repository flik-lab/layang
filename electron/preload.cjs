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
  saveFolder: (bundle, directoryPath) => ipcRenderer.invoke("workspace:save-folder", { bundle, directoryPath }),
  openFolder: (directoryPath) => ipcRenderer.invoke("workspace:open-folder", { directoryPath }),
  readMockServer: (directoryPath) => ipcRenderer.invoke("workspace:read-mock-server", { directoryPath }),
  getDefaultFolder: () => ipcRenderer.invoke("workspace:get-default-folder"),
  ensureDefaultFolder: (bundle) => ipcRenderer.invoke("workspace:ensure-default-folder", { bundle }),
  ensureFolder: (bundle, directoryPath) => ipcRenderer.invoke("workspace:ensure-folder", { bundle, directoryPath }),
  getPreference: () => ipcRenderer.invoke("workspace:get-preference"),
  setPreference: (directoryPath) => ipcRenderer.invoke("workspace:set-preference", { directoryPath }),
  chooseFolder: (title) => ipcRenderer.invoke("workspace:choose-folder", { title }),
  openPath: (directoryPath, relativePath, options) =>
    ipcRenderer.invoke("workspace:open-path", { directoryPath, relativePath, ...(options || {}) }),
  isAvailable: true,
});

contextBridge.exposeInMainWorld("electronMock", {
  start: (payload) => ipcRenderer.invoke("mock-server:start", payload),
  stop: () => ipcRenderer.invoke("mock-server:stop"),
  update: (payload) => ipcRenderer.invoke("mock-server:update", payload),
  status: () => ipcRenderer.invoke("mock-server:status"),
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
