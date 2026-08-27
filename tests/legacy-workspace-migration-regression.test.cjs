"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("desktop startup migrates renderer-local workspace state before first-run setup", () => {
  const controller = read("app/playground/features/workspace/use-workspace-controller.ts");
  const migrationIndex = controller.indexOf("migrateLegacyLocalState(");
  const setupIndex = controller.indexOf("setWorkspaceSetupOpen(true)");

  assert.ok(migrationIndex >= 0, "legacy local-state migration must exist");
  assert.ok(setupIndex >= 0, "first-run workspace setup must still exist as fallback");
  assert.ok(migrationIndex < setupIndex, "migration must run before first-run setup");
  assert.match(controller, /sourceFingerprint/);
  assert.match(controller, /LEGACY_LOCAL_MIGRATION_MARKER_VERSION/);
});

test("legacy local-state migration is exposed through the Electron bridge with explicit statuses", () => {
  const preload = read("electron/preload.cjs");
  const types = read("types/electron.d.ts");
  const main = read("electron/main.cjs");

  assert.match(preload, /migrateLegacyLocalState/);
  assert.match(preload, /workspace:migrate-legacy-local-state/);
  assert.match(types, /"migrated" \| "already-current" \| "skipped" \| "failed"/);
  assert.match(main, /status: "migrated"/);
  assert.match(main, /status: "failed"/);
});

test("readWorkspaceFolder is read-only and migration is orchestrated separately", () => {
  const main = read("electron/main.cjs");
  const readStart = main.indexOf("async function readWorkspaceFolder");
  const openStart = main.indexOf("async function openWorkspaceFolder", readStart);
  const readBody = main.slice(readStart, openStart);
  assert.doesNotMatch(readBody, /migrateLegacyWorkspaceTransaction/);
  assert.match(main.slice(openStart), /migrateLegacyWorkspaceTransaction/);
});

test("workspace format versions are centralized and the manifest is written last", () => {
  const versions = JSON.parse(read("lib/workspace-versions.json"));
  const gitWorkspace = read("lib/git-workspace.cjs");
  const writeStart = gitWorkspace.indexOf("async function writeGitWorkspace");
  const writeEnd = gitWorkspace.indexOf("async function writeCollections", writeStart);
  const body = gitWorkspace.slice(writeStart, writeEnd);

  assert.equal(versions.exportBundleVersion, 5);
  assert.equal(versions.gitWorkspaceVersion, 6);
  assert.match(gitWorkspace, /GIT_WORKSPACE_VERSION/);
  assert.ok(
    body.lastIndexOf("writeYamlAtomic(path.join(root, ROOT_FILE)") > body.indexOf("writeDocumentationSources("),
  );
});
