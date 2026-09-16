import type * as protobuf from "protobufjs";
import { transportLifecycleStore } from "../app/playground/features/response-viewer/model/transportLifecycle.store";
import { createGrpcWebDecodeWorkerClient, type GrpcWebDecodeWorkerClient, type GrpcWebDecodeWorkerFrame } from "./grpc-web-decode-worker-client";
import { buildGrpcWebWorkerSchema, canDecodeInGrpcWebWorker } from "./grpc-web-worker-schema";
import type { GrpcEvent, GrpcResult, MetadataPair, ResponseDocumentRef, RpcMethodInfo } from "./types";

type Bytes = Uint8Array<ArrayBufferLike>;

type InvokeGrpcWebTextParams = {
  runId?: string;
  baseUrl: string;
  root: protobuf.Root;
  method: RpcMethodInfo;
  requestJson: unknown;
  metadata?: MetadataPair[];
  signal?: AbortSignal;
  timeoutMs?: number;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxMessages?: number;
  onEvent?: (event: GrpcEvent) => void;
  createPayloadDocumentProducerChannel: () => { producerPort: MessagePort; ready: Promise<void>; release(): void };
};

/**
 * Invokes a browser gRPC-Web endpoint and streams decoded events to the UI.
 * Unary and server-streaming calls both use grpc-web-text so custom reverse
 * proxies can forward one consistent request/response representation.
 */
export async function invokeGrpcWebText(params: InvokeGrpcWebTextParams): Promise<GrpcResult> {
  const emit = params.onEvent ?? (() => undefined);

  if (params.method.requestStream) {
    throw new Error("Client streaming and bidirectional streaming are not supported by this browser gRPC-Web tester.");
  }

  const requestType = params.root.lookupType(params.method.requestType);
  const responseType = params.root.lookupType(params.method.responseType);
  const requestObject = normalizeProtobufRequestObject(requestType, ensureObject(params.requestJson));
  const verifyError = requestType.verify(requestObject);

  if (verifyError) {
    throw new Error(`Invalid request payload: ${verifyError}`);
  }

  const requestMessage = requestType.fromObject(requestObject);
  const requestPayload = requestType.encode(requestMessage).finish();
  const requestFrame = encodeGrpcFrame(requestPayload, false);
  const responseStream = params.method.responseStream;
  // Keep unary and server-streaming on the same grpc-web-text wire format.
  // The custom web proxy already handles the streaming text path correctly,
  // so unary should use the identical Base64-framed representation.
  const requestBody: string = base64Encode(requestFrame);
  const headers = buildGrpcWebHeaders(params.metadata ?? []);
  const timeoutMs = Math.max(0, Number(params.timeoutMs ?? 30_000));
  if (!responseStream && timeoutMs > 0) headers["grpc-timeout"] = `${Math.ceil(timeoutMs)}m`;
  const firstResult = await invokeGrpcWebTextAttempt({
    ...params,
    method: params.method,
    emit,
    requestPayload,
    requestBody,
    headers,
    responseType,
  });

  if (firstResult.trailers["grpc-status"] !== "12") return firstResult;
  const shortServiceName = params.method.serviceName.split(".").pop();
  if (!shortServiceName || shortServiceName === params.method.serviceName) return firstResult;

  emit({
    type: "log",
    level: "warn",
    message: "Retrying gRPC-Web request with short service name for BloomRPC compatibility.",
    details: {
      previousService: params.method.serviceName,
      retryService: shortServiceName,
      method: params.method.methodName,
    },
  });

  return invokeGrpcWebTextAttempt({
    ...params,
    method: { ...params.method, serviceName: shortServiceName },
    emit,
    requestPayload,
    requestBody,
    headers,
    responseType,
  });
}

/**
 * Converts protobuf JSON enum names to their numeric wire values before
 * validation. protobufjs Type.verify expects enum numbers even though
 * Type.fromObject supports the conventional symbolic JSON representation.
 */
