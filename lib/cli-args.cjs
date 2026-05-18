"use strict";

const commands = new Set(["run", "list", "validate", "mock:check", "help", "version"]);

function parseCliArgs(argv) {
  const input = Array.isArray(argv) ? [...argv] : [];
  const result = {
    command: "help",
    workspace: "",
    flags: {},
    positionals: [],
  };

  if (input.length === 0) return result;
  if (input[0] === "--help" || input[0] === "-h") return result;
  if (input[0] === "--version" || input[0] === "-v") return { ...result, command: "version" };

  const command = input.shift();
  if (!commands.has(command)) {
    throw new Error(`Unknown command "${command}". Run layang --help.`);
  }
  result.command = command;

  if (command === "help" || command === "version") return result;

  while (input.length) {
    const token = input.shift();
    if (!token) continue;
    if (token.startsWith("--")) {
      const [rawName, inlineValue] = token
        .slice(2)
        .split(/=(.*)/s)
        .filter((part) => part !== undefined);
      const name = camelFlagName(rawName);
      if (isBooleanFlag(name)) {
        result.flags[name] = inlineValue === undefined ? true : inlineValue !== "false";
        continue;
      }
      const value = inlineValue !== undefined ? inlineValue : input.shift();
      if (value === undefined || String(value).startsWith("--")) {
        throw new Error(`Missing value for --${rawName}.`);
      }
      result.flags[name] = value;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const mapped = shortFlagMap[token];
      if (!mapped) throw new Error(`Unknown flag ${token}.`);
      if (isBooleanFlag(mapped)) {
        result.flags[mapped] = true;
        continue;
      }
      const value = input.shift();
      if (value === undefined) throw new Error(`Missing value for ${token}.`);
      result.flags[mapped] = value;
      continue;
    }
    result.positionals.push(token);
  }

  result.workspace = result.positionals[0] || ".";
  return result;
}

const shortFlagMap = {
  "-e": "env",
  "-m": "method",
  "-r": "reporter",
  "-o": "output",
  "-t": "target",
};

function isBooleanFlag(name) {
  return ["bail", "json", "help", "version", "strictMock"].includes(name);
}

function camelFlagName(name) {
  return String(name || "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function normalizeRunOptions(parsed) {
  const flags = parsed.flags || {};
  const reporter = String(flags.reporter || "spec").toLowerCase();
  if (!["spec", "json", "junit"].includes(reporter)) {
    throw new Error("Reporter must be one of: spec, json, junit.");
  }
  const transport = String(flags.transport || "native-grpc");
  if (!["native-grpc", "grpc-web", "websocket"].includes(transport)) {
    throw new Error("Transport must be native-grpc, grpc-web, or websocket.");
  }
  return {
    workspace: parsed.workspace || ".",
    env: flags.env ? String(flags.env) : "",
    method: flags.method ? String(flags.method) : "",
    target: flags.target ? String(flags.target) : "",
    transport,
    reporter,
    output: flags.output ? String(flags.output) : "",
    timeoutMs: normalizePositiveInteger(flags.timeout, 30_000),
    wsWaitMs: normalizePositiveInteger(flags.wsWait, 1_000),
    maxMessages: normalizePositiveInteger(flags.maxMessages, 500),
    bail: Boolean(flags.bail),
    strictMock: Boolean(flags.strictMock),
  };
}

function normalizePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function helpText() {
  return `Layang CLI\n\nUsage:\n  layang run <workspace> [options]\n  layang list <workspace> [--json]\n  layang validate <workspace> [--json]\n  layang mock:check <workspace> [--json]\n\nCommands:\n  run         Run saved request tabs from a Layang workspace.\n  list        List saved request tabs and methods.\n  validate    Validate workspace files, proto availability, requests, and mock files.\n  mock:check  Validate mock scenario input matchers and selected scenarios.\n\nRun options:\n  -e, --env <key>             Environment key to use, for example dev/testing/prod.\n  -m, --method <service/rpc>  Run one method only.\n  -t, --target <host:port>    Override native gRPC target.\n      --transport <mode>      native-grpc or grpc-web. CLI execution currently supports native-grpc.\n  -r, --reporter <name>       spec, json, or junit.\n  -o, --output <file>         Write json/junit report to a file.\n      --timeout <ms>          Per-request deadline. Default: 30000.\n      --max-messages <n>      Max server-stream messages captured. Default: 500.\n      --bail                  Stop after the first failed request.\n\nExamples:\n  layang run ./workspace --env dev\n  layang run ./workspace --method demo.v1.Greeter/SayHello --reporter json --output reports/layang.json\n  layang validate ./workspace --json\n`;
}

module.exports = {
  parseCliArgs,
  normalizeRunOptions,
  normalizePositiveInteger,
  helpText,
};
