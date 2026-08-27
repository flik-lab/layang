"use strict";

const fs = require("node:fs");
const http = require("node:http");
const http2 = require("node:http2");
const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const { readSecret } = require("../utils/secure-secrets.cjs");
const { resolveHttpsCertificateSecurity } = require("../utils/web-https-certificates.cjs");
const {
  GrpcWebTextEncoder,
  decodeGrpcWebRequestBody,
  encodeDataFrame,
  encodeGrpcWebTextFrame,
  encodeTrailerFrame,
  normalizeGrpcWebContentType,
  parseGrpcTimeout,
} = require("../../lib/grpc-web-protocol.cjs");

const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "te",
  "transfer-encoding",
  "upgrade",
]);
const protocolHeaders = new Set(["accept", "content-type", "grpc-accept-encoding", "x-grpc-web", "x-user-agent"]);

function normalizeGrpcWebConfig(input = {}) {
  const security = normalizeWebSecurity(input.security);
  const allowedOrigins = uniqueStrings(
    input.cors?.allowedOrigins || [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
  );
  return {
    enabled: input.enabled !== false,
    host: normalizeHost(input.host || "127.0.0.1"),
    port: normalizePort(input.port, security.type === "tls" ? 8443 : 8080),
    security,
    allowHttp1Fallback: input.allowHttp1Fallback !== false,
    maxConcurrentStreams: clampInteger(input.maxConcurrentStreams, 100, 6, 1000),
    maxRequestBytes: clampInteger(input.maxRequestBytes, 10 * 1024 * 1024, 1024, 100 * 1024 * 1024),
    cors: {
      allowedOrigins,
      allowedHeaders: uniqueLowercase(
        input.cors?.allowedHeaders || [
          "authorization",
          "content-type",
          "grpc-timeout",
          "x-grpc-web",
          "x-user-agent",
          "x-request-id",
        ],
      ),
      exposedHeaders: uniqueLowercase(
        input.cors?.exposedHeaders || ["grpc-status", "grpc-message", "grpc-status-details-bin"],
      ),
      allowCredentials: Boolean(input.cors?.allowCredentials),
      maxAgeSeconds: clampInteger(input.cors?.maxAgeSeconds, 600, 0, 86400),
    },
  };
}

function normalizeWebSecurity(input) {
  if (!input || input.type !== "tls") return { type: "insecure" };
  const resolvedInput =
    input.certificateMode === "local" && input.certificateId ? resolveHttpsCertificateSecurity(input) : input;
  const certificateMode =
    resolvedInput.certificateMode === "pfx" ? "pfx" : resolvedInput.certificateMode === "local" ? "local" : "pem";
  return {
    type: "tls",
    certificateMode,
    certificateId: String(resolvedInput.certificateId || ""),
    certificatePath: String(resolvedInput.certificatePath || ""),
    privateKeyPath: String(resolvedInput.privateKeyPath || ""),
    certificateChainPath: String(resolvedInput.certificateChainPath || ""),
    clientCaPath: String(resolvedInput.clientCaPath || ""),
    pfxPath: String(resolvedInput.pfxPath || ""),
    passphraseSecretId: String(resolvedInput.passphraseSecretId || ""),
    requireClientCertificate: Boolean(resolvedInput.requireClientCertificate),
  };
}

async function startGrpcWebProxy(options) {
  const config = normalizeGrpcWebConfig(options?.config);
  if (!config.enabled) return null;
  const routes = options?.routes instanceof Map ? options.routes : new Map();
  const bridgeTarget = String(options?.bridgeTarget || "").trim();
  if (!bridgeTarget) throw new Error("Internal native gRPC bridge target is required for gRPC-Web.");
  const onLog = typeof options?.onLog === "function" ? options.onLog : () => undefined;
  const activeCalls = new Set();
  const clients = new Set();
  const sessions = new Set();
  const sockets = new Set();
  const handler = createRequestHandler({ config, routes, bridgeTarget, onLog, activeCalls, clients });
  const server = createHttpServer(config, handler);
  server.on?.("connection", (socket) => {
    sockets.add(socket);
    socket.setNoDelay?.(true);
    socket.once("close", () => sockets.delete(socket));
  });
  if (server.on && config.security.type === "tls") {
    server.on("session", (session) => {
      sessions.add(session);
      session.once("close", () => sessions.delete(session));
    });
    server.on("sessionError", (error) =>
      onLog({
        kind: "server",
        behavior: "grpc-web",
        status: "SESSION_ERROR",
        message: error?.message || String(error),
      }),
    );
  }
  const port = await listen(server, config.host, config.port);
  config.port = port;
  const protocol = config.security.type === "tls" ? "https" : "http";
  const url = `${protocol}://${displayHost(config.host)}:${port}`;
  const runtime = {
    server,
    sockets,
    sessions,
    activeCalls,
    clients,
    config,
    url,
    protocol,
    http2: config.security.type === "tls",
    startedAt: new Date().toISOString(),
  };
  onLog({
    kind: "server",
    behavior: "grpc-web",
    status: "RUNNING",
    message:
      config.security.type === "tls"
        ? `gRPC-Web HTTPS/HTTP2 listener running at ${url}; max ${config.maxConcurrentStreams} concurrent streams.`
        : `gRPC-Web HTTP/1.1 listener running at ${url}. Use HTTPS/HTTP2 for more than a few parallel long-lived browser streams.`,
  });
  return runtime;
}

async function stopGrpcWebProxy(runtime) {
  if (!runtime) return;
  for (const entry of runtime.activeCalls || []) {
    try {
      entry.call?.cancel?.();
    } catch {
      /* ignore */
    }
  }
  for (const client of runtime.clients || []) {
    try {
      client.close?.();
    } catch {
      /* ignore */
    }
  }
  for (const session of runtime.sessions || []) {
    try {
      session.destroy?.();
    } catch {
      /* ignore */
    }
  }
  for (const socket of runtime.sockets || []) {
    try {
      socket.destroy?.();
    } catch {
      /* ignore */
    }
  }
  await closeServer(runtime.server);
}

function createHttpServer(config, handler) {
  if (config.security.type !== "tls") {
    const server = http.createServer(handler);
    server.keepAliveTimeout = 75_000;
    server.headersTimeout = 80_000;
    return server;
  }
  const tlsConfig = config.security;
  if (
    tlsConfig.certificateMode === "local" &&
    tlsConfig.certificateId &&
    !tlsConfig.pfxPath &&
    !(tlsConfig.certificatePath && tlsConfig.privateKeyPath)
  ) {
    throw new Error(
      `Local HTTPS certificate "${tlsConfig.certificateId}" is not installed on this machine. Open Web Access settings and run Setup Local HTTPS.`,
    );
  }
  const clientCa = readOptionalFile(tlsConfig.clientCaPath);
  const passphrase = tlsConfig.passphraseSecretId ? readSecret(tlsConfig.passphraseSecretId) : "";
  if ((tlsConfig.certificateMode === "pfx" || tlsConfig.pfxPath) && tlsConfig.passphraseSecretId && !passphrase) {
    throw new Error(
      "The PFX passphrase is unavailable on this machine. Re-enter it and validate the certificate before starting Web Access.",
    );
  }
  const credentials =
    tlsConfig.certificateMode === "pfx" || tlsConfig.pfxPath
      ? {
          pfx: readRequiredFile(tlsConfig.pfxPath, "gRPC-Web PFX/P12 certificate"),
          passphrase: passphrase || undefined,
        }
      : {
          cert: joinCertificateChain(
            readRequiredFile(tlsConfig.certificatePath, "gRPC-Web TLS certificate"),
            readOptionalFile(tlsConfig.certificateChainPath),
          ),
          key: readRequiredFile(tlsConfig.privateKeyPath, "gRPC-Web TLS private key"),
        };
  return http2.createSecureServer(
    {
      ...credentials,
      ca: clientCa || undefined,
      requestCert: Boolean(tlsConfig.requireClientCertificate),
      rejectUnauthorized: Boolean(tlsConfig.requireClientCertificate),
      allowHTTP1: config.allowHttp1Fallback,
      settings: {
        enablePush: false,
        maxConcurrentStreams: config.maxConcurrentStreams,
        maxHeaderListSize: 64 * 1024,
      },
    },
    handler,
  );
}

function createRequestHandler(context) {
  return async (req, res) => {
    const origin = String(req.headers?.origin || "");
    if (!applyCors(context.config, origin, req, res)) {
      res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Origin is not allowed by this gRPC-Web profile." }));
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const requestPath = new URL(req.url || "/", "http://layang.local").pathname;
    if (req.method === "GET" && requestPath === "/healthz") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(
        JSON.stringify({
          status: "SERVING",
          transport: context.config.security.type === "tls" ? "grpc-web+https+h2" : "grpc-web+http1",
          activeStreams: context.activeCalls.size,
          maxConcurrentStreams: context.config.maxConcurrentStreams,
        }),
      );
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json; charset=utf-8", allow: "POST, OPTIONS" });
      res.end(JSON.stringify({ error: "Only gRPC-Web POST and CORS OPTIONS requests are supported." }));
      return;
    }
    const route = context.routes.get(requestPath);
    const contentType = normalizeGrpcWebContentType(req.headers?.["content-type"]);
    if (!contentType.valid) {
      res.writeHead(415, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Expected application/grpc-web or application/grpc-web-text content type." }));
      return;
    }
    if (!route) {
      writeGrpcWebError(res, contentType, grpc.status.UNIMPLEMENTED, `Unknown gRPC-Web method ${requestPath}.`);
      return;
    }
    if (route.definition.requestStream) {
      writeGrpcWebError(
        res,
        contentType,
        grpc.status.UNIMPLEMENTED,
        "Browser gRPC-Web does not support client-streaming or bidirectional RPCs.",
      );
      return;
    }
    if (route.definition.responseStream && !contentType.text) {
      writeGrpcWebError(res, contentType, grpc.status.UNIMPLEMENTED, "Server streaming requires grpcwebtext mode.");
      return;
    }
    if (context.activeCalls.size >= context.config.maxConcurrentStreams) {
      writeGrpcWebError(
        res,
        contentType,
        grpc.status.RESOURCE_EXHAUSTED,
        "The gRPC-Web concurrent stream limit has been reached.",
      );
      return;
    }

    let request;
    try {
      const body = await readBody(req, context.config.maxRequestBytes * (contentType.text ? 2 : 1));
      const payload = decodeGrpcWebRequestBody(body, contentType.text, context.config.maxRequestBytes);
      request = route.definition.requestDeserialize(payload);
    } catch (error) {
      writeGrpcWebError(
        res,
        contentType,
        grpc.status.INVALID_ARGUMENT,
        error?.message || "Invalid gRPC-Web request body.",
      );
      return;
    }

    const metadata = requestHeadersToMetadata(req.headers);
    const timeoutMs = parseGrpcTimeout(req.headers?.["grpc-timeout"]);
    const callOptions = timeoutMs ? { deadline: new Date(Date.now() + timeoutMs) } : {};
    const client = new route.GenericClient(bridgeTargetFor(context.bridgeTarget), grpc.credentials.createInsecure(), {
      "grpc.max_receive_message_length": 100 * 1024 * 1024,
      "grpc.max_send_message_length": 100 * 1024 * 1024,
    });
    context.clients.add(client);
    const callContext = { call: null };
    context.activeCalls.add(callContext);
    const started = Date.now();
    context.onLog({
      kind: "call",
      behavior: "grpc-web",
      status: "STARTED",
      method: route.methodKey,
      message: `${req.httpVersion === "2.0" ? "HTTP/2" : `HTTP/${req.httpVersion || "1.1"}`} browser call started.`,
    });

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      context.activeCalls.delete(callContext);
      context.clients.delete(client);
      try {
        client.close();
      } catch {
        /* ignore */
      }
    };
    const cancel = () => {
      try {
        callContext.call?.cancel?.();
      } catch {
        /* ignore */
      }
    };
    req.once("aborted", cancel);
    res.once("close", () => {
      if (!res.writableEnded) cancel();
    });

    if (route.definition.responseStream) {
      proxyServerStream({
        context,
        req,
        res,
        route,
        contentType,
        request,
        metadata,
        callOptions,
        client,
        callContext,
        finish,
        started,
      });
      return;
    }
    proxyUnary({
      context,
      req,
      res,
      route,
      contentType,
      request,
      metadata,
      callOptions,
      client,
      callContext,
      finish,
      started,
    });
  };
}

function proxyUnary(params) {
  let initialMetadata = null;
  let finalStatus = null;
  let call;
  try {
    call = params.client[params.route.handlerName](
      params.request,
      params.metadata,
      params.callOptions,
      (error, response) => {
        if (error) {
          writeGrpcWebResponse(
            params.res,
            params.contentType,
            [],
            Number(error.code ?? grpc.status.UNKNOWN),
            error.details || error.message,
            metadataToRecord(error.metadata || finalStatus?.metadata || initialMetadata),
          );
          params.context.onLog({
            kind: "call",
            behavior: "grpc-web",
            method: params.route.methodKey,
            status: statusName(error.code),
            durationMs: Date.now() - params.started,
            message: error.details || error.message,
          });
          params.finish();
          return;
        }
        let payload;
        try {
          payload = params.route.definition.responseSerialize(response);
        } catch (serializeError) {
          writeGrpcWebResponse(
            params.res,
            params.contentType,
            [],
            grpc.status.INTERNAL,
            serializeError?.message || "Response serialization failed.",
          );
          params.finish();
          return;
        }
        writeGrpcWebResponse(
          params.res,
          params.contentType,
          [payload],
          grpc.status.OK,
          "",
          metadataToRecord(finalStatus?.metadata || initialMetadata),
        );
        params.context.onLog({
          kind: "call",
          behavior: "grpc-web",
          method: params.route.methodKey,
          status: "OK",
          durationMs: Date.now() - params.started,
          message: "Unary browser response completed.",
        });
        params.finish();
      },
    );
  } catch (error) {
    writeGrpcWebResponse(
      params.res,
      params.contentType,
      [],
      Number(error?.code ?? grpc.status.INTERNAL),
      error?.details || error?.message || "Unable to start unary browser call.",
    );
    params.context.onLog({
      kind: "call",
      behavior: "grpc-web",
      method: params.route.methodKey,
      status: statusName(error?.code ?? grpc.status.INTERNAL),
      durationMs: Date.now() - params.started,
      message: error?.details || error?.message || "Unable to start unary browser call.",
    });
    params.finish();
    return;
  }
  params.callContext.call = call;
  call.on("metadata", (value) => {
    initialMetadata = value;
  });
  call.on("status", (value) => {
    finalStatus = value;
  });
}

function proxyServerStream(params) {
  let settled = false;
  let initialMetadata = null;
  let finalStatus = null;
  startGrpcWebResponse(params.res, params.contentType, {});
  let call;
  try {
    call = params.client[params.route.handlerName](params.request, params.metadata, params.callOptions);
  } catch (error) {
    const status = Number(error?.code ?? grpc.status.INTERNAL);
    const message = error?.details || error?.message || "Unable to start browser server stream.";
    writeGrpcWebFrame(params.res, params.contentType, encodeTrailerFrame(status, message));
    params.res.end();
    params.context.onLog({
      kind: "call",
      behavior: "grpc-web",
      method: params.route.methodKey,
      status: statusName(status),
      durationMs: Date.now() - params.started,
      message,
    });
    params.finish();
    return;
  }
  params.callContext.call = call;
  call.on("metadata", (value) => {
    initialMetadata = value;
  });
  call.on("status", (value) => {
    finalStatus = value;
  });
  call.on("data", (message) => {
    try {
      const frame = encodeDataFrame(params.route.definition.responseSerialize(message));
      if (!writeGrpcWebFrame(params.res, params.contentType, frame)) {
        call.pause?.();
        params.res.once("drain", () => call.resume?.());
      }
    } catch (error) {
      call.cancel?.();
      finalize(grpc.status.INTERNAL, error?.message || "Streaming response serialization failed.");
    }
  });
  call.on("error", (error) =>
    finalize(Number(error.code ?? grpc.status.UNKNOWN), error.details || error.message, error.metadata),
  );
  call.on("end", () =>
    finalize(
      Number(finalStatus?.code ?? grpc.status.OK),
      finalStatus?.details || "",
      finalStatus?.metadata || initialMetadata,
    ),
  );

  function finalize(status, message, metadata) {
    if (settled) return;
    settled = true;
    writeGrpcWebFrame(params.res, params.contentType, encodeTrailerFrame(status, message, metadataToRecord(metadata)));
    params.res.end();
    params.context.onLog({
      kind: "call",
      behavior: "grpc-web",
      method: params.route.methodKey,
      status: statusName(status),
      durationMs: Date.now() - params.started,
      message: message || "Server stream completed.",
    });
    params.finish();
  }
}

/**
 * Writes one complete gRPC-Web frame immediately. Text mode deliberately uses
 * an independently padded Base64 entity per frame. A continuous Base64 encoder
 * can retain the last 1-2 bytes of a frame until the next message arrives, which
 * makes low-frequency browser streams appear delayed or batched.
 */
function writeGrpcWebFrame(res, contentType, frame) {
  const chunk = contentType.text ? encodeGrpcWebTextFrame(frame) : frame;
  return res.write(chunk);
}

function writeGrpcWebResponse(res, contentType, payloads, status, message, metadata = {}) {
  startGrpcWebResponse(res, contentType, metadata);
  const frames = [...payloads.map(encodeDataFrame), encodeTrailerFrame(status, message, metadata)];
  if (contentType.text) {
    const encoder = new GrpcWebTextEncoder();
    for (const frame of frames) {
      const chunk = encoder.push(frame);
      if (chunk) res.write(chunk);
    }
    const final = encoder.flush();
    if (final) res.write(final);
  } else {
    for (const frame of frames) res.write(frame);
  }
  res.end();
}

function writeGrpcWebError(res, contentType, status, message) {
  writeGrpcWebResponse(res, contentType, [], status, message);
}

function startGrpcWebResponse(res, contentType, metadata) {
  if (res.headersSent) return;
  const headers = {
    "content-type": contentType.responseContentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-accel-buffering": "no",
    "grpc-accept-encoding": "identity",
    "x-grpc-web": "1",
  };
  for (const [key, value] of Object.entries(metadata || {})) {
    const lower = String(key).toLowerCase();
    if (
      !lower ||
      lower.startsWith(":") ||
      hopByHopHeaders.has(lower) ||
      lower === "grpc-status" ||
      lower === "grpc-message"
    )
      continue;
    if (lower.endsWith("-bin")) {
      const first = Array.isArray(value) ? value[0] : value;
      headers[lower] = Buffer.from(first).toString("base64");
    } else {
      headers[lower] = Array.isArray(value) ? value.join(", ") : String(value);
    }
  }
  res.writeHead(200, headers);
  res.socket?.setNoDelay?.(true);
  res.flushHeaders?.();
}

function requestHeadersToMetadata(headers) {
  const metadata = new grpc.Metadata();
  for (const [key, rawValue] of Object.entries(headers || {})) {
    const lower = String(key).toLowerCase();
    if (
      !lower ||
      lower.startsWith(":") ||
      hopByHopHeaders.has(lower) ||
      protocolHeaders.has(lower) ||
      lower.startsWith("access-control-")
    )
      continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value === undefined || value === null) continue;
      try {
        metadata.add(lower, lower.endsWith("-bin") ? Buffer.from(String(value), "base64") : String(value));
      } catch {
        /* invalid metadata is omitted */
      }
    }
  }
  return metadata;
}

