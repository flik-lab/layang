"use strict";

// One saved request per RPC, one example per scenario: examples run from the CLI, render in the
// request's docs, and appear as paired named examples in the gRPC OpenAPI document.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { encodeExampleDocument, decodeExampleDocument } = require("../lib/workspace-v6-codec.cjs");
const { buildGrpcOpenApi } = require("../lib/docs-protocol-references.cjs");
const { listExamples, examplesToRunItems } = require("../lib/cli-examples.cjs");
const { parseYaml, stringifyYaml } = require("../lib/workspace-yaml.cjs");

test("an example keeps its mock scenario link through decode -> encode", () => {
  const document = {
    version: 2,
    kind: "example",
    example: {
      id: "ex-taken",
      name: "Name taken",
      enabled: true,
      requestRef: { id: "req-validate" },
      input: { body: { name: "RP Waypoint" } },
      expected: { status: "OK", body: { valid: false } },
      mock: { scenario: "taken" },
    },
  };
  const decoded = decodeExampleDocument(document);
  assert.equal(decoded.mockScenario, "taken");
  assert.deepEqual(decoded.extensions, {});
  const encoded = encodeExampleDocument(decoded);
  assert.deepEqual(encoded.example.mock, { scenario: "taken" });
  assert.equal(encoded.example.extensions, undefined);
});

function grpcPage({ id, title, method, examples = [], stream = false, requestFields, responseFields }) {
  return {
    id: `request:${id}`,
    kind: "request",
    protocol: "grpc",
    title,
    request: { id, kind: "grpc", body: "{}" },
    contract: {
      methodFullName: method,
      requestType: "demo.v1.Req",
      responseType: "demo.v1.Reply",
      requestStream: false,
      responseStream: stream,
      sourceFile: "demo.proto",
      libraryName: "demo",
      revisionLabel: "v1",
      requestFields: requestFields || [{ name: "name", type: "string" }],
      responseFields: responseFields || [{ name: "valid", type: "bool" }],
    },
    examples,
  };
}

test("gRPC OpenAPI pairs request and response examples by name and keeps errors and streams apart", () => {
  const spec = buildGrpcOpenApi(
    [
      grpcPage({
        id: "validate",
        title: "Validate Name",
        method: "demo.v1.Names/Validate",
        examples: [
          { name: "Name taken", requestJson: '{"name":"RP Waypoint"}', expectedStatus: "OK", expectedJson: '{"valid":false}', mockScenario: "taken" },
          { name: "Unknown MOC", requestJson: '{"name":"x"}', expectedStatus: "5", expectedJson: "{}", mockScenario: "missing" },
          { name: "Hidden", enabled: false, requestJson: "{}", expectedStatus: "OK" },
        ],
      }),
      grpcPage({
        id: "watch",
        title: "Watch Tracks",
        method: "demo.v1.Tracks/Watch",
        stream: true,
        requestFields: [],
        responseFields: [
          { name: "tracks[]", type: "Track", repeated: true, nestedType: "demo.v1.Track" },
          { name: "tracks[].id", type: "uint64" },
          { name: "tracks[].kind", type: "Kind", enumValues: [{ name: "AIR" }, { name: "SURFACE" }] },
        ],
      }),
    ],
    "Demo",
  );
  assert.equal(spec.openapi, "3.1.0");
  const validate = spec.paths["/demo.v1.Names/Validate"].post;
  assert.equal(validate["x-grpc"].streaming, "unary");
  const requestExamples = validate.requestBody.content["application/json"].examples;
  assert.deepEqual(Object.keys(requestExamples), ["name-taken", "unknown-moc"]);
  assert.equal(requestExamples["name-taken"]["x-layang-mock-scenario"], "taken");
  assert.deepEqual(validate.responses["200"].content["application/json"].examples["name-taken"].value, { valid: false });
  assert.equal(validate.responses.default.content["application/json"].examples["unknown-moc"]["x-grpc-status"], "NOT_FOUND");

  const watch = spec.paths["/demo.v1.Tracks/Watch"].post;
  assert.equal(watch["x-grpc"].streaming, "server");
  const schema = watch.responses["200"].content["application/json"].schema;
  assert.equal(schema.type, "array");
  const track = schema.items.properties.tracks.items;
  assert.deepEqual(track.properties.id.type, ["integer", "string"]);
  assert.deepEqual(track.properties.kind.enum, ["AIR", "SURFACE"]);

  // The document survives Layang's own YAML writer and reader unchanged.
  assert.deepEqual(parseYaml(stringifyYaml(spec)), JSON.parse(JSON.stringify(spec)));
});

test("examples can be selected by collection and by the name of the request they belong to", () => {
  const workspace = {
    project: {
      collections: [
        {
          id: "c",
          name: "FE Main Display",
          folders: [],
          requests: [
            { id: "req-a", name: "Validate Name", kind: "grpc", grpcMethodKey: "demo.v1.Names/Validate" },
            { id: "req-b", name: "Validate Name (strict)", kind: "grpc", grpcMethodKey: "demo.v1.Names/Validate" },
          ],
        },
        { id: "o", name: "Other", folders: [], requests: [{ id: "req-o", name: "Other", kind: "grpc", grpcMethodKey: "demo.v1.Other/Call" }] },
      ],
      examples: [
        { id: "e1", name: "Taken", requestId: "req-a", serviceName: "demo.v1.Names", methodName: "Validate" },
        { id: "e2", name: "Strict", requestId: "req-b", serviceName: "demo.v1.Names", methodName: "Validate" },
        { id: "e3", name: "Other", requestId: "req-o", serviceName: "demo.v1.Other", methodName: "Call" },
      ],
    },
  };
  assert.deepEqual(listExamples(workspace, { collection: "FE Main Display" }).map((item) => item.id), ["e1", "e2"]);
  assert.deepEqual(listExamples(workspace, { request: "Validate Name (strict)" }).map((item) => item.id), ["e2"]);
  // Two requests share one RPC: the example runs with the request it is stored next to.
  const [item] = examplesToRunItems(workspace, [workspace.project.examples[1]], {});
  assert.equal(item.requestId, "req-b");
});

test("the desktop app keeps an example's request link and mock scenario when it saves", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app/playground/features/workspace/workspace-model.ts"), "utf8");
  const start = source.indexOf("function normalizeSavedExamples(");
  const body = source.slice(start, source.indexOf("\nfunction ", start + 1));
  for (const field of ["requestId", "requestRef", "mockScenario", "extensions"]) {
    assert.match(body, new RegExp(`\\b${field}\\b`), `${field} is dropped when the desktop app saves examples`);
  }
});
