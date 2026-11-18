"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { crc32 } = require("node:zlib");
const { readProtoZip, MAX_ZIP_BYTES } = require("../electron/services/proto-zip-import.cjs");

// Stored ZIP fixture with editable directory records for malformed input tests.
function zip(entries) {
  const files = [];
  const directory = [];
  let offset = 0;
  for (const [fileName, text] of entries) {
    const name = Buffer.from(fileName);
    const data = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    local.copy(entry, 6, 4, 28);
    entry.writeUInt32LE(offset, 42);
    files.push(local, name, data);
    directory.push(entry, name);
    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, central, end]);
}

test("ZIP import keeps relative paths, skips unrelated files, and verifies content", async () => {
  const bytes = zip([
    ["proto/service.proto", 'syntax = "proto3"; import "shared/types.proto";'],
    ["proto/shared/types.proto", 'syntax = "proto3"; message Item {}'],
    ["proto/README.md", "documentation"],
  ]);
  const files = await readProtoZip(bytes);
  assert.deepEqual(files.map(file => file.name), ["proto/service.proto", "proto/shared/types.proto"]);
  assert.match(files[0].text, /shared\/types\.proto/);
  bytes[30 + Buffer.byteLength("proto/service.proto")] ^= 1;
  await assert.rejects(readProtoZip(bytes), /Corrupt ZIP entry/);
});

test("ZIP import rejects unsafe and colliding paths and applies size limits", async () => {
  await assert.rejects(readProtoZip(zip([["../escape.proto", "bad"]])), /invalid|relative path/i);
  await assert.rejects(readProtoZip(zip([["a.proto", ""], ["A.proto", ""]])), /Duplicate proto path/);
  await assert.rejects(readProtoZip(zip([["notes.txt", "text"]])), /No \.proto files/);
  await assert.rejects(readProtoZip(new Uint8Array(MAX_ZIP_BYTES + 1)), /up to 16 MiB/);
  await assert.rejects(readProtoZip(zip([["huge.proto", "x".repeat(4 * 1024 * 1024 + 1)]])), /unpacked proto limits/);
});