export function normalizeProtobufRequestObject(
  messageType: protobuf.Type,
  value: Record<string, unknown>,
): Record<string, unknown> {
  messageType.resolveAll();
  const normalized: Record<string, unknown> = { ...value };

  for (const field of messageType.fieldsArray) {
    if (!(field.name in normalized)) continue;
    const fieldValue = normalized[field.name];
    const normalizeValue = (item: unknown): unknown => {
      if (field.resolvedType && "values" in field.resolvedType) {
        if (typeof item !== "string") return item;
        const enumNumber = field.resolvedType.values[item];
        return enumNumber === undefined ? item : enumNumber;
      }
      if (field.resolvedType && "fieldsArray" in field.resolvedType && isPlainObject(item)) {
        return normalizeProtobufRequestObject(field.resolvedType, item);
      }
      return item;
    };

    if (field.map && isPlainObject(fieldValue)) {
      normalized[field.name] = Object.fromEntries(
        Object.entries(fieldValue).map(([key, item]) => [key, normalizeValue(item)]),
      );
    } else if (field.repeated && Array.isArray(fieldValue)) {
      normalized[field.name] = fieldValue.map(normalizeValue);
    } else {
      normalized[field.name] = normalizeValue(fieldValue);
    }
  }

  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type InvokeGrpcWebTextAttemptParams = InvokeGrpcWebTextParams & {
  emit: (event: GrpcEvent) => void;
  requestPayload: Uint8Array;
  requestBody: string | Uint8Array<ArrayBuffer>;
  headers: Record<string, string>;
  responseType: protobuf.Type;
};

async function invokeGrpcWebTextAttempt(params: InvokeGrpcWebTextAttemptParams): Promise<GrpcResult> {
  if (typeof window !== "undefined" && window.electronGrpcWebTransport?.isAvailable) {
    return invokeElectronGrpcWebTransport(params);
  }

  // Browser fallback: keep the Web Worker transport for the real web build.
  const upstreamUrl = buildGrpcWebUrl(params.baseUrl, params.method.serviceName, params.method.methodName);
  const requestUrl = upstreamUrl;
  const startedTimestamp = new Date();
  const startedAt = performance.now();
  const connectionTimeoutMs = Math.max(1, Number(params.connectionTimeoutMs ?? 10_000));
  const requestTimeoutMs = Math.max(0, Number(params.timeoutMs ?? 30_000));
  const idleTimeoutMs = normalizeTimeoutMs(params.idleTimeoutMs, 60_000);
  const requestController = new AbortController();
  let timeoutMessage = "";
  const relayExternalAbort = () => requestController.abort(params.signal?.reason);
  if (params.signal?.aborted) relayExternalAbort();
  else params.signal?.addEventListener("abort", relayExternalAbort, { once: true });
  const connectionTimer = window.setTimeout(() => {
    timeoutMessage = `Connection timed out after ${Math.ceil(connectionTimeoutMs / 1000)}s.`;
    requestController.abort(new Error(timeoutMessage));
  }, connectionTimeoutMs);
  const requestTimer = !params.method.responseStream && requestTimeoutMs > 0
    ? window.setTimeout(() => {
        timeoutMessage = `Request timed out after ${Math.ceil(requestTimeoutMs / 1000)}s.`;
        requestController.abort(new Error(timeoutMessage));
      }, requestTimeoutMs)
    : null;

  params.emit({
    type: "log",
    level: "info",
    message: "Request prepared",
    details: {
      requestUrl,
      upstreamUrl,
      service: params.method.serviceName,
      method: params.method.methodName,
      requestType: params.method.requestType,
      responseType: params.method.responseType,
      requestBytes: params.requestPayload.length,
      mode: params.method.responseStream ? "server-streaming" : "unary",
      headers: params.headers,
    },
  });

  params.emit({
    type: "log",
    level: "info",
    message: "Opening gRPC-Web request",
    details: { requestUrl, upstreamUrl, contentType: params.headers["content-type"], headers: params.headers },
  });

  params.emit({
    type: "log",
    level: "info",
    message: "Using browser fetch gRPC-Web transport.",
    details: {
      requestUrl,
      upstreamUrl,
      contentType: params.headers["content-type"],
      note: "Electron desktop can bypass browser CORS when webSecurity is disabled; regular browsers still require the reverse proxy to return valid CORS headers.",
    },
  });

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: params.headers,
      body: params.requestBody,
      signal: requestController.signal,
    });
  } catch (error) {
    window.clearTimeout(connectionTimer);
    if (requestTimer !== null) window.clearTimeout(requestTimer);
    params.signal?.removeEventListener("abort", relayExternalAbort);
    params.emit({
      type: "error",
      message: "Network request failed before gRPC headers were received.",
      details: errorToPlainObject(error),
    });
    if (timeoutMessage) throw new Error(timeoutMessage);
    throw error;
  }
  window.clearTimeout(connectionTimer);

  const responseHeaders = headersToRecord(response.headers);
  const contentType = response.headers.get("content-type") ?? "";
  const responseEncoding = resolveGrpcWebResponseEncoding(contentType);

  params.emit({
    type: "headers",
    httpStatus: response.status,
    headers: responseHeaders,
    contentType,
  });

  params.emit({
    type: "log",
    level: response.ok ? "info" : "warn",
    message: response.ok ? "HTTP response headers received" : "HTTP response is not OK",
    details: { httpStatus: response.status, contentType, headers: responseHeaders },
  });

  const workerSchema = buildGrpcWebWorkerSchema(params.responseType);
  if (!canDecodeInGrpcWebWorker(workerSchema)) {
    const error = new Error("This response schema cannot be decoded by the gRPC-Web worker.");
    params.emit({ type: "error", message: error.message, details: { reasons: workerSchema.unsupportedReasons } });
    throw error;
  }

  const payloadChannel = params.createPayloadDocumentProducerChannel();
  await payloadChannel.ready;
  let decodeWorker: GrpcWebDecodeWorkerClient;
  try {
    decodeWorker = createGrpcWebDecodeWorkerClient({
      schema: workerSchema,
      responseEncoding,
      producerPort: payloadChannel.producerPort,
      maxPreviewChars: 12_000,
      documentPrefix: `grpc-web:${startedTimestamp.getTime().toString(36)}`,
    });
  } catch (error) {
    payloadChannel.release();
    throw error;
  }
  const messages: unknown[] = [];
  const messageDocumentRefs: ResponseDocumentRef[] = [];
  const maxMessages = normalizeMaxMessages(params.maxMessages);
  let totalMessages = 0;
  let droppedMessages = 0;
  let trailers: Record<string, string> = {};
  let decodedBinaryBytes = 0;
  let dataFrames = 0;
  let trailerFrames = 0;

  params.emit({
    type: "log",
    level: "debug",
    message: "gRPC-Web response decoding moved to worker.",
    details: { responseType: params.method.responseType, encoding: responseEncoding },
  });

  const processDecodedFrame = (frame: GrpcWebDecodeWorkerFrame) => {
    if (frame.kind === "trailers") {
      trailerFrames += 1;
      trailers = { ...trailers, ...frame.trailers };
      params.emit({ type: "trailers", trailers });
      const status = trailers["grpc-status"];
      const message = trailers["grpc-message"] ?? "";
      const isOk = status === undefined || status === "0";
      params.emit({
        type: "log",
        level: isOk ? "info" : "error",
        message: isOk ? "gRPC trailers received" : `gRPC error ${status}: ${decodeGrpcMessage(message)}`,
        details: { frame: trailerFrames, grpcStatus: status ?? "<missing>", grpcMessage: decodeGrpcMessage(message), trailers },
      });
      return;
    }

    dataFrames += 1;
    totalMessages += 1;
    while (maxMessages > 0 && messages.length >= maxMessages) {
      messages.shift();
      messageDocumentRefs.shift();
      droppedMessages += 1;
    }
    messages.push(frame.documentRef.preview);
    messageDocumentRefs.push(frame.documentRef);
    params.emit({ type: "message", index: totalMessages - 1, documentRef: frame.documentRef });
    params.emit({
      type: "log",
      level: "debug",
      message: `Message #${totalMessages} decoded`,
      details: { frame: dataFrames, messageIndex: totalMessages - 1, storedMessages: messages.length, bytes: frame.frameBytes, decodeThread: "worker" },
    });
  };

  const processWorkerChunk = async (chunk: Uint8Array<ArrayBufferLike>, final = false) => {
    const batch = await decodeWorker.processChunk(chunk, final);
    decodedBinaryBytes += batch.decodedBinaryBytes;
    if (batch.decodedBinaryBytes > 0) {
      params.emit({ type: "log", level: "debug", message: "Decoded gRPC-Web bytes in worker", details: { decodedBytes: batch.decodedBinaryBytes, totalDecodedBytes: decodedBinaryBytes, encoding: responseEncoding } });
    }
    for (const frame of batch.frames) processDecodedFrame(frame);
  };

  transportLifecycleStore.increment("activeStreamSubscriptions");
  try {
    if (!response.body) {
      if (responseEncoding === "text") {
        let text = "";
        try { text = await response.text(); } catch (error) { if (!timeoutMessage) throw error; }
        await processWorkerChunk(new TextEncoder().encode(text), true);
      } else {
        let bytes = new Uint8Array(0);
        try { bytes = new Uint8Array(await response.arrayBuffer()); } catch (error) { if (!timeoutMessage) throw error; }
        await processWorkerChunk(bytes, true);
      }
    } else {
      const reader = response.body.getReader();
      const cancelReader = () => {
        params.emit({ type: "log", level: "warn", message: "Abort requested; cancelling response reader immediately." });
        void reader.cancel("Request cancelled by user").catch(() => undefined);
      };
      if (requestController.signal.aborted) cancelReader();
      requestController.signal.addEventListener("abort", cancelReader, { once: true });
      try {
        while (true) {
          if (requestController.signal.aborted) break;
          const chunk = params.method.responseStream && idleTimeoutMs > 0
            ? await readGrpcWebStreamChunk(reader, idleTimeoutMs)
            : await reader.read();
          if (chunk.done) break;
          await processWorkerChunk(chunk.value, false);
        }
      } catch (error) {
        if (error instanceof GrpcWebIdleTimeoutError) {
          timeoutMessage = error.message;
          await reader.cancel(error.message).catch(() => undefined);
        } else if (!requestController.signal.aborted) {
          throw error;
        }
      } finally {
        requestController.signal.removeEventListener("abort", cancelReader);
        reader.releaseLock();
      }
      if (!requestController.signal.aborted && !timeoutMessage) await processWorkerChunk(new Uint8Array(0), true);
    }
  } finally {
    decodeWorker.dispose();
    payloadChannel.release();
    transportLifecycleStore.decrement("activeStreamSubscriptions");
  }

  if (requestTimer !== null) window.clearTimeout(requestTimer);
  params.signal?.removeEventListener("abort", relayExternalAbort);

  if (timeoutMessage && !trailers["grpc-status"]) {
    trailers = {
      ...trailers,
      "grpc-status": "4",
      "grpc-message": timeoutMessage,
    };
    params.emit({ type: "error", message: timeoutMessage, details: { requestTimeoutMs, idleTimeoutMs } });
    params.emit({ type: "trailers", trailers });
  } else if (params.signal?.aborted && !trailers["grpc-status"]) {
    trailers = {
      ...trailers,
      "grpc-status": "1",
      "grpc-message": "Cancelled by user",
    };
    params.emit({ type: "trailers", trailers });
  }

  if (!trailers["grpc-status"]) {
    const headerGrpcStatus = response.headers.get("grpc-status");
    const headerGrpcMessage = response.headers.get("grpc-message") ?? "";

    if (headerGrpcStatus) {
      trailers = {
        ...trailers,
        "grpc-status": headerGrpcStatus,
        "grpc-message": headerGrpcMessage,
      };
      params.emit({ type: "trailers", trailers });
      params.emit({
        type: "log",
        level: headerGrpcStatus === "0" ? "info" : "error",
        message: "No gRPC trailer frame was found. Using grpc-status metadata from response headers instead.",
        details: { httpStatus: response.status, trailers },
      });
    }
  }

  if (!trailers["grpc-status"]) {
    trailers = {
      ...trailers,
      "grpc-status": response.ok ? "0" : String(response.status),
      "grpc-message": response.ok ? "" : response.statusText,
    };
    params.emit({ type: "trailers", trailers });
    params.emit({
      type: "log",
      level: response.ok ? "warn" : "error",
      message: response.ok
        ? "No gRPC trailers were found. The proxy may not expose trailers correctly."
        : "No gRPC trailers were found and HTTP status is not OK.",
      details: { httpStatus: response.status, trailers },
    });
  }

  const summary: GrpcResult = {
    httpStatus: response.status,
    headers: responseHeaders,
    trailers,
    messages,
    messageDocumentRefs,
    totalMessages,
    droppedMessages,
    durationMs: Math.round(performance.now() - startedAt),
    requestUrl,
    startedAt: startedTimestamp.toISOString(),
    completedAt: new Date().toISOString(),
    transport: "grpc-web",
  };

  params.emit({
    type: "log",
    level: trailers["grpc-status"] === "0" ? "info" : "error",
    message: "Request completed",
    details: {
      durationMs: summary.durationMs,
      messages: totalMessages,
      storedMessages: messages.length,
      droppedMessages,
      dataFrames,
      trailerFrames,
      grpcStatus: trailers["grpc-status"],
      grpcMessage: decodeGrpcMessage(trailers["grpc-message"] ?? ""),
    },
  });
  params.emit({ type: "end", summary });
  return summary;
}

