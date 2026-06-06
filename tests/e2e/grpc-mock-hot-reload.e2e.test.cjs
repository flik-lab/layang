"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

function tryRequire(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

const grpc = tryRequire("@grpc/grpc-js");
const protoLoader = tryRequire("@grpc/proto-loader");
const hasGrpcDeps = Boolean(grpc && protoLoader);

const protoText = `syntax = "proto3";
package demo;
service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply);
  rpc WatchHello (HelloRequest) returns (stream HelloReply);
}
message HelloRequest { string name = 1; }
message HelloReply { string message = 1; int32 seq = 2; }`;

function method(name, responseStream = false) {
  return {
    serviceName: "demo.Greeter",
    methodName: name,
    requestStream: false,
    responseStream,
    requestType: "demo.HelloRequest",
    responseType: "demo.HelloReply",
  };
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function writeWorkspaceScenario(workspaceDir, text, selectedScenarioId = "disk-default") {
  await fs.mkdir(path.join(workspaceDir, "mocks", "scenarios"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceDir, "mocks", "mock-server.json"),
    JSON.stringify(
      {
        selectedScenarioIds: { "demo.Greeter/SayHello": selectedScenarioId },
        enabledMethods: { "demo.Greeter/SayHello": true },
      },
      null,
      2,
    ),
  );
  await fs.writeFile(path.join(workspaceDir, "mocks", "scenarios", "demo.Greeter.SayHello.json"), text);
  await fs.writeFile(
    path.join(workspaceDir, "mocks", "scenarios", "manifest.json"),
    JSON.stringify({ "demo.Greeter/SayHello": { file: "demo.Greeter.SayHello.json", format: "json" } }, null, 2),
  );
}

function createClient(target, protoPath) {
  const definition = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(definition);
  return new loaded.demo.Greeter(target, grpc.credentials.createInsecure());
}

function callUnary(client, request) {
  const fn = client.SayHello || client.sayHello;
  return new Promise((resolve, reject) => {
    fn.call(client, request, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("gRPC mock e2e keeps latest UI scenario across stale file reloads and stale UI revisions", {
  skip: !hasGrpcDeps,
}, async () => {
  const {
    startMockServer,
    updateActiveMockServer,
    stopMockServer,
  } = require("../../electron/services/grpc-mock-server.cjs");
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "layang-grpc-e2e-"));
  const protoPath = path.join(workspaceDir, "greeter.proto");
  const port = await getFreePort();

  await fs.writeFile(protoPath, protoText);
  await writeWorkspaceScenario(
    workspaceDir,
    JSON.stringify(
      {
        version: 1,
        scenarios: [
          {
            id: "disk-default",
            service: "demo.Greeter",
            method: "SayHello",
            response: { data: { message: "default" } },
          },
        ],
      },
      null,
      2,
    ),
    "disk-default",
  );

  let client;
  try {
    await startMockServer({
      port,
      bindHost: "127.0.0.1",
      protoFiles: [{ name: "greeter.proto", text: protoText }],
      methods: [method("SayHello")],
      scenarios: [
        { id: "initial", service: "demo.Greeter", method: "SayHello", response: { data: { message: "initial" } } },
      ],
      activeScenarioIds: { "demo.Greeter/SayHello": "initial" },
      enabledMethods: { "demo.Greeter/SayHello": true },
      workspaceDirectory: workspaceDir,
    });
    client = createClient(`127.0.0.1:${port}`, protoPath);

    assert.equal((await callUnary(client, { name: "A" })).message, "initial");

    await updateActiveMockServer(
      {
        uiRuntimeRevision: 1,
        scenarios: [
          { id: "ui-1", service: "demo.Greeter", method: "SayHello", response: { data: { message: "ui-1" } } },
        ],
        activeScenarioIds: { "demo.Greeter/SayHello": "ui-1" },
        enabledMethods: { "demo.Greeter/SayHello": true },
        methods: [method("SayHello")],
        protoFiles: [{ name: "greeter.proto", text: protoText }],
      },
      "ui",
    );
    assert.equal((await callUnary(client, { name: "A" })).message, "ui-1");

    await updateActiveMockServer(
      {
        workspaceMtimeMs: Date.now() - 10_000,
        scenarios: [
          {
            id: "disk-default",
            service: "demo.Greeter",
            method: "SayHello",
            response: { data: { message: "default" } },
          },
        ],
        activeScenarioIds: { "demo.Greeter/SayHello": "disk-default" },
        enabledMethods: { "demo.Greeter/SayHello": true },
      },
      "file",
    );
    assert.equal((await callUnary(client, { name: "A" })).message, "ui-1");

    await updateActiveMockServer(
      {
        uiRuntimeRevision: 2,
        scenarios: [
          { id: "ui-2", service: "demo.Greeter", method: "SayHello", response: { data: { message: "ui-2" } } },
        ],
        activeScenarioIds: { "demo.Greeter/SayHello": "ui-2" },
        enabledMethods: { "demo.Greeter/SayHello": true },
      },
      "ui",
    );
    assert.equal((await callUnary(client, { name: "A" })).message, "ui-2");

    await updateActiveMockServer(
      {
        uiRuntimeRevision: 1,
        scenarios: [
          { id: "ui-old", service: "demo.Greeter", method: "SayHello", response: { data: { message: "old" } } },
        ],
        activeScenarioIds: { "demo.Greeter/SayHello": "ui-old" },
        enabledMethods: { "demo.Greeter/SayHello": true },
      },
      "ui",
    );
    assert.equal((await callUnary(client, { name: "A" })).message, "ui-2");
  } finally {
    if (client && typeof client.close === "function") client.close();
    await stopMockServer();
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
});

test("gRPC mock e2e ignores watcher reload while workspace write lock exists", { skip: !hasGrpcDeps }, async () => {
  const {
    startMockServer,
    updateActiveMockServer,
    stopMockServer,
  } = require("../../electron/services/grpc-mock-server.cjs");
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "layang-grpc-watch-e2e-"));
  const protoPath = path.join(workspaceDir, "greeter.proto");
  const port = await getFreePort();

  await fs.writeFile(protoPath, protoText);
  await writeWorkspaceScenario(
    workspaceDir,
    JSON.stringify(
      {
        version: 1,
        scenarios: [
          {
            id: "disk-default",
            service: "demo.Greeter",
            method: "SayHello",
            response: { data: { message: "default" } },
          },
        ],
      },
      null,
      2,
    ),
    "disk-default",
  );

  let client;
  try {
    await startMockServer({
      port,
      bindHost: "127.0.0.1",
      protoFiles: [{ name: "greeter.proto", text: protoText }],
      methods: [method("SayHello")],
      scenarios: [{ id: "ui", service: "demo.Greeter", method: "SayHello", response: { data: { message: "ui" } } }],
      activeScenarioIds: { "demo.Greeter/SayHello": "ui" },
      enabledMethods: { "demo.Greeter/SayHello": true },
      workspaceDirectory: workspaceDir,
    });
    client = createClient(`127.0.0.1:${port}`, protoPath);
    await updateActiveMockServer(
      {
        uiRuntimeRevision: 1,
        scenarios: [{ id: "ui", service: "demo.Greeter", method: "SayHello", response: { data: { message: "ui" } } }],
        activeScenarioIds: { "demo.Greeter/SayHello": "ui" },
        enabledMethods: { "demo.Greeter/SayHello": true },
      },
      "ui",
    );
    assert.equal((await callUnary(client, { name: "A" })).message, "ui");

    await fs.writeFile(
      path.join(workspaceDir, "mocks", ".layang-mock-write-lock.json"),
      JSON.stringify({ status: "writing" }),
    );
    await writeWorkspaceScenario(
      workspaceDir,
      JSON.stringify(
        {
          version: 1,
          scenarios: [
            {
              id: "disk-default",
              service: "demo.Greeter",
              method: "SayHello",
              response: { data: { message: "default" } },
            },
          ],
        },
        null,
        2,
      ),
      "disk-default",
    );
    await wait(1000);
    assert.equal((await callUnary(client, { name: "A" })).message, "ui");

    await fs.rm(path.join(workspaceDir, "mocks", ".layang-mock-write-lock.json"), { force: true });
    await wait(1200);
    assert.equal((await callUnary(client, { name: "A" })).message, "ui");
  } finally {
    if (client && typeof client.close === "function") client.close();
    await stopMockServer();
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
});
