export type PrettyJsonOptions = {
  parseString?: boolean;
  maxChars?: number;
  truncatedLabel?: string;
};

export type PayloadOriginalType = "array" | "object" | "string" | "number" | "boolean" | "null" | "undefined";

export type LayangPayloadPreview = {
  __layangPreview: true;
  kind: "json" | "text";
  originalType: PayloadOriginalType;
  originalChars: number;
  previewChars: number;
  preview: string;
};

type LegacyPayloadPreview = {
  truncated: true;
  originalType: PayloadOriginalType;
  originalChars: number;
  preview: string;
};

const payloadPreviewMarker = "__layangPreview";

/** Safely parses JSON text and returns the original text when it is not valid JSON. */
export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Safely stringifies values that may contain unserializable data. */
export function safeJsonStringify(value: unknown, space?: number): string {
  try {
    return JSON.stringify(value, null, space);
  } catch {
    return String(value);
  }
}

/** Formats JSON-like values for code blocks with optional string parsing and truncation. */
export function safePrettyJson(value: unknown, options: PrettyJsonOptions = {}): string {
  const normalized = options.parseString && typeof value === "string" ? safeJsonParse(value) : value;
  const text = safeJsonStringify(normalized, 2);
  if (!options.maxChars || text.length <= options.maxChars) return text;
  const suffix = options.truncatedLabel ?? `... truncated ${text.length - options.maxChars} chars`;
  return `${text.slice(0, options.maxChars)}\n${suffix}`;
}

/** Creates a deep clone for JSON-like values without keeping object references. */
export function cloneJsonValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

/** Returns true when a value is a non-array record. */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Builds an internal Layang preview wrapper for large payloads. */
export function createLayangPayloadPreview(value: unknown, maxPreviewChars: number): LayangPayloadPreview {
  const serialized = safeJsonStringify(value);
  return {
    __layangPreview: true,
    kind: inferPayloadPreviewKind(value),
    originalType: inferPayloadOriginalType(value),
    originalChars: serialized.length,
    previewChars: Math.min(maxPreviewChars, serialized.length),
    preview: serialized.slice(0, maxPreviewChars),
  };
}

/** Returns true for new internal Layang preview payloads. */
export function isLayangPayloadPreview(value: unknown): value is LayangPayloadPreview {
  if (!isPlainRecord(value)) return false;
  return (
    value[payloadPreviewMarker] === true &&
    (value.kind === "json" || value.kind === "text") &&
    typeof value.originalType === "string" &&
    typeof value.originalChars === "number" &&
    typeof value.previewChars === "number" &&
    typeof value.preview === "string"
  );
}

/** Returns true for older payload wrappers saved before the internal marker existed. */
export function isLegacyPayloadPreview(value: unknown): value is LegacyPayloadPreview {
  if (!isPlainRecord(value)) return false;
  return (
    value.truncated === true &&
    typeof value.originalType === "string" &&
    typeof value.originalChars === "number" &&
    typeof value.preview === "string"
  );
}

/** Returns true when a value is either the current or legacy Layang preview wrapper. */
export function isPayloadPreview(value: unknown): value is LayangPayloadPreview | LegacyPayloadPreview {
  return isLayangPayloadPreview(value) || isLegacyPayloadPreview(value);
}

/** Normalizes current and legacy payload preview wrappers to the current shape. */
export function normalizePayloadPreview(value: LayangPayloadPreview | LegacyPayloadPreview): LayangPayloadPreview {
  if (isLayangPayloadPreview(value)) return value;
  return {
    __layangPreview: true,
    kind: value.originalType === "string" ? "text" : "json",
    originalType: value.originalType,
    originalChars: value.originalChars,
    previewChars: value.preview.length,
    preview: value.preview,
  };
}

/** Unwraps accidentally nested preview wrappers and returns the most useful preview body. */
export function unwrapPayloadPreview(value: LayangPayloadPreview | LegacyPayloadPreview): LayangPayloadPreview {
  let current = normalizePayloadPreview(value);

  for (let depth = 0; depth < 3; depth += 1) {
    const parsed = safeJsonParse(current.preview);
    if (!isPayloadPreview(parsed)) break;
    current = normalizePayloadPreview(parsed);
  }

  return current;
}

/** Returns the JSON/text body that should be shown instead of Layang's internal preview wrapper. */
export function payloadPreviewBodyText(value: LayangPayloadPreview | LegacyPayloadPreview, pretty = true): string {
  const preview = unwrapPayloadPreview(value);
  if (!pretty) return preview.preview;
  const parsed = safeJsonParse(preview.preview);
  return typeof parsed === "string" ? parsed : safeJsonStringify(parsed, 2);
}

function inferPayloadOriginalType(value: unknown): PayloadOriginalType {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const valueType = typeof value;
  if (valueType === "object" || valueType === "string" || valueType === "number" || valueType === "boolean") {
    return valueType;
  }
  return "string";
}

function inferPayloadPreviewKind(value: unknown): "json" | "text" {
  return typeof value === "string" ? "text" : "json";
}

/** Searches deeply through JSON-like values, including generated object paths. */
export function deepTextIncludes(value: unknown, query: string, path = ""): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (path.toLowerCase().includes(normalizedQuery)) return true;
  if (isPayloadPreview(value)) return payloadPreviewBodyText(value, false).toLowerCase().includes(normalizedQuery);
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return String(value).toLowerCase().includes(normalizedQuery);
  if (Array.isArray(value))
    return value.some((item, index) => deepTextIncludes(item, normalizedQuery, `${path}[${index}]`));
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) =>
    deepTextIncludes(entry, normalizedQuery, path ? `${path}.${key}` : key),
  );
}
