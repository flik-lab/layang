"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  readWorkspace,
  discoverRunItems,
  resolveTarget,
  validateMockScenarios,
  validateWorkspace,
} = require("../lib/cli-workspace.cjs");

async function withWorkspace(callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "layang-cli-test-"));
  try {
    await fs.mkdir(path.join(dir, "protos"), { recursive: true });
    await fs.mkdir(path.join(dir, "requests"), { recursive: true });
    await fs.mkdir(path.join(dir, "environments"), { recursive: true });
    await fs.mkdir(path.join(dir, "mocks", "scenarios"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "protos", "greeter.proto"),
      'syntax = "proto3"; package demo; service Greeter { rpc SayHello (HelloRequest) returns (HelloReply); } message HelloRequest { string name = 1; } message HelloReply { string message = 1; }',
    );
    await fs.writeFile(
      path.join(dir, "project.json"),
      JSON.stringify(
        {
          selectedMethodKey: "demo.Greeter/SayHello",
          requestJson: '{"name":"Alice"}',
          nativeTarget: "localhost:50051",
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(dir, "requests", "tabs.json"),
      JSON.stringify(
        [
          {
            id: "tab-1",
            title: "Hello",
            methodKey: "demo.Greeter/SayHello",
            requestJson: '{"name":"Alice"}',
            metadata: [],
            transportMode: "native-grpc",
            nativeTarget: "localhost:50051",
          },
        ],
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(dir, "environments", "environments.json"),
      JSON.stringify(
        [
          {
            key: "local",
            label: "Local",
            nativeTarget: "localhost:50052",
            grpcWebBaseUrl: "http://localhost:9080/grpc/web",
          },
        ],
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(dir, "mocks", "mock-server.json"),
      JSON.stringify(
        {
          selectedScenarioIds: { "demo.Greeter/SayHello": "hello" },
          enabledMethods: { "demo.Greeter/SayHello": true },
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(dir, "mocks", "scenarios", "demo.Greeter.SayHello.json"),
      JSON.stringify(
        {
          version: 1,
          scenarios: [
            {
              id: "hello",
              service: "demo.Greeter",
              method: "SayHello",
              input: { equals: { name: "Alice" } },
              response: { data: { message: "Hello" } },
            },
          ],
        },
        null,
        2,
      ),
    );
    await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("reads split workspace files and discovers run items", async () => {
  await withWorkspace(async (dir) => {
    const workspace = await readWorkspace(dir);
    assert.equal(workspace.project.protoFiles.length, 1);
    assert.equal(workspace.scenarios.length, 1);
    const items = discoverRunItems(workspace, { env: "local", transport: "native-grpc" });
    assert.equal(items.length, 1);
    assert.equal(items[0].target, "localhost:50052");
  });
});

test("resolves explicit target before environment target", async () => {
  await withWorkspace(async (dir) => {
    const workspace = await readWorkspace(dir);
    assert.equal(
      resolveTarget(workspace.project, { target: "localhost:7777", env: "local", transport: "native-grpc" }),
      "localhost:7777",
    );
  });
});

test("validates mock selected scenario and input matcher", async () => {
  await withWorkspace(async (dir) => {
    const workspace = await readWorkspace(dir);
    const mock = validateMockScenarios(workspace);
    assert.equal(mock.ok, true);
    const validation = validateWorkspace(workspace);
    assert.equal(validation.ok, true);
  });
});

test("prefers Git-friendly request item files over aggregate tabs.json", async () => {
  await withWorkspace(async (dir) => {
    await fs.mkdir(path.join(dir, "requests", "items"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "requests", "items", "demo.Greeter.SayHello.item.json"),
      JSON.stringify(
        {
          type: "layang-request",
          version: 1,
          id: "item-1",
          title: "Hello from item file",
          methodKey: "demo.Greeter/SayHello",
          requestJson: '{"name":"Bob"}',
          metadata: [{ key: "x-test", value: "1" }],
          transportMode: "native-grpc",
          nativeTarget: "localhost:50099",
          updatedAt: "2026-05-16T00:00:00.000Z",
        },
        null,
        2,
      ),
    );
    const workspace = await readWorkspace(dir);
    const items = discoverRunItems(workspace, { transport: "native-grpc" });
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Hello from item file");
    assert.equal(items[0].requestJson, '{"name":"Bob"}');
    assert.equal(items[0].target, "localhost:50099");
  });
});

test("discovers WebSocket collection requests for CLI", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "layang-cli-ws-test-"));
  try {
    await fs.mkdir(path.join(dir, "collections"), { recursive: true });
    await fs.writeFile(path.join(dir, "project.json"), JSON.stringify({ collections: [] }, null, 2));
    await fs.writeFile(
      path.join(dir, "collections", "collections.json"),
      JSON.stringify(
        [
          {
            id: "col-1",
            name: "Realtime",
            requests: [
              {
                id: "ws-1",
                collectionId: "col-1",
                name: "Chat",
                kind: "websocket",
                url: "ws://127.0.0.1:8090/mock/ws",
                body: '{"type":"ping"}',
                headers: [{ key: "Sec-WebSocket-Protocol", value: "json" }],
              },
            ],
          },
        ],
        null,
        2,
      ),
    );
    const workspace = await readWorkspace(dir);
    const items = discoverRunItems(workspace, { transport: "websocket", method: "Chat" });
    assert.equal(items.length, 1);
    assert.equal(items[0].requestKind, "websocket");
    assert.equal(items[0].target, "ws://127.0.0.1:8090/mock/ws");
    const validation = validateWorkspace(workspace);
    assert.equal(validation.ok, true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
