"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function createDocumentPort() {
  const documents = new Map();
  const port = {
    onmessage: null,
    start() {},
    close() {},
    postMessage(message) {
      if (message.type !== "register-utf8") return;
      const rawText = new TextDecoder().decode(new Uint8Array(message.buffer));
      documents.set(message.id, rawText);
      queueMicrotask(() => port.onmessage?.({ data: {
        type: "registered",
        requestId: message.requestId,
        documentRef: { id: message.id, preview: message.preview, originalChars: message.originalChars },
      }}));
    },
  };
  return { port, documents };
}

function loadWorkerRuntime() {
  const sourceFile = fs.readFileSync("lib/grpc-web-decode-worker-source.ts", "utf8");
  const match = sourceFile.match(/String\.raw`([\s\S]*)`;\s*$/);
  assert.ok(match, "worker source template must be readable");
  const responses = [];
  const self = { postMessage(value) { responses.push(value); } };
  const context = vm.createContext({ self, close() {}, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, DataView, BigInt, atob, btoa, Map, Promise, Error, String, Number, Boolean, Array, Object, Math, queueMicrotask });
  vm.runInContext(match[1], context, { filename: "grpc-web-decode-worker-runtime.js" });
  return { self, responses };
}

async function post(self, responses, data) {
  await self.onmessage({ data });
  await new Promise((resolve) => setImmediate(resolve));
  const response = responses.findLast((item) => item.requestId === data.requestId);
  assert.ok(response, `worker response for ${data.requestId}`);
  if (response.type === "error") throw new Error(response.error);
  return response;
}

function varint(value) {
  let remaining = BigInt(value);
  const bytes = [];
  while (remaining >= 0x80n) { bytes.push(Number((remaining & 0x7fn) | 0x80n)); remaining >>= 7n; }
  bytes.push(Number(remaining));
  return bytes;
}
function grpcFrame(flag, payload) {
  const frame = Buffer.alloc(5 + payload.length); frame[0] = flag; frame.writeUInt32BE(payload.length, 1); Buffer.from(payload).copy(frame, 5); return frame;
}
function lengthDelimitedField(fieldId, payload) { return Buffer.from([(fieldId << 3) | 2, ...varint(payload.length), ...payload]); }
function uint32Field(fieldId, value) { return Buffer.from([(fieldId << 3) | 0, ...varint(value)]); }

const trackSchema = {
  rootType: "demo.TrackBatch",
  messages: {
    "demo.TrackBatch": { name: "demo.TrackBatch", fields: [{ id: 1, name: "tracks", kind: "message", typeName: "demo.Track", repeated: true, map: false, packed: false }] },
    "demo.Track": { name: "demo.Track", fields: [
      { id: 1, name: "id", kind: "scalar", scalarType: "string", repeated: false, map: false, packed: false },
      { id: 2, name: "x", kind: "scalar", scalarType: "uint32", repeated: false, map: false, packed: false },
      { id: 3, name: "y", kind: "scalar", scalarType: "uint32", repeated: false, map: false, packed: false },
    ] },
  }, enums: {}, unsupportedReasons: [],
};

test("decode worker preserves grpc-web text ordering while registering payload documents", async () => {
  const { self, responses } = loadWorkerRuntime();
  const { port, documents } = createDocumentPort();
  const schema = { rootType: "demo.Response", messages: { "demo.Response": { name: "demo.Response", fields: [{ id: 1, name: "id", kind: "scalar", scalarType: "string", repeated: false, map: false, packed: false }] } }, enums: {}, unsupportedReasons: [] };
  await post(self, responses, { type: "init", requestId: "init", schema, responseEncoding: "text", maxPreviewChars: 256, payloadDocumentPort: port, documentPrefix: "test" });
  const id = Buffer.from("abc", "utf8");
  const message = Buffer.from([0x0a, ...varint(id.length), ...id]);
  const trailer = Buffer.from("grpc-status: 0\r\ngrpc-message: \r\n", "utf8");
  const encoded = Buffer.concat([grpcFrame(0, message), grpcFrame(0x80, trailer)]).toString("base64");
  const bytes = new TextEncoder().encode(encoded);
  const batch = await post(self, responses, { type: "chunk", requestId: "chunk", buffer: bytes.buffer, final: true });
  assert.equal(batch.batch.frames.length, 2);
  assert.equal(batch.batch.frames[0].kind, "message");
  assert.equal(batch.batch.frames[0].value, undefined);
  assert.equal(batch.batch.frames[0].documentRef.id, "test:message:1");
  assert.deepEqual(JSON.parse(documents.get("test:message:1")), { id: "abc" });
  assert.deepEqual(JSON.parse(JSON.stringify(batch.batch.frames[1])), { kind: "trailers", trailers: { "grpc-status": "0", "grpc-message": "" } });
});

