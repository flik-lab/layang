"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-web-access-navigation-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-web-access-navigation-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("Web Access lives inside the gRPC service instead of a standalone sidebar item", () => {
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
      const mockingSidebar = read("app/playground/features/mock-server/sidebar/MockingSidebar.tsx");
      const services = read("app/playground/features/services/services-workspace.tsx");
    
      assert.match(sidebar, /<MockingSidebar/);
      assert.match(mockingSidebar, />gRPC<\/Button>/);
      assert.doesNotMatch(mockingSidebar, />\s*Web Access\s*<\/Button>/);
      assert.match(mockingSidebar, /serviceProtocol === "grpc-mock" \|\| props\.serviceProtocol === "web-access"|props\.serviceProtocol === "grpc-mock" \|\| props\.serviceProtocol === "web-access"/);
    
      assert.match(services, /\{ value: "web-access", label: "Web Access" \}/);
      assert.match(services, /<WebAccessPanel ctx=\{ctx\} requestedSection=\{webAccessSectionRequest\} \/>/);
      assert.doesNotMatch(services, /function WebAccessWorkspace/);
    });
    
    test("gRPC presents Native Mock and Web Access as independent runtimes", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
    
      assert.doesNotMatch(services, /"aria-label": "gRPC run mode"/);
      assert.match(services, /Native gRPC/);
      assert.match(services, /Web Access/);
      assert.match(services, /nativeEndpoint/);
      assert.match(services, /browserUrl/);
      assert.match(services, /toggleGrpcRuntime/);
      assert.match(services, /toggleWebRuntime/);
    });
    
    test("legacy Web Access workspace state opens the focused gRPC workspace", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
    
      assert.match(
        services,
        /serviceProtocol === "grpc-mock" \|\| serviceProtocol === "web-access"[\s\S]*?<GrpcFocusedMockWorkspace ctx=\{ctx\} \/>/,
      );
      assert.match(services, /function GrpcFocusedMockWorkspace/);
      assert.match(services, /function MockRuntimeStrip/);
      assert.match(services, /label: "Web Access"/);
      assert.match(services, /Scenario/);
      assert.match(services, /FeatureCodeTextField/);
    });
    
    test("portal layers keep notifications above dialogs, menus, and tooltips", () => {
      const compat = read("components/shadcn/compat.tsx");
    
      assert.match(compat, /dialog: 2147483200/);
      assert.match(compat, /menu: 2147483301/);
      assert.match(compat, /tooltip: 2147483400/);
      assert.match(compat, /notification: 2147483600/);
      assert.match(compat, /zIndex: portalLayer\.dialog/);
      assert.match(compat, /zIndex: portalLayer\.notification/);
      const response = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
      assert.match(response, /zIndex: 2147483100/);
    });
    
    test("Web Access uses centered padded sections instead of edge-aligned controls", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const security = read("app/playground/features/services/web-access-security-panel.tsx");
    
      assert.match(services, /const webAccessPageSx = \{[\s\S]*?maxWidth: 960[\s\S]*?mx: "auto"/);
      assert.match(services, /px: \{ xs: 0\.75, sm: 1\.25, lg: 1\.75 \}/);
      assert.match(services, /function WebAccessSettingsSection/);
      assert.match(services, /title="Browser listener"/);
      assert.match(services, /title="gRPC server"/);
      assert.match(services, /title="Browser support"/);
      assert.match(services, /Separate multiple origins with commas\./);
    
      assert.match(security, /p: \{ xs: 1\.15, sm: 1\.5 \}/);
      assert.match(security, /bgcolor: "action\.hover"/);
      assert.match(security, /direction=\{\{ xs: "column", sm: "row" \}\}/);
    });
    
    
    test("Web Access protocol changes do not silently rewrite the user port", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const protocolBlock = services.slice(services.indexOf('inputProps={{ "aria-label": "Browser protocol" }}'), services.indexOf('title="HTTPS certificate"'));
      assert.doesNotMatch(protocolBlock, /port:\s*Number\(draftWeb\.port\)/);
      assert.match(services, /Recommended HTTPS port: 8443/);
    });
    
    test("HTTPS Web Access is HTTP/2 and defaults well above five concurrent streams", () => {
      const proxy = read("electron/services/grpc-web-proxy-server.cjs");
      assert.match(proxy, /http2\.createSecureServer/);
      assert.match(proxy, /maxConcurrentStreams: clampInteger\(input\.maxConcurrentStreams, 100, 6, 1000\)/);
      assert.match(proxy, /allowHTTP1: config\.allowHttp1Fallback/);
      assert.match(proxy, /maxConcurrentStreams: config\.maxConcurrentStreams/);
    });
    
    test("Native gRPC settings no longer duplicate Web Access settings", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const settingsNav = services.slice(services.indexOf('aria-label="gRPC Mock settings sections"'), services.indexOf('role="tabpanel"', services.indexOf('aria-label="gRPC Mock settings sections"')));
      assert.doesNotMatch(settingsNav, /web-server/);
      assert.doesNotMatch(settingsNav, /Web server/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-web-protocol.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-web-protocol.test.cjs", () => {
    const assert = require("node:assert/strict");
    const test = require("node:test");
    
    const {
      decodeGrpcWebRequestBody,
      decodeGrpcWebTextBody,
      encodeDataFrame,
      encodeGrpcWebTextResponseChunks,
      parseFrames,
    } = require("../lib/grpc-web-protocol.cjs");
    
    function independentlyEncodedChunks(bytes, sizes) {
      const chunks = [];
      let offset = 0;
      for (const size of sizes) {
        if (offset >= bytes.length) break;
        const end = Math.min(bytes.length, offset + size);
        chunks.push(bytes.subarray(offset, end).toString("base64"));
        offset = end;
      }
      if (offset < bytes.length) chunks.push(bytes.subarray(offset).toString("base64"));
      return chunks;
    }
    
    
    test("grpc-web-text unary response flushes data and trailers as independent Base64 frames", () => {
      const chunks = encodeGrpcWebTextResponseChunks([Buffer.alloc(0)], 0, "");
    
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0], encodeDataFrame(Buffer.alloc(0)).toString("base64"));
      assert.match(chunks[1], /=+$/);
    
      const decoded = decodeGrpcWebTextBody(Buffer.from(chunks.join(""), "ascii"));
      const frames = parseFrames(decoded);
      assert.equal(frames.length, 2);
      assert.equal(frames[0].kind, "data");
      assert.equal(frames[0].payload.length, 0);
      assert.equal(frames[1].kind, "trailers");
      assert.equal(frames[1].trailers["grpc-status"], "0");
    });
    
    test("grpc-web-text request decoder accepts one conventional base64 entity", () => {
      const payload = Buffer.from("external-unary-request");
      const frame = encodeDataFrame(payload);
      const body = Buffer.from(frame.toString("base64"), "ascii");
      assert.deepEqual(decodeGrpcWebRequestBody(body, true), payload);
    });
    
    test("grpc-web-text request decoder accepts whitespace and unpadded final base64", () => {
      const payload = Buffer.from("hello");
      const frame = encodeDataFrame(payload);
      const encoded = frame.toString("base64").replace(/=+$/, "");
      const body = Buffer.from(`  ${encoded.slice(0, 4)}\r\n${encoded.slice(4)}\t`, "ascii");
      assert.deepEqual(decodeGrpcWebRequestBody(body, true), payload);
    });
    
    test("grpc-web-text request decoder accepts concatenated independently padded chunks", () => {
      const payload = Buffer.from("request from an external grpc-web-text client");
      const frame = encodeDataFrame(payload);
      const chunks = independentlyEncodedChunks(frame, [2, 5, 1, 7, 4]);
    
      // This is the interoperability case that Buffer.from(fullBody, "base64")
      // cannot handle: '=' padding appears before later base64 entities.
      assert.ok(chunks.slice(0, -1).some((chunk) => chunk.includes("=")));
      const body = Buffer.from(chunks.join("\r\n"), "ascii");
      assert.deepEqual(decodeGrpcWebRequestBody(body, true), payload);
    });
    
    test("grpc-web-text low-level decoder preserves bytes across padded entities", () => {
      const bytes = Buffer.from([0, 0, 0, 0, 11, ...Buffer.from("hello world")]);
      const encoded = [bytes.subarray(0, 2), bytes.subarray(2, 7), bytes.subarray(7)]
        .map((chunk) => chunk.toString("base64"))
        .join("");
      assert.deepEqual(decodeGrpcWebTextBody(Buffer.from(encoded, "ascii")), bytes);
    });
    
    test("grpc-web-text request decoder reports invalid base64 instead of a misleading incomplete frame", () => {
      assert.throws(
        () => decodeGrpcWebRequestBody(Buffer.from("AAAA!!==", "ascii"), true),
        /Invalid grpc-web-text base64 body/,
      );
    });
    
    test("frame parser reports declared and available payload sizes for truncated requests", () => {
      const truncated = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x05, 0x01, 0x02]);
      assert.throws(() => parseFrames(truncated), /declares 5 payload byte\(s\), but only 2 are available/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-web-transport-runtime.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-web-transport-runtime.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const { createPayloadDocumentStore } = require("../lib/runtime/payload/payload-document-store.cjs");
    const { createGrpcWebTransportRuntime } = require("../lib/runtime/grpc-web/grpc-web-transport-runtime.cjs");
    
    function frame(payload, trailer = false) {
      const body = Buffer.from(payload);
      const output = Buffer.allocUnsafe(5 + body.length);
      output[0] = trailer ? 0x80 : 0;
      output.writeUInt32BE(body.length, 1);
      body.copy(output, 5);
      return output;
    }
    
    function textResponse(parts) {
      const encoded = Buffer.concat(parts).toString("base64");
      const chunks = [encoded.slice(0, 7), encoded.slice(7, 23), encoded.slice(23)];
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
          controller.close();
        },
      });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/grpc-web-text", "grpc-status": "0" }),
        body: stream,
      };
    }
    
    test("transport runtime decodes in utility and emits document metadata instead of full payload", async () => {
      const payloadStore = createPayloadDocumentStore();
      const events = [];
      const runtime = createGrpcWebTransportRuntime({
        payloadStore,
        fetchImpl: async () => textResponse([
          frame(Buffer.from("first")),
          frame(Buffer.from("second")),
          frame(Buffer.from("grpc-status: 0\r\n"), true),
        ]),
        decodeMessageToJson: (bytes) => JSON.stringify({ value: new TextDecoder().decode(bytes) }),
      });
      runtime.subscribe((event) => events.push(event));
    
      const result = await runtime.handle("grpcWeb.invoke", {
        runId: "run-a",
        url: "http://localhost/example.Service/Stream",
        headers: { "content-type": "application/grpc-web-text" },
        body: "AAAAAA==",
        responseEncoding: "text",
        maxMessages: 10,
      });
    
      assert.equal(result.totalMessages, 2);
      assert.equal(result.messageDocumentRefs.length, 2);
      assert.match(result.messageDocumentRefs[0].id, /^transport:run-a:/);
      assert.deepEqual(await payloadStore.handle("payload.getLines", { id: result.messageDocumentRefs[0].id, start: 0, count: 5 }), ["{", '  "value": "first"', "}"]);
    
      const messageEvent = events.find((event) => event.event === "grpcWeb.message");
      assert.ok(messageEvent);
      assert.ok(messageEvent.payload.documentRef);
      assert.equal(messageEvent.payload.retentionLimit, 10);
      assert.equal(Object.hasOwn(messageEvent.payload, "value"), false);
      assert.equal(Object.hasOwn(messageEvent.payload, "serializedValueUtf8"), false);
      await runtime.dispose();
    });
    
    test("large messages honor the configured runtime payload retention", async () => {
      const payloadStore = createPayloadDocumentStore();
      payloadStore.setRetentionLimit(5);
      let counter = 0;
      const runtime = createGrpcWebTransportRuntime({
        payloadStore,
        fetchImpl: async () => {
          const parts = [];
          for (let index = 0; index < 12; index += 1) parts.push(frame(Buffer.from(String(index))));
          parts.push(frame(Buffer.from("grpc-status: 0\r\n"), true));
          return textResponse(parts);
        },
        decodeMessageToJson: () => JSON.stringify({ data: "x".repeat(300_000), counter: counter++ }),
      });
    
      const result = await runtime.handle("grpcWeb.invoke", {
        runId: "run-big",
        url: "http://localhost/example.Service/Stream",
        headers: { "content-type": "application/grpc-web-text" },
        body: "AAAAAA==",
        responseEncoding: "text",
        maxMessages: 50,
      });
      const stats = payloadStore.debugStats();
      assert.equal(stats.documentCount, 5);
      assert.equal(result.messageDocumentRefs.length, 5);
      assert.equal(result.messages.length, 5);
      for (const ref of result.messageDocumentRefs) assert.equal(payloadStore.has(ref.id), true);
      await runtime.dispose();
    });
    
  });
}
