"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const protobuf = require("protobufjs");
const { loadTypeScriptModule } = require("./helpers/load-typescript-module.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const SCHEMA = `
syntax = "proto3";
package demo.v1;
enum Mood { MOOD_UNKNOWN = 0; MOOD_HAPPY = 1; }
message Inner { repeated string tags = 1; Mood mood = 2; }
message SayHelloRequest {
  string name = 1;
  int32 age = 2;
  int64 big = 3;
  Mood mood = 4;
  Inner inner = 5;
  map<int32, string> labels = 6;
  repeated Inner items = 7;
  bytes blob = 8;
  bool flag = 9;
  double ratio = 10;
  oneof choice { string text = 11; int32 number = 12; }
  map<bool, Inner> flags = 13;
}
service GreeterService { rpc SayHello (SayHelloRequest) returns (SayHelloRequest); }
`;

const PROTO2_SCHEMA = `
syntax = "proto2";
package legacy;
enum Kind { A = 1; B = 2; }
message Req { required string id = 1; optional Kind kind = 2; map<int64, Kind> kinds = 3; }
`;

function parse(source) {
  return protobuf.parse(source, { keepCase: false }).root;
}

function loadInlineEncoder() {
  return loadTypeScriptModule("lib/grpc-web-client.ts", {
    prelude: 'const { normalizeRequestFieldNames } = require("./grpc-request-field-names.cjs");',
  });
}

function loadEncoderWorker() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "layang-encoder-worker-"));
  execFileSync(process.execPath, [path.join(root, "scripts/build-proto-catalog-worker.cjs"), outDir]);
  const source = fs.readFileSync(path.join(outDir, "grpc-web-request-encoder.worker.js"), "utf8");
  fs.rmSync(outDir, { recursive: true, force: true });
  const responses = [];
  const self = { postMessage(value) { responses.push(value); } };
  vm.runInNewContext(source, { self, console, TextDecoder, TextEncoder });
  return {
    responses,
    send(data) {
      self.onmessage({ data });
      return responses.at(-1);
    },
  };
}

test("request encoder worker bundle encodes exactly like the inline renderer encoder", () => {
  const { encodeGrpcWebRequestPayload } = loadInlineEncoder();
  const schema = parse(SCHEMA);
  const requestType = schema.lookupType("demo.v1.SayHelloRequest");
  const worker = loadEncoderWorker();
  const requestJson = {
    name: "Ada",
    age: 37,
    big: 9007199254740,
    mood: "MOOD_HAPPY",
    inner: { tags: ["a", "b"], mood: "MOOD_HAPPY" },
    labels: { 7: "seven" },
    items: [{ tags: ["x"] }],
    flag: true,
    ratio: 0.5,
    text: "hi",
  };

  const inline = Buffer.from(encodeGrpcWebRequestPayload(requestType, requestJson));
  const first = worker.send({ id: 1, key: "root-1", rootJson: schema.toJSON(), requestType: "demo.v1.SayHelloRequest", requestJson });
  assert.equal(first.error, undefined);
  assert.equal(first.id, 1);
  assert.deepEqual(Buffer.from(first.payload), inline);
  assert.equal(first.payload.byteOffset, 0);
  assert.equal(first.payload.buffer.byteLength, first.payload.length);

  // Proto (snake_case) names and a cached root: no schema needed the second time.
  const second = worker.send({ id: 2, key: "root-1", requestType: ".demo.v1.SayHelloRequest", requestJson: { name: "Ada", age: 37 } });
  assert.deepEqual(Buffer.from(second.payload), Buffer.from(encodeGrpcWebRequestPayload(requestType, { name: "Ada", age: 37 })));
  const decoded = requestType.decode(new Uint8Array(first.payload));
  assert.equal(decoded.name, "Ada");
  assert.equal(decoded.mood, 1);
  assert.equal(decoded.inner.tags.length, 2);
});

test("request encoder worker reports the same errors as the inline renderer encoder", () => {
  const { encodeGrpcWebRequestPayload } = loadInlineEncoder();
  const schema = parse(SCHEMA);
  const requestType = schema.lookupType("demo.v1.SayHelloRequest");
  const worker = loadEncoderWorker();
  worker.send({ id: 0, key: "k", rootJson: schema.toJSON(), requestType: "demo.v1.SayHelloRequest", requestJson: {} });

  const cases = [
    [],
    "text",
    null,
    { nmae: "typo" },
    { age: "old" },
    { mood: "MOOD_MISSING" },
    { inner: { tags: [1] } },
    { text: "a", number: 1 },
  ];
  cases.forEach((requestJson, index) => {
    let expected = null;
    try { encodeGrpcWebRequestPayload(requestType, requestJson); } catch (error) { expected = error.message; }
    assert.ok(expected, `case ${index} should fail inline`);
    const response = worker.send({ id: index + 1, key: "k", requestType: "demo.v1.SayHelloRequest", requestJson });
    assert.equal(response.error, expected, `case ${index}`);
  });
  assert.equal(worker.send({ id: 99, key: "k", requestType: "demo.v1.SayHelloRequest", requestJson: [] }).error, "Request JSON must be an object.");
  assert.match(worker.send({ id: 100, key: "k", requestType: "demo.v1.SayHelloRequest", requestJson: { nmae: "x" } }).error, /^Unknown field in SayHelloRequest request: nmae\./);
  assert.equal(worker.send({ id: 101, key: "k", requestType: "demo.v1.SayHelloRequest", requestJson: { age: "x" } }).error, "Invalid request payload: age: integer expected");
});

test("request encoder worker asks for the schema when it has no root for the key and evicts old roots", () => {
  const schema = parse(SCHEMA);
  const worker = loadEncoderWorker();
  assert.deepEqual({ ...worker.send({ id: 1, key: "unknown", requestType: "demo.v1.SayHelloRequest", requestJson: {} }) }, { id: 1, missingSchema: true });
  for (let index = 0; index < 9; index += 1) {
    const response = worker.send({ id: 10 + index, key: `root-${index}`, rootJson: schema.toJSON(), requestType: "demo.v1.SayHelloRequest", requestJson: { name: "x" } });
    assert.equal(response.error, undefined);
  }
  assert.equal(worker.send({ id: 30, key: "root-0", requestType: "demo.v1.SayHelloRequest", requestJson: {} }).missingSchema, true);
  assert.equal(worker.send({ id: 31, key: "root-8", requestType: "demo.v1.SayHelloRequest", requestJson: {} }).missingSchema, undefined);
});

test("renderer gRPC-Web client encodes requests in the file-based worker, not with page codegen", () => {
  const client = read("lib/grpc-web-client.ts");
  const workerClient = read("lib/grpc-web-request-encoder-client.ts");
  const invoke = client.slice(client.indexOf("export async function invokeGrpcWebText"), client.indexOf("export function encodeGrpcWebRequestPayload"));
  assert.match(invoke, /canEncodeGrpcWebRequestInWorker\(\)\s*\?\s*await encodeGrpcWebRequestInWorker/);
  assert.doesNotMatch(invoke, /requestType\.(verify|fromObject|encode)\(/);
  assert.match(workerClient, /workers\/grpc-web-request-encoder\.worker\.js/);
  assert.match(workerClient, /new Worker\(new URL\(workerPath, window\.location\.href\)/);
  assert.doesNotMatch(workerClient, /new Blob|createObjectURL/, "blob: workers inherit the page CSP and cannot run protobufjs codegen");
  assert.match(read(".gitignore"), /^public\/workers\/grpc-web-request-encoder\.worker\.js$/m);
});

test("codegen-free protobuf verifier matches protobufjs Type#verify", () => {
  const { verifyProtobufMessage } = loadTypeScriptModule("lib/protobuf-verify.ts", {
    prelude: 'const protobuf = require("protobufjs");',
  });
  const proto3 = parse(SCHEMA).lookupType("demo.v1.SayHelloRequest");
  const proto2 = parse(PROTO2_SCHEMA).lookupType("legacy.Req");
  const samples = [
    null, 5, "x", [], {},
    { name: "a", age: 1, big: 2, mood: 1, flag: false, ratio: 1 },
    { name: new String("a") }, { name: 1 }, { age: 1.5 }, { age: "1" }, { big: "1" }, { big: { low: 1, high: 0 } }, { big: { low: 1 } },
    { mood: 7 }, { mood: 1.5 }, { mood: "MOOD_HAPPY" }, { ratio: "1" }, { flag: 1 }, { blob: "AAE=" }, { blob: [1, 2] }, { blob: 3 },
    { inner: 1 }, { inner: { tags: "a" } }, { inner: { tags: ["a", 2] } }, { inner: { mood: "x" } }, { inner: null },
    { labels: [] }, { labels: "x" }, { labels: { a: "x" } }, { labels: { "-3": "x" } }, { labels: { 1: 2 } },
    { items: {} }, { items: [{ tags: [1] }] }, { items: [null] },
    { text: "a", number: 1 }, { text: "a" }, { number: "1" }, { text: null, number: 1 },
    { flags: { true: {} } }, { flags: { yes: {} } }, { flags: { 1: { tags: [3] } } },
  ];
  for (const sample of samples) {
    assert.equal(verifyProtobufMessage(proto3, sample), proto3.verify(sample), JSON.stringify(sample));
  }
  const proto2Samples = [{}, { id: "a" }, { id: "a", kind: 1 }, { id: "a", kind: 3 }, { id: "a", kind: 1.0 }, { id: "a", kinds: { 5: 2 } }, { id: "a", kinds: { x: 2 } }, { id: "a", kinds: { 5: 9 } }];
  for (const sample of proto2Samples) {
    assert.equal(verifyProtobufMessage(proto2, sample), proto2.verify(sample), JSON.stringify(sample));
  }
  const deep = { inner: {} };
  assert.equal(verifyProtobufMessage(proto3, deep), null);
});