test("decode worker handles a chunked 1000-track response without cloning the full object to renderer", async () => {
  const { self, responses } = loadWorkerRuntime();
  const { port, documents } = createDocumentPort();
  await post(self, responses, { type: "init", requestId: "init", schema: trackSchema, responseEncoding: "text", maxPreviewChars: 512, payloadDocumentPort: port, documentPrefix: "tracks" });
  const encodedTracks = [];
  for (let index = 0; index < 1000; index += 1) {
    const id = Buffer.from(`TRACK-${String(index).padStart(4, "0")}`, "utf8");
    const track = Buffer.concat([lengthDelimitedField(1, id), uint32Field(2, index * 3), uint32Field(3, index * 7)]);
    encodedTracks.push(lengthDelimitedField(1, track));
  }
  const encoded = grpcFrame(0, Buffer.concat(encodedTracks)).toString("base64");
  const pieces = [];
  for (let offset = 0; offset < encoded.length; offset += 173) pieces.push(encoded.slice(offset, offset + 173));
  for (let index = 0; index < pieces.length; index += 1) {
    const bytes = new TextEncoder().encode(pieces[index]);
    await post(self, responses, { type: "chunk", requestId: `chunk-${index}`, buffer: bytes.buffer, final: index === pieces.length - 1 });
  }
  const frames = responses.filter((item) => item.type === "batch").flatMap((item) => item.batch.frames);
  assert.equal(frames.length, 1);
  const ref = frames[0].documentRef;
  assert.equal(ref.preview.length, 512);
  const stored = JSON.parse(documents.get(ref.id));
  assert.equal(stored.tracks.length, 1000);
  assert.equal(stored.tracks[999].id, "TRACK-0999");
});

test("decode worker reports incomplete frames only on normal finalization", async () => {
  const { self, responses } = loadWorkerRuntime();
  const { port } = createDocumentPort();
  const schema = { rootType: "demo.Empty", messages: { "demo.Empty": { name: "demo.Empty", fields: [] } }, enums: {}, unsupportedReasons: [] };
  await post(self, responses, { type: "init", requestId: "init", schema, responseEncoding: "binary", payloadDocumentPort: port });
  const partial = Uint8Array.from([0, 0, 0, 0, 5, 8]);
  await self.onmessage({ data: { type: "chunk", requestId: "partial", buffer: partial.buffer, final: true } });
  const response = responses.find((item) => item.requestId === "partial");
  assert.equal(response.type, "error");
  assert.match(response.error, /incomplete frame/);
});

test("decode worker preserves map, packed repeated, enum, defaults, and 64-bit JSON semantics", async () => {
  const { self, responses } = loadWorkerRuntime();
  const { port, documents } = createDocumentPort();
  const schema = {
    rootType: "demo.Mixed",
    messages: {
      "demo.Mixed": { name: "demo.Mixed", fields: [
        { id: 1, name: "scores", kind: "scalar", scalarType: "uint32", repeated: false, map: true, keyType: "string", packed: false },
        { id: 2, name: "values", kind: "scalar", scalarType: "uint32", repeated: true, map: false, packed: true },
        { id: 3, name: "state", kind: "enum", typeName: "demo.State", repeated: false, map: false, packed: false },
        { id: 4, name: "note", kind: "scalar", scalarType: "string", repeated: false, map: false, packed: false },
        { id: 5, name: "counter", kind: "scalar", scalarType: "uint64", repeated: false, map: false, packed: false },
      ] },
    },
    enums: { "demo.State": { name: "demo.State", valuesById: { "0": "UNKNOWN", "1": "ACTIVE" }, defaultName: "UNKNOWN" } },
    unsupportedReasons: [],
  };
  await post(self, responses, { type: "init", requestId: "mixed-init", schema, responseEncoding: "binary", maxPreviewChars: 256, payloadDocumentPort: port, documentPrefix: "mixed" });

  const mapEntry = Buffer.concat([
    lengthDelimitedField(1, Buffer.from("alpha", "utf8")),
    uint32Field(2, 7),
  ]);
  const packedValues = Buffer.from([...varint(1), ...varint(2), ...varint(300)]);
  const message = Buffer.concat([
    lengthDelimitedField(1, mapEntry),
    lengthDelimitedField(2, packedValues),
    uint32Field(3, 1),
    Buffer.from([(5 << 3) | 0, ...varint(900719)]),
  ]);
  const frame = grpcFrame(0, message);
  const bytes = new Uint8Array(frame);
  const batch = await post(self, responses, { type: "chunk", requestId: "mixed-chunk", buffer: bytes.buffer, final: true });
  const stored = JSON.parse(documents.get(batch.batch.frames[0].documentRef.id));
  assert.deepEqual(stored, {
    scores: { alpha: 7 },
    values: [1, 2, 300],
    state: "ACTIVE",
    note: "",
    counter: "900719",
  });
});
