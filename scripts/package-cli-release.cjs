#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const build = spawnSync(
  process.execPath,
  [path.join(__dirname, "build-cli-portable.cjs"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status || 1);

const platformLabel = process.platform === "win32" ? "windows" : process.platform;
const folderName = `layang-cli-${platformLabel}-${process.arch}`;
const cliRoot = path.join(root, "dist", "cli");
const source = path.join(cliRoot, folderName);
if (!fs.existsSync(source)) throw new Error(`Portable CLI output was not found: ${source}`);

const executable = path.join(source, process.platform === "win32" ? "layang.exe" : "layang");
const smoke = spawnSync(executable, ["--help"], { encoding: "utf8" });
if (smoke.error) throw smoke.error;
if (smoke.status !== 0 || !/Layang CLI/.test(smoke.stdout || "") || !/layang ui/.test(smoke.stdout || "")) {
  process.stderr.write(smoke.stderr || smoke.stdout || "Standalone CLI smoke test failed.\n");
  process.exit(smoke.status || 1);
}
process.stdout.write(`Standalone CLI smoke passed: ${executable}\n`);

if (process.platform === "win32") {
  const archive = path.join(cliRoot, `${folderName}.zip`);
  const command = `Compress-Archive -Path '${source.replace(/'/g, "''")}\\*' -DestinationPath '${archive.replace(/'/g, "''")}' -Force`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
  process.stdout.write(`${archive}\n`);
} else if (process.platform === "linux") {
  const archive = path.join(cliRoot, `${folderName}.tar.gz`);
  const result = spawnSync("tar", ["-czf", archive, "-C", source, "."], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
  process.stdout.write(`${archive}\n`);
} else {
  throw new Error(`CLI release archive is not supported on ${process.platform}.`);
}
