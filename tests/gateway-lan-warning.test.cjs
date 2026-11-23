"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { loadTypeScriptModule } = require("./helpers/load-typescript-module.cjs");

const { isNetworkReachableListenHost } = loadTypeScriptModule("app/playground/shared/network-utils.ts");

test("loopback listen addresses are local, everything else is reachable from the network", () => {
  for (const host of ["127.0.0.1", "127.0.0.2", "localhost", "::1", "[::1]", "", undefined]) {
    assert.equal(isNetworkReachableListenHost(host), false, String(host));
  }
  for (const host of ["0.0.0.0", "::", "192.168.1.20", "10.0.0.5", "devbox.lan"]) {
    assert.equal(isNetworkReachableListenHost(host), true, host);
  }
});

test("the gateway editor and the CLI warn when the gateway listens beyond loopback", () => {
  const panel = fs.readFileSync(
    path.join(__dirname, "..", "app", "playground", "features", "mock-server", "mock-server-panels.tsx"),
    "utf8",
  );
  assert.match(panel, /isNetworkReachableListenHost\(activeGatewayProfile\?\.listenHost \?\? mockServer\.bindHost\)/);
  assert.match(panel, /data-testid="gateway-lan-warning"/);
  const cli = fs.readFileSync(path.join(__dirname, "..", "lib", "cli-runner.cjs"), "utf8");
  assert.match(cli, /Warning: listening on \$\{host\} lets other devices on your network reach this gateway/);
});
