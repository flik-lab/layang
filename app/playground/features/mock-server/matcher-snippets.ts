import { isPlainRecord } from "../../shared/json-utils";
import { firstPrimitivePatch } from "./mock-scenario-examples";

export type MatcherKind = "equals" | "contains" | "matches" | "glob" | "headers" | "or" | "any";

export type MatcherOption = { kind: MatcherKind; label: string; description: string };

export const MATCHER_OPTIONS: readonly MatcherOption[] = [
  { kind: "contains", label: "contains", description: "Listed fields must match; other fields are ignored" },
  { kind: "equals", label: "equals", description: "The whole request must be exactly this" },
  { kind: "matches", label: "matches", description: "A field must match a regular expression" },
  { kind: "glob", label: "glob", description: "A field must match a wildcard such as abc*" },
  { kind: "headers", label: "headers", description: "Request metadata must contain a value" },
  { kind: "or", label: "or", description: "Any one of several matchers is enough" },
  { kind: "any", label: "any", description: "Matches every request (explicit fallback)" },
];

/** Used when the schema isn't available, so the snippet is still a valid, non-empty matcher. */
const PLACEHOLDER_PATCH = { id: "replace-me" };

const mapLeaves = (value: unknown, leaf: (item: unknown) => unknown): unknown => {
  if (Array.isArray(value)) return value.map(item => mapLeaves(item, leaf));
  if (isPlainRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapLeaves(item, leaf)]));
  return leaf(value);
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds an `input` block for a matcher kind, with values taken from a request example.
 * `contains: {}` never matches, so an empty example falls back to a placeholder field.
 */
export function buildMatcher(kind: MatcherKind, request: unknown): Record<string, unknown> {
  const patch = firstPrimitivePatch(request) ?? PLACEHOLDER_PATCH;
  const full = isPlainRecord(request) && Object.keys(request).length ? request : PLACEHOLDER_PATCH;
  switch (kind) {
    case "equals":
      return { equals: full };
    case "contains":
      return { contains: patch };
    case "matches":
      return { matches: mapLeaves(patch, item => `^${escapeRegex(String(item))}$`) };
    case "glob":
      return { glob: mapLeaves(patch, item => `${String(item)}*`) };
    case "headers":
      return { headers: { contains: { authorization: "Bearer" } } };
    case "or":
      return { or: [{ equals: full }, { contains: patch }] };
    case "any":
      return { any: true };
  }
}
