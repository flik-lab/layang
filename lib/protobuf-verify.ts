import * as protobuf from "protobufjs";

/**
 * Codegen-free equivalent of protobufjs `Type#verify` (protobufjs/src/verifier.js).
 * protobufjs builds its verifier with `new Function`, which the packaged
 * renderer CSP blocks (no 'unsafe-eval'). This walks the reflected type
 * instead and returns the same messages: `null` when valid, otherwise e.g.
 * `"age: integer expected"` or `"inner.tags: string[] expected"`.
 */
export function verifyProtobufMessage(type: protobuf.Type, message: unknown): string | null {
  resolveFeatures(type);
  return verifyMessage(type, message, 0);
}

type FeatureResolution = {
  _needsRecursiveFeatureResolution?: boolean;
  _edition?: string;
  _resolveFeaturesRecursive?: (edition: string) => void;
};

/** Mirrors `Type#setup`: field presence (proto2 `required`) is a resolved edition feature. */
function resolveFeatures(type: protobuf.Type) {
  const root = type.root as unknown as FeatureResolution | null;
  if (!root?._needsRecursiveFeatureResolution) return;
  const edition = root._edition || (type as unknown as FeatureResolution)._edition;
  if (edition) root._resolveFeaturesRecursive?.(edition);
}

const RECURSION_LIMIT = 100;
const KEY_32 = /^-?(?:0|[1-9][0-9]*)$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: same pattern as protobufjs util.key64Re
const KEY_64 = /^(?:[\x00-\xff]{8}|-?(?:0|[1-9][0-9]*))$/;
const KEY_BOOL = /^(?:true|false|0|1)$/;

function verifyMessage(type: protobuf.Type, message: unknown, depth: number): string | null {
  if (typeof message !== "object" || message === null) return "object expected";
  if (depth > RECURSION_LIMIT) return "max depth exceeded";
  const record = message as Record<string, unknown>;
  const seenOneofs = new Set<string>();

  for (const field of type.fieldsArray) {
    field.resolve();
    const value = record[field.name];
    if (field.optional && (value == null || !Object.hasOwn(record, field.name))) continue;

    let error: string | null = null;
    if (field.map) {
      if (!isObject(value)) return invalid(field, "object");
      for (const key of Object.keys(value)) {
        error = verifyKey(field, key) ?? verifyValue(field, (value as Record<string, unknown>)[key], depth);
        if (error) return error;
      }
    } else if (field.repeated) {
      if (!Array.isArray(value)) return invalid(field, "array");
      for (const item of value) {
        error = verifyValue(field, item, depth);
        if (error) return error;
      }
    } else {
      if (field.partOf) {
        if (seenOneofs.has(field.partOf.name)) return `${field.partOf.name}: multiple values`;
        seenOneofs.add(field.partOf.name);
      }
      error = verifyValue(field, value, depth);
      if (error) return error;
    }
  }
  return null;
}

function verifyValue(field: protobuf.Field, value: unknown, depth: number): string | null {
  const resolvedType = field.resolvedType;
  if (resolvedType instanceof protobuf.Enum) {
    const closed = (resolvedType as unknown as { _features?: { enum_type?: string } })._features?.enum_type === "CLOSED";
    if (closed) return Object.values(resolvedType.values).includes(value as number) ? null : invalid(field, "enum value");
    return typeof value !== "number" || (value | 0) !== value ? invalid(field, "enum value") : null;
  }
  if (resolvedType instanceof protobuf.Type) {
    const error = verifyMessage(resolvedType, value, depth + 1);
    return error ? `${field.name}.${error}` : null;
  }
  switch (field.type) {
    case "int32":
    case "uint32":
    case "sint32":
    case "fixed32":
    case "sfixed32":
      return Number.isInteger(value) ? null : invalid(field, "integer");
    case "int64":
    case "uint64":
    case "sint64":
    case "fixed64":
    case "sfixed64": {
      const long = value as { low?: unknown; high?: unknown } | null | undefined;
      return Number.isInteger(value) || (long && Number.isInteger(long.low) && Number.isInteger(long.high))
        ? null
        : invalid(field, "integer|Long");
    }
    case "float":
    case "double":
      return typeof value === "number" ? null : invalid(field, "number");
    case "bool":
      return typeof value === "boolean" ? null : invalid(field, "boolean");
    case "string":
      return isString(value) ? null : invalid(field, "string");
    case "bytes":
      return (value && typeof (value as { length?: unknown }).length === "number") || isString(value)
        ? null
        : invalid(field, "buffer");
    default:
      return null;
  }
}

function verifyKey(field: protobuf.Field, key: string): string | null {
  switch ((field as unknown as protobuf.MapField).keyType) {
    case "int32":
    case "uint32":
    case "sint32":
    case "fixed32":
    case "sfixed32":
      return KEY_32.test(key) ? null : invalid(field, "integer key");
    case "int64":
    case "uint64":
    case "sint64":
    case "fixed64":
    case "sfixed64":
      return KEY_64.test(key) ? null : invalid(field, "integer|Long key");
    case "bool":
      return KEY_BOOL.test(key) ? null : invalid(field, "boolean key");
    default:
      return null;
  }
}

function invalid(field: protobuf.Field, expected: string): string {
  const suffix = field.repeated && expected !== "array"
    ? "[]"
    : field.map && expected !== "object" ? `{k:${(field as unknown as protobuf.MapField).keyType}}` : "";
  return `${field.name}: ${expected}${suffix} expected`;
}

function isObject(value: unknown): value is object {
  return Boolean(value) && typeof value === "object";
}

function isString(value: unknown): boolean {
  return typeof value === "string" || value instanceof String;
}
