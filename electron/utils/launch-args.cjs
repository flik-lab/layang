"use strict";
const path = require("node:path");

function findWorkspaceArgument(argumentsList, options = {}) {
  const args = Array.isArray(argumentsList) ? argumentsList : [];
  const resolve = options.resolve || path.resolve;
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (typeof item !== "string") continue;
    if (item === "--workspace") {
      const next = args[index + 1];
      return typeof next === "string" && next.trim() ? resolve(next) : "";
    }
    if (item.startsWith("--workspace=")) {
      const value = item.slice("--workspace=".length).trim();
      return value ? resolve(value) : "";
    }
  }
  return "";
}

module.exports = { findWorkspaceArgument };
