"use strict";

const __bundleCreateRequire = require("node:module").createRequire;
const __bundlePath = require("node:path");
const __bundleBaseDir = __dirname;

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const { TextDecoder, TextEncoder } = require("node:util");
const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");

function bootWorker() {
  const sourceFile = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts", "utf8");
  const match = sourceFile.match(/String\.raw`([\s\S]*)`;\s*$/);
  assert.ok(match);
  const responses = [];
  const self = { postMessage(value) { responses.push(value); } };
  const context = vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date, Uint32Array, TextDecoder, TextEncoder });
  vm.runInContext(match[1], context);
  const post = (data) => {
    const requestId = data.requestId || `request-${responses.length + 1}`;
    self.onmessage({ data: { ...data, requestId } });
    const response = responses.findLast((item) => item.requestId === requestId);
    assert.ok(response);
    if (response.type === "error") throw new Error(response.error);
    return response;
  };
  post({ type: "init", requestId: "init", maxDocuments: 64, maxChars: 96_000_000 });
  return post;
}

test("1,000-track document indexing and late-track search stay within a generous worker budget", () => {
  const post = bootWorker();
  const started = performance.now();
  post({ type: "register-value", id: "tracks", value: createTrackPayload(1000) });
  const meta = post({ type: "get-meta", id: "tracks" }).meta;
  const matches = post({ type: "search", ids: ["tracks"], query: "TRACK-0999", limit: 10 }).matches;
  const elapsed = performance.now() - started;
  assert.ok(meta.lineCount > 1000);
  assert.equal(matches.length, 1);
  assert.ok(elapsed < 500, `payload document worker budget exceeded: ${elapsed.toFixed(1)}ms`);
});


{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "payload-document-active-only-derived-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("payload-document-active-only-derived-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const vm = require("node:vm");
    const { TextDecoder, TextEncoder } = require("node:util");
    const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");
    
    function loadRuntime() {
      const sourceFile = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts", "utf8");
      const match = sourceFile.match(/String\.raw`([\s\S]*)`;\s*$/);
      assert.ok(match);
      const responses = [];
      const self = { postMessage(value) { responses.push(value); } };
      const context = vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date, Uint32Array, Uint16Array, TextDecoder, TextEncoder, ArrayBuffer, Uint8Array });
      vm.runInContext(match[1], context, { filename: "payload-document-worker-runtime.js" });
      const post = (data) => {
        const requestId = data.requestId || `request-${responses.length + 1}`;
        self.onmessage({ data: { ...data, requestId } });
        const response = responses.findLast((item) => item.requestId === requestId);
        assert.ok(response, `worker response for ${requestId}`);
        if (response.type === "error") throw new Error(response.error);
        return response;
      };
      post({ type: "init", requestId: "init", maxDocuments: 64, maxChars: 96_000_000, maxPreparedDocuments: 3 });
      return { post };
    }
    
    test("unpin demotes inactive payload documents back to raw-only storage", () => {
      const { post } = loadRuntime();
      const payload = createTrackPayload(1000);
      post({ type: "register-value", id: "a", value: payload });
      post({ type: "pin", id: "a" });
      post({ type: "prepare-window", id: "a", start: 0, count: 64 });
      let stats = post({ type: "debug-stats" }).stats;
      assert.equal(stats.decodedDocumentCount, 1);
      assert.equal(stats.indexedDocumentCount, 1);
    
      post({ type: "unpin", id: "a" });
      stats = post({ type: "debug-stats" }).stats;
      assert.equal(stats.documentCount, 1, "raw document must remain retained");
      assert.equal(stats.decodedDocumentCount, 0, "inactive decoded text must be released immediately");
      assert.equal(stats.indexedDocumentCount, 0, "inactive line index must be released immediately");
      assert.ok(stats.rawBytes > 0, "raw bytes must remain available for reopening");
    });
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "payload-document-backend-selection-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("payload-document-backend-selection-regression.test.cjs", () => {
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
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "payload-worker-real-stats-telemetry-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("payload-worker-real-stats-telemetry-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    
    test("performance telemetry reports actual payload worker memory tiers", () => {
      const client = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocument.client.ts", "utf8");
      const perf = fs.readFileSync("app/playground/shared/performance/performance-stats.store.ts", "utf8");
      const panel = fs.readFileSync("app/playground/shared/performance/PerformanceStatsPanel.tsx", "utf8");
      assert.match(client, /debug-stats/);
      assert.match(client, /setPayloadWorkerStats/);
      assert.match(perf, /actualDocumentCount/);
      assert.match(perf, /decodedDocuments/);
      assert.match(perf, /indexedDocuments/);
      assert.match(perf, /pinnedDocuments/);
      assert.match(perf, /residentMb/);
      assert.match(panel, /Resident memory/);
    });
    
  });
}
