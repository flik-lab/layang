"use strict";

function windowTitleForContext(context = {}) {
  const label = typeof context.title === "string" ? context.title.trim() : "";
  if (context.kind === "performance") return label || "Performance - Layang";
  if (context.kind === "mocking") return label || "Mocking - Layang";
  if (context.kind === "response") return label ? `${label} - Response - Layang` : "Response - Layang";
  if (context.kind === "request") return label ? `${label} - Layang` : "Request - Layang";
  return "Layang";
}

module.exports = { windowTitleForContext };
