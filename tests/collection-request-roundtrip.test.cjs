"use strict";

// A collection request authored by hand or by the CLI must survive the desktop app opening and
// saving the workspace: fields the editor does not show are still committed request data.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { encodeRequestDocument, decodeRequestDocument } = require("../lib/workspace-v6-codec.cjs");

const document = {
  version: 2,
  kind: "request",
  info: { id: "req-stream", name: "Track Data Stream", protocol: "grpc", order: 0 },
  request: {
    grpc: { schema: { libraryId: "lib", revisionId: "rev" }, method: "demo.v1.Track/Watch", versionPolicy: "pinned" },
    timeoutMs: 3000,
    assertions: { grpcStatus: "DEADLINE_EXCEEDED", minMessages: 2 },
    defaults: { environment: "mock" },
    transport: { mode: "grpc-web", nativeTargetRef: "local-mock" },
  },
};

test("assertions, default environment and transport survive decode -> encode", () => {
  const decoded = decodeRequestDocument(document, "grpc");
  const encoded = encodeRequestDocument({ ...decoded.request, id: "req-stream", name: "Track Data Stream", kind: "grpc", order: 0 });
  assert.deepEqual(encoded.request.assertions, document.request.assertions);
  assert.deepEqual(encoded.request.defaults, document.request.defaults);
  assert.deepEqual(encoded.request.transport, document.request.transport);
  assert.equal(encoded.request.extensions, undefined);
});

test("the desktop collection normalizer keeps request fields its editor does not edit", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app/playground/features/workspace/workspace-model.ts"), "utf8");
  const start = source.indexOf("function normalizeApiCollectionRequests(");
  const body = source.slice(start, source.indexOf("\nfunction ", start + 1));
  for (const field of ["defaultEnvironmentKey", "assertionJson", "transportMode", "nativeTargetRef", "formFields", "extensions"]) {
    assert.match(body, new RegExp(`\\b${field}:`), `${field} is dropped when the desktop app opens a workspace`);
  }
});
