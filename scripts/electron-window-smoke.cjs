#!/usr/bin/env node
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { ensureElectronRuntime } = require("./electron-runtime.cjs");
const { executable } = ensureElectronRuntime();
const entry = path.resolve(__dirname, "..", "tests", "e2e", "electron-window-smoke-main.cjs");
const tempRoot = path.resolve(os.tmpdir());
const profilePath = fs.mkdtempSync(path.join(tempRoot, "layang-electron-smoke-"));
const env = { ...process.env, ELECTRON_LOAD_STATIC: "0", LAYANG_SMOKE_PROFILE: profilePath };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [entry], { stdio: "inherit", env, cwd: path.resolve(__dirname, "..") });
const watchdog = setTimeout(() => { console.error("[electron-smoke] Electron child timed out"); child.kill(); }, 30_000);
child.on("error", error => { clearTimeout(watchdog); console.error(error); process.exitCode = 1; });
child.on("exit", (code, signal) => { clearTimeout(watchdog); process.exitCode = code ?? (signal ? 1 : 0); });
child.once("close", () => {
  if (path.dirname(profilePath) === tempRoot) {
    try { fs.rmSync(profilePath, { recursive: true, force: true, maxRetries: 3 }); }
    catch (error) { console.warn("[electron-smoke] Could not clean up the temporary profile:", error.message); }
  }
});
