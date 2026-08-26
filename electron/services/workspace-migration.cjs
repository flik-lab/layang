"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { ROOT_FILE, readGitWorkspace, writeGitWorkspace } = require("../../lib/git-workspace.cjs");
const { gitWorkspaceVersion } = require("../../lib/workspace-versions.json");

const LEGACY_WORKSPACE_PATHS = Object.freeze([
  "layang.workspace.json",
  "project.json",
  "layout.json",
  "settings.json",
  path.join("collections", "collections.json"),
  path.join("environments", "environments.json"),
  path.join("examples", "examples.json"),
  path.join("docs", "published-docs.json"),
  path.join("docs", "saved-results.json"),
  path.join("requests", "tabs.json"),
  path.join("requests", "items"),
  path.join("history", "history.json"),
  path.join("mocks", "mock-server.json"),
  path.join("mocks", "rest-mock-server.json"),
  path.join("mocks", "scenarios"),
]);

const STRONG_SPLIT_MARKERS = Object.freeze([
  path.join("collections", "collections.json"),
  path.join("requests", "tabs.json"),
  path.join("mocks", "mock-server.json"),
  path.join("environments", "environments.json"),
]);

async function hasRecognizedLegacyWorkspaceFiles(directoryPath) {
  const root = path.resolve(directoryPath);
  const snapshot = await readJsonIfExists(path.join(root, "layang.workspace.json"));
  if (looksLikeLegacyWorkspaceEnvelope(snapshot)) return true;

  const project = await readJsonIfExists(path.join(root, "project.json"));
  const markerCount = STRONG_SPLIT_MARKERS.filter((relative) => fsSync.existsSync(path.join(root, relative))).length;
  if (looksLikeLegacyProjectDocument(project) && markerCount >= 1) return true;

  // Some early split workspaces had no project.json. Require multiple Layang-specific
  // aggregate files so a random folder containing settings.json is never migrated.
  return markerCount >= 2;
}

function looksLikeLegacyWorkspaceEnvelope(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value.type === "layang-workspace" || value.type === "grpc-lab-workspace" || value.project || value.workspace),
  );
}

function looksLikeLegacyProjectDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return [
    "collections",
    "protoFiles",
    "protoLibraries",
    "environments",
    "examples",
    "mockServer",
    "restMockServer",
    "wsMockServer",
    "requestTabs",
    "history",
  ].some((key) => Object.hasOwn(value, key));
}

async function backupLegacyWorkspaceFiles(directoryPath) {
  const root = path.resolve(directoryPath);
  const existing = LEGACY_WORKSPACE_PATHS.filter((relative) => fsSync.existsSync(path.join(root, relative)));
  if (!existing.length) return "";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = path.join(
    root,
    ".layang",
    "backups",
    `legacy-folder-before-git-yaml-v${gitWorkspaceVersion}-${stamp}`,
  );
  await fs.mkdir(backupRoot, { recursive: true });
  for (const relative of existing) {
    const source = path.join(root, relative);
    const target = path.join(backupRoot, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, { recursive: true, force: true });
  }
  await fs.writeFile(
    path.join(backupRoot, "backup.json"),
    `${JSON.stringify({ version: 1, createdAt: new Date().toISOString(), paths: existing.map(toPosix) }, null, 2)}\n`,
    "utf8",
  );
  return backupRoot;
}

async function removeLegacyWorkspaceFiles(directoryPath) {
  const root = path.resolve(directoryPath);
  for (const relative of LEGACY_WORKSPACE_PATHS) {
    await fs.rm(path.join(root, relative), { recursive: true, force: true });
  }
}

async function migrateLegacyWorkspaceTransaction(directoryPath, bundle) {
  const root = path.resolve(directoryPath);
  await fs.mkdir(root, { recursive: true });
  const transactionId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const stageRoot = path.join(root, ".layang", `migration-staging-${transactionId}`);
  const rollbackRoot = path.join(root, ".layang", `migration-rollback-${transactionId}`);
  let backupPath = "";
  let journal = [];

  try {
    await fs.mkdir(stageRoot, { recursive: true });
    await writeGitWorkspace(stageRoot, bundle);
    const staged = await readGitWorkspace(stageRoot);
    if (!staged) throw new Error("Legacy workspace staging did not produce a readable layang.yml workspace.");

    backupPath = await backupLegacyWorkspaceFiles(root);
    journal = await commitStagedWorkspace(stageRoot, root, rollbackRoot);

    const committed = await readGitWorkspace(root);
    if (!committed) throw new Error("Legacy workspace migration did not produce a readable layang.yml workspace.");

    let cleanupWarning = "";
    try {
      await removeLegacyWorkspaceFiles(root);
    } catch (error) {
      cleanupWarning = error?.message ? String(error.message) : String(error);
    }
    return { workspace: committed, backupPath, cleanupWarning };
  } catch (error) {
    if (journal.length) await rollbackCommittedFiles(root, rollbackRoot, journal).catch(() => undefined);
    throw error;
  } finally {
    await fs.rm(stageRoot, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(rollbackRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function commitStagedWorkspace(stageRoot, targetRoot, rollbackRoot) {
  const relativeFiles = await listFiles(stageRoot);
  relativeFiles.sort((a, b) => (a === ROOT_FILE ? 1 : b === ROOT_FILE ? -1 : a.localeCompare(b)));
  const journal = [];
  await fs.mkdir(rollbackRoot, { recursive: true });

  try {
    for (const relative of relativeFiles) {
      const source = path.join(stageRoot, relative);
      const target = path.join(targetRoot, relative);
      const existed = fsSync.existsSync(target);
      if (existed) {
        const rollbackFile = path.join(rollbackRoot, relative);
        await fs.mkdir(path.dirname(rollbackFile), { recursive: true });
        await fs.copyFile(target, rollbackFile);
      }
      journal.push({ relative, existed });
      await copyFileAtomic(source, target);
    }
    return journal;
  } catch (error) {
    await rollbackCommittedFiles(targetRoot, rollbackRoot, journal).catch(() => undefined);
    throw error;
  }
}

async function rollbackCommittedFiles(targetRoot, rollbackRoot, journal) {
  for (const item of [...journal].reverse()) {
    const target = path.join(targetRoot, item.relative);
    if (item.existed) {
      await copyFileAtomic(path.join(rollbackRoot, item.relative), target);
    } else {
      await fs.rm(target, { force: true });
    }
  }
}

async function copyFileAtomic(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.migration-${process.pid}-${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.copyFile(source, temporary);
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
    await fs.rm(target, { force: true });
    await fs.rename(temporary, target);
  }
}

async function listFiles(root) {
  const output = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) output.push(path.relative(root, absolute));
    }
  }
  await visit(root);
  return output;
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

module.exports = {
  LEGACY_WORKSPACE_PATHS,
  hasRecognizedLegacyWorkspaceFiles,
  backupLegacyWorkspaceFiles,
  removeLegacyWorkspaceFiles,
  migrateLegacyWorkspaceTransaction,
};
