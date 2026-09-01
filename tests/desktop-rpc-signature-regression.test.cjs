"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { readGitWorkspace, writeGitWorkspace } = require("../lib/git-workspace.cjs");

function fnv1a64(input) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const character of input) {
    hash ^= BigInt(character.codePointAt(0) || 0);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

test("desktop workspace reload preserves the renderer's fully-qualified RPC signature", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "layang-desktop-signature-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const signatureInput = [
    "demo.v1.Greeter",
    "SayHello",
    "demo.v1.HelloRequest",
    "demo.v1.HelloReply",
    "single-request",
    "single-response",
  ].join("|");
  const expectedSignature = `fnv1a64:${fnv1a64(signatureInput)}`;
  const proto = `syntax = "proto3";
package demo.v1;
service Greeter { rpc SayHello (HelloRequest) returns (HelloReply); }
message HelloRequest { string name = 1; }
message HelloReply { string message = 1; }
`;

  await writeGitWorkspace(root, {
    project: {
      version: 3,
      updatedAt: "2026-09-01T00:00:00.000Z",
      collections: [{
        id: "collection-1",
        name: "Demo",
        requests: [{
          id: "request-1",
          collectionId: "collection-1",
          name: "Say hello",
          kind: "grpc",
          grpcMethodKey: "demo.v1.Greeter/SayHello",
          grpc: {
            libraryId: "library-1",
            versionId: "version-1",
            methodFullName: "demo.v1.Greeter/SayHello",
            requestType: "demo.v1.HelloRequest",
            responseType: "demo.v1.HelloReply",
            methodSignatureHash: expectedSignature,
            schemaChecksum: "",
            versionPolicy: "pinned",
            status: "valid",
          },
          headers: [],
          body: "{}",
        }],
      }],
      protoLibraries: [{
        id: "library-1",
        name: "Demo",
        lifecycle: "active",
        defaultVersionId: "version-1",
        versions: [{
          id: "version-1",
          libraryId: "library-1",
          version: "v1",
          lifecycle: "active",
          checksum: "",
          files: [{ name: "demo.proto", text: proto }],
          source: { type: "local-files" },
          importedAt: "2026-09-01T00:00:00.000Z",
          createdAt: "2026-09-01T00:00:00.000Z",
        }],
      }],
      environments: [], examples: [], methodDocs: [], docResults: [], requestTabs: [], history: [],
      mockServer: { gatewayProfiles: [] }, restMockServer: {}, wsMockServer: {},
    },
    layout: {}, settings: {},
  });

  const workspace = await readGitWorkspace(root);
  const binding = workspace.project.collections[0].requests[0].grpc;
  assert.equal(binding.requestType, "demo.v1.HelloRequest");
  assert.equal(binding.responseType, "demo.v1.HelloReply");
  assert.equal(binding.methodSignatureHash, expectedSignature);
  assert.equal(binding.status, "valid");
});
