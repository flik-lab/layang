"use strict";

const commands = new Set([
  "run",
  "list",
  "schemas",
  "validate",
  "parity",
  "workspace:migrate",
  "workspace:format",
  "examples:list",
  "example:run",
  "example:create",
  "example:duplicate",
  "example:edit",
  "example:delete",
  "benchmark",
  "mock:check",
  "mock:start",
  "mock:serve",
  "mock:status",
  "mock:stop",
  "mock:reload",
  "mock:logs",
  "mock:send",
  "schema:import",
  "schema:update",
  "schema:diff",
  "schema:delete",
  "schema:repair",
  "docs:init",
  "docs:set",
  "docs:build",
  "docs:check",
  "gateway:list",
  "gateway:start",
  "gateway:serve",
  "gateway:status",
  "gateway:stop",
  "git:init",
  "git:clone",
  "git:status",
  "git:diff",
  "git:stage",
  "git:unstage",
  "git:discard",
  "git:commit",
  "git:log",
  "git:branches",
  "git:branch-create",
  "git:branch-switch",
  "git:fetch",
  "git:remote-add",
  "git:remote-remove",
  "git:pull",
  "git:push",
  "git:check",
  "git:secrets",
  "git:merge-continue",
  "git:merge-abort",
  "git:change-sets",
  "git:change-set-create",
  "git:change-set-delete",
  "git:review",
  "git:review-summary",
  "git:diff-enhanced",
  "git:hunk-stage",
  "git:hunk-unstage",
  "git:hunk-discard",
  "git:field-stage",
  "git:field-unstage",
  "git:change-sets-clear",
  "git:incoming",
  "git:outgoing",
  "git:commit-show",
  "git:graph",
  "git:entity-history",
  "git:branch-health",
  "git:conflict-predict",
  "git:conflict-details",
  "git:conflict-resolve",
  "git:worktrees",
  "git:worktree-add",
  "git:worktree-remove",
  "git:worktree-prune",
  "git:commit-suggest",
  "help",
  "version",
]);

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
      appendFlagValue(result.flags, name, value);
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
      appendFlagValue(result.flags, mapped, value);
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
  "-c": "collection",
  "-q": "request",
  "-p": "profile",
};

function isBooleanFlag(name) {
  return [
    "bail",
    "json",
    "help",
    "version",
    "strictMock",
    "strictVariables",
    "check",
    "daemon",
    "all",
    "force",
    "dryRun",
    "saveResult",
    "includeHidden",
    "watch",
    "yes",
    "pretty",
    "staged",
    "rebase",
    "setUpstream",
    "switch",
    "documentation",
  ].includes(name);
}

function appendFlagValue(flags, name, value) {
  if (["var", "header", "message", "set", "path", "hunk", "field"].includes(name)) {
    const current = flags[name];
    flags[name] = current === undefined ? [value] : Array.isArray(current) ? [...current, value] : [current, value];
    return;
  }
  flags[name] = value;
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
    collection: flags.collection ? String(flags.collection) : "",
    request: flags.request ? String(flags.request) : "",
    target: flags.target ? String(flags.target) : "",
    transport,
    transportExplicit: flags.transport !== undefined,
    reporter,
    output: flags.output ? String(flags.output) : "",
    timeoutMs: normalizePositiveInteger(flags.timeout, 30_000),
    wsWaitMs: normalizePositiveInteger(flags.wsWait, 1_000),
    maxMessages: normalizePositiveInteger(flags.maxMessages, 500),
    bail: Boolean(flags.bail),
    strictMock: Boolean(flags.strictMock),
    strictVariables: Boolean(flags.strictVariables),
    variables: require("./cli-runtime-core.cjs").parseKeyValueFlags(flags.var),
    headers: require("./cli-runtime-core.cjs").parseKeyValueFlags(flags.header),
    messages: Array.isArray(flags.message)
      ? flags.message.map(String)
      : flags.message === undefined
        ? []
        : [String(flags.message)],
    messageDelayMs: normalizePositiveInteger(flags.messageDelay, 0),
    saveResult: Boolean(flags.saveResult),
    resultDirectory: flags.resultDirectory ? String(flags.resultDirectory) : "",
  };
}

function normalizePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function helpText() {
  return `Layang CLI

Usage:
  layang run <workspace> [options]
  layang list <workspace> [--json]
  layang examples:list <workspace> [--request <name>] [--json]
  layang example:run <workspace> --example <name-or-id> [--reporter json]
  layang example:create <workspace> --request <name-or-id> [--name <title>] [--set summary=...]
  layang example:duplicate <workspace> --example <name-or-id> [--name <title>]
  layang example:edit <workspace> --example <name-or-id> --set request=... [--set metadata=...]
  layang example:delete <workspace> --example <name-or-id> --yes
  layang benchmark <workspace> [--request <name>] [--iterations 20]
  layang schemas <workspace> [--json]
  layang schema:import <workspace> --file <proto|folder> [--name <schema>] [--revision <label>]
  layang schema:diff <workspace> --schema <name-or-id> --file <proto|folder>
  layang schema:update <workspace> --schema <name-or-id> --file <proto|folder> [--revision <label>]
  layang schema:delete <workspace> --schema <name-or-id> [--yes]
  layang schema:repair <workspace> [--request <name-or-id>] [--schema <name-or-id>]
  layang validate <workspace> [--json]
  layang workspace:migrate <workspace> [--check] [--json]
  layang workspace:format <workspace> [--check] [--json]
  layang parity <workspace> [--json]
  layang mock:check <workspace> [--json]
  layang mock:start <workspace> [--protocol all|grpc|rest|websocket] [--daemon]
  layang mock:status <workspace> [--protocol all|grpc|rest|websocket] [--json]
  layang mock:reload <workspace> [--protocol all|grpc|rest|websocket]
  layang mock:logs <workspace> [--protocol all|grpc|rest|websocket] [--tail 100]
  layang mock:send <workspace> --protocol websocket [--scenario <id>] [--message <text>]
  layang mock:stop <workspace> [--protocol all|grpc|rest|websocket]
  layang docs:init <workspace> [--request <name>] [--force]
  layang docs:set <workspace> --request <name> --set summary=... [--set tags=a,b]
  layang docs:build <workspace> [--collection <name>] [--request <name>] [--check]
  layang docs:check <workspace> [--collection <name>] [--request <name>]
  layang gateway:list <workspace> [--json]
  layang gateway:start <workspace> --profile <name-or-id> [--daemon]
  layang gateway:status <workspace> --profile <name-or-id> [--json]
  layang gateway:stop <workspace> --profile <name-or-id>
  layang git:init <workspace> [--branch main]
  layang git:status <workspace> [--json]
  layang git:diff <workspace> [--path <file>] [--staged]
  layang git:stage <workspace> [--path <file>]
  layang git:unstage <workspace> [--path <file>]
  layang git:discard <workspace> --path <file> --yes
  layang git:commit <workspace> --message "feat(grpc): add request"
  layang git:branches <workspace>
  layang git:branch-create <workspace> --branch feature/name
  layang git:branch-switch <workspace> --branch main
  layang git:remote-add <workspace> --url <repository> [--remote origin]
  layang git:remote-remove <workspace> [--remote origin]
  layang git:fetch|git:pull|git:push <workspace>
  layang git:check <workspace> [--json]
  layang git:secrets <workspace> [--all]
  layang git:clone --url <repository> --directory <target>
  layang git:change-sets <workspace> [--json]
  layang git:change-set-create <workspace> --name "Feature: Watch Track" [--path <file>]
  layang git:review <workspace> --path <file> --status reviewed
  layang git:diff-enhanced <workspace> --path <file> [--staged] [--json]
  layang git:hunk-stage <workspace> --path <file> --hunk <id>
  layang git:field-stage <workspace> --path <file> --field request.target
  layang git:incoming|git:outgoing <workspace> [--json]
  layang git:branch-health <workspace> [--base main]
  layang git:conflict-predict <workspace> [--target origin/main]
  layang git:worktrees <workspace>
  layang git:worktree-add <workspace> --directory <folder> [--branch feature/name]
  layang git:commit-suggest <workspace>

Core run options:
  -e, --env <key>             Environment key.
      --var <key=value>       Override a workspace/environment variable. Repeatable.
      --header <key=value>    Add or replace request metadata/header. Repeatable.
      --message <json|text>   Add a client-stream/bidi/WebSocket message. Repeatable.
      --strict-variables      Fail when a {{variable}} is unresolved.
  -m, --method <service/rpc>  Filter one gRPC method.
  -c, --collection <name|id>  Filter one collection.
  -q, --request <name|id>     Filter one saved request.
      --example <name|id>     Select one saved example.
  -t, --target <url|host:port> Override request target.
      --transport <mode>      native-grpc, grpc-web, or websocket.
  -r, --reporter <name>       spec, json, or junit.
  -o, --output <file>         Write json/junit/benchmark output.
      --timeout <ms>          Per-request deadline. Default: 30000.
      --ws-wait <ms>          WebSocket capture time after open. Default: 1000.
      --max-messages <n>      Maximum captured stream messages. Default: 500.
      --message-delay <ms>    Delay between client-stream/bidi/WebSocket messages.
      --strict-mock           Require a matching enabled mock scenario.
      --save-result           Persist normalized CLI results under .layang/cli-results.
      --bail                  Stop after first failed request or assertion.

Benchmark options:
      --iterations <n>        Number of measured runs. Default: 20.
      --warmup <n>            Warm-up runs excluded from stats. Default: 1.
      --period <ms>           Delay between runs. Default: 0.
      --threshold-p95 <ms>    Fail when p95 exceeds the threshold.
      --threshold-error-rate <ratio> Fail when error rate exceeds 0..1.

Examples:
  layang parity ./workspace
  layang run ./workspace --request GetTrack --var token=abc --strict-variables
  layang run ./workspace --transport grpc-web --method demo.v1.Greeter/SayHello
  layang example:run ./workspace --example "Track not found" --reporter junit
  layang example:duplicate ./workspace --example "Track found" --name "Track hostile"
  layang benchmark ./workspace --request GetTrack --iterations 50 --threshold-p95 250
  layang mock:start ./workspace --protocol all --daemon
  layang schema:diff ./workspace --schema Track --file ./protos-next
  layang docs:build ./workspace --check
  layang git:check ./workspace
  layang git:commit ./workspace --message "feat(grpc): add Watch Track"
`;
}
module.exports = {
  parseCliArgs,
  normalizeRunOptions,
  normalizePositiveInteger,
  helpText,
};
