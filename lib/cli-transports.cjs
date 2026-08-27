"use strict";

const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { resolveProtoFilesForRunItem } = require("./cli-workspace.cjs");
const { buildRestRequest, buildGrpcInput, buildWebSocketInput, parseJsonLoose } = require("./cli-runtime-core.cjs");
const { encodeDataFrame, parseFrames } = require("./grpc-web-protocol.cjs");

async function executeRunItem(workspace, item, options = {}) {
  if (item.requestKind === "rest") return invokeRest(workspace, item, options);
  if (item.requestKind === "websocket" || item.transportMode === "websocket" || options.transport === "websocket") {
    return invokeWebSocket(workspace, item, options);
  }
  if (options.transport === "grpc-web" || item.transportMode === "grpc-web") {
    return invokeGrpcWeb(workspace, item, options);
  }
  return invokeNativeGrpc(workspace, item, options);
}

async function invokeRest(workspace, item, options) {
  const request = buildRestRequest(item, workspace, options);
  if (!/^https?:\/\//i.test(request.url))
    throw new Error(`Invalid REST URL for ${item.title}: ${request.url || "missing URL"}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Number(options.timeoutMs || 30_000)));
  const started = Date.now();
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      /* retain text */
    }
    return {
      transport: "rest",
      transportOk: true,
      statusCode: response.ok ? 0 : response.status,
      statusMessage: `${response.status} ${response.statusText}`.trim(),
      httpStatus: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      trailers: {},
      durationMs: Date.now() - started,
      messages: [payload],
      totalMessages: 1,
      requestUrl: request.url,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`REST request timed out after ${options.timeoutMs} ms.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadGrpcMethod(workspace, item) {
  let grpc;
  let protoLoader;
  try {
    grpc = require("@grpc/grpc-js");
    protoLoader = require("@grpc/proto-loader");
  } catch {
    throw new Error(
      "Native gRPC and gRPC-Web CLI execution require @grpc/grpc-js and @grpc/proto-loader. Run pnpm install first.",
    );
  }
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "layang-cli-proto-"));
  try {
    const rootFiles = [];
    for (const protoFile of resolveProtoFilesForRunItem(workspace, item)) {
      const relative = safeRelativePath(protoFile.name || "schema.proto");
      const filePath = path.join(tmpDir, relative);
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, String(protoFile.text || ""), "utf8");
      rootFiles.push(relative);
    }
    if (!rootFiles.length) throw new Error("No proto files found to load.");
    const packageDefinition = protoLoader.loadSync(rootFiles, {
      includeDirs: [tmpDir],
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const loadedPackage = grpc.loadPackageDefinition(packageDefinition);
    const [serviceName, methodName] = splitMethodKey(item.methodKey);
    const ServiceCtor = getByDottedPath(loadedPackage, serviceName);
    if (!ServiceCtor?.service) throw new Error(`Service ${serviceName} was not found in loaded proto files.`);
    const methodDefinitionKey = findServiceDefinitionKey(ServiceCtor.service, methodName);
    const definition = ServiceCtor.service[methodDefinitionKey];
    if (!definition) throw new Error(`Method ${item.methodKey} was not found in loaded proto files.`);
    return {
      grpc,
      tmpDir,
      ServiceCtor,
      methodDefinitionKey,
      definition,
      cleanup: () => fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined),
    };
  } catch (error) {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function invokeNativeGrpc(workspace, item, options) {
  const loaded = await loadGrpcMethod(workspace, item);
  const { grpc, ServiceCtor, methodDefinitionKey, definition } = loaded;
  try {
    const input = buildGrpcInput(item, workspace, options);
    const requestValue = parseRequestJson(input.requestText);
    const flagMessages =
      Array.isArray(options.messages) && options.messages.length
        ? options.messages.map((message, index) => {
            try {
              return JSON.parse(String(message));
            } catch (error) {
              throw new Error(`Client stream message ${index + 1} is not valid JSON: ${error.message}`);
            }
          })
        : null;
    const requestMessages = normalizeClientStreamMessages(flagMessages || requestValue, definition.requestStream);
    const targetInput = options.target || item.target || "localhost:50051";
    const target = stripGrpcScheme(targetInput);
    const credentials = isSecureTarget(targetInput) ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
    const client = new ServiceCtor(target, credentials, {
      "grpc.max_receive_message_length": 50 * 1024 * 1024,
      "grpc.max_send_message_length": 50 * 1024 * 1024,
    });
    const metadata = createGrpcMetadata(grpc, input.metadata);
    const callOptions = { deadline: new Date(Date.now() + Math.max(1, Number(options.timeoutMs || 30_000))) };
    if (definition.requestStream && definition.responseStream) {
      return await invokeBidi(client, methodDefinitionKey, requestMessages, metadata, callOptions, options);
    }
    if (definition.requestStream) {
      return await invokeClientStream(client, methodDefinitionKey, requestMessages, metadata, callOptions, options);
    }
    if (definition.responseStream) {
      return await invokeServerStream(
        client,
        methodDefinitionKey,
        requestMessages[0] || {},
        metadata,
        callOptions,
        options.maxMessages,
      );
    }
    return await invokeUnary(client, methodDefinitionKey, requestMessages[0] || {}, metadata, callOptions);
  } finally {
    await loaded.cleanup();
  }
}

function normalizeClientStreamMessages(value, requestStream) {
  if (!requestStream) return [Array.isArray(value) ? (value[0] ?? {}) : (value ?? {})];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.messages)) return value.messages;
  return [value ?? {}];
}

function invokeUnary(client, methodName, request, metadata, callOptions) {
  return new Promise((resolve) => {
    const started = Date.now();
    let headers = {};
    let trailers = {};
    const call = client[methodName](request, metadata, callOptions, (error, response) => {
      closeClient(client);
      if (error) {
        const errorTrailers = metadataToRecord(error.metadata);
        resolve(normalizeGrpcResult(started, error.code, error.details || error.message, [], headers, errorTrailers));
        return;
      }
      resolve(normalizeGrpcResult(started, 0, "OK", [response], headers, trailers));
    });
    call.on?.("metadata", (value) => {
      headers = metadataToRecord(value);
    });
    call.on?.("status", (value) => {
      trailers = statusToTrailers(value);
    });
  });
}

function invokeServerStream(client, methodName, request, metadata, callOptions, maxMessages = 500) {
  return new Promise((resolve) => {
    const started = Date.now();
    const messages = [];
    let totalMessages = 0;
    let headers = {};
    let trailers = {};
    let settled = false;
    const call = client[methodName](request, metadata, callOptions);
    const finish = (code = 0, message = "OK") => {
      if (settled) return;
      settled = true;
      closeClient(client);
      resolve(normalizeGrpcResult(started, code, message, messages, headers, trailers, totalMessages));
    };
    call.on("metadata", (value) => {
      headers = metadataToRecord(value);
    });
    call.on("data", (message) => {
      totalMessages += 1;
      if (messages.length >= maxMessages) messages.shift();
      messages.push(message);
      if (totalMessages >= maxMessages && optionsCancelAtLimit(call)) call.cancel();
    });
    call.on("status", (status) => {
      trailers = statusToTrailers(status);
      finish(Number(status?.code || 0), status?.details || "OK");
    });
    call.on("error", (error) => {
      trailers = {
        ...trailers,
        ...metadataToRecord(error.metadata),
        "grpc-status": String(error.code ?? 2),
        "grpc-message": error.details || error.message || "",
      };
      const cancelledAtLimit = Number(error.code) === 1 && totalMessages >= maxMessages;
      finish(
        cancelledAtLimit ? 0 : Number(error.code || 2),
        cancelledAtLimit ? "OK (capture limit reached)" : error.details || error.message,
      );
    });
    call.on("end", () => finish(Number(trailers["grpc-status"] || 0), trailers["grpc-message"] || "OK"));
  });
}

function optionsCancelAtLimit(call) {
  return call && typeof call.cancel === "function" && !call.cancelled;
}

function invokeClientStream(client, methodName, messages, metadata, callOptions, options) {
  return new Promise((resolve) => {
    const started = Date.now();
    let headers = {};
    let trailers = {};
    const call = client[methodName](metadata, callOptions, (error, response) => {
      closeClient(client);
      if (error) {
        trailers = { ...trailers, ...metadataToRecord(error.metadata) };
        resolve(
          normalizeGrpcResult(started, Number(error.code || 2), error.details || error.message, [], headers, trailers),
        );
        return;
      }
      resolve(normalizeGrpcResult(started, 0, "OK", [response], headers, trailers));
    });
    call.on?.("metadata", (value) => {
      headers = metadataToRecord(value);
    });
    call.on?.("status", (value) => {
      trailers = statusToTrailers(value);
    });
    void writeClientMessages(call, messages, options.messageDelayMs).catch((error) => call.destroy?.(error));
  });
}

function invokeBidi(client, methodName, requestMessages, metadata, callOptions, options) {
  return new Promise((resolve) => {
    const started = Date.now();
    const messages = [];
    let totalMessages = 0;
    let headers = {};
    let trailers = {};
    let settled = false;
    const maxMessages = Math.max(1, Number(options.maxMessages || 500));
    const call = client[methodName](metadata, callOptions);
    const finish = (code = 0, message = "OK") => {
      if (settled) return;
      settled = true;
      closeClient(client);
      resolve(normalizeGrpcResult(started, code, message, messages, headers, trailers, totalMessages));
    };
    call.on("metadata", (value) => {
      headers = metadataToRecord(value);
    });
    call.on("data", (message) => {
      totalMessages += 1;
      if (messages.length >= maxMessages) messages.shift();
      messages.push(message);
    });
    call.on("status", (value) => {
      trailers = statusToTrailers(value);
      finish(Number(value?.code || 0), value?.details || "OK");
    });
    call.on("error", (error) => {
      trailers = {
        ...trailers,
        ...metadataToRecord(error.metadata),
        "grpc-status": String(error.code ?? 2),
        "grpc-message": error.details || error.message || "",
      };
      finish(Number(error.code || 2), error.details || error.message);
    });
    call.on("end", () => finish(Number(trailers["grpc-status"] || 0), trailers["grpc-message"] || "OK"));
    void writeClientMessages(call, requestMessages, options.messageDelayMs).catch((error) => call.destroy?.(error));
  });
}

async function writeClientMessages(call, messages, delayMs = 0) {
  for (const message of messages) {
    if (call.destroyed || call.cancelled) break;
    await new Promise((resolve, reject) => {
      const accepted = call.write(message, (error) => (error ? reject(error) : resolve()));
      if (!accepted) call.once("drain", resolve);
    });
    if (delayMs > 0) await sleep(delayMs);
  }
  call.end();
}

function normalizeGrpcResult(started, code, message, messages, headers, trailers, totalMessages) {
  const normalizedTrailers = {
    ...(trailers || {}),
    "grpc-status": String(code ?? 0),
    "grpc-message": String(message || ""),
  };
  return {
    transport: "native-grpc",
    transportOk: true,
    statusCode: Number(code || 0),
    statusMessage: message || (Number(code || 0) === 0 ? "OK" : "gRPC error"),
    httpStatus: 0,
    headers: headers || {},
    trailers: normalizedTrailers,
    durationMs: Date.now() - started,
    messages,
    totalMessages: totalMessages ?? messages.length,
  };
}

async function invokeGrpcWeb(workspace, item, options) {
  const loaded = await loadGrpcMethod(workspace, item);
  try {
    const { definition } = loaded;
    if (definition.requestStream) {
      throw new Error(
        "gRPC-Web does not support client-streaming or bidirectional streaming. Use --transport native-grpc for this method.",
      );
    }
    const input = buildGrpcInput(item, workspace, options);
    const request = parseRequestJson(input.requestText);
    const serialized = definition.requestSerialize(request);
    const frame = encodeDataFrame(serialized);
    const target = String(options.target || item.target || "").replace(/\/$/, "");
    if (!/^https?:\/\//i.test(target))
      throw new Error(`gRPC-Web target must be an HTTP(S) URL: ${target || "missing URL"}`);
    const methodPath = String(definition.path || `/${item.methodKey}`).replace(/^\/?/, "/");
    const url = target.endsWith(methodPath) ? target : `${target}${methodPath}`;
    const headers = new Headers({
      "content-type": "application/grpc-web+proto",
      "x-grpc-web": "1",
      "x-user-agent": "layang-cli/1",
      accept: "application/grpc-web+proto",
    });
    for (const pair of input.metadata) headers.append(pair.key, pair.value);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Number(options.timeoutMs || 30_000)));
    const started = Date.now();
    try {
      const response = await fetch(url, { method: "POST", headers, body: frame, signal: controller.signal });
      let bytes = Buffer.from(await response.arrayBuffer());
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("grpc-web-text"))
        bytes = Buffer.from(bytes.toString("ascii").replace(/\s+/g, ""), "base64");
      const frames = parseFrames(bytes);
      const messages = frames
        .filter((entry) => entry.kind === "data")
        .map((entry) => definition.responseDeserialize(entry.payload));
      const trailerFrames = frames.filter((entry) => entry.kind === "trailers");
      const trailers = trailerFrames.length ? trailerFrames[trailerFrames.length - 1].trailers : {};
      const grpcStatus = Number(
        trailers["grpc-status"] ?? response.headers.get("grpc-status") ?? (response.ok ? 0 : 2),
      );
      const grpcMessage = decodeGrpcMessage(
        trailers["grpc-message"] ?? response.headers.get("grpc-message") ?? response.statusText,
      );
      return {
        transport: "grpc-web",
        transportOk: true,
        statusCode: grpcStatus,
        statusMessage: grpcMessage || (grpcStatus === 0 ? "OK" : "gRPC-Web error"),
        httpStatus: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        trailers: { ...trailers, "grpc-status": String(grpcStatus), "grpc-message": grpcMessage || "" },
        durationMs: Date.now() - started,
        messages,
        totalMessages: messages.length,
        requestUrl: url,
      };
    } catch (error) {
      if (error?.name === "AbortError") throw new Error(`gRPC-Web request timed out after ${options.timeoutMs} ms.`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await loaded.cleanup();
  }
}

async function invokeWebSocket(workspace, item, options) {
  const input = buildWebSocketInput(item, workspace, options);
  const url = String(input.url || "").trim();
  if (!/^wss?:\/\//i.test(url)) throw new Error(`Invalid WebSocket URL for ${item.title}: ${url || "missing URL"}`);
  const started = Date.now();
  const messages = [];
  const messageTimestamps = [];
  const maxMessages = Math.max(1, Math.floor(Number(options.maxMessages || 500)));
  const timeoutMs = Math.max(1, Math.floor(Number(options.timeoutMs || 30_000)));
  const waitMs = Math.max(1, Math.floor(Number(options.wsWaitMs || 1_000)));
  const outboundMessages = normalizeOutboundMessages(input.requestText, options.messages);
  const protocols = protocolsFromHeaders(input.headers);

  return await new Promise((resolve) => {
    let settled = false;
    let socket;
    let buffer = Buffer.alloc(0);
    let opened = false;
    let closeCode = 1000;
    let closeReason = "";
    let selectedProtocol = "";
    let captureTimer;
    const finish = (statusCode, statusMessage) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(captureTimer);
      try {
        if (socket && !socket.destroyed) {
          socket.write(buildWebSocketFrame(buildClosePayload(1000, "CLI capture complete"), 0x8));
          socket.end();
        }
      } catch {
        /* cleanup only */
      }
      resolve({
        transport: "websocket",
        transportOk: opened,
        statusCode,
        statusMessage,
        httpStatus: opened ? 101 : 0,
        headers: selectedProtocol ? { "sec-websocket-protocol": selectedProtocol } : {},
        trailers: {},
        closeCode,
        closeReason,
        durationMs: Date.now() - started,
        messages,
        messageTimestamps,
        totalMessages: messages.length,
        requestUrl: url,
      });
    };
    const timeout = setTimeout(
      () => finish(messages.length ? 0 : 2, messages.length ? "OK" : "WebSocket timeout"),
      timeoutMs,
    );
    try {
      const parsed = new URL(url);
      const secure = parsed.protocol === "wss:";
      const port = Number(parsed.port || (secure ? 443 : 80));
      const host = parsed.hostname;
      const requestPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
      const key = crypto.randomBytes(16).toString("base64");
      const headers = [
        `GET ${requestPath} HTTP/1.1`,
        `Host: ${host}${parsed.port ? `:${parsed.port}` : ""}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
      ];
      for (const pair of input.headers) {
        if (String(pair.key).toLowerCase() === "sec-websocket-protocol") continue;
        headers.push(`${pair.key}: ${pair.value}`);
      }
      if (protocols.length) headers.push(`Sec-WebSocket-Protocol: ${protocols.join(", ")}`);
      socket = (secure ? require("node:tls") : require("node:net")).connect(
        secure ? { host, port, servername: host } : { host, port },
        () => socket.write(`${headers.join("\r\n")}\r\n\r\n`),
      );
      let handshake = "";
      socket.on("data", (chunk) => {
        if (settled) return;
        if (!opened) {
          handshake += chunk.toString("binary");
          const end = handshake.indexOf("\r\n\r\n");
          if (end < 0) return;
          const head = handshake.slice(0, end);
          if (!/^HTTP\/1\.1 101\b/.test(head)) return finish(2, head.split("\r\n")[0] || "WebSocket handshake failed");
          opened = true;
          selectedProtocol = head.match(/\r\nsec-websocket-protocol:\s*([^\r\n]+)/i)?.[1]?.trim() || "";
          const rest = Buffer.from(handshake.slice(end + 4), "binary");
          void sendWebSocketMessages(socket, outboundMessages, options.messageDelayMs);
          captureTimer = setTimeout(() => finish(0, "OK"), waitMs);
          if (rest.length) buffer = Buffer.concat([buffer, rest]);
        } else buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 2) {
          const frame = readWebSocketFrame(buffer);
          if (!frame) break;
          buffer = buffer.subarray(frame.frameLength);
          if (frame.opcode === 0x8) {
            if (frame.payload.length >= 2) {
              closeCode = frame.payload.readUInt16BE(0);
              closeReason = frame.payload.subarray(2).toString("utf8");
            }
            finish(closeCode >= 1000 && closeCode < 4000 ? 0 : 2, closeReason || "WebSocket closed");
            return;
          }
          if (frame.opcode === 0x9) {
            socket.write(buildWebSocketFrame(frame.payload, 0xa));
            continue;
          }
          if (frame.opcode !== 0x1 && frame.opcode !== 0x2) continue;
          const text = frame.opcode === 0x1 ? frame.payload.toString("utf8") : frame.payload.toString("base64");
          messages.push(frame.opcode === 0x1 ? parseMaybeJson(text) : { binaryBase64: text });
          messageTimestamps.push(new Date().toISOString());
          if (messages.length > maxMessages) {
            messages.shift();
            messageTimestamps.shift();
          }
        }
      });
      socket.on("error", (error) => finish(2, error?.message || "WebSocket error"));
      socket.on("close", () => finish(opened ? 0 : 2, opened ? "OK" : "WebSocket closed before open"));
    } catch (error) {
      finish(2, error?.message || String(error));
    }
  });
}

function normalizeOutboundMessages(requestText, flagMessages) {
  const flags = Array.isArray(flagMessages) ? flagMessages : flagMessages ? [flagMessages] : [];
  if (flags.length) return flags.map(String);
  const text = String(requestText || "").trim();
  if (!text) return [];
  const parsed = parseJsonLoose(text, undefined);
  if (Array.isArray(parsed)) return parsed.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  if (Array.isArray(parsed?.messages))
    return parsed.messages.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  return [text];
}

async function sendWebSocketMessages(socket, messages, delayMs = 0) {
  for (const message of messages) {
    if (!socket || socket.destroyed) return;
    socket.write(buildWebSocketFrame(message));
    if (delayMs > 0) await sleep(delayMs);
  }
}

function protocolsFromHeaders(headers) {
  return (headers || [])
    .filter((item) => String(item.key || "").toLowerCase() === "sec-websocket-protocol")
    .flatMap((item) =>
      String(item.value || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
}

function buildWebSocketFrame(data, opcode = 0x1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data || ""));
  const mask = crypto.randomBytes(4);
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | payload.length;
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeUInt32BE(Math.floor(payload.length / 2 ** 32), 2);
    header.writeUInt32BE(payload.length >>> 0, 6);
  }
  header[0] = 0x80 | opcode;
  const masked = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
  return Buffer.concat([header, mask, masked]);
}

function buildClosePayload(code, reason) {
  const reasonBuffer = Buffer.from(String(reason || ""));
  const payload = Buffer.alloc(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  return payload;
}

function readWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const masked = Boolean(buffer[1] & 0x80);
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    length = buffer.readUInt32BE(2) * 2 ** 32 + buffer.readUInt32BE(6);
    offset = 10;
  }
  const maskOffset = offset;
  if (masked) offset += 4;
  if (buffer.length < offset + length) return null;
  let payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4);
    payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
  }
  return { opcode, payload, frameLength: offset + length };
}

function createGrpcMetadata(grpc, pairs) {
  const metadata = new grpc.Metadata();
  for (const pair of pairs || []) if (pair?.key) metadata.add(String(pair.key), String(pair.value || ""));
  return metadata;
}

function metadataToRecord(metadata) {
  if (!metadata) return {};
  if (typeof metadata.getMap === "function") {
    return Object.fromEntries(
      Object.entries(metadata.getMap()).map(([key, value]) => [
        key,
        Buffer.isBuffer(value) ? value.toString("base64") : String(value),
      ]),
    );
  }
  if (typeof metadata === "object") return { ...metadata };
  return {};
}

function statusToTrailers(status) {
  return {
    ...metadataToRecord(status?.metadata),
    "grpc-status": String(status?.code ?? 0),
    "grpc-message": String(status?.details || ""),
  };
}

function parseRequestJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (error) {
    throw new Error(`Request body is not valid JSON: ${error.message}`);
  }
}

function splitMethodKey(methodKey) {
  const slash = String(methodKey || "").lastIndexOf("/");
  if (slash < 0) throw new Error(`Invalid method key ${methodKey}. Expected service/method.`);
  return [methodKey.slice(0, slash), methodKey.slice(slash + 1)];
}

function getByDottedPath(root, dottedPath) {
  return String(dottedPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, key) => value?.[key], root);
}

function findServiceDefinitionKey(serviceDefinition, protoMethodName) {
  const keys = Object.keys(serviceDefinition || {});
  return (
    keys.find((key) => key === protoMethodName) ||
    keys.find((key) => key === protoMethodName.charAt(0).toLowerCase() + protoMethodName.slice(1)) ||
    keys.find((key) => key.toLowerCase() === String(protoMethodName).toLowerCase()) ||
    protoMethodName
  );
}

function safeRelativePath(input) {
  const parts = String(input || "schema.proto")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..");
  return parts.join("/") || "schema.proto";
}
function stripGrpcScheme(target) {
  return String(target || "").replace(/^grpcs?:\/\//, "");
}
function isSecureTarget(target) {
  return /^grpcs:\/\//.test(String(target || ""));
}
function closeClient(client) {
  try {
    client?.close?.();
  } catch {
    /* ignore */
  }
}
function parseMaybeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
function decodeGrpcMessage(value) {
  try {
    return decodeURIComponent(String(value || "").replace(/\+/g, "%20"));
  } catch {
    return String(value || "");
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

module.exports = {
  executeRunItem,
  invokeRest,
  invokeNativeGrpc,
  invokeGrpcWeb,
  invokeWebSocket,
  loadGrpcMethod,
  normalizeClientStreamMessages,
  invokeUnary,
  invokeServerStream,
  invokeClientStream,
  invokeBidi,
  writeClientMessages,
  normalizeGrpcResult,
  parseRequestJson,
  splitMethodKey,
  findServiceDefinitionKey,
  safeRelativePath,
  stripGrpcScheme,
  isSecureTarget,
  buildWebSocketFrame,
  readWebSocketFrame,
};
