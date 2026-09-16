"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createNativeGrpcRuntime } = require("../lib/runtime/grpc/native-grpc-runtime.cjs");
const { createPayloadDocumentStore } = require("../lib/runtime/payload/payload-document-store.cjs");

test("native utility runtime emits document metadata without raw payload bytes", async () => {
  const payloadStore = createPayloadDocumentStore();
  const raw = JSON.stringify({ tracks: Array.from({ length: 1000 }, (_, id) => ({ id, label: `T-${id}` })) });
  const bytes = Uint8Array.from(Buffer.from(raw));
  const runtime = createNativeGrpcRuntime({
    payloadStore,
    invokeNativeGrpc: async (_payload, emit) => {
      emit({ type: "message", index: 0, serializedValueUtf8: bytes, preview: raw.slice(0, 64), originalChars: raw.length });
      return {
        headers: {}, trailers: { "grpc-status": "0" }, messages: [raw.slice(0, 64)], totalMessages: 1, droppedMessages: 0,
      };
    },
  });
  const events = [];
  runtime.subscribe((event) => events.push(event));
  const result = await runtime.handle("grpc.invoke", { runId: "run-1" });

  const message = events.find((event) => event.event === "grpc.messageMeta");
  assert.ok(message);
  assert.equal(message.payload.documentRef.id, "grpc:run-1:0");
  assert.equal("serializedValueUtf8" in message.payload, false);
  assert.equal("value" in message.payload, false);
  assert.equal("buffer" in message.payload, false);
  assert.deepEqual(result.messageDocumentRefs, [message.payload.documentRef]);
  assert.equal(payloadStore.getText(message.payload.documentRef.id, "raw"), raw);
});
