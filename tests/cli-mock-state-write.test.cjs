"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { writeState } = require("../lib/cli-mock.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "layang-mock-state-"));
}

function lockedRename(failures, code) {
  let calls = 0;
  const rename = async (from, to) => {
    calls += 1;
    if (calls <= failures) throw Object.assign(new Error(`${code}: operation not permitted, rename`), { code });
    return fsp.rename(from, to);
  };
  rename.calls = () => calls;
  return rename;
}

test("mock state write retries a rename that Windows refuses while the file is open", async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "runtime", "mock-runtime.json");
  const rename = lockedRename(3, "EPERM");

  await writeState(file, { running: true, pid: 1 }, { rename, delayMs: 1 });

  assert.equal(rename.calls(), 4);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { running: true, pid: 1 });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ["mock-runtime.json"]);
});

test("mock state write gives up after the last attempt and leaves no temp file", async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "mock-runtime.json");
  const rename = lockedRename(Number.POSITIVE_INFINITY, "EBUSY");

  await assert.rejects(writeState(file, { running: true }, { rename, attempts: 3, delayMs: 1 }), { code: "EBUSY" });

  assert.equal(rename.calls(), 3);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("mock state write does not retry errors that are not a transient lock", async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "mock-runtime.json");
  const rename = lockedRename(1, "ENOSPC");

  await assert.rejects(writeState(file, {}, { rename, delayMs: 1 }), { code: "ENOSPC" });
  assert.equal(rename.calls(), 1);
});

test("mock daemon keeps serving when its first state write fails", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "lib", "cli-mock.cjs"), "utf8");
  assert.doesNotMatch(source, /^\s*await snapshot\("running"\);\s*$/m);
  assert.match(source, /await snapshot\("running"\)\.catch\(/);
});