function metadataToRecord(metadata) {
  if (!metadata) return {};
  const source = typeof metadata.getMap === "function" ? metadata.getMap() : metadata;
  const output = {};
  for (const [key, value] of Object.entries(source || {})) output[String(key).toLowerCase()] = value;
  return output;
}

function applyCors(config, origin, req, res) {
  const allowedOrigin = resolveAllowedOrigin(origin, config.cors.allowedOrigins, config.cors.allowCredentials);
  if (origin && !allowedOrigin) return false;
  if (allowedOrigin) res.setHeader("access-control-allow-origin", allowedOrigin);
  if (origin) res.setHeader("vary", "Origin");
  if (config.cors.allowCredentials) res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  const requestedHeaders = String(req.headers?.["access-control-request-headers"] || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const configuredHeaders = new Set(config.cors.allowedHeaders);
  if (requestedHeaders.some((header) => !configuredHeaders.has("*") && !configuredHeaders.has(header))) return false;
  res.setHeader("access-control-allow-headers", config.cors.allowedHeaders.join(", "));
  res.setHeader("access-control-expose-headers", config.cors.exposedHeaders.join(", "));
  res.setHeader("access-control-max-age", String(config.cors.maxAgeSeconds));
  return true;
}

function resolveAllowedOrigin(origin, allowedOrigins, allowCredentials) {
  if (!origin) return "";
  if (allowedOrigins.includes(origin)) return origin;
  if (allowedOrigins.includes("*")) return allowCredentials ? origin : "*";
  return "";
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let exceeded = false;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        exceeded = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () =>
      exceeded
        ? reject(new Error("gRPC-Web request body exceeds the configured limit."))
        : resolve(Buffer.concat(chunks)),
    );
    req.on("error", reject);
  });
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    try {
      server.close(finish);
      try {
        server.closeIdleConnections?.();
      } catch {
        /* ignore */
      }
      try {
        server.closeAllConnections?.();
      } catch {
        /* ignore */
      }
      setTimeout(finish, 600);
    } catch {
      finish();
    }
  });
}

