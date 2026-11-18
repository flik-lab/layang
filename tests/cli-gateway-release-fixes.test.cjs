"use strict";

// Regressions found by running a Layang CLI gateway workspace for a gRPC-Web frontend.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { spawnSync } = require("node:child_process");

const { createGatewayMockStreamScheduler } = require("../lib/gateway-mock-stream-scheduler.cjs");
const { parseYaml, stringifyYaml } = require("../lib/workspace-yaml.cjs");

/** Runs a scheduler with zero delays and collects the ids it writes. */
function runScheduler(options, waitMs = 30) {
  const call = new EventEmitter();
  const written = [];
  let completed = 0;
  call.write = (data) => {
    written.push(data.id);
    return true;
  };
  const task = createGatewayMockStreamScheduler({
    call,
    responses: [{ data: { id: 1 } }, { data: { id: 2 } }],
    intervalMs: 0,
    mapItem: (item) => ({ data: item.data }),
    onComplete() {
      completed += 1;
    },
    onError(error) {
      throw error;
    },
    ...options,
  });
  // Finite streams: wait for completion (timers are coarse on Windows). Endless streams: wait waitMs.
  const deadline = Date.now() + (options.loop && !options.maxLoops ? waitMs : 2000);
  return new Promise((resolve) => {
    const poll = () => {
      if (completed > 0 || Date.now() >= deadline) resolve({ written, completed, task, call });
      else setTimeout(poll, 5);
    };
    poll();
  });
}

test("Gateway mock stream plays once without loop", async () => {
  const { written, completed } = await runScheduler({});
  assert.deepEqual(written, [1, 2]);
  assert.equal(completed, 1);
});

test("Gateway mock stream honours maxLoops like the native mock server", async () => {
  const { written, completed } = await runScheduler({ loop: true, maxLoops: 2 });
  assert.deepEqual(written, [1, 2, 1, 2, 1, 2]);
  assert.equal(completed, 1);
});

test("Gateway mock stream loops until cancelled when maxLoops is 0", async () => {
  const { written, completed, task, call } = await runScheduler({ loop: true, maxLoops: 0, intervalMs: 1 }, 300);
  try {
    assert.ok(written.length > 4, `expected more than two passes, got ${written.length}`);
    assert.equal(completed, 0);
    assert.ok(task.getState().restarts >= 2);
  } finally {
    // Always cancel: an endless stream would otherwise keep the test process alive.
    call.emit("cancelled");
  }
  assert.equal(task.getState().closed, true);
});

test("YAML keeps plain scalars with colons (URLs, times) as scalars", () => {
  const parsed = parseYaml(
    [
      "cors:",
      "  allowedOrigins:",
      "    - http://localhost:23200",
      '    - "http://127.0.0.1:23200"',
      "url: http://host:8080/path",
      "time: 10:30",
      "a:b: c",
      "",
    ].join("\n"),
  );
  assert.deepEqual(parsed, {
    cors: { allowedOrigins: ["http://localhost:23200", "http://127.0.0.1:23200"] },
    url: "http://host:8080/path",
    time: "10:30",
    "a:b": "c",
  });
  const doc = { gateway: { web: { cors: { allowedOrigins: ["http://localhost:23200", "*"] } } } };
  assert.deepEqual(parseYaml(stringifyYaml(doc)), doc);
});

test("gateway:list accepts a profile without upstreams", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "layang-gateway-list-"));
  try {
    fs.writeFileSync(
      path.join(workspace, "layang.yml"),
      "version: 6\nkind: workspace\nworkspace:\n  id: gw\n  name: gw\nformat:\n  mocks: native-yaml-v2\n  localState: .layang/\n",
    );
    fs.mkdirSync(path.join(workspace, "gateways"));
    fs.writeFileSync(
      path.join(workspace, "gateways", "web.gateway.yml"),
      "version: 2\nkind: gateway\ngateway:\n  id: web\n  name: web\n  mode: mock\n  web:\n    port: 18080\n",
    );
    const result = spawnSync(process.execPath, [path.join(__dirname, "..", "bin", "layang.cjs"), "gateway:list", workspace], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /web \[mock\] native 127\.0\.0\.1:50055 · web http:\/\/127\.0\.0\.1:18080 -> mock only/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
