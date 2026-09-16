"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");

for (const [file, commandPrefix] of [
  ["electron/ipc/grpc-mock-ipc.cjs", "mock.grpc"],
  ["electron/ipc/rest-mock-ipc.cjs", "mock.rest"],
  ["electron/ipc/ws-mock-ipc.cjs", "mock.websocket"],
]) {
  test(`${file} routes utility mode through the runtime host with main fallback`, () => {
    const source = read(file);
    assert.match(source, /LAYANG_RUNTIME_MODE/);
    assert.match(source, /getRuntimeHost/);
    assert.match(source, new RegExp(`${commandPrefix.replaceAll(".", "\\.")}\\.start`));
    assert.match(source, new RegExp(`${commandPrefix.replaceAll(".", "\\.")}\\.stop`));
    assert.match(source, new RegExp(`${commandPrefix.replaceAll(".", "\\.")}\\.status`));
    assert.match(source, /runtimeMode\s*===\s*"utility"/);
  });
}
