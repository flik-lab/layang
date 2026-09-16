"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");

test("native grpc IPC routes invoke and cancel through utility host in utility mode", () => {
  const ipc = read("electron/ipc/native-grpc-ipc.cjs");
  const main = read("electron/main.cjs");
  const core = read("lib/runtime/runtime-core.cjs");

  assert.match(ipc, /LAYANG_RUNTIME_MODE/);
  assert.match(ipc, /runtimeMode === "utility"/);
  assert.match(ipc, /invoke\("grpc\.invoke"/);
  assert.match(ipc, /invoke\("grpc\.cancel"/);
  assert.match(ipc, /grpc\.messageMeta/);
  assert.match(main, /registerNativeGrpcIpc\(\{ runtimeMode, getRuntimeHost:/);
  assert.match(main, /LAYANG_RUNTIME_MODE \|\| "utility"/);
  assert.match(core, /command\.type\.startsWith\("grpc\."\)/);
});
