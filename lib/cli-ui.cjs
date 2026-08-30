"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

function normalizeCandidate(value) {
  return value ? path.resolve(String(value)) : "";
}

function guiExecutableCandidates(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const execPath = normalizeCandidate(options.execPath || process.execPath);
  const candidates = [];
  const push = (value) => {
    const candidate = normalizeCandidate(value);
    if (!candidate || candidate === execPath || candidates.includes(candidate)) return;
    candidates.push(candidate);
  };

  push(env.LAYANG_GUI_EXECUTABLE);

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const programFiles = env.ProgramFiles || env.PROGRAMFILES || "C:\\Program Files";
    push(path.join(localAppData, "Layang", "Layang.exe"));
    push(path.join(localAppData, "Programs", "Layang", "Layang.exe"));
    push(path.join(programFiles, "Layang", "Layang.exe"));
  } else if (platform === "linux") {
    push(path.join(home, ".local", "bin", "layang-gui"));
    push("/usr/local/bin/layang-gui");
    push("/usr/bin/layang-gui");
    if (env.APPIMAGE && /layang/i.test(path.basename(env.APPIMAGE))) push(env.APPIMAGE);
  } else if (platform === "darwin") {
    push("/Applications/Layang.app/Contents/MacOS/Layang");
    push(path.join(home, "Applications", "Layang.app", "Contents", "MacOS", "Layang"));
  }

  return candidates;
}

function resolveGuiExecutable(options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  return guiExecutableCandidates(options).find((candidate) => existsSync(candidate)) || "";
}

async function launchGui(workspace = ".", options = {}) {
  const executable = options.executable || resolveGuiExecutable(options);
  if (!executable) {
    const platform = options.platform || process.platform;
    const hint =
      platform === "linux"
        ? "Install the Layang desktop app, expose it as layang-gui, or set LAYANG_GUI_EXECUTABLE."
        : platform === "win32"
          ? "Install the Layang desktop app or set LAYANG_GUI_EXECUTABLE to Layang.exe."
          : "Install the Layang desktop app or set LAYANG_GUI_EXECUTABLE.";
    throw new Error(`Layang GUI was not found. ${hint}`);
  }

  const workspacePath = path.resolve(String(workspace || "."));
  const spawnImpl = options.spawnImpl || spawn;
  return await new Promise((resolve, reject) => {
    const child = spawnImpl(executable, ["--workspace", workspacePath], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else {
        if (typeof child?.unref === "function") child.unref();
        resolve({ executable, workspacePath });
      }
    };
    if (typeof child?.once === "function") {
      child.once("error", finish);
      child.once("spawn", () => finish());
    } else {
      finish();
    }
  });
}

async function handleUiCommand(parsed, options = {}) {
  const stdout = options.stdout || process.stdout;
  const result = await launchGui(parsed.workspace || ".", options);
  stdout.write(`Opening Layang UI: ${result.workspacePath}\n`);
  return 0;
}

module.exports = {
  guiExecutableCandidates,
  resolveGuiExecutable,
  launchGui,
  handleUiCommand,
};
