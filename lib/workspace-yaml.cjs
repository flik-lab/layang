"use strict";

/**
 * Small deterministic YAML subset used by Layang workspace files.
 * It intentionally supports only JSON-compatible values plus multiline strings.
 * The writer only emits syntax that the parser understands.
 */
function stringifyYaml(value) {
  return `${emitValue(value, 0, false)}\n`;
}

function emitValue(value, indent, arrayItem) {
  if (Array.isArray(value)) return emitArray(value, indent);
  if (isPlainObject(value)) return emitObject(value, indent);
  return `${" ".repeat(indent)}${emitScalar(value, indent, arrayItem)}`;
}

function emitObject(value, indent) {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  if (!entries.length) return `${" ".repeat(indent)}{}`;
  const lines = [];
  for (const [key, item] of entries) {
    const prefix = `${" ".repeat(indent)}${emitKey(key)}:`;
    if (typeof item === "string" && item.includes("\n")) {
      lines.push(`${prefix} |-`);
      const body = item.endsWith("\n") ? item.slice(0, -1) : item;
      for (const line of body.split("\n")) lines.push(`${" ".repeat(indent + 2)}${line}`);
      continue;
    }
    if (Array.isArray(item)) {
      if (!item.length) lines.push(`${prefix} []`);
      else {
        lines.push(prefix);
        lines.push(emitArray(item, indent + 2));
      }
      continue;
    }
    if (isPlainObject(item)) {
      if (!Object.keys(item).length) lines.push(`${prefix} {}`);
      else {
        lines.push(prefix);
        lines.push(emitObject(item, indent + 2));
      }
      continue;
    }
    lines.push(`${prefix} ${emitScalar(item, indent + 2, false)}`);
  }
  return lines.join("\n");
}

function emitArray(value, indent) {
  if (!value.length) return `${" ".repeat(indent)}[]`;
  const lines = [];
  for (const item of value) {
    const prefix = `${" ".repeat(indent)}-`;
    if (typeof item === "string" && item.includes("\n")) {
      lines.push(`${prefix} |-`);
      const body = item.endsWith("\n") ? item.slice(0, -1) : item;
      for (const line of body.split("\n")) lines.push(`${" ".repeat(indent + 2)}${line}`);
    } else if (Array.isArray(item)) {
      if (!item.length) lines.push(`${prefix} []`);
      else {
        lines.push(prefix);
        lines.push(emitArray(item, indent + 2));
      }
    } else if (isPlainObject(item)) {
      const entries = Object.entries(item).filter(([, child]) => child !== undefined);
      if (!entries.length) lines.push(`${prefix} {}`);
      else {
        const [firstKey, firstValue] = entries[0];
        if (isInlineScalar(firstValue)) {
          lines.push(`${prefix} ${emitKey(firstKey)}: ${emitScalar(firstValue, indent + 2, true)}`);
          const rest = Object.fromEntries(entries.slice(1));
          if (Object.keys(rest).length) lines.push(emitObject(rest, indent + 2));
        } else {
          lines.push(prefix);
          lines.push(emitObject(item, indent + 2));
        }
      }
    } else {
      lines.push(`${prefix} ${emitScalar(item, indent + 2, true)}`);
    }
  }
  return lines.join("\n");
}

function isInlineScalar(value) {
  return (
    value === null ||
    (["string", "number", "boolean"].includes(typeof value) && !(typeof value === "string" && value.includes("\n")))
  );
}

function emitKey(value) {
  const text = String(value);
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(text) ? text : JSON.stringify(text);
}

