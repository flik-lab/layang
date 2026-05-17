export type PrettyJsonOptions = {
  parseString?: boolean;
  maxChars?: number;
  truncatedLabel?: string;
};

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

/** Searches deeply through JSON-like values, including generated object paths. */
export function deepTextIncludes(value: unknown, query: string, path = ""): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (path.toLowerCase().includes(normalizedQuery)) return true;
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return String(value).toLowerCase().includes(normalizedQuery);
  if (Array.isArray(value))
    return value.some((item, index) => deepTextIncludes(item, normalizedQuery, `${path}[${index}]`));
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) =>
    deepTextIncludes(entry, normalizedQuery, path ? `${path}.${key}` : key),
  );
}

/** Filters a JSON-like value to only branches matching a text query. */
export function filterJsonValue(value: unknown, query: string, path = ""): unknown | undefined {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return value;
  const pathMatches = path.toLowerCase().includes(normalizedQuery);
  if (value === null || value === undefined || typeof value !== "object")
    return pathMatches || String(value).toLowerCase().includes(normalizedQuery) ? value : undefined;
  if (Array.isArray(value)) {
    const entries = value
      .map((item, index) => filterJsonValue(item, normalizedQuery, `${path}[${index}]`))
      .filter((item) => item !== undefined);
    return pathMatches || entries.length ? entries : undefined;
  }
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const filtered = filterJsonValue(entry, normalizedQuery, path ? `${path}.${key}` : key);
    if (filtered !== undefined) next[key] = filtered;
  }
  return pathMatches || Object.keys(next).length ? next : undefined;
}
