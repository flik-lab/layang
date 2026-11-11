"use strict";

const { crc32 } = require("node:zlib");
const { fromBufferPromise } = require("yauzl");
const { safeRelativePath } = require("../utils/path-utils.cjs");

const MAX_ZIP_BYTES = 16 * 1024 * 1024;
const MAX_PROTO_BYTES = 4 * 1024 * 1024;
const MAX_PROTO_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 1024;
const MAX_PROTO_FILES = 512;

async function readProtoZip(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_ZIP_BYTES) {
    throw new Error("Choose a ZIP archive up to 16 MiB.");
  }
  const archive = await fromBufferPromise(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    lazyEntries: true,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  try {
    if (archive.entryCount > MAX_ARCHIVE_ENTRIES) throw new Error("ZIP contains too many entries.");
    const files = [];
    const seen = new Set();
    let totalBytes = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true });

    for await (const entry of archive.eachEntry()) {
      const name = entry.fileName;
      const parts = name.split("/");
      if (!name.toLowerCase().endsWith(".proto") || parts.includes("__MACOSX") || parts.at(-1).startsWith("._")) continue;
      const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
      if ((fileType && fileType !== 0o100000) || safeRelativePath(name) !== name ||
          parts.some(part => /\.$|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
        throw new Error(`Unsupported ZIP entry path: ${name}`);
      }
      const key = name.toLowerCase();
      if (seen.has(key)) throw new Error(`Duplicate proto path in ZIP: ${name}`);
      seen.add(key);
      if (seen.size > MAX_PROTO_FILES) throw new Error("ZIP contains more than 512 proto files.");
      if (entry.uncompressedSize > MAX_PROTO_BYTES ||
          totalBytes + entry.uncompressedSize > MAX_PROTO_TOTAL_BYTES) {
        throw new Error("ZIP exceeds the unpacked proto limits of 4 MiB per file and 16 MiB total.");
      }

      const stream = await archive.openReadStreamPromise(entry);
      const chunks = [];
      let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        if (size > MAX_PROTO_BYTES || totalBytes + size > MAX_PROTO_TOTAL_BYTES) {
          throw new Error("ZIP exceeds the unpacked proto limits.");
        }
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks, size);
      if (crc32(data) !== entry.crc32) throw new Error(`Corrupt ZIP entry: ${name}`);
      totalBytes += size;
      files.push({ name, text: decoder.decode(data) });
    }
    if (!files.length) throw new Error("No .proto files found in the ZIP.");
    return files.sort((left, right) => left.name.localeCompare(right.name));
  } finally {
    archive.close();
  }
}

module.exports = { readProtoZip, MAX_ZIP_BYTES };
