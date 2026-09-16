"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const read = (file) => fs.readFileSync(file, "utf8");

test("electron main owns one utility runtime host lifecycle", () => {
  const source = read("electron/main.cjs");
  assert.match(source, /createUtilityRuntimeHost/);
  assert.match(source, /registerRuntimeIpc/);
  assert.match(source, /utilityRuntimeHost\s*=\s*createUtilityRuntimeHost/);
  assert.match(source, /await utilityRuntimeHost\.start\(\)/);
  assert.match(source, /utilityRuntimeHost\?\.dispose\(\)/);
});

test("preload exposes minimal utility runtime control plane", () => {
  const source = read("electron/preload.cjs");
  assert.match(source, /exposeInMainWorld\("electronRuntime"/);
  assert.match(source, /ping:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("runtime:ping"\)/);
  assert.match(source, /getStatus:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("runtime:status"\)/);
  assert.match(source, /ipcRenderer\.on\("runtime:event"/);
});

test("electron declarations type the utility runtime API", () => {
  const source = read("types/electron.d.ts");
  assert.match(source, /electronRuntime\?:\s*\{/);
  assert.match(source, /ping:\s*\(\)\s*=>\s*Promise<RuntimeProcessStatus>/);
  assert.match(source, /onEvent:\s*\(callback:\s*\(event:\s*RuntimeEventEnvelope\)/);
});
