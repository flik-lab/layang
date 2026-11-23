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

test("RunAsNode is off and the integrated CLI no longer runs the app binary in Node mode", () => {
  assert.match(forgeConfig, /\[FuseV1Options\.RunAsNode\]: false/);
  const cliIpc = fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", "cli-ipc.cjs"), "utf8");
  assert.doesNotMatch(cliIpc, /ELECTRON_RUN_AS_NODE: "1"/);
  assert.doesNotMatch(cliIpc, /spawn\(process\.execPath/);
  assert.match(cliIpc, /utilityProcess/);
  for (const file of ["main.cjs", "preload.cjs"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", "electron", file), "utf8");
    assert.doesNotMatch(source, /ELECTRON_RUN_AS_NODE/, `${file} does not rely on RunAsNode`);
  }
});

test("Windows signing is only configured when a certificate file is provided", () => {
  assert.match(forgeConfig, /process\.env\.WINDOWS_CERTIFICATE_FILE/);
  assert.match(forgeConfig, /\.\.\.\(windowsSign \? \{ windowsSign \} : \{\}\)/);
});
