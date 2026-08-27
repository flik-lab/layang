"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
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
service Greeter { rpc SayHello (HelloRequest) returns (HelloReply); }
message HelloRequest { string name = 1; }
message HelloReply { string message = 1; }`;

const method = {
  serviceName: "demo.Greeter",
  methodName: "SayHello",
  requestStream: false,
  responseStream: false,
  requestType: "demo.HelloRequest",
  responseType: "demo.HelloReply",
};

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function grpcWebFrame(payload) {
  const header = Buffer.alloc(5);
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

function postGrpcWeb(port, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/demo.Greeter/SayHello",
        method: "POST",
        headers: {
          "content-type": "application/grpc-web+proto",
          "x-grpc-web": "1",
          "content-length": body.length,
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ statusCode: response.statusCode, body: Buffer.concat(chunks) }));
      },
    );
    request.once("error", reject);
    request.end(body);
  });
}

test("Web Access returns the selected local mock data on the first request", { skip: !hasGrpcDeps }, async () => {
  const { startMockServer, stopMockServer } = require("../../electron/services/grpc-mock-server.cjs");
  const { startGatewayProfile, stopGatewayProfile } = require("../../electron/services/grpc-gateway-server.cjs");
  const fs = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "layang-grpc-web-first-"));
  const protoPath = path.join(dir, "greeter.proto");
  await fs.writeFile(protoPath, protoText);
  const packageDefinition = protoLoader.loadSync(protoPath, {
    defaults: true,
    longs: String,
    enums: String,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition);
  const serviceDefinition = loaded.demo.Greeter.service;
  const rpcDefinition = serviceDefinition.SayHello ?? serviceDefinition.sayHello;
  const mockPort = await getFreePort();
  const webPort = await getFreePort();
  const profileId = `web-first-${Date.now()}`;

  try {
    await startMockServer({
      port: mockPort,
      bindHost: "127.0.0.1",
      protoFiles: [{ name: "greeter.proto", text: protoText }],
      methods: [method],
      scenarios: [
        {
          id: "latest",
          service: "demo.Greeter",
          method: "SayHello",
          response: { data: { message: "latest-first-response" } },
        },
      ],
      activeScenarioIds: { "demo.Greeter/SayHello": "latest" },
      enabledMethods: { "demo.Greeter/SayHello": true },
      uiRuntimeRevision: 1,
    });
    const gateway = await startGatewayProfile({
      profile: {
        id: profileId,
        mode: "gateway",
        listenHost: "127.0.0.1",
        listenPort: 0,
        upstreams: [{ target: `127.0.0.1:${mockPort}`, weight: 1, security: { type: "insecure" } }],
        web: {
          enabled: true,
          host: "127.0.0.1",
          port: webPort,
          security: { type: "insecure" },
          cors: { allowedOrigins: ["*"] },
        },
      },
      protoFiles: [{ name: "greeter.proto", text: protoText }],
      methods: [method],
    });
    assert.equal(gateway.running, true);

    const response = await postGrpcWeb(webPort, grpcWebFrame(rpcDefinition.requestSerialize({ name: "first" })));
    assert.equal(response.statusCode, 200);
    assert.equal(response.body[0], 0);
    const payloadLength = response.body.readUInt32BE(1);
    const message = rpcDefinition.responseDeserialize(response.body.subarray(5, 5 + payloadLength));
    assert.equal(message.message, "latest-first-response");
  } finally {
    await stopGatewayProfile(profileId);
    await stopMockServer();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("Web Access recovers requests sent during a fast local mock restart", {
  skip: !hasGrpcDeps,
  timeout: 10_000,
}, async () => {
  const { startMockServer, stopMockServer } = require("../../electron/services/grpc-mock-server.cjs");
  const { startGatewayProfile, stopGatewayProfile } = require("../../electron/services/grpc-gateway-server.cjs");
  const fs = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "layang-grpc-web-restart-"));
  const protoPath = path.join(dir, "greeter.proto");
  await fs.writeFile(protoPath, protoText);
  const packageDefinition = protoLoader.loadSync(protoPath, {
    defaults: true,
    longs: String,
    enums: String,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition);
  const serviceDefinition = loaded.demo.Greeter.service;
  const rpcDefinition = serviceDefinition.SayHello ?? serviceDefinition.sayHello;
  const mockPort = await getFreePort();
  const webPort = await getFreePort();
  const profileId = `web-restart-${Date.now()}`;
  const mockPayload = {
    port: mockPort,
    bindHost: "127.0.0.1",
    protoFiles: [{ name: "greeter.proto", text: protoText }],
    methods: [method],
    scenarios: [
      {
        id: "restart",
        service: "demo.Greeter",
        method: "SayHello",
        response: { data: { message: "response-after-restart" } },
      },
    ],
    activeScenarioIds: { "demo.Greeter/SayHello": "restart" },
    enabledMethods: { "demo.Greeter/SayHello": true },
  };

  try {
    await startMockServer(mockPayload);
    await startGatewayProfile({
      profile: {
        id: profileId,
        mode: "gateway",
        listenHost: "127.0.0.1",
        listenPort: 0,
        upstreams: [{ target: `127.0.0.1:${mockPort}`, weight: 1, security: { type: "insecure" } }],
        retry: { enabled: true, maxRetries: 5, backoffMs: 75 },
        circuitBreaker: { enabled: false },
        web: {
          enabled: true,
          host: "127.0.0.1",
          port: webPort,
          security: { type: "insecure" },
          cors: { allowedOrigins: ["*"] },
        },
      },
      protoFiles: [{ name: "greeter.proto", text: protoText }],
      methods: [method],
    });

    await stopMockServer();
    const responsePromise = postGrpcWeb(
      webPort,
      grpcWebFrame(rpcDefinition.requestSerialize({ name: "during-restart" })),
    );
    await new Promise((resolve) => setTimeout(resolve, 125));
    await startMockServer(mockPayload);

    const response = await responsePromise;
    assert.equal(response.statusCode, 200);
    assert.equal(response.body[0], 0);
    const payloadLength = response.body.readUInt32BE(1);
    const message = rpcDefinition.responseDeserialize(response.body.subarray(5, 5 + payloadLength));
    assert.equal(message.message, "response-after-restart");
  } finally {
    await stopGatewayProfile(profileId);
    await stopMockServer();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
