"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("mock runtime polling does not read window during server render", () => {
  const source = fs.readFileSync("app/playground/features/mock-server/runtime/useMockRuntimePolling.ts", "utf8");
  assert.match(source, /function getInitialRuntimeMode/);
  assert.match(source, /typeof window === "undefined"/);
  assert.match(source, /useRef<"main" \| "utility">\(getInitialRuntimeMode\(\)\)/);
  assert.doesNotMatch(source, /useRef<"main" \| "utility">\(window\.electronRuntime/);
});
