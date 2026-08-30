"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { stringifyYaml } = require("../../lib/workspace-yaml.cjs");
const { mockMatcherMatches } = require("./grpc-mock-server.cjs");
const { normalizeGrpcWebConfig, startGrpcWebProxy, stopGrpcWebProxy } = require("./grpc-web-proxy-server.cjs");

const gatewayRuntimes = new Map();
const gatewayLifecycleQueues = new Map();
const maxLogEntries = 2000;
const defaultRedactedMetadata = ["authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"];

function normalizeProfile(input = {}) {
  const id = String(input.id || "default-gateway").trim() || "default-gateway";
  const mode = input.mode === "mock" || input.mode === "hybrid" ? input.mode : "gateway";
  const upstreams = Array.isArray(input.upstreams)
    ? input.upstreams
        .map((item) => ({
          target: stripGrpcScheme(item?.target || ""),
          weight: Math.max(1, Math.floor(Number(item?.weight) || 1)),
          security: normalizeSecurity(item?.security || input.upstreamSecurity),
        }))
        .filter((item) => item.target)
    : [];
  if (!upstreams.length && input.upstreamTarget) {
    upstreams.push({
      target: stripGrpcScheme(input.upstreamTarget),
      weight: 1,
      security: normalizeSecurity(input.upstreamSecurity),
    });
  }
  return {
    id,
    name: String(input.name || "Embedded gRPC Gateway"),
    mode,
    listenHost: normalizeListenHost(input.listenHost || input.bindHost),
    // Web Access uses an internal native bridge. Port 0 deliberately asks the OS
    // for a free port and avoids colliding with the local gRPC Mock listener.
    listenPort: input.listenPort === 0 ? 0 : normalizePort(input.listenPort || input.port, 50055),
    listenSecurity: normalizeListenSecurity(input.listenSecurity),
    upstreams,
    methodBehaviors: isRecord(input.methodBehaviors) ? { ...input.methodBehaviors } : {},
    noMatchBehavior: input.noMatchBehavior === "not-found" ? "not-found" : "proxy",
    forwardMetadata: input.forwardMetadata !== false,
    forwardDeadlines: input.forwardDeadlines !== false,
    forwardCancellation: input.forwardCancellation !== false,
    capture: {
      enabled: Boolean(input.capture?.enabled),
      maxStreamMessages: positiveInteger(input.capture?.maxStreamMessages, 20),
      maxStreamDurationMs: positiveInteger(input.capture?.maxStreamDurationMs, 30_000),
      maxMessageBytes: positiveInteger(input.capture?.maxMessageBytes, 5 * 1024 * 1024),
      redactMetadataKeys: uniqueLowercase(input.capture?.redactMetadataKeys || defaultRedactedMetadata),
    },
    retry: {
      enabled: Boolean(input.retry?.enabled),
      maxRetries: Math.min(5, positiveInteger(input.retry?.maxRetries, 1)),
      backoffMs: positiveInteger(input.retry?.backoffMs, 150),
    },
    circuitBreaker: {
      enabled: input.circuitBreaker?.enabled !== false,
      failureThreshold: positiveInteger(input.circuitBreaker?.failureThreshold, 5),
      openMs: positiveInteger(input.circuitBreaker?.openMs, 10_000),
    },
    limits: {
      maxReceiveBytes: positiveInteger(input.limits?.maxReceiveBytes, 50 * 1024 * 1024),
      maxSendBytes: positiveInteger(input.limits?.maxSendBytes, 50 * 1024 * 1024),
    },
    web: normalizeGrpcWebConfig(input.web),
  };
}

function normalizeListenSecurity(input) {
  if (!input || input.type !== "tls") return { type: "insecure" };
  return {
    type: "tls",
    certificateMode: input.certificateMode === "pfx" ? "pfx" : input.certificateMode === "local" ? "local" : "pem",
    certificateId: String(input.certificateId || ""),
    certificatePath: String(input.certificatePath || ""),
    privateKeyPath: String(input.privateKeyPath || ""),
    certificateChainPath: String(input.certificateChainPath || ""),
    clientCaPath: String(input.clientCaPath || ""),
    pfxPath: String(input.pfxPath || ""),
    passphraseSecretId: String(input.passphraseSecretId || ""),
    requireClientCertificate: Boolean(input.requireClientCertificate),
  };
}

function normalizeSecurity(input) {
  if (!input || input.type !== "tls") return { type: "insecure" };
  return {
    type: "tls",
    caPath: String(input.caPath || ""),
    clientCertPath: String(input.clientCertPath || ""),
    clientKeyPath: String(input.clientKeyPath || ""),
    serverNameOverride: String(input.serverNameOverride || ""),
  };
}

function queueGatewayLifecycle(profileId, operation) {
  const id = String(profileId || "default-gateway");
  const previous = gatewayLifecycleQueues.get(id) || Promise.resolve();
  const next = previous.then(operation, operation);
  const tracked = next.catch(() => undefined);
  gatewayLifecycleQueues.set(id, tracked);
  return next.finally(() => {
    if (gatewayLifecycleQueues.get(id) === tracked) gatewayLifecycleQueues.delete(id);
  });
}

function startGatewayProfile(payload = {}) {
  const profile = normalizeProfile(payload.profile || payload);
  return queueGatewayLifecycle(profile.id, () => startGatewayProfileNow(payload, profile));
}

