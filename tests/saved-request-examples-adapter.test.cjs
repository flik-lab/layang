"use strict";

// On a saved collection request, the Saved requests menu works on that request's examples.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadTypeScriptModule } = require("./helpers/load-typescript-module.cjs");

const adapter = loadTypeScriptModule(
  path.join(__dirname, "..", "app/playground/features/saved-requests/request-examples-adapter.ts"),
  { prelude: 'let nextId = 0; const createId = () => "new-" + ++nextId;' },
);

const request = {
  id: "req-transmit-item",
  collectionId: "c",
  collectionName: "FE Main Display",
  name: "Transmit Item",
  kind: "grpc",
  url: "",
  body: "{}",
  headers: [],
  grpcMethodKey: "demo.v1.DataLink/TransmitItem",
};

test("saving the editor as a new saved request creates an example of that request", () => {
  const { examples, example } = adapter.saveEditorAsExample(
    [],
    request,
    { requestJson: '{"track":1}', metadata: [{ key: "x", value: "1", enabled: true }], assertionJson: '{"grpcStatus":"OK"}' },
    "Accepted",
  );
  assert.equal(examples.length, 1);
  assert.equal(example.requestId, "req-transmit-item");
  assert.deepEqual(example.requestRef, { id: "req-transmit-item" });
  assert.equal(example.serviceName, "demo.v1.DataLink");
  assert.equal(example.methodName, "TransmitItem");
  assert.equal(example.assertions, '{"grpcStatus":"OK"}');
});

test("saving over an existing one keeps its expectations and mock link", () => {
  const existing = {
    id: "ex-1",
    name: "Accepted",
    requestId: "req-transmit-item",
    serviceName: "demo.v1.DataLink",
    methodName: "TransmitItem",
    requestJson: "{}",
    metadata: [],
    expectedJson: '{"message":"OK"}',
    expectedStatus: "OK",
    mockScenario: "ok",
    assertions: '{"grpcStatus":"OK"}',
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const { examples, example } = adapter.saveEditorAsExample(
    [existing],
    request,
    { requestJson: '{"track":2}', metadata: [] },
    "Accepted",
    "ex-1",
  );
  assert.equal(examples.length, 1);
  assert.equal(example.requestJson, '{"track":2}');
  assert.equal(example.expectedStatus, "OK");
  assert.equal(example.mockScenario, "ok");
  assert.equal(example.assertions, '{"grpcStatus":"OK"}');
});

test("examples are listed in the Saved requests menu with the request's method", () => {
  const [item] = adapter.examplesAsSavedRequests(
    [{ id: "ex-1", name: "Accepted", requestJson: "{}", metadata: [], createdAt: "t" }],
    request,
  );
  assert.equal(item.id, "ex-1");
  assert.equal(item.kind, "grpc");
  assert.equal(item.snapshot.grpcMethodKey, "demo.v1.DataLink/TransmitItem");
});
