"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

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

module.exports = { readJsonIfExists, walkDirectory, writeTextInside };
