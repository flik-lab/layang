"use strict";

const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { readJsonIfExists, walkDirectory, writeProtoWorkspace } = require("../utils/file-utils.cjs");
const { safeRelativePath } = require("../utils/path-utils.cjs");
const {
  isStaleUiRuntimeUpdate,
  markUiRuntimeUpdate,
  shouldIgnoreFileRuntimeUpdate,
} = require("../../lib/grpc-mock-runtime-guard.cjs");

let activeMockServer = null;

const legacyGeneratedMockStreamIntervalMs = 500;
const uiRuntimeFileReloadQuietPeriodMs = 3000;
const fileRuntimeReloadDebounceMs = 800;
const mockWorkspaceWriteLockFileName = ".layang-mock-write-lock.json";

function getReachableMockTargets(port, bindHost) {
  const normalizedPort = normalizeMockServerPort(port);
  const normalizedBindHost = normalizeMockBindHost(bindHost);
  const targets = [
    { label: "Bind IP", host: normalizedBindHost, target: `${normalizedBindHost}:${normalizedPort}` },
  ];
  if (normalizedBindHost === "127.0.0.1" || normalizedBindHost === "localhost") {
    targets.push({ label: "Docker Desktop / APISIX", host: "host.docker.internal", target: `host.docker.internal:${normalizedPort}` });
  }
  const interfaces = os.networkInterfaces ? os.networkInterfaces() : {};
  for (const items of Object.values(interfaces)) {
    for (const item of items || []) {
      if (!item || item.family !== "IPv4" || item.internal || !item.address) continue;
      targets.push({ label: "LAN", host: item.address, target: `${item.address}:${normalizedPort}` });
    }
  }
  const seen = new Set();
  return targets.filter((item) => {
    if (seen.has(item.target)) return false;
    seen.add(item.target);
    return true;
  });
}

function createMockServerStatusPayload(serverState, extra) {
  const port = normalizeMockServerPort(serverState.port);
  const bindHost = normalizeMockBindHost(serverState.bindHost);
  const reachableTargets = getReachableMockTargets(port, bindHost);
  const localTarget = `${bindHost}:${port}`;
  const apisixTarget =
    bindHost === "127.0.0.1" || bindHost === "localhost"
      ? reachableTargets.find((item) => item.host === "host.docker.internal")?.target || localTarget
      : localTarget;
  return {
    running: true,
    port,
    bindHost,
    bindAddress: `${bindHost}:${port}`,
    url: `grpc://${localTarget}`,
    localTarget,
    apisixTarget,
    reachableTargets,
    ...extra,
  };
}

function registerGrpcHealthService(server) {
  const healthServiceDefinition = {
    Check: {
      path: "/grpc.health.v1.Health/Check",
      requestStream: false,
      responseStream: false,
      requestSerialize: serializeGrpcHealthRequest,
      requestDeserialize: deserializeGrpcHealthRequest,
      responseSerialize: serializeGrpcHealthResponse,
      responseDeserialize: deserializeGrpcHealthResponse,
    },
    Watch: {
      path: "/grpc.health.v1.Health/Watch",
      requestStream: false,
      responseStream: true,
      requestSerialize: serializeGrpcHealthRequest,
      requestDeserialize: deserializeGrpcHealthRequest,
      responseSerialize: serializeGrpcHealthResponse,
      responseDeserialize: deserializeGrpcHealthResponse,
    },
  };
  server.addService(healthServiceDefinition, {
    Check: (_call, callback) => callback(null, { status: 1 }),
    Watch: (call) => {
      call.write({ status: 1 });
      call.end();
    },
  });
}

function serializeGrpcHealthRequest(value) {
  const service = value && typeof value.service === "string" ? Buffer.from(value.service, "utf8") : Buffer.alloc(0);
  if (!service.length) return Buffer.alloc(0);
  return Buffer.concat([Buffer.from([0x0a, service.length]), service]);
}

function deserializeGrpcHealthRequest(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (bytes[0] !== 0x0a || !bytes[1]) return { service: "" };
  return { service: bytes.slice(2, 2 + bytes[1]).toString("utf8") };
}

function serializeGrpcHealthResponse(value) {
  const status = Math.max(0, Math.min(255, Number(value?.status || 1)));
  return Buffer.from([0x08, status]);
}

function deserializeGrpcHealthResponse(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  return { status: bytes[0] === 0x08 ? bytes[1] || 0 : 0 };
}

