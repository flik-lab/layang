import type { Completion, CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";
import { stringifyYaml } from "@/lib/workspace-yaml.cjs";
import { isPlainRecord } from "../../shared/json-utils";
import { buildMatcher, MATCHER_OPTIONS, type MatcherKind } from "./matcher-snippets";

const GRPC_STATUSES = [
  "OK", "CANCELLED", "UNKNOWN", "INVALID_ARGUMENT", "DEADLINE_EXCEEDED", "NOT_FOUND", "ALREADY_EXISTS",
  "PERMISSION_DENIED", "RESOURCE_EXHAUSTED", "FAILED_PRECONDITION", "ABORTED", "OUT_OF_RANGE",
  "UNIMPLEMENTED", "INTERNAL", "UNAVAILABLE", "DATA_LOSS", "UNAUTHENTICATED",
];
const DELIVERY_MODES: Array<[string, string]> = [
  ["incoming", "Send all responses when a client calls"],
  ["standby", "Wait for Send now"],
  ["periodic", "One response per interval"],
  ["hybrid", "Interval plus Send now"],
];
const FIELD_MATCHERS = new Set(["equals", "equalsUnordered", "contains", "matches", "glob"]);
const LIST_MARKER = "[]";

type Examples = { request: unknown; response: unknown };

const indentOf = (text: string) => (text.match(/^ */)?.[0].length ?? 0);

/** Indent of the key on a line, counting a list dash ("- key:") as part of the indent. */
const keyIndentOf = (text: string) => {
  const dash = text.match(/^( *)- +/);
  return dash ? dash[0].length : indentOf(text);
};

/**
 * Walks up from the cursor line and returns the YAML key path that contains it,
 * with LIST_MARKER for list items: `stream > responses > [] > data`.
 */
export function yamlPathAt(lines: string[], lineIndex: number, cursorIndent: number): string[] {
  const path: string[] = [];
  let indent = cursorIndent;
  for (let index = lineIndex - 1; index >= 0 && indent > 0; index -= 1) {
    const text = lines[index];
    if (!text.trim() || text.trim().startsWith("#")) continue;
    const keyIndent = keyIndentOf(text);
    if (keyIndent >= indent) continue;
    const key = text.match(/^ *(?:- +)?([\w.-]+):/)?.[1];
    const dash = text.match(/^( *)- +/);
    if (key) path.unshift(key);
    if (dash) {
      path.splice(key ? 1 : 0, 0, LIST_MARKER);
      // A dashed line opens a list item; the list itself belongs to the line above the dash.
      if (key) [path[0], path[1]] = [path[1], path[0]];
      indent = dash[1].length;
    } else {
      indent = keyIndent;
    }
  }
  return path;
}

const valueAt = (example: unknown, path: string[]): unknown => {
  let current = example;
  for (const key of path) {
    if (Array.isArray(current)) current = current[0];
    if (!isPlainRecord(current)) return undefined;
    current = current[key];
  }
  return Array.isArray(current) ? current[0] : current;
};

const typeLabel = (value: unknown) =>
  Array.isArray(value) ? "list" : isPlainRecord(value) ? "message" : value === null ? "null" : typeof value;

const yamlScalar = (value: unknown) => (typeof value === "string" ? JSON.stringify(value) : String(value));

/** Field names of a proto message (taken from its generated example), as insertable YAML. */
function fieldOptions(example: unknown, indent: number, section: string): Completion[] {
  if (!isPlainRecord(example)) return [];
  const childIndent = " ".repeat(indent + 2);
  return Object.entries(example).map(([key, value]) => ({
    label: key,
    type: "property",
    detail: typeLabel(value),
    info: `${section} field from the proto`,
    apply: isPlainRecord(value) || Array.isArray(value) ? `${key}:\n${childIndent}` : `${key}: ${yamlScalar(value)}`,
    boost: 2,
  }));
}

function matcherOptions(request: unknown, indent: number): Completion[] {
  return MATCHER_OPTIONS.map(option => {
    const yaml = stringifyYaml(buildMatcher(option.kind as MatcherKind, request)).trimEnd();
    const [first, ...rest] = yaml.split("\n");
    return {
      label: option.kind === "any" ? "any" : option.label,
      type: "keyword",
      detail: "matcher",
      info: option.description,
      apply: [first, ...rest.map(line => " ".repeat(indent) + line)].join("\n"),
    };
  });
}

const keyOptions = (keys: Array<[string, string]>, indent: number, blocks: Set<string> = new Set()): Completion[] =>
  keys.map(([key, info]) => ({
    label: key,
    type: "property",
    info,
    apply: blocks.has(key) ? `${key}:\n${" ".repeat(indent + 2)}` : `${key}: `,
  }));

function optionsForPath(path: string[], indent: number, examples: Examples | null): Completion[] {
  const keys = path.filter(key => key !== LIST_MARKER);
  const [root, second, third] = keys;
  if (keys.length === 0) {
    return keyOptions([
      ["input", "Answer only requests that match"],
      ["response", "Unary reply: data, code, message, delayMs"],
      ["stream", "Server-streaming replies"],
      ["name", "Display name"],
      ["enabled", "true or false"],
      ["priority", "Higher wins when several scenarios match"],
    ], indent, new Set(["input", "response", "stream"]));
  }
  if (root === "input") {
    const inOr = second === "or";
    const matcher = inOr ? third : second;
    const rest = keys.slice(inOr ? 3 : 2);
    if (!matcher) return matcherOptions(examples?.request, indent);
    if (matcher === "headers") {
      if (rest.length === 0) return matcherOptions(examples?.request, indent).filter(item => item.label !== "headers");
      return keyOptions([["authorization", "Bearer token"], ["x-request-id", "Request id"], ["x-user-id", "User id"]], indent);
    }
    if (FIELD_MATCHERS.has(matcher)) return fieldOptions(valueAt(examples?.request, rest), indent, "Request");
    return [];
  }
  const isUnaryReply = root === "response" || root === "output";
  if (isUnaryReply && second === "push") {
    if (keys.length === 2) {
      return keyOptions([
        ["method", "Target server-streaming method, package.Service/Method"],
        ["mode", "message (one extra message) or append (add to a list field)"],
        ["field", "List field that append adds to"],
        ["sequenceStart", "First {{seq}} value"],
        ["data", "Message or item to push; use {{request.field}}, {{seq}}, {{now}}"],
      ], indent, new Set(["data"]));
    }
    return [];
  }
  const replyPath = isUnaryReply ? keys.slice(1) : root === "stream" && second === "responses" ? keys.slice(2) : null;
  if (replyPath) {
    if (replyPath.length === 0) {
      return keyOptions([
        ["data", "The message to return"],
        ["code", "gRPC status, OK by default"],
        ["message", "Error message for a non-OK code"],
        ["delayMs", "Wait before replying"],
        ...(isUnaryReply ? [["push", "Also send data into another method's open streams"] as [string, string]] : []),
      ], indent, new Set(["data", "push"]));
    }
    if (replyPath[0] === "data") return fieldOptions(valueAt(examples?.response, replyPath.slice(1)), indent, "Response");
    return [];
  }
  if (root === "stream" && !second) {
    return keyOptions([["execution", "When responses are sent"], ["responses", "The messages to send"]], indent,
      new Set(["execution", "responses"]));
  }
  if (root === "stream" && second === "execution") {
    if (third === "periodic") {
      return keyOptions([["intervalMs", "Milliseconds between responses"], ["loop", "Start again after the last one"],
        ["maxExecutions", "0 means no limit"]], indent);
    }
    return keyOptions([["mode", "incoming, standby, periodic, or hybrid"], ["periodic", "Interval settings"]], indent,
      new Set(["periodic"]));
  }
  return [];
}

function valueOptions(key: string): Completion[] | null {
  if (key === "code") return GRPC_STATUSES.map(status => ({ label: status, type: "constant", detail: "gRPC status" }));
  if (key === "mode") {
    return [...DELIVERY_MODES, ["message", "push: one extra stream message"], ["append", "push: add to a list field of every later message"]]
      .map(([label, info]) => ({ label, type: "constant", info }));
  }
  if (["enabled", "loop", "any"].includes(key)) return ["true", "false"].map(label => ({ label, type: "constant" }));
  return null;
}

/** Suggestions for a YAML scenario: keys, matchers, proto field names, and allowed values. */
export function createScenarioCompletionSource(getExamples: () => Examples | null): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);

    const value = before.match(/^ *(?:- +)?([\w.-]+): *([\w-]*)$/);
    if (value && /: /.test(before)) {
      const options = valueOptions(value[1]);
      if (!options) return null;
      return { from: context.pos - value[2].length, options, validFor: /^[\w-]*$/ };
    }

    const word = before.match(/^( *(?:- +)?)([\w.-]*)$/);
    if (!word) return null;
    if (!word[2] && !context.explicit) return null;
    const indent = word[1].length;
    const lines = context.state.doc.toString().split("\n");
    const path = yamlPathAt(lines, line.number - 1, indent);
    const options = optionsForPath(path, indent, getExamples());
    if (!options.length) return null;
    return { from: context.pos - word[2].length, options, validFor: /^[\w.-]*$/ };
  };
}
