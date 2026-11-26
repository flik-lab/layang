"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = fs.readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");

test("electron-winstaller is a direct dependency at the version maker-squirrel uses", () => {
  // With nodeLinker: hoisted, pnpm left glob@7 out of rimraf's reach on Windows while
  // electron-winstaller -> temp -> rimraf was only an optional transitive chain, and
  // `electron-forge make` failed with "Cannot find module 'glob'". A direct dependency
  // makes the whole chain non-optional, so it installs the same way on every OS.
  const version = pkg.devDependencies?.["electron-winstaller"];
  assert.ok(version, "electron-winstaller must be listed in devDependencies");
  const squirrel = new RegExp(`'@electron-forge/maker-squirrel@[^']+':\\n(?:\\s{4,}.*\\n)*?\\s+electron-winstaller: ${version.replace(/\./g, "\\.")}\\b`);
  assert.match(lock, squirrel, "maker-squirrel must resolve the same electron-winstaller version");
});

test("the Windows CI job loads the packaging makers", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "verify.yaml"), "utf8");
  assert.match(workflow, /require\('@electron-forge\/maker-squirrel'\)/);
});
