"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "full-payload-expand-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("full-payload-expand-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    const root = path.resolve(__dirname, "..");
    const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
    
    test("full response payloads are owned by the payload document worker, not React state", () => {
      const types = read("app/playground/shared/workbench-types.ts");
      const store = read("app/playground/features/response-viewer/model/response.store.ts");
      assert.match(types, /documentId\?: string/);
      assert.doesNotMatch(types, /fullPayload/);
      assert.doesNotMatch(types, /payloadToken/);
      assert.match(store, /documentId: event\.documentId/);
      assert.equal(fs.existsSync(path.join(root, "app/playground/shared/live-payload-cache.ts")), false);
    });
    
    test("message detail pages the selected worker document instead of expanding a giant table row", () => {
      const detail = read("app/playground/features/response-viewer/message-list/MessageDetailPane.tsx");
      const list = read("app/playground/features/response-viewer/message-list/MessageList.tsx");
      assert.match(detail, /<JsonDocumentViewer document=\{document\}/);
      assert.match(list, /const ROW_HEIGHT = 44/);
      assert.doesNotMatch(list, /expanded/);
    });
    
    test("Latest JSON is paged by document id and only materializes full text for copy", () => {
      const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
      assert.match(latest, /<JsonDocumentViewer[\s\S]*document=\{session\.committed\}/);
      assert.match(latest, /payloadDocumentService\.getText\(documentId, "pretty"\)/);
      assert.doesNotMatch(latest, /setInterval/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "json-reader-chunk-index-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("json-reader-chunk-index-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const vm = require("node:vm");
    const { TextDecoder, TextEncoder } = require("node:util");
    const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");
    
    const read = (file) => fs.readFileSync(file, "utf8");
    
    function bootWorker() {
      const source = read("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts");
      const match = source.match(/String\.raw`([\s\S]*)`;\s*$/);
      assert.ok(match, "worker source must be extractable");
      const responses = [];
      const self = { postMessage(value) { responses.push(value); } };
      const context = vm.createContext({
        self,
        close() {},
        Map,
        Set,
        JSON,
        String,
        Number,
        Boolean,
        Array,
        Object,
        Math,
        Date,
        Uint16Array,
        Uint32Array,
        TextDecoder,
        TextEncoder,
      });
      vm.runInContext(match[1], context, { filename: "payload-document-worker-runtime.js" });
      let sequence = 0;
      const post = (message) => {
        const requestId = `chunk-${++sequence}`;
        self.onmessage({ data: { ...message, requestId } });
        const result = responses.findLast((item) => item.requestId === requestId);
        assert.ok(result, `missing ${message.type} response`);
        if (result.type === "error") throw new Error(result.error);
        return result;
      };
      post({ type: "init", maxDocuments: 64, maxChars: 96_000_000 });
      return post;
    }
    
    test("payload reader indexes compact raw JSON without materializing full pretty documents", () => {
      const source = read("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts");
      assert.doesNotMatch(source, /JSON\.stringify\(JSON\.parse\(entry\.rawText\), null, 2\)/);
      assert.doesNotMatch(source, /prettyText:\s*null/);
      assert.match(source, /buildLineIndex/);
      assert.match(source, /formatIndexedLine/);
      assert.match(source, /Uint16Array/);
      assert.match(source, /lineIndents/);
    });
    
    test("many indexed 1000-track documents keep compact derived metadata and fast random paging semantics", () => {
      const post = bootWorker();
      for (let index = 0; index < 12; index += 1) {
        const id = `tracks-${index}`;
        post({ type: "register-value", id, value: createTrackPayload(1000) });
        const meta = post({ type: "get-meta", id }).meta;
        assert.ok(meta.lineCount > 1000);
      }
    
      const oldDoc = post({ type: "get-meta", id: "tracks-0" }).meta;
      const lateLines = post({ type: "get-lines", id: "tracks-0", start: oldDoc.lineCount - 40, count: 40 }).lines;
      assert.ok(lateLines.join("\n").includes("TRACK-0999"));
    
      const stats = post({ type: "debug-stats" }).stats;
      assert.equal(stats.indexedDocumentCount, 12);
      assert.ok(stats.derivedChars < stats.rawChars * 0.6, `derived ${stats.derivedChars} should stay compact vs raw ${stats.rawChars}`);
    });
    
    test("chunk reader preserves valid pretty JSON including structural characters inside strings", () => {
      const post = bootWorker();
      const value = {
        text: "brace } bracket ] comma , colon : quote \\\" and newline\\nkept",
        emptyObject: {},
        emptyArray: [],
        nested: [{ a: 1, b: true }, { c: null }],
      };
      post({ type: "register-value", id: "edge", value });
      const pretty = post({ type: "get-text", id: "edge", format: "pretty" }).text;
      assert.deepEqual(JSON.parse(pretty), value);
      const meta = post({ type: "get-meta", id: "edge" }).meta;
      const lines = post({ type: "get-lines", id: "edge", start: 0, count: meta.lineCount }).lines;
      assert.equal(lines.join("\n"), pretty);
    });
    
    test("JSON window uses page prefetch and ignores stale paint notifications", () => {
      const source = read("app/playground/features/response-viewer/json-document/useJsonViewport.ts");
      assert.match(source, /PAYLOAD_DOCUMENT_PAGE_SIZE/);
      assert.match(source, /PAYLOAD_DOCUMENT_PREFETCH_BEFORE_LINES/);
      assert.match(source, /PAYLOAD_DOCUMENT_PREFETCH_AFTER_LINES/);
      assert.match(source, /pendingPagesRef/);
      assert.match(source, /desiredRangeRef/);
      assert.match(source, /visibleRangeRef/);
      assert.match(source, /rangesOverlap/);
      assert.match(source, /visibleFirstPage/);
      assert.match(source, /PAYLOAD_DOCUMENT_MAX_PAGES_PER_REQUEST/);
      assert.doesNotMatch(source, /requestKey = `\$\{safeStart\}:\$\{safeCount\}`/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "payload-document-byte-retention-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("payload-document-byte-retention-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const vm = require("node:vm");
    const { TextDecoder, TextEncoder } = require("node:util");
    const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");
    
    function bootWorker() {
      const sourceFile = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts", "utf8");
      const match = sourceFile.match(/String\.raw`([\s\S]*)`;\s*$/);
      assert.ok(match);
      const responses = [];
      const self = { postMessage(value) { responses.push(value); } };
      const context = vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date, Uint32Array, Uint16Array, Uint8Array, ArrayBuffer, TextDecoder, TextEncoder });
      vm.runInContext(match[1], context);
      const post = (data) => {
        const requestId = data.requestId || `request-${responses.length + 1}`;
        self.onmessage({ data: { ...data, requestId } });
        const response = responses.findLast((item) => item.requestId === requestId);
        assert.ok(response);
        if (response.type === "error") throw new Error(response.error);
        return response;
      };
      post({ type: "init", requestId: "init", maxDocuments: 64, maxChars: 96_000_000, maxPreparedDocuments: 4 });
      return post;
    }
    
    test("50 UTF-8 documents stay byte-backed and only a small decoded working set is retained", () => {
      const post = bootWorker();
      const encoder = new TextEncoder();
      const serialized = JSON.stringify(createTrackPayload(1000));
      for (let index = 0; index < 50; index += 1) {
        const bytes = encoder.encode(serialized);
        post({ type: "register-utf8", id: `doc-${index}`, buffer: bytes.buffer, preview: serialized.slice(0, 128), originalChars: serialized.length });
      }
      let stats = post({ type: "debug-stats" }).stats;
      assert.equal(stats.documentCount, 50);
      assert.equal(stats.decodedDocumentCount, 0);
      assert.ok(stats.rawBytes > 0);
    
      for (let index = 0; index < 12; index += 1) {
        post({ type: "get-meta", id: `doc-${index}` });
        post({ type: "get-lines", id: `doc-${index}`, start: 0, count: 50 });
      }
      stats = post({ type: "debug-stats" }).stats;
      assert.ok(stats.decodedDocumentCount <= 4, `decoded working set leaked: ${stats.decodedDocumentCount}`);
      assert.equal(stats.indexedDocumentCount, 12, `line indexes should outlive decoded strings: ${stats.indexedDocumentCount}`);
      assert.ok(stats.decodedChars < stats.originalChars, "decoded text should remain a bounded working set");
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "payload-document-memory-tier-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("payload-document-memory-tier-regression.test.cjs", () => {
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
      post({ type: "init", requestId: "init", maxDocuments: 64, maxChars: 96_000_000, maxPreparedDocuments: 1 });
      return { post };
    }
    
    test("prepare-window returns metadata and first rendered lines in one worker operation", () => {
      const { post } = loadRuntime();
      post({ type: "register-value", id: "tracks", value: createTrackPayload(1000) });
      const response = post({ type: "prepare-window", id: "tracks", start: 0, count: 64 });
      assert.equal(response.type, "prepared-window");
      assert.equal(response.window.documentId, "tracks");
      assert.ok(response.window.lineCount > 1000);
      assert.ok(response.window.lines.length > 0);
      assert.ok(response.window.lines.length <= 64);
    });
    
    test("decoded eviction keeps line indexes and pinned documents survive budget trimming", () => {
      const { post } = loadRuntime();
      const encoder = new TextEncoder();
      const serialized = JSON.stringify(createTrackPayload(200));
      const register = (id) => {
        const bytes = encoder.encode(serialized);
        post({ type: "register-utf8", id, buffer: bytes.buffer, preview: serialized.slice(0, 128), originalChars: serialized.length });
      };
    
      post({ type: "configure", maxDocuments: 2, maxChars: 20_000_000, maxPreparedDocuments: 1 });
      register("a");
      post({ type: "prepare-window", id: "a", start: 0, count: 20 });
      register("b");
      post({ type: "prepare-window", id: "b", start: 0, count: 20 });
    
      const afterDecodedEviction = post({ type: "debug-stats" }).stats;
      assert.equal(afterDecodedEviction.decodedDocumentCount, 1, "decoded working set must stay bounded");
      assert.equal(afterDecodedEviction.indexedDocumentCount, 2, "line index for evicted decoded text must survive");
    
      post({ type: "pin", id: "a" });
      register("c");
      assert.notEqual(post({ type: "get-meta", id: "a" }).meta, null, "pinned document must not be evicted");
      assert.equal(post({ type: "debug-stats" }).stats.pinnedDocumentCount, 1);
      post({ type: "unpin", id: "a" });
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "payload-document-performance-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("payload-document-performance-regression.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "payload-document-worker-runtime.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("payload-document-worker-runtime.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const vm = require("node:vm");
    const { TextDecoder, TextEncoder } = require("node:util");
    const { createTrackPayload } = require("./fixtures/performance-fixtures.cjs");
    
    function loadRuntime() {
      const sourceFile = fs.readFileSync("app/playground/features/response-viewer/payload-document/payloadDocumentWorkerSource.ts", "utf8");
      const match = sourceFile.match(/String\.raw`([\s\S]*)`;\s*$/);
      assert.ok(match, "payload document worker source template must be readable");
      const responses = [];
      const self = { postMessage(value) { responses.push(value); } };
      const context = vm.createContext({ self, close() {}, Map, Set, JSON, String, Number, Boolean, Array, Object, Math, Date, Uint32Array, TextDecoder, TextEncoder });
      vm.runInContext(match[1], context, { filename: "payload-document-worker-runtime.js" });
      const post = (data) => {
        const requestId = data.requestId || `request-${responses.length + 1}`;
        self.onmessage({ data: { ...data, requestId } });
        const response = responses.findLast((item) => item.requestId === requestId);
        assert.ok(response, `worker response for ${requestId}`);
        if (response.type === "error") throw new Error(response.error);
        return response;
      };
      post({ type: "init", requestId: "init", maxDocuments: 64, maxChars: 96_000_000 });
      return { post, responses };
    }
    
    test("payload document registers 1,000 tracks and pages pretty lines without returning the full document", () => {
      const { post } = loadRuntime();
      const payload = createTrackPayload(1000);
      const registered = post({ type: "register-value", id: "tracks", value: payload });
      assert.equal(registered.documentRef.id, "tracks");
      assert.ok(registered.documentRef.originalChars > 10_000);
    
      const meta = post({ type: "get-meta", id: "tracks" }).meta;
      assert.ok(meta.lineCount > 1000);
      const lines = post({ type: "get-lines", id: "tracks", start: meta.lineCount - 30, count: 30 }).lines;
      assert.equal(lines.length, 30);
      assert.ok(lines.join("\n").includes("TRACK-0999"));
      assert.ok(lines.join("\n").length < registered.documentRef.originalChars);
    });
    
    test("payload document search finds a late track and pretty text round-trips", () => {
      const { post } = loadRuntime();
      post({ type: "register-value", id: "tracks", value: createTrackPayload(1000) });
      const matches = post({ type: "search", ids: ["tracks"], query: "TRACK-0999", limit: 10 }).matches;
      assert.equal(matches.length, 1);
      assert.equal(matches[0].documentId, "tracks");
      assert.ok(matches[0].lineIndex > 0);
      const pretty = post({ type: "get-text", id: "tracks", format: "pretty" }).text;
      assert.equal(JSON.parse(pretty).tracks.length, 1000);
    });
    
    test("payload document releases raw documents and evicts derived caches before raw entries", () => {
      const { post } = loadRuntime();
      post({ type: "configure", maxDocuments: 4, maxChars: 1500 });
      post({ type: "register-value", id: "a", value: { text: "a".repeat(350) } });
      post({ type: "register-value", id: "b", value: { text: "b".repeat(350) } });
      post({ type: "get-lines", id: "a", start: 0, count: 2 });
      post({ type: "register-value", id: "c", value: { text: "c".repeat(350) } });
      const stats = post({ type: "debug-stats" }).stats;
      assert.ok(stats.documentCount >= 2);
      assert.ok(stats.derivedChars <= stats.totalChars);
      post({ type: "release", ids: ["b"] });
      assert.equal(post({ type: "get-meta", id: "b" }).meta, null);
    });
    
  });
}
