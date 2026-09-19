"use strict";

const { TextDecoder, TextEncoder } = require("node:util");

function createGrpcWebTransportRuntime(options = {}) {
  const payloadStore = options.payloadStore;
  if (!payloadStore) throw new TypeError("payloadStore is required.");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required for gRPC-Web transport runtime.");
  const listeners = new Set();
  const activeCalls = new Map();
  let disposed = false;

  const emit = (event, payload) => {
    const value = { event, payload };
    for (const listener of listeners) listener(value);
  };

  const subscribe = (listener) => {
    if (typeof listener !== "function") return () => undefined;
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const invoke = async (payload = {}) => {
    if (disposed) throw new Error("gRPC-Web transport runtime is disposed.");
    const runId = normalizeRequiredString(payload.runId, "gRPC-Web runId");
    const url = normalizeRequiredString(payload.url, "gRPC-Web URL");
    assertHttpUrl(url);
    if (activeCalls.has(runId)) throw new Error(`gRPC-Web run is already active: ${runId}`);

    const controller = new AbortController();
    const call = { controller, cancelled: false };
    activeCalls.set(runId, call);
    const startedAt = nowMs();
    const startedTimestamp = new Date();
    const maxMessages = normalizeMaxMessages(payload.maxMessages);
    const idleTimeoutMs = normalizeTimeout(payload.idleTimeoutMs, 60_000);
    const connectionTimeoutMs = normalizeTimeout(payload.connectionTimeoutMs, 10_000);
    const requestTimeoutMs = normalizeTimeout(payload.timeoutMs, 30_000);
    const responseStream = Boolean(payload.responseStream);
    const decodeMessageToJson = options.decodeMessageToJson || createProtobufDecoder(payload);
    const parser = createGrpcWebStreamParser({ responseEncoding: payload.responseEncoding });
    const messages = [];
    const messageDocumentRefs = [];
    let totalMessages = 0;
    let droppedMessages = 0;
    let responseHeaders = {};
    let httpStatus = 0;
    let statusText = "";
    let trailers = {};
    let connectionTimer = null;
    let requestTimer = null;

    const emitLog = (level, message, details) => emit("grpcWeb.log", { runId, level, message, details });
    emitLog("info", "Opening gRPC-Web request in disposable transport runtime.", { url, generation: payload.generation || undefined });

    try {
      if (connectionTimeoutMs > 0) {
        connectionTimer = setTimeout(() => controller.abort(new Error(`Connection timed out after ${Math.ceil(connectionTimeoutMs / 1000)}s.`)), connectionTimeoutMs);
      }
      if (!responseStream && requestTimeoutMs > 0) {
        requestTimer = setTimeout(() => controller.abort(new Error(`Request timed out after ${Math.ceil(requestTimeoutMs / 1000)}s.`)), requestTimeoutMs);
      }

      const response = await fetchImpl(url, {
        method: "POST",
        headers: normalizeHeaders(payload.headers),
        body: typeof payload.body === "string" || payload.body instanceof Uint8Array ? payload.body : String(payload.body || ""),
        signal: controller.signal,
      });
      if (connectionTimer !== null) { clearTimeout(connectionTimer); connectionTimer = null; }
      httpStatus = Number(response.status) || 0;
      statusText = String(response.statusText || "");
      responseHeaders = headersToRecord(response.headers);
      const contentType = response.headers?.get?.("content-type") || "";
      parser.setResponseEncoding(resolveEncoding(payload.responseEncoding, contentType));
      emit("grpcWeb.headers", { runId, httpStatus, headers: responseHeaders, contentType });

      const handleFrames = async (frames) => {
        for (const frame of frames) {
          if (frame.kind === "trailers") {
            trailers = { ...trailers, ...parseTrailerBlock(frame.payload) };
            emit("grpcWeb.trailers", { runId, trailers: { ...trailers } });
            continue;
          }
          const serialized = await Promise.resolve(decodeMessageToJson(frame.payload));
          const text = typeof serialized === "string" ? serialized : JSON.stringify(serialized);
          const preview = text.length <= 12_000 ? text : text.slice(0, 12_000);
          const documentId = `transport:${sanitizeId(runId)}:message:${totalMessages + 1}`;
          const documentRef = payloadStore.registerUtf8(documentId, new TextEncoder().encode(text), preview, text.length);
          totalMessages += 1;
          while (maxMessages > 0 && messages.length >= maxMessages) {
            messages.shift();
            const removedRef = messageDocumentRefs.shift();
            if (removedRef?.id) payloadStore.release([removedRef.id]);
            droppedMessages += 1;
          }
          messages.push(documentRef.preview);
          messageDocumentRefs.push(documentRef);
          const retentionLimit = Math.max(1, Number(payloadStore.debugStats().maxDocuments) || maxMessages || 10);
          emit("grpcWeb.message", { runId, index: totalMessages - 1, documentRef, retentionLimit });
        }
      };

      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const abortReader = () => void reader.cancel("transport cancelled").catch(() => undefined);
        controller.signal.addEventListener("abort", abortReader, { once: true });
        try {
          while (!controller.signal.aborted) {
            const read = idleTimeoutMs > 0 && responseStream
              ? await readWithTimeout(reader, idleTimeoutMs)
              : await reader.read();
            if (read.done) break;
            await handleFrames(parser.push(read.value, false));
          }
          if (!controller.signal.aborted) await handleFrames(parser.push(new Uint8Array(0), true));
        } finally {
          controller.signal.removeEventListener("abort", abortReader);
          reader.releaseLock?.();
        }
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        await handleFrames(parser.push(bytes, true));
      }

      if (!trailers["grpc-status"]) {
        const headerStatus = response.headers?.get?.("grpc-status");
        const headerMessage = response.headers?.get?.("grpc-message") || "";
        trailers = {
          ...trailers,
          "grpc-status": headerStatus || (response.ok ? "0" : String(httpStatus)),
          "grpc-message": headerMessage || (response.ok ? "" : statusText),
        };
        emit("grpcWeb.trailers", { runId, trailers: { ...trailers } });
      }

      const retainedPairs = messageDocumentRefs
        .map((documentRef, index) => ({ documentRef, preview: messages[index] }))
        .filter(({ documentRef }) => payloadStore.has(documentRef.id));
      const retainedMessages = retainedPairs.map(({ preview }) => preview);
      const retainedDocumentRefs = retainedPairs.map(({ documentRef }) => documentRef);
      const result = {
        httpStatus,
        headers: responseHeaders,
        trailers,
        messages: retainedMessages,
        messageDocumentRefs: retainedDocumentRefs,
        totalMessages,
        droppedMessages: Math.max(droppedMessages, totalMessages - retainedDocumentRefs.length),
        durationMs: Math.round(nowMs() - startedAt),
        requestUrl: url,
        startedAt: startedTimestamp.toISOString(),
        completedAt: new Date().toISOString(),
        transport: "grpc-web",
      };
      emit("grpcWeb.end", { runId, summary: result });
      return result;
    } catch (error) {
      const normalized = errorToPlainObject(error);
      emit("grpcWeb.error", { runId, message: normalized.message, details: normalized });
      if (normalized.causeCode || normalized.causeMessage) {
        const details = [normalized.causeCode, normalized.causeMessage].filter(Boolean).join(": ");
        throw new Error(`${normalized.message}${details ? ` (${details})` : ""}`, { cause: error });
      }
      throw error;
    } finally {
      if (connectionTimer !== null) clearTimeout(connectionTimer);
      if (requestTimer !== null) clearTimeout(requestTimer);
      activeCalls.delete(runId);
    }
  };

  const cancel = async (payload = {}) => {
    const runId = String(payload.runId || "");
    const call = activeCalls.get(runId);
    if (!call) return { cancelled: false };
    call.cancelled = true;
    call.controller.abort(new Error("Cancelled by user"));
    return { cancelled: true };
  };

  const handle = async (type, payload = {}) => {
    if (type === "grpcWeb.invoke") return invoke(payload);
    if (type === "grpcWeb.cancel") return cancel(payload);
    if (type.startsWith("payload.")) return payloadStore.handle(type, payload);
    return undefined;
  };

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    for (const [runId] of activeCalls) await cancel({ runId });
    activeCalls.clear();
    payloadStore.dispose?.();
    listeners.clear();
  };

  return { handle, subscribe, dispose, getDebugStats: () => ({ activeRunIds: [...activeCalls.keys()], payload: payloadStore.debugStats() }) };
}

