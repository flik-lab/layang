"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const forgeConfig = fs.readFileSync(path.join(__dirname, "..", "forge.config.js"), "utf8");

test("packaged builds flip the Electron fuses that turn the app into a code-injection host", () => {
  assert.match(forgeConfig, /new FusesPlugin\(/);
  assert.match(forgeConfig, /\[FuseV1Options\.EnableNodeOptionsEnvironmentVariable\]: false/);
  assert.match(forgeConfig, /\[FuseV1Options\.EnableNodeCliInspectArguments\]: false/);
  assert.match(forgeConfig, /\[FuseV1Options\.EnableEmbeddedAsarIntegrityValidation\]: true/);
  assert.match(forgeConfig, /\[FuseV1Options\.OnlyLoadAppFromAsar\]: true/);
});

test("RunAsNode stays on while the integrated CLI runs the app binary in Node mode", () => {
  const cliIpc = fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", "cli-ipc.cjs"), "utf8");
  if (/ELECTRON_RUN_AS_NODE: "1"/.test(cliIpc)) {
    assert.match(forgeConfig, /\[FuseV1Options\.RunAsNode\]: true/);
  }
});

test("Windows signing is only configured when a certificate file is provided", () => {
  assert.match(forgeConfig, /process\.env\.WINDOWS_CERTIFICATE_FILE/);
  assert.match(forgeConfig, /\.\.\.\(windowsSign \? \{ windowsSign \} : \{\}\)/);
});
