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
    .replace(/^[A-Za-z]:/, (match) => match.slice(0, 1))
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part, index, parts) => {
      const fallback = index === parts.length - 1 ? "schema.proto" : "item";
      return (
        String(part)
          .replace(/[^a-z0-9_.-]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 96) || fallback
      );
    })
    .join("/");

  return normalized || "schema.proto";
}

module.exports = { safePathSegment, safeRelativePath };
