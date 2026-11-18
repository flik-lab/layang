"use strict";

// gRPC request pages are written from the proto: AIP-192 comments become the summary and field
// descriptions, types resolve per package, and only the RPC's own messages are shown.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const docsCoreUrl = pathToFileURL(path.join(__dirname, "..", "lib", "docs-core.mjs")).href;

const DATA_LINK = `syntax = "proto3";
package demo.datalink;

// Sends tracks to the data link.
service DataLinkService {
  // Transmits a track over the selected data link.
  // The reply confirms the request only.
  rpc TransmitItem (SetMessageRequest) returns (SetMessageReply);
  rpc WatchItems (SetMessageRequest) returns (stream SetMessageReply); // Streams link updates.
}

/** Which track to send, and where. */
message SetMessageRequest {
  // Tactical track number of the track to send.
  uint32 tactical_track_number = 1;
  DataLinkType data_link_type = 2; // Link to send on.
}

enum DataLinkType {
  DATA_LINK_TYPE_UNSPECIFIED = 0;
  // Link 16.
  DATA_LINK_TYPE_LINK_ID = 1;
}

message SetMessageReply {
  string message = 1;
}
`;

// A different package declares a message with the same short name.
const CONTEXT_MENU = `syntax = "proto3";
package demo.menu;
service MenuService { rpc DeleteItem (SetMessageRequest) returns (Ack); }
message SetMessageRequest { repeated uint32 ids = 1; }
message Ack {}
`;

function project() {
  const binding = (method) => ({ libraryId: "lib", versionId: "v1", methodFullName: method });
  return {
    protoLibraries: [
      {
        id: "lib",
        name: "demo",
        defaultVersionId: "v1",
        versions: [{ id: "v1", version: "v1", files: [{ name: "data_link.proto", text: DATA_LINK }, { name: "menu.proto", text: CONTEXT_MENU }] }],
      },
    ],
    collections: [
      {
        id: "c",
        name: "Demo",
        folders: [],
        requests: [
          { id: "transmit", name: "Transmit Item", kind: "grpc", url: "", body: "{}", headers: [], grpc: binding("demo.datalink.DataLinkService/TransmitItem") },
          { id: "watch", name: "Watch Items", kind: "grpc", url: "", body: "{}", headers: [], grpc: binding("demo.datalink.DataLinkService/WatchItems") },
        ],
      },
    ],
    examples: [
      { id: "e1", name: "Accepted", requestId: "transmit", requestJson: '{"tactical_track_number":1}', expectedJson: '{"message":"OK"}', expectedStatus: "OK", mockScenario: "ok" },
      { id: "e2", name: "Link down", requestId: "transmit", requestJson: "{}", expectedStatus: "UNAVAILABLE" },
    ],
  };
}

async function pages() {
  const docs = await import(docsCoreUrl);
  const all = docs.buildUnifiedDocsPages(project());
  return { docs, all, page: (id) => all.find((item) => item.id === id) };
}

test("leading, block and trailing proto comments document the rpc, message, fields and enum values", async () => {
  const { page } = await pages();
  const contract = page("request:transmit").contract;
  assert.equal(page("request:transmit").summary, "Transmits a track over the selected data link.\nThe reply confirms the request only.");
  assert.equal(contract.requestDescription, "Which track to send, and where.");
  const fields = Object.fromEntries(contract.requestFields.map((field) => [field.name, field]));
  assert.equal(fields.tactical_track_number.description, "Tactical track number of the track to send.");
  assert.equal(fields.data_link_type.description, "Link to send on.");
  assert.equal(fields.data_link_type.enumValues.find((value) => value.name === "DATA_LINK_TYPE_LINK_ID").description, "Link 16.");
  assert.equal(page("request:watch").summary, "Streams link updates.");
});

