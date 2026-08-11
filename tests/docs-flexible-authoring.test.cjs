"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { readDocumentation, writeGitWorkspace } = require("../lib/git-workspace.cjs");

const docsCoreUrl = pathToFileURL(path.resolve(__dirname, "../lib/docs-core.mjs")).href;

function sampleProject(manualPlacement = "before", markdown = "## Manual section\n\nEditable text.") {
  const proto = [
    'syntax = "proto3";',
    "package demo;",
    "",
    "service Greeter {",
    "  rpc SayHello (HelloRequest) returns (HelloReply);",
    "}",
    "",
    "message HelloRequest {",
    "  string name = 1;",
    "}",
    "",
    "message HelloReply {",
    "  string message = 1;",
    "}",
  ].join("\n");

  return {
    documentation: {
      sources: [
        {
          key: "request:req-1",
          kind: "request",
          entityId: "req-1",
          summary: "Greets a user.",
          markdown,
          manualPlacement,
          tags: [],
          audience: [],
          related: [],
          deprecated: false,
          updatedAt: "2026-08-03T00:00:00.000Z",
        },
      ],
    },
    protoLibraries: [
      {
        id: "lib-1",
        name: "Demo API",
        versions: [
          {
            id: "version-1",
            version: "1.0.0",
            files: [{ name: "greeter.proto", text: proto }],
          },
        ],
      },
    ],
    collections: [
      {
        id: "collection-1",
        name: "Demo",
        folders: [],
        requests: [
          {
            id: "req-1",
            collectionId: "collection-1",
            parentId: null,
            name: "Say hello",
            kind: "grpc",
            url: "localhost:50051",
            body: '{"name":"Layang"}',
            headers: [],
            grpcMethodKey: "demo.Greeter/SayHello",
            grpc: {
              libraryId: "lib-1",
              versionId: "version-1",
              methodFullName: "demo.Greeter/SayHello",
              requestType: "HelloRequest",
              responseType: "HelloReply",
            },
          },
        ],
      },
    ],
  };
}

async function render(manualPlacement, markdown) {
  const docs = await import(docsCoreUrl);
  const project = sampleProject(manualPlacement, markdown);
  const page = docs.buildUnifiedDocsPages(project).find((item) => item.id === "request:req-1");
  assert.ok(page, "request documentation page should be generated");
  return { docs, page, markdown: docs.renderDocumentationMarkdown(page, project.documentation.settings) };
}

