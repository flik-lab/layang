"use strict";

/**
 * Layang loads protos with protobufjs `keepCase: false`, so every field is known by its camelCase
 * name (`tacticalTrackNumber`). protobuf JSON accepts the original proto field name as well
 * (`tactical_track_number`), but protobufjs `fromObject` and grpc-js serialization silently drop a
 * key they do not know, which sent an empty request to the server. This maps proto field names to
 * the loaded names and rejects keys that match no field, before a request is serialized.
 */

/** Well-known types whose JSON form is not an object of their own fields. */
const OPAQUE_TYPES = new Set([
  ".google.protobuf.Any",
  ".google.protobuf.Struct",
  ".google.protobuf.Value",
  ".google.protobuf.ListValue",
]);

/**
 * protobufjs' field-name rule for `keepCase: false` (`util.camelCase`).
 * @param {string} name - Field name as written in the proto.
 * @returns {string} Loaded field name.
 */
function protoCamelCase(name) {
  return String(name).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMessageType(type) {
  return Boolean(type) && Array.isArray(type.fieldsArray);
}

/**
 * Returns `value` with proto field names renamed to the loaded (camelCase) names, recursively.
 * @param {object} messageType - protobufjs Type of the request message.
 * @param {unknown} value - Request object parsed from JSON.
 * @returns {unknown} The same request with loaded field names.
 * @throws {Error} When a key matches no field, or a field is given under both spellings.
 */
function normalizeRequestFieldNames(messageType, value) {
  const unknown = [];
  const result = normalizeMessage(messageType, value, "", unknown);
  if (unknown.length) {
    const fields = messageType.fieldsArray.map((field) => field.name).join(", ");
    throw new Error(
      `Unknown field${unknown.length > 1 ? "s" : ""} in ${messageType.name} request: ${unknown.join(", ")}. ` +
        `Use the proto field names or their camelCase form (${messageType.name} fields: ${fields || "none"}).`,
    );
  }
  return result;
}

function normalizeMessage(messageType, value, path, unknown) {
  if (!isPlainObject(value) || OPAQUE_TYPES.has(messageType.fullName)) return value;
  messageType.resolveAll?.();
  const fields = messageType.fields || {};
  const normalized = {};
  for (const [key, item] of Object.entries(value)) {
    const name = Object.hasOwn(fields, key) ? key : protoCamelCase(key);
    const field = Object.hasOwn(fields, name) ? fields[name] : undefined;
    if (!field) {
      unknown.push(`${path}${key}`);
      continue;
    }
    if (Object.hasOwn(normalized, name))
      throw new Error(`Field ${path}${name} is given twice (as ${name} and as a proto field name).`);
    normalized[name] = normalizeField(field, item, `${path}${name}.`, unknown);
  }
  return normalized;
}

function normalizeField(field, value, path, unknown) {
  const type = field.resolvedType;
  if (!isMessageType(type)) return value;
  if (field.map && isPlainObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeMessage(type, item, `${path}${key}.`, unknown)]),
    );
  if (field.repeated && Array.isArray(value))
    return value.map((item, index) => normalizeMessage(type, item, `${path}${index}.`, unknown));
  return normalizeMessage(type, value, path, unknown);
}

/**
 * Returns `expected` with each key renamed to the camelCase form `actual` uses, when `actual` has
 * no key with the original spelling. Lets a mock matcher written with proto field names match a
 * request decoded with camelCase names, without renaming keys that really are snake_case.
 * @param {unknown} actual - Decoded request (or part of it).
 * @param {unknown} expected - Matcher value (or part of it).
 * @returns {unknown} Matcher value aligned to the request's key spelling.
 */
function alignKeysToActual(actual, expected) {
  if (Array.isArray(expected)) {
    const shape = Array.isArray(actual) ? mergeShapes(actual) : actual;
    return expected.map((item, index) =>
      alignKeysToActual(Array.isArray(actual) && index < actual.length ? actual[index] : shape, item),
    );
  }
  if (!isPlainObject(expected)) return expected;
  const source = isPlainObject(actual) ? actual : {};
  const aligned = {};
  for (const [key, item] of Object.entries(expected)) {
    const camel = protoCamelCase(key);
    const name = !Object.hasOwn(source, key) && Object.hasOwn(source, camel) ? camel : key;
    aligned[name] = alignKeysToActual(source[name], item);
  }
  return aligned;
}

function mergeShapes(items) {
  const objects = items.filter(isPlainObject);
  return objects.length ? Object.assign({}, ...objects) : undefined;
}

module.exports = { normalizeRequestFieldNames, alignKeysToActual, protoCamelCase };