async function startGatewayProfileNow(payload, profile) {
  validateProfile(profile);
  await stopGatewayProfileNow(profile.id);
  const protoFiles = Array.isArray(payload.protoFiles) ? payload.protoFiles : [];
  const methods = Array.isArray(payload.methods) ? payload.methods : [];
  if (!protoFiles.length) throw new Error("At least one proto file is required to start the gateway.");
  if (!methods.length) throw new Error("No RPC methods were provided for the gateway.");
  const workspaceDir = await writeProtoWorkspace(protoFiles);
  const roots = protoFiles.map((file) => safeRelative(file.name));
  const packageDefinition = protoLoader.loadSync(roots, {
    includeDirs: [workspaceDir],
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loadedPackage = grpc.loadPackageDefinition(packageDefinition);
  const server = new grpc.Server({
    "grpc.max_receive_message_length": profile.limits.maxReceiveBytes,
    "grpc.max_send_message_length": profile.limits.maxSendBytes,
  });
  registerHealthService(server);

  const runtime = {
    id: profile.id,
    profile,
    server,
    workspaceDir,
    workspaceDirectory: typeof payload.workspaceDirectory === "string" ? payload.workspaceDirectory : "",
    loadedPackage,
    packageDefinition,
    methods,
    scenarios: Array.isArray(payload.scenarios) ? payload.scenarios : [],
    activeScenarioIds: isRecord(payload.activeScenarioIds) ? payload.activeScenarioIds : {},
    enabledMethods: isRecord(payload.enabledMethods) ? payload.enabledMethods : {},
    logs: [],
    captures: [],
    activeCalls: new Set(),
    clients: new Set(),
    roundRobinCursor: 0,
    upstreamStates: new Map(),
    startedAt: new Date().toISOString(),
    metrics: createMetrics(),
    statusWriteTimer: null,
    web: null,
    internalBridgePort: 0,
    webRoutes: new Map(),
  };

  const byService = new Map();
  for (const method of methods) {
    if (!method?.serviceName || !method?.methodName) continue;
    const list = byService.get(method.serviceName) || [];
    list.push(method);
    byService.set(method.serviceName, list);
  }
  let methodCount = 0;
  for (const [serviceName, serviceMethods] of byService.entries()) {
    const ServiceCtor = getByDottedPath(loadedPackage, serviceName);
    const serviceDefinition = ServiceCtor?.service;
    if (!serviceDefinition) continue;
    const GenericClient = grpc.makeGenericClientConstructor(serviceDefinition, serviceName, {});
    const handlers = {};
    for (const method of serviceMethods) {
      const handlerName = findServiceDefinitionKey(serviceDefinition, method.methodName);
      const definition = serviceDefinition[handlerName];
      if (!definition) continue;
      handlers[handlerName] = createGatewayHandler(runtime, method, handlerName, definition, GenericClient);
      runtime.webRoutes.set(definition.path || `/${method.serviceName}/${method.methodName}`, {
        method,
        methodKey: runtimeMethodKey(method),
        handlerName,
        definition,
        GenericClient,
      });
      methodCount += 1;
    }
    server.addService(serviceDefinition, handlers);
  }
  if (!methodCount) {
    await fsp.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    throw new Error("No gateway service definitions were found in the loaded proto files.");
  }

  const boundPort = await bindServerAddress(server, profile.listenHost, profile.listenPort, profile.listenSecurity);
  const internalBridgePort = await bindServerAddress(server, "127.0.0.1", 0, { type: "insecure" });
  // @grpc/grpc-js serves immediately after bindAsync; start() is deprecated.
  runtime.profile.listenPort = boundPort;
  runtime.internalBridgePort = internalBridgePort;
  runtime.methodCount = methodCount;
  try {
    runtime.web = await startGrpcWebProxy({
      config: profile.web,
      routes: runtime.webRoutes,
      bridgeTarget: `127.0.0.1:${internalBridgePort}`,
      onLog: (entry) => appendLog(runtime, entry),
    });
  } catch (error) {
    await shutdownServer(server);
    await fsp.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  gatewayRuntimes.set(profile.id, runtime);
  scheduleRuntimeStatusWrite(runtime);
  appendLog(runtime, {
    kind: "server",
    behavior: profile.mode,
    status: "RUNNING",
    message: `Native gateway listening on ${profile.listenHost}:${boundPort}.`,
  });
  return gatewayStatus(runtime);
}

function stopGatewayProfile(profileId) {
  const id = String(profileId || "default-gateway");
  return queueGatewayLifecycle(id, () => stopGatewayProfileNow(id));
}

async function stopGatewayProfileNow(profileId) {
  const id = String(profileId || "default-gateway");
  const runtime = gatewayRuntimes.get(id);
  if (!runtime) return { running: false, profileId: id };
  gatewayRuntimes.delete(id);
  for (const call of runtime.activeCalls) {
    try {
      call.cancel?.();
    } catch {
      /* ignore */
    }
    try {
      call.destroy?.(grpcStatusError(grpc.status.UNAVAILABLE, "Gateway stopped."));
    } catch {
      /* ignore */
    }
  }
  for (const client of runtime.clients) {
    try {
      client.close?.();
    } catch {
      /* ignore */
    }
  }
  await stopGrpcWebProxy(runtime.web);
  await shutdownServer(runtime.server);
  await fsp.rm(runtime.workspaceDir, { recursive: true, force: true }).catch(() => undefined);
  if (runtime.statusWriteTimer) clearTimeout(runtime.statusWriteTimer);
  await removeRuntimeStatus(runtime).catch(() => undefined);
  return { running: false, profileId: id, message: "Gateway stopped." };
}

async function stopAllGatewayProfiles() {
  await Promise.all([...gatewayRuntimes.keys()].map((id) => stopGatewayProfile(id)));
}

function getGatewayProfileStatus(profileId) {
  const runtime = gatewayRuntimes.get(String(profileId || "default-gateway"));
  return runtime ? gatewayStatus(runtime) : { running: false, profileId: String(profileId || "default-gateway") };
}

function listGatewayProfilesStatus() {
  return [...gatewayRuntimes.values()].map(gatewayStatus);
}

function getGatewayLogs(profileId, options = {}) {
  const runtime = gatewayRuntimes.get(String(profileId || "default-gateway"));
  if (!runtime) return [];
  const query = String(options.query || "")
    .trim()
    .toLowerCase();
  const scope = options.scope === "latest" ? "latest" : "all";
  const source = scope === "latest" ? runtime.logs.slice(-1) : runtime.logs;
  const filtered = query ? source.filter((entry) => stableJson(entry).toLowerCase().includes(query)) : source;
  return filtered.slice(-Math.min(2000, positiveInteger(options.limit, 500)));
}

function clearGatewayLogs(profileId) {
  const runtime = gatewayRuntimes.get(String(profileId || "default-gateway"));
  if (runtime) runtime.logs = [];
  return { ok: true };
}

async function saveGatewayCaptureAsScenario(profileId, captureId, destination) {
  const runtime = gatewayRuntimes.get(String(profileId || "default-gateway"));
  if (!runtime) throw new Error("Gateway profile is not running.");
  const capture = runtime.captures.find((item) => item.id === captureId);
  if (!capture) throw new Error("Gateway capture was not found.");
  const scenario = captureToScenario(capture);
  if (destination) {
    const file = path.resolve(destination);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, stringifyYaml({ version: 1, scenarios: [scenario] }), "utf8");
    return { ok: true, file, scenario };
  }
  return { ok: true, scenario };
}

function createGatewayHandler(runtime, method, handlerName, definition, GenericClient) {
  if (definition.requestStream && definition.responseStream) {
    return (call) => handleBidi(runtime, method, handlerName, definition, GenericClient, call);
  }
  if (definition.requestStream) {
    return (call, callback) =>
      handleClientStream(runtime, method, handlerName, definition, GenericClient, call, callback);
  }
  if (definition.responseStream) {
    return (call) => handleServerStream(runtime, method, handlerName, definition, GenericClient, call);
  }
  return (call, callback) => handleUnary(runtime, method, handlerName, definition, GenericClient, call, callback);
}

function handleUnary(runtime, method, handlerName, definition, GenericClient, call, callback) {
  const started = Date.now();
  const methodKey = runtimeMethodKey(method);
  const behavior = resolveBehavior(runtime, methodKey);
  runtime.metrics.callsStarted += 1;
  if (behavior === "disabled") {
    runtime.metrics.callsFailed += 1;
    callback(grpcStatusError(grpc.status.UNIMPLEMENTED, `${methodKey} is disabled by gateway policy.`));
    return;
  }
  const scenario = behavior !== "proxy" ? findScenario(runtime, method, call.request, call.metadata) : null;
  if (scenario) {
    return respondMockUnary(runtime, method, scenario, call, callback, started);
  }
  if (behavior === "mock" || (runtime.profile.mode === "hybrid" && runtime.profile.noMatchBehavior === "not-found")) {
    runtime.metrics.callsFailed += 1;
    callback(grpcStatusError(grpc.status.NOT_FOUND, `No matching mock scenario for ${methodKey}.`));
    return;
  }
  proxyUnaryWithRetry(runtime, method, handlerName, definition, GenericClient, call, callback, started, 0);
}

function proxyUnaryWithRetry(
  runtime,
  method,
  handlerName,
  definition,
  GenericClient,
  call,
  callback,
  started,
  attempt,
) {
  const selected = selectUpstream(runtime);
  if (!selected) {
    runtime.metrics.callsFailed += 1;
    callback(grpcStatusError(grpc.status.UNAVAILABLE, "No healthy upstream is available."));
    return;
  }
  const client = createClient(runtime, GenericClient, selected);
  const metadata = cloneMetadata(call.metadata, runtime.profile.forwardMetadata);
  const options = callOptions(call, runtime.profile.forwardDeadlines);
  const request = call.request || {};
  let trailingMetadata = null;
  const upstreamCall = client[handlerName](request, metadata, options, async (error, response) => {
    runtime.activeCalls.delete(upstreamCall);
    if (error) {
      markUpstreamFailure(runtime, selected, error);
      const canRetry =
        runtime.profile.retry.enabled && attempt < runtime.profile.retry.maxRetries && retryableStatus(error.code);
      if (canRetry) {
        runtime.metrics.retries += 1;
        await delay(runtime.profile.retry.backoffMs * (attempt + 1));
        proxyUnaryWithRetry(
          runtime,
          method,
          handlerName,
          definition,
          GenericClient,
          call,
          callback,
          started,
          attempt + 1,
        );
        return;
      }
      runtime.metrics.callsFailed += 1;
      appendCallLog(
        runtime,
        method,
        "proxy",
        error.code,
        Date.now() - started,
        request,
        undefined,
        selected.target,
        error.details || error.message,
      );
      callback(forwardError(error));
      return;
    }
    markUpstreamSuccess(runtime, selected);
    runtime.metrics.callsCompleted += 1;
    runtime.metrics.bytesIn += estimateBytes(request);
    runtime.metrics.bytesOut += estimateBytes(response);
    appendCallLog(runtime, method, "proxy", grpc.status.OK, Date.now() - started, request, response, selected.target);
    recordUnaryCapture(runtime, method, request, response, call.metadata, selected.target, Date.now() - started);
    callback(null, response, trailingMetadata || undefined);
  });
  upstreamCall.on?.("metadata", (next) => {
    try {
      call.sendMetadata?.(next);
    } catch {
      /* ignore */
    }
  });
  upstreamCall.on?.("status", (status) => {
    trailingMetadata = status?.metadata || trailingMetadata;
  });
  runtime.activeCalls.add(upstreamCall);
  if (runtime.profile.forwardCancellation) {
    call.on("cancelled", () => {
      try {
        upstreamCall.cancel();
      } catch {
        /* ignore */
      }
    });
  }
}

function handleServerStream(runtime, method, handlerName, _definition, GenericClient, call) {
  const started = Date.now();
  const methodKey = runtimeMethodKey(method);
  const behavior = resolveBehavior(runtime, methodKey);
  runtime.metrics.callsStarted += 1;
  if (behavior === "disabled") return endServerCall(call, grpc.status.UNIMPLEMENTED, `${methodKey} is disabled.`);
  const scenario = behavior !== "proxy" ? findScenario(runtime, method, call.request, call.metadata) : null;
  if (scenario) return respondMockServerStream(runtime, method, scenario, call, started);
  if (behavior === "mock" || (runtime.profile.mode === "hybrid" && runtime.profile.noMatchBehavior === "not-found")) {
    runtime.metrics.callsFailed += 1;
    return endServerCall(call, grpc.status.NOT_FOUND, `No matching mock scenario for ${methodKey}.`);
  }
  const selected = selectUpstream(runtime);
  if (!selected) return endServerCall(call, grpc.status.UNAVAILABLE, "No healthy upstream is available.");
  const client = createClient(runtime, GenericClient, selected);
  const metadata = cloneMetadata(call.metadata, runtime.profile.forwardMetadata);
  const upstream = client[handlerName](
    call.request || {},
    metadata,
    callOptions(call, runtime.profile.forwardDeadlines),
  );
  runtime.activeCalls.add(upstream);
  const capture = createStreamCapture(runtime, method, call.request || {}, call.metadata, selected.target);
  let settled = false;
  let trailingMetadata = null;
  upstream.on("metadata", (next) => {
    try {
      call.sendMetadata(next);
    } catch {
      /* ignore */
    }
  });
  upstream.on("data", (message) => {
    runtime.metrics.streamMessages += 1;
    runtime.metrics.bytesOut += estimateBytes(message);
    appendCallLog(runtime, method, "proxy", "MESSAGE", Date.now() - started, call.request, message, selected.target);
    appendStreamCapture(runtime, capture, message);
    const writable = call.write(message);
    if (!writable && upstream.pause) {
      upstream.pause();
      call.once("drain", () => upstream.resume?.());
    }
  });
  upstream.on("status", (status) => {
    runtime.lastStatus = status;
    trailingMetadata = status?.metadata || null;
  });
  upstream.on("error", (error) => {
    if (settled) return;
    settled = true;
    runtime.activeCalls.delete(upstream);
    markUpstreamFailure(runtime, selected, error);
    runtime.metrics.callsFailed += 1;
    finalizeStreamCapture(runtime, capture, error.code, error.details || error.message);
    endServerCall(call, Number(error.code || grpc.status.UNKNOWN), error.details || error.message);
  });
  upstream.on("end", () => {
    if (settled) return;
    settled = true;
    runtime.activeCalls.delete(upstream);
    markUpstreamSuccess(runtime, selected);
    runtime.metrics.callsCompleted += 1;
    finalizeStreamCapture(runtime, capture, grpc.status.OK, "OK");
    call.end(trailingMetadata || undefined);
  });
  if (runtime.profile.forwardCancellation) call.on("cancelled", () => upstream.cancel?.());
}

function handleClientStream(runtime, method, handlerName, _definition, GenericClient, call, callback) {
  const started = Date.now();
  const behavior = resolveBehavior(runtime, runtimeMethodKey(method));
  runtime.metrics.callsStarted += 1;
  if (behavior === "disabled" || behavior === "mock") {
    runtime.metrics.callsFailed += 1;
    callback(
      grpcStatusError(grpc.status.UNIMPLEMENTED, "Client-streaming mock mode is not supported; use proxy behavior."),
    );
    return;
  }
  const selected = selectUpstream(runtime);
  if (!selected) return callback(grpcStatusError(grpc.status.UNAVAILABLE, "No healthy upstream is available."));
  const client = createClient(runtime, GenericClient, selected);
  const requests = [];
  let trailingMetadata = null;
  const upstream = client[handlerName](
    cloneMetadata(call.metadata, runtime.profile.forwardMetadata),
    callOptions(call, runtime.profile.forwardDeadlines),
    (error, response) => {
      runtime.activeCalls.delete(upstream);
      if (error) {
        markUpstreamFailure(runtime, selected, error);
        runtime.metrics.callsFailed += 1;
        appendCallLog(
          runtime,
          method,
          "proxy",
          error.code,
          Date.now() - started,
          requests,
          undefined,
          selected.target,
          error.details || error.message,
        );
        callback(forwardError(error));
        return;
      }
      markUpstreamSuccess(runtime, selected);
      runtime.metrics.callsCompleted += 1;
      appendCallLog(
        runtime,
        method,
        "proxy",
        grpc.status.OK,
        Date.now() - started,
        requests,
        response,
        selected.target,
      );
      recordUnaryCapture(runtime, method, requests, response, call.metadata, selected.target, Date.now() - started);
      callback(null, response, trailingMetadata || undefined);
    },
  );
  upstream.on?.("metadata", (next) => {
    try {
      call.sendMetadata?.(next);
    } catch {
      /* ignore */
    }
  });
  upstream.on?.("status", (status) => {
    trailingMetadata = status?.metadata || trailingMetadata;
  });
  runtime.activeCalls.add(upstream);
  call.on("data", (message) => {
    if (requests.length < runtime.profile.capture.maxStreamMessages) requests.push(clampPayload(runtime, message));
    runtime.metrics.streamMessages += 1;
    runtime.metrics.bytesIn += estimateBytes(message);
    const writable = upstream.write(message);
    if (!writable && call.pause) {
      call.pause();
      upstream.once("drain", () => call.resume?.());
    }
  });
  call.on("end", () => upstream.end());
  call.on("error", () => upstream.cancel?.());
  if (runtime.profile.forwardCancellation) call.on("cancelled", () => upstream.cancel?.());
}

function handleBidi(runtime, method, handlerName, _definition, GenericClient, call) {
  const _started = Date.now();
  const behavior = resolveBehavior(runtime, runtimeMethodKey(method));
  runtime.metrics.callsStarted += 1;
  if (behavior === "disabled" || behavior === "mock") {
    runtime.metrics.callsFailed += 1;
    return endServerCall(
      call,
      grpc.status.UNIMPLEMENTED,
      "Bidirectional mock mode is not supported; use proxy behavior.",
    );
  }
  const selected = selectUpstream(runtime);
  if (!selected) return endServerCall(call, grpc.status.UNAVAILABLE, "No healthy upstream is available.");
  const client = createClient(runtime, GenericClient, selected);
  const upstream = client[handlerName](
    cloneMetadata(call.metadata, runtime.profile.forwardMetadata),
    callOptions(call, runtime.profile.forwardDeadlines),
  );
  runtime.activeCalls.add(upstream);
  const capture = createStreamCapture(runtime, method, [], call.metadata, selected.target);
  let settled = false;
  let trailingMetadata = null;
  call.on("data", (message) => {
    runtime.metrics.streamMessages += 1;
    runtime.metrics.bytesIn += estimateBytes(message);
    appendStreamRequestCapture(runtime, capture, message);
    const writable = upstream.write(message);
    if (!writable && call.pause) {
      call.pause();
      upstream.once("drain", () => call.resume?.());
    }
  });
  call.on("end", () => upstream.end());
  upstream.on("metadata", (next) => {
    try {
      call.sendMetadata(next);
    } catch {
      /* ignore */
    }
  });
  upstream.on("status", (status) => {
    trailingMetadata = status?.metadata || null;
  });
  upstream.on("data", (message) => {
    runtime.metrics.streamMessages += 1;
    runtime.metrics.bytesOut += estimateBytes(message);
    appendStreamCapture(runtime, capture, message);
    const writable = call.write(message);
    if (!writable && upstream.pause) {
      upstream.pause();
      call.once("drain", () => upstream.resume?.());
    }
  });
  upstream.on("error", (error) => {
    if (settled) return;
    settled = true;
    runtime.activeCalls.delete(upstream);
    markUpstreamFailure(runtime, selected, error);
    runtime.metrics.callsFailed += 1;
    finalizeStreamCapture(runtime, capture, error.code, error.details || error.message);
    endServerCall(call, Number(error.code || grpc.status.UNKNOWN), error.details || error.message);
  });
  upstream.on("end", () => {
    if (settled) return;
    settled = true;
    runtime.activeCalls.delete(upstream);
    markUpstreamSuccess(runtime, selected);
    runtime.metrics.callsCompleted += 1;
    finalizeStreamCapture(runtime, capture, grpc.status.OK, "OK");
    call.end(trailingMetadata || undefined);
  });
  if (runtime.profile.forwardCancellation) call.on("cancelled", () => upstream.cancel?.());
}

function respondMockUnary(runtime, method, scenario, call, callback, started) {
  const output = scenario.response || scenario.output || {};
  const delayMs = Math.max(0, Number(output.delayMs || 0));
  setTimeout(() => {
    const code = normalizeGrpcStatus(output.code);
    if (code !== grpc.status.OK) {
      runtime.metrics.callsFailed += 1;
      appendCallLog(
        runtime,
        method,
        "mock",
        code,
        Date.now() - started,
        call.request,
        undefined,
        "mock",
        output.message,
      );
      callback(grpcStatusError(code, output.message || "Mock error"));
      return;
    }
    runtime.metrics.callsCompleted += 1;
    appendCallLog(runtime, method, "mock", code, Date.now() - started, call.request, output.data, "mock");
    callback(null, output.data === undefined ? {} : output.data);
  }, delayMs);
}

function respondMockServerStream(runtime, method, scenario, call, started) {
  const responses = Array.isArray(scenario.stream?.responses) ? scenario.stream.responses : [];
  const intervalMs = Math.max(0, Number(scenario.stream?.intervalMs || 0));
  let index = 0;
  const send = () => {
    if (index >= responses.length) {
      runtime.metrics.callsCompleted += 1;
      call.end();
      return;
    }
    const item = responses[index++];
    const code = normalizeGrpcStatus(item.code);
    if (code !== grpc.status.OK) {
      runtime.metrics.callsFailed += 1;
      endServerCall(call, code, item.message || "Mock stream error");
      return;
    }
    runtime.metrics.streamMessages += 1;
    appendCallLog(runtime, method, "mock", "MESSAGE", Date.now() - started, call.request, item.data, "mock");
    call.write(item.data === undefined ? {} : item.data);
    setTimeout(send, Math.max(0, Number(item.delayMs ?? intervalMs)));
  };
  send();
}

function resolveBehavior(runtime, methodKey) {
  const override = runtime.profile.methodBehaviors[methodKey];
  if (override === "mock" || override === "proxy" || override === "disabled") return override;
  if (runtime.profile.mode === "mock") return "mock";
  if (runtime.profile.mode === "gateway") return "proxy";
  return "hybrid";
}

function findScenario(runtime, method, request, metadata) {
  const methodKey = runtimeMethodKey(method);
  if (runtime.enabledMethods[methodKey] === false || runtime.enabledMethods[methodKey.replace("/", ".")] === false)
    return null;
  const candidates = runtime.scenarios
    .filter(
      (item) =>
        item && item.active !== false && item.service === method.serviceName && item.method === method.methodName,
    )
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  const selectedId = runtime.activeScenarioIds[methodKey] || runtime.activeScenarioIds[methodKey.replace("/", ".")];
  const active = selectedId ? candidates.filter((item) => item.id === selectedId) : candidates;
  const requestContext = { data: request || {}, headers: metadataToObject(metadata) };
  // Reuse the native mock matcher so Web Access and native gRPC interpret unary
  // request bodies, metadata, equals_unordered, regex/glob and OR blocks identically.
  return active.find((scenario) => mockMatcherMatches(scenario.input || scenario.match, requestContext)) || null;
}

function selectUpstream(runtime) {
  const candidates = [];
  const now = Date.now();
  for (const upstream of runtime.profile.upstreams) {
    const state = runtime.upstreamStates.get(upstream.target) || { failures: 0, openUntil: 0 };
    runtime.upstreamStates.set(upstream.target, state);
    if (state.openUntil > now) continue;
    for (let index = 0; index < upstream.weight; index += 1) candidates.push(upstream);
  }
  if (!candidates.length) return null;
  const selected = candidates[runtime.roundRobinCursor % candidates.length];
  runtime.roundRobinCursor += 1;
  return selected;
}

function createClient(runtime, GenericClient, upstream) {
  const credentials = createChannelCredentials(upstream.security);
  const options = {
    "grpc.max_receive_message_length": runtime.profile.limits.maxReceiveBytes,
    "grpc.max_send_message_length": runtime.profile.limits.maxSendBytes,
  };
  if (upstream.security.serverNameOverride) {
    options["grpc.ssl_target_name_override"] = upstream.security.serverNameOverride;
    options["grpc.default_authority"] = upstream.security.serverNameOverride;
  }
  const client = new GenericClient(upstream.target, credentials, options);
  runtime.clients.add(client);
  return client;
}

function createServerCredentials(security) {
  if (!security || security.type !== "tls") return grpc.ServerCredentials.createInsecure();
  const certChain = readRequiredFile(security.certificatePath, "Gateway TLS certificate");
  const privateKey = readRequiredFile(security.privateKeyPath, "Gateway TLS private key");
  const rootCerts = readOptionalFile(security.clientCaPath);
  return grpc.ServerCredentials.createSsl(
    rootCerts || null,
    [{ cert_chain: certChain, private_key: privateKey }],
    Boolean(security.requireClientCertificate),
  );
}

function readRequiredFile(file, label) {
  if (!file) throw new Error(`${label} path is required.`);
  try {
    return fs.readFileSync(path.resolve(file));
  } catch (error) {
    throw new Error(`${label} could not be read: ${error?.message || error}`);
  }
}

function createChannelCredentials(security) {
  if (!security || security.type !== "tls") return grpc.credentials.createInsecure();
  const rootCerts = readOptionalFile(security.caPath);
  const privateKey = readOptionalFile(security.clientKeyPath);
  const certChain = readOptionalFile(security.clientCertPath);
  return grpc.credentials.createSsl(rootCerts || undefined, privateKey || undefined, certChain || undefined);
}

function markUpstreamFailure(runtime, upstream, _error) {
  const state = runtime.upstreamStates.get(upstream.target) || { failures: 0, openUntil: 0 };
  state.failures += 1;
  if (runtime.profile.circuitBreaker.enabled && state.failures >= runtime.profile.circuitBreaker.failureThreshold) {
    state.openUntil = Date.now() + runtime.profile.circuitBreaker.openMs;
    runtime.metrics.circuitOpens += 1;
  }
  runtime.upstreamStates.set(upstream.target, state);
}

function markUpstreamSuccess(runtime, upstream) {
  runtime.upstreamStates.set(upstream.target, { failures: 0, openUntil: 0 });
}

function appendCallLog(runtime, method, behavior, status, durationMs, request, response, upstream, message) {
  appendLog(runtime, {
    kind: "call",
    behavior,
    method: runtimeMethodKey(method),
    status: grpcStatusName(status),
    durationMs,
    upstream,
    request: clampPayload(runtime, request),
    response: clampPayload(runtime, response),
    message,
  });
}

function appendLog(runtime, entry) {
  runtime.logs.push({
    id: crypto.randomUUID(),
    traceId: entry.traceId || crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (runtime.logs.length > maxLogEntries) runtime.logs.splice(0, runtime.logs.length - maxLogEntries);
  scheduleRuntimeStatusWrite(runtime);
}

function scheduleRuntimeStatusWrite(runtime) {
  if (!runtime.workspaceDirectory || runtime.statusWriteTimer) return;
  runtime.statusWriteTimer = setTimeout(() => {
    runtime.statusWriteTimer = null;
    persistRuntimeStatus(runtime).catch(() => undefined);
  }, 100);
}

async function persistRuntimeStatus(runtime) {
  if (!runtime.workspaceDirectory) return;
  const directory = path.join(runtime.workspaceDirectory, ".layang", "gateway-runtime");
  await fsp.mkdir(directory, { recursive: true });
  const file = path.join(directory, `${safeSegment(runtime.id)}-status.json`);
  const value = {
    ...gatewayStatus(runtime),
    logs: runtime.logs.slice(-100),
    updatedAt: new Date().toISOString(),
  };
  const temporary = `${file}.tmp-${process.pid}`;
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await fsp.rename(temporary, file).catch(async (error) => {
    if (error?.code !== "EPERM" && error?.code !== "EEXIST") throw error;
    await fsp.rm(file, { force: true });
    await fsp.rename(temporary, file);
  });
}

async function removeRuntimeStatus(runtime) {
  if (!runtime.workspaceDirectory) return;
  await fsp.rm(
    path.join(runtime.workspaceDirectory, ".layang", "gateway-runtime", `${safeSegment(runtime.id)}-status.json`),
    { force: true },
  );
}

function recordUnaryCapture(runtime, method, request, response, metadata, upstream, durationMs) {
  if (!runtime.profile.capture.enabled) return;
  const capture = {
    id: crypto.randomUUID(),
    kind: "unary",
    method: runtimeMethodKey(method),
    service: method.serviceName,
    methodName: method.methodName,
    request: clampPayload(runtime, request),
    response: clampPayload(runtime, response),
    metadata: redactMetadata(metadataToObject(metadata), runtime.profile.capture.redactMetadataKeys),
    upstream,
    durationMs,
    status: "OK",
    capturedAt: new Date().toISOString(),
  };
  runtime.captures.push(capture);
  appendLog(runtime, {
    kind: "capture",
    behavior: "capture",
    method: capture.method,
    status: capture.status,
    captureId: capture.id,
    message: "Captured upstream response. Save it as a mock scenario when ready.",
  });
  persistCapture(runtime, capture);
}

function createStreamCapture(runtime, method, request, metadata, upstream) {
  if (!runtime.profile.capture.enabled) return null;
  return {
    id: crypto.randomUUID(),
    kind:
      method.requestStream && method.responseStream ? "bidi" : method.requestStream ? "client-stream" : "server-stream",
    method: runtimeMethodKey(method),
    service: method.serviceName,
    methodName: method.methodName,
    request: clampPayload(runtime, request),
    requests: [],
    responses: [],
    metadata: redactMetadata(metadataToObject(metadata), runtime.profile.capture.redactMetadataKeys),
    upstream,
    startedAt: Date.now(),
    capturedAt: new Date().toISOString(),
  };
}

function appendStreamRequestCapture(runtime, capture, message) {
  if (!capture || capture.requests.length >= runtime.profile.capture.maxStreamMessages) return;
  if (Date.now() - capture.startedAt > runtime.profile.capture.maxStreamDurationMs) return;
  capture.requests.push(clampPayload(runtime, message));
}

function appendStreamCapture(runtime, capture, message) {
  if (!capture || capture.responses.length >= runtime.profile.capture.maxStreamMessages) return;
  if (Date.now() - capture.startedAt > runtime.profile.capture.maxStreamDurationMs) return;
  capture.responses.push(clampPayload(runtime, message));
}

function finalizeStreamCapture(runtime, capture, status, message) {
  if (!capture) return;
  capture.status = grpcStatusName(status);
  capture.message = message;
  capture.durationMs = Date.now() - capture.startedAt;
  delete capture.startedAt;
  runtime.captures.push(capture);
  appendLog(runtime, {
    kind: "capture",
    behavior: "capture",
    method: capture.method,
    status: capture.status,
    captureId: capture.id,
    message: `Captured ${capture.responses?.length ?? 0} streamed response message(s).`,
  });
  persistCapture(runtime, capture);
}

async function persistCapture(runtime, capture) {
  if (!runtime.workspaceDirectory) return;
  const dir = path.join(
    runtime.workspaceDirectory,
    ".layang",
    "proxy-captures",
    safeSegment(runtime.id),
    safeSegment(capture.method),
  );
  const file = path.join(dir, `${capture.capturedAt.replace(/[:.]/g, "-")}-${capture.id.slice(0, 8)}.yml`);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(file, stringifyYaml({ version: 1, capture }), "utf8").catch(() => undefined);
}

function captureToScenario(capture) {
  const responses = Array.isArray(capture.responses) ? capture.responses.map((data) => ({ data })) : [];
  return {
    id: `capture-${capture.id.slice(0, 8)}`,
    service: capture.service,
    method: capture.methodName,
    active: true,
    description: `Captured from ${capture.upstream || "upstream"} at ${capture.capturedAt}`,
    input: { equals: capture.request || {} },
    ...(responses.length ? { stream: { intervalMs: 0, responses } } : { response: { data: capture.response || {} } }),
  };
}

function gatewayStatus(runtime) {
  return {
    running: true,
    profileId: runtime.id,
    name: runtime.profile.name,
    mode: runtime.profile.mode,
    listenHost: runtime.profile.listenHost,
    listenPort: runtime.profile.listenPort,
    bindAddress: `${runtime.profile.listenHost}:${runtime.profile.listenPort}`,
    url: `grpc://${runtime.profile.listenHost}:${runtime.profile.listenPort}`,
    webEnabled: Boolean(runtime.web),
    webUrl: runtime.web?.url,
    webHost: runtime.web?.config.host,
    webPort: runtime.web?.config.port,
    webProtocol: runtime.web?.protocol,
    webHttp2: Boolean(runtime.web?.http2),
    webMaxConcurrentStreams: runtime.web?.config.maxConcurrentStreams,
    webActiveStreamCount: runtime.web?.activeCalls?.size ?? 0,
    upstreams: runtime.profile.upstreams.map((item) => item.target),
    methodCount: runtime.methodCount,
    activeCallCount: runtime.activeCalls.size,
    logCount: runtime.logs.length,
    captureCount: runtime.captures.length,
    startedAt: runtime.startedAt,
    metrics: { ...runtime.metrics },
    logs: runtime.logs.slice(-200),
  };
}

function createMetrics() {
  return {
    callsStarted: 0,
    callsCompleted: 0,
    callsFailed: 0,
    streamMessages: 0,
    bytesIn: 0,
    bytesOut: 0,
    retries: 0,
    circuitOpens: 0,
  };
}

function validateProfile(profile) {
  if (profile.mode !== "mock" && !profile.upstreams.length)
    throw new Error("At least one upstream target is required.");
  if (
    profile.web.enabled &&
    listenerEndpointsOverlap(profile.listenHost, profile.listenPort, profile.web.host, profile.web.port)
  ) {
    throw new Error("The native gRPC listener and gRPC-Web listener must use different ports.");
  }
  if (profile.web.enabled && profile.web.security.type === "tls") {
    const hasPfx = Boolean(profile.web.security.pfxPath);
    const hasPem = Boolean(profile.web.security.certificatePath && profile.web.security.privateKeyPath);
    const hasLocalReference =
      profile.web.security.certificateMode === "local" && Boolean(profile.web.security.certificateId);
    if (!hasPfx && !hasPem && !hasLocalReference) {
      throw new Error(
        "HTTPS Web Access requires a Local HTTPS setup, a PEM certificate and private key, or a PFX/P12 file.",
      );
    }
  }
  for (const upstream of profile.upstreams) {
    if (sameEndpoint(profile.listenHost, profile.listenPort, upstream.target)) {
      throw new Error("Upstream target cannot point to the gateway listen address.");
    }
  }
}

function callOptions(call, forwardDeadline) {
  if (!forwardDeadline) return {};
  try {
    const deadline = call.getDeadline?.();
    return deadline ? { deadline } : {};
  } catch {
    return {};
  }
}

function cloneMetadata(metadata, enabled) {
  if (!enabled || !metadata) return new grpc.Metadata();
  const output = new grpc.Metadata();
  for (const [key, values] of Object.entries(metadata.getMap ? metadata.getMap() : {})) output.set(key, values);
  return output;
}

function metadataToObject(metadata) {
  if (!metadata?.getMap) return {};
  return { ...metadata.getMap() };
}

function redactMetadata(value, keys) {
  const blocked = new Set(uniqueLowercase(keys));
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, item]) => [key, blocked.has(key.toLowerCase()) ? "********" : item]),
  );
}