function emitScalar(value) {
  if (value === undefined || value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return JSON.stringify(value);
  if (!value.length) return '""';
  // Keep plain scalars deliberately conservative so generated files remain valid
  // for standard YAML parsers. Template values such as {{token}}, values that
  // begin with YAML indicator characters, URLs, and other ambiguous strings are
  // emitted as JSON-compatible quoted scalars.
  if (
    /^[A-Za-z0-9_][A-Za-z0-9_./@+\- ]*$/.test(value) &&
    !/^(true|false|null|~|[-+]?\d+(\.\d+)?)$/i.test(value) &&
    value.trim() === value
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function parseYaml(text) {
  const source = String(text || "");
  const trimmed = source.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const parsed = parseBlock(lines, 0, firstContentIndent(lines, 0));
  return parsed.value;
}

function parseBlock(lines, start, indent) {
  const index = skipEmptyAndComments(lines, start);
  if (index >= lines.length) return { value: {}, index };
  const current = lineInfo(lines[index]);
  if (current.indent < indent) return { value: {}, index };
  return current.content.startsWith("-") ? parseArray(lines, index, indent) : parseObject(lines, index, indent);
}

function parseObject(lines, start, indent) {
  const output = {};
  let index = start;
  while (index < lines.length) {
    index = skipEmptyAndComments(lines, index);
    if (index >= lines.length) break;
    const info = lineInfo(lines[index]);
    if (info.indent < indent) break;
    if (info.indent > indent || info.content.startsWith("-")) break;
    const match = info.content.match(/^("(?:[^"\\]|\\.)*"|[^":][^:]*):(?:\s*(.*))?$/);
    if (!match) {
      index += 1;
      continue;
    }
    const key = parseKey(match[1].trim());
    const rest = (match[2] || "").trim();
    if (rest === "|-" || rest === "|") {
      const block = readBlockScalar(lines, index + 1, indent + 2, rest === "|");
      output[key] = block.value;
      index = block.index;
      continue;
    }
    if (rest) {
      output[key] = parseScalar(rest);
      index += 1;
      continue;
    }
    const next = skipEmptyAndComments(lines, index + 1);
    if (next >= lines.length || lineInfo(lines[next]).indent <= indent) {
      output[key] = {};
      index = next;
      continue;
    }
    const nested = parseBlock(lines, next, lineInfo(lines[next]).indent);
    output[key] = nested.value;
    index = nested.index;
  }
  return { value: output, index };
}

function parseArray(lines, start, indent) {
  const output = [];
  let index = start;
  while (index < lines.length) {
    index = skipEmptyAndComments(lines, index);
    if (index >= lines.length) break;
    const info = lineInfo(lines[index]);
    if (info.indent < indent || info.indent !== indent || !info.content.startsWith("-")) break;
    const rest = info.content.slice(1).trim();
    if (rest === "|-" || rest === "|") {
      const block = readBlockScalar(lines, index + 1, indent + 2, rest === "|");
      output.push(block.value);
      index = block.index;
      continue;
    }
    if (!rest) {
      const next = skipEmptyAndComments(lines, index + 1);
      if (next >= lines.length || lineInfo(lines[next]).indent <= indent) {
        output.push(null);
        index = next;
      } else {
        const nested = parseBlock(lines, next, lineInfo(lines[next]).indent);
        output.push(nested.value);
        index = nested.index;
      }
      continue;
    }
    const inlineObject = rest.match(/^("(?:[^"\\]|\\.)*"|[^":][^:]*):(?:\s*(.*))?$/);
    if (inlineObject) {
      const key = parseKey(inlineObject[1].trim());
      const valueText = (inlineObject[2] || "").trim();
      const item = {};
      if (valueText === "|-" || valueText === "|") {
        const block = readBlockScalar(lines, index + 1, indent + 2, valueText === "|");
        item[key] = block.value;
        index = block.index;
      } else {
        item[key] = valueText ? parseScalar(valueText) : {};
        index += 1;
      }
      const next = skipEmptyAndComments(lines, index);
      if (
        next < lines.length &&
        lineInfo(lines[next]).indent === indent + 2 &&
        !lineInfo(lines[next]).content.startsWith("-")
      ) {
        const tail = parseObject(lines, next, indent + 2);
        Object.assign(item, tail.value);
        index = tail.index;
      }
      output.push(item);
      continue;
    }
    output.push(parseScalar(rest));
    index += 1;
  }
  return { value: output, index };
}

function readBlockScalar(lines, start, indent, keepFinalNewline) {
  const output = [];
  let index = start;
  while (index < lines.length) {
    const raw = lines[index];
    if (!raw.trim()) {
      output.push("");
      index += 1;
      continue;
    }
    const info = lineInfo(raw);
    if (info.indent < indent) break;
    output.push(raw.slice(Math.min(indent, raw.length)));
    index += 1;
  }
  while (output.length && output[output.length - 1] === "") output.pop();
  const joined = output.join("\n");
  return { value: keepFinalNewline ? `${joined}\n` : joined, index };
}

function parseScalar(value) {
  if (value === "{}") return {};
  if (value === "[]") return [];
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    if (value.startsWith('"')) return JSON.parse(value);
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function parseKey(value) {
  return value.startsWith('"') ? JSON.parse(value) : value;
}

function lineInfo(raw) {
  const match = String(raw).match(/^(\s*)(.*)$/);
  return { indent: match[1].replace(/\t/g, "  ").length, content: match[2].trimEnd() };
}

function firstContentIndent(lines, start) {
  const index = skipEmptyAndComments(lines, start);
  return index < lines.length ? lineInfo(lines[index]).indent : 0;
}

function skipEmptyAndComments(lines, start) {
  let index = start;
  while (index < lines.length) {
    const trimmed = String(lines[index]).trim();
    if (trimmed && !trimmed.startsWith("#")) break;
    index += 1;
  }
  return index;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

module.exports = { stringifyYaml, parseYaml };
