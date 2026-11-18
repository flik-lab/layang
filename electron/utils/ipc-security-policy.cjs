"use strict";

const path = require("node:path");
const { isAllowedRendererNavigation } = require("../window/navigation-policy.cjs");

// Keep the trusted renderer origin in one policy. IPC calls from cross-origin
// frames, child frames and unknown windows must never reach privileged handlers.
function rendererPolicy(app, env = process.env, baseDirectory = path.join(__dirname, "..", "..")) {
  return {
    isDev: !app.isPackaged && env.ELECTRON_LOAD_STATIC !== "1",
    startUrl: env.ELECTRON_START_URL || "http://localhost:12999/playground",
    staticIndexPath: path.join(baseDirectory, "out", "playground.html"),
  };
}

function assertTrustedIpcSender(event, channel, options) {
  const sender = event?.sender;
  const frame = event?.senderFrame;
  if (!sender || !frame || frame !== sender.mainFrame || sender.isDestroyed?.()) {
    throw new Error(`Blocked untrusted IPC sender on ${channel}.`);
  }
  const win = options.windowFromWebContents(sender);
  if (!win || win.isDestroyed?.() || !options.isManagedWindow(win)) {
    throw new Error(`Blocked unmanaged IPC window on ${channel}.`);
  }
  const url = String(frame.url || "");
  if (!isAllowedRendererNavigation(url, options.policy)) {
    throw new Error(`Blocked IPC from untrusted renderer origin on ${channel}.`);
  }
  // Prevent a race where a frame has navigated, but a previously queued
  // message was not processed yet.
  if (sender.getURL && sender.getURL() !== url) {
    throw new Error(`Blocked IPC from stale renderer frame on ${channel}.`);
  }
  return win;
}

module.exports = { rendererPolicy, assertTrustedIpcSender };
