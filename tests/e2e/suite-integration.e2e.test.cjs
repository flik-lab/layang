"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-mock-hot-reload.e2e.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-mock-hot-reload.e2e.test.cjs", () => {
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
    if (process.env.LAYANG_REQUIRE_RUNTIME_DEPS === "1" && !hasGrpcDeps) {
      throw new Error("Required gRPC runtime dependencies are unavailable. Run pnpm install --frozen-lockfile --prod=false.");
    }
    
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
    
        await updateActiveMockServer(
          {
            uiRuntimeRevision: 3,
            scenarios: [
              { id: "ui-2", service: "demo.Greeter", method: "SayHello", response: { data: { message: "ui-2" } } },
            ],
            activeScenarioIds: { "demo.Greeter/SayHello": "ui-2" },
            enabledMethods: { "demo.Greeter/SayHello": false },
          },
          "ui",
        );
        await assert.rejects(
          callUnary(client, { name: "A" }),
          (error) => error?.code === grpc.status.NOT_FOUND && /disabled/i.test(error.details || error.message),
        );
    
        await updateActiveMockServer(
          {
            uiRuntimeRevision: 4,
            scenarios: [
              { id: "ui-2", service: "demo.Greeter", method: "SayHello", response: { data: { message: "ui-2" } } },
            ],
            activeScenarioIds: { "demo.Greeter/SayHello": "ui-2" },
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "grpc-web-first-request.e2e.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("grpc-web-first-request.e2e.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const http = require("node:http");
    const net = require("node:net");
    const { createGrpcWebStreamParser } = require("../../lib/runtime/grpc-web/grpc-web-transport-runtime.cjs");
    
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
    if (process.env.LAYANG_REQUIRE_RUNTIME_DEPS === "1" && !hasGrpcDeps) {
      throw new Error("Required gRPC runtime dependencies are unavailable. Run pnpm install --frozen-lockfile --prod=false.");
    }
    
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
    
    test("Web Access unary mock accepts external chunked grpc-web-text base64 and matches the request body", { skip: !hasGrpcDeps }, async () => {
      const { startGatewayProfile, stopGatewayProfile } = require("../../electron/services/grpc-gateway-server.cjs");
      const fs = require("node:fs/promises");
      const os = require("node:os");
      const path = require("node:path");
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "layang-grpc-web-unary-matcher-"));
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
      const webPort = await getFreePort();
      const profileId = `web-unary-matcher-${Date.now()}`;
    
      try {
        await startGatewayProfile({
          profile: {
            id: profileId,
            mode: "mock",
            listenHost: "127.0.0.1",
            listenPort: 0,
            noMatchBehavior: "not-found",
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
          scenarios: [
            {
              id: "ada",
              service: "demo.Greeter",
              method: "SayHello",
              input: { equals: { name: "Ada" } },
              response: { data: { message: "hello Ada" } },
            },
          ],
          activeScenarioIds: { "demo.Greeter/SayHello": "ada" },
          enabledMethods: { "demo.Greeter/SayHello": true },
        });
    
        const framed = grpcWebFrame(rpcDefinition.requestSerialize({ name: "Ada" }));
        // External grpc-web-text implementations may flush independently padded
        // base64 entities instead of one continuous entity. Joining those entities
        // reproduces the interoperability case that used to decode only up to the
        // first '=' and surface as an incomplete gRPC-Web frame.
        const encodedBody = Buffer.from(
          [framed.subarray(0, 2), framed.subarray(2, 7), framed.subarray(7)]
            .map((chunk) => chunk.toString("base64"))
            .join("\r\n"),
          "ascii",
        );
        const response = await new Promise((resolve, reject) => {
          const request = http.request(
            {
              host: "127.0.0.1",
              port: webPort,
              path: "/demo.Greeter/SayHello",
              method: "POST",
              headers: {
                "content-type": "application/grpc-web-text+proto",
                "x-grpc-web": "1",
                "content-length": encodedBody.length,
              },
            },
            (res) => {
              const chunks = [];
              res.on("data", (chunk) => chunks.push(chunk));
              res.on("end", () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }));
            },
          );
          request.once("error", reject);
          request.end(encodedBody);
        });
    
        assert.equal(response.statusCode, 200);
        const parser = createGrpcWebStreamParser({ responseEncoding: "text" });
        const frames = parser.push(response.body, true);
        const dataFrame = frames.find((frame) => frame.kind === "data");
        const trailerFrame = frames.find((frame) => frame.kind === "trailers");
        assert.ok(dataFrame, "expected a gRPC-Web data frame");
        assert.ok(trailerFrame, "expected a gRPC-Web trailer frame");
        const message = rpcDefinition.responseDeserialize(Buffer.from(dataFrame.payload));
        assert.equal(message.message, "hello Ada");
        assert.match(Buffer.from(trailerFrame.payload).toString("ascii"), /grpc-status: 0/);
      } finally {
        await stopGatewayProfile(profileId);
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
    
  });
}