function forwardError(error) {
  const next = grpcStatusError(
    Number(error?.code || grpc.status.UNKNOWN),
    error?.details || error?.message || "Upstream error",
  );
  if (error?.metadata) next.metadata = error.metadata;
  return next;
}

function endServerCall(call, code, message) {
  const error = grpcStatusError(code, message);
  try {
    call.destroy?.(error);
  } catch {
    /* ignore */
  }
  try {
    call.emit?.("error", error);
  } catch {
    /* ignore */
  }
  try {
    call.end?.();
  } catch {
    /* ignore */
  }
}

function registerHealthService(server) {
  const definition = {
    Check: {
      path: "/grpc.health.v1.Health/Check",
      requestStream: false,
      responseStream: false,
      requestSerialize: serializeHealthRequest,
      requestDeserialize: deserializeHealthRequest,
      responseSerialize: serializeHealthResponse,
      responseDeserialize: deserializeHealthResponse,
    },
    Watch: {
      path: "/grpc.health.v1.Health/Watch",
      requestStream: false,
      responseStream: true,
      requestSerialize: serializeHealthRequest,
      requestDeserialize: deserializeHealthRequest,
      responseSerialize: serializeHealthResponse,
      responseDeserialize: deserializeHealthResponse,
    },
  };
  server.addService(definition, {
    Check: (_call, callback) => callback(null, { status: 1 }),
    Watch: (call) => {
      call.write({ status: 1 });
      call.end();
    },
  });
}

