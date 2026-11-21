"use strict";

/**
 * Entry point for the Layang CLI when the desktop app runs it in an Electron utility
 * process (integrated terminal and its background mock/gateway daemons).
 *
 * It does what bin/layang.cjs does, then exits explicitly: unlike plain Node, a utility
 * process does not exit when its event loop drains, so `process.exitCode` alone would
 * leave it running.
 */

const { parseCliArgs, helpText } = require("./cli-args.cjs");

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.command === "help") {
    process.stdout.write(helpText());
    return 0;
  }
  const { handleCli } = require("./cli-runner.cjs");
  return await handleCli(parsed, { stdout: process.stdout, stderr: process.stderr });
}

function flush(stream) {
  return new Promise((resolve) => {
    try {
      stream.write("", () => resolve());
    } catch {
      resolve();
    }
  });
}

async function exitWith(code) {
  await Promise.all([flush(process.stdout), flush(process.stderr)]);
  process.exit(code);
}

main()
  .then((code) => exitWith(Number.isInteger(code) ? code : 0))
  .catch((error) => {
    process.stderr.write(`${error?.message ? error.message : String(error)}\n`);
    return exitWith(1);
  });
