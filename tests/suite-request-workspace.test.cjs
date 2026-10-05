"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "quick-request-creator-ux.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("quick-request-creator-ux.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("collection quick create keeps destination context and seeds unified gRPC method selection", () => {
      const actions = read("app/playground/features/collection/use-collection-actions.ts");
      const collectionSidebar = read("app/playground/features/collection/collection-sidebar.tsx");
    
      assert.match(collectionSidebar, /onAddCollectionRequest\(collection\.id, kind, parentId\)/);
      assert.match(actions, /setRequestTargetCollectionId\(collectionId \|\| NEW_SCHEMA_COLLECTION_TARGET\)/);
      assert.match(actions, /setRequestTargetFolderId\(parentId\)/);
      assert.match(actions, /setRequestLocationEditable\(kind === "grpc" \|\| !kind\)/);
      assert.doesNotMatch(actions, /SelectionModeDraft/);
      assert.match(actions, /setRequestGrpcMethodKeysDraft\(firstMethod \? \[methodKey\(firstMethod\)\] : \[\]\)/);
      assert.match(actions, /layang:last-request-schema-id/);
      assert.match(actions, /layang:last-request-service-name/);
    });
    
    test("gRPC quick creator supports search, multi-select, service/schema select-all, and advanced revision", () => {
      const dialogs = read("app/playground/features/shell/workbench-dialogs.tsx");
    
      assert.match(dialogs, /placeholder="Search methods or services"/);
      assert.match(dialogs, /Select visible \(\{visibleRequestMethods\.length\}\)/);
      assert.match(dialogs, /Select service/);
      assert.match(dialogs, /Select all \{selectedRequestMethods\.length\}/);
      assert.match(dialogs, /Skip existing requests/);
      assert.match(dialogs, /Already exists/);
      assert.match(dialogs, /Requests stay pinned to the selected proto revision/);
      assert.match(dialogs, /Hide options/);
      assert.match(dialogs, /Proto revision/);
      assert.match(dialogs, /Import Proto/);
    });
    
    test("bulk create skips an existing schema RPC by identity in one state update", () => {
      const actions = read("app/playground/features/collection/use-collection-actions.ts");
    
      assert.match(actions, /existingMethodNames = new Set/);
      assert.match(actions, /request\.grpc\?\.libraryId === compiled\.library\.id/);
      assert.match(actions, /methods\.filter\(\(method\) => !existingMethodNames\.has/);
      assert.match(actions, /workingCollection = \{ \.\.\.workingCollection, requests: \[\.\.\.workingCollection\.requests, request\] \}/);
      assert.match(actions, /setCollections\(\(current\) =>[\s\S]{0,260}workingCollection/);
      assert.doesNotMatch(actions, /methodsToCreate\.forEach\([\s\S]{0,250}setCollections/);
    });
    
    test("schema action uses the shared multi-method creator from the Proto source workspace", () => {
      const schema = read("app/playground/features/proto-registry/proto-schema-workspace.tsx");
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
    
      assert.match(schema, />\s*Create requests\s*</);
      assert.match(schema, /openGrpcMethodsRequestDialog\(methods, library\.id, version\.id\)/);
      assert.match(schema, /data-layout="schema-proto-workspace"/);
      assert.doesNotMatch(schema, />\s*Create all\s*</);
      assert.match(sidebar, /<SchemaSidebarTree/);
      assert.doesNotMatch(sidebar, /Create all \{methodCount\} requests/);
    });
    
    test("new menu and keyboard shortcuts expose quick create without adding another creator implementation", () => {
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
    
      assert.match(sidebar, /Request from schema/);
      assert.match(sidebar, /Blank HTTP request/);
      assert.match(sidebar, /Blank WebSocket request/);
      assert.match(sidebar, /event\.key\.toLowerCase\(\)/);
      assert.match(sidebar, /key === "n"/);
      assert.match(sidebar, /key === "k"/);
      assert.match(sidebar, /Command palette/);
      assert.match(sidebar, /openAddCollectionRequestDialog\(destination\.collectionId, kind, destination\.folderId\)/);
    });
    
    
    
    test("quick creator can target a collection or auto-create a schema collection grouped by service", () => {
      const actions = read("app/playground/features/collection/use-collection-actions.ts");
      const dialogs = read("app/playground/features/shell/workbench-dialogs.tsx");
      const domain = read("app/playground/features/collection/quick-request-creator-domain.ts");
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
    
      assert.match(dialogs, /New collection · \$\{newSchemaCollectionName\}/);
      assert.match(dialogs, /Selected methods are grouped into service folders automatically/);
      assert.match(actions, /uniqueSchemaCollectionName\(compiled\.library\.name, collections\)/);
      assert.match(actions, /serviceFolderIds = new Map/);
      assert.match(actions, /createFolderEntity\(workingCollection, parentId, serviceName, now\)/);
      assert.match(actions, /requestParentId = groupByService \? serviceFolderIds\.get\(method\.serviceName\)/);
      assert.match(domain, /NEW_SCHEMA_COLLECTION_TARGET/);
      assert.match(domain, /collection\.name\.trim\(\)\.toLowerCase\(\) === schemaName\.trim\(\)\.toLowerCase\(\)/);
      assert.match(sidebar, /openAddCollectionRequestDialog\("", kind, null\)/);
    });
    
    test("quick creator stores recent schemas and services", () => {
      const dialogs = read("app/playground/features/shell/workbench-dialogs.tsx");
    
      assert.match(dialogs, /layang:recent-request-schema-ids/);
      assert.match(dialogs, /layang:recent-request-services/);
      assert.match(dialogs, /orderedGlobalProtoSchemas/);
      assert.match(dialogs, /orderedRequestServices/);
    });
    
    test("proto upload from request flow creates a schema collection and opens the created request", () => {
      const actions = read("app/playground/features/collection/use-collection-actions.ts");
      const io = read("app/playground/features/workspace/use-workspace-io-actions.ts");
    
      assert.match(io, /addGrpcMethodsToCollection\(\s*pendingCollectionId \|\| NEW_SCHEMA_COLLECTION_TARGET,\s*compiled\.loaded\.methods/);
      assert.match(actions, /selectCollectionRequest\(workingCollection, requests\[0\]\)/);
      assert.match(actions, /setSideSection\("collections"\)/);
      assert.match(actions, /requestIds: requests\.map\(\(request\) => request\.id\)/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "request-search-layout-editor-performance-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("request-search-layout-editor-performance-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    
    const read = (file) => fs.readFileSync(file, "utf8");
    
    test("Ctrl+P searches the full collection catalog and can open unopened requests", () => {
      const sidebar = read("app/playground/features/shell/workbench-sidebar.tsx");
      assert.match(sidebar, /Search requests by name/);
      assert.match(sidebar, /for \(const collection of collections as ApiCollection\[\]\)/);
      assert.match(sidebar, /for \(const request of collection\.requests\)/);
      assert.match(sidebar, /selectCollectionRequest\(item\.collection, item\.request\)/);
      assert.match(sidebar, /No matching requests\./);
    });
    
    test("request response placement is persisted per request, not just split ratios", () => {
      const types = read("app/playground/shared/workbench-types.ts");
      const layout = read("app/playground/features/layout/use-workbench-layout.ts");
      const main = read("app/playground/features/shell/workbench-main-panel.tsx");
      assert.match(types, /requestResponseLayout\?: RequestResponseLayoutMode/);
      assert.match(layout, /activeRequestView\.requestResponseLayout \?\? requestResponseLayout/);
      assert.match(layout, /updateActiveRequestView\(\{\s*requestResponseLayout:/);
      assert.match(main, /activeRequestResponseLayout === "horizontal"/);
    });
    
    test("request body CodeMirror editor buffers parent commits while scroll/cursor stay inside EditorView", () => {
      const wrapper = read("app/playground/features/request-editor/request-editor-panels.tsx");
      const editor = read("components/editor/layang-code-editor.tsx");
      const main = read("app/playground/features/shell/workbench-main-panel.tsx");
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
      const runner = read("app/playground/hooks/use-request-runner.ts");
      assert.match(wrapper, /commitDelayMs\?: number/);
      assert.match(editor, /onDraftChangeRef\.current\?\.\(nextValue\)/);
      assert.match(editor, /pendingCommitRef/);
      assert.match(editor, /scheduleCommit/);
      assert.match(editor, /EditorView\.updateListener/);
      assert.match(editor, /view\.scrollDOM\.scrollTop/);
      assert.doesNotMatch(editor, /setEditorScrollTop/);
      assert.match(main, /commitDelayMs=\{250\}/);
      assert.match(main, /onDraftChange=\{updateRequestJsonDraft\}/);
      assert.match(model, /requestJsonDraftRef/);
      assert.match(runner, /options\.getRequestJson\?\.\(\) \?\? requestJson/);
    });
    
    test("read-only detached response windows do not reload the whole workspace on every save", () => {
      const controller = read("app/playground/features/workspace/use-workspace-controller.ts");
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
      assert.match(controller, /if \(windowKind === "response"\) return;/);
      assert.match(model, /windowKind: managedWindow\.context\.kind/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "request-workspace-vscode-layout-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("request-workspace-vscode-layout-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("request workspace keeps mock selection and request utilities contextual without an Open Proto header action", () => {
      const main = read("app/playground/features/shell/workbench-main-panel.tsx");
      assert.doesNotMatch(main, /ariaLabel="Request workspace mode"/);
      assert.doesNotMatch(main, /<WorkbenchTabs<RequestWorkspaceMode>/);
      assert.doesNotMatch(main, />\s*Open Proto\s*</);
      assert.match(main, /aria-label="Select mock scenario"/);
      assert.match(main, /aria-label="Mock settings"/);
      assert.doesNotMatch(main, /aria-label="New mock scenario"/);
      assert.match(main, /aria-label="Request options"/);
      assert.match(main, /setRequestUtilityDialog\("examples"\)/);
      assert.match(main, /setRequestUtilityDialog\("docs"\)/);
      assert.match(main, /setRequestUtilityDialog\("benchmark"\)/);
      assert.match(main, /setRequestUtilityDialog\("settings"\)/);
    });
    
    test("request editor exposes only compact protocol-specific primary tabs", () => {
      const main = read("app/playground/features/shell/workbench-main-panel.tsx");
      assert.match(main, /\{ value: "body", label: "Message" \}/);
      assert.match(main, /\{ value: "metadata", label: "Metadata" \}/);
      assert.match(main, /\{ value: "auth", label: "Auth" \}/);
      assert.match(main, /\{ value: "schema", label: "Params" \}/);
      assert.match(main, /\{ value: "body", label: "Body" \}/);
      assert.match(main, /\{ value: "metadata", label: "Headers" \}/);
      assert.doesNotMatch(main, /\{ value: "more", label: "Settings" \}/);
      assert.match(main, /variant="underline"/);
    });
    
    test("request connection row exposes environment and transport as select-like dropdowns and executes at the URL edge", () => {
      const main = read("app/playground/features/shell/workbench-main-panel.tsx");
      assert.doesNotMatch(main, /const requestMethodPath = selectedMethod/);
      assert.doesNotMatch(main, /\{requestMethodPath\}/);
      assert.match(main, /className="workbench-url-input"/);
      assert.match(main, /const connectionSelectSx/);
      assert.match(main, /aria-expanded=\{Boolean\(envMenuAnchor\)\}/);
      assert.match(main, /aria-expanded=\{Boolean\(transportMenuAnchor\)\}/);
      assert.match(main, /border: "1px solid"/);
      assert.match(main, /renderPrimaryRequestAction\(\)/);
      assert.match(main, /requestIsGrpcStreaming \? "Stream" : "Send"/);
    });
    
    test("Response panel has no normal separator line or verbose empty-response copy", () => {
      const panel = read("app/playground/features/response-viewer/response-workbench-panel.tsx");
      const toolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
      assert.match(panel, /bgcolor: "transparent"/);
      assert.match(panel, /borderRadius: 0/);
      assert.doesNotMatch(panel, /No response yet/);
      assert.doesNotMatch(panel, /responseOwner/);
      assert.match(toolbar, /\{summary \? \(/);
    });
    
    test("Response navigation is reduced to payload, metadata, and timeline", () => {
      const toolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
      const types = read("app/playground/shared/workbench-types.ts");
      assert.match(types, /"timeline"/);
      assert.match(toolbar, /\{ value: "timeline", label: "Timeline" \}/);
      assert.match(toolbar, /\{ value: "latest", label: "Latest JSON" \}/);
      assert.match(toolbar, /\{ value: "headers", label: "Metadata" \}/);
      assert.doesNotMatch(toolbar, /label: "Tests"/);
      assert.doesNotMatch(toolbar, /label: "Trailers"/);
    });
    
    test("request tab primitive stays compact and underline-only for primary request sections", () => {
      const tabs = read("components/ui/workbench.tsx");
      assert.match(tabs, /variant = "underline"/);
      assert.match(tabs, /h-7 min-h-7 gap-3\.5/);
      assert.match(tabs, /border-b border-border bg-card/);
      assert.match(tabs, /border-b-2 border-transparent/);
      assert.match(tabs, /overflow-y-hidden \[scrollbar-width:none\]/);
      assert.match(tabs, /h-\[27px\]/);
      assert.match(tabs, /text-\[11\.5px\]/);
      assert.match(tabs, /border-primary text-foreground/);
    });
    
    test("section navigation shares one canonical accessible tab primitive", () => {
      const tabs = read("components/ui/workbench.tsx");
      const shell = read("app/playground/features/shell/shell-components.tsx");
      const terminal = read("app/playground/features/cli/cli-terminal-panel.tsx");
      const response = read("app/playground/features/response-viewer/response-toolbar.tsx");
      const docs = read("app/playground/features/documentation/documentation-panels.tsx");
      const examples = read("app/playground/features/examples/examples-panel.tsx");
      const services = read("app/playground/features/services/services-workspace.tsx");
      const git = read("app/playground/features/git/git-source-control-v2.tsx");
    
      assert.doesNotMatch(shell, /export function WorkbenchTabs/);
      for (const source of [terminal, response, docs, examples, services, git]) {
        assert.match(source, /components\/ui\/workbench/);
      }
      assert.match(tabs, /role="tablist"/);
      assert.match(tabs, /aria-selected=\{active\}/);
      assert.match(tabs, /"ArrowLeft", "ArrowRight", "Home", "End"/);
      assert.match(services, /variant="pill"/);
      assert.match(git, /variant="underline"/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "saved-request-library-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("saved-request-library-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("saved requests are persisted as project data and normalized with gRPC bindings", () => {
      const types = read("app/playground/shared/workbench-types.ts");
      const workspace = read("app/playground/features/workspace/workspace-model.ts");
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
    
      assert.match(types, /export type SavedRequestSnapshot/);
      assert.match(types, /savedRequests: SavedRequest\[\]/);
      assert.match(types, /savedRequestId\?: string/);
      assert.match(workspace, /normalizeSavedRequests/);
      assert.match(workspace, /remapGrpcBindingToGlobalLibrary/);
      assert.match(workspace, /savedRequests: \[\]/);
      assert.match(model, /const \[savedRequests, setSavedRequests\] = useState<SavedRequest\[\]>\(\[\]\)/);
      assert.match(model, /savedRequests,\n\s+selectedMethodKey/);
      assert.match(model, /setSavedRequests\(project\.savedRequests \?\? \[\]\)/);
    });
    
    test("saved request actions copy the current draft and load without mutating the saved snapshot", () => {
      const actions = read("app/playground/features/saved-requests/use-saved-request-actions.ts");
      assert.match(actions, /buildCurrentSavedRequestSnapshot/);
      assert.match(actions, /saveCurrentRequestAsSaved/);
      assert.match(actions, /loadSavedRequest/);
      assert.match(actions, /cloneMetadata/);
      assert.match(actions, /saved\.kind !== currentKind/);
      assert.match(actions, /patchActiveCollectionRequest/);
      assert.match(actions, /protoRuntimeRegistry\?\.resolveVersion/);
      assert.match(actions, /updateActiveSession\(sessionPatch\)/);
    });
    
    test("request body toolbar exposes compact saved-request dropdown controls for all request protocols", () => {
      const main = read("app/playground/features/shell/workbench-main-panel.tsx");
      const controls = read("app/playground/features/saved-requests/SavedRequestControls.tsx");
    
      assert.match(main, /<SavedRequestControls/);
      assert.match(main, /activeSavedRequestId=\{activeSession\?\.savedRequestId\}/);
      assert.match(main, /Generate from scenario[\s\S]*\{savedRequestControls\}/);
      assert.match(main, /activeIsWebSocket[\s\S]*\{savedRequestControls\}/);
      assert.match(main, /activeIsRest[\s\S]*\{savedRequestControls\}/);
      assert.match(controls, /Saved requests/);
      assert.match(controls, /Load saved request/);
      assert.match(controls, /savedRequestPayloadPreview/);
      assert.match(controls, /maxWidth: 252/);
      assert.doesNotMatch(controls, /Search saved request/);
      assert.match(controls, /Manage saved requests/);
      assert.match(controls, /Save as\.\.\./);
      assert.match(controls, /Rename/);
      assert.match(controls, /Delete current saved request/);
    });
    
    test("Git workspace stores saved requests as individual tracked YAML files", async (t) => {
      const os = require("node:os");
      const fsp = require("node:fs/promises");
      const { writeGitWorkspace, readGitWorkspace } = require("../lib/git-workspace.cjs");
      const root = await fsp.mkdtemp(path.join(os.tmpdir(), "layang-saved-request-"));
      t.after(() => fsp.rm(root, { recursive: true, force: true }));
    
      const savedRequest = {
        id: "saved-1",
        name: "Get Track",
        kind: "grpc",
        snapshot: {
          kind: "grpc",
          requestJson: '{"trackId":1}',
          metadata: [{ key: "x-test", value: "1" }],
          transportMode: "grpc-web",
          baseUrl: "http://127.0.0.1:8080",
          nativeTarget: "localhost:50051",
          environmentKey: "default",
          assertionJson: "",
          grpcMethodKey: "demo.TrackService.GetTrack",
        },
        createdAt: "2026-09-29T00:00:00.000Z",
        updatedAt: "2026-09-29T00:00:00.000Z",
      };
    
      await writeGitWorkspace(root, {
        project: {
          version: 3,
          updatedAt: savedRequest.updatedAt,
          collections: [],
          protoLibraries: [],
          environments: [],
          examples: [],
          savedRequests: [savedRequest],
          methodDocs: [],
          docResults: [],
          requestTabs: [],
          history: [],
          documentation: {},
          mockServer: { gatewayProfiles: [] },
          restMockServer: {},
          wsMockServer: {},
        },
        layout: {},
        settings: {},
      });
    
      const files = await fsp.readdir(path.join(root, "saved-requests"));
      assert.equal(files.length, 1);
      assert.match(files[0], /\.saved-request\.yml$/);
      const yaml = await fsp.readFile(path.join(root, "saved-requests", files[0]), "utf8");
      assert.match(yaml, /kind: saved-request/);
      assert.match(yaml, /name: Get Track/);
    
      const workspace = await readGitWorkspace(root);
      assert.equal(workspace.project.savedRequests.length, 1);
      assert.equal(workspace.project.savedRequests[0].name, "Get Track");
      assert.equal(workspace.project.savedRequests[0].snapshot.requestJson, '{"trackId":1}');
    });
    
  });
}
