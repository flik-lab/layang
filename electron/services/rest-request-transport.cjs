"use strict";

const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

function normalizeRestRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("HTTP request must be an object.");
  }
  const url = new URL(String(input.url || ""));
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Only HTTP and HTTPS are supported.");
  }
  const method = String(input.method || "GET").toUpperCase();
  if (!/^[A-Z]{1,24}$/.test(method)) throw new TypeError("Invalid HTTP method.");
  const body = input.body === undefined || input.body === null ? undefined : input.body;
  if (body !== undefined && (typeof body !== "string" || Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES)) {
    throw new RangeError("HTTP request body exceeds the transport limit.");
  }
  if (body !== undefined && (method === "GET" || method === "HEAD")) {
    throw new TypeError(`${method} requests cannot contain a body.`);
  }
  const headers = new Headers(input.headers || {});
  return { url: url.toString(), method, body, headers };
}

async function readBoundedBody(response, limitBytes = MAX_RESPONSE_BYTES) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > limitBytes) {
        await reader.cancel("Response exceeds the configured memory limit.").catch(() => undefined);
        throw new RangeError("HTTP response exceeds the configured memory limit.");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, byteLength).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}

function createRestRequestTransport(options = {}) {
  if (typeof options.fetcher !== "function") throw new TypeError("Electron net.fetch is required.");
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    async invoke(input, signal) {
      const request = normalizeRestRequest(input);
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const compositeSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const response = await options.fetcher(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body !== undefined ? { body: request.body } : {}),
        signal: compositeSignal,
        credentials: "omit",
      });
      return {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: await readBoundedBody(response, maxResponseBytes),
      };
    },
  };
}

module.exports = {
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  DEFAULT_TIMEOUT_MS,
  normalizeRestRequest,
  readBoundedBody,
  createRestRequestTransport,
};