async function startMockServer(payload) {
  await stopMockServer();
  const port = normalizeMockServerPort(payload.port || 50055);
  const bindHost = normalizeMockBindHost(payload.bindHost);
  const protoFiles = Array.isArray(payload.protoFiles) ? payload.protoFiles : [];
  const methods = Array.isArray(payload.methods) ? payload.methods : [];
  const scenarios = Array.isArray(payload.scenarios) ? payload.scenarios : [];
  const streamDefaults = normalizeRuntimeStreamSettings(payload.streamDefaults || {}, {
    intervalMs: 1000,
    loop: false,
    maxLoops: 0,
  });
  const activeScenarioIds = normalizeActiveScenarioIds(payload.activeScenarioIds || payload.selectedScenarioIds || {});
  const enabledMethods = normalizeEnabledMethods(payload.enabledMethods || payload.enabled_methods || {});
  const workspaceDirectory =
    payload.workspaceDirectory && typeof payload.workspaceDirectory === "string" ? payload.workspaceDirectory : "";

  if (!protoFiles.length) throw new Error("At least one proto file is required to start the mock server.");
  if (!methods.length) throw new Error("No RPC methods were provided for the mock server.");

  const workspaceDir = await writeProtoWorkspace(protoFiles);
  const rootProtoFiles = protoFiles.map((file) => safeRelativePath(file.name));
  const packageDefinition = protoLoader.loadSync(rootProtoFiles, {
    includeDirs: [workspaceDir],
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loadedPackage = grpc.loadPackageDefinition(packageDefinition);
  const server = new grpc.Server({
    "grpc.max_receive_message_length": 50 * 1024 * 1024,
    "grpc.max_send_message_length": 50 * 1024 * 1024,
  });
  registerGrpcHealthService(server);
  const timers = new Set();
  const activeCalls = new Set();
  const runtime = createMockRuntimeState(scenarios, streamDefaults, activeScenarioIds, enabledMethods, "start");
  const byService = new Map();

  for (const method of methods) {
    if (!method?.serviceName || !method.methodName) continue;
    const list = byService.get(method.serviceName) || [];
    list.push(method);
    byService.set(method.serviceName, list);
  }

  let methodCount = 0;
  for (const [serviceName, serviceMethods] of byService.entries()) {
    const ServiceCtor = getByDottedPath(loadedPackage, serviceName);
    const serviceDefinition = ServiceCtor?.service;
    if (!serviceDefinition) continue;
    const handlers = {};
    for (const method of serviceMethods) {
      const handlerName = findServiceDefinitionKey(serviceDefinition, method.methodName);
      handlers[handlerName] = createMockHandler(method, runtime, timers, activeCalls);
      methodCount += 1;
    }
    server.addService(serviceDefinition, handlers);
  }

  if (methodCount === 0) {
    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    throw new Error("No mockable service definitions were found in the loaded proto files.");
  }

  const boundPort = await new Promise((resolve, reject) => {
    server.bindAsync(`${bindHost}:${port}`, grpc.ServerCredentials.createInsecure(), (error, actualPort) => {
      if (error) reject(error);
      else resolve(actualPort);
    });
  });

  if (typeof server.start === "function") server.start();
  activeMockServer = {
    server,
    runtime,
    timers,
    activeCalls,
    workspaceDir,
    watchedWorkspaceDir: workspaceDirectory,
    watcher: null,
    configWatcher: null,
    watcherDebounce: null,
    port: boundPort,
    bindHost,
    methodCount,
    methods,
    protoFiles,
    methodSignature: createMockMethodSignature(methods),
    protoSignature: createMockProtoSignature(protoFiles),
    startedAt: new Date().toISOString(),
    hasUiStreamDefaultsOverride: false,
    hasUiRuntimeOverride: false,
    lastUiRuntimeUpdateAt: 0,
    lastUiRuntimeRevision: 0,
  };
  await startMockScenarioWatcher(workspaceDirectory, activeMockServer);

  return createMockServerStatusPayload(activeMockServer, {
    scenarioCount: runtime.scenarioIndex.length,
    activeScenarioIds: runtime.activeScenarioIds,
    enabledMethods: runtime.enabledMethods,
    methodCount,
    configVersion: runtime.configVersion,
  });
}

/**
 * Stops the active mock server and clears open stream timers.
 */
async function stopMockServer() {
  const active = activeMockServer;
  if (!active) return;
  activeMockServer = null;
  if (active.watcherDebounce) clearTimeout(active.watcherDebounce);
  if (active.watcher && typeof active.watcher.close === "function") {
    try {
      active.watcher.close();
    } catch {
      /* ignore */
    }
  }
  if (active.configWatcher && typeof active.configWatcher.close === "function") {
    try {
      active.configWatcher.close();
    } catch {
      /* ignore */
    }
  }
  for (const timer of active.timers || []) clearTimeout(timer);
  for (const call of active.activeCalls || []) {
    try {
      call.destroy(grpcStatusError(grpc.status.UNAVAILABLE, "Mock server stopped. Stream disconnected."));
    } catch {
      /* ignore */
    }
  }
  await new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    try {
      active.server.tryShutdown(done);
      setTimeout(() => {
        try {
          active.server.forceShutdown();
        } catch {
          /* ignore */
        }
        done();
      }, 600);
    } catch {
      try {
        active.server.forceShutdown();
      } catch {
        /* ignore */
      }
      done();
    }
  });
  if (active.workspaceDir) await fs.rm(active.workspaceDir, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Normalizes the mock server port.
 */
function normalizeMockBindHost(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw === "0.0.0.0" || raw === "::") return "127.0.0.1";
  const cleaned = raw.replace(/^grpc:\/\//i, "").split(":")[0]?.trim() || "127.0.0.1";
  if (!cleaned || cleaned === "0.0.0.0" || cleaned === "::") return "127.0.0.1";
  return cleaned;
}

function normalizeMockServerPort(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return 50055;
  return Math.max(1, Math.min(65535, numeric));
}

/**
 * Finds a nested package/service object by dotted path.
 */
function getByDottedPath(root, dottedPath) {
  return dottedPath.split(".").reduce((current, part) => {
    if (current && Object.hasOwn(current, part)) {
      return current[part];
    }
    return undefined;
  }, root);
}

/**
 * Finds the service-definition method key generated by proto-loader.
 */
function findServiceDefinitionKey(serviceDefinition, protoMethodName) {
  const keys = Object.keys(serviceDefinition || {});
  const exact = keys.find((key) => key === protoMethodName);
  if (exact) return exact;
  const lowerCamel = protoMethodName.charAt(0).toLowerCase() + protoMethodName.slice(1);
  const lower = keys.find((key) => key === lowerCamel);
  if (lower) return lower;
  const insensitive = keys.find((key) => key.toLowerCase() === String(protoMethodName).toLowerCase());
  return insensitive || lowerCamel;
}

/**
 * Creates a mutable runtime config that can be hot-swapped while the server keeps running.
 */
function createMockRuntimeState(scenarios, streamDefaults, activeScenarioIds, enabledMethods, source) {
  return {
    scenarioIndex: (Array.isArray(scenarios) ? scenarios : [])
      .map((scenario, index) => normalizeMockRuntimeScenario(scenario, index))
      .filter(Boolean),
    streamDefaults: normalizeRuntimeStreamSettings(streamDefaults || {}, { intervalMs: 1000, loop: false, maxLoops: 0 }),
    activeScenarioIds: normalizeActiveScenarioIds(activeScenarioIds || {}),
    enabledMethods: normalizeEnabledMethods(enabledMethods || {}),
    configVersion: 1,
    updatedAt: new Date().toISOString(),
    source: source || "unknown",
    streamReschedulers: new Set(),
  };
}

function createMockMethodSignature(methods) {
  return JSON.stringify(
    (Array.isArray(methods) ? methods : [])
      .map((method) => ({
        serviceName: String(method?.serviceName || ""),
        methodName: String(method?.methodName || ""),
        requestStream: Boolean(method?.requestStream),
        responseStream: Boolean(method?.responseStream),
        requestType: String(method?.requestType || ""),
        responseType: String(method?.responseType || ""),
      }))
      .sort((a, b) => `${a.serviceName}/${a.methodName}`.localeCompare(`${b.serviceName}/${b.methodName}`)),
  );
}

function createMockProtoSignature(protoFiles) {
  return JSON.stringify(
    (Array.isArray(protoFiles) ? protoFiles : [])
      .map((file) => ({ name: safeRelativePath(file?.name || ""), text: String(file?.text || "") }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
}


/**
 * Replaces active runtime scenarios without restarting the bound gRPC server or open streams.
 */
async function updateActiveMockServer(payload, source) {
  if (!activeMockServer) throw new Error("Mock server is not running.");
  const active = activeMockServer;
  const runtime = active.runtime;
  const nextMethods = Array.isArray(payload.methods) ? payload.methods : active.methods || [];
  const nextProtoFiles = Array.isArray(payload.protoFiles) ? payload.protoFiles : active.protoFiles || [];
  const methodSignature = createMockMethodSignature(nextMethods);
  const protoSignature = createMockProtoSignature(nextProtoFiles);

  const nextBindHost = normalizeMockBindHost(payload.bindHost || active.bindHost);
  const nextPort = normalizeMockServerPort(payload.port || active.port || 50055);
  if (
    methodSignature !== active.methodSignature ||
    protoSignature !== active.protoSignature ||
    nextBindHost !== active.bindHost ||
    nextPort !== active.port
  ) {
    const result = await startMockServer({
      port: nextPort,
      bindHost: nextBindHost,
      protoFiles: nextProtoFiles,
      methods: nextMethods,
      scenarios: Array.isArray(payload.scenarios) ? payload.scenarios : runtime.scenarioIndex,
      streamDefaults: payload.streamDefaults || runtime.streamDefaults,
      activeScenarioIds: payload.activeScenarioIds || payload.selectedScenarioIds || runtime.activeScenarioIds,
      enabledMethods: payload.enabledMethods || runtime.enabledMethods,
      workspaceDirectory:
        payload.workspaceDirectory && typeof payload.workspaceDirectory === "string"
          ? payload.workspaceDirectory
          : active.watchedWorkspaceDir,
    });
    return {
      ...result,
      running: true,
      restarted: true,
      message: "Mock runtime reloaded for updated proto methods.",
      updatedAt: new Date().toISOString(),
    };
  }

  if (source === "ui" && isStaleUiRuntimeUpdate(active, payload)) {
    return createMockServerStatusPayload(active, {
      scenarioCount: runtime.scenarioIndex.length,
      activeScenarioIds: runtime.activeScenarioIds,
      enabledMethods: runtime.enabledMethods,
      methodCount: active.methodCount,
      configVersion: runtime.configVersion,
      updatedAt: runtime.updatedAt,
      source: runtime.source,
      ignoredStaleUpdate: true,
      message: "Ignored stale mock runtime update.",
    });
  }
  if (source === "ui") markUiRuntimeUpdate(active, payload);

  const fileUpdateGuard = shouldIgnoreFileRuntimeUpdate(
    active,
    runtime,
    payload,
    source,
    Date.now(),
    uiRuntimeFileReloadQuietPeriodMs,
  );
  if (fileUpdateGuard.ignore) {
    return createMockServerStatusPayload(active, {
      scenarioCount: runtime.scenarioIndex.length,
      activeScenarioIds: runtime.activeScenarioIds,
      enabledMethods: runtime.enabledMethods,
      methodCount: active.methodCount,
      configVersion: runtime.configVersion,
      updatedAt: runtime.updatedAt,
      source: runtime.source,
      ignoredFileUpdate: true,
      message: fileUpdateGuard.reason === "partial-workspace-write"
        ? "Ignored incomplete mock scenario file reload while workspace save is still writing."
        : "Ignored file mock reload because the running editor state is newer.",
    });
  }
  const nextStreamDefaults =
    source === "file" && active.hasUiStreamDefaultsOverride
      ? runtime.streamDefaults
      : payload.streamDefaults || runtime.streamDefaults;
  const nextScenarios = Array.isArray(payload.scenarios) ? payload.scenarios : runtime.scenarioIndex;
  const nextActiveScenarioIds = payload.activeScenarioIds || payload.selectedScenarioIds || runtime.activeScenarioIds;
  const nextEnabledMethods = payload.enabledMethods || runtime.enabledMethods;
  const next = createMockRuntimeState(
    nextScenarios,
    nextStreamDefaults,
    nextActiveScenarioIds,
    nextEnabledMethods,
    source || "update",
  );
  runtime.scenarioIndex = next.scenarioIndex;
  runtime.streamDefaults = next.streamDefaults;
  runtime.activeScenarioIds = next.activeScenarioIds;
  runtime.enabledMethods = next.enabledMethods;
  runtime.configVersion += 1;
  runtime.updatedAt = new Date().toISOString();
  runtime.source = next.source;
  notifyRuntimeStreamReschedulers(runtime);
  return {
    running: true,
    scenarioCount: runtime.scenarioIndex.length,
    activeScenarioIds: runtime.activeScenarioIds,
    enabledMethods: runtime.enabledMethods,
    configVersion: runtime.configVersion,
    updatedAt: runtime.updatedAt,
    source: runtime.source,
  };
}

function notifyRuntimeStreamReschedulers(runtime) {
  const listeners = runtime?.streamReschedulers;
  if (!listeners || typeof listeners[Symbol.iterator] !== "function") return;
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // Ignore stale stream callbacks; the stream cleanup path removes them.
    }
  }
}

/**
 * True while the workspace save code is rewriting gRPC mock files.
 */
async function isMockWorkspaceWriteLocked(workspaceDirectory) {
  if (!workspaceDirectory) return false;
  try {
    const stat = await fs.stat(path.join(workspaceDirectory, "mocks", mockWorkspaceWriteLockFileName));
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Watches saved external mock per-method files and hot-reloads them into the active runtime.
 */
async function startMockScenarioWatcher(workspaceDirectory, serverState) {
  if (!workspaceDirectory || !serverState) return;
  const scenariosDir = path.join(workspaceDirectory, "mocks", "scenarios");
  try {
    const stat = await fs.stat(scenariosDir);
    if (!stat.isDirectory()) return;
  } catch {
    return;
  }

  const scheduleReload = (delayMs = fileRuntimeReloadDebounceMs) => {
    if (serverState.watcherDebounce) clearTimeout(serverState.watcherDebounce);
    serverState.watcherDebounce = setTimeout(() => void reload(), delayMs);
  };

  const reload = async () => {
    if (activeMockServer !== serverState) return;
    try {
      if (await isMockWorkspaceWriteLocked(workspaceDirectory)) {
        scheduleReload(fileRuntimeReloadDebounceMs);
        return;
      }
      const loaded = await loadRuntimeScenariosFromWorkspace(
        workspaceDirectory,
        serverState.methods || [],
        serverState.port,
      );
      if (!loaded) return;
      if (await isMockWorkspaceWriteLocked(workspaceDirectory)) {
        scheduleReload(fileRuntimeReloadDebounceMs);
        return;
      }
      await updateActiveMockServer(loaded, "file");
    } catch (error) {
      console.warn("[Layang][Mock] scenario file hot reload skipped:", error?.message ? error.message : error);
    }
  };

  try {
    serverState.watcher = fsSync.watch(scenariosDir, { persistent: false }, () => {
      scheduleReload();
    });
    const mocksDir = path.join(workspaceDirectory, "mocks");
    serverState.configWatcher = fsSync.watch(mocksDir, { persistent: false }, (_event, fileName) => {
      const normalizedFileName = String(fileName || "").toLowerCase();
      if (normalizedFileName !== "mock-server.json" && normalizedFileName !== mockWorkspaceWriteLockFileName) return;
      scheduleReload();
    });
  } catch (error) {
    console.warn("[Layang][Mock] scenario watcher disabled:", error?.message ? error.message : error);
  }
}

/**
 * Loads split per-method mock scenario files from a workspace folder for hot reload.
 */
async function loadRuntimeScenariosFromWorkspace(workspaceDirectory, methods, port) {
  const mocksDir = path.join(workspaceDirectory, "mocks");
  let workspaceMtimeMs = 0;
  const noteWorkspaceMtime = async (filePath) => {
    try {
      const stat = await fs.stat(filePath);
      if (Number.isFinite(stat.mtimeMs)) workspaceMtimeMs = Math.max(workspaceMtimeMs, stat.mtimeMs);
    } catch {
      // Optional workspace files may not exist.
    }
  };
  await noteWorkspaceMtime(path.join(mocksDir, "mock-server.json"));
  const serverConfig = (await readJsonIfExists(path.join(mocksDir, "mock-server.json")).catch(() => ({}))) || {};
  const streamDefaults = normalizeRuntimeStreamSettings(
    serverConfig.streamDefaults || serverConfig.stream_defaults || {},
    { intervalMs: 1000, loop: false, maxLoops: 0 },
  );
  const enabledMethods = normalizeEnabledMethods(serverConfig.enabledMethods || serverConfig.enabled_methods || {});
  const scenariosDir = path.join(mocksDir, "scenarios");
  await noteWorkspaceMtime(path.join(scenariosDir, "manifest.json"));
  const manifest = (await readJsonIfExists(path.join(scenariosDir, "manifest.json")).catch(() => ({}))) || {};
  const scenarios = [];
  const activeScenarioIds = normalizeActiveScenarioIds(
    serverConfig.selectedScenarioIds ||
      serverConfig.selected_scenario_ids ||
      serverConfig.activeScenarioIds ||
      serverConfig.active_scenario_ids ||
      {},
  );
  await walkDirectory(scenariosDir, async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".json" && ext !== ".yaml" && ext !== ".yml") return;
    if (path.basename(filePath).toLowerCase() === "manifest.json") return;
    const format = ext === ".json" ? "json" : "yaml";
    await noteWorkspaceMtime(filePath);
    const text = await fs.readFile(filePath, "utf8");
    const parsed = parseRuntimeScenarioText(text, format, port);
    const methodScenarios = parsed.scenarios.filter((scenario) =>
      methods.some((method) => method.serviceName === scenario.service && method.methodName === scenario.method),
    );
    scenarios.push(...methodScenarios);
    const selection = parsed.activeScenarioIds || {};
    for (const [key, id] of Object.entries(selection)) {
      if (id && !activeScenarioIds[key]) activeScenarioIds[key] = id;
    }
  });
  for (const [key, item] of Object.entries(manifest || {})) {
    if (
      item &&
      typeof item === "object" &&
      typeof item.selectedScenarioId === "string" &&
      item.selectedScenarioId.trim()
    ) {
      if (!activeScenarioIds[key]) activeScenarioIds[key] = item.selectedScenarioId.trim();
    }
  }
  for (const method of methods || []) {
    const key = `${method.serviceName}/${method.methodName}`;
    const activeScenario = scenarios.find(
      (scenario) =>
        scenario.service === method.serviceName &&
        scenario.method === method.methodName &&
        isRuntimeScenarioActive(scenario),
    );
    if (activeScenario && !activeScenarioIds[key]) activeScenarioIds[key] = activeScenario.id;
  }
  return { scenarios, activeScenarioIds, enabledMethods, streamDefaults, workspaceMtimeMs };
}

/**
 * Parses one runtime JSON/YAML scenario file.
 */
function parseRuntimeScenarioText(text, format, fallbackPort) {
  const raw = format === "json" ? JSON.parse(text || "{}") : parseSimpleYaml(text || "{}");
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const rawScenarios = Array.isArray(raw)
    ? raw
    : Array.isArray(record.scenarios)
      ? record.scenarios
      : Array.isArray(record.stubs)
        ? record.stubs
        : [];
  const serverRecord =
    record.server && typeof record.server === "object" && !Array.isArray(record.server) ? record.server : {};
  const hasPerFileStreamDefaults = Boolean(serverRecord.streamDefaults || serverRecord.stream_defaults);
  const streamDefaults = hasPerFileStreamDefaults
    ? normalizeRuntimeStreamSettings(serverRecord.streamDefaults || serverRecord.stream_defaults || {}, {})
    : {};
  const activeScenarioIds = normalizeActiveScenarioIds(
    serverRecord.selectedScenarioIds ||
      serverRecord.selected_scenario_ids ||
      serverRecord.activeScenarios ||
      serverRecord.active_scenarios ||
      {},
  );
  const enabledMethods = normalizeEnabledMethods(serverRecord.enabledMethods || serverRecord.enabled_methods || {});
  const scenarios = rawScenarios
    .map((scenario, index) =>
      normalizeMockRuntimeScenario(applyRuntimeStreamDefaultsToRawScenario(scenario, streamDefaults), index),
    )
    .filter(Boolean);
  return {
    port: normalizeMockServerPort(serverRecord.port || fallbackPort),
    streamDefaults,
    activeScenarioIds,
    enabledMethods,
    scenarios,
  };
}

/**
 * Applies per-file stream defaults to raw stream scenarios before runtime normalization.
 */
function applyRuntimeStreamDefaultsToRawScenario(scenario, defaults) {
  if (!scenario || typeof scenario !== "object" || !scenario.stream || typeof scenario.stream !== "object")
    return scenario;
  const stream = { ...scenario.stream };
  if (stream.intervalMs === undefined && stream.interval_ms === undefined && defaults?.intervalMs !== undefined) {
    stream.intervalMs = defaults.intervalMs;
  }
  if (!Object.hasOwn(stream, "loop") && defaults?.loop !== undefined) {
    stream.loop = defaults.loop;
  }
  if (stream.maxLoops === undefined && stream.max_loops === undefined && defaults?.maxLoops !== undefined) {
    stream.maxLoops = defaults.maxLoops;
  }
  return {
    ...scenario,
    stream,
  };
}

/**
 * Creates a grpc-js handler for unary and server-streaming mock methods.
 */
function createMockHandler(method, runtime, timers, activeCalls) {
  if (method.requestStream) {
    return method.responseStream
      ? (call) =>
          call.destroy(
            grpcStatusError(
              grpc.status.UNIMPLEMENTED,
              "Mock server currently supports unary and server-streaming methods.",
            ),
          )
      : (_call, callback) =>
          callback(
            grpcStatusError(
              grpc.status.UNIMPLEMENTED,
              "Mock server currently supports unary and server-streaming methods.",
            ),
          );
  }

  if (method.responseStream) {
    return (call) => handleMockServerStream(call, method, runtime, timers, activeCalls);
  }

  return (call, callback) => handleMockUnary(call, callback, method, runtime, timers);
}

/**
 * Handles one unary mock request using the latest hot-reloaded runtime config.
 */
function handleMockUnary(call, callback, method, runtime, timers) {
  const request = call?.request ? call.request : {};
  const requestContext = createMockRequestContext(call);
  const scenario = findMatchingMockScenario(
    method,
    requestContext,
    runtime.scenarioIndex,
    runtime.activeScenarioIds,
    runtime.enabledMethods,
  );
  if (!scenario) {
    callback(
      grpcStatusError(
        grpc.status.NOT_FOUND,
        buildMockNoMatchMessage(
          method,
          request,
          runtime.scenarioIndex,
          runtime.activeScenarioIds,
          runtime.enabledMethods,
        ),
      ),
    );
    return;
  }

  const output = getMockScenarioOutput(scenario);
  const code = normalizeGrpcStatus(output.code);
  const delayMs = normalizeDelayMs(output.delayMs);
  const timer = setTimeout(() => {
    timers.delete(timer);
    if (code !== grpc.status.OK) {
      callback(grpcStatusError(code, output.message || `Mock scenario ${scenario.id} returned status ${code}.`));
      return;
    }
    callback(null, output.data === undefined ? {} : output.data);
  }, delayMs);
  timers.add(timer);
}

/**
 * Sends a terminal error for a server-streaming mock call. This uses grpc-js
 * status APIs when available and falls back to stream error/destroy/end so the
 * client always receives a closed stream instead of waiting with no messages.
 */
function endMockServerStreamWithError(call, code, message, activeCalls) {
  if (activeCalls) activeCalls.delete(call);
  const error = grpcStatusError(code, message);
  try {
    if (call && typeof call.sendStatus === "function") {
      const metadata = new grpc.Metadata();
      call.sendStatus({ code, details: message || "", metadata });
      return;
    }
  } catch {
    // Fall through to stream-level termination.
  }

  // grpc-js server-streaming calls do not use a unary callback, so a no-match
  // must terminate the writable stream with a non-OK status. Emitting the
  // grpc-shaped error first prevents the client from waiting forever with an
  // open stream and no messages; destroy/end are defensive fallbacks for older
  // runtime shapes.
  try {
    if (call && typeof call.emit === "function") call.emit("error", error);
  } catch {
    // Ignore cleanup failures.
  }
  try {
    if (call && typeof call.destroy === "function") call.destroy(error);
  } catch {
    // Ignore cleanup failures.
  }
  try {
    if (call && typeof call.end === "function") call.end();
  } catch {
    // Ignore cleanup failures.
  }
}

/**
 * Handles one server-streaming mock request. Each tick reads the latest scenario text,
 * so UI/file edits change upcoming stream messages without disconnecting the client.
 */
function handleMockServerStream(call, method, runtime, timers, activeCalls) {
  const request = call?.request ? call.request : {};
  const requestContext = createMockRequestContext(call);
  const initialScenario = findMatchingMockScenario(
    method,
    requestContext,
    runtime.scenarioIndex,
    runtime.activeScenarioIds,
    runtime.enabledMethods,
  );
  if (!initialScenario) {
    endMockServerStreamWithError(
      call,
      grpc.status.NOT_FOUND,
      buildMockNoMatchMessage(
        method,
        request,
        runtime.scenarioIndex,
        runtime.activeScenarioIds,
        runtime.enabledMethods,
      ),
      activeCalls,
    );
    return;
  }

  let currentScenarioId = initialScenario.id;
  let currentResponseSignature = createRuntimeStreamResponsesSignature(getRuntimeStreamResponses(initialScenario));
  let sentResponseCounts = new Map();
  let index = 0;
  let completedCycles = 0;
  let closed = false;
  let pendingTimer = null;
  let pendingAction = null;
  let pendingActionKind = null;
  let pendingUsesRuntimeInterval = false;
  let pendingTimerStartedAt = 0;
  let pendingPlannedDelayMs = 0;
  let pendingCompletedCycle = false;

  const clearPendingTimer = () => {
    if (!pendingTimer) return;
    clearTimeout(pendingTimer);
    timers.delete(pendingTimer);
    pendingTimer = null;
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearPendingTimer();
    activeCalls.delete(call);
    if (runtime.streamReschedulers && typeof runtime.streamReschedulers.delete === "function") {
      runtime.streamReschedulers.delete(reschedulePendingStreamTimer);
    }
  };

  const failStream = (code, message) => {
    cleanup();
    endMockServerStreamWithError(call, code, message, activeCalls);
  };

  const getLiveSnapshot = () => {
    const scenario = getLiveStreamScenario(method, requestContext, currentScenarioId, runtime);
    if (!scenario) return undefined;
    const responses = getRuntimeStreamResponses(scenario);
    const timing = getRuntimeStreamTiming(scenario, runtime);
    const responseSignature = createRuntimeStreamResponsesSignature(responses);
    const scenarioChanged = Boolean(currentScenarioId && scenario.id !== currentScenarioId);
    const responseStackChanged = Boolean(
      !scenarioChanged &&
        currentResponseSignature &&
        responseSignature &&
        responseSignature !== currentResponseSignature,
    );

    if (scenarioChanged) {
      currentScenarioId = scenario.id;
      currentResponseSignature = responseSignature;
      sentResponseCounts = new Map();
      index = 0;
      completedCycles = 0;
      pendingCompletedCycle = false;
    } else if (responseStackChanged) {
      currentResponseSignature = responseSignature;
      if (timing.shouldLoop) {
        sentResponseCounts = new Map();
        index = 0;
        completedCycles = 0;
        pendingCompletedCycle = false;
      } else {
        const nextUnsentIndex = findFirstUnsentRuntimeStreamResponseIndex(responses, sentResponseCounts);
        if (nextUnsentIndex >= 0 && (pendingActionKind === "finish" || index >= responses.length || nextUnsentIndex < index)) {
          index = nextUnsentIndex;
          completedCycles = 0;
          pendingCompletedCycle = false;
        } else if (index > responses.length) {
          index = responses.length;
        }
      }
    } else {
      currentScenarioId = scenario.id;
      currentResponseSignature = responseSignature;
    }

    return { scenario, responses, timing };
  };

  const getLiveTiming = () => getLiveSnapshot()?.timing;

  const getActionForPendingKind = (kind) => (kind === "finish" ? finishStream : writeNext);

  const canContinueAfterCompletedCycle = (timing) =>
    Boolean(timing?.shouldLoop) && (timing.maxLoops <= 0 || completedCycles <= timing.maxLoops);

  const resolvePendingActionForLiveSnapshot = (currentKind, snapshot) => {
    if (!snapshot?.timing || !currentKind) return { kind: currentKind, undoCompletedCycle: false };
    if (currentKind === "finish") {
      if (index < snapshot.responses.length) return { kind: "next", undoCompletedCycle: pendingCompletedCycle };
      if (canContinueAfterCompletedCycle(snapshot.timing)) return { kind: "next", undoCompletedCycle: false };
    }
    if (
      currentKind === "next" &&
      index === 0 &&
      completedCycles > 0 &&
      !canContinueAfterCompletedCycle(snapshot.timing)
    ) {
      return { kind: "finish", undoCompletedCycle: false };
    }
    if (currentKind === "next" && index >= snapshot.responses.length && !canContinueAfterCompletedCycle(snapshot.timing)) {
      return { kind: "finish", undoCompletedCycle: false };
    }
    return { kind: currentKind, undoCompletedCycle: false };
  };

  const scheduleTimer = (delay, action, usesRuntimeInterval, actionKind, startedAt, plannedDelayMs, completedCycle) => {
    if (closed) return;
    clearPendingTimer();
    const waitMs = normalizeDelayMs(delay);
    const now = Date.now();
    pendingAction = action;
    pendingActionKind = actionKind || null;
    pendingUsesRuntimeInterval = Boolean(usesRuntimeInterval);
    pendingTimerStartedAt = startedAt || now;
    pendingPlannedDelayMs = normalizeDelayMs(plannedDelayMs !== undefined ? plannedDelayMs : waitMs);
    pendingCompletedCycle = Boolean(completedCycle);
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (pendingTimer === timer) {
        pendingTimer = null;
        pendingAction = null;
        pendingActionKind = null;
        pendingUsesRuntimeInterval = false;
        pendingTimerStartedAt = 0;
        pendingPlannedDelayMs = 0;
        pendingCompletedCycle = false;
      }
      action();
    }, waitMs);
    pendingTimer = timer;
    timers.add(timer);
  };

  function reschedulePendingStreamTimer() {
    if (closed || !pendingTimer || !pendingAction) return;
    const snapshot = getLiveSnapshot();
    if (!snapshot) return;
    const startedAt = pendingTimerStartedAt || Date.now();
    const elapsed = Math.max(0, Date.now() - startedAt);
    const nextPlannedDelay = pendingUsesRuntimeInterval
      ? normalizeDelayMs(snapshot.timing.intervalMs)
      : normalizeDelayMs(pendingPlannedDelayMs);
    const resolved = resolvePendingActionForLiveSnapshot(pendingActionKind, snapshot);
    if (resolved.undoCompletedCycle) completedCycles = Math.max(0, completedCycles - 1);
    const nextActionKind = resolved.kind;
    const nextAction = nextActionKind ? getActionForPendingKind(nextActionKind) : pendingAction;
    const remaining = Math.max(0, nextPlannedDelay - elapsed);
    const nextCompletedCycle = pendingCompletedCycle && nextActionKind === "finish" && !resolved.undoCompletedCycle;
    scheduleTimer(
      remaining,
      nextAction,
      pendingUsesRuntimeInterval,
      nextActionKind,
      startedAt,
      nextPlannedDelay,
      nextCompletedCycle,
    );
  }

  const scheduleNext = (delay, usesRuntimeInterval = false) => {
    scheduleTimer(delay, writeNext, usesRuntimeInterval, "next", Date.now(), delay, false);
  };

  const scheduleFinish = (delay, usesRuntimeInterval = false, completedCycle = false) => {
    scheduleTimer(delay, finishStream, usesRuntimeInterval, "finish", Date.now(), delay, completedCycle);
  };

  const finishStream = () => {
    if (closed) return;
    cleanup();
    call.end();
  };

  activeCalls.add(call);
  if (runtime.streamReschedulers && typeof runtime.streamReschedulers.add === "function") {
    runtime.streamReschedulers.add(reschedulePendingStreamTimer);
  }
  if (typeof call.on === "function") {
    call.on("cancelled", cleanup);
    call.on("error", cleanup);
  }

  function writeNext() {
    if (closed) return;
    const snapshot = getLiveSnapshot();
    if (!snapshot?.scenario) {
      failStream(
        grpc.status.NOT_FOUND,
        buildMockNoMatchMessage(
          method,
          request,
          runtime.scenarioIndex,
          runtime.activeScenarioIds,
          runtime.enabledMethods,
        ),
      );
      return;
    }

    const { scenario, responses, timing } = snapshot;
    if (!responses.length) {
      failStream(
        grpc.status.FAILED_PRECONDITION,
        `Mock stream scenario ${scenario.id} has no stream output. Add stream.responses before starting the stream.`,
      );
      return;
    }
    const { intervalMs, shouldLoop, maxLoops } = timing;

    if (index >= responses.length) {
      if (!canContinueAfterCompletedCycle(timing)) {
        scheduleFinish(intervalMs, true);
        return;
      }
      index = 0;
    }
    const item = responses[index] || {};
    const code = normalizeGrpcStatus(item.code);
    if (code !== grpc.status.OK) {
      failStream(code, item.message || `Mock stream scenario ${scenario.id} returned status ${code}.`);
      return;
    }

    const wrote = call.write(item.data === undefined ? {} : item.data);
    recordRuntimeStreamResponseSent(sentResponseCounts, item);
    index += 1;
    if (index >= responses.length) {
      completedCycles += 1;
      if (!shouldLoop || (maxLoops > 0 && completedCycles > maxLoops)) {
        const endDelay = Number(item.delayMs);
        const hasExplicitEndDelay = Number.isFinite(endDelay) && endDelay > 0;
        const delay = hasExplicitEndDelay ? endDelay : intervalMs;
        scheduleFinish(delay, !hasExplicitEndDelay, true);
        return;
      }
      index = 0;
    }
    const responseDelay = Number(item.delayMs);
    const hasExplicitResponseDelay = Number.isFinite(responseDelay) && responseDelay > 0;
    const nextDelay = hasExplicitResponseDelay ? responseDelay : intervalMs;
    if (wrote === false && typeof call.once === "function") {
      call.once("drain", () => {
        const delay = hasExplicitResponseDelay ? nextDelay : getLiveTiming()?.intervalMs ?? nextDelay;
        scheduleNext(delay, !hasExplicitResponseDelay);
      });
    } else {
      scheduleNext(nextDelay, !hasExplicitResponseDelay);
    }
  }

  const firstResponses = getRuntimeStreamResponses(initialScenario);
  if (!firstResponses.length) {
    failStream(
      grpc.status.FAILED_PRECONDITION,
      `Mock stream scenario ${currentScenarioId} has no stream output. Add stream.responses before starting the stream.`,
    );
    return;
  }
  const firstDelayRaw = Number(firstResponses[0]?.delayMs);
  scheduleNext(Number.isFinite(firstDelayRaw) && firstDelayRaw > 0 ? firstDelayRaw : 0, false);
}

function getRuntimeStreamResponses(scenario) {
  const stream = scenario?.stream || {};
  const fallbackOutput = getMockScenarioOutput(scenario);
  const explicitResponses = Array.isArray(stream.responses) ? stream.responses.filter(isUsableMockStreamOutput) : [];
  return explicitResponses.length
    ? explicitResponses
    : isUsableMockStreamOutput(fallbackOutput)
      ? [fallbackOutput]
      : [];
}


function createRuntimeStreamResponseFingerprint(item) {
  const output = item && typeof item === "object" ? item : {};
  return stableJson({
    code: normalizeGrpcStatus(output.code),
    message: output.message || "",
    data: output.data === undefined ? {} : output.data,
  });
}

function createRuntimeStreamResponsesSignature(responses) {
  return (Array.isArray(responses) ? responses : []).map(createRuntimeStreamResponseFingerprint).join("\n");
}

function recordRuntimeStreamResponseSent(sentCounts, item) {
  if (!sentCounts || typeof sentCounts.set !== "function") return;
  const fingerprint = createRuntimeStreamResponseFingerprint(item);
  sentCounts.set(fingerprint, (sentCounts.get(fingerprint) || 0) + 1);
}

function findFirstUnsentRuntimeStreamResponseIndex(responses, sentCounts) {
  if (!Array.isArray(responses) || !responses.length) return -1;
  const seenInNextStack = new Map();
  for (let index = 0; index < responses.length; index += 1) {
    const fingerprint = createRuntimeStreamResponseFingerprint(responses[index]);
    const nextCount = (seenInNextStack.get(fingerprint) || 0) + 1;
    seenInNextStack.set(fingerprint, nextCount);
    if (nextCount > (sentCounts?.get?.(fingerprint) || 0)) return index;
  }
  return -1;
}

function getRuntimeStreamTiming(scenario, runtime) {
  const stream = scenario?.stream || {};
  const intervalMs = normalizeDelayMs(
    stream.intervalMs !== undefined ? stream.intervalMs : runtime.streamDefaults.intervalMs,
  );
  const shouldLoop = stream.loop !== undefined ? Boolean(stream.loop) : Boolean(runtime.streamDefaults.loop);
  const maxLoops = Math.max(
    0,
    Math.floor(Number(stream.maxLoops !== undefined ? stream.maxLoops : runtime.streamDefaults.maxLoops || 0)),
  );
  return { intervalMs, shouldLoop, maxLoops };
}

/**
 * Returns the currently live stream scenario. Active streams keep their current
 * scenario when it still matches, but can switch to the newly selected scenario
 * so runtime scenario edits/selection changes keep applying on every tick.
 */
function getLiveStreamScenario(method, request, preferredScenarioId, runtime) {
  const candidates = getActiveRuntimeScenariosForMethod(
    method,
    runtime.scenarioIndex,
    runtime.activeScenarioIds,
    runtime.enabledMethods,
  )
    .filter((scenario) => mockMatcherMatches(scenario.input, request))
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  return candidates.find((scenario) => scenario.id === preferredScenarioId) || candidates[0];
}

/**
 * Finds the first matching scenario for a method/request pair.
 */
function findMatchingMockScenario(method, request, scenarios, activeScenarioIds, enabledMethods) {
  return getActiveRuntimeScenariosForMethod(method, scenarios, activeScenarioIds, enabledMethods)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    .find((scenario) => mockMatcherMatches(scenario.input, request));
}

/**
 * Returns only scenarios marked active for a method. Inactive scenarios are never matched.
 */
function getActiveRuntimeScenariosForMethod(method, scenarios, activeScenarioIds, enabledMethods) {
  const methodScenarios = scenarios.filter(
    (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
  );
  const keySlash = `${method.serviceName}/${method.methodName}`;
  const keyDot = `${method.serviceName}.${method.methodName}`;
  if (enabledMethods && (enabledMethods[keySlash] === false || enabledMethods[keyDot] === false)) return [];
  const selectedId = activeScenarioIds && (activeScenarioIds[keySlash] || activeScenarioIds[keyDot]);
  if (selectedId)
    return methodScenarios.filter((scenario) => scenario.id === selectedId && isRuntimeScenarioActive(scenario));
  const active =
    methodScenarios
      .filter(isRuntimeScenarioActive)
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0] || methodScenarios[0];
  return active ? [active] : [];
}

function isRuntimeScenarioActive(scenario) {
  return !scenario || scenario.active !== false;
}

/**
 * Builds a gRPC error message that is visible in the response panel when no scenario matches.
 */
function buildMockNoMatchMessage(method, request, scenarios, activeScenarioIds, enabledMethods) {
  const runtimeMethodKey = `${method.serviceName}/${method.methodName}`;
  const allMethodScenarios = scenarios.filter(
    (scenario) => scenario.service === method.serviceName && scenario.method === method.methodName,
  );
  const activeId =
    activeScenarioIds[runtimeMethodKey] || activeScenarioIds[`${method.serviceName}.${method.methodName}`] || "auto";
  const disabled =
    enabledMethods &&
    (enabledMethods[runtimeMethodKey] === false ||
      enabledMethods[`${method.serviceName}.${method.methodName}`] === false);
  const activeCandidates = getActiveRuntimeScenariosForMethod(method, scenarios, activeScenarioIds, enabledMethods);
  const requestText = stableJson(request);
  const clippedRequest = requestText.length > 600 ? `${requestText.slice(0, 600)}...` : requestText;
  const invalidInput =
    activeCandidates.length > 0 && activeCandidates.every((scenario) => !hasValidRuntimeMatcher(scenario.input));
  return [
    disabled
      ? `Mock request rejected: mocking is disabled for ${runtimeMethodKey}.`
      : invalidInput
        ? `Mock request rejected: selected scenario input is missing or invalid for ${runtimeMethodKey}.`
        : `Mock request rejected: the selected scenario input did not match equals/contains/or for ${runtimeMethodKey}.`,
    `Active scenario: ${activeId}.`,
    `Available scenarios for method: ${allMethodScenarios.map((scenario) => scenario.id).join(", ") || "none"}.`,
    activeCandidates.length
      ? `Checked active scenario(s): ${activeCandidates.map((scenario) => scenario.id).join(", ")}.`
      : "Checked active scenario(s): none.",
    `Request: ${clippedRequest}`,
  ].join(" ");
}

/**
 * Normalizes per-method scenario selections sent by the renderer.
 */
function normalizeActiveScenarioIds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.trim()) output[key] = item.trim();
  }
  return output;
}

