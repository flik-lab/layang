import type * as protobuf from "protobufjs";
import type { GrpcEvent, GrpcFrame, GrpcResult, MetadataPair, RpcMethodInfo } from "./types";

type Bytes = Uint8Array<ArrayBufferLike>;

type InvokeGrpcWebTextParams = {
  baseUrl: string;
  root: protobuf.Root;
  method: RpcMethodInfo;
  requestJson: unknown;
  metadata?: MetadataPair[];
  signal?: AbortSignal;
  maxMessages?: number;
  onEvent?: (event: GrpcEvent) => void;
};

/**
 * Invokes a gRPC-Web text endpoint and streams decoded events to the UI.
 */
export async function invokeGrpcWebText(params: InvokeGrpcWebTextParams): Promise<GrpcResult> {
  const emit = params.onEvent ?? (() => undefined);

  if (params.method.requestStream) {
    throw new Error("Client streaming and bidirectional streaming are not supported by this browser gRPC-Web tester.");
  }

  const requestType = params.root.lookupType(params.method.requestType);
  const responseType = params.root.lookupType(params.method.responseType);
  const requestObject = ensureObject(params.requestJson);
  const verifyError = requestType.verify(requestObject);

  if (verifyError) {
    throw new Error(`Invalid request payload: ${verifyError}`);
  }

  const requestMessage = requestType.fromObject(requestObject);
  const requestPayload = requestType.encode(requestMessage).finish();
  const requestFrame = encodeGrpcFrame(requestPayload, false);
  const requestBody = base64Encode(requestFrame);
  const responseStream = params.method.responseStream;
  const headers = buildGrpcWebHeaders(params.metadata ?? [], responseStream);
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

type InvokeGrpcWebTextAttemptParams = InvokeGrpcWebTextParams & {
  emit: (event: GrpcEvent) => void;
  requestPayload: Uint8Array;
  requestBody: string;
  headers: Record<string, string>;
  responseType: protobuf.Type;
};

async function invokeGrpcWebTextAttempt(params: InvokeGrpcWebTextAttemptParams): Promise<GrpcResult> {
  const upstreamUrl = buildGrpcWebUrl(params.baseUrl, params.method.serviceName, params.method.methodName);
  const requestUrl = upstreamUrl;
  const startedTimestamp = new Date();
  const startedAt = performance.now();

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
      note: "Electron desktop can bypass browser CORS when webSecurity is disabled; regular browsers still require APISIX CORS.",
    },
  });

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: params.headers,
      body: params.requestBody,
      signal: params.signal,
    });
  } catch (error) {
    params.emit({
      type: "error",
      message: "Network request failed before gRPC headers were received.",
      details: errorToPlainObject(error),
    });
    throw error;
  }

  const responseHeaders = headersToRecord(response.headers);
  const contentType = response.headers.get("content-type") ?? "";

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

  const frameParser = new GrpcWebFrameParser();
  const textDecoder = new TextDecoder();
  const base64Stream = new GrpcWebTextBase64Decoder();
  const messages: unknown[] = [];
  const maxMessages = normalizeMaxMessages(params.maxMessages);
  let totalMessages = 0;
  let droppedMessages = 0;
  let trailers: Record<string, string> = {};
  let rawTextBytes = 0;
  let decodedBinaryBytes = 0;
  let dataFrames = 0;
  let trailerFrames = 0;

  const processBytes = (bytes: Uint8Array) => {
    decodedBinaryBytes += bytes.length;
    params.emit({
      type: "log",
      level: "debug",
      message: "Decoded gRPC-Web text chunk",
      details: { decodedBytes: bytes.length, totalDecodedBytes: decodedBinaryBytes },
    });

    const frames = frameParser.push(bytes);

    if (frames.length === 0) {
      params.emit({
        type: "log",
        level: "debug",
        message: "Waiting for a complete gRPC frame",
        details: frameParser.getBufferState(),
      });
      return;
    }

    for (const frame of frames) {
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
          details: {
            frame: trailerFrames,
            grpcStatus: status ?? "<missing>",
            grpcMessage: decodeGrpcMessage(message),
            trailers,
          },
        });
        continue;
      }

      dataFrames += 1;
      totalMessages += 1;

      try {
        const decoded = params.responseType.decode(frame.payload);
        const value = params.responseType.toObject(decoded, {
          longs: String,
          enums: String,
          bytes: String,
          defaults: true,
          arrays: true,
          objects: true,
        });

        if (maxMessages > 0 && messages.length >= maxMessages) {
          droppedMessages += 1;
          messages.shift();
          if (droppedMessages === 1) {
            params.emit({
              type: "log",
              level: "warn",
              message:
                "Message capture limit reached; older response messages are replaced while the stream continues.",
              details: { maxMessages },
            });
          }
        }

        messages.push(value);
        params.emit({
          type: "message",
          index: totalMessages - 1,
          value,
        });
        params.emit({
          type: "log",
          level: "info",
          message: `Message #${totalMessages} decoded`,
          details: {
            frame: dataFrames,
            messageIndex: totalMessages - 1,
            storedMessages: messages.length,
            bytes: frame.payload.length,
          },
        });
      } catch (error) {
        params.emit({
          type: "error",
          message: "Failed to decode response message with selected proto response type.",
          details: {
            responseType: params.method.responseType,
            frameBytes: frame.payload.length,
            error: errorToPlainObject(error),
          },
        });
        throw error;
      }
    }
  };

  if (!response.body) {
    params.emit({
      type: "log",
      level: "warn",
      message: "ReadableStream is not available; response will be processed after completion.",
    });
    const text = await response.text();
    rawTextBytes += text.length;
    for (const bytes of base64Stream.push(text, true)) {
      processBytes(bytes);
    }
  } else {
    const reader = response.body.getReader();
    const cancelReader = () => {
      params.emit({ type: "log", level: "warn", message: "Abort requested; cancelling response reader immediately." });
      void reader.cancel("Request cancelled by user").catch(() => undefined);
    };

    if (params.signal?.aborted) cancelReader();
    params.signal?.addEventListener("abort", cancelReader, { once: true });

    try {
      while (true) {
        if (params.signal?.aborted) break;
        const chunk = await reader.read();
        if (chunk.done) break;

        const text = textDecoder.decode(chunk.value, { stream: true });
        rawTextBytes += text.length;
        params.emit({
          type: "log",
          level: "debug",
          message: "Response stream chunk received",
          details: { rawTextBytes: text.length, totalRawTextBytes: rawTextBytes },
        });

        for (const bytes of base64Stream.push(text, false)) {
          processBytes(bytes);
        }
      }
    } finally {
      params.signal?.removeEventListener("abort", cancelReader);
      reader.releaseLock();
    }

    const finalText = textDecoder.decode();
    if (finalText) {
      rawTextBytes += finalText.length;
      params.emit({
        type: "log",
        level: "debug",
        message: "Final response decoder chunk received",
        details: { rawTextBytes: finalText.length, totalRawTextBytes: rawTextBytes },
      });
    }
    for (const bytes of base64Stream.push(finalText, true)) {
      processBytes(bytes);
    }
  }

  if (params.signal?.aborted && !trailers["grpc-status"]) {
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
        message:
          "No gRPC trailer frame was found. Using grpc-status metadata from response headers instead.",
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

function buildGrpcWebHeaders(metadata: MetadataPair[], _responseStream: boolean): Record<string, string> {
  return {
    "content-type": "application/grpc-web-text+proto",
    accept: "application/grpc-web-text+proto",
    "x-grpc-web": "1",
    "x-user-agent": "grpc-web-javascript/0.1",
    ...metadataPairsToRecord(metadata),
  };
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

class GrpcWebFrameParser {
  private buffer: Bytes = new Uint8Array(0);

  push(chunk: Bytes): GrpcFrame[] {
    this.buffer = concatBytes(this.buffer, chunk);
    const frames: GrpcFrame[] = [];
    let offset = 0;

    while (this.buffer.length - offset >= 5) {
      const flag = this.buffer[offset];
      const length = readUint32BE(this.buffer, offset + 1);
      const frameEnd = offset + 5 + length;

      if (this.buffer.length < frameEnd) break;

      const payload = this.buffer.slice(offset + 5, frameEnd);
      const isTrailer = (flag & 0x80) === 0x80;
      const isCompressed = (flag & 0x01) === 0x01;

      if (isCompressed) {
        throw new Error(
          "Compressed gRPC-Web frames are not supported in this MVP. Disable grpc-encoding for this tester route.",
        );
      }

      if (isTrailer) {
        frames.push({
          kind: "trailers",
          payload,
          trailers: parseTrailerBlock(payload),
        });
      } else {
        frames.push({ kind: "data", payload });
      }

      offset = frameEnd;
    }

    this.buffer = this.buffer.slice(offset);
    return frames;
  }

  getBufferState() {
    return {
      bufferedBytes: this.buffer.length,
      hasHeader: this.buffer.length >= 5,
      expectedPayloadBytes: this.buffer.length >= 5 ? readUint32BE(this.buffer, 1) : null,
    };
  }
}

class GrpcWebTextBase64Decoder {
  private pending = "";

  push(text: string, final: boolean): Bytes[] {
    this.pending += text.replace(/\s+/g, "");
    const chunks: Bytes[] = [];

    while (this.pending.length >= 4) {
      const paddedEntityEnd = findPaddedBase64EntityEnd(this.pending);

      if (paddedEntityEnd > 0) {
        const entity = this.pending.slice(0, paddedEntityEnd);
        chunks.push(base64Decode(entity));
        this.pending = this.pending.slice(paddedEntityEnd);
        continue;
      }

      const decodableLength = this.pending.length - (this.pending.length % 4);

      if (decodableLength <= 0) break;

      if (!final && decodableLength === this.pending.length) {
        // Keep one 4-byte quantum buffered. Some proxies flush base64 text in tiny chunks;
        // retaining a small tail avoids aggressive decoding without blocking real-time frames.
        if (decodableLength <= 4) break;
        const entity = this.pending.slice(0, decodableLength - 4);
        chunks.push(base64Decode(entity));
        this.pending = this.pending.slice(decodableLength - 4);
        continue;
      }

      const entity = this.pending.slice(0, decodableLength);
      chunks.push(base64Decode(entity));
      this.pending = this.pending.slice(decodableLength);
    }

    if (final && this.pending.length > 0) {
      const padded = this.pending.padEnd(Math.ceil(this.pending.length / 4) * 4, "=");
      chunks.push(base64Decode(padded));
      this.pending = "";
    }

    return chunks;
  }
}

/**
 * Finds the end of a valid padded base64 entity in a streamed text chunk.
 */
function findPaddedBase64EntityEnd(text: string): number {
  const firstPadding = text.indexOf("=");

  if (firstPadding === -1) return -1;

  let end = firstPadding;
  while (end < text.length && text[end] === "=") end += 1;

  const remainder = end % 4;
  if (remainder !== 0) {
    const adjustedEnd = end + (4 - remainder);
    if (adjustedEnd > text.length) return -1;
    return adjustedEnd;
  }

  return end;
}

/**
 * Parses a gRPC-Web trailer frame into trailer key/value pairs.
 */
function parseTrailerBlock(payload: Bytes): Record<string, string> {
  const text = new TextDecoder().decode(payload);
  const trailers: Record<string, string> = {};

  for (const line of text.split("\r\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    trailers[key] = value;
  }

  return trailers;
}

/**
 * Concatenates two byte arrays without mutating either input.
 */
function concatBytes(left: Bytes, right: Bytes): Bytes {
  if (left.length === 0) return new Uint8Array(right);
  if (right.length === 0) return new Uint8Array(left);

  const output = new Uint8Array(left.length + right.length);
  output.set(left, 0);
  output.set(right, left.length);
  return output;
}

/**
 * Reads a big-endian unsigned 32-bit integer from a byte array.
 */
function readUint32BE(bytes: Bytes, offset: number): number {
  return bytes[offset] * 2 ** 24 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
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
 * Decodes base64 text into bytes for gRPC-Web text responses.
 */
function base64Decode(text: string): Bytes {
  const binary = atob(text);
  const bytes: Bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
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
