"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");

test("native gRPC payload port is attached directly to the payload worker instead of consumed in renderer client", () => {
  const nativeClient = read("lib/native-grpc-client.ts");
  const payloadService = read("app/playground/features/response-viewer/payload-document/payloadDocument.service.ts");
  const requestRunner = read("app/playground/hooks/use-request-runner.ts");

  assert.doesNotMatch(nativeClient, /nativeGrpcPayloadPort\.onmessage|serializedValueUtf8|toOwnedArrayBuffer/);
  assert.match(nativeClient, /documentRef/);
  assert.match(payloadService, /ensureNativeGrpcProducerPort/);
  assert.match(payloadService, /attachProducerPort/);
  assert.match(requestRunner, /ensureNativeGrpcProducerPort/);
  assert.doesNotMatch(requestRunner, /registerSerializedDocument/);
});

test("Electron main waits for payload-worker registration ack before publishing compact message metadata", () => {
  const ipc = read("electron/ipc/native-grpc-ipc.cjs");
  assert.match(ipc, /register-utf8/);
  assert.match(ipc, /documentRef/);
  assert.match(ipc, /pendingPayloadRegistrations/);
  assert.match(ipc, /Promise\.all/);
  assert.doesNotMatch(ipc, /serializedValueUtf8:\s*grpcEvent\.serializedValueUtf8/);
});

test("Latest follow uses quiet coalescing with a bounded maximum staleness", () => {
  const source = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
  assert.match(source, /LATEST_FOLLOW_QUIET_MS/);
  assert.match(source, /LATEST_FOLLOW_MAX_STALENESS_MS/);
  assert.match(source, /pendingLatestIdRef/);
  assert.match(source, /quietTimerRef/);
  assert.match(source, /maxStalenessTimerRef/);
});

test("JSON hydration is priority-aware and user-opened viewers use the interactive queue", () => {
  const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
  const viewportHook = read("app/playground/features/response-viewer/json-document/useJsonViewport.ts");
  const scheduler = read("app/playground/features/response-viewer/document-session/documentHydrationScheduler.ts");
  const service = read("app/playground/features/response-viewer/payload-document/payloadDocument.service.ts");
  const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
  const message = read("app/playground/features/response-viewer/message-list/MessageDetailPane.tsx");

  assert.match(viewer, /priority/);
  assert.match(viewportHook, /priority/);
  assert.match(scheduler, /user-visible/);
  assert.match(scheduler, /latest-visible/);
  assert.match(scheduler, /prefetch/);
  assert.doesNotMatch(service, /interactiveHydrationQueue|backgroundHydrationQueue/);
  assert.match(latest, /priority=\{state\.mode === "follow" \? "background" : "interactive"\}/);
  assert.match(message, /priority="interactive"/);
});

test("Latest stays live by auto-hydrating a coalesced latest document and locks on user navigation", () => {
  const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
  const follow = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
  assert.doesNotMatch(latest, /Inspect latest JSON/);
  assert.match(latest, /JsonDocumentViewer/);
  assert.match(latest, /onUserNavigate=\{holdCommitted\}/);
  assert.match(latest, /Following latest/);
  assert.match(follow, /mode: "hold"/);
  assert.match(follow, /jumpLatest/);
});