test("gRPC automatic docs embed the pinned proto file without detailed generated sections", async () => {
  const { page, markdown } = await render("before");
  assert.match(markdown, /## Proto Reference/);
  assert.match(markdown, /`greeter\.proto`/);
  assert.match(markdown, /service Greeter/);
  assert.equal(page.contract.sourceFile, "greeter.proto");
  assert.doesNotMatch(markdown, /Request Schema/);
  assert.doesNotMatch(markdown, /Response Schema/);
  assert.doesNotMatch(markdown, /Mock Scenarios/);
  assert.doesNotMatch(markdown, /Latest Saved Response/);
});

test("manual docs can be placed before or after the automatic proto reference", async () => {
  const before = await render("before");
  assert.ok(before.markdown.indexOf("## Manual section") < before.markdown.indexOf("## Proto Reference"));

  const after = await render("after");
  assert.ok(after.markdown.indexOf("## Proto Reference") < after.markdown.indexOf("## Manual section"));
});

test("manual-only docs omit automatic references", async () => {
  const result = await render("only");
  assert.match(result.markdown, /## Manual section/);
  assert.doesNotMatch(result.markdown, /## Proto Reference/);
  assert.doesNotMatch(result.markdown, /service Greeter/);
});

test("inline marker places the proto reference between manual sections", async () => {
  const result = await render("inline", "## Before\n\nFirst.\n\n{{LAYANG_AUTO_REFERENCE}}\n\n## After\n\nLast.");
  const beforeIndex = result.markdown.indexOf("## Before");
  const protoIndex = result.markdown.indexOf("## Proto Reference");
  const afterIndex = result.markdown.indexOf("## After");
  assert.ok(beforeIndex < protoIndex && protoIndex < afterIndex);
  assert.doesNotMatch(result.markdown, /LAYANG_AUTO_REFERENCE/);
});

test("granular markers render live content inside one freely ordered Markdown document", async () => {
  const docs = await import(docsCoreUrl);
  const project = sampleProject(
    "inline",
    [
      "## Custom response title",
      "",
      "Text before the generated response.",
      "",
      "{{LAYANG_RESPONSE_EXAMPLE}}",
      "",
      "## Schema chosen by the writer",
      "",
      "{{LAYANG_PROTO_REFERENCE}}",
      "",
      "## Request payload",
      "",
      "{{LAYANG_REQUEST_EXAMPLE}}",
    ].join("\n"),
  );
  const page = docs.buildUnifiedDocsPages(project).find((item) => item.id === "request:req-1");
  const markdown = docs.renderDocumentationMarkdown(page);
  assert.ok(markdown.indexOf("## Custom response title") < markdown.indexOf("## Schema chosen by the writer"));
  assert.ok(markdown.indexOf("## Schema chosen by the writer") < markdown.indexOf("## Request payload"));
  assert.match(markdown, /service Greeter/);
  assert.match(markdown, /"name": "Layang"/);
  assert.doesNotMatch(markdown, /LAYANG_(PROTO_REFERENCE|REQUEST_EXAMPLE|RESPONSE_EXAMPLE)/);
  assert.doesNotMatch(markdown, /## Proto Reference/, "the generated marker body must not force its own heading");
});

test("legacy section authoring migrates into one editor with automatic markers", async () => {
  const docs = await import(docsCoreUrl);
  const project = sampleProject();
  const source = project.documentation.sources[0];
  source.sections = [
    {
      id: "intro",
      kind: "manual",
      title: "Introduction",
      enabled: true,
      mode: "manual",
      markdown: "## Introduction\n\nManual text.",
    },
    { id: "reference", kind: "reference", title: "Custom Schema", enabled: true, mode: "auto", markdown: "" },
    { id: "response", kind: "response-example", title: "Returned Data", enabled: true, mode: "auto", markdown: "" },
  ];
  const page = docs.buildUnifiedDocsPages(project).find((item) => item.id === "request:req-1");
  const editor = docs.documentationEditorMarkdown(page, source);
  assert.match(editor, /## Introduction/);
  assert.match(editor, /## Custom Schema\n\n\{\{LAYANG_PROTO_REFERENCE\}\}/);
  assert.match(editor, /## Returned Data\n\n\{\{LAYANG_RESPONSE_EXAMPLE\}\}/);
});

test("page sections can be reordered, hidden, and converted to editable automatic Markdown", async () => {
  const docs = await import(docsCoreUrl);
  const project = sampleProject();
  project.documentation.sources[0].sections = [
    { id: "response", kind: "response-example", title: "Saved response", enabled: false, mode: "auto", markdown: "" },
    {
      id: "reference",
      kind: "reference",
      title: "Protocol contract",
      enabled: true,
      mode: "auto-editable",
      markdown: "## Protocol contract\n\nCustom frozen proto notes.",
    },
    {
      id: "intro",
      kind: "manual",
      title: "Introduction",
      enabled: true,
      mode: "manual",
      markdown: "## Introduction\n\nManual first section.",
    },
  ];
  const page = docs.buildUnifiedDocsPages(project).find((item) => item.id === "request:req-1");
  const markdown = docs.renderDocumentationMarkdown(page);
  assert.ok(markdown.indexOf("## Protocol contract") < markdown.indexOf("## Introduction"));
  assert.match(markdown, /Custom frozen proto notes/);
  assert.doesNotMatch(markdown, /## Saved response/);
  assert.doesNotMatch(markdown, /service Greeter/);
});

test("advanced generated sections are opt-in by default", async () => {
  const docs = await import(docsCoreUrl);
  const state = docs.normalizeDocumentationState({});
  assert.equal(state.settings.includeSchemas, true);
  assert.equal(state.settings.includeExamples, false);
  assert.equal(state.settings.includeMocks, false);
  assert.equal(state.settings.includeCodeSamples, false);
  assert.equal(state.settings.includeErrors, false);
  assert.equal(state.settings.includeResponseContracts, false);
  assert.equal(state.settings.generatedSectionsMode, "minimal");

  const migrated = docs.normalizeDocumentationState({ settings: { includeMocks: true, includeExamples: true } });
  assert.equal(migrated.settings.includeMocks, false, "old implicit defaults should migrate to minimal mode");
  assert.equal(migrated.settings.includeExamples, false, "old implicit defaults should migrate to minimal mode");

  const custom = docs.normalizeDocumentationState({
    settings: { generatedSectionsMode: "custom", includeMocks: true },
  });
  assert.equal(custom.settings.includeMocks, true);
});

test("section configuration persists in Git-friendly documentation files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "layang-doc-layout-"));
  const collections = [
    {
      id: "collection-1",
      name: "Demo",
      description: "",
      folders: [],
      requests: [{ id: "req-1", name: "Say hello", kind: "grpc", url: "localhost:50051" }],
    },
  ];
  const documentation = {
    sources: [
      {
        key: "request:req-1",
        kind: "request",
        entityId: "req-1",
        summary: "",
        markdown: "",
        manualPlacement: "after",
        sections: [
          {
            id: "overview",
            kind: "manual",
            title: "Overview",
            enabled: true,
            mode: "manual",
            markdown: "## Overview\n\nEditable.",
          },
          {
            id: "reference",
            kind: "reference",
            title: "Custom Proto",
            enabled: true,
            mode: "auto-editable",
            markdown: "## Custom Proto\n\nFrozen reference.",
          },
        ],
        tags: [],
        audience: [],
        related: [],
        deprecated: false,
        updatedAt: "2026-08-03T00:00:00.000Z",
      },
    ],
    publications: [],
    settings: {},
  };

  await writeGitWorkspace(root, { project: { collections, documentation } });
  const restored = await readDocumentation(root);
  const requestSource = restored.sources.find((item) => item.key === "request:req-1");
  assert.ok(requestSource, "request docs source should be restored even when manual Markdown is empty");
  assert.equal(requestSource.manualPlacement, "after");
  assert.equal(requestSource.sections.length, 2);
  assert.equal(requestSource.sections[1].mode, "auto-editable");
  assert.equal(requestSource.sections[1].title, "Custom Proto");
  await fs.rm(root, { recursive: true, force: true });
});
