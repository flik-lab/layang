#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const skipDependencies = args.has("--skip-dependencies");
const platform = process.platform;
const arch = process.arch;

if (!new Set(["win32", "linux"]).has(platform)) {
  throw new Error(`Portable CLI packaging currently supports Windows and Linux. Current platform: ${platform}.`);
}

const platformLabel = platform === "win32" ? "windows" : "linux";
const output = path.join(root, "dist", "cli", `layang-cli-${platformLabel}-${arch}`);
const appRoot = path.join(output, "app");
const runtimeRoot = path.join(output, "runtime");

function isBuiltin(specifier) {
  return specifier.startsWith("node:") || require("node:module").builtinModules.includes(specifier);
}

function packageRootName(specifier) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

function resolveLocalModule(fromFile, specifier) {
  const candidate = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [candidate, `${candidate}.cjs`, `${candidate}.js`, `${candidate}.json`, path.join(candidate, "index.cjs")];
  return candidates.find((item) => fs.existsSync(item) && fs.statSync(item).isFile()) || "";
}

function collectRuntimeGraph(entry) {
  const files = new Set();
  const packages = new Set();
  const queue = [entry];
  const requirePattern = /require\(\s*["']([^"']+)["']\s*\)/g;

  while (queue.length) {
    const current = queue.shift();
    if (!current || files.has(current)) continue;
    files.add(current);
    if (current.endsWith(".json")) continue;
    const source = fs.readFileSync(current, "utf8");
    for (const match of source.matchAll(requirePattern)) {
      const specifier = match[1];
      if (isBuiltin(specifier)) continue;
      if (specifier.startsWith(".")) {
        const resolved = resolveLocalModule(current, specifier);
        if (!resolved) throw new Error(`Unable to resolve ${specifier} from ${path.relative(root, current)}.`);
        queue.push(resolved);
      } else {
        const packageName = packageRootName(specifier);
        // Electron is intentionally optional in shared filesystem helpers. The CLI
        // runtime never needs the Electron package and those require calls are guarded.
        if (packageName !== "electron") packages.add(packageName);
      }
    }
  }
  return { files, packages };
}

async function copyFilePreservingRoot(source) {
  const relative = path.relative(root, source);
  const target = path.join(appRoot, relative);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.copyFile(source, target);
}

async function copyPackageTree(packageNames) {
  const visited = new Set();
  const queue = [...packageNames];
  while (queue.length) {
    const packageName = queue.shift();
    if (!packageName || visited.has(packageName)) continue;
    visited.add(packageName);
    const source = path.join(root, "node_modules", ...packageName.split("/"));
    const packageJsonPath = path.join(source, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      if (skipDependencies) {
        process.stderr.write(`warning: skipping missing runtime dependency ${packageName}\n`);
        continue;
      }
      throw new Error(`Missing runtime dependency ${packageName}. Run pnpm install before packaging.`);
    }
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const target = path.join(appRoot, "node_modules", ...packageName.split("/"));
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.cp(source, target, { recursive: true, dereference: true });
    for (const dependency of Object.keys({ ...(packageJson.dependencies || {}), ...(packageJson.optionalDependencies || {}) })) {
      queue.push(dependency);
    }
  }
}

function findCompiler() {
  if (platform === "linux") {
    for (const compiler of [process.env.CC, "cc", "gcc", "clang"].filter(Boolean)) {
      const result = spawnSync(compiler, ["--version"], { stdio: "ignore" });
      if (result.status === 0) return { command: compiler, kind: "unix" };
    }
    return null;
  }

  const cl = spawnSync("cl.exe", [], { shell: true, stdio: "ignore" });
  if (cl.status === 0 || cl.status === 2) return { command: "cl.exe", kind: "msvc" };

  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const vswhere = path.join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (fs.existsSync(vswhere)) {
    const located = spawnSync(
      vswhere,
      ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"],
      { encoding: "utf8" },
    );
    const installation = String(located.stdout || "").trim();
    const vcvars = installation ? path.join(installation, "VC", "Auxiliary", "Build", "vcvarsall.bat") : "";
    if (vcvars && fs.existsSync(vcvars)) return { command: "cl.exe", kind: "msvc-vcvars", vcvars };
  }
  for (const compiler of [process.env.CC, "gcc", "clang"].filter(Boolean)) {
    const result = spawnSync(compiler, ["--version"], { shell: true, stdio: "ignore" });
    if (result.status === 0) return { command: compiler, kind: "mingw" };
  }
  return null;
}