function readRequiredFile(file, label) {
  if (!file) throw new Error(`${label} path is required.`);
  try {
    return fs.readFileSync(path.resolve(file));
  } catch (error) {
    throw new Error(`${label} could not be read: ${error?.message || error}`);
  }
}

function joinCertificateChain(certificate, chain) {
  if (!chain?.length) return certificate;
  const separator =
    certificate.length && certificate[certificate.length - 1] === 0x0a ? Buffer.alloc(0) : Buffer.from("\n");
  return Buffer.concat([certificate, separator, chain]);
}

function readOptionalFile(file) {
  if (!file) return null;
  try {
    return fs.readFileSync(path.resolve(file));
  } catch {
    return null;
  }
}

function bridgeTargetFor(target) {
  return String(target || "").replace(/^grpcs?:\/\//i, "");
}

function displayHost(host) {
  if (host === "0.0.0.0" || host === "::") return "127.0.0.1";
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function normalizeHost(value) {
  const host = String(value || "127.0.0.1").trim();
  return host || "127.0.0.1";
}

function normalizePort(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 && number <= 65535 ? number : fallback;
}

function clampInteger(value, fallback, minimum, maximum) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item).trim()).filter(Boolean))];
}

function uniqueLowercase(values) {
  return [
    ...new Set((Array.isArray(values) ? values : []).map((item) => String(item).trim().toLowerCase()).filter(Boolean)),
  ];
}

function statusName(value) {
  return Object.entries(grpc.status).find(([, code]) => code === Number(value))?.[0] || String(value);
}

module.exports = {
  normalizeGrpcWebConfig,
  startGrpcWebProxy,
  stopGrpcWebProxy,
};
