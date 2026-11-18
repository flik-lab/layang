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

// --help never loads the gRPC stack, so it cannot catch a dependency missing from the bundle.
verifyBundledDependencies(path.join(source, "app"));
smokeGrpcCommands(executable);

/**
 * Every non-optional dependency of every bundled package must be found the way Node finds it:
 * in the package's own node_modules or in a node_modules folder above it inside the bundle.
 */
function verifyBundledDependencies(appRoot) {
  const missing = [];
  const visit = (directory) => {
    const manifest = path.join(directory, "package.json");
    // app/package.json is Layang's own manifest (desktop UI dependencies included); the CLI's
    // own requirements were already collected from bin/layang.cjs. Check bundled packages only.
    if (directory !== appRoot && fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
      for (const dependency of Object.keys(pkg.dependencies || {})) {
        if (!findInBundle(dependency, directory, appRoot)) missing.push(`${pkg.name || directory} -> ${dependency}`);
      }
    }
    const nested = path.join(directory, "node_modules");
    if (!fs.existsSync(nested)) return;
    for (const entry of fs.readdirSync(nested, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const entryPath = path.join(nested, entry.name);
      if (entry.name.startsWith("@")) {
        for (const scoped of fs.readdirSync(entryPath, { withFileTypes: true }))
          if (scoped.isDirectory()) visit(path.join(entryPath, scoped.name));
      } else visit(entryPath);
    }
  };
  visit(appRoot);
  if (missing.length) {
    process.stderr.write(`Bundled CLI is missing runtime dependencies:\n  ${missing.join("\n  ")}\n`);
    process.exit(1);
  }
  process.stdout.write("Standalone CLI dependency closure verified.\n");
}

function findInBundle(name, fromDir, appRoot) {
  let current = fromDir;
  while (current.startsWith(appRoot)) {
    if (fs.existsSync(path.join(current, "node_modules", ...name.split("/"), "package.json"))) return true;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

/** Imports a proto and inspects the gateway profile with the packaged CLI (loads @grpc/proto-loader). */
function smokeGrpcCommands(cli) {
  const workspace = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "layang-cli-smoke-"));
  try {
    fs.writeFileSync(
      path.join(workspace, "layang.yml"),
      ["version: 6", "kind: workspace", "workspace:", "  id: cli-smoke", "  name: CLI smoke", "format:", "  collections: yaml-entity-v2", "  protos: revision-snapshot-v1", "  mocks: native-yaml-v2", "  examples: request-ref-v2", "  localState: .layang/", ""].join("\n"),
    );
    fs.mkdirSync(path.join(workspace, "gateways"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "gateways", "smoke.gateway.yml"),
      ["version: 2", "kind: gateway", "gateway:", "  id: smoke", "  name: smoke", "  mode: mock", ""].join("\n"),
    );
    const run = (args) => {
      const result = spawnSync(cli, args, { encoding: "utf8" });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        process.stderr.write(`layang ${args.join(" ")} failed:\n${result.stderr || result.stdout}\n`);
        process.exit(result.status || 1);
      }
      return result.stdout || "";
    };
    run(["schema:import", workspace, "--file", path.join(root, "samples", "greeter.proto"), "--name", "smoke"]);
    run(["mock:check", workspace]);
    if (!/smoke \[mock\]/.test(run(["gateway:list", workspace]))) {
      process.stderr.write("layang gateway:list did not list the smoke gateway profile.\n");
      process.exit(1);
    }
    process.stdout.write("Standalone CLI gRPC smoke passed.\n");
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

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
