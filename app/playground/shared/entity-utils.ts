import type { SavedExample } from "./workbench-types";

export function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function savedExampleKey(example: SavedExample): string {
  return `${example.serviceName}/${example.methodName}`;
}

export function savedExampleAssertionJson(example: SavedExample): string {
  const explicit = example.assertions?.trim();
  if (explicit) return explicit;
  const legacy = example.expectedJson?.trim();
  if (!legacy) return "";
  try {
    const parsed = JSON.parse(legacy) as Record<string, unknown>;
    return ["grpcStatus", "minMessages", "maxLatencyMs"].some((key) => key in parsed) ? legacy : "";
  } catch {
    return "";
  }
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "env"
  );
}