function normalizeEnabledMethods(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof key === "string" && key.trim()) output[key] = Boolean(item);
  }
  return output;
}

function isLegacyGeneratedRuntimeScenario(value) {
  const description = typeof value?.description === "string" ? value.description.toLowerCase() : "";
  return description.includes("generated from proto mapping");
}

function stripLegacyGeneratedRuntimeStreamDefaults(value, stream) {
  if (!stream || !isLegacyGeneratedRuntimeScenario(value)) return stream;
  const next = { ...stream };
  if (next.intervalMs === legacyGeneratedMockStreamIntervalMs) delete next.intervalMs;
  if (next.loop === false) delete next.loop;
  if (next.maxLoops === 0) delete next.maxLoops;
  return next;
}

/**
 * Normalizes one runtime scenario while retaining compatible input/output aliases.
 */
function normalizeMockRuntimeScenario(value, index) {
  if (!value || typeof value !== "object") return null;
  const service = String(value.service || "").trim();
  const method = String(value.method || "").trim();
  if (!service || !method) return null;
  return {
    ...value,
    id: String(value.id || `${service}.${method}.${index + 1}`),
    service,
    method,
    priority: Number(value.priority || 0),
    active: Object.hasOwn(value, "active") ? Boolean(value.active) : true,
    input: normalizeRuntimeMatcher(value.input || value.match),
    response: normalizeRuntimeOutput(value.response || value.output),
    output: normalizeRuntimeOutput(value.output || value.response),
    stream: stripLegacyGeneratedRuntimeStreamDefaults(value, normalizeRuntimeStream(value.stream)),
  };
}