test("message names shared by two packages resolve to the RPC's own package", async () => {
  const { page } = await pages();
  const contract = page("request:transmit").contract;
  assert.deepEqual(contract.requestFields.map((field) => field.name), ["tactical_track_number", "data_link_type"]);
  assert.match(contract.protoSource, /DataLinkType data_link_type = 2;/);
  assert.doesNotMatch(contract.protoSource, /repeated uint32 ids/);
  assert.doesNotMatch(contract.protoSource, /WatchItems/, "the excerpt shows only this RPC");
});

test("the page lists fields, examples with their statuses, and how to run them", async () => {
  const { docs, page } = await pages();
  const markdown = docs.renderDocumentationMarkdown(page("request:transmit"));
  assert.match(markdown, /\| `tactical_track_number` \| `uint32` \| Tactical track number of the track to send\. \|/);
  assert.match(markdown, /Values: `DATA_LINK_TYPE_UNSPECIFIED`, `DATA_LINK_TYPE_LINK_ID`/);
  assert.match(markdown, /\| Accepted \| `OK` \|/);
  assert.match(markdown, /Mock scenario: `ok`/);
  assert.match(markdown, /\| `UNAVAILABLE` \| The server cannot be reached\. \| Link down \|/);
  assert.match(markdown, /layang example:run \. --all --request "Transmit Item"/);
  const watch = docs.renderDocumentationMarkdown(page("request:watch"));
  assert.match(watch, /Server stream: the server sends any number of these messages/);
});

test("saving a workspace removes untouched request placeholders and keeps written notes", async () => {
  const fs = require("node:fs");
  const fsp = require("node:fs/promises");
  const os = require("node:os");
  const { readGitWorkspace, writeGitWorkspace } = require("../lib/git-workspace.cjs");
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "layang-docs-"));
  try {
    await fsp.writeFile(path.join(root, "layang.yml"), "version: 6\nkind: workspace\nworkspace:\n  id: w\n  name: w\n");
    const dir = path.join(root, "collections", "demo");
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, "collection.yml"), "version: 2\nkind: collection\ncollection:\n  id: c\n  name: Demo\n");
    for (const [file, id, name] of [["a.grpc.yml", "a", "A"], ["b.grpc.yml", "b", "B"]])
      await fsp.writeFile(path.join(dir, file), `version: 2\nkind: request\ninfo:\n  id: ${id}\n  name: ${name}\n  protocol: grpc\nrequest:\n  grpc:\n    method: demo.S/M\n`);
    const placeholder = "<!-- layang:auto-template -->\n# A\n\n**Protocol:** GRPC\n\n**Target:** `demo.S/M`\n\n## Summary\n\nDescribe what this request does.\n\n## Notes\n\nAdd operational guidance, assumptions, and expected behavior.\n";
    await fsp.writeFile(path.join(dir, "a.grpc.md"), placeholder);
    await fsp.writeFile(path.join(dir, "b.grpc.md"), placeholder.replace("# A", "# B").replace("Describe what this request does.", "Sends B."));
    const workspace = await readGitWorkspace(root);
    await writeGitWorkspace(root, { project: workspace.project, layout: workspace.layout, settings: workspace.settings });
    assert.equal(fs.existsSync(path.join(dir, "a.grpc.md")), false, "untouched placeholder is removed");
    assert.match(fs.readFileSync(path.join(dir, "b.grpc.md"), "utf8"), /Sends B\./, "edited notes are kept");
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("the collection index labels streams and leaves missing summaries empty, not filler", async () => {
  const { docs, page } = await pages();
  const markdown = docs.renderDocumentationMarkdown(page("collection:c"));
  assert.match(markdown, /\| Watch Items \|[^\n]*`Server stream`/);
  // Index tables show the lead sentence of the rpc comment only.
  assert.match(markdown, /\| Transmit Item \|[^\n]*`Unary`[^\n]*\| Transmits a track over the selected data link\. \|\n/);
  assert.doesNotMatch(markdown, /Call demo\./);
});