function compileLauncher() {
  const compiler = findCompiler();
  if (!compiler) {
    throw new Error(
      platform === "win32"
        ? "A C compiler is required for the Windows launcher (Visual Studio Build Tools, gcc, or clang)."
        : "A C compiler is required for the Linux launcher (cc, gcc, or clang).",
    );
  }
  const source = path.join(root, "packaging", "cli", platform === "win32" ? "launcher-win.c" : "launcher-unix.c");
  const executable = path.join(output, platform === "win32" ? "layang.exe" : "layang");
  const objectFile = path.join(output, "launcher-win.obj");
  let result;
  if (compiler.kind === "msvc") {
    result = spawnSync(compiler.command, ["/nologo", "/O2", `/Fe:${executable}`, `/Fo:${objectFile}`, source], {
      shell: true,
      stdio: "inherit",
    });
  } else if (compiler.kind === "msvc-vcvars") {
    const vcArch = arch === "arm64" ? "arm64" : "x64";
    const compileScript = path.join(output, "compile-launcher.cmd");
    fs.writeFileSync(
      compileScript,
      [
        "@echo off",
        `call "${compiler.vcvars}" ${vcArch} >nul`,
        "if errorlevel 1 exit /b %errorlevel%",
        `cl.exe /nologo /O2 /Fe:"${executable}" /Fo:"${objectFile}" "${source}"`,
        "exit /b %errorlevel%",
        "",
      ].join("\r\n"),
    );
    try {
      result = spawnSync("cmd.exe", ["/d", "/c", compileScript], { stdio: "inherit" });
    } finally {
      fs.rmSync(compileScript, { force: true });
    }
  } else {
    result = spawnSync(compiler.command, ["-O2", "-o", executable, source], { stdio: "inherit" });
  }
  if (platform === "win32") fs.rmSync(objectFile, { force: true });
  if (result.status !== 0) throw new Error(`Failed to compile Layang CLI launcher with ${compiler.command}.`);
  if (platform !== "win32") fs.chmodSync(executable, 0o755);
}

async function main() {
  await fsp.rm(output, { recursive: true, force: true });
  await fsp.mkdir(appRoot, { recursive: true });
  await fsp.mkdir(runtimeRoot, { recursive: true });

  const graph = collectRuntimeGraph(path.join(root, "bin", "layang.cjs"));
  graph.files.add(path.join(root, "package.json"));
  for (const file of graph.files) await copyFilePreservingRoot(file);
  await copyPackageTree(graph.packages);

  const runtimeTarget = path.join(runtimeRoot, platform === "win32" ? "node.exe" : "node");
  await fsp.copyFile(process.execPath, runtimeTarget);
  if (platform !== "win32") await fsp.chmod(runtimeTarget, 0o755);

  const installer = path.join(root, "packaging", "cli", platform === "win32" ? "install-windows.ps1" : "install-linux.sh");
  await fsp.copyFile(installer, path.join(output, path.basename(installer)));
  if (platform !== "win32") await fsp.chmod(path.join(output, path.basename(installer)), 0o755);

  compileLauncher();
  await fsp.writeFile(
    path.join(output, "README.txt"),
    [
      `Layang CLI ${platformLabel}-${arch}`,
      "",
      platform === "win32" ? "Run: .\\layang.exe --help" : "Run: ./layang --help",
      platform === "win32" ? "Install for current user: powershell -ExecutionPolicy Bypass -File .\\install-windows.ps1" : "Install for current user: ./install-linux.sh",
      "",
      "The bundled Node.js runtime is private to Layang CLI; no system Node installation is required.",
      "Use `layang ui <workspace>` to open the same workspace in the desktop app when it is installed.",
      "",
    ].join("\n"),
  );

  process.stdout.write(`${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || error}\n`);
  process.exitCode = 1;
});
