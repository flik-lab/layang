"use strict";

const { app } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { safeRelativePath } = require("./path-utils.cjs");

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeTextInside(rootDir, relativePath, text) {
  const targetPath = path.resolve(rootDir, relativePath);
  const normalizedRoot = path.resolve(rootDir);
  if (targetPath !== normalizedRoot && !targetPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Refusing to write outside workspace: ${relativePath}`);
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, text, "utf8");
}

async function writeProtoWorkspace(protoFiles) {
  const id = crypto.randomBytes(8).toString("hex");
  const workspaceDir = path.join(app.getPath("temp"), `layang-${id}`);
  await fs.mkdir(workspaceDir, { recursive: true });

  for (const file of protoFiles) {
    const relativePath = safeRelativePath(file.name);
    const absolutePath = path.join(workspaceDir, relativePath);
    const normalizedAbsolute = path.normalize(absolutePath);

    if (!normalizedAbsolute.startsWith(path.normalize(workspaceDir))) {
      throw new Error(`Unsafe proto path: ${file.name}`);
    }

    await fs.mkdir(path.dirname(normalizedAbsolute), { recursive: true });
    await fs.writeFile(normalizedAbsolute, String(file.text || ""), "utf8");
  }

  return workspaceDir;
}

async function walkDirectory(directoryPath, visitor) {
  let entries;
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const childPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) await walkDirectory(childPath, visitor);
    else if (entry.isFile()) await visitor(childPath);
  }
}

module.exports = { readJsonIfExists, walkDirectory, writeProtoWorkspace, writeTextInside };
