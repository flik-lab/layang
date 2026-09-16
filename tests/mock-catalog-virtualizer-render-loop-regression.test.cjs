"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Mocking fixed-row windowing avoids TanStack synchronous render loops", () => {
  const sidebar = read("app/playground/features/mock-server/sidebar/MockingSidebar.tsx");
  const workspace = read("app/playground/features/mock-server/workspace/MockCatalogList.tsx");

  assert.match(sidebar, /useFixedVirtualWindow\(/);
  assert.match(workspace, /useFixedVirtualWindow\(/);
  assert.doesNotMatch(sidebar, /@tanstack\/react-virtual|useVirtualizer|flushSync|getItemKey\s*:/);
  assert.doesNotMatch(workspace, /@tanstack\/react-virtual|useVirtualizer|flushSync|getItemKey\s*:/);
});
