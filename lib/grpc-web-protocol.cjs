"use strict";

const dataFrameFlag = 0x00;
const trailerFrameFlag = 0x80;

function normalizeGrpcWebContentType(value) {
  const normalized = String(value || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (normalized === "application/grpc-web-text" || normalized === "application/grpc-web-text+proto") {
    return { valid: true, text: true, responseContentType: "application/grpc-web-text+proto" };
  }
  if (normalized === "application/grpc-web" || normalized === "application/grpc-web+proto") {
    return { valid: true, text: false, responseContentType: "application/grpc-web+proto" };
  }
  return { valid: false, text: false, responseContentType: "application/grpc-web+proto" };
}

function decodeGrpcWebRequestBody(body, textMode, maxBytes = 10 * 1024 * 1024) {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
  // Base64 expands binary data by ~4/3. Keep some room for whitespace/newlines
  // emitted by external grpc-web-text clients while still bounding memory use.
  if (raw.length > maxBytes * 2) throw new Error("gRPC-Web request body exceeds the configured limit.");
  const bytes = textMode ? decodeGrpcWebTextBody(raw, maxBytes) : raw;
  if (bytes.length > maxBytes) throw new Error("Decoded gRPC-Web request exceeds the configured limit.");
  const frames = parseFrames(bytes);
  const dataFrames = frames.filter((frame) => frame.kind === "data");
  if (dataFrames.length !== 1)
    throw new Error(
      `Unary gRPC-Web calls must contain exactly one request message frame; received ${dataFrames.length}.`,
    );
  return dataFrames[0].payload;
}

/**
 * Decodes grpc-web-text request bodies from both browser-style single base64
 * entities and streaming clients that flush independently padded base64
 * entities. Concatenated padded entities are legal in grpc-web-text streams,
 * but Node's Buffer.from(fullText, "base64") stops at the first '=' padding.
 * That made external clients look like they had sent an incomplete gRPC frame
 * even though Layang's own client (which sends one base64 entity) worked.
 */
function decodeGrpcWebTextBody(body, maxBytes = 10 * 1024 * 1024) {
  const compact = Buffer.from(body || [])
    .toString("ascii")
    .replace(/[\r\n\t ]+/g, "");

  if (!compact) throw new Error("Empty grpc-web-text request body.");
  if (/[^A-Za-z0-9+/=]/.test(compact)) {
    throw new Error(
      "Invalid grpc-web-text base64 body. Expected standard base64 characters (whitespace is allowed).",
    );
  }

  const chunks = [];
  let decodedBytes = 0;
  let offset = 0;

  while (offset < compact.length) {
    const firstPadding = compact.indexOf("=", offset);
    let end = compact.length;

    if (firstPadding >= 0) {
      end = firstPadding;
      while (end < compact.length && compact[end] === "=") end += 1;
    }

    let entity = compact.slice(offset, end);
    const rawLength = entity.length;
    if (rawLength % 4 === 1) {
      throw new Error(
        `Invalid grpc-web-text base64 length near character ${offset}; a base64 entity cannot end with one leftover character.`,
      );
    }
    if (firstPadding >= 0 && rawLength % 4 !== 0) {
      throw new Error(
        `Invalid grpc-web-text base64 padding near character ${firstPadding}. ` +
          "Layang accepts both one continuous base64 body and concatenated padded grpc-web-text chunks.",
      );
    }
    if (firstPadding < 0 && rawLength % 4 !== 0) {
      entity = entity.padEnd(rawLength + (4 - (rawLength % 4)), "=");
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/.test(entity)) {
      throw new Error(
        `Invalid grpc-web-text base64 padding near character ${offset}. ` +
          "Layang accepts both one continuous base64 body and concatenated padded grpc-web-text chunks.",
      );
    }

    const decoded = Buffer.from(entity, "base64");
    decodedBytes += decoded.length;
    if (decodedBytes > maxBytes) throw new Error("Decoded gRPC-Web request exceeds the configured limit.");
    if (decoded.length) chunks.push(decoded);
    offset = end;
  }

  return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, decodedBytes);
}

