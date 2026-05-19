"use strict";

const { ipcMain, net } = require("electron");
const { TextDecoder } = require("node:util");

const activeGrpcWebCalls = new Map();

function registerGrpcWebIpc() {
  ipcMain.handle("grpc-web:invoke", async (event, payload) => {
    const runId = payload?.runId ? String(payload.runId) : "";
    const url = payload?.url ? String(payload.url) : "";
    const headers = normalizeHeaders(payload?.headers || {});
    const body = typeof payload?.body === "string" ? payload.body : "";

    assertHttpUrl(url);

    const abortController = new AbortController();
    if (runId) activeGrpcWebCalls.set(runId, abortController);

    const send = (transportEvent) => {
      if (!runId || event.sender.isDestroyed()) return;
      event.sender.send(`grpc-web:event:${runId}`, transportEvent);
    };

    try {
      const response = await net.fetch(url, {
        method: "POST",
        headers,
        body,
        signal: abortController.signal,
      });

      const responseHeaders = headersToRecord(response.headers);
      send({
        type: "headers",
        httpStatus: response.status,
        ok: response.ok,
        statusText: response.statusText || "",
        headers: responseHeaders,
        contentType: response.headers.get("content-type") || "",
      });

      let rawTextBytes = 0;
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            const text = decoder.decode(chunk.value, { stream: true });
            if (text) {
              rawTextBytes += text.length;
              send({ type: "chunk", text, rawTextBytes });
            }
          }
        } finally {
          reader.releaseLock();
        }
        const finalText = decoder.decode();
        if (finalText) {
          rawTextBytes += finalText.length;
          send({ type: "chunk", text: finalText, rawTextBytes, final: true });
        }
      } else {
        const text = await response.text();
        rawTextBytes += text.length;
        if (text) send({ type: "chunk", text, rawTextBytes, final: true });
      }

      return {
        ok: response.ok,
        httpStatus: response.status,
        statusText: response.statusText || "",
        headers: responseHeaders,
        contentType: response.headers.get("content-type") || "",
        rawTextBytes,
      };
    } catch (error) {
      const normalized = errorToPlainObject(error);
      send({ type: "error", error: normalized });
      throw error;
    } finally {
      if (runId) activeGrpcWebCalls.delete(runId);
    }
  });

  ipcMain.handle("grpc-web:cancel", async (_event, payload) => {
    const runId = payload?.runId ? String(payload.runId) : "";
    const controller = activeGrpcWebCalls.get(runId);
    if (!controller) return { cancelled: false };

    controller.abort();
    activeGrpcWebCalls.delete(runId);
    return { cancelled: true };
  });
}

function normalizeHeaders(headers) {
  const output = {};
  if (!headers || typeof headers !== "object") return output;

  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = String(key).trim();
    if (!normalizedKey) continue;
    if (value === undefined || value === null) continue;
    output[normalizedKey] = String(value);
  }

  return output;
}

function assertHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_error) {
    throw new Error("Invalid gRPC-Web URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Electron gRPC-Web transport only allows http:// and https:// URLs.");
  }
}

function headersToRecord(headers) {
  const output = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function errorToPlainObject(error) {
  if (!error || typeof error !== "object") return { message: String(error) };
  return {
    name: error.name ? String(error.name) : "Error",
    message: error.message ? String(error.message) : String(error),
    stack: error.stack ? String(error.stack) : undefined,
  };
}

module.exports = { registerGrpcWebIpc };
