"use strict";

const { ipcMain: electronIpcMain, BrowserWindow, app } = require("electron");
const { isManagedWindow } = require("../window/window-manager.cjs");
const { assertTrustedIpcSender, rendererPolicy } = require("./ipc-security-policy.cjs");
const { createGuardedIpcMain } = require("./ipc-handler-gate.cjs");

function createTrustedIpcMain(options = {}) {
  const ipc = options.ipcMain || electronIpcMain;
  const check = (event, channel) => assertTrustedIpcSender(event, channel, {
    windowFromWebContents: options.windowFromWebContents || BrowserWindow.fromWebContents,
    isManagedWindow: options.isManagedWindow || isManagedWindow,
    policy: options.policy || rendererPolicy(options.app || app),
  });
  return createGuardedIpcMain(ipc, check);
}

const ipcMain = createTrustedIpcMain();
module.exports = { ipcMain, createTrustedIpcMain };
