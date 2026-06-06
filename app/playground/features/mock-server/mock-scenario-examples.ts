import * as protobuf from "protobufjs";
import { generateExampleFromType as generateBaseExampleFromType } from "@/lib/example-generator";
import { isPlainRecord } from "../../shared/json-utils";
import { randomInt } from "../../shared/number-utils";
import type { MockScenarioMatcher } from "../../shared/workbench-types";

/**
 * Parses an object JSON string or generates a fallback payload.
 */
export function parseObjectOrFallback(text: string | undefined, fallback: () => unknown) {
  if (text?.trim()) {
    try {
      return JSON.parse(text);
    } catch {
      /* Use fallback below. */
    }
  }
  return fallback();
}

/**
 * Generates an example protobuf payload without failing the mock editor.
 */
export function safeGenerateExample(root: protobuf.Root, typeName: string) {
  try {
    return generateBaseExampleFromType(root, typeName);
  } catch {
    return {};
  }
}

/**
 * Generates a random protobuf payload without failing the mock editor.
 */
export function safeGenerateRandomExample(root: protobuf.Root, typeName: string) {
  try {
    return generateRandomExampleFromType(root, typeName);
  } catch {
    return safeGenerateExample(root, typeName);
  }
}

/**
 * Adds sequence-ish values to generated stream examples when those fields exist.
 */
export function decorateGeneratedResponse(value: unknown, sequence: number): unknown {
  if (!isPlainRecord(value)) return value;
  const output: Record<string, unknown> = { ...value };
  for (const key of Object.keys(output)) {
    if (/sequence|seq|index|count/i.test(key)) output[key] = sequence;
    if (/message|text|name/i.test(key) && typeof output[key] === "string") output[key] = `${output[key]} #${sequence}`;
  }
  return output;
}

/**
 * Builds a small partial object for contains matching from the first primitive field.
 */
export function firstPrimitivePatch(value: unknown): unknown | null {
  if (!isPlainRecord(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    if (item === null) continue;
    if (["string", "number", "boolean"].includes(typeof item)) return { [key]: item };
    const nested = firstPrimitivePatch(item);
    if (nested) return { [key]: nested };
  }
  return null;
}

export function buildDefaultMockInputMatcher(
  requestExample: unknown,
  containsPatch: unknown | null,
): MockScenarioMatcher {
  if (isUsefulContainsMatcher(containsPatch)) {
    return { or: [{ equals: requestExample }, { contains: containsPatch }] };
  }
  return { equals: requestExample };
}

export function isUsefulContainsMatcher(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainRecord(value)) return Object.keys(value).length > 0;
  return true;
}

/**
 * Stringifies a JSON-compatible value into a small YAML subset used by the scenario editor.
 */
export function generateRandomExampleFromType(
  root: protobuf.Root,
  typeName: string,
  depth = 0,
  seen = new Set<string>(),
): unknown {
  if (depth > 6) return {};
  const type = root.lookupType(typeName);
  const cleanTypeName = type.fullName.replace(/^\./, "");
  if (seen.has(cleanTypeName)) return {};
  const nextSeen = new Set(seen);
  nextSeen.add(cleanTypeName);
  const output: Record<string, unknown> = {};
  const usedOneofs = new Set<string>();
  for (const field of type.fieldsArray) {
    if (field.partOf) {
      const oneofName = field.partOf.name;
      if (usedOneofs.has(oneofName)) continue;
      usedOneofs.add(oneofName);
      const selectedField = field.partOf.fieldsArray[0];
      if (!selectedField || selectedField.name !== field.name) continue;
    }
    let value = generateRandomField(root, field, depth, nextSeen);
    if (field.map) value = { [`key_${randomInt(10, 99)}`]: value };
    else if (field.repeated) value = [value];
    output[field.name] = value;
  }
  return output;
}

/**
 * Generates a random value for one protobuf field.
 */
export function generateRandomField(
  root: protobuf.Root,
  field: protobuf.Field,
  depth: number,
  seen: Set<string>,
): unknown {
  if (field.resolvedType instanceof protobuf.Enum) {
    const values = Object.keys(field.resolvedType.values);
    return values[randomInt(0, Math.max(0, values.length - 1))] ?? 0;
  }
  if (field.resolvedType instanceof protobuf.Type) {
    return generateRandomExampleFromType(root, field.resolvedType.fullName.replace(/^\./, ""), depth + 1, seen);
  }
  if (field.type === "string") return `${field.name}_${randomInt(1000, 9999)}`;
  if (field.type === "bool") return Math.random() >= 0.5;
  if (field.type === "bytes") return "cmFuZG9t";
  if (field.type === "double" || field.type === "float") return Number((Math.random() * 100).toFixed(3));
  if (field.type.includes("64")) return String(randomInt(1, 999999));
  if (
    field.type.includes("32") ||
    field.type.startsWith("int") ||
    field.type.startsWith("uint") ||
    field.type.startsWith("sint") ||
    field.type.startsWith("fixed") ||
    field.type.startsWith("sfixed")
  )
    return randomInt(1, 1000);
  return null;
}
