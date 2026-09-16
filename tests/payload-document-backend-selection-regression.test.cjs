"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const service = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocument.service.ts", "utf8");
const utilityClient = fs.readFileSync("app/playground/features/response-viewer/payload-document/utilityPayloadDocument.client.ts", "utf8");
const preload = fs.readFileSync("electron/preload.cjs", "utf8");

test("payload service selects utility backend only for Electron utility mode", () => {
  assert.match(service, /createUtilityPayloadDocumentClient/);
  assert.match(service, /electronRuntime\?\.mode === "utility"/);
  assert.match(service, /createPayloadDocumentClient\(\)/);
});

test("utility payload client uses runtime commands and never creates a Worker", () => {
  assert.match(utilityClient, /payload\.getLines/);
  assert.match(utilityClient, /payload\.search/);
  assert.match(utilityClient, /payload\.debugStats/);
  assert.doesNotMatch(utilityClient, /new Worker/);
  assert.match(preload, /invoke: \(type, payload\) => ipcRenderer\.invoke\("runtime:invoke", \{ type, payload \}\)/);
});
