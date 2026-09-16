"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const read = (path) => fs.readFileSync(path, "utf8");

test("decode worker releases decoded object and serialized JSON before awaiting document registration", () => {
  const source = read("lib/grpc-web-decode-worker-source.ts");
  assert.match(source, /prepareDocumentRegistration/);
  assert.match(source, /registerPreparedDocument/);
  assert.doesNotMatch(source, /const value = decodeProtobufMessage\(frame\.payload, schema\.rootType\);[\s\S]{0,240}await registerDocument\(serialized, preview\)/);
});


test("decode worker serializes protobuf directly to JSON text without building a full decoded object graph", () => {
  const source = read("lib/grpc-web-decode-worker-source.ts");
  assert.match(source, /decodeProtobufMessageToJson/);
  assert.match(source, /const serialized = decodeProtobufMessageToJson\(payload, schema\.rootType\)/);
  assert.doesNotMatch(source, /serializePayload\(decodeProtobufMessage\(payload, schema\.rootType\)\)/);
});
