"use strict";

/**
 * Bound diagnostic history by entry count and retained JSON size. Request and
 * response previews are intentionally small; full captures remain on disk.
 */
function createBoundedGatewayLog({ maxEntries = 1000, maxBytes = 16 * 1024 * 1024, maxFieldBytes = 32 * 1024 } = {}) {
  const entries = [];
  const sizes = [];
  let totalBytes = 0;
  function preview(value) {
    if (value === undefined) return value;
    let json;
    try { json = JSON.stringify(value); } catch { return { truncated: true, reason: "not-serializable" }; }
    if (!json || Buffer.byteLength(json) <= maxFieldBytes) return value;
    return { truncated: true, bytes: Buffer.byteLength(json), preview: json.slice(0, 2048) };
  }
  return {
    entries,
    add(entry) {
      const compact = { ...entry, request: preview(entry.request), response: preview(entry.response) };
      const size = Buffer.byteLength(JSON.stringify(compact));
      entries.push(compact);
      sizes.push(size);
      totalBytes += size;
      while (entries.length > maxEntries || totalBytes > maxBytes) {
        entries.shift();
        totalBytes -= sizes.shift() ?? 0;
      }
    },
    clear() { entries.length = 0; sizes.length = 0; totalBytes = 0; },
    get retainedBytes() { return totalBytes; },
  };
}
module.exports = { createBoundedGatewayLog };
