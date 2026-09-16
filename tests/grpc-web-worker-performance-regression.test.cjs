"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { loadTypeScriptModule } = require("./helpers/load-typescript-module.cjs");
const read = (path) => fs.readFileSync(path, "utf8");

test("gRPC-Web worker schema is serializable and rejects unsupported group fields", () => {
  const schema = read("lib/grpc-web-worker-schema.ts");
  assert.match(schema, /export type GrpcWebWorkerSchema/);
  assert.match(schema, /buildGrpcWebWorkerSchema/);
  assert.match(schema, /canDecodeInGrpcWebWorker/);
  assert.match(schema, /field\.type === "group"/);
  assert.doesNotMatch(schema, /\bany\b/);
});

test("gRPC-Web response decode worker uses Blob bootstrap, chunk acknowledgements, and a payload-document port", () => {
  const client = read("lib/grpc-web-decode-worker-client.ts");
  const source = read("lib/grpc-web-decode-worker-source.ts");
  assert.match(client, /new Blob/);
  assert.match(client, /new Worker\(workerUrl/);
  assert.doesNotMatch(client, /new Worker\(\s*new URL/);
  assert.match(client, /producerPort/);
  assert.match(source, /payloadDocumentPort/);
  assert.match(source, /prepareDocumentRegistration/);
  assert.match(source, /registerPreparedDocument/);
  assert.match(source, /decodeProtobufMessage/);
  assert.match(source, /parseFrames/);
});

test("browser gRPC-Web transport delegates every response chunk to the decode worker and cleans up runtime owners", () => {
  const grpcWeb = read("lib/grpc-web-client.ts");
  const workerClient = read("lib/grpc-web-decode-worker-client.ts");
  assert.match(grpcWeb, /createGrpcWebDecodeWorkerClient/);
  assert.match(grpcWeb, /await decodeWorker\.processChunk/);
  assert.match(grpcWeb, /decodeWorker\.dispose\(\)/);
  assert.match(grpcWeb, /payloadChannel\.release\(\)/);
  assert.match(workerClient, /transportLifecycleStore\.increment\("activeDecodeWorkers"\)/);
  assert.match(workerClient, /transportLifecycleStore\.increment\("pendingDecodeAcks"\)/);
  assert.match(workerClient, /transportLifecycleStore\.decrement\("pendingDecodeAcks"/);
  assert.match(workerClient, /transportLifecycleStore\.decrement\("activeDecodeWorkers"\)/);
  assert.doesNotMatch(grpcWeb, /GrpcWebFrameParser|processBytesFallback/);
});


test("gRPC-Web request normalization accepts enum names across scalar and composite fields", () => {
  const { normalizeProtobufRequestObject } = loadTypeScriptModule("lib/grpc-web-client.ts");
  const statusEnum = { values: { UNKNOWN: 0, ACTIVE: 1 } };
  const nestedType = {
    resolveAll() {},
    fieldsArray: [
      { name: "status", resolvedType: statusEnum, map: false, repeated: false },
    ],
  };
  const requestType = {
    resolveAll() {},
    fieldsArray: [
      { name: "status", resolvedType: statusEnum, map: false, repeated: false },
      { name: "history", resolvedType: statusEnum, map: false, repeated: true },
      { name: "lookup", resolvedType: statusEnum, map: true, repeated: false },
      { name: "nested", resolvedType: nestedType, map: false, repeated: false },
      { name: "items", resolvedType: nestedType, map: false, repeated: true },
    ],
  };

  const normalized = normalizeProtobufRequestObject(requestType, {
    status: "ACTIVE",
    history: ["UNKNOWN", 1],
    lookup: { current: "ACTIVE" },
    nested: { status: "UNKNOWN" },
    items: [{ status: "ACTIVE" }],
  });

  assert.deepEqual(normalized, {
    status: 1,
    history: [0, 1],
    lookup: { current: 1 },
    nested: { status: 0 },
    items: [{ status: 1 }],
  });
});

test("gRPC-Web request normalization preserves unknown enum names for downstream validation", () => {
  const { normalizeProtobufRequestObject } = loadTypeScriptModule("lib/grpc-web-client.ts");
  const requestType = {
    resolveAll() {},
    fieldsArray: [
      { name: "status", resolvedType: { values: { UNKNOWN: 0 } }, map: false, repeated: false },
    ],
  };

  const normalized = normalizeProtobufRequestObject(requestType, { status: "MISSING" });
  assert.equal(normalized.status, "MISSING");
});

test("live response ingestion is bounded and coalesces excess message previews", () => {
  const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
  assert.match(liveEvents, /MAX_PENDING_MESSAGE_EVENTS_PER_SESSION/);
  assert.match(liveEvents, /coalescedMessageCount/);
  assert.match(liveEvents, /pending\.messages\.length >= MAX_PENDING_MESSAGE_EVENTS_PER_SESSION/);
});

test("final response reconciliation only registers the bounded retained event tail", () => {
  const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
  const runner = read("app/playground/hooks/use-request-runner.ts");
  assert.match(liveEvents, /slice\(-MAX_FINAL_MESSAGE_EVENTS/);
  assert.match(liveEvents, /prepareUiEventForDocumentStore/);
  assert.match(runner, /compactUiEventsForResponse\(targetSessionId, resultToUiEvents\(result\)\)/);
});

test("cancelled or timed out streams only finalize the decode worker after a clean stream end", () => {
  const grpcWeb = read("lib/grpc-web-client.ts");
  assert.match(grpcWeb, /if \(!requestController\.signal\.aborted && !timeoutMessage\) await processWorkerChunk\(new Uint8Array\(0\), true\)/);
});

test("per-message gRPC-Web telemetry stays debug-only", () => {
  const grpcWeb = read("lib/grpc-web-client.ts");
  const marker = `message: \`Message #\${totalMessages} decoded\``;
  const markerIndex = grpcWeb.indexOf(marker);
  assert.notEqual(markerIndex, -1);
  const blockStart = grpcWeb.lastIndexOf("params.emit({", markerIndex);
  assert.match(grpcWeb.slice(blockStart, markerIndex + marker.length), /level: "debug"/);
});

test("decoded objects are serialized once and transferred worker-to-worker as payload documents", () => {
  const source = read("lib/grpc-web-decode-worker-source.ts");
  const grpcWeb = read("lib/grpc-web-client.ts");
  const eventUtils = read("app/playground/features/request-runner/request-result-utils.ts");
  assert.match(source, /JSON\.stringify/);
  assert.match(source, /new TextEncoder/);
  assert.match(source, /prepareDocumentRegistration/);
  assert.match(source, /registerPreparedDocument/);
  assert.match(grpcWeb, /messageDocumentRefs\.push\(frame\.documentRef\)/);
  assert.match(eventUtils, /result\.messageDocumentRefs\?\.\[index\]/);
});

test("transient document refs are removed before client and localStorage persistence", () => {
  const workspace = read("app/playground/features/workspace/workspace-model.ts");
  const runner = read("app/playground/hooks/use-request-runner.ts");
  assert.match(workspace, /messageDocumentRefs: _messageDocumentRefs/);
  assert.match(runner, /messageDocumentRefs: _messageDocumentRefs/);
  assert.match(workspace, /documentId: _documentId/);
});

test("large gRPC-Web payloads are owned by the global document worker, not a decoder payload token store", () => {
  const source = read("lib/grpc-web-decode-worker-source.ts");
  const types = read("lib/types.ts");
  assert.match(source, /payloadDocumentPort/);
  assert.doesNotMatch(source, /payloadStore|payloadToken|get-payload/);
  assert.match(types, /documentRef: ResponseDocumentRef/);
  assert.doesNotMatch(types, /payloadToken/);
});

test("activity rail icons never render navigation loading spinners or sx keyframes", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  assert.doesNotMatch(sidebar, /@keyframes sidebar-navigation-spin|navigationPending|Loading \{pendingSection/);
});
