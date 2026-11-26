"use strict";

/**
 * Push-on-request for gRPC mocks: a unary mock scenario can push data into open mock server
 * streams of another method, built from the unary request.
 *
 * Scenario (unary output):
 *   output:
 *     code: 0
 *     data: {}
 *     push:
 *       - method: pkg.Service/StreamMethod
 *         mode: append            # "message" (default): one extra message to each open stream
 *         field: tracks           # append: array field the item is added to in every later message
 *         sequenceStart: 9001     # first {{seq}} value (default 1)
 *         data: { id: "{{seq}}", latitude: "{{request.latitude}}", env: "{{request.environmentData | enumValue}}" }
 *
 * Templates: a string that is exactly one `{{expression}}` becomes the value itself (numbers
 * stay numbers); otherwise every `{{expression}}` is replaced with its text. Expressions are
 * `request.<path>`, `seq` or `now` (epoch milliseconds), optionally followed by `| number`,
 * `| string` or `| enumValue` (a proto enum name such as ENVIRONMENT_AIR to its number).
 */

const MAX_APPENDED_ITEMS_PER_FIELD = 500;
const MAX_PUSH_TARGETS = 16;
const EXPRESSION = /\{\{\s*([^{}]+?)\s*\}\}/g;
const WHOLE_EXPRESSION = /^\{\{\s*([^{}]+?)\s*\}\}$/;

/**
 * Open mock streams per method, plus items appended to their later messages.
 * @returns {{
 *   register: (methodKey: string, call: { write: (data: unknown) => unknown }) => () => void,
 *   apply: (methodKey: string, data: unknown) => unknown,
 *   append: (methodKey: string, field: string, item: unknown) => number,
 *   write: (methodKey: string, data: unknown) => number,
 *   openCount: (methodKey: string) => number,
 *   appendedCount: (methodKey: string) => number,
 *   clear: () => void,
 * }} Registry.
 */
function createMockStreamPushRegistry() {
  const open = new Map();
  const appended = new Map();

  const register = (methodKey, call) => {
    const key = normalizeMethodKey(methodKey);
    let calls = open.get(key);
    if (!calls) {
      calls = new Set();
      open.set(key, calls);
    }
    calls.add(call);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      calls.delete(call);
      if (!calls.size && open.get(key) === calls) open.delete(key);
    };
  };

  const apply = (methodKey, data) => {
    const fields = appended.get(normalizeMethodKey(methodKey));
    if (!fields?.size || !isRecord(data)) return data;
    const next = { ...data };
    for (const [field, items] of fields) {
      if (!items.length) continue;
      next[field] = [...(Array.isArray(next[field]) ? next[field] : []), ...items];
    }
    return next;
  };

  const append = (methodKey, field, item) => {
    const key = normalizeMethodKey(methodKey);
    let fields = appended.get(key);
    if (!fields) {
      fields = new Map();
      appended.set(key, fields);
    }
    const items = fields.get(field) || [];
    items.push(item);
    // Oldest items fall off first, so a long session cannot grow a message without bound.
    if (items.length > MAX_APPENDED_ITEMS_PER_FIELD) items.splice(0, items.length - MAX_APPENDED_ITEMS_PER_FIELD);
    fields.set(field, items);
    return items.length;
  };

  const write = (methodKey, data) => {
    const calls = open.get(normalizeMethodKey(methodKey));
    if (!calls) return 0;
    let delivered = 0;
    for (const call of [...calls]) {
      try {
        call.write(data);
        delivered += 1;
      } catch {
        calls.delete(call);
      }
    }
    return delivered;
  };

  return {
    register,
    apply,
    append,
    write,
    openCount: (methodKey) => open.get(normalizeMethodKey(methodKey))?.size || 0,
    appendedCount: (methodKey) => {
      const fields = appended.get(normalizeMethodKey(methodKey));
      return fields ? [...fields.values()].reduce((sum, items) => sum + items.length, 0) : 0;
    },
    clear: () => {
      open.clear();
      appended.clear();
    },
  };
}

/**
 * Reads and validates the push targets of a unary mock output.
 * @param {unknown} output - Scenario output (response).
 * @returns {Array<{ method: string, mode: "message" | "append", field?: string, data: unknown, sequenceStart: number }>} Targets.
 */
function readMockPushTargets(output) {
  const raw = isRecord(output) ? output.push : undefined;
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length > MAX_PUSH_TARGETS) throw new Error(`A mock output can push to at most ${MAX_PUSH_TARGETS} streams.`);
  return list.map((target, index) => {
    if (!isRecord(target)) throw new Error(`push[${index}] must be an object.`);
    const method = normalizeMethodKey(target.method);
    if (!/^[\w.]+\/\w+$/.test(method)) throw new Error(`push[${index}].method must be "package.Service/Method".`);
    const mode = target.mode === undefined ? "message" : target.mode;
    if (mode !== "message" && mode !== "append") throw new Error(`push[${index}].mode must be "message" or "append".`);
    const field = typeof target.field === "string" ? target.field.trim() : "";
    if (mode === "append" && !field) throw new Error(`push[${index}].field is required for mode "append".`);
    const sequenceStart = target.sequenceStart === undefined ? 1 : Number(target.sequenceStart);
    if (!Number.isSafeInteger(sequenceStart)) throw new Error(`push[${index}].sequenceStart must be an integer.`);
    return { method, mode, ...(field ? { field } : {}), data: target.data === undefined ? {} : target.data, sequenceStart };
  });
}

