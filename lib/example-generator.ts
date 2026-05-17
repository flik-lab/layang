import * as protobuf from "protobufjs";

const scalarExamples: Record<string, unknown> = {
  string: "string",
  bool: true,
  bytes: "base64-string",
  double: 0,
  float: 0,
  int32: 0,
  sint32: 0,
  sfixed32: 0,
  uint32: 0,
  fixed32: 0,
  int64: "0",
  sint64: "0",
  sfixed64: "0",
  uint64: "0",
  fixed64: "0",
};

/**
 * Generates a deterministic JSON request example from a protobuf message type.
 */
export function generateExampleFromType(
  root: protobuf.Root,
  typeName: string,
  depth = 0,
  seen = new Set<string>(),
): unknown {
  if (depth > 6) return {};

  const type = root.lookupType(typeName);
  const cleanTypeName = type.fullName.replace(/^\./, "");

  if (seen.has(cleanTypeName)) {
    return {};
  }

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

    let value = generateFieldExample(root, field, depth, nextSeen);

    if (field.map) {
      value = {
        exampleKey: value,
      };
    } else if (field.repeated) {
      value = [value];
    }

    output[field.name] = value;
  }

  return output;
}

/**
 * Generates a sample value for one protobuf field.
 */
function generateFieldExample(root: protobuf.Root, field: protobuf.Field, depth: number, seen: Set<string>): unknown {
  if (field.resolvedType instanceof protobuf.Enum) {
    const firstEnumValue = Object.keys(field.resolvedType.values)[0];
    return firstEnumValue ?? 0;
  }

  if (field.resolvedType instanceof protobuf.Type) {
    return generateExampleFromType(root, field.resolvedType.fullName.replace(/^\./, ""), depth + 1, seen);
  }

  return scalarExamples[field.type] ?? null;
}

/**
 * Lists protobuf message fields with metadata used by schema tables.
 */
export function listMessageFields(root: protobuf.Root, typeName: string) {
  const type = root.lookupType(typeName);

  return type.fieldsArray.map((field) => ({
    name: field.name,
    type: field.resolvedType?.fullName.replace(/^\./, "") ?? field.type,
    id: field.id,
    repeated: Boolean(field.repeated),
    map: Boolean(field.map),
    required: Boolean(field.required),
    oneof: field.partOf?.name ?? null,
  }));
}