function parseFrames(bytes) {
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const frames = [];
  let offset = 0;
  while (offset < input.length) {
    if (input.length - offset < 5) {
      throw new Error(
        `Incomplete gRPC-Web frame header at byte ${offset}: ${input.length - offset} byte(s) remain, but 5 are required. ` +
          "For grpc-web-text clients, ensure the complete base64 body is forwarded without truncation.",
      );
    }
    const flag = input[offset];
    const length = input.readUInt32BE(offset + 1);
    const end = offset + 5 + length;
    if (end > input.length) {
      const available = Math.max(0, input.length - (offset + 5));
      throw new Error(
        `Incomplete gRPC-Web frame payload at byte ${offset}: frame declares ${length} payload byte(s), ` +
          `but only ${available} are available. For grpc-web-text clients, this usually means the base64 stream was truncated ` +
          "or decoded only up to an intermediate '=' padding boundary.",
      );
    }
    const payload = input.subarray(offset + 5, end);
    if ((flag & trailerFrameFlag) === trailerFrameFlag) {
      frames.push({ kind: "trailers", flag, payload, trailers: parseTrailerPayload(payload) });
    } else {
      if ((flag & 0x01) === 0x01) throw new Error("Compressed gRPC-Web request frames are not supported.");
      frames.push({ kind: "data", flag, payload });
    }
    offset = end;
  }
  return frames;
}

function encodeDataFrame(payload) {
  return encodeFrame(dataFrameFlag, payload);
}

function encodeGrpcWebTextFrame(frame) {
  return Buffer.from(frame || []).toString("base64");
}

function encodeTrailerFrame(status, message = "", metadata = {}) {
  const lines = [];
  lines.push(`grpc-status: ${normalizeStatus(status)}`);
  lines.push(`grpc-message: ${encodeGrpcMessage(message)}`);
  for (const [key, values] of Object.entries(metadata || {})) {
    const lower = String(key).trim().toLowerCase();
    if (!lower || lower === "grpc-status" || lower === "grpc-message") continue;
    const list = Array.isArray(values) ? values : [values];
    for (const value of list) {
      if (value === undefined || value === null) continue;
      const encoded =
        Buffer.isBuffer(value) || lower.endsWith("-bin")
          ? Buffer.from(value).toString("base64")
          : String(value).replace(/[\r\n]+/g, " ");
      lines.push(`${lower}: ${encoded}`);
    }
  }
  return encodeFrame(trailerFrameFlag, Buffer.from(`${lines.join("\r\n")}\r\n`, "ascii"));
}

function encodeFrame(flag, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || []);
  const frame = Buffer.allocUnsafe(5 + body.length);
  frame[0] = flag;
  frame.writeUInt32BE(body.length, 1);
  body.copy(frame, 5);
  return frame;
}

class GrpcWebTextEncoder {
  constructor() {
    this.pending = Buffer.alloc(0);
  }

  push(bytes, final = false) {
    const input = this.pending.length
      ? Buffer.concat([this.pending, Buffer.from(bytes || [])])
      : Buffer.from(bytes || []);
    const completeLength = final ? input.length : input.length - (input.length % 3);
    const complete = input.subarray(0, completeLength);
    this.pending = final ? Buffer.alloc(0) : input.subarray(completeLength);
    return complete.length ? complete.toString("base64") : "";
  }

  flush() {
    return this.push(Buffer.alloc(0), true);
  }
}

function parseGrpcTimeout(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,8})([HMSmun])$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const multipliers = {
    H: 60 * 60 * 1000,
    M: 60 * 1000,
    S: 1000,
    m: 1,
    u: 1 / 1000,
    n: 1 / 1_000_000,
  };
  return Math.max(1, Math.ceil(amount * multipliers[match[2]]));
}

function parseTrailerPayload(payload) {
  const output = {};
  for (const line of Buffer.from(payload || [])
    .toString("ascii")
    .split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key) output[key] = value;
  }
  return output;
}

function encodeGrpcMessage(message) {
  if (!message) return "";
  return encodeURIComponent(String(message)).replace(/%20/g, "%20");
}

function normalizeStatus(value) {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 2;
}

module.exports = {
  GrpcWebTextEncoder,
  decodeGrpcWebRequestBody,
  decodeGrpcWebTextBody,
  encodeDataFrame,
  encodeGrpcWebTextFrame,
  encodeTrailerFrame,
  normalizeGrpcWebContentType,
  parseFrames,
  parseGrpcTimeout,
};
