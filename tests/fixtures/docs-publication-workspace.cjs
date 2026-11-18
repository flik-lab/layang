"use strict";

const { writeGitWorkspace } = require("../../lib/git-workspace.cjs");
const { GrpcScenarioRepository } = require("../../lib/grpc-scenario-repository.cjs");
const { stringifyYaml } = require("../../lib/workspace-yaml.cjs");

async function createDocsExample(root, extraScenarios = 0) {
  const methodKey = "tacnav.TacticalNavigation/WatchTracks";
  const project = {
    documentation: { sources: [
      { key: "workspace:workspace", kind: "workspace", entityId: "workspace", summary: "A runnable Tactical Navigation example.",
        markdown: "Open the workspace in Layang. Use Watch Tracks for gRPC streaming and Create Track for a REST request." },
      { key: "collection:collection-a", kind: "collection", entityId: "collection-a", summary: "Requests for working with tracks.",
        markdown: "Start the matching mock runtime before sending a request." },
      { key: "collection:collection-b", kind: "collection", entityId: "collection-b", summary: "A second collection for additional operations.",
        markdown: "Add requests here as the workspace grows." },
      { key: "folder:folder-watch", kind: "folder", entityId: "folder-watch", summary: "Server-streaming track operations.",
        markdown: "Choose a scenario per method, then apply the saved revision before testing the stream." },
    ] },
    protoLibraries: [{
      id: "tacnav", name: "Tacnav", defaultVersionId: "revision-one",
      versions: [{ id: "revision-one", version: "1.0", files: [{
        name: "proto/tactical navigation.proto",
        text: 'syntax = "proto3";\npackage tacnav;\nservice TacticalNavigation { rpc WatchTracks (WatchRequest) returns (stream TrackBatch); }\nmessage WatchRequest { string area = 1; }\nmessage TrackBatch { repeated string tracks = 1; }\n',
      }] }],
    }],
    collections: [
      { id: "collection-a", name: "Tactical Navigation", folders: [{ id: "folder-watch", name: "Watch Operations" }], requests: [
        { id: "watch", parentId: "folder-watch", name: "Watch Tracks", kind: "grpc",
          url: "localhost:50055", body: '{"area":"north"}', headers: [],
          grpc: { libraryId: "tacnav", versionId: "revision-one", methodFullName: methodKey } },
        { id: "create", name: "Create Track", kind: "rest", method: "POST",
          url: "{{baseUrl}}/tracks/{{id}}", restBodyType: "json", body: '{"name":"Alpha","history":[1,2]}',
          headers: [{ key: "Authorization", value: "sample-private-token", enabled: true }],
          restParams: [{ key: "view", value: "full", enabled: true }] },
      ] },
      { id: "collection-b", name: "Tactical Navigation", folders: [], requests: [] },
    ],
    restMockServer: { bindHost: "127.0.0.1", port: 18081, scenarios: [
      { id: "created", requestId: "create", name: "Created", enabled: true, method: "POST", path: "/tracks/:id", status: 201, body: '{"id":"alpha"}' },
      { id: "invalid", requestId: "create", name: "Invalid", enabled: true, method: "POST", path: "/tracks/:id",
        priority: 10, matchQuery: [{ key: "invalid", value: "true", enabled: true }], status: 400, body: '{"error":"invalid"}' },
    ] },
  };
  await writeGitWorkspace(root, { project, layout: {}, settings: {} });
  const repo = new GrpcScenarioRepository(root);
  for (const [scenarioId, mode] of [["normal", "incoming"], ["manual", "standby"], ["periodic-array", "periodic"],
    ...Array.from({ length: extraScenarios }, (_, index) => [`additional-${index}`, "incoming"])]) {
    const result = await repo.save({ methodKey, scenarioId }, stringifyYaml({
      id: scenarioId, name: scenarioId.replaceAll("-", " "),
      stream: { execution: { mode }, responses: [{ data: { tracks: ["private-array-payload"] } }] },
    }), { expectedRevision: 0, expectedHash: "" });
    if (!result.ok) throw Error(`Example scenario already exists: ${scenarioId}`);
  }
  return { project, methodKey };
}

if (require.main === module) {
  if (!process.argv[2]) throw Error("Pass an empty output directory.");
  createDocsExample(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { createDocsExample };
