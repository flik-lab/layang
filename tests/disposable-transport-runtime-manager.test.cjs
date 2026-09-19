"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createDisposableTransportRuntimeManager } = require("../electron/runtime/disposable-transport-runtime-manager.cjs");

function createFakeHostFactory() {
  const hosts = [];
  let generation = 0;
  const factory = () => {
    generation += 1;
    const listeners = new Set();
    const calls = [];
    const host = {
      id: generation,
      disposed: false,
      calls,
      async start() { return { running: true, generation: `g-${generation}` }; },
      async invoke(type, payload) {
        calls.push({ type, payload });
        if (type === "grpcWeb.invoke") {
          const documentRef = { id: `transport:run-a:message:${generation}`, preview: "{}", originalChars: 2 };
          for (const listener of listeners) listener({ protocolVersion: 1, type: "event", event: "grpcWeb.message", payload: { runId: payload.runId, documentRef } });
          return { httpStatus: 200, headers: {}, trailers: { "grpc-status": "0" }, messages: ["{}"], messageDocumentRefs: [documentRef], durationMs: 1, requestUrl: payload.url, transport: "grpc-web" };
        }
        if (type === "payload.getLines") return [`line-from-host-${generation}`];
        if (type === "payload.debugStats") return { documentCount: 1, decodedDocumentCount: 0, indexedDocumentCount: 0, pinnedDocumentCount: 0, rawBytes: 2, indexBytes: 0, residentBytes: 2 };
        if (type === "grpcWeb.cancel") return { cancelled: true };
        return { ok: true };
      },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      getStatus() { return { running: !host.disposed, generation: `g-${generation}` }; },
      async dispose() { host.disposed = true; },
    };
    hosts.push(host);
    return host;
  };
  return { factory, hosts };
}

test("starting the same run again disposes the old transport generation", async () => {
  const fake = createFakeHostFactory();
  const manager = createDisposableTransportRuntimeManager({ createHost: fake.factory, eventFlushMs: 1 });

  await manager.invoke("run-a", { runId: "run-a", url: "http://localhost/a" }, () => undefined);
  assert.equal(fake.hosts.length, 1);
  assert.equal(fake.hosts[0].disposed, false);

  await manager.invoke("run-a", { runId: "run-a", url: "http://localhost/b" }, () => undefined);
  assert.equal(fake.hosts.length, 2);
  assert.equal(fake.hosts[0].disposed, true);
  assert.equal(fake.hosts[1].disposed, false);

  await manager.disposeAll();
});

test("cancel terminates the transport process and forgets its documents", async () => {
  const fake = createFakeHostFactory();
  const manager = createDisposableTransportRuntimeManager({ createHost: fake.factory, eventFlushMs: 1 });
  const batches = [];

  const result = await manager.invoke("run-a", { runId: "run-a", url: "http://localhost/a" }, (events) => batches.push(events));
  const documentId = result.messageDocumentRefs[0].id;
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(await manager.invokePayload("payload.getLines", { id: documentId, start: 0, count: 1 }), ["line-from-host-1"]);

  const cancelled = await manager.cancel("run-a");
  assert.equal(cancelled.cancelled, true);
  assert.equal(fake.hosts[0].disposed, true);
  await assert.rejects(() => manager.invokePayload("payload.getLines", { id: documentId, start: 0, count: 1 }), /transport document is no longer available/i);
  await manager.disposeAll();
});

test("non-terminal transport events are batched and terminal events flush immediately", async () => {
  const fake = createFakeHostFactory();
  const manager = createDisposableTransportRuntimeManager({ createHost: fake.factory, eventFlushMs: 5 });
  const batches = [];

  await manager.invoke("run-a", { runId: "run-a", url: "http://localhost/a" }, (events) => batches.push(events));
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.ok(batches.length >= 1);
  assert.ok(batches.flat().some((event) => event.type === "message"));
  await manager.disposeAll();
});


