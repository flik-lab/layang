const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const runtime = fs.readFileSync(path.join(root, "scripts", "electron-runtime.cjs"), "utf8");

test("desktop dev launches the installed Electron runtime instead of Forge start", () => {
  assert.match(pkg.scripts.desktop, /node scripts\/electron-runtime\.cjs/);
  assert.doesNotMatch(pkg.scripts.desktop, /electron-forge start/);
  assert.match(pkg.scripts["electron:prepare"], /electron-runtime\.cjs --prepare/);
});

test("Electron runtime bootstrap reuses the OS cache and can restore a missing dist", () => {
  assert.match(runtime, /electron_config_cache/);
  assert.match(runtime, /LOCALAPPDATA/);
  assert.match(runtime, /install\.js/);
  assert.match(runtime, /spawnSync\(process\.execPath/);
  assert.match(runtime, /LAYANG_ELECTRON_MIRROR/);
  assert.match(runtime, /ELECTRON_GET_USE_PROXY/);
  assert.match(runtime, /spawn\(executable, \[projectRoot\]/);
});
