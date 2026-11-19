"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const protobuf = require("protobufjs");

const { normalizeRequestFieldNames, alignKeysToActual } = require("../lib/grpc-request-field-names.cjs");
const { loadGrpcProtoWorkspace } = require("../lib/load-grpc-proto-workspace.cjs");
const { mockMatcherMatches } = require("../lib/mock-runtime.cjs");

const PROTO = `
syntax = "proto3";
package demo.v1;
enum DataLinkType { DATA_LINK_TYPE_UNSPECIFIED = 0; DATA_LINK_TYPE_LINK_ID = 1; }
message Point { double latitude = 1; double longitude = 2; string point_name = 3; }
message SetMessageRequest {
  uint32 tactical_track_number = 1;
  DataLinkType data_link_type = 2;
  repeated Point point_list = 3;
  map<string, Point> named_points = 4;
  Point center_point = 5;
}
message SetMessageReply { string message = 1; }
service ContextMenuDataLink { rpc TransmitItem (SetMessageRequest) returns (SetMessageReply); }
`;

/** The request type as Layang loads it (protobufjs, keepCase: false). */
function requestType() {
  return protobuf.parse(PROTO, { keepCase: false }).root.lookupType("demo.v1.SetMessageRequest");
}

/** Encodes like the gRPC-Web clients do after mapping field names. */
function encode(type, body) {
  return Buffer.from(type.encode(type.fromObject(normalizeRequestFieldNames(type, body))).finish());
}

test("a body with proto field names encodes to the same bytes as camelCase", () => {
  const type = requestType();
  const snake = {
    tactical_track_number: 40006,
    data_link_type: "DATA_LINK_TYPE_LINK_ID",
    point_list: [{ latitude: -4, longitude: 105, point_name: "P1" }],
    named_points: { a: { point_name: "A" } },
    center_point: { latitude: 1, longitude: 2 },
  };
  const camel = {
    tacticalTrackNumber: 40006,
    dataLinkType: "DATA_LINK_TYPE_LINK_ID",
    pointList: [{ latitude: -4, longitude: 105, pointName: "P1" }],
    namedPoints: { a: { pointName: "A" } },
    centerPoint: { latitude: 1, longitude: 2 },
  };
  assert.deepEqual(normalizeRequestFieldNames(type, snake), camel);
  assert.deepEqual(encode(type, snake), encode(type, camel));
  // Before the fix this body serialized to zero bytes: the server saw an empty request.
  assert.equal(Buffer.from(type.encode(type.fromObject(snake)).finish()).length, 0);
  assert.ok(encode(type, snake).length > 0);
});

test("a key that matches no field is reported instead of dropped", () => {
  const type = requestType();
  assert.throws(
    () => normalizeRequestFieldNames(type, { tactical_track_nmber: 1, point_list: [{ lat: 1 }] }),
    /Unknown fields in SetMessageRequest request: tactical_track_nmber, pointList\.0\.lat/,
  );
});

test("a field given under both spellings is rejected", () => {
  assert.throws(
    () => normalizeRequestFieldNames(requestType(), { tactical_track_number: 1, tacticalTrackNumber: 2 }),
    /given twice/,
  );
});

test("the workspace loader exposes the message types for request mapping", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layang-field-names-"));
  try {
    fs.writeFileSync(path.join(dir, "demo.proto"), PROTO);
    const definition = loadGrpcProtoWorkspace(dir, ["demo.proto"]);
    assert.ok(!Object.keys(definition).includes("protobufRoot"), "not enumerable for grpc-js");
    const method = definition.protobufRoot.lookupService("demo.v1.ContextMenuDataLink").methods.TransmitItem;
    const serialized = definition["demo.v1.ContextMenuDataLink"].TransmitItem.requestSerialize(
      normalizeRequestFieldNames(method.resolvedRequestType, { tactical_track_number: 40006 }),
    );
    assert.deepEqual([...serialized], [0x08, 0xc6, 0xb8, 0x02]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("mock matchers written with proto field names match a camelCase-decoded request", () => {
  const request = { tacticalTrackNumber: 117, dataLinkType: "DATA_LINK_TYPE_LINK_ID" };
  assert.equal(mockMatcherMatches({ contains: { tactical_track_number: 117 } }, request), true);
  assert.equal(mockMatcherMatches({ contains: { tactical_track_number: 118 } }, request), false);
  assert.equal(
    mockMatcherMatches({ equals: { tactical_track_number: 117, data_link_type: "DATA_LINK_TYPE_LINK_ID" } }, request),
    true,
  );
  assert.equal(mockMatcherMatches({ contains: { tacticalTrackNumber: 117 } }, request), true);
});

test("keys that really are snake_case (REST bodies) are matched as written", () => {
  const body = { user_id: 7, userId: 8 };
  assert.deepEqual(alignKeysToActual(body, { user_id: 7 }), { user_id: 7 });
  assert.equal(mockMatcherMatches({ contains: { user_id: 7 } }, body), true);
  assert.equal(mockMatcherMatches({ contains: { user_id: 8 } }, body), false);
});
