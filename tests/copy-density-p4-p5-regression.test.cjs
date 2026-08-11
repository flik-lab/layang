"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("P4 confirmation dialogs keep consequences concise and avoid repeated irreversible copy", () => {
  const collections = read("app/playground/features/collection/collection-sidebar.tsx");
  const versions = read("app/playground/features/proto-library/proto-version-dialogs.tsx");
  const registry = read("app/playground/features/proto-registry/proto-registry-panel.tsx");
  const git = read("app/playground/features/git/git-source-control-v2.tsx");
  const guidelines = read("docs/ui-copy-guidelines.md");

  assert.match(collections, /Linked tabs will close\./);
  assert.doesNotMatch(collections, /Linked open tabs will also be closed/);
  assert.match(versions, /<DialogTitle>Delete revision\?<\/DialogTitle>/);
  assert.doesNotMatch(versions, /Delete revision permanently|Delete schema permanently|This action cannot be undone/);
  assert.doesNotMatch(registry, /This action cannot be undone/);
  assert.match(git, /<DialogTitle>Commit to protected branch\?<\/DialogTitle>/);
  assert.match(git, /<DialogTitle>Replace commit message\?<\/DialogTitle>/);
  assert.match(git, /<DialogTitle>Remove “\{removeTarget\}”\?<\/DialogTitle>/);
  assert.doesNotMatch(
    git,
    /You are committing directly to .*Continue\?|Replace the current commit message and details with the generated suggestion|Remove Git remote/,
  );
  assert.match(guidelines, /## Dialogs and confirmations/);
});

test("P5 technical pages move internal detail out of the main layout", () => {
  const docs = read("app/playground/features/documentation/documentation-panels.tsx");
  const settings = read("app/playground/features/settings/settings-workspace.tsx");
  const proto = read("app/playground/features/proto-registry/proto-schema-workspace.tsx");
  const git = read("app/playground/features/git/git-source-control-v2.tsx");
  const guidelines = read("docs/ui-copy-guidelines.md");

  assert.match(docs, /<summary>Internal details<\/summary>/);
  assert.match(docs, /uiCopy\.actions\.insertBlock/);
  assert.match(docs, /uiCopy\.actions\.saveDraft/);
  assert.doesNotMatch(docs, /Guide Markdown|Insert a live block at the cursor|Save docs draft|Internal source hash/);

  assert.equal((settings.match(/>\s*Add environments\s*<\/Button>/g) ?? []).length, 1);
  assert.match(settings, /uiCopy\.actions\.resetWidth/);
  assert.doesNotMatch(settings, /Density changes global page padding|Side-by-side and stacked modes only arrange/);

  assert.doesNotMatch(proto, /label=\{`\$\{methods\.length\}/);
  assert.match(proto, /Import a `\.proto` file or folder from the sidebar\./);
  assert.match(git, /Credentials are handled by native Git and are not stored in the workspace\./);
  assert.doesNotMatch(git, /credential helper, and custom CA settings|Clone a normal Git repository/);
  assert.match(guidelines, /## Dense technical pages/);
});