test("document owner routing stays bounded to the runtime retention window", async () => {
  const listeners = new Set();
  const host = {
    async start() { return { running: true, generation: "g-bounded" }; },
    async invoke(type, payload) {
      if (type === "grpcWeb.invoke") {
        const refs = [];
        for (let index = 0; index < 12; index += 1) {
          const documentRef = { id: `transport:${payload.runId}:message:${index + 1}`, preview: "{}", originalChars: 300_000 };
          refs.push(documentRef);
          for (const listener of listeners) listener({
            protocolVersion: 1,
            type: "event",
            event: "grpcWeb.message",
            payload: { runId: payload.runId, documentRef, retentionLimit: 5 },
          });
        }
        return { httpStatus: 200, messages: refs.map(() => "{}"), messageDocumentRefs: refs, trailers: { "grpc-status": "0" } };
      }
      if (type === "payload.debugStats") return { documentCount: 5, decodedDocumentCount: 0, indexedDocumentCount: 0, pinnedDocumentCount: 0, rawBytes: 10, decodedChars: 0, indexBytes: 0, residentBytes: 10 };
      return { ok: true };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getStatus() { return { running: true, generation: "g-bounded" }; },
    async dispose() {},
  };
  const manager = createDisposableTransportRuntimeManager({ createHost: () => host, eventFlushMs: 1 });
  await manager.invoke("run-bounded", { runId: "run-bounded", url: "http://localhost/a" }, () => undefined);
  assert.equal(manager.getStatus().documentCount, 5);
  await manager.disposeAll();
});

test("retention updates propagate to active and future transport generations", async () => {
  const fake = createFakeHostFactory();
  const manager = createDisposableTransportRuntimeManager({ createHost: fake.factory, eventFlushMs: 1 });

  await manager.invokePayload("payload.setRetentionLimit", { limit: 50 });
  await manager.invoke("run-a", { runId: "run-a", url: "http://localhost/a" }, () => undefined);

  assert.deepEqual(fake.hosts[0].calls[0], { type: "payload.setRetentionLimit", payload: { limit: 50 } });
  assert.equal(manager.getStatus().runs[0].runId, "run-a");

  await manager.invokePayload("payload.setRetentionLimit", { limit: 20 });
  assert.ok(fake.hosts[0].calls.some((call) => call.type === "payload.setRetentionLimit" && call.payload.limit === 20));

  await manager.invoke("run-b", { runId: "run-b", url: "http://localhost/b" }, () => undefined);
  assert.deepEqual(fake.hosts[1].calls[0], { type: "payload.setRetentionLimit", payload: { limit: 20 } });
  await manager.disposeAll();
});


test("HTTPS transport generations inherit Layang TLS settings while HTTP stays unchanged", async () => {
  const created = [];
  const createHost = (context = {}) => {
    created.push(context);
    const listeners = new Set();
    return {
      async start() { return { running: true, generation: "tls-test" }; },
      async invoke(type, _payload) {
        if (type === "grpcWeb.invoke") return { httpStatus: 200, headers: {}, trailers: { "grpc-status": "0" }, messages: [], messageDocumentRefs: [] };
        if (type === "payload.debugStats") return { documentCount: 0, decodedDocumentCount: 0, indexedDocumentCount: 0, pinnedDocumentCount: 0, rawBytes: 0, decodedChars: 0, indexBytes: 0, residentBytes: 0 };
        return { ok: true };
      },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      getStatus() { return { running: true, generation: "tls-test" }; },
      async dispose() {},
    };
  };
  const manager = createDisposableTransportRuntimeManager({
    createHost,
    getTlsEnvironment: () => ({ NODE_EXTRA_CA_CERTS: "C:/layang/ca.pem", NODE_TLS_REJECT_UNAUTHORIZED: "0" }),
  });

  await manager.invoke("https-run", { url: "https://gateway.local/service" }, () => undefined);
  await manager.invoke("http-run", { url: "http://gateway.local/service" }, () => undefined);

  assert.deepEqual(created[0].env, { NODE_EXTRA_CA_CERTS: "C:/layang/ca.pem", NODE_TLS_REJECT_UNAUTHORIZED: "0" });
  assert.deepEqual(created[1].env, {});
  await manager.disposeAll();
});
