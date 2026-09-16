"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("large looping gRPC streams reuse snapshots and bound retained messages", () => {
  const runtime = read("electron/services/grpc-mock-server.cjs");
  const constants = read("app/playground/shared/workbench-constants.ts");
  const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");

  const cacheGuard = runtime.indexOf("if (cachedSnapshotVersion === runtime.configVersion) return cachedSnapshot");
  const responseFingerprints = runtime.indexOf(
    "const fingerprints = createRuntimeStreamResponseFingerprints(responses)",
  );
  const responseSignature = runtime.indexOf('const responseSignature = fingerprints.join("\\n")');
  assert.ok(cacheGuard >= 0 && responseFingerprints > cacheGuard && responseSignature > responseFingerprints);
  assert.match(constants, /maxMessagesPerRequest = 50/);
  assert.match(constants, /maxRetainedMessagesPerRequest = 10/);
  assert.match(liveEvents, /MAX_FINAL_MESSAGE_EVENTS = maxRetainedMessagesPerRequest/);
  assert.match(liveEvents, /large full payloads live in the bounded external cache/);
  assert.doesNotMatch(liveEvents, /events\.map\(stripFullPayloadFromMessage\)/);
});
