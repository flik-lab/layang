/**
 * Global payload-document worker. Native/gRPC-Web UTF-8 payloads stay byte-backed
 * while idle. Only a small LRU working set is decoded/indexed for reading so a
 * large-message streams retain only a short recent window instead of many large JS strings plus indexes.
 */
export const PAYLOAD_DOCUMENT_WORKER_SOURCE = String.raw`
'use strict';

let maxDocuments = 64;
let maxChars = 96000000;
let maxPreparedDocuments = 4;
let sequence = 0;
let totalRawBytes = 0;
let totalDecodedChars = 0;
let totalOriginalChars = 0;
let totalDerivedBytes = 0;
let documents = new Map();
let producerPorts = new Set();
const decoder = new TextDecoder();
const encoder = new TextEncoder();

self.onmessage = function onPayloadDocumentMessage(event) {
  const message = event.data || {};
  const requestId = String(message.requestId || '');
  try {
    if (message.type === 'init' || message.type === 'configure') {
      configure(message);
      self.postMessage({ type: message.type === 'init' ? 'ready' : 'ok', requestId: requestId });
      return;
    }
    if (message.type === 'register-value') {
      const rawText = stringifyCompact(message.value);
      const entry = registerText(String(message.id || ''), rawText, '', rawText.length);
      self.postMessage({ type: 'registered', requestId: requestId, documentRef: toRef(entry) });
      return;
    }
    if (message.type === 'register-utf8') {
      const entry = registerUtf8(
        String(message.id || ''),
        normalizeBuffer(message.buffer),
        String(message.preview || ''),
        Number(message.originalChars) || 0,
      );
      self.postMessage({ type: 'registered', requestId: requestId, documentRef: toRef(entry) });
      return;
    }
    if (message.type === 'attach-producer-port') {
      const port = message.port;
      if (!port) throw new Error('Payload producer port is required.');
      attachProducerPort(port);
      self.postMessage({ type: 'ok', requestId: requestId });
      return;
    }
    if (message.type === 'get-meta') {
      const entry = touch(String(message.id || ''));
      self.postMessage({ type: 'meta', requestId: requestId, meta: entry ? getMeta(entry) : null });
      return;
    }
    if (message.type === 'get-lines') {
      const entry = touch(String(message.id || ''));
      const start = Math.max(0, Math.floor(Number(message.start) || 0));
      const count = Math.max(0, Math.min(5000, Math.floor(Number(message.count) || 0)));
      self.postMessage({ type: 'lines', requestId: requestId, lines: entry ? getLines(entry, start, count) : [] });
      return;
    }
    if (message.type === 'prepare-window') {
      const entry = touch(String(message.id || ''));
      const start = Math.max(0, Math.floor(Number(message.start) || 0));
      const count = Math.max(0, Math.min(5000, Math.floor(Number(message.count) || 0)));
      self.postMessage({ type: 'prepared-window', requestId: requestId, window: entry ? prepareWindow(entry, start, count) : null });
      return;
    }
    if (message.type === 'pin') {
      const entry = touch(String(message.id || ''));
      if (entry) entry.pinCount += 1;
      self.postMessage({ type: 'ok', requestId: requestId });
      return;
    }
    if (message.type === 'unpin') {
      const entry = touch(String(message.id || ''));
      if (entry) {
        entry.pinCount = Math.max(0, entry.pinCount - 1);
        if (entry.pinCount === 0) {
          clearDecoded(entry);
          clearDerived(entry);
        }
      }
      trimToBudget();
      self.postMessage({ type: 'ok', requestId: requestId });
      return;
    }
    if (message.type === 'search') {
      const ids = Array.isArray(message.ids) ? message.ids.map(String) : [];
      const query = String(message.query || '').trim().toLowerCase();
      const limit = normalizeSearchLimit(message.limit);
      self.postMessage({ type: 'search-result', requestId: requestId, matches: searchDocuments(ids, query, limit) });
      return;
    }
    if (message.type === 'get-text') {
      const entry = touch(String(message.id || ''));
      let text;
      if (entry) text = message.format === 'pretty' ? buildPrettyText(entry) : ensureRawText(entry);
      self.postMessage({ type: 'text', requestId: requestId, text: text });
      return;
    }
    if (message.type === 'release') {
      const ids = Array.isArray(message.ids) ? message.ids : [];
      for (let index = 0; index < ids.length; index += 1) removeDocument(String(ids[index] || ''));
      self.postMessage({ type: 'ok', requestId: requestId });
      return;
    }
    if (message.type === 'debug-stats') {
      self.postMessage({
        type: 'debug-stats',
        requestId: requestId,
        stats: {
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
          maxDocuments: maxDocuments,
          maxChars: maxChars,
          maxPreparedDocuments: maxPreparedDocuments,
          preparedDocumentCount: countDecodedDocuments(),
          rawChars: totalOriginalChars,
          derivedChars: totalDerivedBytes,
          totalChars: residentBytes(),
        },
      });
      return;
    }
    if (message.type === 'dispose') {
      for (const port of producerPorts) {
        try { port.close(); } catch (_) {}
      }
      producerPorts.clear();
      documents.clear();
      totalRawBytes = 0;
      totalDecodedChars = 0;
      totalOriginalChars = 0;
      totalDerivedBytes = 0;
      close();
    }
  } catch (error) {
    self.postMessage({ type: 'error', requestId: requestId, error: error && error.message ? String(error.message) : String(error) });
  }
};

function configure(message) {
  const nextMaxDocuments = Number(message.maxDocuments);
  const nextMaxChars = Number(message.maxChars);
  const nextMaxPreparedDocuments = Number(message.maxPreparedDocuments);
  if (Number.isFinite(nextMaxDocuments) && nextMaxDocuments > 0) maxDocuments = Math.max(1, Math.floor(nextMaxDocuments));
  if (Number.isFinite(nextMaxChars) && nextMaxChars > 0) maxChars = Math.max(1024, Math.floor(nextMaxChars));
  if (Number.isFinite(nextMaxPreparedDocuments) && nextMaxPreparedDocuments > 0) maxPreparedDocuments = Math.max(1, Math.floor(nextMaxPreparedDocuments));
  trimToBudget();
}

function attachProducerPort(port) {
  producerPorts.add(port);
  port.onmessage = function onProducerMessage(event) {
    const message = event.data || {};
    const requestId = String(message.requestId || '');
    try {
      if (message.type !== 'register-utf8') return;
      const entry = registerUtf8(
        String(message.id || ''),
        normalizeBuffer(message.buffer),
        String(message.preview || ''),
        Number(message.originalChars) || 0,
      );
      port.postMessage({ type: 'registered', requestId: requestId, documentRef: toRef(entry) });
    } catch (error) {
      port.postMessage({ type: 'error', requestId: requestId, error: error && error.message ? String(error.message) : String(error) });
    }
  };
  if (typeof port.start === 'function') port.start();
}

function normalizeBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (value && value.buffer instanceof ArrayBuffer) {
    const offset = Number(value.byteOffset) || 0;
    const length = Number(value.byteLength) || 0;
    if (offset === 0 && length === value.buffer.byteLength) return value.buffer;
    return value.buffer.slice(offset, offset + length);
  }
  return new ArrayBuffer(0);
}

function registerText(id, rawText, preview, originalChars) {
  if (!id) throw new Error('Payload document id is required.');
  removeDocument(id);
  const raw = String(rawText || '');
  const bytes = encoder.encode(raw);
  const buffer = bytes.buffer;
  sequence += 1;
  const entry = {
    id: id,
    rawBuffer: buffer,
    rawText: null,
    rawStorageBytes: buffer.byteLength,
    originalChars: Number.isFinite(originalChars) && originalChars > 0 ? Math.floor(originalChars) : raw.length,
    preview: preview || (raw.length <= 4096 ? raw : raw.slice(0, 4096)),
    lineStarts: null,
    lineIndents: null,
    derivedBytes: 0,
    touched: sequence,
    decodedTouched: 0,
    pinCount: 0,
    byteBacked: true,
  };
  documents.set(id, entry);
  totalRawBytes += entry.rawStorageBytes;
  totalOriginalChars += entry.originalChars;
  trimToBudget(id);
  return requireRetained(id);
}

function registerUtf8(id, rawBuffer, preview, originalChars) {
  if (!id) throw new Error('Payload document id is required.');
  removeDocument(id);
  const buffer = rawBuffer || new ArrayBuffer(0);
  sequence += 1;
  const entry = {
    id: id,
    rawBuffer: buffer,
    rawText: null,
    rawStorageBytes: buffer.byteLength,
    originalChars: Number.isFinite(originalChars) && originalChars > 0 ? Math.floor(originalChars) : buffer.byteLength,
    preview: preview || '',
    lineStarts: null,
    lineIndents: null,
    derivedBytes: 0,
    touched: sequence,
    decodedTouched: 0,
    pinCount: 0,
    byteBacked: true,
  };
  documents.set(id, entry);
  totalRawBytes += entry.rawStorageBytes;
  totalOriginalChars += entry.originalChars;
  trimToBudget(id);
  return requireRetained(id);
}

function requireRetained(id) {
  const retained = documents.get(id);
  if (!retained) throw new Error('Payload document exceeded the configured retention budget.');
  return retained;
}

function stringifyCompact(value) {
  if (typeof value === 'string') {
    try { JSON.parse(value); return value; } catch (_) { return JSON.stringify(value); }
  }
  try {
    const text = JSON.stringify(value);
    return text === undefined ? JSON.stringify(String(value)) : text;
  } catch (_) {
    return JSON.stringify(String(value));
  }
}

function toRef(entry) {
  return { id: entry.id, preview: entry.preview, originalChars: entry.originalChars };
}

function touch(id) {
  const entry = documents.get(id);
  if (!entry) return null;
  sequence += 1;
  entry.touched = sequence;
  documents.delete(id);
  documents.set(id, entry);
  return entry;
}

function ensureRawText(entry) {
  if (entry.rawText !== null) {
    if (entry.byteBacked) touchDecoded(entry);
    return entry.rawText;
  }
  const buffer = entry.rawBuffer || new ArrayBuffer(0);
  entry.rawText = decoder.decode(new Uint8Array(buffer));
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
      if (!entry.byteBacked || entry.rawText === null || entry.id === protectedId || entry.pinCount > 0) continue;
      if (!candidate || entry.decodedTouched < candidate.decodedTouched) candidate = entry;
    }
    if (!candidate) break;
    clearDecoded(candidate);
  }
}

function clearDecoded(entry) {
  if (!entry || !entry.byteBacked || entry.rawText === null) return;
  totalDecodedChars -= entry.rawText.length;
  entry.rawText = null;
  entry.decodedTouched = 0;
}

function getMeta(entry) {
  buildLineIndex(entry);
  return { lineCount: entry.lineStarts ? entry.lineStarts.length : 1, originalChars: entry.originalChars };
}

function buildLineIndex(entry) {
  if (entry.lineStarts && entry.lineIndents) return;
  const raw = ensureRawText(entry);
  const starts = [];
  const indents = [];
  let indent = 0;
  let lineHasContent = false;
  let index = 0;

  function startLine(rawOffset) {
    if (lineHasContent) return;
    starts.push(rawOffset);
    indents.push(indent);
    lineHasContent = true;
  }
  function endLine() { lineHasContent = false; }

  while (index < raw.length) {
    const code = raw.charCodeAt(index);
    if (isWhitespace(code)) { index += 1; continue; }
    if (code === 34) { startLine(index); index = consumeString(raw, index); continue; }
    if (code === 123 || code === 91) {
      startLine(index);
      const closeCode = code === 123 ? 125 : 93;
      const next = nextSignificantIndex(raw, index + 1);
      if (next < raw.length && raw.charCodeAt(next) === closeCode) { index = next + 1; continue; }
      index += 1; endLine(); indent += 1; continue;
    }
    if (code === 44) { startLine(index); index += 1; endLine(); continue; }
    if (code === 125 || code === 93) {
      if (lineHasContent) endLine();
      indent = Math.max(0, indent - 1);
      startLine(index); index += 1; continue;
    }
    startLine(index); index += 1;
  }

  if (starts.length === 0) { starts.push(0); indents.push(0); }
  const lineStarts = new Uint32Array(starts.length);
  const lineIndents = new Uint16Array(indents.length);
  for (let line = 0; line < starts.length; line += 1) {
    lineStarts[line] = starts[line];
    lineIndents[line] = Math.min(65535, indents[line]);
  }
  clearDerived(entry);
  entry.lineStarts = lineStarts;
  entry.lineIndents = lineIndents;
  entry.derivedBytes = lineStarts.byteLength + lineIndents.byteLength;
  totalDerivedBytes += entry.derivedBytes;
  if (entry.byteBacked) {
    touchDecoded(entry);
    trimDecodedWorkingSet(entry.id);
  }
  trimToBudget(entry.id);
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

function isWhitespace(code) { return code === 32 || code === 9 || code === 10 || code === 13; }

function getLines(entry, start, count) {
  buildLineIndex(entry);
  const starts = entry.lineStarts;
  if (!starts || count <= 0 || start >= starts.length) return [];
  const end = Math.min(starts.length, start + count);
  const output = new Array(end - start);
  for (let line = start; line < end; line += 1) output[line - start] = formatIndexedLine(entry, line);
  return output;
}

function prepareWindow(entry, start, count) {
  buildLineIndex(entry);
  const lineCount = entry.lineStarts ? entry.lineStarts.length : 1;
  const normalizedStart = Math.max(0, Math.min(Math.max(0, lineCount - 1), start));
  return {
    documentId: entry.id,
    lineCount: lineCount,
    originalChars: entry.originalChars,
    startLine: normalizedStart,
    lines: getLines(entry, normalizedStart, count),
  };
}

function formatIndexedLine(entry, lineIndex) {
  const starts = entry.lineStarts;
  const indents = entry.lineIndents;
  const raw = ensureRawText(entry);
  if (!starts || !indents || lineIndex < 0 || lineIndex >= starts.length) return '';
  const start = starts[lineIndex];
  const end = lineIndex + 1 < starts.length ? starts[lineIndex + 1] : raw.length;
  let output = repeatIndent(indents[lineIndex]);
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
    if (code === 58) { output += ': '; continue; }
    output += char;
  }
  return output;
}

function repeatIndent(indent) { return indent <= 0 ? '' : '  '.repeat(indent); }

function buildPrettyText(entry) {
  buildLineIndex(entry);
  const starts = entry.lineStarts;
  if (!starts) return ensureRawText(entry);
  const lines = new Array(starts.length);
  for (let line = 0; line < starts.length; line += 1) lines[line] = formatIndexedLine(entry, line);
  return lines.join('\n');
}

function searchDocuments(ids, query, limit) {
  if (!query || limit <= 0) return [];
  const matches = [];
  const documentListSearch = ids.length > 1;
  for (let idIndex = 0; idIndex < ids.length && matches.length < limit; idIndex += 1) {
    const id = ids[idIndex];
    const entry = touch(id);
    if (!entry) continue;
    const raw = ensureRawText(entry);
    if (documentListSearch) {
      if (raw.toLowerCase().indexOf(query) >= 0) matches.push({ documentId: id, lineIndex: 0, column: 0 });
      continue;
    }
    buildLineIndex(entry);
    const starts = entry.lineStarts;
    if (!starts) continue;
    for (let line = 0; line < starts.length && matches.length < limit; line += 1) {
      const text = formatIndexedLine(entry, line).toLowerCase();
      let offset = 0;
      while (matches.length < limit) {
        const found = text.indexOf(query, offset);
        if (found < 0) break;
        matches.push({ documentId: id, lineIndex: line, column: found });
        offset = found + Math.max(1, query.length);
      }
    }
  }
  return matches;
}

function normalizeSearchLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 2000;
  return Math.min(10000, Math.floor(numeric));
}

function countDecodedDocuments() {
  let count = 0;
  for (const entry of documents.values()) if (entry.byteBacked && entry.rawText !== null) count += 1;
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

function clearDerived(entry) {
  if (!entry || entry.derivedBytes <= 0) return;
  totalDerivedBytes -= entry.derivedBytes;
  entry.lineStarts = null;
  entry.lineIndents = null;
  entry.derivedBytes = 0;
}

function removeDocument(id) {
  const entry = documents.get(id);
  if (!entry) return;
  clearDerived(entry);
  if (entry.byteBacked && entry.rawText !== null) totalDecodedChars -= entry.rawText.length;
  totalRawBytes -= entry.rawStorageBytes;
  totalOriginalChars -= entry.originalChars;
  documents.delete(id);
}

function residentBytes() { return totalRawBytes + totalDecodedChars * 2 + totalDerivedBytes; }

function trimToBudget(protectedId) {
  if (residentBytes() > maxChars) {
    const decodedCandidates = [...documents.values()]
      .filter((entry) => entry.byteBacked && entry.rawText !== null && entry.id !== protectedId && entry.pinCount <= 0)
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
  while (documents.size > maxDocuments || residentBytes() > maxChars) {
    let candidate = null;
    for (const entry of documents.values()) {
      if (entry.id !== protectedId && entry.pinCount <= 0) { candidate = entry; break; }
    }
    if (!candidate) break;
    removeDocument(candidate.id);
  }
}
`;
