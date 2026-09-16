"use strict";

const DEFAULT_MAX_DOCUMENTS = 10;
const DEFAULT_MAX_CHARS = 96_000_000;
const DEFAULT_MAX_PREPARED_DOCUMENTS = 3;

function createPayloadDocumentStore(options = {}) {
  const defaultMaxDocuments = normalizePositiveInt(options.defaultMaxDocuments, DEFAULT_MAX_DOCUMENTS);
  const maxChars = normalizePositiveInt(options.maxChars, DEFAULT_MAX_CHARS);
  const maxPreparedDocuments = normalizePositiveInt(options.maxPreparedDocuments, DEFAULT_MAX_PREPARED_DOCUMENTS);
  const documents = new Map();
  let sequence = 0;
  let retentionLimit = defaultMaxDocuments;
  let totalRawBytes = 0;
  let totalDecodedChars = 0;
  let totalOriginalChars = 0;
  let totalDerivedBytes = 0;
  let disposed = false;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  function registerValue(id, value) {
    const rawText = stringifyCompact(value);
    return registerUtf8(id, encoder.encode(rawText), rawText.slice(0, 4096), rawText.length);
  }

  function registerUtf8(id, input, preview = "", originalChars = 0) {
    assertAvailable();
    const documentId = String(id || "");
    if (!documentId) throw new Error("Payload document id is required.");
    removeDocument(documentId);
    const bytes = normalizeBytes(input);
    const rawBuffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chars = Number.isFinite(Number(originalChars)) && Number(originalChars) > 0
      ? Math.floor(Number(originalChars))
      : rawBuffer.byteLength;
    sequence += 1;
    const entry = {
      id: documentId,
      rawBuffer: Buffer.from(rawBuffer),
      rawText: null,
      rawStorageBytes: rawBuffer.byteLength,
      originalChars: chars,
      preview: String(preview || ""),
      lineStarts: null,
      lineIndents: null,
      derivedBytes: 0,
      touched: sequence,
      decodedTouched: 0,
      pinCount: 0,
    };
    documents.set(documentId, entry);
    totalRawBytes += entry.rawStorageBytes;
    totalOriginalChars += entry.originalChars;
    trimToBudget(documentId);
    const retained = documents.get(documentId);
    if (!retained) throw new Error("Payload document exceeded the configured retention budget.");
    return toRef(retained);
  }

  function getMeta(id) {
    const entry = touch(id);
    if (!entry) return null;
    buildLineIndex(entry);
    return { lineCount: entry.lineStarts?.length || 1, originalChars: entry.originalChars };
  }

  function getLines(id, start, count) {
    const entry = touch(id);
    if (!entry) return [];
    buildLineIndex(entry);
    const starts = entry.lineStarts;
    const normalizedStart = Math.max(0, Math.floor(Number(start) || 0));
    const normalizedCount = Math.max(0, Math.min(5000, Math.floor(Number(count) || 0)));
    if (!starts || normalizedCount <= 0 || normalizedStart >= starts.length) return [];
    const end = Math.min(starts.length, normalizedStart + normalizedCount);
    const output = new Array(end - normalizedStart);
    for (let line = normalizedStart; line < end; line += 1) output[line - normalizedStart] = formatIndexedLine(entry, line);
    return output;
  }

  function prepareWindow(id, start, count) {
    const entry = touch(id);
    if (!entry) return null;
    buildLineIndex(entry);
    const lineCount = entry.lineStarts?.length || 1;
    const normalizedStart = Math.max(0, Math.min(Math.max(0, lineCount - 1), Math.floor(Number(start) || 0)));
    return {
      documentId: entry.id,
      lineCount,
      originalChars: entry.originalChars,
      startLine: normalizedStart,
      lines: getLines(entry.id, normalizedStart, count),
    };
  }

  function search(ids, query, limit = 2_000) {
    const needle = String(query || "").trim().toLowerCase();
    const normalizedLimit = Math.min(10_000, Math.max(0, Math.floor(Number(limit) || 2_000)));
    if (!needle || normalizedLimit <= 0) return [];
    const documentIds = Array.isArray(ids) ? ids.map(String) : [];
    const matches = [];
    const listSearch = documentIds.length > 1;
    for (const id of documentIds) {
      if (matches.length >= normalizedLimit) break;
      const entry = touch(id);
      if (!entry) continue;
      const raw = ensureRawText(entry);
      if (listSearch) {
        if (raw.toLowerCase().includes(needle)) matches.push({ documentId: id, lineIndex: 0, column: 0 });
        continue;
      }
      buildLineIndex(entry);
      const starts = entry.lineStarts || [];
      for (let line = 0; line < starts.length && matches.length < normalizedLimit; line += 1) {
        const text = formatIndexedLine(entry, line).toLowerCase();
        let offset = 0;
        while (matches.length < normalizedLimit) {
          const found = text.indexOf(needle, offset);
          if (found < 0) break;
          matches.push({ documentId: id, lineIndex: line, column: found });
          offset = found + Math.max(1, needle.length);
        }
      }
    }
    return matches;
  }

  function getText(id, format = "raw") {
    const entry = touch(id);
    if (!entry) return undefined;
    if (format !== "pretty") return ensureRawText(entry);
    buildLineIndex(entry);
    const count = entry.lineStarts?.length || 0;
    const lines = new Array(count);
    for (let line = 0; line < count; line += 1) lines[line] = formatIndexedLine(entry, line);
    return lines.join("\n");
  }

  function pin(id) {
    const entry = touch(id);
    if (entry) entry.pinCount += 1;
  }

  function unpin(id) {
    const entry = touch(id);
    if (!entry) return;
    entry.pinCount = Math.max(0, entry.pinCount - 1);
    if (entry.pinCount === 0) {
      clearDecoded(entry);
      clearDerived(entry);
    }
    trimToBudget();
  }

  function release(ids) {
    for (const id of Array.isArray(ids) ? ids : []) {
      const entry = documents.get(String(id));
      if (!entry || entry.pinCount > 0) continue;
      removeDocument(String(id));
    }
    recomputeRetentionLimit();
  }

  function has(id) {
    return documents.has(String(id));
  }

  function setRetentionLimit(limit) {
    assertAvailable();
    retentionLimit = normalizePositiveInt(limit, defaultMaxDocuments);
    trimToBudget();
    return retentionLimit;
  }

  function debugStats() {
    return {
      documentCount: documents.size,
      decodedDocumentCount: countDecodedDocuments(),
      indexedDocumentCount: countIndexedDocuments(),
      pinnedDocumentCount: countPinnedDocuments(),
      rawBytes: totalRawBytes,
      decodedChars: totalDecodedChars,
      originalChars: totalOriginalChars,
      derivedBytes: totalDerivedBytes,
      indexBytes: totalDerivedBytes,
      residentBytes: residentBytes(),
      maxDocuments: retentionLimit,
      maxChars,
      maxPreparedDocuments,
      preparedDocumentCount: countDecodedDocuments(),
      rawChars: totalOriginalChars,
      derivedChars: totalDerivedBytes,
      totalChars: residentBytes(),
    };
  }

  async function handle(type, payload = {}) {
    if (type === "payload.registerValue") return registerValue(payload.id, payload.value);
    if (type === "payload.registerUtf8") return registerUtf8(payload.id, payload.bytes || payload.buffer, payload.preview, payload.originalChars);
    if (type === "payload.getMeta") return getMeta(payload.id);
    if (type === "payload.getLines") return getLines(payload.id, payload.start, payload.count);
    if (type === "payload.prepareWindow") return prepareWindow(payload.id, payload.start, payload.count);
    if (type === "payload.search") return search(payload.ids, payload.query, payload.limit);
    if (type === "payload.getText") return getText(payload.id, payload.format);
    if (type === "payload.pin") { pin(payload.id); return { ok: true }; }
    if (type === "payload.unpin") { unpin(payload.id); return { ok: true }; }
    if (type === "payload.release") { release(payload.ids); return { ok: true }; }
    if (type === "payload.setRetentionLimit") return { ok: true, limit: setRetentionLimit(payload.limit) };
    if (type === "payload.debugStats") return debugStats();
    return undefined;
  }

  function dispose() {
    disposed = true;
    documents.clear();
    totalRawBytes = 0;
    totalDecodedChars = 0;
    totalOriginalChars = 0;
    totalDerivedBytes = 0;
  }

  function touch(id) {
    assertAvailable();
    const documentId = String(id || "");
    const entry = documents.get(documentId);
    if (!entry) return null;
    sequence += 1;
    entry.touched = sequence;
    documents.delete(documentId);
    documents.set(documentId, entry);
    return entry;
  }

  function ensureRawText(entry) {
    if (entry.rawText !== null) {
      touchDecoded(entry);
      return entry.rawText;
    }
    entry.rawText = decoder.decode(entry.rawBuffer);
    totalDecodedChars += entry.rawText.length;
    touchDecoded(entry);
    trimDecodedWorkingSet(entry.id);
    return entry.rawText;
  }

  function touchDecoded(entry) {
    sequence += 1;
    entry.decodedTouched = sequence;
  }

  function trimDecodedWorkingSet(protectedId) {
    while (countDecodedDocuments() > maxPreparedDocuments) {
      let candidate = null;
      for (const entry of documents.values()) {
        if (entry.rawText === null || entry.id === protectedId || entry.pinCount > 0) continue;
        if (!candidate || entry.decodedTouched < candidate.decodedTouched) candidate = entry;
      }
      if (!candidate) break;
      clearDecoded(candidate);
    }
  }

  function buildLineIndex(entry) {
    if (entry.lineStarts && entry.lineIndents) return;
    const raw = ensureRawText(entry);
    const starts = [];
    const indents = [];
    let indent = 0;
    let lineHasContent = false;
    let index = 0;

    const startLine = (rawOffset) => {
      if (lineHasContent) return;
      starts.push(rawOffset);
      indents.push(indent);
      lineHasContent = true;
    };
    const endLine = () => { lineHasContent = false; };

    while (index < raw.length) {
      const code = raw.charCodeAt(index);
      if (isWhitespace(code)) { index += 1; continue; }
      if (code === 34) { startLine(index); index = consumeString(raw, index); continue; }
      if (code === 123 || code === 91) {
        startLine(index);
        const closeCode = code === 123 ? 125 : 93;
        const next = nextSignificantIndex(raw, index + 1);
        if (next < raw.length && raw.charCodeAt(next) === closeCode) { index = next + 1; continue; }
        index += 1;
        endLine();
        indent += 1;
        continue;
      }
      if (code === 44) { startLine(index); index += 1; endLine(); continue; }
      if (code === 125 || code === 93) {
        if (lineHasContent) endLine();
        indent = Math.max(0, indent - 1);
        startLine(index);
        index += 1;
        continue;
      }
      startLine(index);
      index += 1;
    }

    if (starts.length === 0) { starts.push(0); indents.push(0); }
    clearDerived(entry);
    entry.lineStarts = Uint32Array.from(starts);
    entry.lineIndents = Uint16Array.from(indents.map((value) => Math.min(65_535, value)));
    entry.derivedBytes = entry.lineStarts.byteLength + entry.lineIndents.byteLength;
    totalDerivedBytes += entry.derivedBytes;
    touchDecoded(entry);
    trimDecodedWorkingSet(entry.id);
    trimToBudget(entry.id);
  }

  function formatIndexedLine(entry, lineIndex) {
    const starts = entry.lineStarts;
    const indents = entry.lineIndents;
    const raw = ensureRawText(entry);
    if (!starts || !indents || lineIndex < 0 || lineIndex >= starts.length) return "";
    const start = starts[lineIndex];
    const end = lineIndex + 1 < starts.length ? starts[lineIndex + 1] : raw.length;
    let output = indents[lineIndex] <= 0 ? "" : "  ".repeat(indents[lineIndex]);
    let inString = false;
    let escaped = false;
    for (let index = start; index < end; index += 1) {
      const code = raw.charCodeAt(index);
      const char = raw[index];
      if (inString) {
        output += char;
        if (escaped) escaped = false;
        else if (code === 92) escaped = true;
        else if (code === 34) inString = false;
        continue;
      }
      if (code === 34) { inString = true; output += char; continue; }
      if (isWhitespace(code)) continue;
      if (code === 58) { output += ": "; continue; }
      output += char;
    }
    return output;
  }

  function trimToBudget(protectedId) {
    if (residentBytes() > maxChars) {
      const decodedCandidates = [...documents.values()]
        .filter((entry) => entry.rawText !== null && entry.id !== protectedId && entry.pinCount <= 0)
        .sort((left, right) => left.decodedTouched - right.decodedTouched);
      for (const entry of decodedCandidates) {
        if (residentBytes() <= maxChars) break;
        clearDecoded(entry);
      }
    }
    if (residentBytes() > maxChars) {
      const indexCandidates = [...documents.values()]
        .filter((entry) => entry.lineStarts && entry.lineIndents && entry.id !== protectedId && entry.pinCount <= 0)
        .sort((left, right) => left.touched - right.touched);
      for (const entry of indexCandidates) {
        if (residentBytes() <= maxChars) break;
        clearDerived(entry);
      }
    }
    while (documents.size > retentionLimit || residentBytes() > maxChars) {
      let candidate = null;
      for (const entry of documents.values()) {
        if (entry.id !== protectedId && entry.pinCount <= 0) { candidate = entry; break; }
      }
      if (!candidate) break;
      removeDocument(candidate.id);
    }
  }

  function recomputeRetentionLimit() {
    trimToBudget();
  }

  function removeDocument(id) {
    const entry = documents.get(id);
    if (!entry) return;
    clearDerived(entry);
    clearDecoded(entry);
    totalRawBytes -= entry.rawStorageBytes;
    totalOriginalChars -= entry.originalChars;
    documents.delete(id);
  }

  function clearDecoded(entry) {
    if (!entry || entry.rawText === null) return;
    totalDecodedChars -= entry.rawText.length;
    entry.rawText = null;
    entry.decodedTouched = 0;
  }

  function clearDerived(entry) {
    if (!entry || entry.derivedBytes <= 0) return;
    totalDerivedBytes -= entry.derivedBytes;
    entry.lineStarts = null;
    entry.lineIndents = null;
    entry.derivedBytes = 0;
  }

  function residentBytes() {
    return totalRawBytes + totalDecodedChars * 2 + totalDerivedBytes;
  }

  function countDecodedDocuments() {
    let count = 0;
    for (const entry of documents.values()) if (entry.rawText !== null) count += 1;
    return count;
  }

  function countIndexedDocuments() {
    let count = 0;
    for (const entry of documents.values()) if (entry.lineStarts && entry.lineIndents) count += 1;
    return count;
  }

  function countPinnedDocuments() {
    let count = 0;
    for (const entry of documents.values()) if (entry.pinCount > 0) count += 1;
    return count;
  }

  function assertAvailable() {
    if (disposed) throw new Error("Payload document store is disposed.");
  }

  return {
    registerValue,
    registerUtf8,
    getMeta,
    getLines,
    prepareWindow,
    search,
    getText,
    pin,
    unpin,
    release,
    has,
    debugStats,
    setRetentionLimit,
    handle,
    dispose,
  };
}

function normalizePositiveInt(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.floor(numeric));
}

function normalizeBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(0);
}

function stringifyCompact(value) {
  if (typeof value === "string") {
    try { JSON.parse(value); return value; } catch { return JSON.stringify(value); }
  }
  try {
    const text = JSON.stringify(value);
    return text === undefined ? JSON.stringify(String(value)) : text;
  } catch {
    return JSON.stringify(String(value));
  }
}

function toRef(entry) {
  return { id: entry.id, preview: entry.preview, originalChars: entry.originalChars };
}

function consumeString(raw, start) {
  let index = start + 1;
  while (index < raw.length) {
    const code = raw.charCodeAt(index);
    if (code === 92) { index += 2; continue; }
    index += 1;
    if (code === 34) break;
  }
  return index;
}

function nextSignificantIndex(raw, start) {
  let index = start;
  while (index < raw.length && isWhitespace(raw.charCodeAt(index))) index += 1;
  return index;
}

function isWhitespace(code) {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

module.exports = {
  createPayloadDocumentStore,
  DEFAULT_MAX_DOCUMENTS,
};
