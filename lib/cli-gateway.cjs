"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const protoLoader = require("@grpc/proto-loader");
const os = require("node:os");
const { startGatewayProfile, stopGatewayProfile } = require("../electron/services/grpc-gateway-server.cjs");

function listGatewayProfiles(workspace) {
  return Array.isArray(workspace?.project?.mockServer?.gatewayProfiles)
    ? workspace.project.mockServer.gatewayProfiles
    : [];
}

function findGatewayProfile(workspace, selector) {
  const profiles = listGatewayProfiles(workspace);
  const query = String(selector || "")
    .trim()
    .toLowerCase();
  if (!query) return profiles[0] || null;
  return (
    profiles.find(
      (profile) => String(profile.id).toLowerCase() === query || String(profile.name).toLowerCase() === query,
    ) || null
  );
}

async function startGatewayFromWorkspace(workspace, profile, _options = {}) {
  const protoFiles = resolveProfileProtoFiles(workspace.project, profile);
  const methods = await deriveMethods(protoFiles);
  return startGatewayProfile({
    profile,
    protoFiles,
    methods,
    scenarios: workspace.scenarios || [],
    activeScenarioIds: workspace.project?.mockServer?.selectedScenarioIds || {},
    enabledMethods: workspace.project?.mockServer?.enabledMethods || {},
    workspaceDirectory: workspace.root,
  });
}

async function startGatewayDaemon(workspace, profile, executablePath) {
  const runtimeDir = path.join(workspace.root, ".layang", "gateway-runtime");
  await fsp.mkdir(runtimeDir, { recursive: true });
  const logFile = path.join(runtimeDir, `${safeSegment(profile.id)}.log`);
  const pidFile = gatewayPidFile(workspace.root, profile.id);
  const out = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [executablePath, "gateway:serve", workspace.root, "--profile", profile.id], {
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: true,
  });
  child.unref();
  const record = { pid: child.pid, profileId: profile.id, startedAt: new Date().toISOString(), logFile };
  await fsp.writeFile(pidFile, JSON.stringify(record, null, 2), "utf8");
  return record;
}

async function readGatewayProcessStatus(workspaceRoot, profileId) {
  const file = gatewayPidFile(workspaceRoot, profileId);
  let record;
  try {
    record = JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return { running: false, profileId };
  }
  const running = processExists(Number(record.pid));
  if (!running) {
    await fsp.rm(file, { force: true }).catch(() => undefined);
    await fsp.rm(gatewayStatusFile(workspaceRoot, profileId), { force: true }).catch(() => undefined);
    return { ...record, running: false };
  }
  let runtime = null;
  try {
    runtime = JSON.parse(await fsp.readFile(gatewayStatusFile(workspaceRoot, profileId), "utf8"));
  } catch {
    runtime = null;
  }
  return { ...record, ...(runtime || {}), running: true };
}

async function stopGatewayProcess(workspaceRoot, profileId) {
  const status = await readGatewayProcessStatus(workspaceRoot, profileId);
  if (!status.running) return { running: false, profileId, message: "Gateway is not running." };
  try {
    process.kill(Number(status.pid), "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  await fsp.rm(gatewayPidFile(workspaceRoot, profileId), { force: true });
  return { running: false, profileId, message: "Gateway stop signal sent." };
}

async function serveGateway(workspace, profile) {
  const status = await startGatewayFromWorkspace(workspace, profile);
  const pidFile = gatewayPidFile(workspace.root, profile.id);
  await fsp.mkdir(path.dirname(pidFile), { recursive: true });
  await fsp.writeFile(
    pidFile,
    JSON.stringify(
      { pid: process.pid, profileId: profile.id, startedAt: status.startedAt, bindAddress: status.bindAddress },
      null,
      2,
    ),
    "utf8",
  );
  await new Promise((resolve, reject) => {
    const stop = async () => {
      try {
        await stopGatewayProfile(profile.id);
        await fsp.rm(pidFile, { force: true });
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function resolveProfileProtoFiles(project, profile) {
  const libraries = Array.isArray(project?.protoLibraries) ? project.protoLibraries : [];
  const library =
    libraries.find((item) => item.id === profile.protoLibraryId) ||
    libraries.find((item) => item.id === project.activeProtoLibraryId) ||
    libraries[0];
  if (!library) return Array.isArray(project?.protoFiles) ? project.protoFiles : [];
  const versions = Array.isArray(library.versions) ? library.versions : [];
  const version =
    versions.find((item) => item.id === profile.protoVersionId) ||
    versions.find((item) => item.id === library.defaultVersionId) ||
    versions[0];
  return Array.isArray(version?.files) ? version.files : [];
}

async function deriveMethods(protoFiles) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "layang-cli-gateway-"));
  try {
    const roots = [];
    for (const file of protoFiles) {
      const relative = safeRelative(file.name || "schema.proto");
      const target = path.join(directory, relative);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, String(file.text || ""), "utf8");
      roots.push(relative);
    }
    const definition = protoLoader.loadSync(roots, {
      includeDirs: [directory],
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const methods = [];
    for (const [key, value] of Object.entries(definition)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const serviceMethods = Object.values(value).filter(
        (item) => item && typeof item === "object" && typeof item.path === "string",
      );
      if (!serviceMethods.length) continue;
      for (const item of serviceMethods) {
        const parts = String(item.path).split("/").filter(Boolean);
        const serviceName = parts[0] || key;
        const methodName = item.originalName || parts[1] || "Method";
        methods.push({
          serviceName,
          methodName,
          requestStream: Boolean(item.requestStream),
          responseStream: Boolean(item.responseStream),
          requestType: "",
          responseType: "",
        });
      }
    }
    return methods;
  } finally {
    await fsp.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function gatewayPidFile(root, profileId) {
  return path.join(root, ".layang", "gateway-runtime", `${safeSegment(profileId)}.json`);
}
function gatewayStatusFile(root, profileId) {
  return path.join(root, ".layang", "gateway-runtime", `${safeSegment(profileId)}-status.json`);
}
function processExists(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function safeSegment(value) {
  return String(value || "gateway").replace(/[^a-zA-Z0-9._-]+/g, "-");
}
function safeRelative(value) {
  return (
    String(value || "schema.proto")
      .replace(/\\/g, "/")
      .split("/")
      .filter((item) => item && item !== "." && item !== "..")
      .join("/") || "schema.proto"
  );
}

module.exports = {
  listGatewayProfiles,
  findGatewayProfile,
  startGatewayFromWorkspace,
  startGatewayDaemon,
  readGatewayProcessStatus,
  stopGatewayProcess,
  serveGateway,
};
