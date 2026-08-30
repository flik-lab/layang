const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");

function firstEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return "";
}

function resolveElectronPackage() {
  let packageJsonPath;
  try {
    packageJsonPath = require.resolve("electron/package.json", { paths: [projectRoot] });
  } catch {
    throw new Error("Electron package is not installed. Run `pnpm install` first.");
  }
  const packageRoot = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return { packageRoot, version: packageJson.version };
}

function electronExecutable(packageRoot) {
  if (process.platform === "win32") return path.join(packageRoot, "dist", "electron.exe");
  if (process.platform === "darwin") {
    return path.join(packageRoot, "dist", "Electron.app", "Contents", "MacOS", "Electron");
  }
  return path.join(packageRoot, "dist", "electron");
}

function electronCacheDirectory() {
  const configured = firstEnv(
    "electron_config_cache",
    "ELECTRON_CONFIG_CACHE",
    "npm_config_electron_config_cache",
    "LAYANG_ELECTRON_CACHE",
  );
  if (configured) return path.resolve(configured);
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "electron", "Cache");
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "electron");
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "electron");
}

function installEnvironment() {
  const env = { ...process.env };
  if (env.LAYANG_ELECTRON_CACHE && !firstEnv("electron_config_cache", "ELECTRON_CONFIG_CACHE")) {
    env.electron_config_cache = env.LAYANG_ELECTRON_CACHE;
  }
  if (env.LAYANG_ELECTRON_MIRROR && !env.ELECTRON_MIRROR) {
    env.ELECTRON_MIRROR = env.LAYANG_ELECTRON_MIRROR;
  }
  if ((env.HTTPS_PROXY || env.HTTP_PROXY || env.https_proxy || env.http_proxy) && !env.ELECTRON_GET_USE_PROXY) {
    env.ELECTRON_GET_USE_PROXY = "1";
  }
  return env;
}

function ensureElectronRuntime() {
  const { packageRoot, version } = resolveElectronPackage();
  const executable = electronExecutable(packageRoot);
  if (fs.existsSync(executable)) return { executable, version, restored: false };

  if (firstEnv("ELECTRON_SKIP_BINARY_DOWNLOAD", "electron_skip_binary_download")) {
    throw new Error(
      "Electron binary is missing but ELECTRON_SKIP_BINARY_DOWNLOAD is enabled. Unset it, then run `pnpm electron:prepare`.",
    );
  }

  const installScript = path.join(packageRoot, "install.js");
  if (!fs.existsSync(installScript)) {
    throw new Error(`Electron ${version} install script was not found at ${installScript}. Run \`pnpm install --force\`.`);
  }

  console.log(`[Layang] Electron ${version} runtime is not unpacked yet.`);
  console.log(`[Layang] Restoring it from the shared Electron cache: ${electronCacheDirectory()}`);
  console.log("[Layang] A network download happens only when that machine cache does not contain this Electron version yet.");

  const result = spawnSync(process.execPath, [installScript], {
    cwd: projectRoot,
    stdio: "inherit",
    env: installEnvironment(),
  });
  if (result.status !== 0 || !fs.existsSync(executable)) {
    throw new Error(
      `Unable to prepare Electron ${version}. If GitHub downloads are blocked, set LAYANG_ELECTRON_MIRROR or your proxy and run \`pnpm electron:prepare\` again.`,
    );
  }
  return { executable, version, restored: true };
}

function launchElectron({ staticMode = false } = {}) {
  const { executable, version, restored } = ensureElectronRuntime();
  if (restored) console.log(`[Layang] Electron ${version} is ready.`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (staticMode) env.ELECTRON_LOAD_STATIC = "1";

  console.log(`[Layang] Starting installed Electron ${version} directly (Forge is only used for packaging).`);
  const child = spawn(executable, [projectRoot], {
    cwd: projectRoot,
    stdio: "inherit",
    env,
    windowsHide: false,
  });

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));
  child.on("error", (error) => {
    console.error(`[Layang] Failed to start Electron: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}

if (require.main === module) {
  try {
    if (process.argv.includes("--prepare")) {
      const result = ensureElectronRuntime();
      console.log(`[Layang] Electron ${result.version} ready: ${result.executable}`);
      console.log(`[Layang] Shared cache: ${electronCacheDirectory()}`);
    } else {
      launchElectron({ staticMode: process.argv.includes("--static") });
    }
  } catch (error) {
    console.error(`[Layang] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = { electronCacheDirectory, ensureElectronRuntime, launchElectron };