/**
 * Normalizes runtime matcher blocks.
 */
function normalizeRuntimeMatcher(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return {
    any: Object.hasOwn(value, "any") ? Boolean(value.any) : undefined,
    equals: Object.hasOwn(value, "equals") ? value.equals : undefined,
    equalsUnordered: Object.hasOwn(value, "equalsUnordered")
      ? value.equalsUnordered
      : Object.hasOwn(value, "equals_unordered")
        ? value.equals_unordered
        : undefined,
    contains: Object.hasOwn(value, "contains") ? value.contains : undefined,
    matches: Object.hasOwn(value, "matches")
      ? value.matches
      : Object.hasOwn(value, "regex")
        ? value.regex
        : undefined,
    glob: Object.hasOwn(value, "glob") ? value.glob : undefined,
    headers: Object.hasOwn(value, "headers") ? normalizeRuntimeMatcher(value.headers) : undefined,
    or: Array.isArray(value.or) ? value.or.map(normalizeRuntimeMatcher).filter(Boolean) : undefined,
  };
}

/**
 * Normalizes runtime output blocks.
 */
function normalizeRuntimeOutput(value) {
  if (!value || typeof value !== "object") return {};
  const code =
    value.code !== undefined ? value.code : value.returnCode !== undefined ? value.returnCode : value.return_code;
  const delayMs = value.delayMs !== undefined ? value.delayMs : value.delay_ms;
  return {
    data: Object.hasOwn(value, "data") ? value.data : undefined,
    code,
    message: value.message,
    delayMs,
  };
}

