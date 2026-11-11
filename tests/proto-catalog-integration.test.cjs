"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("./helpers/load-typescript-module.cjs");

test("packaged worker parses real protobuf without renderer imports", () => {
  const { execFileSync } = require("node:child_process");
  const { readFileSync } = require("node:fs");
  const vm = require("node:vm");
  execFileSync(process.execPath, ["scripts/build-proto-catalog-worker.cjs"]);
  const messages = [];
  const self = { postMessage(value) { messages.push(value); } };
  vm.runInNewContext(readFileSync("public/workers/proto-catalog.worker.js", "utf8"), {self, console, setTimeout, clearTimeout});
  self.onmessage({data:[{name:"test.proto",text:'syntax = "proto3"; package test; message Req { string value = 1; } service Echo { rpc Get(Req) returns (Req); }'}]});
  assert.equal(messages[0].error, undefined);
  assert.equal(messages[0].methods[0].serviceName, "test.Echo");
  self.onmessage({data:[{name:"broken.proto",text:"invalid proto"}]});
  assert.match(messages[1].error, /illegal|invalid|token/i);
});

function registryModule() {
  return loadTypeScriptModule("lib/proto-runtime-registry.ts", { prelude: `
    function loadProtoFiles(files) { return { methods: files, root: {}, fileNames: [], protoFiles: [] }; }
  ` });
}
const method = id => ({ serviceName: "test.Service", methodName: id });
const library = (id, count) => ({ id, versions: Array.from({length: count}, (_, i) => ({
  id: String(i), checksum: id + i, files: [method(String(i))],
})) });

test("100 proto versions do not retain unbounded compiled roots and lookup uses library identity", () => {
  const { ProtoRuntimeRegistry } = registryModule();
  const registry = new ProtoRuntimeRegistry([library("a", 100), library("b", 1)]);
  for (let i = 0; i < 100; i++) assert.ok(registry.resolveVersion("a", String(i)));
  assert.equal(registry.compiledByVersionId.size, 24);
  const a = registry.resolveVersion("a", "0");
  const b = registry.resolveVersion("b", "0");
  assert.notEqual(a, b);
  assert.equal(registry.resolveVersion("a", "0"), a);
  assert.equal(registry.resolveVersion("b", "0"), b);
});

test("metadata lookup never compiles proto and repeated method selection indexes once", () => {
  const { ProtoRuntimeRegistry, findLoadedProtoMethod } = registryModule();
  const registry = new ProtoRuntimeRegistry([library("a", 100)]);
  assert.equal(registry.getVersion("a", "99").version.id, "99");
  assert.equal(registry.compiledByVersionId.size, 0);
  assert.equal(registry.getVersion("absent", "99"), null);
  let scans = 0;
  const methods = Array.from({length:10000}, (_, i) => method(String(i)));
  const loaded = { get methods() { scans++; return methods; } };
  for (let i=0; i<1000; i++) assert.equal(findLoadedProtoMethod(loaded, "test.Service/9999"), methods[9999]);
  assert.equal(scans, 1);
});

test("canonical catalog never accesses legacy bodies or compiles a renderer protobuf root", async () => {
  const { buildMockCatalogSourceSnapshot } = loadTypeScriptModule(
    "app/playground/features/mock-server/catalog/mockCatalogRuntime.ts", {
      prelude: `async function readProtoCatalog(version, signal) { signal.throwIfAborted(); return version.methods; }`,
    });
  const server = { protoSources: [{libraryId:"a",versionId:"1"}],
    get methodFiles() { throw new Error("Legacy body accessed"); } };
  const registry = {
    getVersion() { return { library:{name:"Test"},version:{version:"1",methods:[method("Echo")]}}; },
    resolveVersion() { throw new Error("Renderer compilation"); },
  };
  const abort = new AbortController();
  const result = await buildMockCatalogSourceSnapshot(server, registry, abort.signal);
  assert.equal(result.methods.length, 1);
  assert.deepEqual(result.scenarioFiles[0].scenarios, []);
  abort.abort();
  await assert.rejects(buildMockCatalogSourceSnapshot(server, registry, abort.signal), {name:"AbortError"});
});