function serializeHealthRequest(value) {
  const service = Buffer.from(String(value?.service || ""), "utf8");
  return service.length ? Buffer.concat([Buffer.from([0x0a, service.length]), service]) : Buffer.alloc(0);
}
function deserializeHealthRequest(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  return bytes[0] === 0x0a ? { service: bytes.slice(2, 2 + Number(bytes[1] || 0)).toString("utf8") } : { service: "" };
}
function serializeHealthResponse(value) {
  return Buffer.from([0x08, Math.max(0, Math.min(255, Number(value?.status || 1)))]);
}
function deserializeHealthResponse(buffer) {
  const bytes = Buffer.from(buffer || []);
  return { status: bytes[0] === 0x08 ? bytes[1] || 0 : 0 };
}

async function bindServerAddress(server, host, port, security) {
  const credentials = createServerCredentials(security);
  return new Promise((resolve, reject) => {
    server.bindAsync(`${host}:${port}`, credentials, (error, bound) => (error ? reject(error) : resolve(bound)));
  });
}

async function shutdownServer(server) {
  await new Promise((resolve) => {
    let completed = false;
    const done = () => {
      if (!completed) {
        completed = true;
        resolve();
      }
    };
    try {
      server.tryShutdown(done);
      setTimeout(() => {
        try {
          server.forceShutdown();
        } catch {
          /* ignore */
        }
        done();
      }, 600);
    } catch {
      try {
        server.forceShutdown();
      } catch {
        /* ignore */
      }
      done();
    }
  });
}