async function invokeElectronGrpcWebTransport(params: InvokeGrpcWebTextAttemptParams): Promise<GrpcResult> {
  const bridge = window.electronGrpcWebTransport;
  if (!bridge?.isAvailable) throw new Error("Electron gRPC-Web transport runtime is unavailable.");
  const runId = params.runId?.trim() || `grpc-web:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const requestUrl = buildGrpcWebUrl(params.baseUrl, params.method.serviceName, params.method.methodName);
  const cancel = (): void => { void bridge.cancel(runId).catch(() => undefined); };
  if (params.signal?.aborted) cancel();
  else params.signal?.addEventListener("abort", cancel, { once: true });

  params.emit({
    type: "log",
    level: "info",
    message: "Using disposable Electron gRPC-Web transport runtime.",
    details: { requestUrl, runId, responseType: params.method.responseType },
  });

  try {
    return await bridge.invoke(
      {
        runId,
        url: requestUrl,
        headers: params.headers,
        body: typeof params.requestBody === "string" ? params.requestBody : base64Encode(params.requestBody),
        rootJson: params.root.toJSON(),
        responseType: params.method.responseType,
        responseStream: params.method.responseStream,
        timeoutMs: params.timeoutMs,
        connectionTimeoutMs: params.connectionTimeoutMs,
        idleTimeoutMs: params.idleTimeoutMs,
        maxMessages: params.maxMessages,
      },
      (events) => {
        for (const event of events) params.emit(event);
      },
    );
  } catch (error) {
    if (params.signal?.aborted) {
      const aborted = new Error("Request cancelled by user");
      aborted.name = "AbortError";
      throw aborted;
    }
    throw error;
  } finally {
    params.signal?.removeEventListener("abort", cancel);
  }
}

class GrpcWebIdleTimeoutError extends Error {}

function normalizeTimeoutMs(value: number | undefined, fallback: number): number {
  const numeric = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.floor(numeric);
}

function readGrpcWebStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array<ArrayBufferLike>>,
  idleTimeoutMs: number,
) {
  return new Promise<ReadableStreamReadResult<Uint8Array<ArrayBufferLike>>>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new GrpcWebIdleTimeoutError(`Stream idle timeout after ${Math.ceil(idleTimeoutMs / 1000)}s.`)),
      idleTimeoutMs,
    );
    reader.read().then(
      (result) => {
        window.clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Normalizes the maximum number of response messages stored on the client.
 */
function normalizeMaxMessages(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 500;
  return Math.max(1, Math.floor(numeric));
}

/**
 * Ensures a decoded protobuf payload is a serializable object.
 */
function ensureObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Request JSON must be an object.");
  }

  return value as Record<string, unknown>;
}

/**
 * Builds the final gRPC-Web URL for a service/method pair.
 */
export function buildGrpcWebUrl(baseUrl: string, serviceName: string, methodName: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${serviceName}/${methodName}`;
}

