"use strict";

const { net } = require("electron");
const { ipcMain } = require("../utils/trusted-ipc-main.cjs");
const { createRestRequestTransport } = require("../services/rest-request-transport.cjs");

const MAX_ACTIVE_PER_RENDERER = 16;

function registerRestTransportIpc(options = {}) {
  const transport = options.transport || createRestRequestTransport({ fetcher: net.fetch.bind(net) });
  const active = new Map();

  const keyFor = (event, runId) => `${event.sender.id}:${runId}`;
  const abortForSender = (senderId) => {
    for (const [key, entry] of active) {
      if (entry.senderId !== senderId) continue;
      entry.controller.abort();
      active.delete(key);
    }
  };

  ipcMain.handle("rest-transport:invoke", async (event, request) => {
    const runId = typeof request?.runId === "string" ? request.runId.trim() : "";
    if (!runId || runId.length > 128) throw new TypeError("REST runId must be 1–128 characters.");
    const senderId = event.sender.id;
    const key = keyFor(event, runId);
    if (active.has(key)) throw new Error("REST runId is already active.");
    const count = [...active.values()].filter((entry) => entry.senderId === senderId).length;
    if (count >= MAX_ACTIVE_PER_RENDERER) throw new Error("Too many active REST requests in this window.");
    const controller = new AbortController();
    active.set(key, { senderId, controller });
    const onDestroyed = () => abortForSender(senderId);
    event.sender.once("destroyed", onDestroyed);
    try {
      return await transport.invoke(request, controller.signal);
    } finally {
      active.delete(key);
      event.sender.removeListener?.("destroyed", onDestroyed);
    }
  });

  ipcMain.handle("rest-transport:cancel", (event, request) => {
    const runId = typeof request?.runId === "string" ? request.runId.trim() : "";
    if (!runId) return { cancelled: false };
    const key = keyFor(event, runId);
    const entry = active.get(key);
    if (!entry) return { cancelled: false };
    entry.controller.abort();
    return { cancelled: true };
  });
}

module.exports = { registerRestTransportIpc };
