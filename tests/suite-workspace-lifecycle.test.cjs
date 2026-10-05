"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "legacy-workspace-migration-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("legacy-workspace-migration-regression.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("desktop startup migrates renderer-local workspace state before first-run setup", () => {
      const controller = read("app/playground/features/workspace/use-workspace-controller.ts");
      const migrationIndex = controller.indexOf("migrateLegacyLocalState(");
      const setupIndex = controller.indexOf("setWorkspaceSetupOpen(true)");
    
      assert.ok(migrationIndex >= 0, "legacy local-state migration must exist");
      assert.ok(setupIndex >= 0, "first-run workspace setup must still exist as fallback");
      assert.ok(migrationIndex < setupIndex, "migration must run before first-run setup");
      assert.match(controller, /sourceFingerprint/);
      assert.match(controller, /LEGACY_LOCAL_MIGRATION_MARKER_VERSION/);
    });
    
    test("legacy local-state migration is exposed through the Electron bridge with explicit statuses", () => {
      const preload = read("electron/preload.cjs");
      const types = read("types/electron.d.ts");
      const main = read("electron/main.cjs");
    
      assert.match(preload, /migrateLegacyLocalState/);
      assert.match(preload, /workspace:migrate-legacy-local-state/);
      assert.match(types, /"migrated" \| "already-current" \| "skipped" \| "failed"/);
      assert.match(main, /status: "migrated"/);
      assert.match(main, /status: "failed"/);
    });
    
    test("readWorkspaceFolder is read-only and migration is orchestrated separately", () => {
      const main = read("electron/main.cjs");
      const readStart = main.indexOf("async function readWorkspaceFolder");
      const openStart = main.indexOf("async function openWorkspaceFolder", readStart);
      const readBody = main.slice(readStart, openStart);
      assert.doesNotMatch(readBody, /migrateLegacyWorkspaceTransaction/);
      assert.match(main.slice(openStart), /migrateLegacyWorkspaceTransaction/);
    });
    
    test("workspace format versions are centralized and the manifest is written last", () => {
      const versions = JSON.parse(read("lib/workspace-versions.json"));
      const gitWorkspace = read("lib/git-workspace.cjs");
      const writeStart = gitWorkspace.indexOf("async function writeGitWorkspace");
      const writeEnd = gitWorkspace.indexOf("async function writeCollections", writeStart);
      const body = gitWorkspace.slice(writeStart, writeEnd);
    
      assert.equal(versions.exportBundleVersion, 5);
      assert.equal(versions.gitWorkspaceVersion, 6);
      assert.match(gitWorkspace, /GIT_WORKSPACE_VERSION/);
      assert.ok(
        body.lastIndexOf("writeYamlAtomic(path.join(root, ROOT_FILE)") > body.indexOf("writeDocumentationSources("),
      );
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "multi-window-phase-8-9-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("multi-window-phase-8-9-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
    
    test("phase 8 window manager owns unique main, mocking, request, response and performance windows", () => {
      const source = read("electron/window/window-manager.cjs");
      assert.match(source, /VALID_KINDS = new Set\(\["main", "mocking", "request", "response", "performance"\]\)/);
      assert.match(source, /return `\$\{context\.kind\}:\$\{resource\}`/);
      assert.match(source, /focusWindow\(existing\)/);
    });
    
    test("managed windows persist bounds, survive app restart, and normalize missing displays", () => {
      const source = read("electron/window/window-manager.cjs");
      assert.match(source, /STATE_FILE = "window-layout\.json"/);
      assert.match(source, /function restoreDetachedWindows\(\)/);
      assert.match(source, /saved\.open !== true/);
      assert.match(source, /screen\.getAllDisplays\(\)/);
      assert.match(source, /screen\.getPrimaryDisplay\(\)\?\.workArea/);
      assert.match(source, /intersectionArea\(candidate, display\.workArea\)/);
      assert.match(source, /clampNumber\(candidate\.x/);
    });
    
    test("phase 8 preload exposes managed-window IPC without exposing Electron directly", () => {
      const source = read("electron/preload.cjs");
      for (const capability of ["getContext", "listManaged", "openDetached", "reattach", "focusResource", "broadcast"]) {
        assert.match(source, new RegExp(`${capability}:`));
      }
      assert.match(source, /layang:window-reattach/);
      assert.match(source, /layang:window-registry-changed/);
      assert.match(source, /layang:window-event/);
    });
    
    test("detached renderer routes by explicit window context", () => {
      const source = read("app/playground/workbench-container.tsx");
      assert.match(source, /windowKind === "mocking"/);
      assert.match(source, /<DetachedMockingWindow/);
      assert.match(source, /windowKind === "response"/);
      assert.match(source, /<DetachedResponseWindow/);
      assert.match(source, /<DetachedRequestWindow/);
    });
    
    test("Mocking can detach and main window becomes a singleton focus surface", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      const mainPanel = read("app/playground/features/shell/workbench-main-panel.tsx");
      assert.match(services, /openDetached\("mocking"/);
      assert.match(mainPanel, /Mocking open in another window/);
      assert.match(mainPanel, /Focus Mocking window/);
      assert.match(mainPanel, /reattachResource\("mocking"\)/);
    });
    
    test("request tabs can move to a dedicated window and return to main", () => {
      const tabs = read("app/playground/features/shell/shell-components.tsx");
      const panel = read("app/playground/features/shell/workbench-main-panel.tsx");
      const detached = read("app/playground/features/windows/detached-window-surfaces.tsx");
      assert.match(tabs, /Move to new window/);
      assert.match(panel, /openDetached\?\.\("request"/);
      assert.match(detached, /returnLabel="Back to Main"/);
    });
    
    test("response can detach as a live monitor and return to its request", () => {
      const toolbar = read("app/playground/features/response-viewer/response-toolbar.tsx");
      const panel = read("app/playground/features/shell/workbench-main-panel.tsx");
      const detached = read("app/playground/features/windows/detached-window-surfaces.tsx");
      assert.match(toolbar, /Open response in a separate window/);
      assert.match(panel, /openDetached\?\.\("response"/);
      assert.match(panel, /Response open in another window/);
      assert.match(panel, /reattachResource\?\.\("response", activeRequestId\)/);
      assert.match(detached, /returnLabel="Back to Request"/);
    });
    
    test("detached response mirrors live session events and document payloads", () => {
      const source = read("app/playground/features/windows/use-response-window-sync.ts");
      assert.match(source, /RESPONSE_SNAPSHOT_TOPIC = "response:snapshot"/);
      assert.match(source, /runtime\.store\.subscribe/);
      assert.match(source, /runtime\.subscribe/);
      assert.match(source, /payloadDocumentService\.getText/);
      assert.match(source, /payloadDocumentService\.registerUtf8/);
      assert.match(source, /MAX_MIRRORED_DOCUMENT_CHARS/);
    });
    
    test("workspace saves are broadcast so managed windows reload shared project state", () => {
      const main = read("electron/main.cjs");
      const controller = read("app/playground/features/workspace/use-workspace-controller.ts");
      assert.match(main, /broadcastWorkspaceSaved\(targetPath, win\)/);
      assert.match(controller, /event\?\.topic !== "workspace:saved"/);
      assert.match(controller, /openFolder\?\.\(directoryPath\)/);
    });
    
    
    test("detached editable windows hand off the latest workspace before reattach or close", () => {
      const detached = read("app/playground/features/windows/detached-window-surfaces.tsx");
      const controller = read("app/playground/features/workspace/use-workspace-controller.ts");
      assert.match(detached, /broadcast\?\.\("workspace:handoff"/);
      assert.match(detached, /mockScenarioEditorDirty && !ctx\.saveMockScenarioEditorDraft\(\)/);
      assert.match(controller, /event\?\.topic === "workspace:handoff"/);
    });
    
    test("detached response stays read-only and does not autosave a stale project bundle", () => {
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
      assert.match(model, /enabled: hydrated && managedWindow\.context\.kind !== "response" && managedWindow\.context\.kind !== "performance"/);
    });
    
    test("detached shortcuts close the view instead of deleting the underlying request", () => {
      const source = read("app/playground/features/commands/use-workbench-command-shortcuts.ts");
      assert.match(source, /scope\.windowKind && scope\.windowKind !== "main"/);
      assert.match(source, /layang:close-detached-window/);
    });
    
    test("remote Back actions use a stable detached listener and response reattach is direct", () => {
      const titlebar = read("app/playground/features/windows/detached-window-titlebar.tsx");
      const manager = read("electron/window/window-manager.cjs");
      const hook = read("app/playground/features/windows/use-managed-window-context.ts");
      assert.match(titlebar, /const onReturnRef = useRef\(onReturn\)/);
      assert.match(titlebar, /const onCloseRef = useRef\(onClose\)/);
      assert.match(titlebar, /onRequestReattach\?\.\(handleRequestedReattach\)/);
      assert.match(titlebar, /\}, \[\]\);/);
      assert.match(manager, /if \(context\.kind === "response"\) \{\s*return reattachWindow\(target\);/);
      assert.match(hook, /window\.addEventListener\("focus", handleWindowFocus\)/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "window-hydration-detach-performance-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("window-hydration-detach-performance-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const test = require("node:test");
    
    const root = path.resolve(__dirname, "..");
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
    
    test("workbench defers browser-only window/layout rendering until after hydration", () => {
      const client = read("app/playground/workbench-client.tsx");
      const layout = read("app/playground/features/layout/use-workbench-layout.ts");
      assert.match(client, /const \[mounted, setMounted\] = useState\(false\)/);
      assert.match(client, /useEffect\(\(\) => \{\s*setMounted\(true\)/);
      assert.match(client, /if \(!mounted\)/);
      assert.doesNotMatch(layout, /viewportSize\.width \|\| \(typeof window/);
      assert.doesNotMatch(layout, /viewportSize\.height \|\| \(typeof window/);
    });
    
    test("request response view writes are idempotent and detached response opening cannot create an effect loop", () => {
      const layout = read("app/playground/features/layout/use-workbench-layout.ts");
      const model = read("app/playground/features/shell/use-workbench-container-model.tsx");
      assert.match(layout, /if \(unchanged\) return current/);
      assert.match(model, /context\.kind === "response" && responseCollapsed/);
    });
    
    test("native window move persistence reads bounds only after dragging settles", () => {
      const manager = read("electron/window/window-manager.cjs");
      const scheduleStart = manager.indexOf("function schedulePersistWindow");
      const scheduleEnd = manager.indexOf("function writeState", scheduleStart);
      const block = manager.slice(scheduleStart, scheduleEnd);
      assert.match(manager, /const persistTimers = new Map\(\)/);
      assert.match(block, /setTimeout/);
      assert.match(block, /persistWindowState\(windowId, \{ open: true \}\)/);
      assert.doesNotMatch(block.split("setTimeout")[0], /persistWindowState/);
      assert.match(manager, /else if \(!win\.isVisible\(\)\) win\.show\(\)/);
    });
    
    test("detached response collapses to a compact status bar in the request workspace", () => {
      const main = read("app/playground/features/shell/workbench-main-panel.tsx");
      assert.match(main, /"0 0 42px"/);
      assert.match(main, /"0 0 36px"/);
      assert.match(main, /Response open in another window/);
      assert.match(main, /aria-label="Focus detached response window"/);
      assert.match(main, /Return detached response to request/);
      assert.match(main, /reattachResource/);
    });
    
    test("mock runtime strip stays compact instead of repeating endpoint text", () => {
      const services = read("app/playground/features/services/services-workspace.tsx");
      assert.match(services, /label: "gRPC Mock"/);
      assert.match(services, /label: "Web Access"/);
      assert.match(services, /label: "REST Mock"/);
      assert.match(services, /label: "WebSocket Mock"/);
      assert.doesNotMatch(services, /fontFamily: "monospace", fontSize: 10/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "workspace-migration-transaction.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("workspace-migration-transaction.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs/promises");
    const fsSync = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");
    const {
      LEGACY_WORKSPACE_PATHS,
      hasRecognizedLegacyWorkspaceFiles,
      migrateLegacyWorkspaceTransaction,
    } = require("../electron/services/workspace-migration.cjs");
    const { readGitWorkspace, writeGitWorkspace } = require("../lib/git-workspace.cjs");
    
    async function tempDir() {
      return fs.mkdtemp(path.join(os.tmpdir(), "layang-migration-test-"));
    }
    
    function minimalBundle() {
      return {
        type: "layang-workspace",
        version: 5,
        exportedAt: "2026-08-27T00:00:00.000Z",
        app: "Layang",
        project: {
          version: 3,
          updatedAt: "2026-08-27T00:00:00.000Z",
          collections: [],
          protoLibraries: [],
          environments: [],
          examples: [],
          methodDocs: [],
          docResults: [],
          requestTabs: [],
          history: [],
          mockServer: { gatewayProfiles: [] },
          restMockServer: {},
          wsMockServer: {},
        },
        layout: {},
        settings: {},
      };
    }
    
    test("legacy detection does not mistake a generic settings.json folder for Layang", async (t) => {
      const root = await tempDir();
      t.after(() => fs.rm(root, { recursive: true, force: true }));
      await fs.writeFile(path.join(root, "settings.json"), '{"editor":"vim"}\n');
      assert.equal(await hasRecognizedLegacyWorkspaceFiles(root), false);
    });
    
    test("legacy detection accepts a Layang workspace envelope", async (t) => {
      const root = await tempDir();
      t.after(() => fs.rm(root, { recursive: true, force: true }));
      await fs.writeFile(path.join(root, "layang.workspace.json"), JSON.stringify(minimalBundle()));
      assert.equal(await hasRecognizedLegacyWorkspaceFiles(root), true);
    });
    
    test("transactional legacy migration backs up every removed nested legacy path", async (t) => {
      const root = await tempDir();
      t.after(() => fs.rm(root, { recursive: true, force: true }));
    
      await fs.mkdir(path.join(root, "requests", "items"), { recursive: true });
      await fs.mkdir(path.join(root, "mocks", "scenarios"), { recursive: true });
      await fs.writeFile(path.join(root, "layang.workspace.json"), JSON.stringify(minimalBundle()));
      await fs.writeFile(path.join(root, "requests", "items", "legacy-request.json"), '{"id":"old"}\n');
      await fs.writeFile(path.join(root, "mocks", "scenarios", "legacy-scenario.json"), '{"id":"old"}\n');
    
      const result = await migrateLegacyWorkspaceTransaction(root, minimalBundle());
      assert.ok(result.workspace);
      assert.ok(result.backupPath);
      assert.equal(fsSync.existsSync(path.join(root, "layang.yml")), true);
      assert.equal(fsSync.existsSync(path.join(root, "layang.workspace.json")), false);
      assert.equal(fsSync.existsSync(path.join(root, "requests", "items")), false);
      assert.equal(fsSync.existsSync(path.join(root, "mocks", "scenarios")), false);
      assert.equal(fsSync.existsSync(path.join(result.backupPath, "layang.workspace.json")), true);
      assert.equal(fsSync.existsSync(path.join(result.backupPath, "requests", "items", "legacy-request.json")), true);
      assert.equal(fsSync.existsSync(path.join(result.backupPath, "mocks", "scenarios", "legacy-scenario.json")), true);
      assert.ok(LEGACY_WORKSPACE_PATHS.includes(path.join("requests", "items")));
      assert.ok(LEGACY_WORKSPACE_PATHS.includes(path.join("mocks", "scenarios")));
    });
    
    test("future workspace versions are rejected for reads and writes", async (t) => {
      const root = await tempDir();
      t.after(() => fs.rm(root, { recursive: true, force: true }));
      await fs.writeFile(path.join(root, "layang.yml"), "version: 999\nkind: workspace\n");
    
      await assert.rejects(() => readGitWorkspace(root), /requires a newer version of Layang/);
      await assert.rejects(() => writeGitWorkspace(root, minimalBundle()), /requires a newer version of Layang/);
    });
    
    test("failed staged commit rolls back generated files and leaves legacy source intact", async (t) => {
      const root = await tempDir();
      t.after(() => fs.rm(root, { recursive: true, force: true }));
    
      await fs.writeFile(path.join(root, "layang.workspace.json"), JSON.stringify(minimalBundle()));
      // This path is a generated file in v6. Making it a directory forces a late commit failure
      // after earlier staged files have already been copied, exercising rollback.
      await fs.mkdir(path.join(root, "workspace-schemas", "request-v2.schema.json"), { recursive: true });
    
      await assert.rejects(() => migrateLegacyWorkspaceTransaction(root, minimalBundle()));
      assert.equal(fsSync.existsSync(path.join(root, "layang.yml")), false, "commit marker must not survive failure");
      assert.equal(fsSync.existsSync(path.join(root, "layang.workspace.json")), true, "legacy source must remain");
      assert.equal(fsSync.existsSync(path.join(root, ".gitignore")), false, "created generated files must be rolled back");
      assert.equal(fsSync.statSync(path.join(root, "workspace-schemas", "request-v2.schema.json")).isDirectory(), true);
    });
    
    test("legacy protoFiles are promoted into managed proto revisions", async (t) => {
      const root = await tempDir();
      t.after(() => fs.rm(root, { recursive: true, force: true }));
      const bundle = minimalBundle();
      delete bundle.project.protoLibraries;
      bundle.project.protoFiles = [
        {
          name: "demo/greeter.proto",
          text: 'syntax = "proto3";\npackage demo;\nmessage HelloRequest { string name = 1; }\n',
        },
      ];
    
      await writeGitWorkspace(root, bundle);
      const workspace = await readGitWorkspace(root);
      assert.equal(workspace.project.protoLibraries.length, 1);
      const version = workspace.project.protoLibraries[0].versions[0];
      assert.equal(version.files.length, 1);
      assert.equal(version.files[0].name, "demo/greeter.proto");
      assert.match(version.files[0].text, /message HelloRequest/);
    });
    
    test("migration backs up legacy proto and combined mock files while preserving converted data", async (t) => {
      const root = await tempDir();
      t.after(() => fs.rm(root, { recursive: true, force: true }));
    
      const bundle = minimalBundle();
      delete bundle.project.protoLibraries;
      bundle.project.protoFiles = [
        {
          name: "greeter.proto",
          text: 'syntax = "proto3";\npackage demo;\nservice Greeter { rpc SayHello (HelloRequest) returns (HelloReply); }\nmessage HelloRequest { string name = 1; }\nmessage HelloReply { string message = 1; }\n',
        },
      ];
      bundle.project.mockServer = {
        port: 50055,
        format: "yaml",
        selectedScenarioIds: { "demo.Greeter/SayHello": "hello" },
        enabledMethods: { "demo.Greeter/SayHello": true },
        scenarioText: [
          "version: 1",
          "scenarios:",
          "  - id: hello",
          "    service: demo.Greeter",
          "    method: SayHello",
          "    input:",
          "      equals:",
          "        name: Ada",
          "    response:",
          "      data:",
          "        message: hello",
          "",
        ].join("\n"),
      };
    
      await fs.mkdir(path.join(root, "protos"), { recursive: true });
      await fs.mkdir(path.join(root, "mocks"), { recursive: true });
      await fs.writeFile(path.join(root, "protos", "greeter.proto"), bundle.project.protoFiles[0].text);
      await fs.writeFile(path.join(root, "mocks", "scenarios.yml"), bundle.project.mockServer.scenarioText);
      await fs.writeFile(path.join(root, "layang.workspace.json"), JSON.stringify(bundle));
    
      const result = await migrateLegacyWorkspaceTransaction(root, bundle);
      assert.ok(result.backupPath);
      assert.equal(fsSync.existsSync(path.join(result.backupPath, "protos", "greeter.proto")), true);
      assert.equal(fsSync.existsSync(path.join(result.backupPath, "mocks", "scenarios.yml")), true);
      assert.equal(fsSync.existsSync(path.join(root, "mocks", "scenarios.yml")), false);
    
      const workspace = await readGitWorkspace(root);
      const version = workspace.project.protoLibraries[0].versions[0];
      assert.equal(version.files[0].name, "greeter.proto");
      assert.equal(workspace.project.mockServer.enabledMethods["demo.Greeter/SayHello"], true);
      assert.equal(workspace.project.mockServer.selectedScenarioIds["demo.Greeter/SayHello"], "hello");
      assert.equal(workspace.project.mockServer.methodFiles["demo.Greeter/SayHello"] !== undefined, true);
    });
    
    test("invalid legacy gRPC mock source aborts migration before layang.yml is committed", async (t) => {
      const root = await tempDir();
      t.after(() => fs.rm(root, { recursive: true, force: true }));
      const bundle = minimalBundle();
      bundle.project.mockServer = { port: 50055, format: "json", scenarioText: "{ definitely-not-valid-json" };
      await fs.writeFile(path.join(root, "layang.workspace.json"), JSON.stringify(bundle));
    
      await assert.rejects(
        () => migrateLegacyWorkspaceTransaction(root, bundle),
        /Invalid legacy gRPC mock scenario source/,
      );
      assert.equal(fsSync.existsSync(path.join(root, "layang.yml")), false);
      assert.equal(fsSync.existsSync(path.join(root, "layang.workspace.json")), true);
    });
    
  });
}