function createProtobufDecoder(payload) {
  const rootJson = payload?.rootJson;
  const responseTypeName = String(payload?.responseType || "");
  if (!rootJson || !responseTypeName) throw new Error("gRPC-Web utility decoder requires rootJson and responseType.");
  let protobuf;
  try {
    protobuf = require("protobufjs");
  } catch (error) {
    throw new Error(`protobufjs is required by the gRPC-Web transport utility: ${error instanceof Error ? error.message : String(error)}`);
  }
  const root = protobuf.Root.fromJSON(rootJson);
  const responseType = root.lookupType(responseTypeName);
  return (bytes) => {
    const message = responseType.decode(bytes);
    const object = responseType.toObject(message, {
      longs: String,
      enums: String,
      bytes: String,
      defaults: true,
      arrays: true,
      objects: true,
      oneofs: true,
    });
    return JSON.stringify(object);
  };
}

function createGrpcWebStreamParser(options = {}) {
  let responseEncoding = options.responseEncoding === "binary" ? "binary" : "text";
  let base64Pending = "";
  const decoder = new TextDecoder();
  const frameChunks = [];
  let frameHeadOffset = 0;
  let frameBufferedBytes = 0;

  const setResponseEncoding = (value) => { responseEncoding = value === "binary" ? "binary" : "text"; };

  const push = (chunkInput, final) => {
    const chunk = chunkInput instanceof Uint8Array ? chunkInput : new Uint8Array(chunkInput || 0);
    const binaryChunks = [];
    if (responseEncoding === "text") {
      const text = decoder.decode(chunk, { stream: !final });
      binaryChunks.push(...decodeBase64(text, final));
    } else if (chunk.length > 0) {
      binaryChunks.push(chunk);
    }
    const frames = [];
    for (const binary of binaryChunks) frames.push(...parseFrames(binary));
    if (final && frameBufferedBytes > 0) throw new Error(`gRPC-Web stream ended with an incomplete frame (${frameBufferedBytes} buffered bytes).`);
    return frames;
  };

  function decodeBase64(text, final) {
    base64Pending += String(text || "").replace(/\s+/g, "");
    const chunks = [];
    while (base64Pending.length >= 4) {
      const paddedEnd = findPaddedBase64EntityEnd(base64Pending);
      if (paddedEnd > 0) {
        chunks.push(Uint8Array.from(Buffer.from(base64Pending.slice(0, paddedEnd), "base64")));
        base64Pending = base64Pending.slice(paddedEnd);
        continue;
      }
      const decodableLength = base64Pending.length - (base64Pending.length % 4);
      if (decodableLength <= 0) break;
      chunks.push(Uint8Array.from(Buffer.from(base64Pending.slice(0, decodableLength), "base64")));
      base64Pending = base64Pending.slice(decodableLength);
    }
    if (final && base64Pending.length > 0) {
      const padded = base64Pending.padEnd(Math.ceil(base64Pending.length / 4) * 4, "=");
      chunks.push(Uint8Array.from(Buffer.from(padded, "base64")));
      base64Pending = "";
    }
    return chunks;
  }

  function parseFrames(chunk) {
    if (chunk.length > 0) { frameChunks.push(chunk); frameBufferedBytes += chunk.length; }
    const frames = [];
    while (frameBufferedBytes >= 5) {
      const flag = peek(0);
      const length = peek(1) * 16777216 + (peek(2) << 16) + (peek(3) << 8) + peek(4);
      const frameBytes = 5 + length;
      if (frameBufferedBytes < frameBytes) break;
      consume(5);
      const payload = consume(length);
      if ((flag & 0x01) === 0x01) throw new Error("Compressed gRPC-Web frames are not supported.");
      frames.push({ kind: (flag & 0x80) === 0x80 ? "trailers" : "data", payload });
    }
    return frames;
  }

  function peek(relativeIndex) {
    let remaining = relativeIndex;
    for (let index = 0; index < frameChunks.length; index += 1) {
      const current = frameChunks[index];
      const start = index === 0 ? frameHeadOffset : 0;
      const available = current.length - start;
      if (remaining < available) return current[start + remaining];
      remaining -= available;
    }
    throw new Error("Unexpected end of queued gRPC-Web frame data.");
  }

  function consume(count) {
    if (count === 0) return new Uint8Array(0);
    if (!Number.isSafeInteger(count) || count < 0 || count > frameBufferedBytes) throw new Error(`Invalid queued gRPC-Web byte count: ${count}`);
    const first = frameChunks[0];
    const firstAvailable = first.length - frameHeadOffset;
    if (firstAvailable >= count) {
      const output = first.subarray(frameHeadOffset, frameHeadOffset + count);
      frameHeadOffset += count;
      frameBufferedBytes -= count;
      if (frameHeadOffset === first.length) { frameChunks.shift(); frameHeadOffset = 0; }
      return output;
    }
    const output = new Uint8Array(count);
    let written = 0;
    while (written < count) {
      const current = frameChunks[0];
      const available = current.length - frameHeadOffset;
      const take = Math.min(available, count - written);
      output.set(current.subarray(frameHeadOffset, frameHeadOffset + take), written);
      written += take;
      frameHeadOffset += take;
      frameBufferedBytes -= take;
      if (frameHeadOffset === current.length) { frameChunks.shift(); frameHeadOffset = 0; }
    }
    return output;
  }

  return { push, setResponseEncoding };
}

