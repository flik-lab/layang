"use strict";

const __bundleCreateRequire = require("node:module").createRequire;
const __bundlePath = require("node:path");
const __bundleBaseDir = __dirname;

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { loadTypeScriptModule } = require("./helpers/load-typescript-module.cjs");
const read = (path) => fs.readFileSync(path, "utf8");

test("gRPC-Web worker schema is serializable and rejects unsupported group fields", () => {
  const schema = read("lib/grpc-web-worker-schema.ts");
  assert.match(schema, /export type GrpcWebWorkerSchema/);
  assert.match(schema, /buildGrpcWebWorkerSchema/);
  assert.match(schema, /canDecodeInGrpcWebWorker/);
  assert.match(schema, /field\.type === "group"/);
  assert.doesNotMatch(schema, /\bany\b/);
});

test("gRPC-Web response decode worker uses Blob bootstrap, chunk acknowledgements, and a payload-document port", () => {
  const client = read("lib/grpc-web-decode-worker-client.ts");
  const source = read("lib/grpc-web-decode-worker-source.ts");
  assert.match(client, /new Blob/);
  assert.match(client, /new Worker\(workerUrl/);
  assert.doesNotMatch(client, /new Worker\(\s*new URL/);
  assert.match(client, /producerPort/);
  assert.match(source, /payloadDocumentPort/);
  assert.match(source, /prepareDocumentRegistration/);
  assert.match(source, /registerPreparedDocument/);
  assert.match(source, /decodeProtobufMessage/);
  assert.match(source, /parseFrames/);
});

test("browser gRPC-Web transport delegates every response chunk to the decode worker and cleans up runtime owners", () => {
  const grpcWeb = read("lib/grpc-web-client.ts");
  const workerClient = read("lib/grpc-web-decode-worker-client.ts");
  assert.match(grpcWeb, /createGrpcWebDecodeWorkerClient/);
  assert.match(grpcWeb, /await decodeWorker\.processChunk/);
  assert.match(grpcWeb, /decodeWorker\.dispose\(\)/);
  assert.match(grpcWeb, /payloadChannel\.release\(\)/);
  assert.match(workerClient, /transportLifecycleStore\.increment\("activeDecodeWorkers"\)/);
  assert.match(workerClient, /transportLifecycleStore\.increment\("pendingDecodeAcks"\)/);
  assert.match(workerClient, /transportLifecycleStore\.decrement\("pendingDecodeAcks"/);
  assert.match(workerClient, /transportLifecycleStore\.decrement\("activeDecodeWorkers"\)/);
  assert.doesNotMatch(grpcWeb, /GrpcWebFrameParser|processBytesFallback/);
});


test("gRPC-Web request normalization accepts enum names across scalar and composite fields", () => {
  const { normalizeProtobufRequestObject } = loadTypeScriptModule("lib/grpc-web-client.ts");
  const statusEnum = { values: { UNKNOWN: 0, ACTIVE: 1 } };
  const nestedType = {
    resolveAll() {},
    fieldsArray: [
      { name: "status", resolvedType: statusEnum, map: false, repeated: false },
    ],
  };
  const requestType = {
    resolveAll() {},
    fieldsArray: [
      { name: "status", resolvedType: statusEnum, map: false, repeated: false },
      { name: "history", resolvedType: statusEnum, map: false, repeated: true },
      { name: "lookup", resolvedType: statusEnum, map: true, repeated: false },
      { name: "nested", resolvedType: nestedType, map: false, repeated: false },
      { name: "items", resolvedType: nestedType, map: false, repeated: true },
    ],
  };

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
});

test("gRPC-Web request normalization preserves unknown enum names for downstream validation", () => {
  const { normalizeProtobufRequestObject } = loadTypeScriptModule("lib/grpc-web-client.ts");
  const requestType = {
    resolveAll() {},
    fieldsArray: [
      { name: "status", resolvedType: { values: { UNKNOWN: 0 } }, map: false, repeated: false },
    ],
  };

  const normalized = normalizeProtobufRequestObject(requestType, { status: "MISSING" });
  assert.equal(normalized.status, "MISSING");
});

test("live response ingestion is bounded and coalesces excess message previews", () => {
  const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
  assert.match(liveEvents, /MAX_PENDING_MESSAGE_EVENTS_PER_SESSION/);
  assert.match(liveEvents, /coalescedMessageCount/);
  assert.match(liveEvents, /pending\.messages\.length >= MAX_PENDING_MESSAGE_EVENTS_PER_SESSION/);
});

test("final response reconciliation only registers the bounded retained event tail", () => {
  const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
  const runner = read("app/playground/hooks/use-request-runner.ts");
  assert.match(liveEvents, /slice\(-MAX_FINAL_MESSAGE_EVENTS/);
  assert.match(liveEvents, /prepareUiEventForDocumentStore/);
  assert.match(runner, /compactUiEventsForResponse\(targetSessionId, resultToUiEvents\(result\)\)/);
});

test("cancelled or timed out streams only finalize the decode worker after a clean stream end", () => {
  const grpcWeb = read("lib/grpc-web-client.ts");
  assert.match(grpcWeb, /if \(!requestController\.signal\.aborted && !timeoutMessage\) await processWorkerChunk\(new Uint8Array\(0\), true\)/);
});

test("per-message gRPC-Web telemetry stays debug-only", () => {
  const grpcWeb = read("lib/grpc-web-client.ts");
  const marker = `message: \`Message #\${totalMessages} decoded\``;
  const markerIndex = grpcWeb.indexOf(marker);
  assert.notEqual(markerIndex, -1);
  const blockStart = grpcWeb.lastIndexOf("params.emit({", markerIndex);
  assert.match(grpcWeb.slice(blockStart, markerIndex + marker.length), /level: "debug"/);
});

test("decoded objects are serialized once and transferred worker-to-worker as payload documents", () => {
  const source = read("lib/grpc-web-decode-worker-source.ts");
  const grpcWeb = read("lib/grpc-web-client.ts");
  const eventUtils = read("app/playground/features/request-runner/request-result-utils.ts");
  assert.match(source, /JSON\.stringify/);
  assert.match(source, /new TextEncoder/);
  assert.match(source, /prepareDocumentRegistration/);
  assert.match(source, /registerPreparedDocument/);
  assert.match(grpcWeb, /messageDocumentRefs\.push\(frame\.documentRef\)/);
  assert.match(eventUtils, /result\.messageDocumentRefs\?\.\[index\]/);
});

test("transient document refs are removed before client and localStorage persistence", () => {
  const workspace = read("app/playground/features/workspace/workspace-model.ts");
  const runner = read("app/playground/hooks/use-request-runner.ts");
  assert.match(workspace, /messageDocumentRefs: _messageDocumentRefs/);
  assert.match(runner, /messageDocumentRefs: _messageDocumentRefs/);
  assert.match(workspace, /documentId: _documentId/);
});

test("large gRPC-Web payloads are owned by the global document worker, not a decoder payload token store", () => {
  const source = read("lib/grpc-web-decode-worker-source.ts");
  const types = read("lib/types.ts");
  assert.match(source, /payloadDocumentPort/);
  assert.doesNotMatch(source, /payloadStore|payloadToken|get-payload/);
  assert.match(types, /documentRef: ResponseDocumentRef/);
  assert.doesNotMatch(types, /payloadToken/);
});

test("activity rail icons never render navigation loading spinners or sx keyframes", () => {
  const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
  assert.doesNotMatch(sidebar, /@keyframes sidebar-navigation-spin|navigationPending|Loading \{pendingSection/);
});


{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-web-decode-worker-allocation-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-web-decode-worker-allocation-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const read = (path) => fs.readFileSync(path, "utf8");
    
    test("decode worker releases decoded object and serialized JSON before awaiting document registration", () => {
      const source = read("lib/grpc-web-decode-worker-source.ts");
      assert.match(source, /prepareDocumentRegistration/);
      assert.match(source, /registerPreparedDocument/);
      assert.doesNotMatch(source, /const value = decodeProtobufMessage\(frame\.payload, schema\.rootType\);[\s\S]{0,240}await registerDocument\(serialized, preview\)/);
    });
    
    
    test("decode worker serializes protobuf directly to JSON text without building a full decoded object graph", () => {
      const source = read("lib/grpc-web-decode-worker-source.ts");
      assert.match(source, /decodeProtobufMessageToJson/);
      assert.match(source, /const serialized = decodeProtobufMessageToJson\(payload, schema\.rootType\)/);
      assert.doesNotMatch(source, /serializePayload\(decodeProtobufMessage\(payload, schema\.rootType\)\)/);
    });
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-web-frame-buffer-allocation-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-web-frame-buffer-allocation-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    
    const source = () => fs.readFileSync("lib/grpc-web-decode-worker-source.ts", "utf8");
    
    test("gRPC-Web frame parser queues chunks instead of repeatedly concatenating an incomplete large frame", () => {
      const text = source();
      assert.match(text, /frameChunks/);
      assert.match(text, /frameBufferedBytes/);
      assert.match(text, /consumeFrameBytes/);
      assert.doesNotMatch(text, /frameBuffer\s*=\s*concatBytes\(frameBuffer, chunk\)/);
    });
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-web-no-main-thread-fallback-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-web-no-main-thread-fallback-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const read = (file) => fs.readFileSync(file, "utf8");
    
    test("browser gRPC-Web requires worker decode and has no renderer frame parser fallback", () => {
      const grpcWeb = read("lib/grpc-web-client.ts");
      assert.doesNotMatch(grpcWeb, /new GrpcWebFrameParser\(/);
      assert.doesNotMatch(grpcWeb, /processBytesFallback/);
      assert.doesNotMatch(grpcWeb, /main-thread fallback/);
      assert.match(grpcWeb, /This response schema cannot be decoded by the gRPC-Web worker\./);
    });
    
    test("gRPC-Web decode worker registers payload documents through a MessagePort", () => {
      const source = read("lib/grpc-web-decode-worker-source.ts");
      const client = read("lib/grpc-web-decode-worker-client.ts");
      assert.match(source, /payloadDocumentPort/);
      assert.match(source, /prepareDocumentRegistration/);
      assert.match(source, /registerPreparedDocument/);
      assert.match(source, /register-utf8/);
      assert.doesNotMatch(source, /payloadStore/);
      assert.match(client, /producerPort/);
      assert.doesNotMatch(client, /getPayload/);
    });
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-web-stop-reset-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-web-stop-reset-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const read = (file) => fs.readFileSync(file, "utf8");
    
    test("request runner binds Electron gRPC-Web transport lifecycle to request session id", () => {
      const runner = read("app/playground/hooks/use-request-runner.ts");
      assert.match(runner, /runId: targetSessionId/);
      assert.match(runner, /electronGrpcWebTransport\?\.cancel\(sessionId\)/);
      assert.match(runner, /responseSessionRegistry\.get\(sessionId\)\?\.store\.reset\(\)/);
    });
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-web-transport-isolation-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-web-transport-isolation-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const read = (file) => fs.readFileSync(file, "utf8");
    
    test("Electron gRPC-Web uses disposable transport runtime while browser keeps worker fallback", () => {
      const client = read("lib/grpc-web-client.ts");
      assert.match(client, /window\.electronGrpcWebTransport\?\.isAvailable/);
      assert.match(client, /invokeElectronGrpcWebTransport/);
      assert.match(client, /createPayloadDocumentProducerChannel/);
      assert.match(client, /Browser fallback/);
    });
    
    test("transport-backed documents route outside the renderer payload worker", () => {
      const service = read("app/playground/features/response-viewer/payload-document/payloadDocument.service.ts");
      assert.match(service, /id\.startsWith\("transport:"\)/);
      assert.match(service, /createTransportPayloadDocumentClient/);
    });
    
    test("preload exposes transport invoke cancel and payload APIs", () => {
      const preload = read("electron/preload.cjs");
      assert.match(preload, /electronGrpcWebTransport/);
      assert.match(preload, /grpc-web-transport:invoke/);
      assert.match(preload, /grpc-web-transport:cancel/);
      assert.match(preload, /grpc-web-transport:payload/);
    });
    
    test("main process owns disposable transport manager and disposes it on shutdown", () => {
      const main = read("electron/main.cjs");
      assert.match(main, /createDisposableTransportRuntimeManager/);
      assert.match(main, /registerGrpcWebTransportIpc/);
      assert.match(main, /transportRuntimeManager\.disposeAll/);
    });
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-web-unary-proxy-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-web-unary-proxy-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const source = fs.readFileSync(path.join(__dirname, "..", "lib", "grpc-web-client.ts"), "utf8");
    
    test("browser unary and server-streaming gRPC-Web both use text framing", () => {
      assert.match(source, /const requestBody: string = base64Encode\(requestFrame\)/);
      assert.match(source, /const contentType = "application\/grpc-web-text\+proto"/);
      assert.doesNotMatch(source, /responseStream\s*\? base64Encode\(requestFrame\)/);
    });
    
    test("browser client defaults to text decoding while still accepting explicit binary responses", () => {
      assert.match(source, /resolveGrpcWebResponseEncoding\(contentType\)/);
      assert.match(source, /normalized === "application\/grpc-web-text\+proto"/);
      assert.match(source, /normalized === "application\/grpc-web\+proto"/);
      assert.match(source, /return "text";/);
      assert.doesNotMatch(source, /processBytesFallback/);
      assert.match(source, /await processWorkerChunk\(chunk\.value, false\)/);
    });
    
    const proxySource = fs.readFileSync(path.join(__dirname, "..", "electron", "services", "grpc-web-proxy-server.cjs"), "utf8");
    
    test("unary grpc-web response metadata cannot overwrite the negotiated grpc-web content type", () => {
      const startResponse = proxySource.match(/function startGrpcWebResponse[\s\S]*?\n}\n\nfunction requestHeadersToMetadata/)?.[0] || "";
      assert.match(startResponse, /protocolHeaders\.has\(lower\)/);
    });
    
  });
}

{
  const __bundleOrigin = __bundlePath.join(__bundleBaseDir, "grpc-web-varint-allocation-regression.test.cjs");
  const require = __bundleCreateRequire(__bundleOrigin);
  const __dirname = __bundlePath.dirname(__bundleOrigin);
  const __filename = __bundleOrigin;
  const { describe: __bundleDescribe } = require("node:test");
  __bundleDescribe("grpc-web-varint-allocation-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    
    test("gRPC-Web decoder uses numeric varints for tags, lengths, and common 32-bit scalars", () => {
      const source = fs.readFileSync("lib/grpc-web-decode-worker-source.ts", "utf8");
      assert.match(source, /function readVarintNumber/);
      assert.match(source, /const tag = readVarintNumber\(bytes, state\)/);
      assert.match(source, /const length = readVarintNumber\(bytes, state\)/);
      assert.match(source, /case 'uint32':[\s\S]{0,180}readVarintNumber\(bytes, state\)/);
      assert.match(source, /case 'bool':[\s\S]{0,180}readVarintNumber\(bytes, state\) !== 0/);
    });
    
  });
}
