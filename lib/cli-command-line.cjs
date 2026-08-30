"use strict";

function splitCliCommandLine(input) {
  const source = String(input || "").trim();
  if (!source) return [];

  const tokens = [];
  let current = "";
  let quote = "";
  let escaping = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      const next = source[index + 1] || "";
      if (next === "\\" || next === '"' || /\s/.test(next)) {
        escaping = true;
        continue;
      }
      current += char;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += "\\";
  if (quote) throw new Error(`Unterminated ${quote === '"' ? "double" : "single"} quote.`);
  if (current) tokens.push(current);
  return tokens;
}

function normalizeIntegratedCliCommand(input) {
  const tokens = splitCliCommandLine(input);
  if (!tokens.length) return [];
  const first = String(tokens[0] || "").toLowerCase();
  if (first === "layang" || first === "layang.exe" || first === "layang.cmd") tokens.shift();
  return tokens;
}

module.exports = { splitCliCommandLine, normalizeIntegratedCliCommand };
