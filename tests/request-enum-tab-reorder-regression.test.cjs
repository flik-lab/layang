"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const protobuf = require("protobufjs");

const rootDir = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function loadGrpcWebClient() {
  const filename = path.join(rootDir, "lib/grpc-web-client.ts");
  const source = read("lib/grpc-web-client.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const run = new Function("exports", "require", "module", "__filename", "__dirname", compiled);
  run(module.exports, require, module, filename, path.dirname(filename));
  return module.exports;
}

test("gRPC-Web requests accept enum names across scalar and composite fields", () => {
  const { root } = protobuf.parse(`
    syntax = "proto3";
    enum Status { UNKNOWN = 0; ACTIVE = 1; }
    message Nested { Status status = 1; }
    message Request {
      Status status = 1;
      repeated Status history = 2;
      map<string, Status> lookup = 3;
      Nested nested = 4;
      repeated Nested items = 5;
    }
  `);
  const requestType = root.lookupType("Request");
  const { normalizeProtobufRequestObject } = loadGrpcWebClient();
  const normalized = normalizeProtobufRequestObject(requestType, {
    status: "ACTIVE",
    history: ["UNKNOWN", 1],
    lookup: { current: "ACTIVE" },
    nested: { status: "UNKNOWN" },
    items: [{ status: "ACTIVE" }],
  });

  assert.deepEqual(normalized, {
    status: 1,
    history: [0, 1],
    lookup: { current: 1 },
    nested: { status: 0 },
    items: [{ status: 1 }],
  });
  assert.equal(requestType.verify(normalized), null);
});

test("unknown enum names still fail protobuf validation", () => {
  const { root } = protobuf.parse(
    'syntax = "proto3"; enum Status { UNKNOWN = 0; } message Request { Status status = 1; }',
  );
  const requestType = root.lookupType("Request");
  const { normalizeProtobufRequestObject } = loadGrpcWebClient();
  const normalized = normalizeProtobufRequestObject(requestType, { status: "MISSING" });

  assert.equal(normalized.status, "MISSING");
  assert.match(requestType.verify(normalized), /enum value expected/);
});

test("request tab drag reorder is persisted through the session action", () => {
  const tabs = read("app/playground/features/shell/shell-components.tsx");
  const actions = read("app/playground/features/request-editor/use-request-session-actions.ts");
  const appBar = read("app/playground/features/shell/workbench-app-bar.tsx");

  assert.match(tabs, /draggable=\{Boolean\(onReorder\)\}/);
  assert.match(tabs, /onReorder\?\.\(sourceId, session\.id, position\)/);
  assert.match(actions, /reorderRequestSessionList\(requestSessions, sourceId, targetId, position\)/);
  assert.match(actions, /persistRequestTabsNow\(next, activeRequestId\)/);
  assert.match(appBar, /onReorder=\{reorderRequestSessions\}/);
});
