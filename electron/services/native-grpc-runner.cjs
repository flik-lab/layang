"use strict";

const fs = require("node:fs/promises");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { writeProtoWorkspace } = require("../utils/file-utils.cjs");
const { safeRelativePath } = require("../utils/path-utils.cjs");

/**
 * Invokes native gRPC through @grpc/grpc-js and streams normalized events back to the renderer.
 */
async function invokeNativeGrpc(payload, emit = () => undefined, registerCall = () => undefined) {
  validatePayload(payload);

  if (payload.method.requestStream) {
    throw new Error(
      "Native gRPC client streaming and bidirectional streaming are not implemented in this desktop MVP. Unary and server streaming are supported.",
    );
  }

  const startedTimestamp = new Date();
  const startedAt = Date.now();

  emit({
    type: "log",
    level: "info",
    message: "Native gRPC request prepared",
    details: {
      targetUrl: payload.targetUrl,
      service: payload.method.serviceName,
      method: payload.method.methodName,
      mode: payload.method.responseStream ? "server-streaming" : "unary",
    },
  });
  const workspaceDir = await writeProtoWorkspace(payload.protoFiles);

  try {
    const rootProtoFiles = payload.protoFiles.map((file) => safeRelativePath(file.name));
    const packageDefinition = protoLoader.loadSync(rootProtoFiles, {
      includeDirs: [workspaceDir],
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const loadedPackage = grpc.loadPackageDefinition(packageDefinition);
    const ServiceCtor = getByDottedPath(loadedPackage, payload.method.serviceName);

    if (typeof ServiceCtor !== "function") {
      throw new Error(`Service constructor not found: ${payload.method.serviceName}`);
    }

    const target = normalizeNativeTarget(payload.targetUrl);
    const credentials = target.secure ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();

    const client = new ServiceCtor(target.address, credentials, {
      "grpc.max_receive_message_length": 50 * 1024 * 1024,
      "grpc.max_send_message_length": 50 * 1024 * 1024,
    });

    const clientMethodName = findClientMethodName(client, payload.method.methodName);
    const metadata = metadataPairsToGrpcMetadata(payload.metadata || []);
    const deadlineMs = Number(payload.deadlineMs || 0);
    const callOptions = deadlineMs > 0 ? { deadline: new Date(Date.now() + Math.max(1, deadlineMs)) } : {};
    const maxMessages = normalizeMaxMessages(payload.maxMessages);

    emit({
      type: "log",
      level: "info",
      message: "Native gRPC client connected",
      details: {
        target: target.address,
        secure: target.secure,
        deadlineMs: deadlineMs > 0 ? deadlineMs : null,
        maxMessages,
      },
    });

    const result = payload.method.responseStream
      ? await invokeServerStreaming(
          client,
          clientMethodName,
          payload.requestJson,
          metadata,
          callOptions,
          emit,
          registerCall,
          maxMessages,
        )
      : await invokeUnary(
          client,
          clientMethodName,
          payload.requestJson,
          metadata,
          callOptions,
          emit,
          registerCall,
          maxMessages,
        );

    closeClient(client);

    const summary = {
      httpStatus: 0,
      headers: result.headers,
      trailers: result.trailers,
      messages: result.messages,
      totalMessages: result.totalMessages,
      droppedMessages: result.droppedMessages,
      durationMs: Date.now() - startedAt,
      requestUrl: `${target.address}/${payload.method.serviceName}/${payload.method.methodName}`,
      startedAt: startedTimestamp.toISOString(),
      completedAt: new Date().toISOString(),
      transport: "native-grpc",
    };

    emit({
      type: "log",
      level: summary.trailers["grpc-status"] === "0" ? "info" : "error",
      message: "Native gRPC request completed",
      details: {
        durationMs: summary.durationMs,
        messages: summary.totalMessages,
        storedMessages: summary.messages.length,
        droppedMessages: summary.droppedMessages,
        grpcStatus: summary.trailers["grpc-status"],
        grpcMessage: summary.trailers["grpc-message"],
      },
    });
    emit({ type: "end", summary });
    return summary;
  } catch (error) {
    emit({
      type: "error",
      message: "Native gRPC request failed before completion",
      details: errorToPlainObject(error),
    });
    throw error;
  } finally {
    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Normalizes the maximum message capture limit.
 */
function normalizeMaxMessages(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 500;
  return Math.max(1, Math.floor(numeric));
}

/**
 * Validates the renderer payload before native gRPC execution.
 */
function validatePayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Missing native gRPC payload.");
  if (!payload.targetUrl || typeof payload.targetUrl !== "string") throw new Error("Native gRPC target is required.");
  if (!payload.method || typeof payload.method !== "object") throw new Error("RPC method metadata is required.");
  if (!Array.isArray(payload.protoFiles) || payload.protoFiles.length === 0)
    throw new Error("At least one proto file is required.");
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
 * Finds the generated grpc-js client method for a proto method name.
 */
function findClientMethodName(client, protoMethodName) {
  const lowerCamel = protoMethodName.charAt(0).toLowerCase() + protoMethodName.slice(1);
  const candidates = [protoMethodName, lowerCamel];

  for (const candidate of candidates) {
    if (typeof client[candidate] === "function") return candidate;
  }

  const available = Object.keys(client).filter((key) => typeof client[key] === "function");
  const caseInsensitive = available.find((key) => key.toLowerCase() === protoMethodName.toLowerCase());
  if (caseInsensitive) return caseInsensitive;

  throw new Error(`RPC method not found on native client: ${protoMethodName}. Available: ${available.join(", ")}`);
}

/**
 * Normalizes native gRPC target URLs into grpc-js host strings and TLS mode.
 */
function normalizeNativeTarget(rawTarget) {
  const raw = String(rawTarget || "")
    .trim()
    .replace(/\/+$/, "");
  const secure = raw.startsWith("grpcs://") || raw.startsWith("https://");
  const withoutScheme = raw.replace(/^(grpcs|grpc|https|http):\/\//, "");
  const address = withoutScheme.split("/")[0];

  if (!address?.includes(":")) {
    throw new Error(
      "Native gRPC target must be host:port, grpc://host:port, grpcs://host:port, http://host:port, or https://host:port. Do not include a gRPC-Web proxy path.",
    );
  }

  return { address, secure };
}

/**
 * Converts UI metadata pairs into grpc-js Metadata.
 */
function metadataPairsToGrpcMetadata(pairs) {
  const metadata = new grpc.Metadata();

  for (const pair of pairs) {
    const key = String(pair.key || "")
      .trim()
      .toLowerCase();
    const value = String(pair.value || "").trim();
    if (!key) continue;

    if (key.endsWith("-bin")) {
      metadata.add(key, Buffer.from(value, "base64"));
    } else {
      metadata.add(key, value);
    }
  }

  return metadata;
}

/**
 * Converts grpc-js Metadata into a serializable object.
 */
function metadataToRecord(metadata) {
  const output = {};
  if (!metadata || typeof metadata.getMap !== "function") return output;

  const map = metadata.getMap();
  for (const [key, value] of Object.entries(map)) {
    output[key] = Buffer.isBuffer(value) ? value.toString("base64") : String(value);
  }

  return output;
}

/**
 * Converts grpc-js status objects into gRPC trailer fields.
 */
function statusToTrailers(status) {
  return {
    ...metadataToRecord(status?.metadata),
    "grpc-status": String(status && typeof status.code === "number" ? status.code : grpc.status.UNKNOWN),
    "grpc-message": status?.details ? String(status.details) : "",
  };
}

/**
 * Converts thrown native gRPC errors into serializable trailer fields.
 */
function errorToTrailers(error) {
  return {
    ...metadataToRecord(error?.metadata),
    "grpc-status": String(typeof error.code === "number" ? error.code : grpc.status.UNKNOWN),
    "grpc-message": error?.details
      ? String(error.details)
      : error?.message
        ? String(error.message)
        : "Native gRPC error",
  };
}

/**
 * Invokes a native unary RPC and captures headers, message, trailers, and duration.
 */
function invokeUnary(
  client,
  methodName,
  requestJson,
  metadata,
  callOptions,
  emit = () => undefined,
  registerCall = () => undefined,
  maxMessages = 500,
) {
  return new Promise((resolve) => {
    let headers = {};
    let trailers = {};

    emit({ type: "log", level: "info", message: "Native unary call started", details: { methodName } });

    const call = client[methodName](requestJson, metadata, callOptions, (error, response) => {
      if (error) {
        emit({ type: "error", message: "Native unary call failed", details: errorToPlainObject(error) });
        resolve({
          headers,
          trailers: { ...trailers, ...errorToTrailers(error) },
          messages: [],
          totalMessages: 0,
          droppedMessages: 0,
        });
        return;
      }

      if (!trailers["grpc-status"]) {
        trailers = { ...trailers, "grpc-status": String(grpc.status.OK), "grpc-message": "" };
      }

      const messages = [];
      let totalMessages = 0;
      let droppedMessages = 0;
      if (response !== undefined) {
        totalMessages = 1;
        if (maxMessages > 0) {
          messages.push(response);
          emit({ type: "message", index: 0, value: response });
          emit({
            type: "log",
            level: "info",
            message: "Native unary response decoded",
            details: { messageIndex: 0, storedMessages: messages.length },
          });
        } else {
          droppedMessages = 1;
        }
      }

      emit({ type: "trailers", trailers });
      resolve({ headers, trailers, messages, totalMessages, droppedMessages });
    });

    registerCall(call, client);

    call.on("metadata", (metadataEvent) => {
      headers = metadataToRecord(metadataEvent);
      emit({ type: "headers", httpStatus: 0, headers, contentType: "application/grpc" });
      emit({ type: "log", level: "info", message: "Native gRPC metadata received", details: headers });
    });

    call.on("status", (status) => {
      trailers = statusToTrailers(status);
      emit({ type: "trailers", trailers });
      emit({
        type: trailers["grpc-status"] === "0" ? "log" : "error",
        level: trailers["grpc-status"] === "0" ? "info" : "error",
        message:
          trailers["grpc-status"] === "0"
            ? "Native gRPC status OK"
            : `Native gRPC error ${trailers["grpc-status"]}: ${trailers["grpc-message"]}`,
        details: { status, trailers },
      });
    });
  });
}

/**
 * Invokes a native server-streaming RPC and captures messages until completion or cancellation.
 */
function invokeServerStreaming(
  client,
  methodName,
  requestJson,
  metadata,
  callOptions,
  emit = () => undefined,
  registerCall = () => undefined,
  maxMessages = 500,
) {
  return new Promise((resolve) => {
    let headers = {};
    let trailers = {};
    const messages = [];
    let totalMessages = 0;
    let droppedMessages = 0;
    let warnedLimit = false;
    let resolved = false;

    /**
     * Completes a native stream exactly once.
     */
    function finish(finalTrailers) {
      if (resolved) return;
      resolved = true;
      resolve({
        headers,
        trailers: finalTrailers || trailers || { "grpc-status": String(grpc.status.OK), "grpc-message": "" },
        messages,
        totalMessages,
        droppedMessages,
      });
    }

    emit({ type: "log", level: "info", message: "Native server stream started", details: { methodName } });

    const call = client[methodName](requestJson, metadata, callOptions);
    registerCall(call, client);

    call.on("metadata", (metadataEvent) => {
      headers = metadataToRecord(metadataEvent);
      emit({ type: "headers", httpStatus: 0, headers, contentType: "application/grpc" });
      emit({ type: "log", level: "info", message: "Native gRPC metadata received", details: headers });
    });

    call.on("data", (message) => {
      totalMessages += 1;
      if (maxMessages > 0 && messages.length >= maxMessages) {
        droppedMessages += 1;
        messages.shift();
        if (!warnedLimit) {
          warnedLimit = true;
          emit({
            type: "log",
            level: "warn",
            message: "Message capture limit reached; older stream messages are replaced while the stream continues.",
            details: { maxMessages },
          });
        }
      }

      messages.push(message);
      emit({ type: "message", index: totalMessages - 1, value: message });
      emit({
        type: "log",
        level: "info",
        message: `Native stream message #${totalMessages} received`,
        details: { messageIndex: totalMessages - 1, storedMessages: messages.length, droppedMessages },
      });
    });

    call.on("status", (status) => {
      trailers = statusToTrailers(status);
      emit({ type: "trailers", trailers });
      emit({
        type: trailers["grpc-status"] === "0" ? "log" : "error",
        level: trailers["grpc-status"] === "0" ? "info" : "error",
        message:
          trailers["grpc-status"] === "0"
            ? "Native stream status OK"
            : `Native stream error ${trailers["grpc-status"]}: ${trailers["grpc-message"]}`,
        details: { status, trailers },
      });
      finish(trailers);
    });

    call.on("error", (error) => {
      const errorTrailers = errorToTrailers(error);
      emit({
        type: "error",
        message: `Native stream error ${errorTrailers["grpc-status"]}: ${errorTrailers["grpc-message"]}`,
        details: errorToPlainObject(error),
      });
      emit({ type: "trailers", trailers: errorTrailers });
      finish(errorTrailers);
    });

    call.on("end", () => {
      if (!trailers["grpc-status"]) {
        trailers = { ...trailers, "grpc-status": String(grpc.status.OK), "grpc-message": "" };
      }
      finish(trailers);
    });
  });
}

/**
 * Converts an unknown error into a plain serializable object.
 */
function errorToPlainObject(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details,
      metadata: metadataToRecord(error.metadata),
    };
  }
  return error;
}

/**
 * Closes a grpc-js client without throwing during cleanup.
 */
function closeClient(client) {
  if (client && typeof client.close === "function") {
    client.close();
  }
}

/**
 * Starts a local native gRPC mock server from loaded proto metadata and scenario files.
 */

module.exports = { invokeNativeGrpc };
