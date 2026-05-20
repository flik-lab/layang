const { ipcMain } = require("electron");
const {
  getRestMockServerStatus,
  startRestMockServer,
  stopRestMockServer,
  updateRestMockServer,
} = require("../services/rest-mock-server.cjs");

function registerRestMockIpc() {
  ipcMain.handle("rest-mock:start", async (_event, payload) => {
    try {
      return { ok: true, ...(await startRestMockServer(payload || {})) };
    } catch (error) {
      return { ok: false, running: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("rest-mock:update", async (_event, payload) => {
    try {
      return { ok: true, ...(await updateRestMockServer(payload || {})) };
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("rest-mock:stop", async () => {
    try {
      return { ok: true, ...(await stopRestMockServer()) };
    } catch (error) {
      return { ok: false, error: error?.message ? String(error.message) : String(error) };
    }
  });

  ipcMain.handle("rest-mock:status", async () => ({ ok: true, ...getRestMockServerStatus() }));
}

module.exports = { registerRestMockIpc };
