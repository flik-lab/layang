"use strict";

// `layang run` honours what a saved request stores (deadline, transport) and reads gRPC-Web
// server streams frame by frame, so endless mock streams end at the deadline with their messages.

const test = require("node:test");
const assert = require("node:assert/strict");

const { discoverRunItems } = require("../lib/cli-workspace.cjs");
const { createGrpcWebFrameDecoder } = require("../lib/cli-transports.cjs");
const { encodeDataFrame, encodeTrailerFrame } = require("../lib/grpc-web-protocol.cjs");

function workspaceWith(request) {
  return {
    project: {
      environments: [{ key: "mock", label: "Mock", nativeTarget: "127.0.0.1:50055", grpcWebBaseUrl: "http://127.0.0.1:18080" }],
      collections: [{ id: "c", name: "C", folders: [], requests: [{ id: "r", name: "Stream", kind: "grpc", grpcMethodKey: "demo.v1.Svc/Watch", environmentKey: "mock", ...request }] }],
    },
  };
}

test("a saved request's timeoutMs and grpc-web transport are used when no flag overrides them", () => {
  const [item] = discoverRunItems(workspaceWith({ timeoutMs: 3000, transportMode: "grpc-web" }), { transport: "native-grpc" });
  assert.equal(item.timeoutMs, 3000);
  assert.equal(item.transportMode, "grpc-web");
  assert.equal(item.target, "http://127.0.0.1:18080");
});

test("--transport still overrides the saved transport", () => {
  const [item] = discoverRunItems(workspaceWith({ transportMode: "grpc-web" }), { transport: "native-grpc", transportExplicit: true });
  assert.equal(item.transportMode, "native-grpc");
  assert.equal(item.target, "127.0.0.1:50055");
});

test("a desktop tab opened from a saved request is not a second run item", () => {
  const workspace = workspaceWith({});
  workspace.project.requestTabs = [
    { id: "tab-1", sourceRequestId: "r", methodKey: "r", title: "Stream", serviceName: "C" },
    { id: "tab-2", methodKey: "demo.v1.Svc/Other", title: "Scratch tab" },
  ];
  const items = discoverRunItems(workspace, {});
  assert.deepEqual(items.map((item) => item.id), ["tab-2", "r"]);
});

test("grpc-web-text frames padded per frame decode across arbitrary chunk boundaries", () => {
  const frames = [encodeDataFrame(Buffer.from("a")), encodeDataFrame(Buffer.from("hello")), encodeTrailerFrame(0, "OK")];
  // A server may base64-encode every frame separately, leaving '=' padding mid-stream.
  const text = frames.map((frame) => Buffer.from(frame).toString("base64")).join("");
  assert.match(text.slice(0, -4), /=/);
  const decoder = createGrpcWebFrameDecoder(true);
  const output = [];
  for (let index = 0; index < text.length; index += 3) output.push(...decoder.push(Buffer.from(text.slice(index, index + 3))));
  decoder.end();
  assert.deepEqual(
    output.map((frame) => (frame.kind === "data" ? frame.payload.toString() : `status:${frame.trailers["grpc-status"]}`)),
    ["a", "hello", "status:0"],
  );
});

test("binary frames split mid-header are held until complete", () => {
  const bytes = Buffer.concat([encodeDataFrame(Buffer.from("one")), encodeDataFrame(Buffer.from("two"))]);
  const decoder = createGrpcWebFrameDecoder(false);
  assert.deepEqual(decoder.push(bytes.subarray(0, 3)), []);
  const frames = decoder.push(bytes.subarray(3));
  assert.deepEqual(frames.map((frame) => frame.payload.toString()), ["one", "two"]);
  decoder.end();
});
