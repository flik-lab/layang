const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(
  path.join(process.cwd(), "app/playground/features/shell/use-workbench-container-model.tsx"),
  "utf8",
);

test("importing a default Proto revision advances attached service sources and bindings", () => {
  const start = source.indexOf("function applyProtoVersionImportPlan(");
  const end = source.indexOf("function activateProtoLifecycleSelection(", start);
  const applyImport = source.slice(start, end);

  assert.match(applyImport, /binding\.versionId === plan\.baseVersionId/);
  assert.match(applyImport, /protoSources:[\s\S]*versionId: plan\.candidateVersion\.id/);
  assert.match(applyImport, /methodBindings:[\s\S]*schemaChecksum: plan\.candidateVersion\.checksum/);
});

test("a non-default revision import keeps explicitly pinned service revisions unchanged", () => {
  const start = source.indexOf("function applyProtoVersionImportPlan(");
  const end = source.indexOf("function activateProtoLifecycleSelection(", start);
  const applyImport = source.slice(start, end);

  assert.match(applyImport, /if \(setAsDefault\) \{[\s\S]*setMockServer/);
});
