"use strict";

const MAX_NATIVE_PREVIEW_CHARS = 8_192;

/**
 * Serializes one decoded grpc-js message exactly once in Electron main.
 * The renderer receives compact UTF-8 bytes + preview, never the decoded object graph.
 */
function serializeNativeGrpcMessage(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    serialized = JSON.stringify({
      serializationError: error instanceof Error ? error.message : String(error),
      value: String(value),
    });
  }
  if (typeof serialized !== "string") serialized = "null";
  const preview = serialized.length <= MAX_NATIVE_PREVIEW_CHARS
    ? serialized
    : `${serialized.slice(0, MAX_NATIVE_PREVIEW_CHARS)}…`;
  return {
    serializedValueUtf8: Buffer.from(serialized, "utf8"),
    preview,
    originalChars: serialized.length,
  };
}

module.exports = { MAX_NATIVE_PREVIEW_CHARS, serializeNativeGrpcMessage };
