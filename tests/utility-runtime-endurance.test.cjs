"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPayloadDocumentStore } = require("../lib/runtime/payload/payload-document-store.cjs");
const { createNativeGrpcRuntime } = require("../lib/runtime/grpc/native-grpc-runtime.cjs");

test("logical 10-minute 1Hz large stream honors configured five-document retention", async () => {
  const store = createPayloadDocumentStore();
  store.setRetentionLimit(5);
  const raw = JSON.stringify({ tracks: Array.from({ length: 10000 }, (_, id) => ({ id, x: id / 10, y: id / 20, label: `TRACK-${id}` })) });
  assert.ok(raw.length > 500_000);
  const bytes = Uint8Array.from(Buffer.from(raw));
  let metadataEvents = 0;
  const runtime = createNativeGrpcRuntime({
    payloadStore: store,
    generation: "endurance",
    invokeNativeGrpc: async (_payload, emit) => {
      const previews = [];
      for (let index = 0; index < 600; index += 1) {
        previews.push(raw.slice(0, 128));
        emit({ type: "message", index, serializedValueUtf8: bytes, preview: raw.slice(0, 128), originalChars: raw.length });
      }
      return { headers: {}, trailers: { "grpc-status": "0" }, messages: previews, totalMessages: 600, droppedMessages: 0 };
    },
  });
  runtime.subscribe((event) => {
    if (event.event !== "grpc.messageMeta") return;
    metadataEvents += 1;
    assert.equal("serializedValueUtf8" in event.payload, false);
    assert.equal("value" in event.payload, false);
  });
  const result = await runtime.handle("grpc.invoke", { runId: "ten-minute" });
  const stats = store.debugStats();
  assert.equal(metadataEvents, 600);
  assert.equal(stats.documentCount, 5);
  assert.ok(stats.rawBytes <= bytes.byteLength * 5);
  assert.equal(result.messageDocumentRefs.length, 5);
  assert.equal(result.messages.length, 5);
});
