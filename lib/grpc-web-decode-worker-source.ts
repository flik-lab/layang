/**
 * Self-contained browser worker source for streamed gRPC-Web response parsing.
 * Decoded payloads are serialized once and transferred directly to the global
 * payload-document worker; full objects never cross the renderer boundary.
 */
export const GRPC_WEB_DECODE_WORKER_SOURCE = String.raw`
'use strict';

let schema = null;
let responseEncoding = 'text';
let frameChunks = [];
let frameHeadOffset = 0;
let frameBufferedBytes = 0;
let base64Pending = '';
let textDecoder = new TextDecoder();
let protobufTextDecoder = new TextDecoder();
let textEncoder = new TextEncoder();
let fieldMaps = Object.create(null);
let maxPreviewChars = 12000;
let payloadDocumentPort = null;
let documentSequence = 0;
let documentPrefix = 'grpc-web';
let pendingDocumentRegistrations = new Map();

self.onmessage = async function onWorkerMessage(event) {
  const message = event.data || {};
  try {
    if (message.type === 'init') {
      schema = message.schema;
      if (!schema) throw new Error('gRPC-Web worker schema is required.');
      payloadDocumentPort = message.payloadDocumentPort || null;
      if (!payloadDocumentPort) throw new Error('Payload Document Worker port is required.');
      payloadDocumentPort.onmessage = onPayloadDocumentMessage;
      if (typeof payloadDocumentPort.start === 'function') payloadDocumentPort.start();
      responseEncoding = message.responseEncoding === 'binary' ? 'binary' : 'text';
      frameChunks = [];
      frameHeadOffset = 0;
      frameBufferedBytes = 0;
      base64Pending = '';
      textDecoder = new TextDecoder();
      protobufTextDecoder = new TextDecoder();
      textEncoder = new TextEncoder();
      fieldMaps = buildFieldMaps(schema);
      maxPreviewChars = normalizePreviewChars(message.maxPreviewChars);
      documentSequence = 0;
      documentPrefix = String(message.documentPrefix || 'grpc-web');
      self.postMessage({ type: 'ready', requestId: message.requestId });
      return;
    }

    if (message.type === 'chunk') {
      if (!schema || !payloadDocumentPort) throw new Error('gRPC-Web decode worker was not initialized.');
      const chunk = new Uint8Array(message.buffer || new ArrayBuffer(0));
      const batch = await processChunk(chunk, Boolean(message.final));
      self.postMessage({ type: 'batch', requestId: message.requestId, batch: batch });
      return;
    }

    if (message.type === 'dispose') {
      schema = null;
      frameChunks = [];
      frameHeadOffset = 0;
      frameBufferedBytes = 0;
      base64Pending = '';
      fieldMaps = Object.create(null);
      for (const pending of pendingDocumentRegistrations.values()) {
        pending.reject(new Error('gRPC-Web decode worker was disposed.'));
      }
      pendingDocumentRegistrations.clear();
      try { if (payloadDocumentPort) payloadDocumentPort.close(); } catch (_) {}
      payloadDocumentPort = null;
      close();
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId: message.requestId || '',
      error: error && error.message ? String(error.message) : String(error),
    });
  }
};

function onPayloadDocumentMessage(event) {
  const message = event.data || {};
  const requestId = String(message.requestId || '');
  const pending = pendingDocumentRegistrations.get(requestId);
  if (!pending) return;
  pendingDocumentRegistrations.delete(requestId);
  if (message.type === 'error') pending.reject(new Error(String(message.error || 'Payload document registration failed.')));
  else pending.resolve(message.documentRef);
}

async function processChunk(chunk, final) {
  const binaryChunks = [];
  if (responseEncoding === 'text') {
    const text = textDecoder.decode(chunk, { stream: !final });
    const decoded = decodeBase64(text, final);
    for (let index = 0; index < decoded.length; index += 1) binaryChunks.push(decoded[index]);
  } else if (chunk.length > 0) {
    binaryChunks.push(chunk);
  }

  const framesOut = [];
  let decodedBinaryBytes = 0;
  let dataFrames = 0;
  let trailerFrames = 0;

  for (let index = 0; index < binaryChunks.length; index += 1) {
    const binary = binaryChunks[index];
    decodedBinaryBytes += binary.length;
    const frames = parseFrames(binary);
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
      const frame = frames[frameIndex];
      if (frame.kind === 'trailers') {
        trailerFrames += 1;
        framesOut.push({ kind: 'trailers', trailers: parseTrailerBlock(frame.payload) });
      } else {
        dataFrames += 1;
        const preparedDocument = prepareDocumentRegistration(frame.payload);
        const documentRef = await registerPreparedDocument(preparedDocument);
        framesOut.push({ kind: 'message', documentRef: documentRef, frameBytes: frame.payload.length });
      }
    }
  }

  if (final && frameBufferedBytes > 0) {
    throw new Error('gRPC-Web stream ended with an incomplete frame (' + frameBufferedBytes + ' buffered bytes).');
  }

  return {
    frames: framesOut,
    decodedBinaryBytes: decodedBinaryBytes,
    dataFrames: dataFrames,
    trailerFrames: trailerFrames,
    bufferedBytes: frameBufferedBytes,
  };
}

function prepareDocumentRegistration(payload) {
  const serialized = decodeProtobufMessageToJson(payload, schema.rootType);
  const preview = serialized.length <= maxPreviewChars ? serialized : serialized.slice(0, maxPreviewChars);
  const bytes = textEncoder.encode(serialized);
  return { buffer: bytes.buffer, preview: preview, originalChars: serialized.length };
}

function registerPreparedDocument(prepared) {
  if (!payloadDocumentPort) return Promise.reject(new Error('Payload Document Worker port is unavailable.'));
  documentSequence += 1;
  const requestId = 'document-register:' + documentSequence;
  const id = documentPrefix + ':message:' + documentSequence;
  const buffer = prepared.buffer;
  return new Promise(function(resolve, reject) {
    pendingDocumentRegistrations.set(requestId, { resolve: resolve, reject: reject });
    try {
      payloadDocumentPort.postMessage({
        type: 'register-utf8',
        requestId: requestId,
        id: id,
        buffer: buffer,
        preview: prepared.preview,
        originalChars: prepared.originalChars,
      }, [buffer]);
    } catch (error) {
      pendingDocumentRegistrations.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function normalizePreviewChars(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 12000;
  return Math.max(256, Math.floor(numeric));
}

function buildFieldMaps(currentSchema) {
  const output = Object.create(null);
  const messages = currentSchema && currentSchema.messages ? currentSchema.messages : {};
  const names = Object.keys(messages);
  for (let index = 0; index < names.length; index += 1) {
    const typeName = names[index];
    const fields = messages[typeName].fields || [];
    const byId = Object.create(null);
    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
      byId[String(fields[fieldIndex].id)] = fields[fieldIndex];
    }
    output[typeName] = byId;
  }
  return output;
}

function decodeBase64(text, final) {
  base64Pending += String(text || '').replace(/\s+/g, '');
  const chunks = [];

  while (base64Pending.length >= 4) {
    const paddedEntityEnd = findPaddedBase64EntityEnd(base64Pending);
    if (paddedEntityEnd > 0) {
      chunks.push(base64ToBytes(base64Pending.slice(0, paddedEntityEnd)));
      base64Pending = base64Pending.slice(paddedEntityEnd);
      continue;
    }

    const decodableLength = base64Pending.length - (base64Pending.length % 4);
    if (decodableLength <= 0) break;
    chunks.push(base64ToBytes(base64Pending.slice(0, decodableLength)));
    base64Pending = base64Pending.slice(decodableLength);
  }

  if (final && base64Pending.length > 0) {
    const padded = base64Pending.padEnd(Math.ceil(base64Pending.length / 4) * 4, '=');
    chunks.push(base64ToBytes(padded));
    base64Pending = '';
  }

  return chunks;
}

function findPaddedBase64EntityEnd(text) {
  const firstPadding = text.indexOf('=');
  if (firstPadding === -1) return -1;
  let end = firstPadding;
  while (end < text.length && text[end] === '=') end += 1;
  const remainder = end % 4;
  if (remainder !== 0) {
    const adjustedEnd = end + (4 - remainder);
    return adjustedEnd > text.length ? -1 : adjustedEnd;
  }
  return end;
}

function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function parseFrames(chunk) {
  if (chunk.length > 0) {
    frameChunks.push(chunk);
    frameBufferedBytes += chunk.length;
  }

  const frames = [];
  while (frameBufferedBytes >= 5) {
    const flag = peekFrameByte(0);
    const length = readQueuedUint32BE(1);
    const frameBytes = 5 + length;
    if (frameBufferedBytes < frameBytes) break;
    consumeFrameBytes(5);
    const payload = consumeFrameBytes(length);
    if ((flag & 0x01) === 0x01) {
      throw new Error('Compressed gRPC-Web frames are not supported. Disable grpc-encoding for this tester route.');
    }
    frames.push({
      kind: (flag & 0x80) === 0x80 ? 'trailers' : 'data',
      payload: payload,
    });
  }
  return frames;
}

function peekFrameByte(relativeIndex) {
  let remaining = relativeIndex;
  for (let index = 0; index < frameChunks.length; index += 1) {
    const chunk = frameChunks[index];
    const start = index === 0 ? frameHeadOffset : 0;
    const available = chunk.length - start;
    if (remaining < available) return chunk[start + remaining];
    remaining -= available;
  }
  throw new Error('Unexpected end of queued gRPC-Web frame data.');
}

function readQueuedUint32BE(relativeOffset) {
  return peekFrameByte(relativeOffset) * 16777216
    + (peekFrameByte(relativeOffset + 1) << 16)
    + (peekFrameByte(relativeOffset + 2) << 8)
    + peekFrameByte(relativeOffset + 3);
}

function consumeFrameBytes(count) {
  if (count === 0) return new Uint8Array(0);
  if (!Number.isSafeInteger(count) || count < 0 || count > frameBufferedBytes) {
    throw new Error('Invalid queued gRPC-Web byte count: ' + count);
  }

  const first = frameChunks[0];
  const firstAvailable = first.length - frameHeadOffset;
  if (firstAvailable >= count) {
    const output = first.subarray(frameHeadOffset, frameHeadOffset + count);
    frameHeadOffset += count;
    frameBufferedBytes -= count;
    if (frameHeadOffset === first.length) {
      frameChunks.shift();
      frameHeadOffset = 0;
    }
    return output;
  }

  const output = new Uint8Array(count);
  let written = 0;
  while (written < count) {
    const current = frameChunks[0];
    const available = current.length - frameHeadOffset;
    const take = Math.min(available, count - written);
    output.set(current.subarray(frameHeadOffset, frameHeadOffset + take), written);
    written += take;
    frameHeadOffset += take;
    frameBufferedBytes -= take;
    if (frameHeadOffset === current.length) {
      frameChunks.shift();
      frameHeadOffset = 0;
    }
  }
  return output;
}

function parseTrailerBlock(payload) {
  const text = new TextDecoder().decode(payload);
  const trailers = {};
  const lines = text.split('\r\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    trailers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  return trailers;
}

function decodeProtobufMessageToJson(bytes, typeName) {
  const messageType = schema.messages[typeName];
  if (!messageType) throw new Error('Unknown protobuf message type: ' + typeName);
  const fields = messageType.fields || [];
  const byId = fieldMaps[typeName] || {};
  const slots = Object.create(null);
  const state = { offset: 0, limit: bytes.length };

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field.map) slots[field.name] = { map: Object.create(null) };
    else if (field.repeated) slots[field.name] = { list: [] };
    else slots[field.name] = { value: undefined };
  }

  while (state.offset < state.limit) {
    const tag = readVarintNumber(bytes, state);
    if (tag === 0) throw new Error('Invalid protobuf tag 0 in ' + typeName + '.');
    const fieldId = tag >>> 3;
    const wireType = tag & 7;
    const field = byId[String(fieldId)];
    if (!field) {
      skipUnknownField(bytes, state, wireType);
      continue;
    }

    const slot = slots[field.name];
    if (field.map) {
      const mapBytes = readLengthDelimited(bytes, state, wireType);
      const entry = decodeMapEntryToJson(mapBytes, field);
      slot.map[String(entry.key)] = entry.valueJson;
      continue;
    }

    if (field.repeated && wireType === 2 && isPackableField(field)) {
      const packedBytes = readLengthDelimited(bytes, state, wireType);
      const packedState = { offset: 0, limit: packedBytes.length };
      while (packedState.offset < packedState.limit) {
        slot.list.push(decodeNonMessageValueToJson(packedBytes, packedState, expectedWireType(field), field));
      }
      continue;
    }

    const valueJson = decodeFieldValueToJson(bytes, state, wireType, field);
    if (field.repeated) slot.list.push(valueJson);
    else slot.value = valueJson;
  }

  const parts = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const slot = slots[field.name];
    let valueJson;
    if (field.map) {
      const keys = Object.keys(slot.map);
      const entries = new Array(keys.length);
      for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        const key = keys[keyIndex];
        entries[keyIndex] = JSON.stringify(key) + ':' + slot.map[key];
      }
      valueJson = '{' + entries.join(',') + '}';
    } else if (field.repeated) {
      valueJson = '[' + slot.list.join(',') + ']';
    } else {
      valueJson = slot.value === undefined ? defaultFieldValueToJson(field) : slot.value;
    }
    parts.push(JSON.stringify(field.name) + ':' + valueJson);
  }
  return '{' + parts.join(',') + '}';
}

function defaultFieldValueToJson(field) {
  if (field.kind === 'message') return 'null';
  if (field.kind === 'enum') return encodeJsonValue(defaultEnumValue(field));
  return encodeJsonValue(defaultScalarValue(field));
}

function decodeFieldValueToJson(bytes, state, wireType, field) {
  if (field.kind === 'message') {
    const nested = readLengthDelimited(bytes, state, wireType);
    return decodeProtobufMessageToJson(nested, field.typeName);
  }
  return decodeNonMessageValueToJson(bytes, state, wireType, field);
}

function decodeNonMessageValueToJson(bytes, state, wireType, field) {
  if (field.kind === 'enum') {
    requireWireType(wireType, 0, field.name);
    const enumId = Number(BigInt.asIntN(32, readVarint(bytes, state)));
    const enumType = schema.enums[field.typeName];
    const value = enumType && enumType.valuesById[String(enumId)] !== undefined
      ? enumType.valuesById[String(enumId)]
      : enumId;
    return encodeJsonValue(value);
  }
  return encodeJsonValue(decodeScalar(bytes, state, wireType, field.scalarType, field.name));
}

function decodeMapEntryToJson(bytes, field) {
  const state = { offset: 0, limit: bytes.length };
  let key = defaultMapKey(field.keyType);
  let valueJson = defaultFieldValueToJson(field);

  while (state.offset < state.limit) {
    const tag = readVarintNumber(bytes, state);
    const fieldId = tag >>> 3;
    const wireType = tag & 7;
    if (fieldId === 1) {
      key = decodeScalar(bytes, state, wireType, field.keyType, field.name + '.key');
    } else if (fieldId === 2) {
      valueJson = decodeFieldValueToJson(bytes, state, wireType, field);
    } else {
      skipUnknownField(bytes, state, wireType);
    }
  }
  return { key: key, valueJson: valueJson };
}

function encodeJsonValue(value) {
  const text = JSON.stringify(value);
  return text === undefined ? 'null' : text;
}

function defaultMapKey(type) {
  if (type === 'string') return '';
  if (type === 'bool') return false;
  if (isLongType(type)) return '0';
  return 0;
}

function defaultEnumValue(field) {
  const enumType = schema.enums[field.typeName];
  if (field.defaultValue !== undefined && field.defaultValue !== null) {
    const mapped = enumType && enumType.valuesById ? enumType.valuesById[String(field.defaultValue)] : undefined;
    return mapped !== undefined ? mapped : field.defaultValue;
  }
  return enumType && enumType.defaultName !== null ? enumType.defaultName : 0;
}

function defaultScalarValue(field) {
  if (field.defaultValue !== undefined && field.defaultValue !== null) {
    if (isLongType(field.scalarType)) return String(field.defaultValue);
    return field.defaultValue;
  }
  if (field.scalarType === 'string' || field.scalarType === 'bytes') return '';
  if (field.scalarType === 'bool') return false;
  if (isLongType(field.scalarType)) return '0';
  return 0;
}

function decodeScalar(bytes, state, wireType, scalarType, fieldName) {
  switch (scalarType) {
    case 'double':
      requireWireType(wireType, 1, fieldName);
      return readFloat64(bytes, state);
    case 'float':
      requireWireType(wireType, 5, fieldName);
      return readFloat32(bytes, state);
    case 'int32':
      requireWireType(wireType, 0, fieldName);
      return Number(BigInt.asIntN(32, readVarint(bytes, state)));
    case 'uint32':
      requireWireType(wireType, 0, fieldName);
      return readVarintNumber(bytes, state);
    case 'sint32': {
      requireWireType(wireType, 0, fieldName);
      const value = readVarintNumber(bytes, state);
      return (value >>> 1) ^ -(value & 1);
    }
    case 'fixed32':
      requireWireType(wireType, 5, fieldName);
      return readUint32LE(bytes, state);
    case 'sfixed32':
      requireWireType(wireType, 5, fieldName);
      return readInt32LE(bytes, state);
    case 'int64':
      requireWireType(wireType, 0, fieldName);
      return BigInt.asIntN(64, readVarint(bytes, state)).toString();
    case 'uint64':
      requireWireType(wireType, 0, fieldName);
      return BigInt.asUintN(64, readVarint(bytes, state)).toString();
    case 'sint64':
      requireWireType(wireType, 0, fieldName);
      return BigInt.asIntN(64, decodeZigZag(readVarint(bytes, state))).toString();
    case 'fixed64':
      requireWireType(wireType, 1, fieldName);
      return BigInt.asUintN(64, readFixed64(bytes, state)).toString();
    case 'sfixed64':
      requireWireType(wireType, 1, fieldName);
      return BigInt.asIntN(64, readFixed64(bytes, state)).toString();
    case 'bool':
      requireWireType(wireType, 0, fieldName);
      return readVarintNumber(bytes, state) !== 0;
    case 'string': {
      const value = readLengthDelimited(bytes, state, wireType);
      return protobufTextDecoder.decode(value);
    }
    case 'bytes':
      return bytesToBase64(readLengthDelimited(bytes, state, wireType));
    default:
      throw new Error('Unsupported protobuf scalar type for ' + fieldName + ': ' + scalarType);
  }
}

function expectedWireType(field) {
  if (field.kind === 'enum') return 0;
  switch (field.scalarType) {
    case 'double':
    case 'fixed64':
    case 'sfixed64':
      return 1;
    case 'string':
    case 'bytes':
      return 2;
    case 'float':
    case 'fixed32':
    case 'sfixed32':
      return 5;
    default:
      return 0;
  }
}

function isPackableField(field) {
  if (field.kind === 'enum') return true;
  return field.kind === 'scalar' && field.scalarType !== 'string' && field.scalarType !== 'bytes';
}

function isLongType(type) {
  return type === 'int64' || type === 'uint64' || type === 'sint64' || type === 'fixed64' || type === 'sfixed64';
}

function readVarintNumber(bytes, state) {
  let value = 0;
  let multiplier = 1;
  for (let count = 0; count < 10; count += 1) {
    if (state.offset >= state.limit) throw new Error('Unexpected end of protobuf varint.');
    const byte = bytes[state.offset++];
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) {
      if (!Number.isSafeInteger(value)) throw new Error('Protobuf varint exceeds Number safe integer range.');
      return value;
    }
    multiplier *= 128;
  }
  throw new Error('Protobuf varint exceeds 10 bytes.');
}

function readVarint(bytes, state) {
  let value = 0n;
  let shift = 0n;
  for (let count = 0; count < 10; count += 1) {
    if (state.offset >= state.limit) throw new Error('Unexpected end of protobuf varint.');
    const byte = bytes[state.offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7n;
  }
  throw new Error('Protobuf varint exceeds 10 bytes.');
}

function decodeZigZag(value) {
  return (value >> 1n) ^ (-(value & 1n));
}

function readLengthDelimited(bytes, state, wireType) {
  requireWireType(wireType, 2, 'length-delimited field');
  const length = readVarintNumber(bytes, state);
  const end = state.offset + length;
  if (!Number.isSafeInteger(length) || length < 0 || end > state.limit) {
    throw new Error('Invalid protobuf length-delimited field length: ' + length);
  }
  const value = bytes.subarray(state.offset, end);
  state.offset = end;
  return value;
}

function readFloat64(bytes, state) {
  ensureAvailable(state, 8);
  const value = new DataView(bytes.buffer, bytes.byteOffset + state.offset, 8).getFloat64(0, true);
  state.offset += 8;
  return value;
}

function readFloat32(bytes, state) {
  ensureAvailable(state, 4);
  const value = new DataView(bytes.buffer, bytes.byteOffset + state.offset, 4).getFloat32(0, true);
  state.offset += 4;
  return value;
}

function readUint32LE(bytes, state) {
  ensureAvailable(state, 4);
  const value = new DataView(bytes.buffer, bytes.byteOffset + state.offset, 4).getUint32(0, true);
  state.offset += 4;
  return value;
}

function readInt32LE(bytes, state) {
  ensureAvailable(state, 4);
  const value = new DataView(bytes.buffer, bytes.byteOffset + state.offset, 4).getInt32(0, true);
  state.offset += 4;
  return value;
}

function readFixed64(bytes, state) {
  ensureAvailable(state, 8);
  const view = new DataView(bytes.buffer, bytes.byteOffset + state.offset, 8);
  const low = BigInt(view.getUint32(0, true));
  const high = BigInt(view.getUint32(4, true));
  state.offset += 8;
  return low | (high << 32n);
}

function skipUnknownField(bytes, state, wireType) {
  if (wireType === 0) {
    readVarint(bytes, state);
    return;
  }
  if (wireType === 1) {
    ensureAvailable(state, 8);
    state.offset += 8;
    return;
  }
  if (wireType === 2) {
    const length = readVarintNumber(bytes, state);
    ensureAvailable(state, length);
    state.offset += length;
    return;
  }
  if (wireType === 5) {
    ensureAvailable(state, 4);
    state.offset += 4;
    return;
  }
  throw new Error('Unsupported protobuf wire type: ' + wireType);
}

function ensureAvailable(state, count) {
  if (!Number.isSafeInteger(count) || count < 0 || state.offset + count > state.limit) {
    throw new Error('Unexpected end of protobuf payload.');
  }
}

function requireWireType(actual, expected, fieldName) {
  if (actual !== expected) {
    throw new Error('Unexpected protobuf wire type for ' + fieldName + ': expected ' + expected + ', received ' + actual + '.');
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    let chunkText = '';
    for (let index = 0; index < chunk.length; index += 1) chunkText += String.fromCharCode(chunk[index]);
    binary += chunkText;
  }
  return btoa(binary);
}



`;
