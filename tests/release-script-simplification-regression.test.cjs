"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const workflow = fs.readFileSync(path.join(root, ".github/workflows/release.yaml"), "utf8");

const expectedScripts = [
  "dev",
  "build",
  "start",
  "desktop",
  "desktop:win",
  "desktop:linux",
  "electron:prepare",
  "cli",
  "cli:dist",
  "lint",
  "lint:fix",
  "typecheck",
  "test",
];

test("package scripts stay intentionally small for releases", () => {
  assert.deepEqual(Object.keys(pkg.scripts), expectedScripts);
  assert.equal(pkg.scripts["test:ci"], undefined);
  assert.equal(pkg.scripts["docs:build"], undefined);
  assert.equal(pkg.scripts["desktop:win:setup:msi"], undefined);
});

test("release verify uses the normal test command and packaging keeps CLI", () => {
  assert.match(workflow, /- name: Test\n {8}run: pnpm test/);
  assert.doesNotMatch(workflow, /test:ci|runtime-ci|test:runtime:deps/);
  assert.match(workflow, /pnpm run desktop:win/);
  assert.match(workflow, /pnpm run desktop:linux/);
  assert.match(workflow, /pnpm run cli:dist/);
});

test("only essential release helper scripts remain", () => {
  const scripts = fs.readdirSync(path.join(root, "scripts")).filter((name) => name.endsWith(".cjs")).sort();
  assert.deepEqual(scripts, ["build-cli-portable.cjs", "electron-runtime.cjs", "package-cli-release.cjs"]);
});
