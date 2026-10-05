"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "dark-tone-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("dark-tone-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    
    const designSystem = fs.readFileSync("lib/design-system.ts", "utf8");
    const globals = fs.readFileSync("app/globals.css", "utf8");
    const compat = fs.readFileSync("components/shadcn/compat.tsx", "utf8");
    
    test("dark workbench uses the cooler Layang reference tone", () => {
      assert.match(designSystem, /bg: "#0f1117"/);
      assert.match(designSystem, /surface: "#151922"/);
      assert.match(designSystem, /railBg: "#0c1018"/);
      assert.match(designSystem, /text: "#e8ecf7"/);
      assert.match(designSystem, /tabActiveBg: "#202944"/);
      assert.match(designSystem, /primaryStrong: "#3f85f4"/);
    });
    
    test("fallback CSS and portal theme bridge use the same dark tone", () => {
      assert.match(globals, /--background: #0f1117/);
      assert.match(globals, /--card: #151922/);
      assert.match(globals, /--ring: #3f85f4/);
      assert.match(globals, /--success: #0d9c72/);
      assert.match(compat, /"--ring": tokens\.primaryStrong/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "docs-flexible-authoring.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("docs-flexible-authoring.test.cjs", () => {
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
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "large-stream-ui-virtualization-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("large-stream-ui-virtualization-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const read = (path) => fs.readFileSync(path, "utf8");
    
    test("large response JSON pages worker lines through fixed-window virtualization", () => {
      const viewer = read("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx");
      const viewportHook = read("app/playground/features/response-viewer/json-document/useJsonViewport.ts");
      assert.match(viewer, /useFixedVirtualWindow/);
      assert.doesNotMatch(viewer, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
      assert.match(viewportHook, /payloadDocumentService\.getLines/);
      assert.doesNotMatch(viewer, /split\("\\n"\)/);
    });
    
    test("Latest JSON follows document ids without full-string deferred rendering or polling", () => {
      const latest = read("app/playground/features/response-viewer/latest/LatestResponseViewer.tsx");
      const follow = read("app/playground/features/response-viewer/latest/useLatestFollow.ts");
      assert.match(latest, /useLatestFollow\(latestMessageId, \{ minTargetIntervalMs \}\)/);
      assert.match(follow, /mode: "follow"/);
      assert.match(follow, /mode: "hold"/);
      assert.match(follow, /mode: "frozen"/);
      assert.doesNotMatch(latest, /useDeferredValue|setInterval/);
    });
    
    test("message rows stay fixed while full payloads remain in the document worker", () => {
      const list = read("app/playground/features/response-viewer/message-list/MessageList.tsx");
      const types = read("app/playground/features/response-viewer/model/response.types.ts");
      assert.match(list, /virtualWindow\.items\.map/);
      assert.doesNotMatch(list, /useVirtualizer|flushSync/);
      assert.match(types, /documentId\?: string/);
      assert.doesNotMatch(types, /fullPayload/);
    });
    
    test("large stream UI commits remain bounded and active responses append into normalized state", () => {
      const liveEvents = read("app/playground/features/request-runner/use-live-session-events.ts");
      assert.match(liveEvents, /MAX_PENDING_MESSAGE_EVENTS_PER_SESSION/);
      assert.match(liveEvents, /LARGE_PAYLOAD_UI_FLUSH_MS/);
      assert.match(liveEvents, /responseSessionRegistry\.getOrCreate\(targetSessionId\)\.store\.appendEvents/);
      assert.match(liveEvents, /pending\.messages\[pending\.messages\.length - 1\] = event/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "stream-hidden-response-performance-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("stream-hidden-response-performance-regression.test.cjs", () => {
    const test = require('node:test');
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const path = require('node:path');
    
    const root = path.join(__dirname, '..');
    const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
    
    test('response viewer no longer uses TanStack virtualizer on React 19 hot paths', () => {
      const messageList = read('app/playground/features/response-viewer/message-list/MessageList.tsx');
      const jsonViewer = read('app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx');
      assert.doesNotMatch(messageList, /@tanstack\/react-virtual|useVirtualizer/);
      assert.doesNotMatch(jsonViewer, /@tanstack\/react-virtual|useVirtualizer/);
      assert.match(jsonViewer, /useFixedVirtualWindow/);
    });
    
    test('mocking fixed-row virtualization does not use TanStack flushSync path', () => {
      const sidebar = read('app/playground/features/mock-server/sidebar/MockingSidebar.tsx');
      const catalog = read('app/playground/features/mock-server/workspace/MockCatalogList.tsx');
      assert.doesNotMatch(sidebar, /@tanstack\/react-virtual|useVirtualizer/);
      assert.doesNotMatch(catalog, /@tanstack\/react-virtual|useVirtualizer|measureElement/);
      assert.match(sidebar, /useFixedVirtualWindow/);
      assert.match(catalog, /useFixedVirtualWindow/);
    });
    
    test('hidden response stream defers heavy payload registration while Mocking is active', () => {
      const live = read('app/playground/features/request-runner/use-live-session-events.ts');
      assert.match(live, /getWorkbenchSideSection/);
      assert.match(live, /deferredEventsRef/);
      assert.match(live, /sideSection !== "collections"/);
      assert.match(live, /flushDeferredEvents/);
      assert.match(live, /subscribeWorkbenchSideSection/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "typography-system-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("typography-system-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    
    const root = path.resolve(__dirname, "..");
    
    function read(relative) {
      return fs.readFileSync(path.join(root, relative), "utf8");
    }
    
    function collectSourceFiles(directory, extensions) {
      const result = [];
      for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
        const relative = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...collectSourceFiles(relative, extensions));
        else if (extensions.some((extension) => entry.name.endsWith(extension))) result.push(relative);
      }
      return result;
    }
    
    test("semantic typography tokens are the single shared scale", () => {
      const design = read("lib/design-system.ts");
      const css = read("app/globals.css");
      const compat = read("components/shadcn/compat.tsx");
    
      for (const token of [
        "caption: 11",
        "body: 12",
        "control: 12",
        "label: 11",
        "section: 13",
        "dialogTitle: 14",
        "pageTitle: 15",
        "metric: 18",
        "mono: 11.5",
      ]) {
        assert.match(design, new RegExp(token.replace(".", "\\.")));
      }
      for (const weight of ["regular: 400", "medium: 500", "semibold: 600", "bold: 700"]) {
        assert.match(design, new RegExp(weight));
      }
      assert.match(css, /--font-size-dialog-title: 14px/);
      assert.match(css, /--font-size-page-title: 15px/);
      assert.match(css, /--font-size-mono: 11\.5px/);
      assert.match(compat, /variant === "subtitle1"[\s\S]*font-semibold/);
      assert.match(compat, /variant === "body2"[\s\S]*font-normal/);
      assert.match(compat, /text-\[length:var\(--font-size-dialog-title\)\][\s\S]*font-semibold/);
    });
    
    test("visual source uses only supported numeric font weights", () => {
      const files = [
        ...collectSourceFiles("app", [".ts", ".tsx", ".css"]),
        ...collectSourceFiles("components", [".ts", ".tsx", ".css"]),
        ...collectSourceFiles("lib", [".ts", ".tsx", ".css"]),
      ];
      const unsupported = [];
      for (const file of files) {
        const source = read(file);
        for (const match of source.matchAll(/fontWeight\s*[:=][^\n]*?\b(\d{3})\b|font-weight:\s*(\d{3})/g)) {
          const value = Number(match[1] ?? match[2]);
          if (![400, 500, 600, 700].includes(value)) unsupported.push(`${file}: ${value}`);
        }
      }
      assert.deepEqual(unsupported, []);
    });
    
    test("visual text never drops below 11px", () => {
      const files = [
        ...collectSourceFiles("app", [".ts", ".tsx", ".css"]),
        ...collectSourceFiles("components", [".ts", ".tsx", ".css"]),
        ...collectSourceFiles("lib", [".ts", ".tsx", ".css"]),
      ];
      const undersized = [];
      for (const file of files) {
        const source = read(file);
        for (const match of source.matchAll(/(?:fontSize\s*:\s*|font-size:\s*|text-\[)(\d+(?:\.\d+)?)px/g)) {
          const value = Number(match[1]);
          if (value < 11) undersized.push(`${file}: ${value}`);
        }
      }
      assert.deepEqual(undersized, []);
    });
    
    test("selected tabs and sidebar rows keep the same medium weight", () => {
      const workbench = read("components/ui/workbench.tsx");
      const tabs = read("components/ui/tabs.tsx");
      const sidebar = read("components/ui/sidebar.tsx");
      const css = read("app/globals.css");
    
      assert.match(workbench, /min-w-fit font-medium/);
      assert.doesNotMatch(workbench, /active[^\n]*font-(?:normal|semibold|bold)/);
      assert.match(tabs, /font-medium/);
      assert.doesNotMatch(tabs, /data-\[state=active\][^\n]*font-/);
      assert.doesNotMatch(sidebar, /isActive && "[^"]*font-/);
      assert.match(css, /\.request-tab \{[\s\S]*font-weight: var\(--font-weight-medium\)/);
      assert.doesNotMatch(css, /\.request-tab\[data-active="true"\][\s\S]{0,300}font-weight/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "ui-performance-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("ui-performance-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    const liveEvents = fs.readFileSync("app/playground/features/request-runner/use-live-session-events.ts", "utf8");
    const layout = fs.readFileSync("app/playground/features/layout/use-workbench-layout.ts", "utf8");
    const table = fs.readFileSync("app/playground/shared/components/resizable-table.tsx", "utf8");
    const jsonViewer = fs.readFileSync("app/playground/features/response-viewer/json-document/JsonDocumentViewer.tsx", "utf8");
    const messageList = fs.readFileSync("app/playground/features/response-viewer/message-list/MessageList.tsx", "utf8");
    const schemas = fs.readFileSync("app/playground/features/proto-registry/schema-sidebar-tree.tsx", "utf8");
    const layoutPersistence = fs.readFileSync("app/playground/features/workspace/use-workspace-layout-persistence.ts", "utf8");
    const performanceHelpers = fs.readFileSync("app/playground/shared/performance/interaction-performance.ts", "utf8");
    
    test("high-frequency live events are buffered before React commits", () => {
      assert.match(liveEvents, /pendingEventsRef/);
      assert.match(liveEvents, /LIVE_EVENT_FLUSH_MS/);
      assert.match(liveEvents, /responseSessionRegistry\.getOrCreate\(targetSessionId\)\.store\.appendEvents/);
    });
    
    test("mouse-driven layout and table resizing are coalesced by animation frame", () => {
      assert.match(layout, /requestAnimationFrame/);
      assert.match(layout, /cancelAnimationFrame/);
      assert.match(table, /requestAnimationFrame/);
      assert.match(table, /cancelAnimationFrame/);
    });
    
    test("large response search and formatting stay worker-backed while schema filtering remains deferred", () => {
      assert.match(jsonViewer, /payloadDocumentService\.search/);
      assert.match(jsonViewer, /useJsonViewport/);
      assert.doesNotMatch(jsonViewer, /JSON\.stringify|split\("\\n"\)/);
      assert.match(schemas, /useDeferredValue/);
    });
    
    test("bounded message lists avoid sync virtualization while large JSON uses fixed-window paging", () => {
      assert.match(messageList, /virtualWindow\.items\.map/);
      assert.doesNotMatch(messageList, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
      assert.match(jsonViewer, /useFixedVirtualWindow/);
      assert.doesNotMatch(jsonViewer, /@tanstack\/react-virtual|useVirtualizer|flushSync/);
    });
    
    test("keyed idle scheduling coalesces non-urgent persistence work", () => {
      assert.match(performanceHelpers, /export function scheduleIdleTask/);
      assert.match(performanceHelpers, /pendingIdleTasks/);
      assert.match(layoutPersistence, /scheduleIdleTask\("workspace-layout"/);
    });
    
  });
}
