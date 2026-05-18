"use strict";

function safePathSegment(input) {
  return (
    String(input || "item")
      .replace(/[^a-z0-9_.-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "item"
  );
}

function safeRelativePath(input) {
  const normalized = String(input || "schema.proto")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");

  return normalized || "schema.proto";
}

module.exports = { safePathSegment, safeRelativePath };
