"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createPayloadDocumentStore } = require("../lib/runtime/payload/payload-document-store.cjs");

test("runtime payload store defaults to 10 documents regardless of payload size", () => {
  const store = createPayloadDocumentStore({ largeThresholdChars: 250_000 });
  for (let index = 0; index < 12; index += 1) {
    const text = JSON.stringify({ index, name: `small-${index}` });
    store.registerUtf8(`small-${index}`, Buffer.from(text), text.slice(0, 32), text.length);
  }
  assert.equal(store.debugStats().documentCount, 10);

  const large = JSON.stringify({ tracks: Array.from({ length: 12_000 }, (_, index) => ({ index, name: `track-${index}` })) });
  assert.ok(large.length >= 250_000);
  for (let index = 0; index < 8; index += 1) {
    store.registerUtf8(`large-${index}`, Buffer.from(large), large.slice(0, 64), large.length);
  }
  assert.equal(store.debugStats().documentCount, 10);
});

test("runtime payload store lazily exposes metadata, lines, text and search", () => {
  const store = createPayloadDocumentStore();
  const raw = JSON.stringify({ alpha: 1, nested: { bravo: "needle", list: [1, 2, 3] } });
  const ref = store.registerUtf8("doc-1", Buffer.from(raw), raw.slice(0, 12), raw.length);
  assert.deepEqual(ref, { id: "doc-1", preview: raw.slice(0, 12), originalChars: raw.length });

  const meta = store.getMeta("doc-1");
  assert.ok(meta.lineCount > 1);
  assert.equal(meta.originalChars, raw.length);
  assert.ok(store.getLines("doc-1", 0, 20).some((line) => line.includes('"alpha": 1')));
  assert.equal(store.getText("doc-1", "raw"), raw);
  assert.ok(store.getText("doc-1", "pretty").includes('"bravo": "needle"'));
  assert.ok(store.search(["doc-1"], "needle", 10).some((match) => match.documentId === "doc-1"));
});

test("pinned runtime payload document survives retention until unpinned", () => {
  const store = createPayloadDocumentStore({ defaultMaxDocuments: 2 });
  store.registerUtf8("pinned", Buffer.from('{"value":1}'), "", 11);
  store.pin("pinned");
  store.registerUtf8("two", Buffer.from('{"value":2}'), "", 11);
  store.registerUtf8("three", Buffer.from('{"value":3}'), "", 11);
  assert.ok(store.getMeta("pinned"));
  store.unpin("pinned");
  store.registerUtf8("four", Buffer.from('{"value":4}'), "", 11);
  store.registerUtf8("five", Buffer.from('{"value":5}'), "", 11);
  assert.equal(store.getMeta("pinned"), null);
});

test("runtime payload retention can be reconfigured dynamically and preserves pinned documents", () => {
  const { createPayloadDocumentStore } = require("../lib/runtime/payload/payload-document-store.cjs");
  const store = createPayloadDocumentStore({ defaultMaxDocuments: 10, largeMaxDocuments: 10 });

  for (let index = 1; index <= 10; index += 1) {
    store.registerValue(`doc-${index}`, { index });
  }
  store.pin("doc-1");
  store.setRetentionLimit(5);

  assert.equal(store.debugStats().maxDocuments, 5);
  assert.equal(store.has("doc-1"), true);
  assert.equal(store.debugStats().documentCount, 5);
  assert.equal(store.has("doc-10"), true);

  store.unpin("doc-1");
  assert.equal(store.debugStats().documentCount, 5);
  assert.equal(store.has("doc-1"), true);

  store.setRetentionLimit(20);
  assert.equal(store.debugStats().maxDocuments, 20);
  store.dispose();
});
