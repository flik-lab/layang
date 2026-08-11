const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("mock scenario editor changes context without remounting the textarea", () => {
  const panel = read("app/playground/features/mock-server/mock-server-panels.tsx");
  assert.doesNotMatch(panel, /<Box key=\{editorInstanceKey\}>/);
  assert.match(panel, /resetKey=\{editorInstanceKey\}/);
});

test("code editor handles context reset internally", () => {
  const editor = read("app/playground/features/request-editor/request-editor-panels.tsx");
  assert.match(editor, /resetKey\?: string/);
  assert.match(editor, /setActiveLine\(0\);\s*\}, \[resetKey\]\);/);
});

test("dialog focus lifecycle is not recreated when an inline onClose callback changes", () => {
  const compat = read("components/shadcn/compat.tsx");
  assert.match(compat, /const onCloseRef = useRef\(onClose\)/);
  assert.match(compat, /onCloseRef\.current = onClose;\s*\}, \[onClose\]\);/);
  assert.match(compat, /previouslyFocused\?\.focus\(\);\s*\};\s*\}, \[open\]\);/);
  assert.doesNotMatch(compat, /previouslyFocused\?\.focus\(\);\s*\};\s*\}, \[onClose, open\]\);/);
});

test("fullscreen editor fills the dialog and restores the same textarea view state", () => {
  const editor = read("app/playground/features/request-editor/request-editor-panels.tsx");
  assert.match(editor, /inlineTextareaRef/);
  assert.match(editor, /editorViewStateRef/);
  assert.match(editor, /textarea\.setSelectionRange\(viewState\.selectionStart, viewState\.selectionEnd\)/);
  assert.match(editor, /flex: "1 1 auto",\s*width: "100%",\s*minWidth: 0/);
  assert.match(editor, /<DialogContent[\s\S]*?width: "100%"[\s\S]*?minWidth: 0[\s\S]*?overflow: "hidden"/);
});