/**
 * Normalizes runtime stream blocks.
 */
function normalizeRuntimeStream(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    responses: Array.isArray(value.responses) ? value.responses.map(normalizeRuntimeOutput) : [],
    ...normalizeRuntimeStreamSettings(value, {}),
  };
}

/**
 * Normalizes stream interval and loop defaults without forcing missing values to false/0.
 */
function normalizeRuntimeStreamSettings(value, fallback) {
  const record = value && typeof value === "object" ? value : {};
  const intervalRaw = record.intervalMs !== undefined ? record.intervalMs : record.interval_ms;
  const maxLoopsRaw = record.maxLoops !== undefined ? record.maxLoops : record.max_loops;
  return {
    intervalMs: intervalRaw !== undefined ? normalizeDelayMs(intervalRaw) : fallback.intervalMs,
    loop: Object.hasOwn(record, "loop") ? Boolean(record.loop) : fallback.loop,
    maxLoops: maxLoopsRaw !== undefined ? Math.max(0, Math.floor(Number(maxLoopsRaw) || 0)) : fallback.maxLoops,
  };
}

/**
 * Reads output data from a scenario, with response kept as a legacy alias.
 */
function getMockScenarioOutput(scenario) {
  return normalizeRuntimeOutput(scenario.output || scenario.response || {});
}

