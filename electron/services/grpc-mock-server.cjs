"use strict";

const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { readJsonIfExists, walkDirectory, writeProtoWorkspace } = require("../utils/file-utils.cjs");
const { safeRelativePath } = require("../utils/path-utils.cjs");

let activeMockServer = null;

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
    intervalMs: 500,
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
    streamDefaults: normalizeRuntimeStreamSettings(streamDefaults || {}, { intervalMs: 500, loop: false, maxLoops: 0 }),
    activeScenarioIds: normalizeActiveScenarioIds(activeScenarioIds || {}),
    enabledMethods: normalizeEnabledMethods(enabledMethods || {}),
    configVersion: 1,
    updatedAt: new Date().toISOString(),
    source: source || "unknown",
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

  const next = createMockRuntimeState(
    Array.isArray(payload.scenarios) ? payload.scenarios : runtime.scenarioIndex,
    payload.streamDefaults || runtime.streamDefaults,
    payload.activeScenarioIds || payload.selectedScenarioIds || runtime.activeScenarioIds,
    payload.enabledMethods || runtime.enabledMethods,
    source || "update",
  );
  runtime.scenarioIndex = next.scenarioIndex;
  runtime.streamDefaults = next.streamDefaults;
  runtime.activeScenarioIds = next.activeScenarioIds;
  runtime.enabledMethods = next.enabledMethods;
  runtime.configVersion += 1;
  runtime.updatedAt = new Date().toISOString();
  runtime.source = next.source;
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

  const reload = async () => {
    if (activeMockServer !== serverState) return;
    try {
      const loaded = await loadRuntimeScenariosFromWorkspace(
        workspaceDirectory,
        serverState.methods || [],
        serverState.port,
      );
      if (!loaded) return;
      updateActiveMockServer(loaded, "file");
    } catch (error) {
      console.warn("[Layang][Mock] scenario file hot reload skipped:", error?.message ? error.message : error);
    }
  };

  try {
    serverState.watcher = fsSync.watch(scenariosDir, { persistent: false }, () => {
      if (serverState.watcherDebounce) clearTimeout(serverState.watcherDebounce);
      serverState.watcherDebounce = setTimeout(() => void reload(), 250);
    });
    const mocksDir = path.join(workspaceDirectory, "mocks");
    serverState.configWatcher = fsSync.watch(mocksDir, { persistent: false }, (_event, fileName) => {
      if (String(fileName || "").toLowerCase() !== "mock-server.json") return;
      if (serverState.watcherDebounce) clearTimeout(serverState.watcherDebounce);
      serverState.watcherDebounce = setTimeout(() => void reload(), 250);
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
  const serverConfig = (await readJsonIfExists(path.join(mocksDir, "mock-server.json")).catch(() => ({}))) || {};
  const streamDefaults = normalizeRuntimeStreamSettings(
    serverConfig.streamDefaults || serverConfig.stream_defaults || {},
    { intervalMs: 500, loop: false, maxLoops: 0 },
  );
  const enabledMethods = normalizeEnabledMethods(serverConfig.enabledMethods || serverConfig.enabled_methods || {});
  const scenariosDir = path.join(mocksDir, "scenarios");
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
  return { scenarios, activeScenarioIds, enabledMethods, streamDefaults };
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
  const streamDefaults = normalizeRuntimeStreamSettings(
    serverRecord.streamDefaults || serverRecord.stream_defaults || {},
    { intervalMs: 500, loop: false, maxLoops: 0 },
  );
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
  return {
    ...scenario,
    stream: {
      ...scenario.stream,
      intervalMs:
        scenario.stream.intervalMs !== undefined
          ? scenario.stream.intervalMs
          : scenario.stream.interval_ms !== undefined
            ? scenario.stream.interval_ms
            : defaults.intervalMs,
      loop: Object.hasOwn(scenario.stream, "loop") ? scenario.stream.loop : defaults.loop,
      maxLoops:
        scenario.stream.maxLoops !== undefined
          ? scenario.stream.maxLoops
          : scenario.stream.max_loops !== undefined
            ? scenario.stream.max_loops
            : defaults.maxLoops,
    },
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
  const scenario = findMatchingMockScenario(
    method,
    request,
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
  const initialScenario = findMatchingMockScenario(
    method,
    request,
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

  const scenarioId = initialScenario.id;
  let index = 0;
  let restarts = 0;
  let closed = false;

  const cleanup = () => {
    closed = true;
    activeCalls.delete(call);
  };
  activeCalls.add(call);
  if (typeof call.on === "function") {
    call.on("cancelled", cleanup);
    call.on("error", cleanup);
  }

  const scheduleNext = (delay) => {
    if (closed) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      writeNext();
    }, normalizeDelayMs(delay));
    timers.add(timer);
  };

  const writeNext = () => {
    if (closed) return;
    const scenario = getLiveStreamScenario(method, request, scenarioId, runtime);
    if (!scenario) {
      closed = true;
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

    const stream = scenario.stream || {};
    const fallbackOutput = getMockScenarioOutput(scenario);
    const explicitResponses = Array.isArray(stream.responses) ? stream.responses.filter(isUsableMockStreamOutput) : [];
    const responses = explicitResponses.length
      ? explicitResponses
      : isUsableMockStreamOutput(fallbackOutput)
        ? [fallbackOutput]
        : [];
    if (!responses.length) {
      closed = true;
      endMockServerStreamWithError(
        call,
        grpc.status.FAILED_PRECONDITION,
        `Mock stream scenario ${scenario.id} has no stream output. Add stream.responses before starting the stream.`,
        activeCalls,
      );
      return;
    }
    const intervalMs = normalizeDelayMs(
      stream.intervalMs !== undefined ? stream.intervalMs : runtime.streamDefaults.intervalMs,
    );
    const shouldLoop = stream.loop !== undefined ? Boolean(stream.loop) : Boolean(runtime.streamDefaults.loop);
    const maxLoops = Math.max(
      0,
      Math.floor(Number(stream.maxLoops !== undefined ? stream.maxLoops : runtime.streamDefaults.maxLoops || 0)),
    );

    if (index >= responses.length) index = 0;
    const item = responses[index] || {};
    const code = normalizeGrpcStatus(item.code);
    if (code !== grpc.status.OK) {
      closed = true;
      endMockServerStreamWithError(
        call,
        code,
        item.message || `Mock stream scenario ${scenario.id} returned status ${code}.`,
        activeCalls,
      );
      return;
    }

    const wrote = call.write(item.data === undefined ? {} : item.data);
    index += 1;
    if (index >= responses.length) {
      if (!shouldLoop || (maxLoops > 0 && restarts >= maxLoops)) {
        const endDelay = Number(item.delayMs);
        const finish = () => {
          if (closed) return;
          closed = true;
          activeCalls.delete(call);
          call.end();
        };
        const delay = Number.isFinite(endDelay) && endDelay > 0 ? endDelay : intervalMs;
        const timer = setTimeout(() => {
          timers.delete(timer);
          finish();
        }, normalizeDelayMs(delay));
        timers.add(timer);
        return;
      }
      restarts += 1;
      index = 0;
    }
    const responseDelay = Number(item.delayMs);
    const nextDelay = Number.isFinite(responseDelay) && responseDelay > 0 ? responseDelay : intervalMs;
    if (wrote === false && typeof call.once === "function") {
      call.once("drain", () => scheduleNext(nextDelay));
    } else {
      scheduleNext(nextDelay);
    }
  };

  const firstStream = initialScenario.stream || {};
  const firstExplicitResponses = Array.isArray(firstStream.responses)
    ? firstStream.responses.filter(isUsableMockStreamOutput)
    : [];
  const firstFallbackOutput = getMockScenarioOutput(initialScenario);
  const firstResponses = firstExplicitResponses.length
    ? firstExplicitResponses
    : isUsableMockStreamOutput(firstFallbackOutput)
      ? [firstFallbackOutput]
      : [];
  if (!firstResponses.length) {
    endMockServerStreamWithError(
      call,
      grpc.status.FAILED_PRECONDITION,
      `Mock stream scenario ${scenarioId} has no stream output. Add stream.responses before starting the stream.`,
      activeCalls,
    );
    return;
  }
  const firstDelayRaw = Number(firstResponses[0]?.delayMs);
  scheduleNext(Number.isFinite(firstDelayRaw) && firstDelayRaw > 0 ? firstDelayRaw : 0);
}

/**
 * Returns the currently live stream scenario, preferring the scenario that started the call.
 */
function getLiveStreamScenario(method, request, scenarioId, runtime) {
  const candidates = getActiveRuntimeScenariosForMethod(
    method,
    runtime.scenarioIndex,
    runtime.activeScenarioIds,
    runtime.enabledMethods,
  );
  const sameScenario = candidates.find((scenario) => scenario.id === scenarioId);
  if (!sameScenario) return undefined;
  return mockMatcherMatches(sameScenario.input, request) ? sameScenario : undefined;
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
    stream: normalizeRuntimeStream(value.stream),
  };
}

/**
 * Normalizes runtime matcher blocks.
 */
function normalizeRuntimeMatcher(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    equals: Object.hasOwn(value, "equals") ? value.equals : undefined,
    contains: Object.hasOwn(value, "contains") ? value.contains : undefined,
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
 * Returns true when a scenario has at least one usable input matcher.
 */
function hasValidRuntimeMatcher(matcher) {
  if (!matcher || typeof matcher !== "object") return false;
  if (Object.hasOwn(matcher, "equals") && matcher.equals !== undefined) return true;
  if (Object.hasOwn(matcher, "contains") && isUsableContainsMatcherValue(matcher.contains)) return true;
  return Array.isArray(matcher.or) && matcher.or.some(hasValidRuntimeMatcher);
}

function isUsableContainsMatcherValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * Evaluates equals/contains/or request matchers.
 */
function mockMatcherMatches(matcher, request) {
  if (!hasValidRuntimeMatcher(matcher)) return false;
  if (Array.isArray(matcher.or) && matcher.or.length) {
    return matcher.or.some((item) => mockMatcherMatches(item, request));
  }
  let matched = true;
  if (Object.hasOwn(matcher, "equals") && matcher.equals !== undefined) {
    matched = matched && stableJson(request) === stableJson(matcher.equals);
  }
  if (Object.hasOwn(matcher, "contains") && matcher.contains !== undefined) {
    matched = matched && jsonContains(request, matcher.contains);
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
