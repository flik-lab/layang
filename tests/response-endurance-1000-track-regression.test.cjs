"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("./helpers/load-typescript-module.cjs");
const { createLargeTrackPayload, createResponseRecord } = require("./fixtures/response-endurance-fixture.cjs");

const performancePrelude = `
const performanceStats = {
  setRetainedMessages() {},
  setPayloadDocuments() {},
};
`;

test("1000-track endurance stream honors a configured 5-message retention window", () => {
  const payload = createLargeTrackPayload();
  const serialized = JSON.stringify(payload);
  assert.ok(serialized.length > 500_000, `fixture should be large, got ${serialized.length} chars`);

  const { createResponseStore } = loadTypeScriptModule(
    "app/playground/features/response-viewer/model/response.store.ts",
    { prelude: performancePrelude },
  );
  const released = [];
  const store = createResponseStore((ids) => released.push(...ids));
  store.setRetentionLimit(5);

  for (let sequence = 0; sequence < 160; sequence += 1) {
    store.appendRecords([createResponseRecord(sequence, serialized.length)]);
  }

  const snapshot = store.getSnapshot();
  const debug = store.getDebugStats();
  assert.equal(snapshot.orderedMessageIds.length, 5);
  assert.equal(snapshot.latestMessageId, "message-159");
  assert.equal(debug.retainedRecords, 5);
  assert.equal(debug.referencedDocumentIds, 5);
  assert.equal(released.length, 155);
  assert.equal(released[0], "document-0");
  assert.equal(released.at(-1), "document-154");
  store.reset();
});

test("small response stream keeps at most 10 response records", () => {
  const { createResponseStore } = loadTypeScriptModule(
    "app/playground/features/response-viewer/model/response.store.ts",
    { prelude: performancePrelude },
  );
  const released = [];
  const store = createResponseStore((ids) => released.push(...ids));

  for (let sequence = 0; sequence < 30; sequence += 1) {
    store.appendRecords([createResponseRecord(sequence, 20_000)]);
  }

  assert.equal(store.getSnapshot().orderedMessageIds.length, 10);
  assert.equal(store.getDebugStats().referencedDocumentIds, 10);
  assert.equal(released.length, 20);
  store.reset();
});

test("response selector stays asleep during endurance appends when its selected slice is unchanged", () => {
  const { createResponseStore } = loadTypeScriptModule(
    "app/playground/features/response-viewer/model/response.store.ts",
    { prelude: performancePrelude },
  );
  const { createResponseSelectorBinding } = loadTypeScriptModule(
    "app/playground/features/response-viewer/model/responseSelector.ts",
  );
  const store = createResponseStore();
  const binding = createResponseSelectorBinding(store, (snapshot) => snapshot.responseFilter);
  let notifications = 0;
  binding.getSnapshot();
  const unsubscribe = binding.subscribe(() => { notifications += 1; });

  for (let sequence = 0; sequence < 160; sequence += 1) {
    store.appendRecords([createResponseRecord(sequence, 600_000)]);
  }
  store.setResponseFilter("needle");

  assert.equal(notifications, 1, "only the selected responseFilter change should wake the subscriber");
  unsubscribe();
  store.reset();
});

test("transport lifecycle returns to zero after repeated stream setup and teardown", () => {
  const { createTransportLifecycleStore } = loadTypeScriptModule(
    "app/playground/features/response-viewer/model/transportLifecycle.store.ts",
  );
  const lifecycle = createTransportLifecycleStore();

  for (let index = 0; index < 160; index += 1) {
    lifecycle.increment("activeDecodeWorkers");
    lifecycle.increment("pendingDecodeAcks", 2);
    lifecycle.increment("payloadProducerChannels");
    lifecycle.increment("activeStreamSubscriptions");
    lifecycle.setDeferredEventCount(2);
    lifecycle.setIngestionQueueDepth(1);
    lifecycle.decrement("pendingDecodeAcks", 2);
    lifecycle.decrement("activeDecodeWorkers");
    lifecycle.decrement("payloadProducerChannels");
    lifecycle.decrement("activeStreamSubscriptions");
    lifecycle.setDeferredEventCount(0);
    lifecycle.setIngestionQueueDepth(0);
  }

  assert.deepEqual(lifecycle.getSnapshot(), {
    activeDecodeWorkers: 0,
    pendingDecodeAcks: 0,
    payloadProducerChannels: 0,
    activeStreamSubscriptions: 0,
    activeTransportProcesses: 0,
    deferredEventCount: 0,
    ingestionQueueDepth: 0,
  });
});


test("preview WebSocket request keeps compact response history", () => {
  const fs = require("node:fs");
  const runner = fs.readFileSync("app/playground/hooks/use-request-runner.ts", "utf8");
  assert.match(runner, /compactTransportPreview/);
  assert.match(runner, /messages\.push\(compactTransportPreview\(value\)\)/);
  assert.match(runner, /totalMessages/);
});