async function writeProtoWorkspace(protoFiles) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "layang-gateway-proto-"));
  for (const file of protoFiles) {
    const relative = safeRelative(file?.name || "schema.proto");
    const target = path.join(dir, relative);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, String(file?.text || ""), "utf8");
  }
  return dir;
}

function getByDottedPath(root, dotted) {
  return String(dotted || "")
    .split(".")
    .reduce((current, part) => current?.[part], root);
}
function findServiceDefinitionKey(serviceDefinition, methodName) {
  const keys = Object.keys(serviceDefinition || {});
  return (
    keys.find((key) => key === methodName) ||
    keys.find((key) => key === `${String(methodName).charAt(0).toLowerCase()}${String(methodName).slice(1)}`) ||
    keys.find((key) => key.toLowerCase() === String(methodName).toLowerCase()) ||
    methodName
  );
}
function runtimeMethodKey(method) {
  return `${method.serviceName}/${method.methodName}`;
}
function normalizeListenHost(value) {
  const host = String(value || "127.0.0.1").trim();
  return host || "127.0.0.1";
}
function normalizePort(value, fallback) {
  const port = Math.floor(Number(value));
  return Number.isFinite(port) && port > 0 && port <= 65535 ? port : fallback;
}
function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
function stripGrpcScheme(value) {
  return String(value || "")
    .trim()
    .replace(/^grpcs?:\/\//i, "");
}
function listenerEndpointsOverlap(leftHost, leftPort, rightHost, rightPort) {
  if (Number(leftPort) !== Number(rightPort)) return false;
  const left = String(leftHost || "")
    .trim()
    .toLowerCase();
  const right = String(rightHost || "")
    .trim()
    .toLowerCase();
  const wildcards = new Set(["0.0.0.0", "::", "[::]"]);
  if (wildcards.has(left) || wildcards.has(right)) return true;
  const loopbacks = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (loopbacks.has(left) && loopbacks.has(right)) return true;
  return left === right;
}

function sameEndpoint(host, port, target) {
  const normalized = stripGrpcScheme(target).toLowerCase();
  const [targetHost, targetPort] = normalized.split(":");
  const hostSet = new Set([
    String(host).toLowerCase(),
    host === "0.0.0.0" ? "127.0.0.1" : String(host).toLowerCase(),
    "localhost",
  ]);
  return hostSet.has(targetHost) && Number(targetPort) === Number(port);
}
function readOptionalFile(file) {
  try {
    return file ? fs.readFileSync(path.resolve(file)) : null;
  } catch {
    return null;
  }
}
function retryableStatus(code) {
  return (
    code === grpc.status.UNAVAILABLE ||
    code === grpc.status.DEADLINE_EXCEEDED ||
    code === grpc.status.RESOURCE_EXHAUSTED
  );
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
function normalizeGrpcStatus(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const key = String(value || "OK").toUpperCase();
  return grpc.status[key] ?? grpc.status.UNKNOWN;
}
function grpcStatusName(value) {
  if (typeof value === "string") return value;
  return Object.entries(grpc.status).find(([, code]) => code === Number(value))?.[0] || String(value);
}
function grpcStatusError(code, message) {
  const error = new Error(message || `gRPC status ${code}`);
  error.code = code;
  error.details = message || "";
  error.metadata = new grpc.Metadata();
  return error;
}
function estimateBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null));
  } catch {
    return 0;
  }
}
function clampPayload(runtime, value) {
  const text = stableJson(value);
  if (Buffer.byteLength(text) <= runtime.profile.capture.maxMessageBytes) return value;
  return { truncated: true, byteLength: Buffer.byteLength(text), preview: text.slice(0, 20_000) };
}
function stableJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}
function safeRelative(value) {
  const parts = String(value || "schema.proto")
    .replace(/\\/g, "/")
    .split("/")
    .filter((item) => item && item !== "." && item !== "..");
  return parts.length ? parts.join("/") : "schema.proto";
}
function safeSegment(value) {
  return (
    String(value || "item")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}
function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function uniqueLowercase(values) {
  return [
    ...new Set((Array.isArray(values) ? values : []).map((item) => String(item).trim().toLowerCase()).filter(Boolean)),
  ];
}

module.exports = {
  normalizeProfile,
  startGatewayProfile,
  stopGatewayProfile,
  stopAllGatewayProfiles,
  getGatewayProfileStatus,
  listGatewayProfilesStatus,
  getGatewayLogs,
  clearGatewayLogs,
  saveGatewayCaptureAsScenario,
};