function findPaddedBase64EntityEnd(text) {
  const firstPadding = text.indexOf("=");
  if (firstPadding === -1) return -1;
  let end = firstPadding;
  while (end < text.length && text[end] === "=") end += 1;
  const remainder = end % 4;
  if (remainder !== 0) {
    const adjustedEnd = end + (4 - remainder);
    return adjustedEnd > text.length ? -1 : adjustedEnd;
  }
  return end;
}

function parseTrailerBlock(payload) {
  const trailers = {};
  const text = new TextDecoder().decode(payload);
  for (const line of text.split("\r\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    trailers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  return trailers;
}

function headersToRecord(headers) {
  const output = {};
  if (!headers?.forEach) return output;
  headers.forEach((value, key) => { output[String(key)] = String(value); });
  return output;
}

function normalizeHeaders(headers) {
  const output = {};
  if (!headers || typeof headers !== "object") return output;
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = String(key).trim();
    if (!normalizedKey || value === undefined || value === null) continue;
    output[normalizedKey] = String(value);
  }
  return output;
}

function resolveEncoding(explicit, contentType) {
  if (explicit === "binary") return "binary";
  if (explicit === "text") return "text";
  return String(contentType || "").toLowerCase().includes("grpc-web-text") ? "text" : "binary";
}

function normalizeMaxMessages(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 50;
  return Math.max(1, Math.floor(numeric));
}

function normalizeTimeout(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

async function readWithTimeout(reader, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Stream idle timed out after ${Math.ceil(timeoutMs / 1000)}s.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function sanitizeId(value) {
  return String(value || "run").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 160) || "run";
}

function normalizeRequiredString(value, name) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required.`);
  return text;
}

function assertHttpUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error("Invalid gRPC-Web URL."); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("gRPC-Web transport only allows http:// and https:// URLs.");
}

function nowMs() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }

function errorToPlainObject(error) {
  if (!error || typeof error !== "object") return { name: "Error", message: String(error) };
  const cause = error.cause && typeof error.cause === "object" ? error.cause : null;
  return {
    name: error.name ? String(error.name) : "Error",
    message: error.message ? String(error.message) : String(error),
    stack: error.stack ? String(error.stack) : undefined,
    causeCode: cause?.code ? String(cause.code) : undefined,
    causeMessage: cause?.message ? String(cause.message) : undefined,
  };
}

module.exports = { createGrpcWebTransportRuntime, createGrpcWebStreamParser };
