"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { writeGitWorkspace } = require("../lib/git-workspace.cjs");

describe("PR03 incremental workspace persistence", () => {
  it("does not rewrite unchanged manifest or local files on a second save", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "layang-pr03-"));
    try {
      const bundle = { project: { collections: [], protoLibraries: [], environments: [], mockServer: { methodFiles: {} } }, layout: {}, settings: {} };
      await writeGitWorkspace(root, bundle);
      const files = ["layang.yml", ".layang/layout.yml", ".layang/settings.yml"];
      const before = await Promise.all(files.map(async (file) => (await fs.stat(path.join(root, file))).mtimeMs));
      await new Promise((resolve) => setTimeout(resolve, 40));
      await writeGitWorkspace(root, bundle);
      const after = await Promise.all(files.map(async (file) => (await fs.stat(path.join(root, file))).mtimeMs));
      assert.deepEqual(after, before);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
