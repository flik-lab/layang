"use strict";

const RUNTIME_PROTOCOL_VERSION = 1;

function normalizeRequestId(value) {
  const requestId = typeof value === "string" ? value.trim() : "";
  if (!requestId) throw new TypeError("Runtime command requestId must be a non-empty string.");
  return requestId;
}

function normalizeCommandType(value) {
  const type = typeof value === "string" ? value.trim() : "";
  if (!type) throw new TypeError("Runtime command type must be a non-empty string.");
  return type;
}

function assertProtocolVersion(value) {
  if (value !== RUNTIME_PROTOCOL_VERSION) {
    throw new RangeError(
      `Unsupported runtime protocol version: ${String(value)}. Expected ${RUNTIME_PROTOCOL_VERSION}.`,
    );
  }
  return value;
}

function createCommandEnvelope(requestId, type, payload = null) {
  return {
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    requestId: normalizeRequestId(requestId),
    type: normalizeCommandType(type),
    payload,
  };
}

function validateCommandEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Runtime command envelope must be an object.");
  }
  assertProtocolVersion(value.protocolVersion);
  normalizeRequestId(value.requestId);
  normalizeCommandType(value.type);
  return value;
}

function createSuccessResponse(requestId, payload = null) {
  return {
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    requestId: normalizeRequestId(requestId),
    type: "response",
    ok: true,
    payload,
  };
}

function createErrorResponse(requestId, error) {
  return {
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    requestId: normalizeRequestId(requestId),
    type: "response",
    ok: false,
    error: error?.message ? String(error.message) : String(error || "Runtime command failed."),
  };
}

function createEventEnvelope(event, payload = null) {
  const eventName = typeof event === "string" ? event.trim() : "";
  if (!eventName) throw new TypeError("Runtime event must be a non-empty string.");
  return {
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    type: "event",
    event: eventName,
    payload,
  };
}

function isResponseEnvelope(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.protocolVersion === RUNTIME_PROTOCOL_VERSION &&
      value.type === "response" &&
      typeof value.requestId === "string",
  );
}

function isEventEnvelope(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.protocolVersion === RUNTIME_PROTOCOL_VERSION &&
      value.type === "event" &&
      typeof value.event === "string",
  );
}

module.exports = {
  RUNTIME_PROTOCOL_VERSION,
  assertProtocolVersion,
  createCommandEnvelope,
  createErrorResponse,
  createEventEnvelope,
  createSuccessResponse,
  isEventEnvelope,
  isResponseEnvelope,
  validateCommandEnvelope,
};
