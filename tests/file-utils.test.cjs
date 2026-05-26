"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { getRuntimeTempPath, writeProtoWorkspace } = require("../electron/utils/file-utils.cjs");

test("writeProtoWorkspace works in plain Node without Electron app.getPath", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "layang-proto-workspace-test-"));
  let workspaceDir = "";
  try {
    workspaceDir = await writeProtoWorkspace(
      [
        {
          name: "demo/greeter.proto",
          text: 'syntax = "proto3"; package demo; message Hello { string name = 1; }',
        },
      ],
      { tempRoot },
    );

    assert.equal(path.dirname(workspaceDir), tempRoot);
    assert.match(getRuntimeTempPath(), /./);
    assert.equal(
      await fs.readFile(path.join(workspaceDir, "demo", "greeter.proto"), "utf8"),
      'syntax = "proto3"; package demo; message Hello { string name = 1; }',
    );
    assert.match(
      await fs.readFile(path.join(workspaceDir, "google", "protobuf", "empty.proto"), "utf8"),
      /message Empty/,
    );
  } finally {
    if (workspaceDir) await fs.rm(workspaceDir, { recursive: true, force: true });
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