function isUsableMockStreamOutput(output) {
  if (!output || typeof output !== "object") return false;
  const code = normalizeGrpcStatus(output.code);
  return code !== grpc.status.OK || Object.hasOwn(output, "data");
}

/**
 * Returns true when a scenario has at least one usable input matcher. Missing
 * input intentionally means match-any, matching GripMock's fallback-stub style.
 */
function hasValidRuntimeMatcher(matcher) {
  if (!matcher || typeof matcher !== "object" || Array.isArray(matcher)) return true;
  if (matcher.any === true) return true;
  if (Object.hasOwn(matcher, "equals") && matcher.equals !== undefined) return true;
  if (Object.hasOwn(matcher, "equalsUnordered") && matcher.equalsUnordered !== undefined) return true;
  if (Object.hasOwn(matcher, "contains") && isUsableContainsMatcherValue(matcher.contains)) return true;
  if (Object.hasOwn(matcher, "matches") && isUsableContainsMatcherValue(matcher.matches)) return true;
  if (Object.hasOwn(matcher, "glob") && isUsableContainsMatcherValue(matcher.glob)) return true;
  if (Object.hasOwn(matcher, "headers") && hasValidRuntimeMatcher(matcher.headers)) return true;
  return Array.isArray(matcher.or) && matcher.or.some(hasValidRuntimeMatcher);
}

function isUsableContainsMatcherValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function createMockRequestContext(call) {
  return {
    data: call?.request ? call.request : {},
    headers: grpcMetadataToObject(call?.metadata),
  };
}

function grpcMetadataToObject(metadata) {
  const output = {};
  if (!metadata || typeof metadata.getMap !== "function") return output;
  try {
    const map = metadata.getMap() || {};
    for (const [key, value] of Object.entries(map)) {
      output[String(key).toLowerCase()] = Buffer.isBuffer(value) ? value.toString("base64") : value;
    }
  } catch {
    return output;
  }
  return output;
}

function normalizeRequestContext(requestOrContext) {
  if (
    requestOrContext &&
    typeof requestOrContext === "object" &&
    !Array.isArray(requestOrContext) &&
    Object.hasOwn(requestOrContext, "data") &&
    Object.hasOwn(requestOrContext, "headers")
  ) {
    return {
      data: requestOrContext.data === undefined ? {} : requestOrContext.data,
      headers: requestOrContext.headers && typeof requestOrContext.headers === "object" ? requestOrContext.headers : {},
    };
  }
  return { data: requestOrContext === undefined ? {} : requestOrContext, headers: {} };
}

/**
 * Evaluates equals/equals_unordered/contains/matches/glob/or/header request matchers.
 */
function mockMatcherMatches(rawMatcher, requestOrContext) {
  const matcher = normalizeRuntimeMatcher(rawMatcher);
  if (!matcher) return true;
  if (!hasValidRuntimeMatcher(matcher)) return false;
  const context = normalizeRequestContext(requestOrContext);
  if (matcher.any === true) return true;
  if (Array.isArray(matcher.or) && matcher.or.length) {
    return matcher.or.some((item) => mockMatcherMatches(item, context));
  }
  let matched = true;
  if (Object.hasOwn(matcher, "equals") && matcher.equals !== undefined) {
    matched = matched && stableJson(context.data) === stableJson(matcher.equals);
  }
  if (Object.hasOwn(matcher, "equalsUnordered") && matcher.equalsUnordered !== undefined) {
    matched = matched && jsonEqualsUnordered(context.data, matcher.equalsUnordered);
  }
  if (Object.hasOwn(matcher, "contains") && matcher.contains !== undefined) {
    matched = matched && jsonContains(context.data, matcher.contains);
  }
  if (Object.hasOwn(matcher, "matches") && matcher.matches !== undefined) {
    matched = matched && jsonMatches(context.data, matcher.matches);
  }
  if (Object.hasOwn(matcher, "glob") && matcher.glob !== undefined) {
    matched = matched && jsonGlobMatches(context.data, matcher.glob);
  }
  if (Object.hasOwn(matcher, "headers") && matcher.headers !== undefined) {
    matched = matched && mockMatcherMatches(matcher.headers, context.headers);
  }
  return matched;
}

