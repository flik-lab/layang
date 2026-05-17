#!/usr/bin/env node
"use strict";

const { parseCliArgs, helpText } = require("../lib/cli-args.cjs");
const { handleCli } = require("../lib/cli-runner.cjs");

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.command === "help") {
    process.stdout.write(helpText());
    return 0;
  }
  return await handleCli(parsed, { stdout: process.stdout, stderr: process.stderr });
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`${error?.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
