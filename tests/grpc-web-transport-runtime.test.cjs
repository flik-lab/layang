"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPayloadDocumentStore } = require("../lib/runtime/payload/payload-document-store.cjs");
const { createGrpcWebTransportRuntime } = require("../lib/runtime/grpc-web/grpc-web-transport-runtime.cjs");

function frame(payload, trailer = false) {
  const body = Buffer.from(payload);
  const output = Buffer.allocUnsafe(5 + body.length);
  output[0] = trailer ? 0x80 : 0;
  output.writeUInt32BE(body.length, 1);
  body.copy(output, 5);
  return output;
}

function textResponse(parts) {
  const encoded = Buffer.concat(parts).toString("base64");
  const chunks = [encoded.slice(0, 7), encoded.slice(7, 23), encoded.slice(23)];
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/grpc-web-text", "grpc-status": "0" }),
    body: stream,
  };
}

test("transport runtime decodes in utility and emits document metadata instead of full payload", async () => {
  const payloadStore = createPayloadDocumentStore();
  const events = [];
  const runtime = createGrpcWebTransportRuntime({
    payloadStore,
    fetchImpl: async () => textResponse([
      frame(Buffer.from("first")),
      frame(Buffer.from("second")),
      frame(Buffer.from("grpc-status: 0\r\n"), true),
    ]),
    decodeMessageToJson: (bytes) => JSON.stringify({ value: new TextDecoder().decode(bytes) }),
  });
  runtime.subscribe((event) => events.push(event));

  const result = await runtime.handle("grpcWeb.invoke", {
    runId: "run-a",
    url: "http://localhost/example.Service/Stream",
    headers: { "content-type": "application/grpc-web-text" },
    body: "AAAAAA==",
    responseEncoding: "text",
    maxMessages: 10,
  });

  assert.equal(result.totalMessages, 2);
  assert.equal(result.messageDocumentRefs.length, 2);
  assert.match(result.messageDocumentRefs[0].id, /^transport:run-a:/);
  assert.deepEqual(await payloadStore.handle("payload.getLines", { id: result.messageDocumentRefs[0].id, start: 0, count: 5 }), ["{", '  "value": "first"', "}"]);

  const messageEvent = events.find((event) => event.event === "grpcWeb.message");
  assert.ok(messageEvent);
  assert.ok(messageEvent.payload.documentRef);
  assert.equal(messageEvent.payload.retentionLimit, 10);
  assert.equal(Object.hasOwn(messageEvent.payload, "value"), false);
  assert.equal(Object.hasOwn(messageEvent.payload, "serializedValueUtf8"), false);
  await runtime.dispose();
});

test("large messages honor the configured runtime payload retention", async () => {
  const payloadStore = createPayloadDocumentStore();
  payloadStore.setRetentionLimit(5);
  let counter = 0;
  const runtime = createGrpcWebTransportRuntime({
    payloadStore,
    fetchImpl: async () => {
      const parts = [];
      for (let index = 0; index < 12; index += 1) parts.push(frame(Buffer.from(String(index))));
      parts.push(frame(Buffer.from("grpc-status: 0\r\n"), true));
      return textResponse(parts);
    },
    decodeMessageToJson: () => JSON.stringify({ data: "x".repeat(300_000), counter: counter++ }),
  });

  const result = await runtime.handle("grpcWeb.invoke", {
    runId: "run-big",
    url: "http://localhost/example.Service/Stream",
    headers: { "content-type": "application/grpc-web-text" },
    body: "AAAAAA==",
    responseEncoding: "text",
    maxMessages: 50,
  });
  const stats = payloadStore.debugStats();
  assert.equal(stats.documentCount, 5);
  assert.equal(result.messageDocumentRefs.length, 5);
  assert.equal(result.messages.length, 5);
  for (const ref of result.messageDocumentRefs) assert.equal(payloadStore.has(ref.id), true);
  await runtime.dispose();
});