/**
 * Deep contains matcher that supports object subsets and string contains checks.
 */
function jsonContains(actual, expected) {
  if (!isUsableContainsMatcherValue(expected)) return false;
  if (expected === null || typeof expected !== "object") {
    if (typeof actual === "string" && typeof expected === "string") return actual.includes(expected);
    return stableJson(actual).includes(String(expected));
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedItem) => actual.some((actualItem) => jsonContains(actualItem, expectedItem)));
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) => jsonContains(actual[key], value));
}

function jsonEqualsUnordered(actual, expected) {
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false;
    const unmatched = actual.map((item) => ({ item, used: false }));
    return expected.every((expectedItem) => {
      const index = unmatched.findIndex((entry) => !entry.used && jsonEqualsUnordered(entry.item, expectedItem));
      if (index < 0) return false;
      unmatched[index].used = true;
      return true;
    });
  }
  if (actual && typeof actual === "object" || expected && typeof expected === "object") {
    if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object" || Array.isArray(actual) || Array.isArray(expected)) return false;
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (stableJson(actualKeys) !== stableJson(expectedKeys)) return false;
    return expectedKeys.every((key) => jsonEqualsUnordered(actual[key], expected[key]));
  }
  return Object.is(actual, expected);
}

function jsonMatches(actual, expected) {
  if (!isUsableContainsMatcherValue(expected)) return false;
  if (expected === null || typeof expected !== "object") return matchesPattern(actual, expected);
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedItem, index) => jsonMatches(actual[index], expectedItem));
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) => jsonMatches(actual[key], value));
}

function jsonGlobMatches(actual, expected) {
  if (!isUsableContainsMatcherValue(expected)) return false;
  if (expected === null || typeof expected !== "object") return globMatches(actual, expected);
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedItem, index) => jsonGlobMatches(actual[index], expectedItem));
  }
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) => jsonGlobMatches(actual[key], value));
}

function matchesPattern(actual, pattern) {
  try {
    return new RegExp(String(pattern)).test(String(actual ?? ""));
  } catch {
    return false;
  }
}

function globMatches(actual, pattern) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  try {
    return new RegExp(`^${escaped}$`).test(String(actual ?? ""));
  } catch {
    return false;
  }
}


/**
 * Parses the small YAML subset generated by the app's scenario editor.
 */
function parseSimpleYaml(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((raw) => ({ indent: (raw.match(/^ */) || [""])[0].length, text: raw.trim() }))
    .filter((line) => line.text && !line.text.startsWith("#"));
  if (lines.length === 0) return {};
  const parsed = parseYamlBlock(lines, 0, lines[0].indent);
  return parsed[0];
}

function parseYamlBlock(lines, startIndex, indent) {
  const current = lines[startIndex];
  if (!current || current.indent < indent) return [{}, startIndex];
  if (current.text.startsWith("-")) return parseYamlArray(lines, startIndex, indent);
  return parseYamlObject(lines, startIndex, indent);
}

function parseYamlArray(lines, startIndex, indent) {
  const output = [];
  let index = startIndex;
  while (index < lines.length && lines[index].indent === indent && lines[index].text.startsWith("-")) {
    const rest = lines[index].text.slice(1).trim();
    index += 1;
    if (!rest) {
      const child = parseYamlBlock(lines, index, indent + 2);
      output.push(child[0]);
      index = child[1];
      continue;
    }
    if (looksLikeYamlKeyValue(rest)) {
      const item = {};
      index = parseYamlKeyValueInto(rest, item, lines, index, indent + 2);
      if (index < lines.length && lines[index].indent >= indent + 2) {
        const child = parseYamlBlock(lines, index, indent + 2);
        if (child[0] && typeof child[0] === "object" && !Array.isArray(child[0])) Object.assign(item, child[0]);
        index = child[1];
      }
      output.push(item);
    } else {
      output.push(parseYamlScalar(rest));
    }
  }
  return [output, index];
}

function parseYamlObject(lines, startIndex, indent) {
  const output = {};
  let index = startIndex;
  while (index < lines.length && lines[index].indent === indent && !lines[index].text.startsWith("-")) {
    index = parseYamlKeyValueInto(lines[index].text, output, lines, index + 1, indent + 2);
  }
  return [output, index];
}

function parseYamlKeyValueInto(text, output, lines, nextIndex, childIndent) {
  const colon = text.indexOf(":");
  if (colon < 0) throw new Error(`Expected key: value, got ${text}`);
  const key = text
    .slice(0, colon)
    .trim()
    .replace(/^['"]|['"]$/g, "");
  const rawValue = text.slice(colon + 1).trim();
  if (!rawValue) {
    if (nextIndex < lines.length && lines[nextIndex].indent >= childIndent) {
      const child = parseYamlBlock(lines, nextIndex, lines[nextIndex].indent);
      output[key] = child[0];
      return child[1];
    }
    output[key] = {};
    return nextIndex;
  }
  output[key] = parseYamlScalar(rawValue);
  return nextIndex;
}

function looksLikeYamlKeyValue(text) {
  const colon = text.indexOf(":");
  return colon > 0 && /^[A-Za-z0-9_.-]+\s*:/.test(text);
}

function parseYamlScalar(text) {
  const trimmed = String(text || "").trim();
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "{}") return {};
  if (trimmed === "[]") return [];
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))
    return JSON.parse(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed)) return numeric;
  return trimmed;
}

/**
 * Stable JSON stringifier for deterministic matching.
 */
function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

/**
 * Converts string/number status values into grpc-js status codes.
 */
function normalizeGrpcStatus(value) {
  if (value === undefined || value === null || value === "") return grpc.status.OK;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const key = String(value).trim().toUpperCase();
  return grpc.status[key] !== undefined ? grpc.status[key] : grpc.status.UNKNOWN;
}

/**
 * Normalizes delay values in milliseconds.
 */
function normalizeDelayMs(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(60_000, Math.floor(numeric));
}

/**
 * Builds a grpc-js compatible Error with status metadata.
 */
function grpcStatusError(code, message) {
  const error = new Error(message || `gRPC status ${code}`);
  error.code = code;
  error.details = message || "";
  try {
    error.metadata = new grpc.Metadata();
  } catch {
    /* metadata is optional */
  }
  return error;
}

function getMockServerStatus() {
  if (!activeMockServer) return { running: false };
  return createMockServerStatusPayload(activeMockServer, {
    scenarioCount: activeMockServer.runtime.scenarioIndex.length,
    methodCount: activeMockServer.methodCount,
    activeScenarioIds: activeMockServer.runtime.activeScenarioIds,
    enabledMethods: activeMockServer.runtime.enabledMethods,
    startedAt: activeMockServer.startedAt,
    configVersion: activeMockServer.runtime.configVersion,
    updatedAt: activeMockServer.runtime.updatedAt,
  });
}

module.exports = {
  getMockServerStatus,
  getReachableMockTargets,
  normalizeActiveScenarioIds,
  normalizeEnabledMethods,
  normalizeMockServerPort,
  normalizeRuntimeStreamSettings,
  startMockServer,
  stopMockServer,
  updateActiveMockServer,
};