function buildGrpcWebHeaders(metadata: MetadataPair[]): Record<string, string> {
  const contentType = "application/grpc-web-text+proto";
  return {
    "content-type": contentType,
    accept: contentType,
    "x-grpc-web": "1",
    "x-user-agent": "grpc-web-javascript/0.1",
    ...metadataPairsToRecord(metadata),
  };
}

type GrpcWebResponseEncoding = "text" | "binary";

/**
 * Uses the response Content-Type when available and otherwise defaults to text.
 * The browser client sends grpc-web-text for both unary and server streaming,
 * while explicit binary responses are still accepted for compatibility.
 */
function resolveGrpcWebResponseEncoding(contentType: string): GrpcWebResponseEncoding {
  const normalized = contentType.split(";", 1)[0].trim().toLowerCase();
  if (normalized === "application/grpc-web-text" || normalized === "application/grpc-web-text+proto") {
    return "text";
  }
  if (normalized === "application/grpc-web" || normalized === "application/grpc-web+proto") {
    return "binary";
  }
  return "text";
}

/**
 * Converts metadata key/value rows into a request header record.
 */
function metadataPairsToRecord(pairs: MetadataPair[]): Record<string, string> {
  const output: Record<string, string> = {};

  for (const pair of pairs) {
    const key = pair.key.trim();
    const value = pair.value.trim();

    if (!key) continue;
    output[key] = value;
  }

  return output;
}

/**
 * Converts Fetch headers into a serializable record.
 */
function headersToRecord(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

/**
 * Encodes a protobuf payload into one gRPC-Web frame.
 */
function encodeGrpcFrame(payload: Bytes, trailers: boolean): Bytes {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = trailers ? 0x80 : 0x00;
  const view = new DataView(frame.buffer);
  view.setUint32(1, payload.length, false);
  frame.set(payload, 5);
  return frame;
}

/**
 * Encodes bytes as base64 for gRPC-Web text requests.
 */
function base64Encode(bytes: Bytes): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Decodes percent-encoded grpc-message header values.
 */
function decodeGrpcMessage(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch {
    return value;
  }
}

/**
 * Converts unknown errors into serializable details for events and reports.
 */
function errorToPlainObject(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}
