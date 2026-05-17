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
  getDefaultFolder: () => ipcRenderer.invoke("workspace:get-default-folder"),
  ensureDefaultFolder: (bundle) => ipcRenderer.invoke("workspace:ensure-default-folder", { bundle }),
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

contextBridge.exposeInMainWorld("electronWindow", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximizeToggle: () => ipcRenderer.invoke("window:maximize-toggle"),
  close: () => ipcRenderer.invoke("window:close"),
  toggleAlwaysOnTop: () => ipcRenderer.invoke("window:toggle-always-on-top"),
  isAvailable: true,
});
