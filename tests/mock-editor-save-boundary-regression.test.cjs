const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(
  path.join(process.cwd(), "app/playground/features/mock-server/use-grpc-mock-editor-actions.ts"),
  "utf8",
);

test("scenario editor validates draft text without applying it to the saved project", () => {
  assert.match(
    source,
    /const parsed = parseSingleMockScenarioText\(value, currentMockFile\.format, mockServer\.port, selectedMethod\);/,
  );
  assert.match(source, /setMockScenarioEditorError\(parsed\.ok \? "" : parsed\.error\);/);
});

test("stream controls do not discard or apply over an unsaved scenario draft", () => {
  assert.match(source, /const hasUnsavedScenarioDraft =/);
  assert.match(source, /Save the scenario before changing stream settings\./);
  assert.doesNotMatch(source, /hasUnsavedScenarioDraft[\s\S]{0,300}clearMockScenarioEditorDraftState\(\)/);
  assert.match(source, /Save the scenario before changing global stream defaults\./);
});

test("method source editor retains last valid loop controls while draft syntax is invalid", () => {
  const services = fs.readFileSync(
    path.join(process.cwd(), "app/playground/features/services/services-workspace.tsx"),
    "utf8",
  );
  assert.match(services, /lastValidScenario/);
  assert.match(services, /const selectedDraftScenario = parsedScenario \?\? lastValidScenario/);
  assert.match(services, /const timer = window\.setTimeout\(\(\) => \{/);
  assert.match(services, /\}, 180\)/);
  assert.match(services, /function changeSource\(nextSource: string\) \{\s*setSource\(nextSource\);\s*\}/);
});

test("method source stream switches only edit local source until Save", () => {
  const services = fs.readFileSync(
    path.join(process.cwd(), "app/playground/features/services/services-workspace.tsx"),
    "utf8",
  );
  assert.match(services, /function patchSelectedStream[\s\S]*setSource\(formatSingleMockScenarioForEditor/);
  assert.match(services, /function save\(\)[\s\S]*onSaveScenario\(parsed\.scenario, editorFormat\)/);
});
