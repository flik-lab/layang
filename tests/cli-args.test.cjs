"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCliArgs, normalizeRunOptions, normalizePositiveInteger, helpText } = require("../lib/cli-args.cjs");

test("parses file-based run command flags", () => {
  const parsed = parseCliArgs([
    "run",
    "./workspace",
    "--env",
    "dev",
    "--method",
    "demo.Greeter/SayHello",
    "--reporter",
    "json",
    "--output",
    "reports/result.json",
    "--bail",
  ]);
  assert.equal(parsed.command, "run");
  assert.equal(parsed.workspace, "./workspace");
  const options = normalizeRunOptions(parsed);
  assert.equal(options.env, "dev");
  assert.equal(options.method, "demo.Greeter/SayHello");
  assert.equal(options.reporter, "json");
  assert.equal(options.output, "reports/result.json");
  assert.equal(options.bail, true);
});

test("normalizes invalid positive integers to fallback", () => {
  assert.equal(normalizePositiveInteger("0", 123), 123);
  assert.equal(normalizePositiveInteger("abc", 123), 123);
  assert.equal(normalizePositiveInteger("42", 123), 42);
});

test("rejects invalid reporter", () => {
  const parsed = parseCliArgs(["run", ".", "--reporter", "tap"]);
  assert.throws(() => normalizeRunOptions(parsed), /Reporter must be/);
});

test("help text documents run and validate commands", () => {
  const text = helpText();
  assert.match(text, /layang run/);
  assert.match(text, /validate/);
});

test("normalizes websocket transport options", () => {
  const parsed = parseCliArgs(["run", "./workspace", "--transport", "websocket", "--ws-wait", "250"]);
  const options = normalizeRunOptions(parsed);
  assert.equal(options.transport, "websocket");
  assert.equal(options.wsWaitMs, 250);
});