/**
 * Builds a value from a template.
 * @param {unknown} template - Template value (objects and arrays are walked).
 * @param {{ request?: unknown, seq?: number, now?: number, enumValue?: (name: string) => number | undefined }} context - Values for expressions.
 * @returns {unknown} Rendered value.
 */
function renderMockTemplate(template, context) {
  if (typeof template === "string") return renderString(template, context);
  if (Array.isArray(template)) return template.map((item) => renderMockTemplate(item, context));
  if (isRecord(template)) {
    const next = {};
    for (const [key, value] of Object.entries(template)) {
      const rendered = renderMockTemplate(value, context);
      if (rendered !== undefined) next[key] = rendered;
    }
    return next;
  }
  return template;
}

/**
 * Runs the push targets of a unary mock output after it answered OK.
 * @param {{
 *   registry: ReturnType<typeof createMockStreamPushRegistry>,
 *   output: unknown,
 *   request: unknown,
 *   sourceKey: string,
 *   sequences: Map<string, number>,
 *   enumValue?: (name: string) => number | undefined,
 *   now?: () => number,
 * }} input - Registry, scenario output, unary request, sequence state.
 * @returns {Array<{ method: string, mode: string, delivered: number, appended?: number, data: unknown }>} What was pushed.
 */
function runMockPushes({ registry, output, request, sourceKey, sequences, enumValue, now = Date.now }) {
  return readMockPushTargets(output).map((target, index) => {
    const sequenceKey = `${sourceKey}#${index}`;
    const seq = sequences.has(sequenceKey) ? sequences.get(sequenceKey) : target.sequenceStart;
    sequences.set(sequenceKey, seq + 1);
    const data = renderMockTemplate(target.data, { request, seq, now: now(), enumValue });
    if (target.mode === "append") {
      const appended = registry.append(target.method, target.field, data);
      return { method: target.method, mode: target.mode, delivered: registry.openCount(target.method), appended, data };
    }
    return { method: target.method, mode: target.mode, delivered: registry.write(target.method, data), data };
  });
}

/**
 * Enum value lookup over a @grpc/proto-loader package definition (enum names are unique by
 * proto style, e.g. ENVIRONMENT_AIR).
 * @param {Record<string, any>} packageDefinition - Loaded package definition.
 * @returns {(name: string) => number | undefined} Lookup.
 */
function createEnumValueLookup(packageDefinition) {
  let values = null;
  return (name) => {
    if (!values) {
      values = new Map();
      for (const definition of Object.values(packageDefinition || {})) {
        const entries = definition?.format?.includes?.("EnumDescriptorProto") ? definition.type?.value : null;
        if (!Array.isArray(entries)) continue;
        for (const entry of entries)
          if (typeof entry?.name === "string" && !values.has(entry.name)) values.set(entry.name, Number(entry.number));
      }
    }
    return values.get(String(name));
  };
}

function renderString(template, context) {
  const whole = WHOLE_EXPRESSION.exec(template);
  if (whole) return evaluate(whole[1], context);
  if (!template.includes("{{")) return template;
  return template.replace(EXPRESSION, (_, expression) => {
    const value = evaluate(expression, context);
    return value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}

function evaluate(expression, context) {
  const [pathPart, ...filters] = expression.split("|").map((part) => part.trim());
  let value;
  if (pathPart === "seq") value = context.seq;
  else if (pathPart === "now") value = context.now;
  else if (pathPart === "request" || pathPart.startsWith("request.")) value = readPath(context.request, pathPart.slice("request".length + 1));
  else throw new Error(`Unknown template expression "${pathPart}" (use request.<path>, seq or now).`);
  for (const filter of filters) value = applyFilter(filter, value, context);
  return value;
}

function applyFilter(filter, value, context) {
  if (filter === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  if (filter === "string") return value === undefined || value === null ? "" : String(value);
  if (filter === "enumValue") {
    if (typeof value === "number") return value;
    const resolved = context.enumValue?.(value);
    if (resolved === undefined) throw new Error(`Unknown enum value "${value}".`);
    return resolved;
  }
  throw new Error(`Unknown template filter "${filter}" (use number, string or enumValue).`);
}

function readPath(root, path) {
  if (!path) return root;
  let current = root;
  for (const segment of path.split(".")) {
    if (current === undefined || current === null) return undefined;
    current = current[segment];
  }
  return current;
}

function normalizeMethodKey(value) {
  return String(value || "").trim().replace(/^\//, "");
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  MAX_APPENDED_ITEMS_PER_FIELD,
  createEnumValueLookup,
  createMockStreamPushRegistry,
  readMockPushTargets,
  renderMockTemplate,
  runMockPushes,
};
