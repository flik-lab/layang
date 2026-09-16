import type * as protobuf from "protobufjs";

export type GrpcWebWorkerScalarType =
  | "double"
  | "float"
  | "int32"
  | "uint32"
  | "sint32"
  | "fixed32"
  | "sfixed32"
  | "int64"
  | "uint64"
  | "sint64"
  | "fixed64"
  | "sfixed64"
  | "bool"
  | "string"
  | "bytes";

export type GrpcWebWorkerField = {
  id: number;
  name: string;
  kind: "scalar" | "message" | "enum";
  scalarType?: GrpcWebWorkerScalarType;
  typeName?: string;
  repeated: boolean;
  map: boolean;
  keyType?: GrpcWebWorkerScalarType;
  packed: boolean;
  defaultValue?: string | number | boolean | null;
};

export type GrpcWebWorkerMessage = {
  name: string;
  fields: GrpcWebWorkerField[];
};

export type GrpcWebWorkerEnum = {
  name: string;
  valuesById: Record<string, string>;
  defaultName: string | null;
};

export type GrpcWebWorkerSchema = {
  rootType: string;
  messages: Record<string, GrpcWebWorkerMessage>;
  enums: Record<string, GrpcWebWorkerEnum>;
  unsupportedReasons: string[];
};

const scalarTypes = new Set<GrpcWebWorkerScalarType>([
  "double",
  "float",
  "int32",
  "uint32",
  "sint32",
  "fixed32",
  "sfixed32",
  "int64",
  "uint64",
  "sint64",
  "fixed64",
  "sfixed64",
  "bool",
  "string",
  "bytes",
]);

/** Builds the minimal serializable schema needed by the gRPC-Web decode worker. */
export function buildGrpcWebWorkerSchema(responseType: protobuf.Type): GrpcWebWorkerSchema {
  responseType.resolveAll();
  const messages: Record<string, GrpcWebWorkerMessage> = {};
  const enums: Record<string, GrpcWebWorkerEnum> = {};
  const unsupportedReasons: string[] = [];
  const visiting = new Set<string>();

  const visitEnum = (enumType: protobuf.Enum): string => {
    const name = normalizedTypeName(enumType.fullName || enumType.name);
    if (enums[name]) return name;
    const valuesById: Record<string, string> = {};
    for (const [enumName, enumId] of Object.entries(enumType.values)) {
      valuesById[String(enumId)] = enumName;
    }
    const firstId = Object.keys(valuesById)
      .map(Number)
      .sort((left, right) => left - right)[0];
    enums[name] = {
      name,
      valuesById,
      defaultName: Number.isFinite(firstId) ? valuesById[String(firstId)] ?? null : null,
    };
    return name;
  };

  const visitMessage = (messageType: protobuf.Type): string => {
    messageType.resolveAll();
    const name = normalizedTypeName(messageType.fullName || messageType.name);
    if (messages[name] || visiting.has(name)) return name;
    visiting.add(name);

    const fields: GrpcWebWorkerField[] = [];
    for (const field of messageType.fieldsArray) {
      field.resolve();
      if (field.type === "group") {
        unsupportedReasons.push(`${name}.${field.name}: protobuf group fields are not supported by the worker decoder.`);
        continue;
      }

      const mapKeyType =
        field.map && "keyType" in field && typeof field.keyType === "string" ? field.keyType : undefined;
      const fieldBase = {
        id: field.id,
        name: field.name,
        repeated: Boolean(field.repeated),
        map: Boolean(field.map),
        packed: Boolean(field.packed),
      };

      if (field.resolvedType && "fieldsArray" in field.resolvedType) {
        const typeName = visitMessage(field.resolvedType as protobuf.Type);
        fields.push({
          ...fieldBase,
          kind: "message",
          typeName,
          keyType: field.map ? normalizeScalarType(mapKeyType, unsupportedReasons, `${name}.${field.name} key`) : undefined,
        });
        continue;
      }

      if (field.resolvedType && "values" in field.resolvedType) {
        const typeName = visitEnum(field.resolvedType as protobuf.Enum);
        fields.push({
          ...fieldBase,
          kind: "enum",
          typeName,
          keyType: field.map ? normalizeScalarType(mapKeyType, unsupportedReasons, `${name}.${field.name} key`) : undefined,
          defaultValue: normalizeDefaultValue(field.defaultValue),
        });
        continue;
      }

      const scalarType = normalizeScalarType(field.type, unsupportedReasons, `${name}.${field.name}`);
      if (!scalarType) continue;
      fields.push({
        ...fieldBase,
        kind: "scalar",
        scalarType,
        keyType: field.map ? normalizeScalarType(mapKeyType, unsupportedReasons, `${name}.${field.name} key`) : undefined,
        defaultValue: normalizeDefaultValue(field.defaultValue),
      });
    }

    fields.sort((left, right) => left.id - right.id);
    messages[name] = { name, fields };
    visiting.delete(name);
    return name;
  };

  const rootType = visitMessage(responseType);
  return {
    rootType,
    messages,
    enums,
    unsupportedReasons: [...new Set(unsupportedReasons)],
  };
}

/** Returns true only when every reachable field can be decoded by the worker runtime. */
export function canDecodeInGrpcWebWorker(schema: GrpcWebWorkerSchema): boolean {
  return schema.unsupportedReasons.length === 0 && Boolean(schema.messages[schema.rootType]);
}

function normalizedTypeName(name: string): string {
  return name.replace(/^\./, "");
}

function normalizeScalarType(
  value: string | undefined,
  unsupportedReasons: string[],
  location: string,
): GrpcWebWorkerScalarType | undefined {
  if (value && scalarTypes.has(value as GrpcWebWorkerScalarType)) return value as GrpcWebWorkerScalarType;
  unsupportedReasons.push(`${location}: unsupported protobuf scalar type ${value ?? "<unknown>"}.`);
  return undefined;
}

function normalizeDefaultValue(value: unknown): string | number | boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return bytesToBase64(value);
  if (typeof value === "object" && value && "toString" in value && typeof value.toString === "function") {
    return value.toString();
  }
  return String(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === "function") return btoa(binary);
  return binary;
}
