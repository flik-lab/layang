const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const sidebar = fs.readFileSync(path.join(root, "app/playground/features/shell/workbench-sidebar.tsx"), "utf8");
const workspaceIo = fs.readFileSync(
  path.join(root, "app/playground/features/workspace/use-workspace-io-actions.ts"),
  "utf8",
);

test("Proto files can be dropped onto Requests to import and immediately create a gRPC request", () => {
  assert.match(sidebar, /dropProtoFiles\(event, "requests"\)/);
  assert.match(sidebar, /handleProtoFiles\(files, destination\?\.collectionId \?\? ""\)/);
  assert.match(sidebar, /Drop Proto to create a gRPC request/);
  assert.match(workspaceIo, /targetCollectionId \|\| pendingCollectionImportRef\.current/);
});

test("Proto files can be dropped onto Schemas without creating a request", () => {
  assert.match(sidebar, /dropProtoFiles\(event, "schemas"\)/);
  assert.match(sidebar, /await reviewGlobalProtoFiles\(files\)/);
  assert.match(sidebar, /Drop Proto to import a schema/);
});
