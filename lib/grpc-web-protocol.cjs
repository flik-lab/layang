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
  if (raw.length > maxBytes * 2) throw new Error("gRPC-Web request body exceeds the configured limit.");
  const bytes = textMode ? Buffer.from(raw.toString("ascii").replace(/[\r\n\t ]+/g, ""), "base64") : raw;
  if (bytes.length > maxBytes) throw new Error("Decoded gRPC-Web request exceeds the configured limit.");
  const frames = parseFrames(bytes);
  const dataFrames = frames.filter((frame) => frame.kind === "data");
  if (dataFrames.length !== 1)
    throw new Error("Browser gRPC-Web calls must contain exactly one request message frame.");
  return dataFrames[0].payload;
}

function parseFrames(bytes) {
  const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const frames = [];
  let offset = 0;
  while (offset < input.length) {
    if (input.length - offset < 5) throw new Error("Incomplete gRPC-Web frame header.");
    const flag = input[offset];
    const length = input.readUInt32BE(offset + 1);
    const end = offset + 5 + length;
    if (end > input.length) throw new Error("Incomplete gRPC-Web frame payload.");
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
  encodeDataFrame,
  encodeGrpcWebTextFrame,
  encodeTrailerFrame,
  normalizeGrpcWebContentType,
  parseFrames,
  parseGrpcTimeout,
};
