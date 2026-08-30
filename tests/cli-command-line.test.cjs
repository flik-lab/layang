"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { splitCliCommandLine, normalizeIntegratedCliCommand } = require("../lib/cli-command-line.cjs");

test("integrated CLI strips an optional layang executable prefix", () => {
  assert.deepEqual(normalizeIntegratedCliCommand('layang run --request "Get User"'), ["run", "--request", "Get User"]);
  assert.deepEqual(normalizeIntegratedCliCommand("schemas --json"), ["schemas", "--json"]);
});

test("integrated CLI tokenizer preserves quoted arguments and escaped spaces", () => {
  assert.deepEqual(splitCliCommandLine('git:commit --message "feat: hello world"'), [
    "git:commit",
    "--message",
    "feat: hello world",
  ]);
  assert.deepEqual(splitCliCommandLine("schema:import --file proto\\ files/api.proto"), [
    "schema:import",
    "--file",
    "proto files/api.proto",
  ]);
  assert.deepEqual(splitCliCommandLine('schema:import --file "C:\\Users\\me\\api.proto"'), [
    "schema:import",
    "--file",
    "C:\\Users\\me\\api.proto",
  ]);
});

test("integrated CLI tokenizer rejects unterminated quotes", () => {
  assert.throws(() => splitCliCommandLine('run --request "broken'), /Unterminated double quote/);
});
