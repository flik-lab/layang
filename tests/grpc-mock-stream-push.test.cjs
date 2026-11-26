"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createEnumValueLookup,
  createMockStreamPushRegistry,
  readMockPushTargets,
  renderMockTemplate,
  runMockPushes,
} = require("../lib/grpc-mock-stream-push.cjs");
const { startGatewayProfile, stopGatewayProfile } = require("../electron/services/grpc-gateway-server.cjs");

test("templates keep a whole-expression value's type and interpolate inside text", () => {
  const request = { latitude: -6.2, track: { name: "Alpha" }, environmentData: "ENV_LAND" };
  const enumValue = (name) => ({ ENV_LAND: 10 })[name];
  assert.deepEqual(
    renderMockTemplate(
      {
        id: "{{seq}}",
        latitude: "{{ request.latitude }}",
        label: "Track {{seq}} {{request.track.name}}",
        environment: "{{request.environmentData | enumValue}}",
        missing: "{{request.nothing}}",
        list: ["{{request.latitude | string}}", 3],
      },
      { request, seq: 9001, now: 0, enumValue },
    ),
    { id: 9001, latitude: -6.2, label: "Track 9001 Alpha", environment: 10, list: ["-6.2", 3] },
  );
  assert.throws(() => renderMockTemplate("{{secret}}", { request }), /Unknown template expression/);
  assert.throws(() => renderMockTemplate("{{request.environmentData | enumValue}}", { request }), /Unknown enum value/);
});

test("push targets are validated", () => {
  assert.deepEqual(readMockPushTargets({ data: {} }), []);
  assert.deepEqual(readMockPushTargets({ push: { method: "demo.Demo/Stream", data: { a: 1 } } }), [
    { method: "demo.Demo/Stream", mode: "message", data: { a: 1 }, sequenceStart: 1 },
  ]);
  assert.throws(() => readMockPushTargets({ push: [{ method: "Stream" }] }), /package.Service\/Method/);
  assert.throws(() => readMockPushTargets({ push: [{ method: "demo.Demo/Stream", mode: "append" }] }), /field is required/);
  assert.throws(() => readMockPushTargets({ push: [{ method: "demo.Demo/Stream", mode: "replace" }] }), /mode/);
});

test("append mode adds the item to every later message; message mode writes once to open streams", () => {
  const registry = createMockStreamPushRegistry();
  const written = [];
  const unregister = registry.register("demo.Demo/Stream", { write: (data) => written.push(data) });
  const sequences = new Map();
  const output = {
    push: [
      { method: "demo.Demo/Stream", mode: "append", field: "tracks", sequenceStart: 9001, data: { id: "{{seq}}" } },
      { method: "demo.Demo/Stream", data: { note: "created {{seq}}" } },
    ],
  };
  const first = runMockPushes({ registry, output, request: {}, sourceKey: "demo.Demo/Create", sequences, now: () => 0 });
  runMockPushes({ registry, output, request: {}, sourceKey: "demo.Demo/Create", sequences, now: () => 0 });
  assert.deepEqual(first.map((item) => [item.mode, item.delivered]), [["append", 1], ["message", 1]]);
  assert.deepEqual(written, [{ note: "created 1" }, { note: "created 2" }]);
  assert.deepEqual(registry.apply("demo.Demo/Stream", { tracks: [{ id: 1 }] }), {
    tracks: [{ id: 1 }, { id: 9001 }, { id: 9002 }],
  });
  // A stream that opens later still gets the appended items.
  unregister();
  assert.equal(registry.openCount("demo.Demo/Stream"), 0);
  assert.equal(registry.appendedCount("demo.Demo/Stream"), 2);
  registry.clear();
  assert.deepEqual(registry.apply("demo.Demo/Stream", { tracks: [] }), { tracks: [] });
});

test("enum names resolve to numbers from the proto package definition", () => {
  const lookup = createEnumValueLookup({
    "demo.Env": { format: "Protocol Buffer 3 EnumDescriptorProto", type: { value: [{ name: "ENV_AIR", number: 1 }] } },
    "demo.Demo": { Create: {} },
  });
  assert.equal(lookup("ENV_AIR"), 1);
  assert.equal(lookup("ENV_SEA"), undefined);
});

const PROTO = `syntax = "proto3";
package demo;
enum Env { ENV_ZERO = 0; ENV_AIR = 1; ENV_LAND = 10; }
message CreateRequest { double latitude = 1; Env environment_data = 2; string source_code = 3; }
message Reply { bool ok = 1; }
message Track { uint32 id = 1; double latitude = 2; uint32 environment = 3; string source = 4; }
message Snapshot { repeated Track tracks = 1; }
message Empty {}
service Demo {
  rpc Create(CreateRequest) returns (Reply);
  rpc Stream(Empty) returns (stream Snapshot);
}
`;

test("a mock unary call appends a Track to an open mock snapshot stream through the gateway", async (t) => {
  const profileId = `push-test-${process.pid}`;
  const status = await startGatewayProfile({
    profile: { id: profileId, mode: "mock", listenHost: "127.0.0.1", listenPort: 0, web: { enabled: false } },
    protoFiles: [{ name: "demo.proto", text: PROTO }],
    methods: [
      { serviceName: "demo.Demo", methodName: "Create", requestStream: false, responseStream: false },
      { serviceName: "demo.Demo", methodName: "Stream", requestStream: false, responseStream: true },
    ],
    scenarios: [
      {
        id: "snapshots",
        service: "demo.Demo",
        method: "Stream",
        stream: { intervalMs: 40, loop: true, responses: [{ data: { tracks: [{ id: 1, latitude: 1 }] } }] },
      },
      {
        id: "created",
        service: "demo.Demo",
        method: "Create",
        output: {
          code: 0,
          data: { ok: true },
          push: [
            {
              method: "demo.Demo/Stream",
              mode: "append",
              field: "tracks",
              sequenceStart: 9001,
              data: {
                id: "{{seq}}",
                latitude: "{{request.latitude}}",
                environment: "{{request.environmentData | enumValue}}",
                source: "{{request.sourceCode}}",
              },
            },
          ],
        },
      },
    ],
  });
  t.after(() => stopGatewayProfile(profileId));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layang-push-client-"));
  fs.writeFileSync(path.join(dir, "demo.proto"), PROTO);
  const definition = protoLoader.loadSync(path.join(dir, "demo.proto"), { keepCase: false, enums: String, defaults: true });
  const Demo = grpc.loadPackageDefinition(definition).demo.Demo;
  const client = new Demo(`127.0.0.1:${status.listenPort}`, grpc.credentials.createInsecure());
  t.after(() => client.close());

  const stream = client.stream({});
  t.after(() => stream.cancel());
  const created = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The pushed Track never arrived.")), 5000);
    let requested = false;
    stream.on("data", (message) => {
      if (!requested) {
        requested = true;
        client.create({ latitude: -6.2, environmentData: "ENV_LAND", sourceCode: "-" }, (error) => {
          if (error) reject(error);
        });
        return;
      }
      const pushed = message.tracks.find((track) => track.id === 9001);
      if (pushed) {
        clearTimeout(timer);
        resolve(message);
      }
    });
    stream.on("error", (error) => {
      if (error.code !== grpc.status.CANCELLED) reject(error);
    });
  });
  const message = await created;
  assert.equal(message.tracks.length, 2, "the scenario Track plus the created one");
  assert.deepEqual(
    { ...message.tracks.find((track) => track.id === 9001) },
    { id: 9001, latitude: -6.2, environment: 10, source: "-" },
  );
});
